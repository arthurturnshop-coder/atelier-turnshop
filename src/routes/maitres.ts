import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { AppError, clean, exigeAdmin } from "../util";

// Produits maîtres : une même pièce (ex : chambre à air 8,5x2, diamètre int. 156) achetée chez plusieurs
// fournisseurs, chacun avec son propre code-barres. Tous les EAN pointent vers UN produit maître, donc
// un scan, une réception ou une vente débite/crédite le même stock.
await sql`CREATE TABLE IF NOT EXISTS produits_maitres (code TEXT PRIMARY KEY, nom TEXT NOT NULL, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS produits_alias (ean TEXT PRIMARY KEY, code_maitre TEXT NOT NULL REFERENCES produits_maitres(code) ON DELETE CASCADE, denomination TEXT NOT NULL DEFAULT '', fournisseur_id INT REFERENCES fournisseurs(id) ON DELETE SET NULL, qte_par_unite INT NOT NULL DEFAULT 1, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`CREATE INDEX IF NOT EXISTS produits_alias_maitre ON produits_alias (code_maitre)`;
await sql`CREATE SEQUENCE IF NOT EXISTS maitres_seq`;

const codeNet = (x: any) => clean(x, 60).replace(/\s+/g, "");
const cleEan = (d12: string) => { let t = 0; for (let i = 0; i < 12; i++) t += Number(d12[i]) * (i % 2 ? 3 : 1); return String((10 - (t % 10)) % 10); };
// EAN-13 interne des produits maîtres : préfixe 202 (les produits de l'atelier utilisent 200, les variantes Shopify 201).
const eanMaitre = (n: number) => { const d = "202" + String(n).padStart(9, "0"); return d + cleEan(d); };

export type Resolu = { code: string; alias: boolean; qteParUnite: number; nomMaitre: string; denomination: string };

// Un code scanné (EAN fournisseur, code maître ou code ordinaire) -> le code du produit maître sous lequel le stock est tenu.
export async function resoudre(code: string): Promise<Resolu> {
  if (!code) return { code, alias: false, qteParUnite: 1, nomMaitre: "", denomination: "" };
  const [a] = (await sql`SELECT a.code_maitre, a.qte_par_unite, a.denomination, m.nom FROM produits_alias a JOIN produits_maitres m ON m.code = a.code_maitre WHERE a.ean = ${code}`) as any[];
  if (a) return { code: a.code_maitre, alias: true, qteParUnite: Math.max(1, a.qte_par_unite), nomMaitre: a.nom, denomination: a.denomination };
  return { code, alias: false, qteParUnite: 1, nomMaitre: "", denomination: "" };
}

// Avertissements « référence sœur » : la même pièce (produit maître) est-elle déjà dans le panier ou commandée chez un AUTRE fournisseur ?
export async function alertesSoeurs(o: { ref: string | null | undefined; fournisseurId: number; magasin: string }): Promise<string[]> {
  const ref = codeNet(o.ref);
  if (!ref) return [];
  const r = await resoudre(ref);
  const lignes = (await sql`SELECT l.quantite, l.statut, l.reparation_id, f.nom AS fournisseur, l.libelle, COALESCE(a.qte_par_unite, 1) AS mult, a.denomination
    FROM commande_lignes l JOIN fournisseurs f ON f.id = l.fournisseur_id
    LEFT JOIN produits_alias a ON a.ean = COALESCE(NULLIF(l.barcode, ''), l.sku)
    WHERE l.statut IN ('panier','commandee') AND l.fournisseur_id <> ${o.fournisseurId}
      AND COALESCE(a.code_maitre, NULLIF(l.barcode, ''), l.sku) = ${r.code}
    ORDER BY f.nom, l.id`) as any[];
  if (!lignes.length) return [];
  const [st] = (await sql`SELECT COALESCE(sum(qte), 0)::int AS n FROM stock_produits WHERE code = ${r.code} AND magasin = ${o.magasin} AND archive_le IS NULL`) as any[];
  const parF = new Map<string, string[]>();
  for (const l of lignes) {
    const n = l.quantite * l.mult;
    const nom = l.denomination || l.libelle;
    const detail = `${n} × « ${nom} » (${l.statut === "commandee" ? "déjà commandé" : "dans le panier"}${l.reparation_id ? ", pour un client" : ""})`;
    parF.set(l.fournisseur, [...(parF.get(l.fournisseur) ?? []), detail]);
  }
  const txt = [...parF.entries()].map(([f, d]) => `chez ${f} : ${d.join(", ")}`).join(" ; ");
  return [`Attention, même pièce (référence sœur) ${txt}. Stock actuel ${o.magasin} : ${st.n}.`];
}

// Si l'EAN était déjà tenu comme produit séparé en stock, on fusionne ses quantités dans le produit maître (par boutique).
async function fusionnerStock(ean: string, maitre: { code: string; nom: string }, mult: number) {
  const rows = (await sql`SELECT * FROM stock_produits WHERE code = ${ean} AND archive_le IS NULL`) as any[];
  for (const r of rows) {
    let [m] = (await sql`SELECT * FROM stock_produits WHERE code = ${maitre.code} AND magasin = ${r.magasin}`) as any[];
    if (!m) [m] = (await sql`INSERT INTO stock_produits (code, nom, prix_cents, achat_ht_cents, qte, emplacement, magasin, stock_min) VALUES (${maitre.code}, ${maitre.nom}, ${r.prix_cents}, ${r.achat_ht_cents}, 0, ${r.emplacement}, ${r.magasin}, ${r.stock_min}) RETURNING *`) as any[];
    if (m.archive_le) await sql`UPDATE stock_produits SET archive_le = NULL WHERE id = ${m.id}`;
    if (r.qte) {
      await sql`UPDATE stock_produits SET qte = qte + ${r.qte * mult}, maj_le = now() WHERE id = ${m.id}`;
      await sql`INSERT INTO stock_mouvements (produit_id, delta, motif) VALUES (${m.id}, ${r.qte * mult}, ${"Fusion de la référence " + ean}), (${r.id}, ${-r.qte}, ${"Fusionné dans le produit maître " + maitre.code})`;
    }
    await sql`UPDATE stock_produits SET qte = 0, archive_le = now(), maj_le = now() WHERE id = ${r.id}`;
  }
  return rows.length;
}

app.get("/api/maitres", async (c) => {
  const maitres = (await sql`SELECT code, nom FROM produits_maitres ORDER BY nom`) as any[];
  const alias = (await sql`SELECT a.ean, a.code_maitre, a.denomination, a.qte_par_unite, a.fournisseur_id, f.nom AS fournisseur FROM produits_alias a LEFT JOIN fournisseurs f ON f.id = a.fournisseur_id ORDER BY a.cree_le`) as any[];
  const stock = maitres.length ? ((await sql`SELECT code, magasin, sum(qte)::int AS n FROM stock_produits WHERE archive_le IS NULL AND code = ANY(${maitres.map((m) => m.code)}) GROUP BY code, magasin`) as any[]) : [];
  const fournisseurs = (await sql`SELECT id, nom FROM fournisseurs WHERE actif = true ORDER BY nom`) as any[];
  return c.json({
    fournisseurs,
    maitres: maitres.map((m) => ({
      code: m.code, nom: m.nom,
      stock: Object.fromEntries(stock.filter((s) => s.code === m.code).map((s) => [s.magasin, s.n])),
      alias: alias.filter((a) => a.code_maitre === m.code).map((a) => ({ ean: a.ean, denomination: a.denomination, fournisseurId: a.fournisseur_id, fournisseur: a.fournisseur || "", qteParUnite: a.qte_par_unite })),
    })),
  });
});

app.post("/api/maitres", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const nom = clean(b.nom, 200);
  if (!nom) throw new AppError(400, "Donne un nom au produit maître (ex : Chambre à air 8,5x2 int. 156).");
  let code = codeNet(b.code);
  if (code) {
    const [dej] = await sql`SELECT code FROM produits_maitres WHERE code = ${code}`;
    if (dej) throw new AppError(400, "Ce code est déjà un produit maître.");
    const [alias] = await sql`SELECT ean FROM produits_alias WHERE ean = ${code}`;
    if (alias) throw new AppError(400, "Ce code est déjà associé à un autre produit maître.");
  } else {
    const [{ n }] = (await sql`SELECT nextval('maitres_seq')::int AS n`) as any[];
    code = eanMaitre(n);
  }
  await sql`INSERT INTO produits_maitres (code, nom) VALUES (${code}, ${nom})`;
  return c.json({ message: `Produit maître créé (code ${code}).`, code });
});

app.post("/api/maitres/supprimer", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const code = codeNet(b.code);
  await sql`DELETE FROM produits_maitres WHERE code = ${code}`;
  return c.json({ message: "Produit maître supprimé (le stock déjà regroupé reste en place)." });
});

app.post("/api/maitres/alias", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const ean = codeNet(b.ean);
  if (!/^\d{8,14}$/.test(ean)) throw new AppError(400, "Le code-barres doit faire 8 à 14 chiffres (scanne-le).");
  const [m] = (await sql`SELECT code, nom FROM produits_maitres WHERE code = ${codeNet(b.codeMaitre)}`) as any[];
  if (!m) throw new AppError(404, "Produit maître introuvable.");
  if (ean === m.code) throw new AppError(400, "C'est déjà le code du produit maître.");
  const [autreMaitre] = await sql`SELECT code FROM produits_maitres WHERE code = ${ean}`;
  if (autreMaitre) throw new AppError(400, "Ce code est déjà un produit maître.");
  const [dej] = (await sql`SELECT a.code_maitre, m.nom FROM produits_alias a JOIN produits_maitres m ON m.code = a.code_maitre WHERE a.ean = ${ean}`) as any[];
  if (dej) throw new AppError(400, `Ce code est déjà associé à « ${dej.nom} ». Retire-le d'abord de ce produit.`);
  const fid = Number(b.fournisseurId) || null;
  if (fid) { const [f] = await sql`SELECT id FROM fournisseurs WHERE id = ${fid}`; if (!f) throw new AppError(400, "Fournisseur introuvable."); }
  const mult = Math.max(1, Math.min(999, Math.round(Number(b.qteParUnite) || 1)));
  await sql`INSERT INTO produits_alias (ean, code_maitre, denomination, fournisseur_id, qte_par_unite) VALUES (${ean}, ${m.code}, ${clean(b.denomination, 120)}, ${fid}, ${mult})`;
  const fusion = await fusionnerStock(ean, m, mult);
  return c.json({ message: `Code ${ean} associé à « ${m.nom} »${fusion ? ` (stock existant de ce code regroupé dans le produit maître)` : ""}.` });
});

app.post("/api/maitres/alias/supprimer", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  await sql`DELETE FROM produits_alias WHERE ean = ${codeNet(b.ean)}`;
  return c.json({ message: "Code retiré du produit maître." });
});
