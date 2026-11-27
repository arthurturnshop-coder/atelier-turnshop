import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { AppError, clean } from "../util";
import { oublierJetonShopify, shopifyRead, shopifyMutate } from "../shopify";

// Stock maison : pièces et produits qui ne sont pas (ou pas encore) dans le catalogue Shopify.
await sql`CREATE TABLE IF NOT EXISTS stock_produits (id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, nom TEXT NOT NULL, prix_cents INT NOT NULL DEFAULT 0, achat_ht_cents INT, qte INT NOT NULL DEFAULT 0, emplacement TEXT NOT NULL DEFAULT '', archive_le TIMESTAMPTZ, cree_le TIMESTAMPTZ NOT NULL DEFAULT now(), maj_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`ALTER TABLE stock_produits ADD COLUMN IF NOT EXISTS magasin TEXT NOT NULL DEFAULT 'Amiens'`;
await sql`ALTER TABLE stock_produits ADD COLUMN IF NOT EXISTS stock_min INT NOT NULL DEFAULT 0`;
await sql`ALTER TABLE stock_produits DROP CONSTRAINT IF EXISTS stock_produits_code_key`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS stock_code_mag ON stock_produits (code, magasin)`;
await sql`CREATE TABLE IF NOT EXISTS stock_mouvements (id SERIAL PRIMARY KEY, produit_id INT NOT NULL REFERENCES stock_produits(id), delta INT NOT NULL, motif TEXT NOT NULL DEFAULT '', cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;

// Plusieurs codes-barres (EAN de grossistes différents) pour un même produit : un seul stock total.
await sql`CREATE TABLE IF NOT EXISTS stock_codes (id SERIAL PRIMARY KEY, produit_id INT NOT NULL REFERENCES stock_produits(id), code TEXT NOT NULL, fournisseur TEXT NOT NULL DEFAULT '', cree_le TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (produit_id, code))`;
await sql`CREATE INDEX IF NOT EXISTS stock_codes_code ON stock_codes (code)`;
// Dénomination libre d'un code (ex : « Fournisseur A - CST 8,5x2 »), affichée dans les alertes de commande.
await sql`ALTER TABLE stock_codes ADD COLUMN IF NOT EXISTS denomination TEXT NOT NULL DEFAULT ''`;

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

// Le produit d'un code scanné : son code principal ou l'un de ses codes supplémentaires.
export async function produitParCode(code: string, magasin: string): Promise<any | undefined> {
  if (!code) return undefined;
  const [p] = (await sql`SELECT * FROM stock_produits WHERE magasin = ${magasin} AND (code = ${code} OR id IN (SELECT produit_id FROM stock_codes WHERE code = ${code})) ORDER BY (code = ${code}) DESC, archive_le NULLS FIRST LIMIT 1`) as any[];
  return p;
}

// Code principal + codes supplémentaires d'un produit : toutes les références sous lesquelles on peut l'acheter.
async function codesDuProduit(p: any): Promise<string[]> {
  const cs = (await sql`SELECT code FROM stock_codes WHERE produit_id = ${p.id}`) as any[];
  return [p.code, ...cs.map((x) => x.code)];
}

// Avertissements « référence sœur » : la même pièce est-elle déjà au panier ou commandée chez un AUTRE fournisseur ?
// Un message par appel, avec les quantités par fournisseur et le stock actuel de la boutique.
export async function alertesSoeurs(o: { ref: string | null | undefined; fournisseurId: number; magasin: string }): Promise<string[]> {
  const ref = codeNet(o.ref);
  if (!ref) return [];
  const p = await produitParCode(ref, o.magasin);
  const codes = p ? await codesDuProduit(p) : [ref];
  const lignes = (await sql`SELECT l.quantite, l.statut, l.reparation_id, l.libelle, l.sku, l.barcode, f.nom AS fournisseur
    FROM commande_lignes l JOIN fournisseurs f ON f.id = l.fournisseur_id
    WHERE l.statut IN ('panier','commandee') AND l.fournisseur_id <> ${o.fournisseurId} AND (l.barcode = ANY(${codes}) OR l.sku = ANY(${codes}))
    ORDER BY f.nom, l.id`) as any[];
  if (!lignes.length) return [];
  const noms = p ? ((await sql`SELECT code, denomination FROM stock_codes WHERE produit_id = ${p.id} AND denomination <> ''`) as any[]) : [];
  const parF = new Map<string, string[]>();
  for (const l of lignes) {
    const nom = noms.find((x) => x.code === l.barcode || x.code === l.sku)?.denomination || l.libelle;
    const detail = `${l.quantite} × « ${nom} » (${l.statut === "commandee" ? "déjà commandé" : "dans le panier"}${l.reparation_id ? ", pour un client" : ""})`;
    parF.set(l.fournisseur, [...(parF.get(l.fournisseur) ?? []), detail]);
  }
  const txt = [...parF.entries()].map(([f, d]) => `chez ${f} : ${d.join(", ")}`).join(" ; ");
  return [`Attention, même pièce (référence sœur) ${txt}.${p ? ` Stock actuel ${o.magasin} : ${p.qte}.` : ""}`];
}
const vue = (p: any, codes: any[] = []) => ({ id: p.id, code: p.code, nom: p.nom, prixCents: p.prix_cents, achatHtCents: p.achat_ht_cents, qte: p.qte, min: p.stock_min, emplacement: p.emplacement, archive: !!p.archive_le, codes });

// Création / entrée en stock : un seul geste. Code vide = code interne généré (TS-000123).
// Si le code existe déjà (même archivé), on ajoute la quantité et on met à jour les infos renseignées.
export async function entreeStock(b: { min?: any; code?: any; nom?: any; prix?: any; achat?: any; qte?: any; emplacement?: any }, motif = "Entrée en stock", magasin = "Amiens") {
  const nom = clean(b.nom, 200);
  const code = codeNet(b.code);
  const qte = Math.max(1, Math.min(9999, Math.round(Number(b.qte) || 1)));
  const prix = cents(b.prix), achat = cents(b.achat), lieu = emp(b.emplacement);
  const min = b.min === undefined || String(b.min).trim() === "" ? null : Math.max(0, Math.min(9999, Math.round(Number(b.min) || 0)));
  let p: any;
  if (code) p = await produitParCode(code, magasin);
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
  const tous = (await sql`SELECT produit_id, code FROM stock_codes WHERE produit_id = ANY(${rows.map((p) => p.id).concat([0])})`) as any[];
  const alias = new Map<number, string[]>();
  for (const x of tous) alias.set(x.produit_id, [...(alias.get(x.produit_id) ?? []), x.code]);
  const qLieu = q.replace(/\s+/g, "").toUpperCase();
  const estLieu = /^[A-Z]{1,2}\d{0,3}$/.test(qLieu) && rows.some((p) => String(p.emplacement ?? "").toUpperCase().startsWith(qLieu));
  const f = estLieu ? rows.filter((p) => String(p.emplacement ?? "").toUpperCase().startsWith(qLieu)).slice(0, 300) : rows.filter((p) => !q || `${p.nom} ${p.code} ${p.emplacement} ${(alias.get(p.id) ?? []).join(" ")}`.toLowerCase().includes(q)).slice(0, 300);
  const lieux = [...new Set(rows.map((p) => p.emplacement).filter(Boolean))].sort();
  const valeur = rows.reduce((t, p) => t + (p.achat_ht_cents ?? 0) * p.qte, 0);
  const ac = f.length ? ((await sql`SELECT produit_id, code, fournisseur, denomination FROM stock_codes WHERE produit_id = ANY(${f.map((p) => p.id)}) ORDER BY id`) as any[]) : [];
  return c.json({ magasin: m, produits: f.map((p) => vue(p, ac.filter((x) => x.produit_id === p.id).map((x) => ({ code: x.code, fournisseur: x.fournisseur, denomination: x.denomination })))), lieux, nb: rows.length, valeurAchatHtCents: valeur });
});

app.post("/api/stock/rapide", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const code = codeNet(b.code);
  if (code && !eanValide(code)) throw new AppError(400, /^\d{13}$/.test(code) ? "Code EAN-13 invalide (clé de contrôle fausse) : rescanne le produit." : "Il faut un code EAN-13 (13 chiffres). Laisse vide pour en générer un.");
  const p = await entreeStock(b, "Entrée en stock", mag(c, b));
  return c.json({ message: `${p.nom} : ${p.qte} en stock${p.emplacement ? " (" + p.emplacement + ")" : ""} · code ${p.code}`, produit: vue(p) });
});

// Prix modifié depuis le panier d'étiquettes : met aussi à jour la fiche stock si le code existe.
app.post("/api/stock/prix-etiquette", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const code = clean(b.code, 80);
  const p = cents(b.prix);
  if (p === null || p === undefined) throw new AppError(400, "Prix invalide.");
  let maj = false;
  if (code) { const r = (await sql`UPDATE stock_produits SET prix_cents = ${p}, maj_le = now() WHERE code = ${code} RETURNING id`) as any[]; maj = r.length > 0; }
  return c.json({ maj });
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
  const p = await produitParCode(code, mag(c, b));
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
  const scansBruts = Array.isArray(b.scans) ? b.scans.slice(0, 5000) : [];
  const bruts = [...new Set(scansBruts.map((s: any) => codeNet(s.code)).filter(Boolean))] as string[];
  const canon = new Map<string, string>();
  if (bruts.length) for (const r of (await sql`SELECT sc.code AS alias, p.code AS canon FROM stock_codes sc JOIN stock_produits p ON p.id = sc.produit_id WHERE p.magasin = ${m} AND sc.code = ANY(${bruts}) AND NOT EXISTS (SELECT 1 FROM stock_produits q WHERE q.magasin = ${m} AND q.code = sc.code)`) as any[]) canon.set(r.alias, r.canon);
  for (const s of scansBruts) {
    const code = canon.get(codeNet(s.code)) ?? codeNet(s.code);
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
    absents: absents.map((x) => vue(x)), inconnus,
    deplaces: deplaces.map((p) => ({ ...vue(p), vers: lieuDe.get(p.code) })),
    revenus: revenus.map((x) => vue(x)),
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

// Ajoute un code-barres (EAN d'un autre grossiste) à un produit : il pointe vers le même stock.
app.post("/api/stock/code-ajouter", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const code = codeNet(b.code);
  if (!/^\d{8,14}$/.test(code)) throw new AppError(400, "Scanne le code-barres (8 à 14 chiffres).");
  const [p] = (await sql`SELECT * FROM stock_produits WHERE id = ${Number(b.id)}`) as any[];
  if (!p) throw new AppError(404, "Produit introuvable.");
  const autre = await produitParCode(code, p.magasin);
  if (autre && autre.id !== p.id) throw new AppError(409, `Ce code est déjà sur « ${autre.nom} ». Utilise « Fusionner » si c'est le même produit.`);
  if (autre) return c.json({ message: "Ce code est déjà sur ce produit." });
  await sql`INSERT INTO stock_codes (produit_id, code, fournisseur, denomination) VALUES (${p.id}, ${code}, ${clean(b.fournisseur, 60)}, ${clean(b.denomination, 120)})`;
  return c.json({ message: `Code ${code} ajouté à « ${p.nom} » : même stock (${p.qte}).` });
});

app.post("/api/stock/code-retirer", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  await sql`DELETE FROM stock_codes WHERE produit_id = ${Number(b.id)} AND code = ${codeNet(b.code)}`;
  return c.json({ message: "Code retiré." });
});

// Fusionne deux fiches du même produit : quantités additionnées, codes regroupés, l'autre fiche disparaît du stock.
app.post("/api/stock/fusionner", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const [k] = (await sql`SELECT * FROM stock_produits WHERE id = ${Number(b.id)}`) as any[];
  if (!k) throw new AppError(404, "Produit introuvable.");
  const t = clean(b.autre, 80);
  if (!t) throw new AppError(400, "Scanne le code ou tape le nom de l'autre fiche.");
  let a = await produitParCode(t.replace(/\s+/g, ""), k.magasin);
  if (a && a.archive_le) a = undefined;
  if (!a) {
    const like = "%" + t.replace(/[%_\\]/g, "") + "%";
    const l = (await sql`SELECT * FROM stock_produits WHERE magasin = ${k.magasin} AND archive_le IS NULL AND id <> ${k.id} AND nom ILIKE ${like} LIMIT 5`) as any[];
    if (l.length > 1) throw new AppError(400, "Plusieurs produits correspondent : " + l.map((x) => x.nom).join(" / ") + ". Scanne plutôt son code.");
    a = l[0];
  }
  if (!a) throw new AppError(404, "Aucune autre fiche trouvée.");
  if (a.id === k.id) throw new AppError(400, "C'est déjà la même fiche.");
  const codes = [a.code, ...((await sql`SELECT code FROM stock_codes WHERE produit_id = ${a.id}`) as any[]).map((x) => x.code)];
  await sql`DELETE FROM stock_codes WHERE produit_id = ${a.id}`;
  await sql`UPDATE stock_produits SET code = ${"FUS" + a.id + "-" + a.code}, archive_le = now(), qte = 0, maj_le = now() WHERE id = ${a.id}`;
  for (const code of codes) if (code !== k.code && /^\d{8,14}$/.test(code)) await sql`INSERT INTO stock_codes (produit_id, code) VALUES (${k.id}, ${code}) ON CONFLICT DO NOTHING`;
  await sql`UPDATE stock_produits SET qte = qte + ${a.qte}, achat_ht_cents = COALESCE(achat_ht_cents, ${a.achat_ht_cents}), emplacement = CASE WHEN emplacement = '' THEN ${a.emplacement} ELSE emplacement END, stock_min = GREATEST(stock_min, ${a.stock_min}), maj_le = now() WHERE id = ${k.id}`;
  if (a.qte) {
    await sql`INSERT INTO stock_mouvements (produit_id, delta, motif) VALUES (${a.id}, ${-a.qte}, ${"Fusionné dans " + k.nom})`;
    await sql`INSERT INTO stock_mouvements (produit_id, delta, motif) VALUES (${k.id}, ${a.qte}, ${"Fusion avec " + a.nom})`;
  }
  return c.json({ message: `« ${a.nom} » fusionné dans « ${k.nom} » : ${k.qte + a.qte} en stock, ${codes.length} code(s) reconnu(s).` });
});

// Produits sous leur stock minimum, avec la quantité à recommander (en tenant compte de ce qui est déjà au panier ou commandé).
app.get("/api/stock/reappro", async (c) => {
  const m = mag(c);
  const rows = (await sql`SELECT * FROM stock_produits WHERE archive_le IS NULL AND magasin = ${m} AND stock_min > 0 AND qte < stock_min ORDER BY nom`) as any[];
  const out = [];
  for (const p of rows) {
    // Compte aussi les lignes commandées sous un code supplémentaire du produit (référence sœur d'un autre fournisseur).
    const codes = await codesDuProduit(p);
    const [e] = (await sql`SELECT COALESCE(sum(quantite), 0)::int AS n FROM commande_lignes WHERE reparation_id IS NULL AND statut IN ('panier','commandee') AND (sku = ANY(${codes}) OR barcode = ANY(${codes}))`) as any[];
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
  const avertissements = await alertesSoeurs({ ref: p.code, fournisseurId: f.id, magasin: p.magasin });
  return c.json({ message: [`${q} x ${p.nom} ajouté au panier.`, ...avertissements].join(" "), avertissements });
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
// Travail de fond : on lit tout le catalogue, puis on écrit les codes par produit, avec réessais. Une seule exécution à la fois.
type EtatCodes = { enCours: boolean; phase: string; lus: number; aFaire: number; faits: number; doublons: number; sansCode: number; erreurs: number; derniereErreur: string; droits?: string; annule?: boolean; fini: boolean };
let ETAT_CODES: EtatCodes = { enCours: false, phase: "", lus: 0, aFaire: 0, faits: 0, doublons: 0, sansCode: 0, erreurs: 0, derniereErreur: "", fini: false };
const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function avecReessais<T>(f: () => Promise<T>): Promise<T> {
  let derniere: any;
  for (let i = 0; i < 5; i++) {
    try { return await f(); } catch (e) { derniere = e; await attendre(1500 * (i + 1)); }
  }
  throw derniere;
}
async function importerCodesFournisseurs() {
  const E = ETAT_CODES;
  try {
    const pris = new Set<string>();
    const aFaire: { id: string; productId: string; code: string }[] = [];
    let after: string | null = null;
    E.phase = "Lecture du catalogue Shopify…";
    for (let i = 0; i < 400 && !E.annule; i++) {
      const d: any = await avecReessais(() => shopifyRead(`query($after:String){productVariants(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{id barcode product{id a:metafield(namespace:"custom",key:"codigo-alternativo"){value} b:metafield(namespace:"custom",key:"codigo-alternativo-2"){value}}}}}`, { after }));
      const pv = d.productVariants;
      for (const v of pv.nodes) {
        E.lus++;
        if (v.barcode) { pris.add(String(v.barcode)); continue; }
        const code = [v.product?.a?.value, v.product?.b?.value].map((x: any) => String(x ?? "").trim()).find(gs1Ok);
        if (code) aFaire.push({ id: v.id, productId: v.product.id, code }); else E.sansCode++;
      }
      if (!pv.pageInfo.hasNextPage) break;
      after = pv.pageInfo.endCursor;
    }
    const parProduit = new Map<string, { id: string; barcode: string }[]>();
    for (const v of aFaire) {
      if (pris.has(v.code)) { E.doublons++; continue; }
      pris.add(v.code);
      if (!parProduit.has(v.productId)) parProduit.set(v.productId, []);
      parProduit.get(v.productId)!.push({ id: v.id, barcode: v.code });
    }
    E.aFaire = [...parProduit.values()].reduce((n, l) => n + l.length, 0);
    E.phase = "Écriture des codes dans Shopify…";
    for (const [productId, variants] of parProduit) {
      if (E.annule) break;
      try {
        const r: any = await avecReessais(() => shopifyMutate(`mutation($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$productId,variants:$variants){productVariants{id} userErrors{message}}}`, { productId, variants }));
        const errs = r?.productVariantsBulkUpdate?.userErrors || [];
        if (errs.length) { E.erreurs += variants.length; E.derniereErreur = String(errs[0].message).slice(0, 200); }
        else E.faits += variants.length;
      } catch (e: any) {
        E.erreurs += variants.length; E.derniereErreur = String(e?.message ?? e).slice(0, 200);
        if (!E.droits && E.derniereErreur.includes("Access denied")) {
          try {
            const d: any = await shopifyRead(`{ currentAppInstallation { app { title } accessScopes { handle } } }`, {});
            E.droits = "App « " + d.currentAppInstallation.app.title + " » : " + d.currentAppInstallation.accessScopes.map((x: any) => x.handle).join(", ");
          } catch { E.droits = "(droits de l'app illisibles)"; }
        }
      }
      await attendre(120);
    }
    E.phase = "Terminé";
  } catch (e: any) {
    E.derniereErreur = String(e?.message ?? e).slice(0, 200);
    E.phase = "Arrêté : " + E.derniereErreur;
  } finally { E.enCours = false; E.fini = true; }
}
app.post("/api/stock/codes-fournisseurs", async (c) => {
  const user = c.get("user") as any;
  if (user?.role !== "admin" && user?.role !== "responsable") throw new AppError(403, "Réservé au responsable.");
  const b = await c.req.json().catch(() => ({}));
  // Un nouveau clic sur le bouton relance tout si l'exécution en cours n'avance pas (ex. droits modifiés entre-temps).
  if (ETAT_CODES.enCours && (b.relancer || (ETAT_CODES.erreurs > 0 && ETAT_CODES.faits === 0))) { ETAT_CODES.annule = true; ETAT_CODES.enCours = false; }
  if (!ETAT_CODES.enCours) {
    oublierJetonShopify();
    ETAT_CODES = { enCours: true, phase: "Démarrage…", lus: 0, aFaire: 0, faits: 0, doublons: 0, sansCode: 0, erreurs: 0, derniereErreur: "", fini: false };
    void importerCodesFournisseurs();
  }
  return c.json(ETAT_CODES);
});
app.get("/api/stock/codes-fournisseurs", async (c) => c.json(ETAT_CODES));

// Automatique : une fois par nuit (entre 2 h et 5 h), et une première fois peu après le démarrage si jamais lancé.
async function codesAuto() {
  try {
    if (ETAT_CODES.enCours) return;
    const [r] = (await sql`SELECT valeur FROM reglages WHERE cle = 'codes_ewheel_dernier_v2'`) as any[];
    const dernier = r ? Number(r.valeur) : 0;
    const heure = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" }).format(new Date()));
    const dû = !dernier || (Date.now() - dernier > 23 * 3600 * 1000 && heure >= 2 && heure < 5);
    if (!dû) return;
    await sql`INSERT INTO reglages (cle, valeur) VALUES ('codes_ewheel_dernier_v2', ${String(Date.now())}) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`;
    ETAT_CODES = { enCours: true, phase: "Démarrage automatique…", lus: 0, aFaire: 0, faits: 0, doublons: 0, sansCode: 0, erreurs: 0, derniereErreur: "", fini: false };
    void importerCodesFournisseurs();
  } catch (e) { console.log(JSON.stringify({ event: "codes-ewheel-auto", message: String((e as any)?.message ?? e).slice(0, 200) })); }
}
setInterval(codesAuto, 30 * 60 * 1000);
setTimeout(codesAuto, 2 * 60 * 1000);

// Panier d'étiquettes enregistré sur le serveur (par magasin) : il reste tant qu'on ne le vide pas, utilisable depuis n'importe quel PC.
await sql`CREATE TABLE IF NOT EXISTS etiquettes_panier (magasin TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '[]', maj_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
app.get("/api/etiquettes/panier", async (c) => {
  const [r] = (await sql`SELECT data FROM etiquettes_panier WHERE magasin = ${mag(c)}`) as any[];
  return c.json({ items: Array.isArray(r?.data) ? r.data : [] });
});
app.post("/api/etiquettes/panier", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 2000);
  await sql`INSERT INTO etiquettes_panier (magasin, data, maj_le) VALUES (${mag(c, b)}, ${JSON.stringify(items)}::text::jsonb, now()) ON CONFLICT (magasin) DO UPDATE SET data = EXCLUDED.data, maj_le = now()`;
  return c.json({ ok: true });
});
