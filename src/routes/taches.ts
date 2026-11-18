import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { AppError, clean, exigeAdmin } from "../util";

const vers = (r: any) => ({ recurrente: r.recurrente_id != null, id: r.id, texte: r.texte, echeance: r.echeance ?? null, epingle: r.epingle === true, priorite: r.priorite === true, fait: r.fait === true, faitPar: r.fait_par ?? "", creePar: r.cree_par ?? "" });

// ---------- Tâches récurrentes ----------
const AUJ = async () => ((await sql`SELECT to_char((now() AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS d`) as any[])[0].d as string;
const JOURS = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const ajoute = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
function ajouteMois(d: string, n: number, jour: number) {
  const x = new Date(d + "T00:00:00Z");
  const m = x.getUTCMonth() + n, y = x.getUTCFullYear() + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  const dernier = new Date(Date.UTC(y, mm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, mm, Math.min(jour, dernier))).toISOString().slice(0, 10);
}
// Première date valable à partir de `depuis` (incluse) pour la règle.
function premiere(r: { unite: string; jour_semaine: number; jour_mois: number }, depuis: string) {
  if (r.unite === "semaines") { const dow = ((new Date(depuis + "T00:00:00Z").getUTCDay() + 6) % 7) + 1; return ajoute(depuis, (r.jour_semaine - dow + 7) % 7); }
  if (r.unite === "mois") { const c = ajouteMois(depuis, 0, r.jour_mois); return c >= depuis ? c : ajouteMois(depuis, 1, r.jour_mois); }
  return depuis;
}
// Date suivante après une échéance, strictement après aujourd'hui.
function suivante(r: any, de: string, auj: string) {
  let p = de;
  for (let i = 0; i < 1000 && p <= auj; i++) p = r.unite === "mois" ? ajouteMois(p, r.intervalle, r.jour_mois) : ajoute(p, r.intervalle * (r.unite === "semaines" ? 7 : 1));
  return p;
}
const libelleFreq = (r: any) => r.unite === "jours" ? (r.intervalle === 1 ? "Chaque jour" : `Tous les ${r.intervalle} jours`)
  : r.unite === "semaines" ? (r.intervalle === 1 ? `Chaque semaine (${JOURS[r.jour_semaine]})` : `Toutes les ${r.intervalle} semaines (${JOURS[r.jour_semaine]})`)
  : (r.intervalle === 1 ? `Chaque mois (le ${r.jour_mois})` : `Tous les ${r.intervalle} mois (le ${r.jour_mois})`);

// Crée les tâches arrivées à échéance (une seule tâche ouverte à la fois par récurrence).
async function genererRecurrentes() {
  const auj = await AUJ();
  const dues = (await sql`SELECT id, texte, unite, intervalle, jour_semaine, jour_mois, priorite, to_char(prochaine, 'YYYY-MM-DD') AS prochaine FROM taches_rec WHERE actif = true AND prochaine <= ${auj}::date`) as any[];
  for (const r of dues) {
    const suiv = suivante(r, r.prochaine, auj);
    const [pris] = (await sql`UPDATE taches_rec SET prochaine = ${suiv}::date WHERE id = ${r.id} AND prochaine = ${r.prochaine}::date RETURNING id`) as any[];
    if (!pris) continue;
    const [ouverte] = (await sql`SELECT id FROM taches WHERE recurrente_id = ${r.id} AND fait = false LIMIT 1`) as any[];
    if (!ouverte) await sql`INSERT INTO taches (texte, echeance, priorite, cree_par, recurrente_id) VALUES (${r.texte}, ${r.prochaine}::date, ${r.priorite}, 'Récurrente', ${r.id})`;
  }
}

const versRec = (r: any) => ({ id: r.id, texte: r.texte, unite: r.unite, intervalle: r.intervalle, jourSemaine: r.jour_semaine, jourMois: r.jour_mois, priorite: r.priorite === true, actif: r.actif === true, prochaine: r.prochaine, libelle: libelleFreq(r) });

app.get("/api/taches/recurrentes", async (c) => {
  const rows = (await sql`SELECT id, texte, unite, intervalle, jour_semaine, jour_mois, priorite, actif, to_char(prochaine, 'YYYY-MM-DD') AS prochaine FROM taches_rec ORDER BY texte`) as any[];
  return c.json(rows.map(versRec));
});

app.post("/api/recurrentes", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const texte = clean(b.texte, 300);
  if (!texte) throw new AppError(400, "Écris la tâche.");
  const unite = ["jours", "semaines", "mois"].includes(b.unite) ? b.unite : "jours";
  const intervalle = Math.max(1, Math.min(365, Math.round(Number(b.intervalle) || 1)));
  const jourSemaine = Math.max(1, Math.min(7, Math.round(Number(b.jourSemaine) || 1)));
  const jourMois = Math.max(1, Math.min(31, Math.round(Number(b.jourMois) || 1)));
  const regle = { unite, jour_semaine: jourSemaine, jour_mois: jourMois };
  const prochaine = premiere(regle, await AUJ());
  const id = Number(b.id);
  if (id > 0) await sql`UPDATE taches_rec SET texte = ${texte}, unite = ${unite}, intervalle = ${intervalle}, jour_semaine = ${jourSemaine}, jour_mois = ${jourMois}, priorite = ${b.priorite === true}, prochaine = ${prochaine}::date WHERE id = ${id}`;
  else await sql`INSERT INTO taches_rec (texte, unite, intervalle, jour_semaine, jour_mois, priorite, prochaine) VALUES (${texte}, ${unite}, ${intervalle}, ${jourSemaine}, ${jourMois}, ${b.priorite === true}, ${prochaine}::date)`;
  return c.json({ message: "Tâche récurrente enregistrée." });
});
app.post("/api/recurrentes/etat", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  await sql`UPDATE taches_rec SET actif = ${b.actif === true} WHERE id = ${Number(b.id)}`;
  return c.json({ ok: true });
});
app.post("/api/recurrentes/supprimer", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  await sql`DELETE FROM taches WHERE recurrente_id = ${Number(b.id)} AND fait = false`;
  await sql`UPDATE taches SET recurrente_id = NULL WHERE recurrente_id = ${Number(b.id)}`;
  await sql`DELETE FROM taches_rec WHERE id = ${Number(b.id)}`;
  return c.json({ ok: true });
});

// À faire : d'abord les tâches ouvertes (épinglées / prioritaires en haut, puis par date), puis les faites récemment.
app.get("/api/taches", async (c) => {
  await genererRecurrentes();
  const rows = (await sql`SELECT id, recurrente_id, texte, to_char(echeance, 'YYYY-MM-DD') AS echeance, epingle, priorite, fait, fait_par, cree_par FROM taches
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
