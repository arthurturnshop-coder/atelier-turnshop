import { createHmac, timingSafeEqual } from "node:crypto";
import { cors } from "hono/cors";
import { app } from "../app";
import { MAGASINS } from "../config";
import { sql } from "../db";
import { AppError, clean } from "../util";
import { shopifyMutate, shopifyRead } from "../shopify";
import { devisDe } from "./reparations";
import { acomptesDe } from "./acomptes";
import { infosGarde } from "../garde";

// API publique pour l'espace client de turnshop.fr. Pas de mot de passe atelier :
// chaque appel est signé par le thème Shopify (HMAC-SHA256 avec ESPACE_SECRET), valable 2 h.
const SECRET = () => Bun.env.ESPACE_SECRET ?? "";
app.use("/pub/*", cors({ origin: ["https://turnshop.fr", "https://www.turnshop.fr"], allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["content-type"], maxAge: 600 }));

await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS rdv_souhaite TEXT NOT NULL DEFAULT ''`;
await sql`CREATE TABLE IF NOT EXISTS paiements_web (id SERIAL PRIMARY KEY, reparation_id INT NOT NULL REFERENCES reparations(id), client_id INT NOT NULL REFERENCES clients(id), montant_cents INT NOT NULL, draft_id TEXT NOT NULL, order_id TEXT, url TEXT NOT NULL DEFAULT '', statut TEXT NOT NULL DEFAULT 'attente', vente_id INT, rembourse_le TIMESTAMPTZ, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;

// Limite simple : 30 appels par minute et par IP.
const hits = new Map<string, number[]>();
function limite(c: any) {
  const ip = (c.req.header("x-forwarded-for") ?? "?").split(",")[0].trim();
  const now = Date.now();
  const l = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  l.push(now);
  hits.set(ip, l);
  if (l.length > 30) throw new AppError(429, "Trop de demandes, réessaie dans une minute.");
}

export function signer(cid: string, ts: string, email: string) {
  return createHmac("sha256", SECRET()).update(`${cid}|${ts}|${email}`).digest("hex");
}

type Qui = { cid: string; email: string; prenom: string; nom: string; tel: string };
function verifie(b: any): Qui {
  if (!SECRET()) throw new AppError(503, "Espace client non configuré.");
  const cid = clean(b.cid, 30), ts = clean(b.ts, 12), email = clean(b.email, 120), sig = clean(b.sig, 80);
  if (!/^\d+$/.test(cid) || !/^\d+$/.test(ts)) throw new AppError(401, "Connexion requise.");
  const age = Date.now() / 1000 - Number(ts);
  if (age > 7200 || age < -300) throw new AppError(401, "Session expirée : recharge la page.");
  const attendu = Buffer.from(signer(cid, ts, email));
  const recu = Buffer.from(sig);
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) throw new AppError(401, "Connexion requise.");
  return { cid, email, prenom: clean(b.prenom, 80), nom: clean(b.nom, 80), tel: clean(b.tel, 40) };
}

async function clientDe(q: Qui): Promise<number> {
  const gid = `gid://shopify/Customer/${q.cid}`;
  let [c] = (await sql`SELECT id FROM clients WHERE shopify_id = ${gid}`) as any[];
  if (!c && q.email) {
    [c] = (await sql`SELECT id FROM clients WHERE email ILIKE ${q.email} ORDER BY id LIMIT 1`) as any[];
    if (c) await sql`UPDATE clients SET shopify_id = ${gid} WHERE id = ${c.id} AND shopify_id IS NULL`;
  }
  if (!c) [c] = (await sql`INSERT INTO clients (prenom, nom, telephone, email, shopify_id) VALUES (${q.prenom}, ${q.nom || q.email || "Client"}, ${q.tel}, ${q.email}, ${gid}) RETURNING id`) as any[];
  return c.id;
}

const pcn = (id: number) => "PC-" + String(id).padStart(4, "0");

// Ce que voit le client : "en cours" ou "terminé", plus une phrase claire.
export function etatClient(r: any) {
  if (r.statut === "récupéré") return { groupe: "termine", libelle: "Terminée et récupérée" };
  if (r.statut === "prêt") return { groupe: "termine", libelle: "Terminée : ta trottinette est prête à récupérer" };
  if (r.en_magasin === false && !r.debut) return { groupe: "cours", libelle: "Demande reçue : nous confirmons ton rendez-vous" };
  if (r.en_magasin === false) return { groupe: "cours", libelle: "Rendez-vous confirmé" };
  const m: Record<string, string> = { "reçu": "Prise en charge à l'atelier", diagnostic: "Diagnostic en cours", "devis envoyé": "Devis à valider", "en attente de pièce": "En attente d'une pièce", "en réparation": "En cours de réparation" };
  return { groupe: "cours", libelle: m[r.statut] ?? r.statut };
}

// ---- Prix du catalogue (cache 5 min) ----
const cachePrix = new Map<string, { t: number; v: any }>();
async function prixVariantes(ids: string[]): Promise<Record<string, { prix: number; titre: string; stock: number | null }>> {
  const out: Record<string, any> = {};
  const aLire = ids.filter((i) => {
    const c = cachePrix.get(i);
    if (c && Date.now() - c.t < 300_000) { out[i] = c.v; return false; }
    return !!i;
  });
  if (aLire.length) {
    try {
      const d = await shopifyRead(`query($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { id title price inventoryQuantity product { title } } } }`, { ids: aLire.slice(0, 50) });
      for (const n of d.nodes ?? []) {
        if (!n) continue;
        const v = { prix: Math.round(Number(n.price) * 100), titre: n.title && n.title !== "Default Title" ? `${n.product.title} - ${n.title}` : n.product.title, stock: n.inventoryQuantity ?? null };
        out[n.id] = v;
        cachePrix.set(n.id, { t: Date.now(), v });
      }
    } catch { /* prix indisponibles : la pièce reste proposée sans prix */ }
  }
  return out;
}

// Pièce importée par CSV (SKU seulement) : on retrouve sa variante dans le catalogue.
async function variantesParSku(pieces: any[]) {
  for (const p of pieces) {
    if (p.variant_id || !p.sku) continue;
    try {
      const d = await shopifyRead(`query($q: String!) { productVariants(first: 1, query: $q) { nodes { id } } }`, { q: "sku:" + JSON.stringify(p.sku) });
      const id = d.productVariants?.nodes?.[0]?.id;
      if (id) { p.variant_id = id; await sql`UPDATE modele_pieces SET variant_id = ${id} WHERE id = ${p.id}`; }
    } catch { /* sans prix pour l'instant */ }
  }
}

// ---- Modèles et pièces compatibles (public, sans donnée personnelle) ----
app.get("/pub/modeles", async (c) => {
  limite(c);
  const q = clean(c.req.query("q"), 60).toLowerCase();
  const ms = (await sql`SELECT id, marque, modele FROM modeles WHERE actif = true ORDER BY marque, modele`) as any[];
  const f = ms.filter((m) => !q || `${m.marque} ${m.modele}`.toLowerCase().includes(q)).slice(0, 30);
  return c.json({ modeles: f.map((m) => ({ id: m.id, nom: `${m.marque} ${m.modele}` })) });
});

app.get("/pub/modeles/:id", async (c) => {
  limite(c);
  const id = Number(c.req.param("id"));
  const [m] = (await sql`SELECT id, marque, modele FROM modeles WHERE id = ${id} AND actif = true`) as any[];
  if (!m) throw new AppError(404, "Modèle introuvable.");
  const ps = (await sql`SELECT id, libelle, sku, variant_id, categorie FROM modele_pieces WHERE modele_id = ${id} ORDER BY id`) as any[];
  await variantesParSku(ps);
  const prix = await prixVariantes(ps.map((p) => p.variant_id).filter(Boolean));
  const prestas = (await sql`SELECT id, nom, prix_cents, avec_piece, piece_aide FROM prestations WHERE actif = true ORDER BY nom`) as any[];
  return c.json({
    modele: { id: m.id, nom: `${m.marque} ${m.modele}` },
    pieces: ps.map((p) => ({ id: p.id, libelle: p.libelle, categorie: p.categorie, prixCents: prix[p.variant_id]?.prix ?? null, enStock: prix[p.variant_id]?.stock == null ? null : prix[p.variant_id].stock > 0 })),
    prestations: prestas.map((p) => ({ id: p.id, nom: p.nom, prixCents: p.prix_cents, avecPiece: p.avec_piece === true, aide: p.piece_aide })),
  });
});

// ---- Mon espace : mes réparations ----
async function paiementsEnAttente(repId: number) {
  const att = (await sql`SELECT id, draft_id FROM paiements_web WHERE reparation_id = ${repId} AND statut = 'attente'`) as any[];
  for (const p of att) {
    try {
      const d = await shopifyRead(`query($id: ID!) { draftOrder(id: $id) { status order { id } } }`, { id: p.draft_id });
      const dr = d.draftOrder;
      if (dr?.status === "COMPLETED" && dr.order?.id) await enregistrePaiementWeb(p.id, dr.order.id);
    } catch { /* on réessaiera au prochain passage */ }
  }
}

// Un paiement en ligne devient un acompte dans la caisse (le solde se déduit à la facturation).
export async function enregistrePaiementWeb(pid: number, orderId: string) {
  const [p] = (await sql`SELECT * FROM paiements_web WHERE id = ${pid} AND statut = 'attente'`) as any[];
  if (!p) return;
  const [v] = (await sql`INSERT INTO ventes (client_id, reparation_id, magasin, vendeur, total_cents, points_gagnes, type) VALUES (${p.client_id}, ${p.reparation_id}, NULL, 'En ligne', ${p.montant_cents}, 0, 'acompte') RETURNING id`) as any[];
  await sql`INSERT INTO vente_lignes (vente_id, libelle, quantite, prix_unitaire_cents, type) VALUES (${v.id}, ${"Paiement en ligne " + pcn(p.reparation_id)}, 1, ${p.montant_cents}, 'article')`;
  await sql`INSERT INTO vente_paiements (vente_id, moyen, montant_cents) VALUES (${v.id}, 'en_ligne', ${p.montant_cents})`;
  await sql`UPDATE paiements_web SET statut = 'paye', order_id = ${orderId}, vente_id = ${v.id} WHERE id = ${pid}`;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${p.reparation_id}, 'caisse', ${`Paiement en ligne reçu : ${(p.montant_cents / 100).toFixed(2)} € (Shopify)`})`;
  await sql`INSERT INTO taches (texte, echeance, priorite, cree_par, reparation_id) VALUES (${`Paiement en ligne reçu ${pcn(p.reparation_id)} : ${(p.montant_cents / 100).toFixed(2)} €`}, (now() AT TIME ZONE 'Europe/Paris')::date, false, 'Espace client', ${p.reparation_id})`;
}

export async function verifierPaiementsWeb() {
  const reps = (await sql`SELECT DISTINCT reparation_id FROM paiements_web WHERE statut = 'attente' AND cree_le > now() - interval '3 days'`) as any[];
  for (const r of reps) await paiementsEnAttente(r.reparation_id);
}

app.post("/pub/moi", async (c) => {
  limite(c);
  const b = await c.req.json().catch(() => ({}));
  const q = verifie(b);
  const cid = await clientDe(q);
  const rows = (await sql`SELECT r.*, t.marque, t.modele FROM reparations r JOIN trottinettes t ON t.id = r.trottinette_id WHERE r.client_id = ${cid} AND r.supprime_le IS NULL ORDER BY r.id DESC LIMIT 30`) as any[];
  const reparations = [];
  for (const r of rows) {
    if (r.statut !== "récupéré") await paiementsEnAttente(r.id);
    const e = etatClient(r);
    const dv = await devisDe(r.id);
    const ac = await acomptesDe(r.id);
    const g = infosGarde(r.pret_le, r.statut, r.abandonnee_le);
    reparations.push({
      id: r.id, numero: pcn(r.id), trottinette: `${r.marque} ${r.modele}`, panne: r.panne, groupe: e.groupe, etat: e.libelle,
      depot: r.date_depot, rdv: r.debut, rdvSouhaite: r.rdv_souhaite, magasin: r.magasin,
      devis: dv.lignes.map((l) => ({ libelle: l.libelle, quantite: l.quantite, prixCents: l.prixCents })), remiseCents: dv.remiseMultiCents, totalCents: dv.netCents,
      verseCents: ac.verseCents, resteAPayerCents: Math.max(0, dv.netCents - ac.verseCents),
      gardiennage: g && g.fraisCents > 0 ? { jours: g.joursFrais, fraisCents: g.fraisCents } : null, abandonnee: !!r.abandonnee_le,
      peutPayer: r.statut !== "récupéré" && dv.netCents - ac.verseCents > 0,
    });
  }
  return c.json({ prenom: q.prenom, reparations });
});

// ---- Demande de rendez-vous ----
app.post("/pub/rdv", async (c) => {
  limite(c);
  const b = await c.req.json().catch(() => ({}));
  const q = verifie(b);
  const cid = await clientDe(q);
  const magasin = clean(b.magasin, 20);
  if (!MAGASINS.includes(magasin)) throw new AppError(400, "Choisis un atelier.");
  const date = clean(b.date, 10);
  const d = new Date(date + "T12:00:00Z");
  const auj = new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(d.getTime()) || d.getTime() < auj.getTime() || d.getTime() > auj.getTime() + 90 * 86400000) throw new AppError(400, "Date invalide.");
  if (d.getUTCDay() < 2) throw new AppError(400, "Les ateliers sont ouverts du mardi au samedi.");
  const creneau = clean(b.creneau, 10) === "apres-midi" ? "après-midi" : "matin";
  const panne = clean(b.panne, 800);
  const marque = clean(b.marque, 60), modele = clean(b.modele, 80), serie = clean(b.serie, 60);
  let m: any = null;
  if (b.modeleId) [m] = (await sql`SELECT id, marque, modele FROM modeles WHERE id = ${Number(b.modeleId)}`) as any[];
  const tMarque = m?.marque ?? marque, tModele = m?.modele ?? modele;
  if (!tMarque || !tModele) throw new AppError(400, "Indique le modèle de ta trottinette.");

  // Trottinette du client : même modèle déjà connu, sinon création (série facultative).
  let [t] = (await sql`SELECT id FROM trottinettes WHERE client_id = ${cid} AND marque ILIKE ${tMarque} AND modele ILIKE ${tModele} ORDER BY id DESC LIMIT 1`) as any[];
  if (!t) [t] = (await sql`INSERT INTO trottinettes (client_id, marque, modele, serie) VALUES (${cid}, ${tMarque}, ${tModele}, ${serie || "A préciser " + Date.now().toString(36)}) RETURNING id`) as any[];

  const pieceIds: number[] = (Array.isArray(b.pieceIds) ? b.pieceIds : []).map(Number).filter(Boolean).slice(0, 10);
  const prestaIds: number[] = (Array.isArray(b.prestationIds) ? b.prestationIds : []).map(Number).filter(Boolean).slice(0, 10);
  if (!panne && !pieceIds.length && !prestaIds.length) throw new AppError(400, "Décris ta panne ou choisis une prestation.");

  const sujet = panne || "Demande en ligne (voir le devis)";
  const quand = `${date} ${creneau}`;
  const [r] = (await sql`INSERT INTO reparations (client_id, trottinette_id, panne, en_magasin, magasin, source, rdv_souhaite, statut) VALUES (${cid}, ${t.id}, ${sujet}, false, ${magasin}, 'web', ${quand}, 'reçu') RETURNING id`) as any[];

  // Devis pré-rempli : prestations (main-d'œuvre) puis pièces compatibles avec leur prix du catalogue.
  for (const pid of prestaIds) {
    const [p] = (await sql`SELECT nom, prix_cents FROM prestations WHERE id = ${pid} AND actif = true`) as any[];
    if (p) await sql`INSERT INTO devis_lignes (reparation_id, type, libelle, quantite, prix_unitaire_cents) VALUES (${r.id}, 'main_oeuvre', ${p.nom}, 1, ${p.prix_cents})`;
  }
  if (pieceIds.length && m) {
    const ps = (await sql`SELECT id, libelle, sku, variant_id FROM modele_pieces WHERE modele_id = ${m.id} AND id = ANY(${pieceIds})`) as any[];
    await variantesParSku(ps);
    const prix = await prixVariantes(ps.map((p) => p.variant_id).filter(Boolean));
    for (const p of ps) await sql`INSERT INTO devis_lignes (reparation_id, type, libelle, quantite, prix_unitaire_cents, shopify_variant_id, sku) VALUES (${r.id}, 'piece', ${p.libelle}, 1, ${prix[p.variant_id]?.prix ?? 0}, ${p.variant_id || null}, ${p.sku || null})`;
  }
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${r.id}, 'statut', ${`Demande de rendez-vous en ligne : ${magasin}, ${quand}`})`;
  await sql`INSERT INTO taches (texte, echeance, priorite, cree_par, reparation_id) VALUES (${`Demande RDV en ligne ${pcn(r.id)} : ${q.prenom} ${q.nom} - ${tMarque} ${tModele} - ${magasin}, ${quand}`}, (now() AT TIME ZONE 'Europe/Paris')::date, true, 'Espace client', ${r.id})`;
  return c.json({ message: "Demande envoyée : nous confirmons ton créneau très vite.", repairId: r.id, numero: pcn(r.id) });
});

// ---- Paiement en ligne (commande brouillon Shopify + lien de paiement) ----
app.post("/pub/payer", async (c) => {
  limite(c);
  const b = await c.req.json().catch(() => ({}));
  const q = verifie(b);
  const cid = await clientDe(q);
  const repId = Number(b.repairId);
  const [r] = (await sql`SELECT id FROM reparations WHERE id = ${repId} AND client_id = ${cid} AND supprime_le IS NULL`) as any[];
  if (!r) throw new AppError(404, "Réparation introuvable.");
  const dv = await devisDe(repId), ac = await acomptesDe(repId);
  const reste = dv.netCents - ac.verseCents;
  if (dv.netCents <= 0 || reste <= 0) throw new AppError(400, "Rien à payer pour le moment.");
  const [lim] = (await sql`SELECT valeur FROM reglages WHERE cle = 'acompte_web_cents'`) as any[];
  const acompte = Math.min(reste, Math.max(100, Number(lim?.valeur ?? 2000) || 2000));
  const montant = b.mode === "acompte" ? acompte : reste;
  // On réutilise un lien déjà créé pour le même montant.
  const [dej] = (await sql`SELECT url FROM paiements_web WHERE reparation_id = ${repId} AND statut = 'attente' AND montant_cents = ${montant} AND url <> '' AND cree_le > now() - interval '2 days' ORDER BY id DESC LIMIT 1`) as any[];
  if (dej) return c.json({ url: dej.url, montantCents: montant });
  let d: any;
  try { d = await shopifyMutate(`mutation($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id invoiceUrl } userErrors { field message } } }`, {
    input: {
      purchasingEntity: { customerId: `gid://shopify/Customer/${q.cid}` },
      email: q.email || undefined,
      tags: ["atelier", "paiement-en-ligne", pcn(repId)],
      note: `${b.mode === "acompte" ? "Acompte" : "Paiement"} réparation ${pcn(repId)} (espace client)`,
      lineItems: [{ title: `${b.mode === "acompte" ? "Acompte" : "Paiement"} réparation ${pcn(repId)}`, quantity: 1, originalUnitPrice: (montant / 100).toFixed(2), requiresShipping: false, taxable: true }],
    },
  }); } catch { throw new AppError(502, "Paiement indisponible pour le moment, réessaie dans quelques minutes."); }
  const er = d.draftOrderCreate?.userErrors?.[0];
  if (er || !d.draftOrderCreate?.draftOrder?.invoiceUrl) throw new AppError(502, "Paiement indisponible pour le moment" + (er ? " : " + er.message : "."));
  const dr = d.draftOrderCreate.draftOrder;
  await sql`INSERT INTO paiements_web (reparation_id, client_id, montant_cents, draft_id, url) VALUES (${repId}, ${cid}, ${montant}, ${dr.id}, ${dr.invoiceUrl})`;
  return c.json({ url: dr.invoiceUrl, montantCents: montant });
});

// ---- Remboursement d'un paiement en ligne (appelé depuis le logiciel) ----
export async function rembourserEnLigne(repId: number): Promise<string> {
  const ps = (await sql`SELECT id, order_id, montant_cents FROM paiements_web WHERE reparation_id = ${repId} AND statut = 'paye' AND rembourse_le IS NULL`) as any[];
  let n = 0;
  for (const p of ps) {
    const o = await shopifyRead(`query($id: ID!) { order(id: $id) { transactions { id kind status gateway amountSet { shopMoney { amount currencyCode } } } } }`, { id: p.order_id });
    const tr = (o.order?.transactions ?? []).find((x: any) => ["SALE", "CAPTURE"].includes(x.kind) && x.status === "SUCCESS");
    if (!tr) throw new Error("Transaction Shopify introuvable pour rembourser.");
    const res = await shopifyMutate(`mutation($input: RefundInput!) { refundCreate(input: $input) { refund { id } userErrors { field message } } }`, {
      input: { orderId: p.order_id, note: "Remboursement acompte (atelier)", notify: true, transactions: [{ orderId: p.order_id, parentId: tr.id, gateway: tr.gateway, kind: "REFUND", amount: (p.montant_cents / 100).toFixed(2) }] },
    });
    const er = res.refundCreate?.userErrors?.[0];
    if (er) throw new Error("Shopify : " + er.message);
    await sql`UPDATE paiements_web SET rembourse_le = now() WHERE id = ${p.id}`;
    n += p.montant_cents;
  }
  return n > 0 ? `Remboursé ${(n / 100).toFixed(2)} € sur la carte du client via Shopify.` : "";
}
