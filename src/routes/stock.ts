import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { AppError, clean } from "../util";
import { shopifyRead, shopifyMutate } from "../shopify";

// Stock maison : pièces et produits qui ne sont pas (ou pas encore) dans le catalogue Shopify.
await sql`CREATE TABLE IF NOT EXISTS stock_produits (id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, nom TEXT NOT NULL, prix_cents INT NOT NULL DEFAULT 0, achat_ht_cents INT, qte INT NOT NULL DEFAULT 0, emplacement TEXT NOT NULL DEFAULT '', archive_le TIMESTAMPTZ, cree_le TIMESTAMPTZ NOT NULL DEFAULT now(), maj_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`ALTER TABLE stock_produits ADD COLUMN IF NOT EXISTS magasin TEXT NOT NULL DEFAULT 'Amiens'`;
await sql`ALTER TABLE stock_produits ADD COLUMN IF NOT EXISTS stock_min INT NOT NULL DEFAULT 0`;
await sql`ALTER TABLE stock_produits DROP CONSTRAINT IF EXISTS stock_produits_code_key`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS stock_code_mag ON stock_produits (code, magasin)`;
await sql`CREATE TABLE IF NOT EXISTS stock_mouvements (id SERIAL PRIMARY KEY, produit_id INT NOT NULL REFERENCES stock_produits(id), delta INT NOT NULL, motif TEXT NOT NULL DEFAULT '', cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;

const cents = (x: any): number | null => {
  const s = String(x ?? "").replace(",", ".").replace(/[^0-9.]/g, "");
  if (!s) return null;
  const n = Math.round(Number(s) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const emp = (x: any) => clean(x, 20).toUpperCase().replace(/\s+/g, "");
const codeNet = (x: any) => clean(x, 60).replace(/\s+/g, "");

// Stock par boutique : celle demandée, sinon celle du profil connecté, sinon Amiens.
const mag = (c: any, b: any = {}) => { const m = clean(b.magasin ?? c.req.query("magasin"), 20); return m === "Rouen" || m === "Amiens" ? m : c.get("user")?.magasin === "Rouen" ? "Rouen" : "Amiens"; };

// Produit du catalogue Shopify à partir d'un code-barres / SKU (nom, prix TTC, prix d'achat HT si Shopify le donne).
async function shopifyParCode(code: string) {
  try {
    const t = code.replace(/["\\]/g, "");
    let d: any;
    try { d = await shopifyRead(`query($q: String!) { products(first: 3, query: $q) { nodes { title variants(first: 50) { nodes { title sku barcode price inventoryItem { unitCost { amount } } } } } } }`, { q: `barcode:${t} OR sku:${t}` }); }
    catch { d = await shopifyRead(`query($q: String!) { products(first: 3, query: $q) { nodes { title variants(first: 50) { nodes { title sku barcode price } } } } }`, { q: `barcode:${t} OR sku:${t}` }); }
    for (const p of d?.products?.nodes ?? []) {
      const v = (p.variants?.nodes ?? []).find((x: any) => (x.barcode ?? "").toLowerCase() === code.toLowerCase() || (x.sku ?? "").toLowerCase() === code.toLowerCase());
      if (v) {
        const vt = v.title && v.title !== "Default Title" ? ` - ${v.title}` : "";
        const cost = v.inventoryItem?.unitCost?.amount;
        return { nom: `${p.title}${vt}`.slice(0, 200), prixCents: Math.round(Number(v.price ?? 0) * 100), achatHtCents: cost != null ? Math.round(Number(cost) * 100) : null };
      }
    }
  } catch { /* Shopify indisponible */ }
  return null;
}

// EAN-13 : 12 chiffres + clé de contrôle. Les codes générés par l'atelier commencent par 200 (plage réservée à l'usage interne).
const cleEan = (d12: string) => { let t = 0; for (let i = 0; i < 12; i++) t += Number(d12[i]) * (i % 2 ? 3 : 1); return String((10 - (t % 10)) % 10); };
export const eanValide = (c: string) => /^\d{13}$/.test(c) && cleEan(c.slice(0, 12)) === c[12];
const eanInterne = (id: number) => { const d = "200" + String(id).padStart(9, "0"); return d + cleEan(d); };

const vue = (p: any) => ({ id: p.id, code: p.code, nom: p.nom, prixCents: p.prix_cents, achatHtCents: p.achat_ht_cents, qte: p.qte, min: p.stock_min, emplacement: p.emplacement, archive: !!p.archive_le });

// Création / entrée en stock : un seul geste. Code vide = code interne généré (TS-000123).
// Si le code existe déjà (même archivé), on ajoute la quantité et on met à jour les infos renseignées.
export async function entreeStock(b: { min?: any; code?: any; nom?: any; prix?: any; achat?: any; qte?: any; emplacement?: any }, motif = "Entrée en stock", magasin = "Amiens") {
  const nom = clean(b.nom, 200);
  const code = codeNet(b.code);
  const qte = Math.max(1, Math.min(9999, Math.round(Number(b.qte) || 1)));
  const prix = cents(b.prix), achat = cents(b.achat), lieu = emp(b.emplacement);
  const min = b.min === undefined || String(b.min).trim() === "" ? null : Math.max(0, Math.min(9999, Math.round(Number(b.min) || 0)));
  let p: any;
  if (code) [p] = (await sql`SELECT * FROM stock_produits WHERE code = ${code} AND magasin = ${magasin}`) as any[];
  if (p) {
    [p] = (await sql`UPDATE stock_produits SET qte = qte + ${qte}, archive_le = NULL, nom = ${nom || p.nom}, prix_cents = ${prix ?? p.prix_cents}, achat_ht_cents = ${achat ?? p.achat_ht_cents}, emplacement = ${lieu || p.emplacement}, stock_min = ${min ?? p.stock_min}, maj_le = now() WHERE id = ${p.id} RETURNING *`) as any[];
  } else {
    if (!nom) throw new AppError(400, "Indique le nom du produit.");
    [p] = (await sql`INSERT INTO stock_produits (code, nom, prix_cents, achat_ht_cents, qte, emplacement, magasin, stock_min) VALUES (${code || "tmp" + Date.now() + Math.random()}, ${nom}, ${prix ?? 0}, ${achat}, ${qte}, ${lieu}, ${magasin}, ${min ?? 0}) RETURNING *`) as any[];
    if (!code) [p] = (await sql`UPDATE stock_produits SET code = ${eanInterne(p.id)} WHERE id = ${p.id} RETURNING *`) as any[];
  }
  await sql`INSERT INTO stock_mouvements (produit_id, delta, motif) VALUES (${p.id}, ${qte}, ${motif})`;
  return p;
}

app.get("/api/stock", async (c) => {
  const q = clean(c.req.query("q"), 60).toLowerCase();
  const m = mag(c);
  const rows = (await sql`SELECT * FROM stock_produits WHERE archive_le IS NULL AND magasin = ${m} ORDER BY emplacement, nom LIMIT 1000`) as any[];
  const f = rows.filter((p) => !q || `${p.nom} ${p.code} ${p.emplacement}`.toLowerCase().includes(q)).slice(0, 300);
  const lieux = [...new Set(rows.map((p) => p.emplacement).filter(Boolean))].sort();
  const valeur = rows.reduce((t, p) => t + (p.achat_ht_cents ?? 0) * p.qte, 0);
  return c.json({ magasin: m, produits: f.map(vue), lieux, nb: rows.length, valeurAchatHtCents: valeur });
});

app.post("/api/stock/rapide", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const code = codeNet(b.code);
  if (code && !eanValide(code)) throw new AppError(400, /^\d{13}$/.test(code) ? "Code EAN-13 invalide (clé de contrôle fausse) : rescanne le produit." : "Il faut un code EAN-13 (13 chiffres). Laisse vide pour en générer un.");
  const p = await entreeStock(b, "Entrée en stock", mag(c, b));
  return c.json({ message: `${p.nom} : ${p.qte} en stock${p.emplacement ? " (" + p.emplacement + ")" : ""} · code ${p.code}`, produit: vue(p) });
});

app.post("/api/stock/maj", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const [p] = (await sql`SELECT * FROM stock_produits WHERE id = ${id}`) as any[];
  if (!p) throw new AppError(404, "Produit introuvable.");
  if (b.delta !== undefined) {
    const d = Math.round(Number(b.delta) || 0);
    const n = Math.max(0, p.qte + d);
    await sql`UPDATE stock_produits SET qte = ${n}, maj_le = now() WHERE id = ${id}`;
    await sql`INSERT INTO stock_mouvements (produit_id, delta, motif) VALUES (${id}, ${n - p.qte}, 'Ajustement')`;
  } else {
    await sql`UPDATE stock_produits SET nom = ${clean(b.nom, 200) || p.nom}, prix_cents = ${cents(b.prix) ?? p.prix_cents}, achat_ht_cents = ${b.achat === "" ? null : (cents(b.achat) ?? p.achat_ht_cents)}, emplacement = ${b.emplacement !== undefined ? emp(b.emplacement) : p.emplacement}, stock_min = ${b.min !== undefined && String(b.min).trim() !== "" ? Math.max(0, Math.round(Number(b.min) || 0)) : p.stock_min}, maj_le = now() WHERE id = ${id}`;
  }
  return c.json({ message: "Enregistré." });
});

app.post("/api/stock/archiver", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const [p] = (await sql`SELECT qte FROM stock_produits WHERE id = ${id}`) as any[];
  if (!p) throw new AppError(404, "Produit introuvable.");
  await sql`UPDATE stock_produits SET qte = 0, archive_le = now(), maj_le = now() WHERE id = ${id}`;
  if (p.qte) await sql`INSERT INTO stock_mouvements (produit_id, delta, motif) VALUES (${id}, ${-p.qte}, 'Retiré du stock')`;
  return c.json({ message: "Produit retiré du stock (récupérable en le rescannant)." });
});

// Un scan : le produit s'il existe (archivé ou non).
app.post("/api/stock/scan", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const code = codeNet(b.code);
  const [p] = (await sql`SELECT * FROM stock_produits WHERE code = ${code} AND magasin = ${mag(c, b)}`) as any[];
  if (p || b.local) return c.json({ produit: p ? vue(p) : null });
  return c.json({ produit: null, shopify: code ? await shopifyParCode(code) : null });
});

// Inventaire partiel d'un emplacement.
// scans = [{code, qte}] : ce qui a été compté dans le rayon. Sans "appliquer", simple aperçu.
//  - produit du rayon scanné : la quantité devient celle comptée
//  - produit du rayon NON scanné : retiré du stock (archivé, récupérable)
//  - produit scanné mais rangé ailleurs : déplacé dans ce rayon
//  - code inconnu : à créer (aperçu seulement)
app.post("/api/stock/inventaire", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const zone = emp(b.emplacement), m = mag(c, b);
  if (!zone) throw new AppError(400, "Indique l'emplacement ou le panneau inventorié (ex : A11, ou A pour tout le panneau A).");
  // « A » (lettres seules) = tout le panneau A (A11, A12, A22…) ; « A11 » = ce rayon seulement.
  const panneau = /^[A-Z]+$/.test(zone);
  const dans = (lieu: string) => (panneau ? lieu.startsWith(zone) : lieu === zone);
  const compte = new Map<string, number>(), lieuDe = new Map<string, string>();
  let sansLieu = 0;
  for (const s of Array.isArray(b.scans) ? b.scans.slice(0, 5000) : []) {
    const code = codeNet(s.code);
    if (!code) continue;
    compte.set(code, (compte.get(code) ?? 0) + Math.max(1, Math.round(Number(s.qte) || 1)));
    let l = emp(s.emplacement);
    if (!l || !dans(l)) { l = zone; if (panneau) sansLieu++; }
    if (!lieuDe.has(code)) lieuDe.set(code, l);
  }
  const attendus = ((await sql`SELECT * FROM stock_produits WHERE archive_le IS NULL AND magasin = ${m} AND emplacement <> ''`) as any[]).filter((p) => dans(p.emplacement));
  const connus = compte.size ? ((await sql`SELECT * FROM stock_produits WHERE magasin = ${m} AND code = ANY(${[...compte.keys()]})`) as any[]) : [];
  const parCode = new Map(connus.map((p) => [p.code, p]));
  const absents = attendus.filter((p) => !compte.has(p.code));
  const inconnus: any[] = [];
  for (const k of [...compte.keys()].filter((k) => !parCode.has(k))) {
    const sh = await shopifyParCode(k);
    inconnus.push({ code: k, qte: compte.get(k), vers: lieuDe.get(k), nom: sh?.nom ?? "", prixCents: sh?.prixCents ?? 0, achatHtCents: sh?.achatHtCents ?? null, shopify: !!sh });
  }
  const deplaces = connus.filter((p) => !p.archive_le && p.emplacement !== lieuDe.get(p.code));
  const revenus = connus.filter((p) => p.archive_le);
  const ecarts = connus.filter((p) => !p.archive_le && p.qte !== compte.get(p.code));
  const apercu = {
    emplacement: zone, panneau, scannes: connus.length, sansLieu,
    absents: absents.map(vue), inconnus,
    deplaces: deplaces.map((p) => ({ ...vue(p), vers: lieuDe.get(p.code) })),
    revenus: revenus.map(vue),
    ecarts: ecarts.map((p) => ({ ...vue(p), compte: compte.get(p.code) })),
  };
  if (!b.appliquer) return c.json({ apercu });
  for (const p of connus) {
    const n = compte.get(p.code)!, lieu = lieuDe.get(p.code)!;
    if (p.qte !== n || p.emplacement !== lieu || p.archive_le) {
      await sql`UPDATE stock_produits SET qte = ${n}, emplacement = ${lieu}, archive_le = NULL, maj_le = now() WHERE id = ${p.id}`;
      if (n !== p.qte) await sql`INSERT INTO stock_mouvements (produit_id, delta, motif) VALUES (${p.id}, ${n - p.qte}, ${"Inventaire " + zone})`;
    }
  }
  for (const p of absents) {
    await sql`UPDATE stock_produits SET qte = 0, archive_le = now(), maj_le = now() WHERE id = ${p.id}`;
    if (p.qte) await sql`INSERT INTO stock_mouvements (produit_id, delta, motif) VALUES (${p.id}, ${-p.qte}, ${"Inventaire " + zone + " : non retrouvé"})`;
  }
  // Codes inconnus mais présents dans le catalogue Shopify : créés tout seuls à l'endroit où ils ont été scannés.
  let crees = 0;
  for (const i of inconnus.filter((x) => x.shopify)) {
    await entreeStock({ code: i.code, nom: i.nom, prix: (i.prixCents / 100).toFixed(2), achat: i.achatHtCents == null ? "" : (i.achatHtCents / 100).toFixed(2), qte: i.qte, emplacement: i.vers }, "Inventaire " + zone, m);
    crees++;
  }
  const reste = inconnus.length - crees;
  return c.json({ message: `Inventaire ${panneau ? "panneau " : ""}${zone} (${m}) validé : ${connus.length} produit(s) comptés, ${crees} créé(s) depuis Shopify, ${absents.length} retiré(s), ${deplaces.length} déplacé(s).${reste ? " " + reste + " code(s) inconnu(s) à créer à la main." : ""}` });
});

// Produits sous leur stock minimum, avec la quantité à recommander (en tenant compte de ce qui est déjà au panier ou commandé).
app.get("/api/stock/reappro", async (c) => {
  const m = mag(c);
  const rows = (await sql`SELECT * FROM stock_produits WHERE archive_le IS NULL AND magasin = ${m} AND stock_min > 0 AND qte < stock_min ORDER BY nom`) as any[];
  const out = [];
  for (const p of rows) {
    const [e] = (await sql`SELECT COALESCE(sum(quantite), 0)::int AS n FROM commande_lignes WHERE reparation_id IS NULL AND statut IN ('panier','commandee') AND (sku = ${p.code} OR barcode = ${p.code})`) as any[];
    const aCommander = p.stock_min - p.qte - e.n;
    out.push({ id: p.id, code: p.code, nom: p.nom, qte: p.qte, min: p.stock_min, enCommande: e.n, aCommander: Math.max(0, aCommander), emplacement: p.emplacement });
  }
  return c.json({ magasin: m, produits: out.filter((x) => x.aCommander > 0), dejaCouverts: out.filter((x) => x.aCommander <= 0).length });
});

app.post("/api/stock/reappro/ajouter", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const [p] = (await sql`SELECT * FROM stock_produits WHERE id = ${Number(b.id)}`) as any[];
  if (!p) throw new AppError(404, "Produit introuvable.");
  const [f] = (await sql`SELECT id FROM fournisseurs WHERE id = ${Number(b.fournisseurId)} AND actif = true`) as any[];
  if (!f) throw new AppError(400, "Choisis un fournisseur.");
  const q = Math.max(1, Math.min(999, Math.round(Number(b.quantite) || 1)));
  await sql`INSERT INTO commande_lignes (fournisseur_id, libelle, sku, barcode, quantite) VALUES (${f.id}, ${p.nom}, ${p.code}, ${p.code}, ${q})`;
  return c.json({ message: `${q} x ${p.nom} ajouté au panier.` });
});

// Donne un EAN-13 interne (préfixe 201) aux variantes Shopify qui n'ont pas de code-barres, et l'écrit dans Shopify.
// Traite 100 variantes par appel ; on relance jusqu'à "restant: 0".
app.post("/api/stock/codes-shopify", async (c) => {
  const user = c.get("user") as any;
  if (user?.role !== "admin" && user?.role !== "responsable") throw new AppError(403, "Réservé au responsable.");
  const pris = new Set<string>();
  const sans: { id: string; productId: string }[] = [];
  let after: string | null = null;
  for (let i = 0; i < 60; i++) {
    const d: any = await shopifyRead(`query($after:String){productVariants(first:250,after:$after){pageInfo{hasNextPage endCursor} nodes{id barcode product{id}}}}`, { after });
    const pv = d.productVariants;
    for (const v of pv.nodes) { if (v.barcode) pris.add(String(v.barcode)); else sans.push({ id: v.id, productId: v.product.id }); }
    if (!pv.pageInfo.hasNextPage) break;
    after = pv.pageInfo.endCursor;
  }
  const lot = sans.slice(0, 100);
  const parProduit = new Map<string, { id: string; barcode: string }[]>();
  for (const v of lot) {
    let n = Number(String(v.id).replace(/\D/g, "").slice(-9));
    let code = "";
    for (;;) { const dd = "201" + String(n % 1e9).padStart(9, "0"); code = dd + cleEan(dd); if (!pris.has(code)) break; n++; }
    pris.add(code);
    if (!parProduit.has(v.productId)) parProduit.set(v.productId, []);
    parProduit.get(v.productId)!.push({ id: v.id, barcode: code });
  }
  let faits = 0;
  for (const [productId, variants] of parProduit) {
    const r: any = await shopifyMutate(`mutation($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$productId,variants:$variants){productVariants{id} userErrors{message}}}`, { productId, variants });
    const errs = r?.productVariantsBulkUpdate?.userErrors || [];
    if (errs.length) throw new AppError(502, "Shopify : " + errs[0].message);
    faits += variants.length;
  }
  return c.json({ faits, restant: sans.length - faits });
});

// Associe le code-barres du fournisseur (EAN lu sur le carton) à une variante Shopify : il est écrit dans Shopify.
app.post("/api/stock/associer-code", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const code = codeNet(b.code);
  const variantId = clean(b.variantId, 80);
  if (!/^\d{8,14}$/.test(code)) throw new AppError(400, "Scanne le code-barres (8 à 14 chiffres).");
  if (!/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(variantId)) throw new AppError(400, "Choisis un produit.");
  const dej: any = await shopifyRead(`query($q:String!){productVariants(first:3,query:$q){nodes{id displayName}}}`, { q: `barcode:${code}` });
  const autre = (dej?.productVariants?.nodes ?? []).find((v: any) => v.id !== variantId);
  if (autre && !b.force) return c.json({ conflit: true, message: `Ce code est déjà sur « ${autre.displayName} ». Remplacer quand même ?` });
  const v: any = await shopifyRead(`query($id:ID!){productVariant(id:$id){displayName barcode product{id}}}`, { id: variantId });
  if (!v?.productVariant) throw new AppError(404, "Variante introuvable.");
  const r: any = await shopifyMutate(`mutation($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$productId,variants:$variants){productVariants{id} userErrors{message}}}`, { productId: v.productVariant.product.id, variants: [{ id: variantId, barcode: code }] });
  const errs = r?.productVariantsBulkUpdate?.userErrors || [];
  if (errs.length) throw new AppError(502, "Shopify : " + errs[0].message);
  return c.json({ message: `Code ${code} enregistré sur « ${v.productVariant.displayName} ».` });
});

// Reprend les vrais codes-barres des fournisseurs déjà présents dans Shopify (métachamps Ewheel "codigo-alternativo")
// et les écrit dans le champ code-barres des variantes qui n'en ont pas. 100 variantes par appel.
const gs1Ok = (c: string) => {
  if (!/^\d+$/.test(c) || ![8, 12, 13, 14].includes(c.length)) return false;
  let t = 0;
  for (let i = 0; i < c.length - 1; i++) t += Number(c[c.length - 2 - i]) * (i % 2 ? 1 : 3);
  return (10 - (t % 10)) % 10 === Number(c[c.length - 1]);
};
app.post("/api/stock/codes-fournisseurs", async (c) => {
  const user = c.get("user") as any;
  if (user?.role !== "admin" && user?.role !== "responsable") throw new AppError(403, "Réservé au responsable.");
  const pris = new Set<string>();
  const aFaire: { id: string; productId: string; code: string }[] = [];
  let after: string | null = null, sans = 0;
  for (let i = 0; i < 120; i++) {
    const d: any = await shopifyRead(`query($after:String){productVariants(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{id barcode product{id a:metafield(namespace:"custom",key:"codigo-alternativo"){value} b:metafield(namespace:"custom",key:"codigo-alternativo-2"){value}}}}}`, { after });
    const pv = d.productVariants;
    for (const v of pv.nodes) {
      if (v.barcode) { pris.add(String(v.barcode)); continue; }
      const code = [v.product?.a?.value, v.product?.b?.value].map((x: any) => String(x ?? "").trim()).find(gs1Ok);
      if (code) aFaire.push({ id: v.id, productId: v.product.id, code }); else sans++;
    }
    if (!pv.pageInfo.hasNextPage) break;
    after = pv.pageInfo.endCursor;
  }
  const lot: typeof aFaire = [];
  let doublons = 0;
  for (const v of aFaire) {
    if (pris.has(v.code)) { doublons++; continue; }
    pris.add(v.code);
    if (lot.length < 100) lot.push(v);
  }
  const parProduit = new Map<string, { id: string; barcode: string }[]>();
  for (const v of lot) { if (!parProduit.has(v.productId)) parProduit.set(v.productId, []); parProduit.get(v.productId)!.push({ id: v.id, barcode: v.code }); }
  let faits = 0;
  for (const [productId, variants] of parProduit) {
    const r: any = await shopifyMutate(`mutation($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$productId,variants:$variants){productVariants{id} userErrors{message}}}`, { productId, variants });
    const errs = r?.productVariantsBulkUpdate?.userErrors || [];
    if (errs.length) throw new AppError(502, "Shopify : " + errs[0].message);
    faits += variants.length;
  }
  return c.json({ faits, restant: aFaire.length - doublons - faits, doublons, sansCode: sans });
});
