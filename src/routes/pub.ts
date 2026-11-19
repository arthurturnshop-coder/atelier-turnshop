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
app.use("/pub/*", cors({ origin: ["https://turnshop.fr", "https://www.turnshop.fr", "https://extensions.shopifycdn.com"], allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["content-type"], maxAge: 600 }));

await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS rdv_souhaite TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS rdv_statut TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS rdv_info TEXT NOT NULL DEFAULT ''`;
await sql`UPDATE reparations SET rdv_statut = 'confirme' WHERE source = 'web' AND rdv_statut = ''`;
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
// Jeton de session de l'extension d'espace client Shopify (JWT HS256 signé avec le secret de l'app).
function jetonShopify(jwt: string): string {
  const secret = process.env.SHOPIFY_APP_SECRET ?? "";
  if (!secret) throw new AppError(503, "Espace client non configuré (SHOPIFY_APP_SECRET manquant).");
  const [h, p, sg] = jwt.split(".");
  if (!h || !p || !sg) throw new AppError(401, "Connexion requise.");
  const attendu = createHmac("sha256", secret).update(h + "." + p).digest("base64url");
  const a = Buffer.from(attendu), r = Buffer.from(sg);
  if (a.length !== r.length || !timingSafeEqual(a, r)) throw new AppError(401, "Connexion requise.");
  let c: any;
  try { c = JSON.parse(Buffer.from(p, "base64url").toString()); } catch { throw new AppError(401, "Connexion requise."); }
  const now = Date.now() / 1000;
  if (!c.exp || c.exp < now - 5 || (c.nbf && c.nbf > now + 5)) throw new AppError(401, "Session expirée : recharge la page.");
  const m = /^gid:\/\/shopify\/Customer\/(\d+)$/.exec(String(c.sub ?? ""));
  if (!m) throw new AppError(401, "Connexion requise.");
  return m[1];
}

async function verifie(b: any): Promise<Qui> {
  if (typeof b.jwt === "string" && b.jwt) {
    const cid = jetonShopify(b.jwt);
    // L'identité vient du jeton ; email et nom viennent de Shopify (pas du navigateur).
    let email = "", prenom = "", nom = "", tel = "";
    try {
      const d = await shopifyRead(`query($id: ID!){ customer(id:$id){ email firstName lastName phone } }`, { id: `gid://shopify/Customer/${cid}` });
      const cu = d?.customer ?? {};
      email = cu.email ?? ""; prenom = cu.firstName ?? ""; nom = cu.lastName ?? ""; tel = cu.phone ?? "";
    } catch { /* on continue avec l'identifiant seul */ }
    return { cid, email, prenom, nom, tel };
  }
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

// Coordonnées obligatoires pour réserver : nom, prénom, portable, email (complète la fiche client avec ce que le client saisit).
async function coordonnees(cid: number, q: Qui, b: any) {
  const [c] = (await sql`SELECT prenom, nom, telephone, email FROM clients WHERE id = ${cid}`) as any[];
  const bon = (x: string) => (x && x !== q.email && x !== "Client" ? x : "");
  const prenom = clean(b.prenom, 80) || c.prenom || q.prenom;
  const nom = clean(b.nom, 80) || bon(c.nom) || q.nom;
  const tel = clean(b.tel, 40) || c.telephone || q.tel;
  const email = clean(b.email, 120) || c.email || q.email;
  return { prenom: prenom?.trim() ?? "", nom: nom?.trim() ?? "", tel: tel?.trim() ?? "", email: email?.trim() ?? "" };
}
function verifCoordonnees(k: { prenom: string; nom: string; tel: string; email: string }) {
  if (!k.prenom || !k.nom) throw new AppError(400, "Indique ton nom et ton prénom.");
  if (k.tel.replace(/\D/g, "").length < 9) throw new AppError(400, "Indique un numéro de portable valide.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k.email)) throw new AppError(400, "Indique une adresse email valide.");
}

const pcn = (id: number) => "PC-" + String(id).padStart(4, "0");

// Ce que voit le client : "en cours" ou "terminé", une phrase claire et la frise d'avancement (comme un suivi de colis).
export function etatClient(r: any) {
  const web = r.source === "web";
  const rs = r.rdv_statut ?? "";
  let etape = "recu", groupe = "cours", libelle = "";
  if (r.statut === "récupéré") { etape = "termine"; groupe = "termine"; libelle = "Terminée et récupérée"; }
  else if (r.statut === "prêt") { etape = "termine"; groupe = "termine"; libelle = "Terminée : ta trottinette est prête à récupérer"; }
  else if (web && rs === "refuse") { etape = "demande"; groupe = "termine"; libelle = "Demande refusée : contacte notre support pour plus d'infos"; }
  else if (web && rs === "annule") { etape = "demande"; groupe = "termine"; libelle = "Demande annulée"; }
  else if (web && rs === "a_payer") { etape = "demande"; libelle = "À finaliser : règle ton paiement pour envoyer ta demande à l'atelier"; }
  else if (web && rs === "attente") { etape = "demande"; libelle = "Ton rendez-vous a bien été pris en compte : notre équipe va revenir vers toi pour finaliser l'horaire"; }
  else if (web && rs === "propose") { etape = "demande"; libelle = "L'atelier te propose un autre créneau : à toi de répondre"; }
  else if (r.statut === "devis envoyé") { etape = "validation"; libelle = "Devis à valider : on attend ta réponse"; }
  else if (r.statut === "en attente de pièce") { etape = "commande"; libelle = "Pièce en commande"; }
  else if (r.statut === "diagnostic" || r.statut === "en réparation") { etape = "en_cours"; libelle = r.statut === "diagnostic" ? "Diagnostic en cours" : "En cours de réparation"; }
  else if (web && r.en_magasin === false) { etape = "rdv"; libelle = "Rendez-vous confirmé : apporte ta trottinette à l'atelier"; }
  else if (r.debut) { etape = "planifie"; libelle = "Réparation planifiée"; }
  else { etape = "recu"; libelle = "Trottinette réceptionnée à l'atelier"; }
  const ordre = [...(web ? ["demande", "rdv"] : []), "recu", "planifie", "en_cours", "commande", "validation", "termine"];
  const noms: Record<string, string> = { demande: "Demande envoyée", rdv: "Rendez-vous confirmé", recu: "Réceptionnée à l'atelier", planifie: "Planifiée", en_cours: "En cours", commande: "En commande", validation: "Validation client en attente", termine: "Terminée" };
  const ci = ordre.indexOf(etape);
  const etapes = ordre
    .map((k, i) => ({ k, l: noms[k], etat: i < ci ? "fait" : i === ci ? "courant" : "a_venir" }))
    // « En commande » et « Validation client » ne s'affichent que lorsqu'on y est.
    .filter((e) => !((e.k === "commande" || e.k === "validation") && e.k !== etape));
  return { groupe, libelle, etape, etapes };
}

// ---- Prix du catalogue (cache 5 min) ----
const cachePrix = new Map<string, { t: number; v: any }>();
async function prixVariantes(ids: string[]): Promise<Record<string, { prix: number; titre: string; stock: number | null; image: string; marque: string }>> {
  const out: Record<string, any> = {};
  const aLire = ids.filter((i) => {
    const c = cachePrix.get(i);
    if (c && Date.now() - c.t < 300_000) { out[i] = c.v; return false; }
    return !!i;
  });
  if (aLire.length) {
    try {
      const d = await shopifyRead(`query($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { id title price inventoryQuantity image { url } product { title vendor featuredImage { url } } } } }`, { ids: aLire.slice(0, 50) });
      for (const n of d.nodes ?? []) {
        if (!n) continue;
        const v = { prix: Math.round(Number(n.price) * 100), titre: n.title && n.title !== "Default Title" ? `${n.product.title} - ${n.title}` : n.product.title, stock: n.inventoryQuantity ?? null, image: n.image?.url || n.product.featuredImage?.url || "", marque: n.product.vendor || "" };
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
// Les 10 marques les plus courantes (les plus réparées, puis celles qui ont le plus de modèles).
app.get("/pub/marques", async (c) => {
  limite(c);
  const rows = (await sql`SELECT m.marque, count(*)::int AS nb, (SELECT count(*)::int FROM trottinettes t WHERE lower(t.marque) = lower(m.marque)) AS reps FROM modeles m WHERE m.actif = true GROUP BY m.marque ORDER BY reps DESC, nb DESC, m.marque LIMIT 10`) as any[];
  return c.json({ marques: rows.map((r) => r.marque) });
});

app.get("/pub/modeles", async (c) => {
  limite(c);
  const q = clean(c.req.query("q"), 60).toLowerCase();
  const marque = clean(c.req.query("marque"), 60).toLowerCase();
  const ms = (await sql`SELECT id, marque, modele FROM modeles WHERE actif = true ORDER BY marque, modele`) as any[];
  const f = ms.filter((m) => (!marque || m.marque.toLowerCase() === marque) && (!q || `${m.marque} ${m.modele}`.toLowerCase().includes(q))).slice(0, 40);
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
  const opts = (await sql`SELECT id, prestation_id, nom, prix_cents FROM prestation_options ORDER BY id`) as any[];
  return c.json({
    modele: { id: m.id, nom: `${m.marque} ${m.modele}` },
    pieces: ps.map((p) => ({ id: p.id, libelle: p.libelle, categorie: p.categorie, prixCents: prix[p.variant_id]?.prix ?? null, image: prix[p.variant_id]?.image ?? "", marque: prix[p.variant_id]?.marque ?? "", titre: prix[p.variant_id]?.titre ?? p.libelle, enStock: prix[p.variant_id]?.stock == null ? null : prix[p.variant_id].stock > 0 })),
    prestations: prestas.map((p) => ({ id: p.id, nom: p.nom, prixCents: p.prix_cents, avecPiece: p.avec_piece === true, aide: p.piece_aide, options: opts.filter((o) => o.prestation_id === p.id).map((o) => ({ id: o.id, nom: o.nom, prixCents: o.prix_cents })) })),
  });
});

// Montant du blocage de rendez-vous (réglage "blocage_rdv_cents", 20 € par défaut).
async function blocageCents() {
  const [l] = (await sql`SELECT valeur FROM reglages WHERE cle = 'blocage_rdv_cents'`) as any[];
  return Math.max(100, Number(l?.valeur ?? 2000) || 2000);
}

// ---- Mon espace : mes réparations ----
async function paiementsEnAttente(repId: number) {
  const att = (await sql`SELECT id, draft_id FROM paiements_web WHERE reparation_id = ${repId} AND statut = 'attente'`) as any[];
  for (const p of att) {
    try {
      const d = await shopifyRead(`query($id: ID!) { draftOrder(id: $id) { status order { id } } }`, { id: p.draft_id });
      const dr = d.draftOrder;
      if (dr?.status === "COMPLETED" && dr.order?.id) {
        try { await enregistrePaiementWeb(p.id, dr.order.id); }
        catch (e) { console.error("enregistrePaiementWeb", e); await activeRdvPayes(repId); }
      }
    } catch (e) { console.error("paiementsEnAttente", e); }
  }
  try { await activeRdvPayes(); } catch (e) { console.error("activeRdvPayes", e); }
}

// Un paiement en ligne devient un acompte dans la caisse (le solde se déduit à la facturation).
// Une demande de RDV payée (paiement 'paye') quitte l'état brouillon et arrive à l'atelier. Rejouable sans risque.
export async function activeRdvPayes(forceRepId = 0) {
  const rows = (await sql`UPDATE reparations r SET rdv_statut = 'attente', supprime_le = NULL, maj_le = now()
    WHERE r.rdv_statut = 'a_payer' AND (r.id = ${forceRepId} OR EXISTS (SELECT 1 FROM paiements_web p WHERE p.reparation_id = r.id AND p.statut = 'paye'))
    RETURNING r.id, r.rdv_souhaite, r.rdv_info, r.magasin`) as any[];
  for (const br of rows) {
    try {
      await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${br.id}, 'statut', ${`Demande de rendez-vous en ligne (payée) : ${br.magasin}, ${br.rdv_souhaite}`})`;
      await sql`INSERT INTO taches (texte, echeance, priorite, cree_par, reparation_id) VALUES (${`Demande RDV en ligne ${pcn(br.id)} : ${br.rdv_info || br.magasin + ", " + br.rdv_souhaite}`}, (now() AT TIME ZONE 'Europe/Paris')::date, true, 'Espace client', ${br.id})`;
    } catch (e) { console.error("activeRdvPayes journal", e); }
  }
}

export async function enregistrePaiementWeb(pid: number, orderId: string) {
  const [p] = (await sql`SELECT * FROM paiements_web WHERE id = ${pid} AND statut = 'attente'`) as any[];
  if (!p) return;
  const [v] = (await sql`INSERT INTO ventes (client_id, reparation_id, magasin, vendeur, total_cents, points_gagnes, type) VALUES (${p.client_id}, ${p.reparation_id}, NULL, 'En ligne', ${p.montant_cents}, 0, 'acompte') RETURNING id`) as any[];
  await sql`INSERT INTO vente_lignes (vente_id, libelle, quantite, prix_unitaire_cents, type) VALUES (${v.id}, ${"Paiement en ligne " + pcn(p.reparation_id)}, 1, ${p.montant_cents}, 'article')`;
  await sql`INSERT INTO vente_paiements (vente_id, moyen, montant_cents) VALUES (${v.id}, 'en_ligne', ${p.montant_cents})`;
  await sql`UPDATE paiements_web SET statut = 'paye', order_id = ${orderId}, vente_id = ${v.id} WHERE id = ${pid}`;
  try { await activeRdvPayes(); } catch (e) { console.error("activeRdvPayes", e); }
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${p.reparation_id}, 'caisse', ${`Paiement en ligne reçu : ${(p.montant_cents / 100).toFixed(2)} € (Shopify)`})`;
  await sql`INSERT INTO taches (texte, echeance, priorite, cree_par, reparation_id) VALUES (${`Paiement en ligne reçu ${pcn(p.reparation_id)} : ${(p.montant_cents / 100).toFixed(2)} €`}, (now() AT TIME ZONE 'Europe/Paris')::date, false, 'Espace client', ${p.reparation_id})`;
}

export async function verifierPaiementsWeb() {
  try { await activeRdvPayes(); } catch (e) { console.error("activeRdvPayes", e); }
  const reps = (await sql`SELECT DISTINCT reparation_id FROM paiements_web WHERE statut = 'attente' AND cree_le > now() - interval '3 days'`) as any[];
  for (const r of reps) await paiementsEnAttente(r.reparation_id);
}

app.post("/pub/moi", async (c) => {
  limite(c);
  const b = await c.req.json().catch(() => ({}));
  const q = await verifie(b);
  const cid = await clientDe(q);
  const blocage = await blocageCents();
  const rows = (await sql`SELECT r.*, t.marque, t.modele FROM reparations r JOIN trottinettes t ON t.id = r.trottinette_id WHERE r.client_id = ${cid} AND (r.supprime_le IS NULL OR r.rdv_statut IN ('refuse','a_payer')) ORDER BY r.id DESC LIMIT 30`) as any[];
  const reparations = [];
  for (const r of rows) {
    if (r.statut !== "récupéré") await paiementsEnAttente(r.id);
    const e = etatClient(r);
    const dv = await devisDe(r.id);
    const ac = await acomptesDe(r.id);
    const g = infosGarde(r.pret_le, r.statut, r.abandonnee_le);
    reparations.push({
      id: r.id, numero: pcn(r.id), trottinette: `${r.marque} ${r.modele}`, panne: r.panne, groupe: e.groupe, etat: e.libelle, etape: e.etape, etapes: e.etapes, rdvStatut: r.rdv_statut ?? "",
      depot: r.date_depot, rdv: r.debut, rdvSouhaite: r.rdv_souhaite, magasin: r.magasin,
      devis: dv.lignes.map((l) => ({ libelle: l.libelle, quantite: l.quantite, prixCents: l.prixCents })), remiseCents: dv.remiseMultiCents, totalCents: dv.netCents,
      verseCents: ac.verseCents, resteAPayerCents: Math.max(0, dv.netCents - ac.verseCents),
      gardiennage: g && g.fraisCents > 0 ? { jours: g.joursFrais, fraisCents: g.fraisCents } : null, abandonnee: !!r.abandonnee_le,
      peutPayer: r.statut !== "récupéré" && r.rdv_statut !== "refuse" && r.rdv_statut !== "annule" && dv.netCents - ac.verseCents > 0,
      // Panne non chiffrable : un blocage de rendez-vous est demandé (déduit de la facture, gardé si le client ne vient pas).
      aFinaliser: r.rdv_statut === "a_payer",
      besoinBlocage: r.source === "web" && r.rdv_statut !== "refuse" && r.rdv_statut !== "annule" && r.statut !== "récupéré" && dv.netCents === 0 && ac.verseCents === 0 && r.en_magasin === false,
      blocageCents: blocage,
    });
  }
  const k = await coordonnees(cid, q, {});
  const coordOk = !!(k.prenom && k.nom && k.tel.replace(/\D/g, "").length >= 9 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k.email));
  return c.json({ prenom: q.prenom, profil: { ...k, ok: coordOk }, reparations });
});

// ---- Demande de rendez-vous ----
app.post("/pub/rdv", async (c) => {
  limite(c);
  const b = await c.req.json().catch(() => ({}));
  const q = await verifie(b);
  const cid = await clientDe(q);
  const k = await coordonnees(cid, q, b);
  verifCoordonnees(k);
  await sql`UPDATE clients SET prenom = ${k.prenom}, nom = ${k.nom}, telephone = ${k.tel}, email = ${k.email} WHERE id = ${cid}`;
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
  const [r] = (await sql`INSERT INTO reparations (client_id, trottinette_id, panne, en_magasin, magasin, source, rdv_souhaite, rdv_statut, statut) VALUES (${cid}, ${t.id}, ${sujet}, false, ${magasin}, 'web', ${quand}, 'a_payer', 'reçu') RETURNING id`) as any[];

  // Devis pré-rempli : prestations (main-d'œuvre) puis pièces compatibles avec leur prix du catalogue.
  for (const pid of prestaIds) {
    const [p] = (await sql`SELECT nom, prix_cents FROM prestations WHERE id = ${pid} AND actif = true`) as any[];
    if (p) await sql`INSERT INTO devis_lignes (reparation_id, type, libelle, quantite, prix_unitaire_cents) VALUES (${r.id}, 'main_oeuvre', ${p.nom}, 1, ${p.prix_cents})`;
  }
  // Options choisies (ex : valve tubeless) : seulement si leur prestation est aussi choisie.
  const optionIds: number[] = (Array.isArray(b.optionIds) ? b.optionIds : []).map(Number).filter(Boolean).slice(0, 20);
  if (optionIds.length && prestaIds.length) {
    const os = (await sql`SELECT nom, prix_cents, type FROM prestation_options WHERE id = ANY(${optionIds}) AND prestation_id = ANY(${prestaIds})`) as any[];
    for (const o of os) await sql`INSERT INTO devis_lignes (reparation_id, type, libelle, quantite, prix_unitaire_cents) VALUES (${r.id}, ${o.type}, ${o.nom}, 1, ${o.prix_cents})`;
  }
  if (pieceIds.length && m) {
    const ps = (await sql`SELECT id, libelle, sku, variant_id FROM modele_pieces WHERE modele_id = ${m.id} AND id = ANY(${pieceIds})`) as any[];
    await variantesParSku(ps);
    const prix = await prixVariantes(ps.map((p) => p.variant_id).filter(Boolean));
    for (const p of ps) await sql`INSERT INTO devis_lignes (reparation_id, type, libelle, quantite, prix_unitaire_cents, shopify_variant_id, sku) VALUES (${r.id}, 'piece', ${p.libelle}, 1, ${prix[p.variant_id]?.prix ?? 0}, ${p.variant_id || null}, ${p.sku || null})`;
  }
  // Brouillon : invisible pour l'atelier (soft-delete) tant que le paiement n'est pas reçu (voir enregistrePaiementWeb).
  await sql`UPDATE reparations SET supprime_le = now() WHERE id = ${r.id}`;
  await sql`UPDATE reparations SET rdv_info = ${`${q.prenom} ${q.nom} - ${tMarque} ${tModele} - ${magasin}, ${quand}`} WHERE id = ${r.id}`;
  return c.json({ message: "Dernière étape : règle ton paiement pour envoyer ta demande à l'atelier.", repairId: r.id, numero: pcn(r.id) });
});

// ---- Réponse du client à une proposition de créneau ----
app.post("/pub/rdv/reponse", async (c) => {
  limite(c);
  const b = await c.req.json().catch(() => ({}));
  const q = await verifie(b);
  const cid = await clientDe(q);
  const repId = Number(b.repairId);
  const [r] = (await sql`SELECT id, rdv_statut FROM reparations WHERE id = ${repId} AND client_id = ${cid} AND source = 'web' AND supprime_le IS NULL`) as any[];
  if (!r) throw new AppError(404, "Demande introuvable.");
  if (r.rdv_statut !== "propose") throw new AppError(400, "Aucune proposition en attente.");
  if (b.reponse === "accepter") {
    await sql`UPDATE reparations SET rdv_statut = 'confirme', maj_le = now() WHERE id = ${repId}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${repId}, 'statut', 'Le client a accepté le créneau proposé (espace client)')`;
    await sql`INSERT INTO taches (texte, echeance, priorite, cree_par, reparation_id) VALUES (${`Créneau accepté par le client ${pcn(repId)} : à planifier`}, (now() AT TIME ZONE 'Europe/Paris')::date, false, 'Espace client', ${repId})`;
    return c.json({ message: "Rendez-vous confirmé, merci !" });
  }
  if (b.reponse === "annuler") {
    await sql`UPDATE reparations SET rdv_statut = 'annule', maj_le = now() WHERE id = ${repId}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${repId}, 'statut', 'Le client a refusé le créneau proposé : demande annulée (espace client)')`;
    await sql`INSERT INTO taches (texte, echeance, priorite, cree_par, reparation_id) VALUES (${`Demande annulée par le client ${pcn(repId)} : rembourser l'acompte s'il y en a un`}, (now() AT TIME ZONE 'Europe/Paris')::date, true, 'Espace client', ${repId})`;
    return c.json({ message: "Demande annulée. Si tu as versé un acompte, il te sera remboursé." });
  }
  throw new AppError(400, "Réponse inconnue.");
});

// Produits « atelier » (image pro dans le mail de commande) : variante retrouvée par SKU, mise en cache.
const cacheVariantes = new Map<string, { t: number; id: string | null }>();
async function varianteAtelier(sku: string): Promise<string | null> {
  const c = cacheVariantes.get(sku);
  if (c && Date.now() - c.t < 600_000) return c.id;
  let id: string | null = null;
  try {
    const d = await shopifyRead(`query($q: String!) { productVariants(first: 1, query: $q) { nodes { id } } }`, { q: "sku:" + sku });
    id = d.productVariants?.nodes?.[0]?.id ?? null;
  } catch { /* on retombe sur la ligne libre */ }
  cacheVariantes.set(sku, { t: Date.now(), id });
  return id;
}

// Image des produits « atelier » (récupérée par Shopify pour les commandes et les mails).
app.get("/pub/img/atelier-reparation.png", () => new Response(Bun.file(new URL("../../public/atelier-reparation.png", import.meta.url)), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } }));

// ---- Paiement en ligne (commande brouillon Shopify + lien de paiement) ----
app.post("/pub/payer", async (c) => {
  limite(c);
  const b = await c.req.json().catch(() => ({}));
  const q = await verifie(b);
  const cid = await clientDe(q);
  const repId = Number(b.repairId);
  const [r] = (await sql`SELECT id FROM reparations WHERE id = ${repId} AND client_id = ${cid} AND (supprime_le IS NULL OR rdv_statut = 'a_payer')`) as any[];
  if (!r) throw new AppError(404, "Réparation introuvable.");
  const dv = await devisDe(repId), ac = await acomptesDe(repId);
  const blocageMode = b.mode === "blocage";
  const reste = dv.netCents - ac.verseCents;
  if (blocageMode) {
    if (dv.netCents > 0 || ac.verseCents > 0) throw new AppError(400, "Le blocage de rendez-vous n'est pas nécessaire ici.");
  } else if (dv.netCents <= 0 || reste <= 0) throw new AppError(400, "Rien à payer pour le moment.");
  const [lim] = (await sql`SELECT valeur FROM reglages WHERE cle = 'acompte_web_cents'`) as any[];
  const acompte = Math.min(reste, Math.max(100, Number(lim?.valeur ?? 2000) || 2000));
  const montant = blocageMode ? await blocageCents() : b.mode === "acompte" ? acompte : reste;
  const nomPaiement = blocageMode ? "Blocage de rendez-vous" : b.mode === "acompte" ? "Acompte" : "Paiement";
  // On réutilise un lien déjà créé pour le même montant.
  const [dej] = (await sql`SELECT url FROM paiements_web WHERE reparation_id = ${repId} AND statut = 'attente' AND montant_cents = ${montant} AND url <> '' AND cree_le > now() - interval '2 days' ORDER BY id DESC LIMIT 1`) as any[];
  if (dej) return c.json({ url: dej.url, montantCents: montant });
  // Ligne avec l'image et le nom professionnels du produit « atelier » (variante par SKU) ; sinon ligne libre sans image.
  const skuPaiement = blocageMode ? "ATELIER-BLOCAGE" : b.mode === "acompte" ? "ATELIER-ACOMPTE" : "ATELIER-PAIEMENT";
  const variante = await varianteAtelier(skuPaiement);
  const base: any = {
    purchasingEntity: { customerId: `gid://shopify/Customer/${q.cid}` },
    email: q.email || undefined,
    tags: ["atelier", "paiement-en-ligne", pcn(repId)],
    note: `${nomPaiement} réparation ${pcn(repId)} (espace client)`,
  };
  const libre = { ...base, lineItems: [{ title: `${nomPaiement} ${pcn(repId)}`, quantity: 1, originalUnitPrice: (montant / 100).toFixed(2), requiresShipping: false, taxable: true }] };
  const mutation = `mutation($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id invoiceUrl } userErrors { field message } } }`;
  let d: any;
  try {
    if (variante) {
      try {
        d = await shopifyMutate(mutation, { input: { ...base, lineItems: [{ variantId: variante, quantity: 1, priceOverride: { amount: (montant / 100).toFixed(2), currencyCode: "EUR" }, customAttributes: [{ key: "Réparation", value: pcn(repId) }] }] } }, "2026-10");
        if (d.draftOrderCreate?.userErrors?.length) d = null;
      } catch { d = null; }
    }
    if (!d) d = await shopifyMutate(mutation, { input: libre });
  } catch { throw new AppError(502, "Paiement indisponible pour le moment, réessaie dans quelques minutes."); }
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
