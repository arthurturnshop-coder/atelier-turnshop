import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { AppError, clean, exigeAdmin } from "../util";

// Base de modèles de trottinettes + pièces compatibles (produits du catalogue Shopify).
await sql`CREATE TABLE IF NOT EXISTS modeles (id SERIAL PRIMARY KEY, marque TEXT NOT NULL, modele TEXT NOT NULL, actif BOOLEAN NOT NULL DEFAULT true, cree_le TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (marque, modele))`;
await sql`CREATE TABLE IF NOT EXISTS modele_pieces (id SERIAL PRIMARY KEY, modele_id INT NOT NULL REFERENCES modeles(id) ON DELETE CASCADE, libelle TEXT NOT NULL, sku TEXT NOT NULL DEFAULT '', variant_id TEXT NOT NULL DEFAULT '', categorie TEXT NOT NULL DEFAULT 'pneu', cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;

// Modèles courants pour démarrer (sans pièces : c'est à l'atelier de les rattacher).
const DEPART: [string, string[]][] = [
  ["Xiaomi", ["M365", "Mi Pro", "Pro 2", "Mi 3", "Mi 4", "Mi 4 Pro", "Mi 4 Lite", "Mi 4 Ultra"]],
  ["Ninebot", ["Max G30", "Max G30D II", "Max G2", "F2", "F2 Pro", "F40", "E25", "ES2", "ES4"]],
  ["Segway", ["P65", "P100S"]],
  ["Dualtron", ["Mini", "Thunder", "Victor", "Storm"]],
  ["Kaabo", ["Mantis 10", "Wolf Warrior 11"]],
  ["Cecotec", ["Bongo Serie A", "Bongo Serie D"]],
  ["Urbanglide", ["Ride 100", "Ride 100XS", "Ride 82"]],
  ["Emove", ["Cruiser", "Touring", "Roadrunner"]],
  ["Inmotion", ["S1", "L9"]],
];
const [{ n }] = (await sql`SELECT count(*)::int AS n FROM modeles`) as any[];
if (n === 0) for (const [marque, ms] of DEPART) for (const m of ms) await sql`INSERT INTO modeles (marque, modele) VALUES (${marque}, ${m}) ON CONFLICT DO NOTHING`;

async function liste() {
  const ms = (await sql`SELECT id, marque, modele, actif FROM modeles ORDER BY marque, modele`) as any[];
  const ps = (await sql`SELECT id, modele_id, libelle, sku, variant_id, categorie FROM modele_pieces ORDER BY id`) as any[];
  return ms.map((m) => ({ id: m.id, marque: m.marque, modele: m.modele, actif: m.actif === true, pieces: ps.filter((p) => p.modele_id === m.id).map((p) => ({ id: p.id, libelle: p.libelle, sku: p.sku, variantId: p.variant_id, categorie: p.categorie })) }));
}

// Marques de trottinettes classées par fréquence (nombre de trottinettes enregistrées + prises en charge).
app.get("/api/marques", async (c) => {
  const rows = (await sql`SELECT min(t.marque) AS marque, count(DISTINCT t.id)::int + count(r.id)::int AS n FROM trottinettes t LEFT JOIN reparations r ON r.trottinette_id = t.id WHERE trim(t.marque) <> '' GROUP BY lower(trim(t.marque)) ORDER BY n DESC, 1`) as any[];
  return c.json({ marques: rows.map((r) => ({ marque: String(r.marque).trim(), n: r.n })) });
});
app.get("/api/modeles", async (c) => c.json({ modeles: await liste() }));

app.post("/api/modeles", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const marque = clean(b.marque, 60), modele = clean(b.modele, 80);
  if (!marque || !modele) throw new AppError(400, "Marque et modèle obligatoires.");
  const [r] = (await sql`INSERT INTO modeles (marque, modele) VALUES (${marque}, ${modele}) ON CONFLICT DO NOTHING RETURNING id`) as any[];
  if (!r) throw new AppError(409, "Ce modèle existe déjà.");
  return c.json({ message: "Modèle ajouté." });
});

app.post("/api/modeles/supprimer", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  await sql`DELETE FROM modeles WHERE id = ${Number(b.id)}`;
  return c.json({ message: "Modèle supprimé." });
});

// Import CSV : une ligne par pièce ou par modèle. Colonnes : marque;modele;categorie;sku;libelle (les 3 dernières facultatives).
app.post("/api/modeles/import", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const lignes = String(b.csv ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let modeles = 0, pieces = 0;
  for (const l of lignes) {
    const sep = l.includes(";") ? ";" : l.includes("\t") ? "\t" : ",";
    const [marque, modele, categorie, sku, libelle] = l.split(sep).map((x) => clean(x.replace(/^"|"$/g, ""), 200));
    if (!marque || !modele || marque.toLowerCase() === "marque") continue;
    const [nv] = (await sql`INSERT INTO modeles (marque, modele) VALUES (${marque}, ${modele}) ON CONFLICT DO NOTHING RETURNING id`) as any[];
    if (nv) modeles++;
    const [m] = (await sql`SELECT id FROM modeles WHERE marque = ${marque} AND modele = ${modele}`) as any[];
    if (m && (sku || libelle)) {
      const [ex] = (await sql`SELECT id FROM modele_pieces WHERE modele_id = ${m.id} AND sku = ${sku || ""} AND libelle = ${libelle || sku}`) as any[];
      if (!ex) { await sql`INSERT INTO modele_pieces (modele_id, libelle, sku, categorie) VALUES (${m.id}, ${libelle || sku}, ${sku || ""}, ${categorie || "pneu"})`; pieces++; }
    }
  }
  return c.json({ message: `${modeles} modèle(s) et ${pieces} pièce(s) importés.` });
});

app.post("/api/modeles/piece", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const [m] = (await sql`SELECT id FROM modeles WHERE id = ${Number(b.modeleId)}`) as any[];
  if (!m) throw new AppError(404, "Modèle introuvable.");
  const libelle = clean(b.libelle, 200);
  if (!libelle) throw new AppError(400, "Pièce vide.");
  await sql`INSERT INTO modele_pieces (modele_id, libelle, sku, variant_id, categorie) VALUES (${m.id}, ${libelle}, ${clean(b.sku, 80)}, ${clean(b.variantId, 80)}, ${clean(b.categorie, 40) || "pneu"})`;
  return c.json({ message: "Pièce rattachée au modèle." });
});

app.post("/api/modeles/piece/supprimer", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  await sql`DELETE FROM modele_pieces WHERE id = ${Number(b.id)}`;
  return c.json({ message: "Pièce retirée." });
});
