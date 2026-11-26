import { ANNIV_PRIX_CENTS } from "../config";
import { app } from "../app";
import { sql } from "../db";
import { lireParametres } from "./parametres";
import { shopifyRead, shopifyMutate } from "../shopify";
import { infosTicket } from "./ticket";
import { commandesActives, creerCommandeShopify } from "./commandes";
import { envoyerAvis } from "../automatisations";
import { remiseMulti } from "./prestations";
import { avantagesActifs, contexteClient, estApplicable, remiseDe } from "./avantages";
import { AppError, clean, signature } from "../util";
import { vendeurParMdp } from "./caissier";
import { createHmac } from "node:crypto";
import { brevoConfigure, envoiEmail } from "../brevo";

// Bons d'achat valables 12 mois. Chaque remise utilisée en caisse consomme d'abord le bon valable le plus ancien (celui qui expire en premier),
// puis seulement la remise fidélité. Un bon expiré n'est jamais « consommé » à la place d'un bon récent.
export async function bonsRestants(clientId: number) {
  const bons = (await sql`SELECT id, montant_cents, cree_le, (cree_le > now() - interval '12 months') AS valide FROM bons_achat WHERE client_id = ${clientId} ORDER BY cree_le, id`) as any[];
  const usages = (await sql`SELECT remise_cents, cree_le FROM ventes WHERE client_id = ${clientId} AND remise_cents > 0 ORDER BY cree_le, id`) as any[];
  const reste = bons.map((b) => ({ id: b.id as number, restantCents: b.montant_cents as number, valide: !!b.valide, debut: new Date(b.cree_le).getTime(), fin: new Date(b.cree_le).getTime() + 365 * 86400000 }));
  let fidUtiliseCents = 0;
  for (const u of usages) {
    let r = u.remise_cents as number;
    const t = new Date(u.cree_le).getTime();
    for (const b of reste) {
      if (r <= 0) break;
      if (b.debut <= t && t < b.fin && b.restantCents > 0) { const x = Math.min(r, b.restantCents); b.restantCents -= x; r -= x; }
    }
    fidUtiliseCents += r;
  }
  return { restants: reste, fidUtiliseCents };
}

// Les points Shopify (lecture seule) restent affichés à part dans le profil.
export async function soldeFidelite(clientId: number) {
  const p = await lireParametres();
  const [dep] = (await sql`SELECT COALESCE(sum(total_cents + acompte_deduit_cents), 0)::int AS n FROM ventes WHERE client_id = ${clientId} AND type = 'vente'`) as any[];
  const [uti] = (await sql`SELECT COALESCE(sum(remise_cents), 0)::int AS n FROM ventes WHERE client_id = ${clientId}`) as any[];
  // Le bon d'achat ne devient utilisable que le lendemain : seules les ventes d'avant aujourd'hui (heure de Paris) comptent.
  const [avant] = (await sql`SELECT COALESCE(sum(total_cents + acompte_deduit_cents), 0)::int AS n FROM ventes WHERE client_id = ${clientId} AND type = 'vente' AND cree_le < date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris'`) as any[];
  const depenseEuros = dep.n / 100;
  const gagneEuros = Math.floor(avant.n / 100 / p.eurosPourPalier) * p.remiseEuros;
  const { restants, fidUtiliseCents } = await bonsRestants(clientId);
  const bonsValidesCents = restants.filter((b) => b.valide).reduce((t, b) => t + b.restantCents, 0);
  const disponibleEuros = Math.max(0, gagneEuros - fidUtiliseCents / 100) + bonsValidesCents / 100;
  const prochainPalierIn = p.eurosPourPalier - (depenseEuros % p.eurosPourPalier);
  return { depenseEuros, disponibleEuros, prochainPalierIn, regle: p };
}

app.get("/api/caisse/client", async (c) => {
  const id = Number(c.req.query("id"));
  if (!(id > 0)) throw new AppError(404, "Client introuvable.");
  const [cl] = (await sql`SELECT id, prenom, nom, telephone, email, cree_le, (to_char(cree_le AT TIME ZONE 'Europe/Paris', 'MM-DD') = to_char(now() AT TIME ZONE 'Europe/Paris', 'MM-DD')) AS meme_jour, (extract(year FROM now() AT TIME ZONE 'Europe/Paris') - extract(year FROM cree_le AT TIME ZONE 'Europe/Paris'))::int AS annees FROM clients WHERE id = ${id}`) as any[];
  if (!cl) throw new AppError(404, "Client introuvable.");
  const ctx = await contexteClient(id);
  return c.json({ client: { id: cl.id, name: `${cl.prenom} ${cl.nom}`.trim(), phone: cl.telephone, email: cl.email, anniversaire: cl.meme_jour && cl.annees >= 1 ? { annees: cl.annees, prixCents: ANNIV_PRIX_CENTS } : null }, fidelite: { ...(await soldeFidelite(id)), depenseCents: ctx.depenseCents, recus: ctx.recus } });
});

// Trouver un client à partir d'un scan (douchette = clavier) : email, téléphone, numéro de client,
// ou contenu du QR code de la carte (email, lien ou identifiant client Shopify).
// Si le client n'existe pas encore dans l'atelier mais existe dans Shopify, on le crée ici.
app.get("/api/caisse/scan", async (c) => {
  const q = clean(c.req.query("q"), 300);
  if (!q) return c.json({ clientId: null });
  const email = (q.match(/[^\s<>"'?&=:]+@[^\s<>"'?&=]+\.[a-z]{2,}/i) ?? [])[0] ?? "";
  const gid = (q.match(/(?:Customer\/|customers\/)(\d{6,})/i) ?? [])[1] ?? "";
  const tel = q.replace(/[\s.\-]/g, "");
  const num = /^\d+$/.test(q) && q.length < 8 ? Number(q) : 0;
  const gidLike = gid ? `%/${gid}` : "";
  const [cl] = (await sql`SELECT id FROM clients WHERE (${email} <> '' AND email ILIKE ${email}) OR (${email} = '' AND email ILIKE ${q}) OR replace(telephone, ' ', '') = ${tel} OR id = ${num} OR (${gidLike} <> '' AND shopify_id LIKE ${gidLike}) ORDER BY id LIMIT 1`) as any[];
  if (cl) return c.json({ clientId: cl.id });
  // Pas trouvé dans l'atelier : on cherche dans Shopify.
  try {
    const terme = email ? `email:${email}` : gid ? `id:${gid}` : /^\+?\d{9,15}$/.test(tel) ? `phone:${tel}` : "";
    if (!terme) return c.json({ clientId: null });
    const data = await shopifyRead(`query($q: String!) { customers(first: 1, query: $q) { nodes { id firstName lastName email phone } } }`, { q: terme });
    const s = data?.customers?.nodes?.[0];
    if (!s) return c.json({ clientId: null });
    const [deja] = (await sql`SELECT id FROM clients WHERE shopify_id = ${s.id}`) as any[];
    if (deja) return c.json({ clientId: deja.id });
    const mail = clean(s.email, 120).toLowerCase();
    if (mail) {
      const [pareil] = (await sql`SELECT id FROM clients WHERE lower(trim(email)) = ${mail} LIMIT 1`) as any[];
      if (pareil) { await sql`UPDATE clients SET shopify_id = COALESCE(shopify_id, ${s.id}) WHERE id = ${pareil.id}`; return c.json({ clientId: pareil.id }); }
    }
    const [neuf] = (await sql`INSERT INTO clients (prenom, nom, telephone, email, shopify_id) VALUES (${clean(s.firstName, 80)}, ${clean(s.lastName, 80) || clean(s.email, 80) || "Client"}, ${clean(s.phone, 40)}, ${clean(s.email, 120)}, ${s.id}) RETURNING id`) as any[];
    return c.json({ clientId: neuf.id, cree: true });
  } catch (e: any) {
    console.log(JSON.stringify({ event: "scan-shopify", message: String(e?.message ?? e).slice(0, 200) }));
    return c.json({ clientId: null });
  }
});

// Un code scanné : code-barres / référence d'un produit Shopify, ou client (carte, QR, téléphone, email).
// Numéro de facture continu (F-2026-00001…) donné à chaque vente encaissée.
await sql`CREATE SEQUENCE IF NOT EXISTS facture_seq`;
await sql`ALTER TABLE ventes ADD COLUMN IF NOT EXISTS numero_facture TEXT`;
await sql`ALTER TABLE ventes ADD COLUMN IF NOT EXISTS acompte_total_cents INT`;
await sql`ALTER TABLE ventes ADD COLUMN IF NOT EXISTS acompte_reste_cents INT`;
// Les factures d'acompte déjà émises sans numéro en reçoivent un (même suite que les factures, dans l'ordre).
await sql`UPDATE ventes v SET numero_facture = 'F-' || to_char(v.cree_le, 'YYYY') || '-' || lpad(nextval('facture_seq')::text, 5, '0') FROM (SELECT id FROM ventes WHERE type = 'acompte' AND numero_facture IS NULL ORDER BY id) x WHERE v.id = x.id`;
// Case de rangement (A1, B12…) d'un produit Shopify : mémorisée ici, ou reprise du stock local si le produit y est.
await sql`CREATE TABLE IF NOT EXISTS emplacements_produits (variant_id TEXT PRIMARY KEY, emplacement TEXT NOT NULL DEFAULT '', maj_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
const caseDe = async (variantId: string, codes: string[]): Promise<string> => {
  const [e] = (await sql`SELECT emplacement FROM emplacements_produits WHERE variant_id = ${variantId} AND emplacement <> ''`) as any[];
  if (e) return e.emplacement;
  const cs = codes.filter(Boolean);
  if (!cs.length) return "";
  const [l] = (await sql`SELECT emplacement FROM stock_produits WHERE code IN ${sql(cs)} AND archive_le IS NULL AND emplacement <> '' ORDER BY qte DESC LIMIT 1`) as any[];
  return l?.emplacement ?? "";
};
app.post("/api/emplacement", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const variantId = clean(b.variantId, 80);
  const lieu = clean(b.emplacement, 20).toUpperCase().replace(/\s+/g, "");
  if (!variantId) throw new AppError(400, "Produit inconnu.");
  await sql`INSERT INTO emplacements_produits (variant_id, emplacement) VALUES (${variantId}, ${lieu}) ON CONFLICT (variant_id) DO UPDATE SET emplacement = ${lieu}, maj_le = now()`;
  const codes = [clean(b.barcode, 80), clean(b.sku, 80)].filter(Boolean);
  if (codes.length) await sql`UPDATE stock_produits SET emplacement = ${lieu} WHERE code IN ${sql(codes)} AND archive_le IS NULL`;
  return c.json({ emplacement: lieu });
});

app.get("/api/code", async (c) => {
  const q = clean(c.req.query("q"), 300).trim();
  if (!q) return c.json({});
  const num = /^\d+$/.test(q) && q.length < 8 ? Number(q) : 0;
  const tel = q.replace(/[\s.\-]/g, "");
  const [local] = (await sql`SELECT id FROM clients WHERE replace(telephone, ' ', '') = ${tel} OR id = ${num} OR email ILIKE ${q} LIMIT 1`) as any[];
  if (local) return c.json({ clientId: local.id });
  if (/^[A-Za-z0-9._\-\/]{4,40}$/.test(q)) {
    try {
      const t = q.replace(/["\\]/g, "");
      const data = await shopifyRead(`query($q: String!) { products(first: 3, query: $q) { nodes { title variants(first: 50) { nodes { id title sku barcode price inventoryQuantity } } } } }`, { q: `barcode:${t} OR sku:${t}` });
      for (const p of data?.products?.nodes ?? []) {
        const v = (p.variants?.nodes ?? []).find((x: any) => (x.barcode ?? "").toLowerCase() === q.toLowerCase() || (x.sku ?? "").toLowerCase() === q.toLowerCase());
        if (v) {
          const vt = v.title && v.title !== "Default Title" ? ` - ${v.title}` : "";
          return c.json({ produit: { libelle: `${p.title}${vt}`.slice(0, 200), prix: String(v.price ?? "0"), variantId: v.id, sku: v.sku ?? "", barcode: v.barcode ?? "", marque: p.vendor ?? "", stock: v.inventoryQuantity ?? null, emplacement: await caseDe(v.id, [v.barcode ?? "", v.sku ?? ""]) } });
        }
      }
    } catch (e: any) {
      console.log(JSON.stringify({ event: "scan-produit", message: String(e?.message ?? e).slice(0, 200) }));
      return c.json({ erreurProduit: true });
    }
  }
  return c.json({});
});

// Recherche de ventes / factures de caisse : par nom, n°, montant, produit, date ; avec ou sans compte client.
app.get("/api/ventes/recherche", async (c) => {
  const q = clean(c.req.query("q"), 80);
  const like = "%" + q.replace(/[%_\\]/g, "") + "%";
  const num = Number(q.replace(/^#/, ""));
  const euros = Number(q.replace(",", ".").replace(/[^0-9.]/g, ""));
  const cts = Number.isFinite(euros) && /\d/.test(q) ? Math.round(euros * 100) : -1;
  const du = /^\d{4}-\d{2}-\d{2}$/.test(String(c.req.query("du") ?? "")) ? String(c.req.query("du")) : "";
  const rows = (await sql`SELECT v.*, trim(cl.prenom || ' ' || cl.nom) AS client_nom FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id
    WHERE (${du} = '' OR (v.cree_le AT TIME ZONE 'Europe/Paris')::date = NULLIF(${du}, '')::date)
    AND (${q} = '' OR trim(cl.prenom || ' ' || cl.nom) ILIKE ${like} OR cl.email ILIKE ${like} OR cl.telephone ILIKE ${like}
      OR v.id = ${Number.isFinite(num) && Number.isInteger(num) ? num : -1} OR v.total_cents = ${cts}
      OR EXISTS (SELECT 1 FROM vente_lignes vl WHERE vl.vente_id = v.id AND (vl.libelle ILIKE ${like} OR vl.series::text ILIKE ${like})))
    ORDER BY v.id DESC LIMIT 40`) as any[];
  const ventes = [];
  for (const r of rows) ventes.push(await detailVente(r));
  return c.json({ ventes });
});

// Trottinettes : un numéro de série par unité est obligatoire à la vente (garantie, retrouvable sur le Z et la fiche client).
const TYPE_TROTT = /^(trottinettes?( électriques?)?( enfant)?|draisienne électrique( enfant)?)$/i;
async function variantesTrott(ids: string[]): Promise<Set<string>> {
  const res = new Set<string>();
  const liste = [...new Set(ids.filter(Boolean))];
  if (!liste.length) return res;
  try {
    const d: any = await shopifyRead(`query($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { id product { productType } } } }`, { ids: liste });
    for (const n of d?.nodes ?? []) if (n?.id && TYPE_TROTT.test(String(n.product?.productType ?? "").trim())) res.add(n.id);
  } catch (e: any) { console.log(JSON.stringify({ event: "type-trott", message: String(e?.message ?? e).slice(0, 200) })); }
  return res;
}
app.post("/api/caisse/series-requises", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const lignes = Array.isArray(b.lignes) ? b.lignes : [];
  const t = await variantesTrott(lignes.map((l: any) => clean(l.variantId, 80)));
  return c.json({ indices: lignes.map((l: any, i: number) => (t.has(clean(l.variantId, 80)) ? i : -1)).filter((i: number) => i >= 0) });
});

// Détail complet d'une vente (pour le reçu).
// Mouvements SAV (remboursement, échange, garantie) rattachés à la vente : tags et historique du ticket.
export async function detailVente(v: any) {
  const o: any = await detailVente0(v);
  try {
    const sav = (await sql`SELECT type, libelle, quantite, montant_cents, statut, issue, cree_le, cree_par, close_le, close_par, demande_le, motif FROM sav_dossiers WHERE vente_id = ${v.id} AND statut <> 'annule' ORDER BY id`) as any[];
    o.sav = sav.map((x) => ({ type: x.type, libelle: x.libelle, quantite: x.quantite, montantCents: x.montant_cents, statut: x.statut, issue: x.issue, le: x.cree_le, par: x.cree_par, closeLe: x.close_le, closePar: x.close_par, demandeLe: x.demande_le, motif: x.motif }));
  } catch (e: any) { o.sav = []; console.log(JSON.stringify({ event: "historique-sav", message: String(e?.message ?? e).slice(0, 200) })); }
  return o;
}
async function acompteInfos(v: any) {
  if ((v.type ?? "vente") !== "acompte" || !v.reparation_id) return {};
  let total = v.acompte_total_cents, reste = v.acompte_reste_cents;
  if (total == null) {
    const dv = await (await import("./reparations")).devisDe(v.reparation_id);
    const [{ n }] = (await sql`SELECT COALESCE(sum(total_cents), 0)::int AS n FROM ventes WHERE reparation_id = ${v.reparation_id} AND type = 'acompte' AND id <= ${v.id}`) as any[];
    total = dv.netCents; reste = Math.max(0, total - n);
  }
  return { acompteTotalCents: total, acompteResteCents: reste };
}
async function detailVente0(v: any) {
  const lignes = (await sql`SELECT libelle, quantite, prix_unitaire_cents, series FROM vente_lignes WHERE vente_id = ${v.id} ORDER BY id`) as any[];
  const pays = (await sql`SELECT moyen, montant_cents FROM vente_paiements WHERE vente_id = ${v.id} ORDER BY id`) as any[];
  const avs = (await sql`SELECT libelle, effet, remise_cents FROM vente_avantages WHERE vente_id = ${v.id} ORDER BY id`) as any[];
  const brut = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire_cents, 0);
  const [co] = v.client_id ? ((await sql`SELECT prenom, telephone, email FROM clients WHERE id = ${v.client_id}`) as any[]) : [];
  return {
    contact: { prenom: co?.prenom ?? "", tel: co?.telephone ?? "", email: co?.email ?? "" },
    type: v.type ?? "vente", acompteDeduitCents: v.acompte_deduit_cents ?? 0, ...(await acompteInfos(v)),
    numero: v.numero_facture ?? null, clientId: v.client_id ?? null,
    id: v.id, date: v.cree_le, magasin: v.magasin, vendeur: v.vendeur, client: v.client_nom || null,
    totalCents: v.total_cents, fideliteCents: v.remise_cents, brutCents: brut,
    lignes: lignes.map((l) => ({ libelle: l.libelle, quantite: l.quantite, prixCents: l.prix_unitaire_cents, series: Array.isArray(l.series) ? l.series : [] })),
    paiements: pays.map((p) => ({ moyen: p.moyen, cents: p.montant_cents })),
    avantages: avs.map((x) => ({ libelle: x.libelle, effet: x.effet, remiseCents: x.remise_cents })),
    ticket: await infosTicket(v.magasin ?? null),
    reparationId: v.reparation_id ?? null,
    shopify: { nom: v.shopify_order_name ?? null, erreur: v.shopify_erreur ?? null, eligible: (v.type ?? "vente") === "vente" },
  };
}

// Historique : les achats d'un client, ou les ventes du jour si aucun client.
app.get("/api/caisse/historique", async (c) => {
  const id = Number(c.req.query("clientId"));
  const jour = c.req.query("jour") === "1";
  const rows = (jour
    ? await sql`SELECT v.*, trim(cl.prenom || ' ' || cl.nom) AS client_nom FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id WHERE (v.cree_le AT TIME ZONE 'Europe/Paris')::date = (now() AT TIME ZONE 'Europe/Paris')::date ORDER BY v.id DESC LIMIT 300`
    : id > 0
    ? await sql`SELECT v.*, trim(cl.prenom || ' ' || cl.nom) AS client_nom FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id WHERE v.client_id = ${id} ORDER BY v.id DESC LIMIT 30`
    : await sql`SELECT v.*, trim(cl.prenom || ' ' || cl.nom) AS client_nom FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id WHERE (v.cree_le AT TIME ZONE 'Europe/Paris')::date = (now() AT TIME ZONE 'Europe/Paris')::date ORDER BY v.id DESC LIMIT 30`) as any[];
  const ventes = [];
  for (const r of rows) ventes.push(await detailVente(r));
  return c.json({ ventes });
});

// Encaisser : lignes + paiements (carte / espèces / virement, plusieurs possibles) + remise fidélité éventuelle.
app.post("/api/reparations/livraison", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const liv = { adresse: clean(b.adresse, 200), cp: clean(b.cp, 10), ville: clean(b.ville, 80) };
  if (!liv.adresse || !liv.cp || !liv.ville) throw new AppError(400, "Livraison : indique l'adresse, le code postal et la ville.");
  const [r] = (await sql`UPDATE reparations SET livraison = ${JSON.stringify(liv)}::jsonb WHERE id = ${Number(b.repairId)} RETURNING client_id`) as any[];
  if (r?.client_id) await sql`UPDATE clients SET adresse = ${liv.adresse}, code_postal = ${liv.cp}, ville = ${liv.ville} WHERE id = ${r.client_id}`;
  return c.json({ message: "Livraison à domicile enregistrée." });
});
app.get("/api/client-adresse", async (c) => {
  const [r] = (await sql`SELECT adresse, code_postal, ville FROM clients WHERE id = ${Number(c.req.query("id"))}`) as any[];
  return c.json({ adresse: r?.adresse ?? "", cp: r?.code_postal ?? "", ville: r?.ville ?? "" });
});
app.post("/api/caisse/encaisser", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const lignes = Array.isArray(b.lignes) ? b.lignes : [];
  if (!lignes.length) throw new AppError(400, "Le panier est vide.");
  {
    const mg = (c.get("user") as any)?.magasin === "Rouen" ? "Rouen" : "Amiens";
    const [ouv] = (await sql`SELECT jour >= (now() AT TIME ZONE 'Europe/Paris')::date AS ok FROM caisse_sessions WHERE magasin = ${mg} AND fermee_le IS NULL ORDER BY id DESC LIMIT 1`) as any[];
    if (!ouv) throw new AppError(409, "Caisse fermée : ouvre la caisse avant d'encaisser.");
    if (!ouv.ok) throw new AppError(409, "La caisse de la veille n'est pas fermée : ferme-la d'abord.");
  }
  const nettoyees = lignes.map((l: any) => ({
    libelle: clean(l.libelle, 200),
    quantite: Math.max(1, Math.min(999, Math.round(Number(l.quantite) || 1))),
    prixCents: Math.max(0, Math.round((Number(String(l.prix ?? "0").replace(",", ".")) || 0) * 100)),
    type: ["piece", "main_oeuvre"].includes(l.type) ? l.type : "article",
    variantId: clean(l.variantId, 80) || null,
    sku: clean(l.sku, 80) || null,
    trott: l.trott === true,
    series: (Array.isArray(l.series) ? l.series : []).map((x: any) => clean(x, 60).replace(/\s+/g, " ")),
  }));
  if (nettoyees.some((l: any) => !l.libelle)) throw new AppError(400, "Chaque ligne doit avoir un libellé.");
  const livLigne = nettoyees.some((l: any) => /^Livraison à domicile/i.test(String(l.libelle)));
  const [repLiv] = Number(b.repairId) > 0 ? ((await sql`SELECT livraison FROM reparations WHERE id = ${Number(b.repairId)}`) as any[]) : [undefined];
  const src = b.livraison?.adresse ? b.livraison : (repLiv?.livraison ?? {});
  const liv = { adresse: clean(src.adresse, 200), cp: clean(src.cp, 10), ville: clean(src.ville, 80) };
  if (livLigne && (!liv.adresse || !liv.cp || !liv.ville)) throw new AppError(400, "Livraison : indique l'adresse, le code postal et la ville.");
  const brut = nettoyees.reduce((s: number, l: any) => s + l.quantite * l.prixCents, 0);
  const basePieces = nettoyees.filter((l: any) => l.type === "piece" && !l.trott && !/^Livraison à domicile/i.test(String(l.libelle))).reduce((s: number, l: any) => s + l.quantite * l.prixCents, 0);

  // Trottinettes : un numéro de série par unité, et un client (la garantie est liée à son compte).
  const auto = await variantesTrott(nettoyees.map((l: any) => l.variantId));
  const toutesSeries: string[] = [];
  for (const l of nettoyees as any[]) {
    l.trott = l.trott || (l.variantId && auto.has(l.variantId));
    if (!l.trott) { l.series = []; continue; }
    // Prise en charge client (facturation d'une réparation) : le n° de série n'est jamais exigé (facultatif).
    if (l.series.every((x: string) => !x)) { l.trott = false; l.series = []; continue; }
    if (l.series.length !== l.quantite || l.series.some((x: string) => x.length < 3)) throw new AppError(400, `Numéro de série obligatoire pour « ${l.libelle} » (${l.quantite} à saisir).`);
    toutesSeries.push(...l.series);
  }
  if (new Set(toutesSeries.map((x) => x.toLowerCase())).size !== toutesSeries.length) throw new AppError(400, "Le même numéro de série est saisi deux fois.");
  if (toutesSeries.length) {
    if (!(Number(b.clientId) > 0)) throw new AppError(400, "Vente d'une trottinette : choisis le client (sa garantie est liée à son compte).");
    const dej = (await sql`SELECT vl.series, v.numero_facture FROM vente_lignes vl JOIN ventes v ON v.id = vl.vente_id WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(vl.series) s WHERE lower(s) IN (SELECT lower(jsonb_array_elements_text(${JSON.stringify(toutesSeries)}::text::jsonb))))`) as any[];
    if (dej.length) throw new AppError(409, `Ce numéro de série a déjà été vendu (facture ${dej[0].numero_facture ?? "?"}). Vérifie la saisie.`);
  }

  const clientId = Number(b.clientId) > 0 ? Number(b.clientId) : null;
  const reparationId = Number(b.repairId) > 0 ? Number(b.repairId) : null;
  // Avantages choisis (cadeaux / remises) : revalidés ici, appliqués dans l'ordre sans jamais dépasser le total.
  const ids: number[] = (Array.isArray(b.avantageIds) ? b.avantageIds : []).map(Number).filter((n: number) => n > 0).sort((x: number, y: number) => x - y);
  const appliques: { id: number; libelle: string; effet: string; cents: number }[] = [];
  if (ids.length) {
    const actifs = await avantagesActifs();
    const ctx = clientId ? await contexteClient(clientId) : null;
    let reste = brut;
    for (const id of ids) {
      const a = actifs.find((x) => x.id === id);
      if (!a || !estApplicable(a, brut, ctx, basePieces, clientId)) continue;
      const cents = Math.min(remiseDe(a, brut, basePieces), reste);
      reste -= cents;
      appliques.push({ id: a.id, libelle: a.libelle, effet: a.effet, cents });
    }
  }
  // Remise multi-prestations : seulement si aucune offre n'est appliquée.
  if (!appliques.length) {
    const rm = await remiseMulti(nettoyees, brut);
    if (rm > 0) appliques.push({ id: null as any, libelle: "Remise plusieurs prestations", effet: "euros", cents: rm });
  }
  const remAvantages = appliques.reduce((s, a) => s + a.cents, 0);
  let remiseCents = 0;
  if (b.utiliserFidelite === true) {
    if (!clientId) throw new AppError(400, "Choisis un client pour utiliser sa fidélité.");
    const s = await soldeFidelite(clientId);
    remiseCents = Math.min(Math.round(s.disponibleEuros * 100), brut - remAvantages);
  }
  // Acomptes déjà versés sur cette réparation : déduits du total, dans l'ordre, sans jamais dépasser ce qui reste à payer.
  const deduits: { id: number; cents: number }[] = [];
  let aDeduire = brut - remAvantages - remiseCents;
  if (reparationId) {
    const ac = (await sql`SELECT id, total_cents - utilise_cents AS reste FROM ventes WHERE reparation_id = ${reparationId} AND type = 'acompte' AND total_cents - utilise_cents > 0 ORDER BY id`) as any[];
    for (const a of ac) {
      const x = Math.min(a.reste, aDeduire);
      if (x <= 0) break;
      deduits.push({ id: a.id, cents: x });
      aDeduire -= x;
    }
  }
  const acompteDeduit = deduits.reduce((s, d) => s + d.cents, 0);
  const totalCents = brut - remAvantages - remiseCents - acompteDeduit;

  const paiements = (Array.isArray(b.paiements) ? b.paiements : []).map((p: any) => ({
    moyen: String(p.moyen ?? ""),
    cents: Math.max(0, Math.round((Number(String(p.montant ?? "0").replace(",", ".")) || 0) * 100)),
  })).filter((p: any) => p.cents > 0);
  if (paiements.some((p: any) => !["carte", "especes", "virement", "bon_achat"].includes(p.moyen))) throw new AppError(400, "Moyen de paiement inconnu.");
  let renduCents = 0;
  {
    const brutPaye = paiements.reduce((s: number, p: any) => s + p.cents, 0);
    const esp = paiements.find((p: any) => p.moyen === "especes");
    if (brutPaye > totalCents && esp && esp.cents >= brutPaye - totalCents) { renduCents = brutPaye - totalCents; esp.cents -= renduCents; }
  }
  const paiementsOk = paiements.filter((p: any) => p.cents > 0);
  paiements.length = 0; paiements.push(...paiementsOk);
  const payeTotal = paiements.reduce((s: number, p: any) => s + p.cents, 0);
  if (payeTotal !== totalCents) throw new AppError(400, `Les paiements (${(payeTotal / 100).toFixed(2)} €) ne correspondent pas au total (${(totalCents / 100).toFixed(2)} €).`);

  const u = c.get("user");
  const vendeur = await vendeurParMdp(c, b.mdpCaissier);
  const p = await lireParametres();
  const pointsGagnes = Math.floor((totalCents + acompteDeduit) / 100 / p.eurosPourPalier);
  const [v] = (await sql`INSERT INTO ventes (client_id, reparation_id, magasin, vendeur, total_cents, remise_cents, points_gagnes, points_utilises, acompte_deduit_cents) VALUES (${clientId}, ${reparationId}, ${u.magasin ?? null}, ${vendeur}, ${totalCents}, ${remiseCents}, ${pointsGagnes}, ${remiseCents > 0 ? 1 : 0}, ${acompteDeduit}) RETURNING id`) as any[];
  if (livLigne) {
    await sql`UPDATE ventes SET livraison = ${JSON.stringify(liv)}::jsonb WHERE id = ${v.id}`;
    if (clientId) await sql`UPDATE clients SET adresse = ${liv.adresse}, code_postal = ${liv.cp}, ville = ${liv.ville} WHERE id = ${clientId}`;
  }
  await sql`UPDATE ventes SET numero_facture = 'F-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('facture_seq')::text, 5, '0') WHERE id = ${v.id}`;
  for (const l of nettoyees) { const m = /DV#(\d+)/.exec(String(l.libelle)); if (m) await (await import("./depot")).depotVendu(Number(m[1]), v.id, l.prixCents * l.quantite); }
  for (const l of nettoyees) {
    await sql`INSERT INTO vente_lignes (vente_id, libelle, quantite, prix_unitaire_cents, type, shopify_variant_id, sku, series) VALUES (${v.id}, ${l.libelle}, ${l.quantite}, ${l.prixCents}, ${l.type}, ${l.variantId}, ${l.sku}, ${JSON.stringify(l.series)}::text::jsonb)`;
    if (clientId) for (const serie of l.series as string[]) {
      const mots = String(l.libelle).split(" ");
      await sql`INSERT INTO trottinettes (client_id, marque, modele, serie) VALUES (${clientId}, ${mots[0] || "Trottinette"}, ${String(l.libelle).slice(0, 80)}, ${serie}) ON CONFLICT (client_id, serie) DO NOTHING`;
    }
  }
  for (const d of deduits) {
    await sql`INSERT INTO vente_acomptes (vente_id, acompte_id, montant_cents) VALUES (${v.id}, ${d.id}, ${d.cents})`;
    await sql`UPDATE ventes SET utilise_cents = utilise_cents + ${d.cents} WHERE id = ${d.id}`;
  }
  for (const a of appliques) {
    await sql`INSERT INTO vente_avantages (vente_id, avantage_id, libelle, effet, remise_cents) VALUES (${v.id}, ${a.id}, ${a.libelle}, ${a.effet}, ${a.cents})`;
  }
  for (const pa of paiements) {
    await sql`INSERT INTO vente_paiements (vente_id, moyen, montant_cents) VALUES (${v.id}, ${pa.moyen}, ${pa.cents})`;
  }
  if (reparationId) {
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${reparationId}, 'caisse', ${`Encaissement de ${(totalCents / 100).toFixed(2)} €${signature(c)}`})`;
  }
  if (await commandesActives()) await creerCommandeShopify(v.id);
  if (clientId) void envoyerAvis(v.id);
  const [vv] = (await sql`SELECT v.*, trim(cl.prenom || ' ' || cl.nom) AS client_nom FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id WHERE v.id = ${v.id}`) as any[];
  return c.json({ id: v.id, message: "Vente enregistrée." + (renduCents ? " Monnaie à rendre au client : " + (renduCents / 100).toFixed(2).replace(".", ",") + " €." : ""), renduCents, totalCents, remiseCents, vente: await detailVente(vv) });
});

// Envoi du reçu / de la facture par email (texte du ticket fourni par l'écran, adresse = client de la vente ou saisie).
app.post("/api/caisse/email", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.venteId);
  const texte = String(b.texte ?? "").slice(0, 8000);
  const [v] = (await sql`SELECT v.id, v.reparation_id, v.shopify_order_id, v.shopify_order_name, cl.email FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id WHERE v.id = ${id}`) as any[];
  if (!v) throw new AppError(404, "Vente introuvable.");
  const a = String(b.a ?? "").trim() || String(v.email ?? "").trim();
  if (!a) throw new AppError(422, "Pas d'email pour ce client : saisis une adresse.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)) throw new AppError(400, "Adresse email invalide.");
  // Vente déjà dans Shopify : Shopify envoie lui-même la facture (pas besoin de Brevo).
  if (v.shopify_order_id) {
    try {
      const d = await shopifyMutate(`mutation($id: ID!, $email: EmailInput) { orderInvoiceSend(id: $id, email: $email) { userErrors { message } } }`, { id: v.shopify_order_id, email: { to: a } });
      const errs = d?.orderInvoiceSend?.userErrors ?? [];
      if (!errs.length) {
        if (v.reparation_id) await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${v.reparation_id}, 'note', ${`Facture ${v.shopify_order_name ?? ""} envoyée par Shopify à ${a}${signature(c)}`})`;
        return c.json({ message: "Facture " + (v.shopify_order_name ?? "") + " envoyée à " + a + " par Shopify." });
      }
      console.log(JSON.stringify({ event: "facture-shopify", venteId: id, message: errs[0].message }));
    } catch (e: any) { console.log(JSON.stringify({ event: "facture-shopify", venteId: id, message: String(e?.message ?? e).slice(0, 200) })); }
  }
  if (!texte) throw new AppError(400, "Reçu vide.");
  if (!brevoConfigure()) throw new AppError(503, "Les emails ne sont pas encore branchés (Brevo) : rien n'a été envoyé.");
  await envoiEmail(a, "Ton reçu TURN Shop", "Bonjour,\n\nVoici ton reçu / ta facture TURN Shop :\n\n" + texte + "\n\nMerci de ta visite !\nL'équipe TURN Shop");
  if (v.reparation_id) await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${v.reparation_id}, 'note', ${`Reçu / facture envoyé par email à ${a}${signature(c)}`})`;
  return c.json({ message: "Reçu envoyé à " + a + "." });
});

// ---- Facture consultable en ligne (lien signé, sans mot de passe) ----
const cleFacture = (id: number) => createHmac("sha256", Bun.env.ESPACE_SECRET || Bun.env.ATELIER_PASSWORD || "facture").update(`facture|${id}`).digest("hex").slice(0, 24);
export const lienFacture = (id: number) => `${(Bun.env.PUBLIC_URL || "https://atelier-turnshop-production.up.railway.app").replace(/\/$/, "")}/pub/facture/${id}-${cleFacture(id)}`;
const escF = (t: any) => String(t ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]!);
const eurF = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " €";
const MOYF: Record<string, string> = { carte: "Carte", especes: "Espèces", virement: "Virement", en_ligne: "En ligne", bon_achat: "Bon d'achat" };

app.get("/pub/facture/:token", async (c) => {
  const [idS, cle] = String(c.req.param("token") ?? "").split("-");
  const id = Number(idS);
  if (!(id > 0) || !cle || cle !== cleFacture(id)) return c.html("<p style='font-family:sans-serif;padding:24px'>Lien invalide.</p>", 404);
  const [v] = (await sql`SELECT v.*, trim(cl.prenom || ' ' || cl.nom) AS client_nom FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id WHERE v.id = ${id}`) as any[];
  if (!v) return c.html("<p style='font-family:sans-serif;padding:24px'>Facture introuvable.</p>", 404);
  const d: any = await detailVente(v);
  const numero = d.numero ?? `Ticket n° ${d.id}`;
  const date = new Date(d.date).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  const lignes = d.lignes.map((l: any) => `<tr><td>${escF(l.quantite)} × ${escF(l.libelle)}</td><td class="n">${eurF(l.quantite * l.prixCents)}</td></tr>`).join("");
  const rem = (d.fideliteCents ? `<tr><td>Cagnotte fidélité</td><td class="n">-${eurF(d.fideliteCents)}</td></tr>` : "")
    + d.avantages.map((a: any) => `<tr><td>${escF(a.libelle)}</td><td class="n">${a.remiseCents ? "-" + eurF(a.remiseCents) : "offert"}</td></tr>`).join("")
    + (d.acompteDeduitCents ? `<tr><td>Acompte déjà versé</td><td class="n">-${eurF(d.acompteDeduitCents)}</td></tr>` : "");
  const pays = d.paiements.map((p: any) => `<tr><td>${escF(MOYF[p.moyen] ?? p.moyen)}</td><td class="n">${eurF(p.cents)}</td></tr>`).join("");
  const ent = String(d.ticket?.entete ?? "TURN SOCIETY").split("\n").map(escF).join("<br>");
  const tva = Math.round(d.totalCents / 6);
  const ht = d.totalCents - tva;
  const lignesH = d.lignes.map((l: any) => `<tr><td>${escF(l.libelle)}${(l.series ?? []).length ? `<div class="m">N° de série : ${l.series.map(escF).join(", ")}</div>` : ""}</td><td class="q">${escF(l.quantite)}</td><td class="n">${eurF(l.prixCents)}</td><td class="n">${eurF(l.quantite * l.prixCents)}</td></tr>`).join("");
  const remH = (d.fideliteCents ? `<tr><td colspan="3">Cagnotte fidélité</td><td class="n">-${eurF(d.fideliteCents)}</td></tr>` : "")
    + d.avantages.map((a: any) => `<tr><td colspan="3">${escF(a.libelle)}</td><td class="n">${a.remiseCents ? "-" + eurF(a.remiseCents) : "offert"}</td></tr>`).join("")
    + (d.acompteDeduitCents ? `<tr><td colspan="3">Acompte déjà versé</td><td class="n">-${eurF(d.acompteDeduitCents)}</td></tr>` : "");
  const paysH = d.paiements.map((p: any) => `<span class="pill">${escF(MOYF[p.moyen] ?? p.moyen)} · ${eurF(p.cents)}</span>`).join("");
  return c.html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Facture ${escF(numero)}</title>
<style>*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#eceeea;margin:0;color:#1a1a1a;-webkit-text-size-adjust:100%}main{max-width:720px;margin:24px auto;padding:0 12px}.page{background:#fff;border-radius:12px;box-shadow:0 2px 14px rgba(0,0,0,.08);overflow:hidden}.top{background:#1c5a34;color:#fff;padding:26px 28px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}.top h1{margin:0;font-size:26px;letter-spacing:2px}.top .nb{font-size:15px;opacity:.9;margin-top:6px}.top .ent{font-size:13px;line-height:1.5;text-align:right;opacity:.95}.body{padding:24px 28px}.meta{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px}.meta .k{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#777;margin-bottom:4px}.meta .v{font-size:15px;line-height:1.5}table{width:100%;border-collapse:collapse}th{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#777;text-align:left;padding:8px 6px;border-bottom:2px solid #1c5a34}td{padding:11px 6px;border-bottom:1px solid #eee;font-size:14px;vertical-align:top}.n{text-align:right;white-space:nowrap}.q{text-align:center;width:44px}th.n{text-align:right}th.q{text-align:center}.tot{margin:18px 0 0 auto;width:280px;max-width:100%}.tot div{display:flex;justify-content:space-between;padding:5px 0;font-size:14px;color:#555}.tot .g{border-top:2px solid #1c5a34;margin-top:6px;padding-top:10px;font-size:20px;font-weight:700;color:#1a1a1a}.paid{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:24px;padding:14px 16px;background:#eef6f0;border-radius:10px}.paid b{color:#1c5a34;font-size:15px}.pill{background:#fff;border:1px solid #cfe3d6;border-radius:99px;padding:4px 12px;font-size:13px}.foot{padding:16px 28px 22px;font-size:11px;color:#888;line-height:1.5;border-top:1px solid #eee}button{display:block;margin:16px auto 0;background:#1c5a34;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:15px;cursor:pointer}@media(max-width:520px){.top .ent{text-align:left}.body,.top{padding-left:18px;padding-right:18px}}@media print{body{background:#fff}main{margin:0;max-width:none}.page{box-shadow:none;border-radius:0}button{display:none}.top{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><main><div class="page">
<div class="top"><div><h1>FACTURE</h1><div class="nb">${escF(numero)}</div></div><div class="ent">${ent}</div></div>
<div class="body"><div class="meta"><div><div class="k">Date</div><div class="v">${date}</div></div>${d.client ? `<div><div class="k">Client</div><div class="v">${escF(d.client)}</div></div>` : ""}</div>
<table><thead><tr><th>Désignation</th><th class="q">Qté</th><th class="n">P.U. TTC</th><th class="n">Total TTC</th></tr></thead><tbody>${lignesH}${remH}</tbody></table>
<div class="tot"><div><span>Total HT</span><span>${eurF(ht)}</span></div><div><span>TVA 20 %</span><span>${eurF(tva)}</span></div><div class="g"><span>Total TTC</span><span>${eurF(d.totalCents)}</span></div></div>
<div class="paid"><b>✓ Facture réglée</b>${paysH}</div></div>
<div class="foot">TURN SOCIETY SARL · SIRET 912 779 352 00026 · TVA 20 % incluse dans les prix. Merci de votre confiance !</div></div>
<button onclick="window.print()">Imprimer / enregistrer en PDF</button></main></body></html>`);
});

// Demande d'avis envoyée directement par email (Brevo), sans ouvrir la messagerie.
app.post("/api/caisse/avis", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const [v] = (await sql`SELECT v.id, v.client_id, v.magasin, v.reparation_id, cl.prenom, cl.email FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id WHERE v.id = ${Number(b.venteId)}`) as any[];
  if (!v) throw new AppError(404, "Vente introuvable.");
  const a = String(v.email ?? "").trim();
  if (!a) throw new AppError(422, "Ce client n'a pas d'email.");
  if (!brevoConfigure()) throw new AppError(503, "Les emails ne sont pas branchés (Brevo).");
  const { avisUrl } = await infosTicket(v.magasin ?? null);
  if (!avisUrl) throw new AppError(422, "Aucun lien d'avis Google n'est réglé (Paramètres > Ticket de caisse).");
  const prenom = String(v.prenom ?? "").trim();
  await envoiEmail(a, "Votre avis sur TURN Shop", `Bonjour${prenom ? " " + prenom : ""}, merci pour votre visite chez TURN Shop ! Votre avis nous aide beaucoup, et une récompense vous attend : ${avisUrl}\n\nL'équipe TURN Shop`);
  await sql`INSERT INTO messages_envoyes (type, canal, client_id, reparation_id, vente_id, destinataire, statut) VALUES ('avis', 'email', ${v.client_id}, ${v.reparation_id ?? null}, ${v.id}, ${a}, 'envoye')`;
  return c.json({ message: "Demande d'avis envoyée à " + a + "." });
});
