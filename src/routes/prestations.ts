import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { AppError, clean, exigeAdmin } from "../util";

await sql`CREATE TABLE IF NOT EXISTS prestations (id SERIAL PRIMARY KEY, nom TEXT NOT NULL, prix_cents INT NOT NULL DEFAULT 0, avec_piece BOOLEAN NOT NULL DEFAULT false, piece_aide TEXT NOT NULL DEFAULT '', actif BOOLEAN NOT NULL DEFAULT true, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`ALTER TABLE prestations ADD COLUMN IF NOT EXISTS qte_seuil INT NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS qte_remise_cents INT NOT NULL DEFAULT 0`;
await sql`CREATE TABLE IF NOT EXISTS prestation_options (id SERIAL PRIMARY KEY, prestation_id INT NOT NULL REFERENCES prestations(id) ON DELETE CASCADE, nom TEXT NOT NULL, prix_cents INT NOT NULL DEFAULT 0, type TEXT NOT NULL DEFAULT 'piece' CHECK (type IN ('piece','main_oeuvre')), cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
const [{ n }] = (await sql`SELECT count(*)::int AS n FROM prestations`) as any[];
if (n === 0) await sql`INSERT INTO prestations (nom, prix_cents, avec_piece, piece_aide) VALUES ('Pneu + pose', 3000, true, 'pneu')`;

// Remise "plusieurs prestations" : X € dès N prestations, jamais cumulée avec une offre.
export async function lireMulti() {
  const rows = (await sql`SELECT cle, valeur FROM reglages WHERE cle IN ('multi_seuil', 'multi_remise_cents')`) as any[];
  const m: Record<string, string> = {};
  for (const r of rows) m[r.cle] = r.valeur;
  return { seuil: Math.max(2, Number(m.multi_seuil ?? 2) || 2), remiseCents: Math.max(0, Number(m.multi_remise_cents ?? 1000) || 0) };
}

export async function remiseMulti(lignes: { type: string; quantite: number; libelle?: string }[], brutCents: number) {
  const m = await lireMulti();
  const mo = lignes.filter((l) => l.type === "main_oeuvre");
  const nb = mo.reduce((s, l) => s + l.quantite, 0);
  let best = nb >= m.seuil ? m.remiseCents : 0;
  // Conditions propres à une prestation : dès N fois la même prestation, X € de remise.
  const ps = (await sql`SELECT nom, qte_seuil, qte_remise_cents FROM prestations WHERE actif = true AND qte_seuil > 0 AND qte_remise_cents > 0`) as any[];
  for (const p of ps) {
    const q = mo.filter((l) => (l.libelle ?? "").trim().toLowerCase() === p.nom.trim().toLowerCase()).reduce((s, l) => s + l.quantite, 0);
    if (q >= p.qte_seuil) best = Math.max(best, p.qte_remise_cents);
  }
  return Math.min(best, brutCents);
}

const versPresta = (r: any) => ({ id: r.id, nom: r.nom, prixCents: r.prix_cents, avecPiece: r.avec_piece === true, qteSeuil: r.qte_seuil ?? 0, qteRemiseCents: r.qte_remise_cents ?? 0, pieceAide: r.piece_aide ?? "", actif: r.actif === true });

app.get("/api/prestations", async (c) => {
  const rows = (await sql`SELECT * FROM prestations ORDER BY nom`) as any[];
  const opts = (await sql`SELECT id, prestation_id, nom, prix_cents, type FROM prestation_options ORDER BY id`) as any[];
  return c.json({ prestations: rows.map((r) => ({ ...versPresta(r), options: opts.filter((o) => o.prestation_id === r.id).map((o) => ({ id: o.id, nom: o.nom, prixCents: o.prix_cents, type: o.type })) })), multi: await lireMulti() });
});

app.post("/api/prestations", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const nom = clean(b.nom, 120);
  if (!nom) throw new AppError(400, "Le nom de la prestation est obligatoire.");
  const prix = Math.max(0, Math.round((Number(String(b.prix ?? "0").replace(",", ".")) || 0) * 100));
  const avecPiece = b.avecPiece === true;
  const aide = clean(b.pieceAide, 60);
  const qs = Math.max(0, Math.min(20, Math.round(Number(b.qteSeuil) || 0)));
  const qr = Math.max(0, Math.round((Number(String(b.qteRemise ?? "0").replace(",", ".")) || 0) * 100));
  const id = Number(b.id);
  if (id > 0) await sql`UPDATE prestations SET nom = ${nom}, prix_cents = ${prix}, avec_piece = ${avecPiece}, piece_aide = ${aide}, qte_seuil = ${qs}, qte_remise_cents = ${qr} WHERE id = ${id}`;
  else await sql`INSERT INTO prestations (nom, prix_cents, avec_piece, piece_aide, qte_seuil, qte_remise_cents) VALUES (${nom}, ${prix}, ${avecPiece}, ${aide}, ${qs}, ${qr})`;
  return c.json({ message: "Prestation enregistrée." });
});

// Options d'une prestation (ex : valve tubeless pour "Pneu + pose") : proposées au client et à l'atelier.
app.post("/api/prestations/option", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const nom = clean(b.nom, 120);
  if (!nom) throw new AppError(400, "Donne un nom à l'option.");
  const [p] = (await sql`SELECT id FROM prestations WHERE id = ${Number(b.prestationId)}`) as any[];
  if (!p) throw new AppError(404, "Prestation introuvable.");
  const prix = Math.max(0, Math.round((Number(String(b.prix ?? "0").replace(",", ".")) || 0) * 100));
  await sql`INSERT INTO prestation_options (prestation_id, nom, prix_cents, type) VALUES (${p.id}, ${nom}, ${prix}, ${b.type === "main_oeuvre" ? "main_oeuvre" : "piece"})`;
  return c.json({ message: "Option ajoutée." });
});

app.post("/api/prestations/option/supprimer", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  await sql`DELETE FROM prestation_options WHERE id = ${Number(b.id)}`;
  return c.json({ message: "Option retirée." });
});

app.post("/api/prestations/etat", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  await sql`UPDATE prestations SET actif = ${b.actif === true} WHERE id = ${Number(b.id)}`;
  return c.json({ message: "Prestation mise à jour." });
});

app.post("/api/prestations/supprimer", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  await sql`DELETE FROM prestations WHERE id = ${Number(b.id)}`;
  return c.json({ message: "Prestation supprimée." });
});

app.post("/api/reglages/multi", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const seuil = Math.max(2, Math.min(10, Math.round(Number(b.seuil) || 2)));
  const cents = Math.max(0, Math.round((Number(String(b.remise ?? "0").replace(",", ".")) || 0) * 100));
  for (const [k, v] of [["multi_seuil", String(seuil)], ["multi_remise_cents", String(cents)]]) {
    await sql`INSERT INTO reglages (cle, valeur) VALUES (${k}, ${v}) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`;
  }
  return c.json({ message: "Remise enregistrée." });
});
