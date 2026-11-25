import { app } from "../app";
import { sql } from "../db";
import "./auth";
import { AppError, clean, signature } from "../util";
import { shopifyMutate } from "../shopify";

// ---------- Dépôt-vente de trottinettes ----------
// Commission boutique : 50 € + 10 % du prix de vente (modifiable par dépôt).
// Obligation : révision + remplacement des pièces en état critique (une prise en charge est créée au dépôt).
await sql`CREATE TABLE IF NOT EXISTS depots_vente (
  id SERIAL PRIMARY KEY,
  client_id INT NOT NULL REFERENCES clients(id),
  trottinette_id INT REFERENCES trottinettes(id),
  reparation_id INT REFERENCES reparations(id),
  marque TEXT NOT NULL DEFAULT '', modele TEXT NOT NULL DEFAULT '', annee TEXT NOT NULL DEFAULT '', km TEXT NOT NULL DEFAULT '',
  etat TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', emplacement TEXT NOT NULL DEFAULT '',
  prix_cents INT NOT NULL DEFAULT 0,
  commission_fixe_cents INT NOT NULL DEFAULT 5000, commission_pct NUMERIC NOT NULL DEFAULT 10,
  frais_remise_cents INT,
  statut TEXT NOT NULL DEFAULT 'revision' CHECK (statut IN ('revision','en_vente','vendu','reverse','retire')),
  shopify_product_id TEXT, shopify_url TEXT,
  vente_id INT, prix_vendu_cents INT, vendu_le TIMESTAMPTZ,
  reverse_le TIMESTAMPTZ, reverse_par TEXT, reverse_moyen TEXT, reverse_cents INT,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now(), cree_par TEXT NOT NULL DEFAULT ''
)`;

const pcn = (id: number) => "PC-" + String(id).padStart(4, "0");
const cents = (x: any) => Math.round((Number(String(x ?? "").replace(",", ".")) || 0) * 100);

export async function vueDepot(r: any) { return vue(r); }
async function vue(r: any) {
  let frais = r.frais_remise_cents as number | null;
  let fraisAuto = false;
  if (frais === null && r.reparation_id) {
    const [d] = (await sql`SELECT COALESCE(sum(quantite * prix_unitaire_cents), 0)::int AS t FROM devis_lignes WHERE reparation_id = ${r.reparation_id}`) as any[];
    frais = d.t; fraisAuto = true;
  }
  frais = frais ?? 0;
  const base = r.prix_vendu_cents ?? r.prix_cents;
  const commission = r.commission_fixe_cents + Math.round((base * Number(r.commission_pct)) / 100);
  return {
    id: r.id, clientId: r.client_id, client: `${r.prenom ?? ""} ${r.nom ?? ""}`.trim(), telephone: r.telephone ?? "",
    marque: r.marque, modele: r.modele, annee: r.annee, km: r.km, etat: r.etat, note: r.note, emplacement: r.emplacement,
    prixCents: r.prix_cents, fixeCents: r.commission_fixe_cents, pct: Number(r.commission_pct),
    fraisCents: frais, fraisAuto, commissionCents: commission, reverserCents: Math.max(0, base - commission - frais),
    statut: r.statut, repairId: r.reparation_id, numero: r.reparation_id ? pcn(r.reparation_id) : "",
    shopifyUrl: r.shopify_url ?? "", shopifyId: r.shopify_product_id ?? "",
    venduLe: r.vendu_le, prixVenduCents: r.prix_vendu_cents, reverseLe: r.reverse_le, reversePar: r.reverse_par ?? "", reverseCents: r.reverse_cents, creeLe: r.cree_le,
  };
}

app.get("/api/depots", async (c) => {
  const rows = (await sql`SELECT d.*, cl.prenom, cl.nom, cl.telephone FROM depots_vente d JOIN clients cl ON cl.id = d.client_id ORDER BY d.id DESC LIMIT 300`) as any[];
  return c.json({ depots: await Promise.all(rows.map(vue)) });
});

app.post("/api/depots", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const clientId = Number(b.clientId);
  const [cl] = (await sql`SELECT id FROM clients WHERE id = ${clientId}`) as any[];
  if (!cl) throw new AppError(400, "Choisis le déposant.");
  const prix = cents(b.prix);
  if (prix <= 0) throw new AppError(400, "Indique le prix de vente souhaité.");
  let marque = clean(b.marque, 80), modele = clean(b.modele, 120), trottId = Number(b.trottinetteId) || 0;
  if (trottId) {
    const [t] = (await sql`SELECT marque, modele FROM trottinettes WHERE id = ${trottId} AND client_id = ${clientId}`) as any[];
    if (!t) throw new AppError(400, "Trottinette inconnue pour ce client.");
    marque = t.marque; modele = t.modele;
  } else {
    if (!marque || !modele) throw new AppError(400, "Marque et modèle obligatoires.");
    const [t] = (await sql`INSERT INTO trottinettes (client_id, marque, modele, serie) VALUES (${clientId}, ${marque}, ${modele}, ${"DV-" + Date.now()}) RETURNING id`) as any[];
    trottId = t.id;
  }
  const date = new Date().toISOString().slice(0, 10);
  const panne = "Dépôt-vente : révision complète obligatoire + remplacement de toutes les pièces en état critique";
  const [r] = (await sql`INSERT INTO reparations (client_id, trottinette_id, panne, etat, remarques, date_depot, en_magasin, sous_garantie) VALUES (${clientId}, ${trottId}, ${panne}, ${clean(b.etat, 500)}, ${"Trottinette en dépôt-vente. " + clean(b.note, 500)}, ${date}, true, false) RETURNING id`) as any[];
  const [d] = (await sql`INSERT INTO depots_vente (client_id, trottinette_id, reparation_id, marque, modele, annee, km, etat, note, emplacement, prix_cents, cree_par)
    VALUES (${clientId}, ${trottId}, ${r.id}, ${marque}, ${modele}, ${clean(b.annee, 20)}, ${clean(b.km, 20)}, ${clean(b.etat, 500)}, ${clean(b.note, 1000)}, ${clean(b.emplacement, 80)}, ${prix}, ${c.get("user")?.prenom ?? ""}) RETURNING id`) as any[];
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${r.id}, 'note', ${`Dépôt-vente DV-${d.id} : prix souhaité ${(prix / 100).toFixed(2)} €. Révision obligatoire + pièces critiques${signature(c)}`})`;
  return c.json({ message: `Dépôt enregistré. Prise en charge ${pcn(r.id)} créée pour la révision.`, id: d.id, repairId: r.id });
});

app.post("/api/depots/maj", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const [d] = (await sql`SELECT * FROM depots_vente WHERE id = ${id}`) as any[];
  if (!d) throw new AppError(404, "Dépôt introuvable.");
  const prix = b.prix !== undefined ? cents(b.prix) : d.prix_cents;
  const fixe = b.fixe !== undefined ? cents(b.fixe) : d.commission_fixe_cents;
  const pct = b.pct !== undefined ? Math.max(0, Math.min(100, Number(String(b.pct).replace(",", ".")) || 0)) : Number(d.commission_pct);
  const frais = b.frais === undefined ? d.frais_remise_cents : (b.frais === "" || b.frais === null ? null : cents(b.frais));
  const statuts = ["revision", "en_vente", "retire"];
  const statut = b.statut && statuts.includes(b.statut) && !["vendu", "reverse"].includes(d.statut) ? b.statut : d.statut;
  const emp = b.emplacement !== undefined ? clean(b.emplacement, 80) : d.emplacement;
  const note = b.note !== undefined ? clean(b.note, 1000) : d.note;
  if (prix <= 0) throw new AppError(400, "Prix invalide.");
  await sql`UPDATE depots_vente SET prix_cents = ${prix}, commission_fixe_cents = ${fixe}, commission_pct = ${pct}, frais_remise_cents = ${frais}, statut = ${statut}, emplacement = ${emp}, note = ${note} WHERE id = ${id}`;
  return c.json({ message: "Enregistré." });
});

// Marque un dépôt comme vendu (appelé par la caisse quand une ligne « DV#id » est encaissée).
export async function depotVendu(depotId: number, venteId: number, prixCents: number) {
  await sql`UPDATE depots_vente SET statut = 'vendu', vente_id = ${venteId}, prix_vendu_cents = ${prixCents}, vendu_le = now() WHERE id = ${depotId} AND statut IN ('revision','en_vente')`;
  const [d] = (await sql`SELECT reparation_id FROM depots_vente WHERE id = ${depotId}`) as any[];
  if (d?.reparation_id) await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${d.reparation_id}, 'note', ${`Dépôt-vente DV-${depotId} vendu ${(prixCents / 100).toFixed(2)} € (vente n°${venteId})`})`;
}

app.post("/api/depots/reverser", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const [r] = (await sql`SELECT d.*, cl.prenom, cl.nom, cl.telephone FROM depots_vente d JOIN clients cl ON cl.id = d.client_id WHERE d.id = ${id}`) as any[];
  if (!r || r.statut !== "vendu") throw new AppError(400, "Ce dépôt n'est pas vendu, ou déjà reversé.");
  const v = await vue(r);
  const moyen = ["virement", "especes", "cheque"].includes(b.moyen) ? b.moyen : "virement";
  await sql`UPDATE depots_vente SET statut = 'reverse', reverse_le = now(), reverse_par = ${c.get("user")?.prenom ?? ""}, reverse_moyen = ${moyen}, reverse_cents = ${v.reverserCents} WHERE id = ${id}`;
  if (r.reparation_id) await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${r.reparation_id}, 'note', ${`Dépôt-vente DV-${id} : ${(v.reverserCents / 100).toFixed(2)} € reversés au déposant (${moyen})${signature(c)}`})`;
  return c.json({ message: `Reversement de ${(v.reverserCents / 100).toFixed(2).replace(".", ",")} € enregistré.` });
});

// Fiche produit Shopify en brouillon, dans la collection « Dépôt-vente » (créée au premier usage).
app.post("/api/depots/shopify", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const [r] = (await sql`SELECT * FROM depots_vente WHERE id = ${id}`) as any[];
  if (!r) throw new AppError(404, "Dépôt introuvable.");
  if (r.shopify_product_id) throw new AppError(400, "La fiche Shopify existe déjà.");
  let coll: string | undefined;
  const [p] = (await sql`SELECT valeur FROM parametres WHERE cle = 'depot_collection_gid'`) as any[];
  coll = p?.valeur;
  try {
    if (!coll) {
      const d = await shopifyMutate(`mutation($i: CollectionInput!) { collectionCreate(input: $i) { collection { id } userErrors { message } } }`, { i: { title: "Dépôt-vente", descriptionHtml: "<p>Trottinettes d'occasion en dépôt-vente, révisées par TURN Shop.</p>" } });
      const e = d.collectionCreate.userErrors?.[0]?.message;
      if (e) throw new Error(e);
      coll = d.collectionCreate.collection.id;
      await sql`INSERT INTO parametres (cle, valeur, maj_le) VALUES ('depot_collection_gid', ${coll}, now()) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, maj_le = now()`;
    }
    const titre = `${r.marque} ${r.modele} (occasion, dépôt-vente)`.trim();
    const html = `<p>Trottinette d'occasion en dépôt-vente, révisée par nos techniciens.</p><ul>${r.annee ? `<li>Année : ${r.annee}</li>` : ""}${r.km ? `<li>Kilométrage : ${r.km}</li>` : ""}${r.etat ? `<li>État : ${r.etat}</li>` : ""}</ul>${r.note ? `<p>${r.note}</p>` : ""}`;
    const d2 = await shopifyMutate(`mutation($p: ProductCreateInput!) { productCreate(product: $p) { product { id onlineStoreUrl handle variants(first: 1) { nodes { id } } } userErrors { message } } }`, { p: { title: titre, descriptionHtml: html, status: "DRAFT", vendor: r.marque || "Dépôt-vente", productType: "Trottinette d'occasion", tags: ["dépôt-vente", "occasion"], collectionsToJoin: [coll] } });
    const e2 = d2.productCreate.userErrors?.[0]?.message;
    if (e2) throw new Error(e2);
    const prod = d2.productCreate.product;
    const vid = prod.variants.nodes[0]?.id;
    if (vid) {
      const d3 = await shopifyMutate(`mutation($p: ID!, $v: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $p, variants: $v) { userErrors { message } } }`, { p: prod.id, v: [{ id: vid, price: (r.prix_cents / 100).toFixed(2) }] });
      const e3 = d3.productVariantsBulkUpdate.userErrors?.[0]?.message;
      if (e3) throw new Error(e3);
    }
    const num = prod.id.split("/").pop();
    const admin = `https://${(Bun.env.SHOPIFY_STORE_DOMAIN ?? "").replace(/^https?:\/\//, "")}/admin/products/${num}`;
    await sql`UPDATE depots_vente SET shopify_product_id = ${prod.id}, shopify_url = ${admin} WHERE id = ${id}`;
    return c.json({ message: "Fiche Shopify créée en brouillon dans la collection « Dépôt-vente ». Ajoute les photos puis publie-la.", url: admin });
  } catch (e: any) {
    throw new AppError(400, "Shopify : " + (e?.message ?? e) + " (si c'est un problème de droits, l'app doit avoir le droit d'écrire les produits).");
  }
});
