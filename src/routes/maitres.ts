import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { AppError, clean, exigeAdmin } from "../util";

// Produits maîtres : un nom (« blase ») auquel on associe plusieurs produits du catalogue (références de fournisseurs différents).
// Quand l'un de ces produits est choisi ou scanné dans un devis, c'est le produit maître qui est mis sur la ligne.
await sql`CREATE TABLE IF NOT EXISTS maitre_produits (id SERIAL PRIMARY KEY, nom TEXT NOT NULL, prix_cents INT, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS maitre_produits_nom ON maitre_produits (lower(nom))`;
await sql`CREATE TABLE IF NOT EXISTS maitre_liens (id SERIAL PRIMARY KEY, maitre_id INT NOT NULL REFERENCES maitre_produits(id) ON DELETE CASCADE, variant_id TEXT NOT NULL DEFAULT '', sku TEXT NOT NULL DEFAULT '', barcode TEXT NOT NULL DEFAULT '', libelle TEXT NOT NULL DEFAULT '', cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`CREATE INDEX IF NOT EXISTS maitre_liens_variant ON maitre_liens (variant_id)`;
await sql`CREATE INDEX IF NOT EXISTS maitre_liens_barcode ON maitre_liens (barcode)`;
await sql`CREATE INDEX IF NOT EXISTS maitre_liens_sku ON maitre_liens (sku)`;
// Sur la ligne de devis : le maître appliqué, et le produit réellement choisi (pour savoir quoi commander).
await sql`ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS maitre_id INT, ADD COLUMN IF NOT EXISTS libelle_origine TEXT`;

const prixCents = (x: any): number | null => {
  const s = String(x ?? "").replace(",", ".").replace(/[^0-9.]/g, "");
  if (!s) return null;
  const n = Math.round(Number(s) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Le produit maître d'un produit (par variante Shopify, sinon code-barres, sinon SKU), ou undefined.
export async function trouverMaitre(p: { variantId?: string | null; barcode?: string | null; sku?: string | null }) {
  const v = clean(p.variantId, 80), bc = clean(p.barcode, 80), sk = clean(p.sku, 80);
  if (!v && !bc && !sk) return undefined;
  const [m] = (await sql`SELECT m.id, m.nom, m.prix_cents FROM maitre_liens l JOIN maitre_produits m ON m.id = l.maitre_id
    WHERE (${v} <> '' AND l.variant_id = ${v}) OR (${bc} <> '' AND l.barcode = ${bc}) OR (${sk} <> '' AND l.sku = ${sk})
    ORDER BY (l.variant_id = ${v} AND ${v} <> '') DESC, (l.barcode = ${bc} AND ${bc} <> '') DESC LIMIT 1`) as any[];
  return m as { id: number; nom: string; prix_cents: number | null } | undefined;
}

// Devis seul : renvoie le libellé et le prix à mettre sur la ligne (produit maître si le produit est associé).
app.post("/api/maitres/resoudre", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const m = await trouverMaitre({ variantId: b.variantId, barcode: b.barcode, sku: b.sku });
  const prixChoisi = prixCents(b.prix) ?? 0;
  if (!m) return c.json({ libelle: clean(b.libelle, 200), prixCents: prixChoisi, maitre: null });
  return c.json({ libelle: m.nom, prixCents: m.prix_cents ?? prixChoisi, maitre: { nom: m.nom, origine: clean(b.libelle, 200) } });
});

app.get("/api/maitres", async (c) => {
  const ms = (await sql`SELECT id, nom, prix_cents FROM maitre_produits ORDER BY lower(nom)`) as any[];
  const ls = (await sql`SELECT id, maitre_id, variant_id, sku, barcode, libelle FROM maitre_liens ORDER BY id`) as any[];
  return c.json({
    maitres: ms.map((m) => ({
      id: m.id, nom: m.nom, prixCents: m.prix_cents,
      produits: ls.filter((l) => l.maitre_id === m.id).map((l) => ({ id: l.id, libelle: l.libelle, sku: l.sku, barcode: l.barcode, variantId: l.variant_id })),
    })),
  });
});

app.post("/api/maitres", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const nom = clean(b.nom, 200);
  if (!nom) throw new AppError(400, "Donne un nom au produit maître (ex : Chambre à air 8,5x2 int. 156).");
  const [dej] = await sql`SELECT id FROM maitre_produits WHERE lower(nom) = lower(${nom})`;
  if (dej) throw new AppError(400, "Un produit maître porte déjà ce nom.");
  const [m] = (await sql`INSERT INTO maitre_produits (nom, prix_cents) VALUES (${nom}, ${prixCents(b.prix)}) RETURNING id`) as any[];
  return c.json({ message: "Produit maître créé : associe-lui maintenant des produits.", id: m.id });
});

app.post("/api/maitres/modifier", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const nom = clean(b.nom, 200);
  if (!nom) throw new AppError(400, "Le nom est obligatoire.");
  const [dej] = await sql`SELECT id FROM maitre_produits WHERE lower(nom) = lower(${nom}) AND id <> ${Number(b.id)}`;
  if (dej) throw new AppError(400, "Un autre produit maître porte déjà ce nom.");
  await sql`UPDATE maitre_produits SET nom = ${nom}, prix_cents = ${prixCents(b.prix)} WHERE id = ${Number(b.id)}`;
  return c.json({ message: "Produit maître enregistré (les devis déjà faits ne changent pas)." });
});

app.post("/api/maitres/supprimer", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  await sql`DELETE FROM maitre_produits WHERE id = ${Number(b.id)}`;
  return c.json({ message: "Produit maître supprimé (les devis déjà faits ne changent pas)." });
});

// Associer un produit du catalogue (choisi ou scanné) à un produit maître.
app.post("/api/maitres/lien", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const [m] = (await sql`SELECT id, nom FROM maitre_produits WHERE id = ${Number(b.maitreId)}`) as any[];
  if (!m) throw new AppError(404, "Produit maître introuvable.");
  const variantId = clean(b.variantId, 80), sku = clean(b.sku, 80), barcode = clean(b.barcode, 80);
  if (!variantId && !sku && !barcode) throw new AppError(400, "Ce produit n'a ni variante, ni référence, ni code-barres.");
  const autre = await trouverMaitre({ variantId, sku, barcode });
  if (autre && autre.id === m.id) return c.json({ message: "Ce produit est déjà associé à ce produit maître." });
  if (autre) throw new AppError(409, `Ce produit est déjà associé à « ${autre.nom} ». Retire-le de ce produit maître d'abord.`);
  await sql`INSERT INTO maitre_liens (maitre_id, variant_id, sku, barcode, libelle) VALUES (${m.id}, ${variantId}, ${sku}, ${barcode}, ${clean(b.libelle, 200)})`;
  return c.json({ message: `« ${clean(b.libelle, 200) || barcode || sku} » associé à « ${m.nom} ».` });
});

app.post("/api/maitres/lien/supprimer", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  await sql`DELETE FROM maitre_liens WHERE id = ${Number(b.id)}`;
  return c.json({ message: "Produit retiré du produit maître." });
});
