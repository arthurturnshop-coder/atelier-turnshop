import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { AppError, clean } from "../util";

const vers = (r: any) => ({ id: r.id, texte: r.texte, echeance: r.echeance ?? null, epingle: r.epingle === true, priorite: r.priorite === true, fait: r.fait === true, faitPar: r.fait_par ?? "", creePar: r.cree_par ?? "" });

// À faire : d'abord les tâches ouvertes (épinglées / prioritaires en haut, puis par date), puis les faites récemment.
app.get("/api/taches", async (c) => {
  const rows = (await sql`SELECT id, texte, to_char(echeance, 'YYYY-MM-DD') AS echeance, epingle, priorite, fait, fait_par, cree_par FROM taches
    WHERE fait = false OR fait_le > now() - interval '2 days'
    ORDER BY fait, (epingle OR priorite) DESC, echeance NULLS LAST, id`) as any[];
  return c.json(rows.map(vers));
});

app.post("/api/taches", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const texte = clean(b.texte, 300);
  if (!texte) throw new AppError(400, "Écris la tâche.");
  const u = c.get("user");
  const e = /^\d{4}-\d{2}-\d{2}$/.test(String(b.echeance ?? "")) ? String(b.echeance) : null;
  await sql`INSERT INTO taches (texte, echeance, epingle, priorite, cree_par) VALUES (${texte}, ${e}, ${b.epingle === true}, ${b.priorite === true}, ${u?.prenom ?? ""})`;
  return c.json({ message: "Tâche ajoutée." });
});

app.post("/api/taches/maj", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const u = c.get("user");
  if (typeof b.fait === "boolean") await sql`UPDATE taches SET fait = ${b.fait}, fait_le = ${b.fait ? sql`now()` : null}, fait_par = ${b.fait ? (u?.prenom ?? "") : null} WHERE id = ${id}`;
  if (typeof b.epingle === "boolean") await sql`UPDATE taches SET epingle = ${b.epingle} WHERE id = ${id}`;
  if (typeof b.priorite === "boolean") await sql`UPDATE taches SET priorite = ${b.priorite} WHERE id = ${id}`;
  return c.json({ ok: true });
});

app.post("/api/taches/supprimer", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  await sql`DELETE FROM taches WHERE id = ${Number(b.id)}`;
  return c.json({ ok: true });
});
