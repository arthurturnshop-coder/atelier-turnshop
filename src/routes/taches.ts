import { app } from "../app";
import { sql } from "../db";
import { genererRelancesGarantie } from "./garantie";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { lireAuto, numeroSms } from "../brevo";
import { AppError, clean, exigeAdmin } from "../util";

const vers = (r: any) => ({ reparationId: r.reparation_id ?? null, tel: r.telephone ?? "", client: r.client ?? "", trott: r.trott ?? "", recurrente: r.recurrente_id != null, id: r.id, texte: r.texte, echeance: r.echeance ?? null, epingle: r.epingle === true, priorite: r.priorite === true, fait: r.fait === true, faitPar: r.fait_par ?? "", creePar: r.cree_par ?? "" });

await sql`ALTER TABLE taches ADD COLUMN IF NOT EXISTS ligne_id INT`;
// Commande pas arrivée depuis plus d'une semaine : une tâche « vérifier la commande » (une à la fois par ligne, renouvelée chaque semaine).
async function genererCommandesEnRetard() {
  const rows = (await sql`SELECT l.id, l.libelle, COALESCE(l.suivi, co.suivi) AS suivi, l.reparation_id, f.nom AS fournisseur, trim(c.prenom || ' ' || c.nom) AS client
    FROM commande_lignes l JOIN fournisseurs f ON f.id = l.fournisseur_id LEFT JOIN commandes co ON co.id = l.commande_id LEFT JOIN reparations r ON r.id = l.reparation_id LEFT JOIN clients c ON c.id = r.client_id
    WHERE l.statut = 'commandee' AND l.commandee_le < now() - interval '7 days' AND (l.relance_le IS NULL OR l.relance_le < now() - interval '7 days')
      AND NOT EXISTS (SELECT 1 FROM taches k WHERE k.ligne_id = l.id AND k.fait = false)`) as any[];
  const auj = await AUJ();
  for (const l of rows) {
    const texte = `Toujours pas arrivé : vérifier la commande « ${l.libelle} » (${l.fournisseur})${l.suivi ? ", suivi " + l.suivi : ""}${l.client ? " pour " + l.client : ""}`;
    await sql`INSERT INTO taches (texte, echeance, priorite, cree_par, reparation_id, ligne_id) VALUES (${texte}, ${auj}::date, true, 'Commande en retard', ${l.reparation_id}, ${l.id})`;
    await sql`UPDATE commande_lignes SET relance_le = now() WHERE id = ${l.id}`;
  }
}

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

// Rappels de rendez-vous : la veille (ou le jour même) d'un RDV, une tâche prioritaire « Rappeler le client » apparaît.
async function genererRappels() {
  const auj = await AUJ();
  const demain = ajoute(auj, 1);
  const rows0 = (await sql`SELECT r.id, c.email, c.telephone, to_char(COALESCE((r.debut AT TIME ZONE 'Europe/Paris')::date, r.date_depot), 'YYYY-MM-DD') AS jour, to_char(r.debut AT TIME ZONE 'Europe/Paris', 'HH24:MI') AS heure,
      trim(c.prenom || ' ' || c.nom) AS client, t.marque, t.modele
    FROM reparations r JOIN clients c ON c.id = r.client_id JOIN trottinettes t ON t.id = r.trottinette_id
    WHERE r.supprime_le IS NULL AND r.en_magasin = false AND r.statut = 'reçu'
      AND COALESCE((r.debut AT TIME ZONE 'Europe/Paris')::date, r.date_depot) BETWEEN ${auj}::date AND ${demain}::date
      AND NOT EXISTS (SELECT 1 FROM taches k WHERE k.reparation_id = r.id AND k.cree_par = 'Rappel RDV')`) as any[];
  // Si l'envoi automatique du rappel est actif et que le client a un contact valable, inutile de créer une tâche.
  const canal = (await lireAuto()).rdv;
  const rows = rows0.filter((r) => !((canal === "email" || canal === "both") && String(r.email ?? "").trim() || (canal === "sms" || canal === "both") && numeroSms(r.telephone)));
  for (const r of rows) {
    const quand = r.jour === auj ? "aujourd'hui" : "demain";
    const texte = `Rappeler ${r.client} : RDV ${quand}${r.heure ? " à " + r.heure : ""} (${`${r.marque} ${r.modele}`.trim()})`;
    await sql`INSERT INTO taches (texte, echeance, priorite, cree_par, reparation_id) VALUES (${texte}, ${auj}::date, true, 'Rappel RDV', ${r.id})`;
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
  await genererRappels();
  await genererCommandesEnRetard();
  await genererRelancesGarantie();
  const rows = (await sql`SELECT k.id, k.recurrente_id, k.reparation_id, k.texte, to_char(k.echeance, 'YYYY-MM-DD') AS echeance, k.epingle, k.priorite, k.fait, k.fait_par, k.cree_par,
      cl.telephone, trim(cl.prenom || ' ' || cl.nom) AS client, t.marque || ' ' || t.modele AS trott
    FROM taches k LEFT JOIN reparations r ON r.id = k.reparation_id LEFT JOIN clients cl ON cl.id = r.client_id LEFT JOIN trottinettes t ON t.id = r.trottinette_id
    WHERE k.fait = false OR k.fait_le > now() - interval '2 days'
    ORDER BY k.fait, (k.epingle OR k.priorite) DESC, k.echeance NULLS LAST, k.id`) as any[];
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
