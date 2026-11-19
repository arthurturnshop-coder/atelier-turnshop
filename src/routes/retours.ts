import { app } from "../app";
import { sql } from "../db";
import "./auth";
import { AppError, clean, exigeResponsable } from "../util";

// Retours : bugs et suggestions d'amélioration remontés par l'équipe depuis l'app.
await sql`CREATE TABLE IF NOT EXISTS retours (
  id SERIAL PRIMARY KEY, type TEXT NOT NULL DEFAULT 'suggestion', texte TEXT NOT NULL, contexte TEXT NOT NULL DEFAULT '',
  par TEXT NOT NULL DEFAULT '', magasin TEXT NOT NULL DEFAULT '', traite BOOLEAN NOT NULL DEFAULT false,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;

app.get("/api/retours", async (c) => {
  const u = c.get("user") as any;
  const peut = u?.role === "admin" || u?.role === "responsable";
  const rows = (await sql`SELECT id, type, texte, contexte, par, magasin, traite, cree_le FROM retours ORDER BY traite, id DESC LIMIT 100`) as any[];
  return c.json({ peutTraiter: peut, retours: rows.map((r) => ({ id: r.id, type: r.type, texte: r.texte, contexte: r.contexte, par: r.par, magasin: r.magasin, traite: r.traite, le: r.cree_le })) });
});

app.post("/api/retours", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const texte = clean(b.texte, 2000);
  if (texte.length < 5) throw new AppError(400, "Décris le bug ou l'idée en quelques mots.");
  const type = b.type === "bug" ? "bug" : "suggestion";
  const u = c.get("user") as any;
  await sql`INSERT INTO retours (type, texte, contexte, par, magasin) VALUES (${type}, ${texte}, ${clean(b.contexte, 200)}, ${u?.prenom ?? ""}, ${u?.magasin ?? ""})`;
  return c.json({ message: "Merci, c'est envoyé." });
});

app.post("/api/retours/traite", async (c) => {
  exigeResponsable(c);
  const b = await c.req.json().catch(() => ({}));
  await sql`UPDATE retours SET traite = ${!!b.traite} WHERE id = ${Number(b.id) || 0}`;
  return c.json({ message: "OK" });
});
