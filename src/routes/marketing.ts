import { app } from "../app";
import { sql } from "../db";
import { AppError, clean, exigeResponsable } from "../util";
import { avantagesActifs } from "./avantages";

// ---------- Communication & marketing : idées de posts (toute l'équipe) + planning / offres (lecture seule pour l'équipe) ----------
await sql`CREATE TABLE IF NOT EXISTS marketing_idees (id SERIAL PRIMARY KEY, type TEXT NOT NULL DEFAULT 'idee', texte TEXT NOT NULL, auteur TEXT NOT NULL DEFAULT '', magasin TEXT NOT NULL DEFAULT '', statut TEXT NOT NULL DEFAULT 'nouvelle', cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS marketing_planning (id SERIAL PRIMARY KEY, date DATE NOT NULL, date_fin DATE, titre TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'post', canal TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;

const STATUTS = ["nouvelle", "retenue", "faite", "refusee"];
const TYPES = ["post", "offre", "event"];
const dateOk = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const AUJ = sql`(now() AT TIME ZONE 'Europe/Paris')::date`;

function txtAvantage(a: any): { titre: string; avantage: string; regles: string[] } {
  const av = a.effet === "pourcent" ? `-${a.valeur} %` : a.effet === "euros" ? `-${a.valeur} €` : "Cadeau offert";
  const regles: string[] = [];
  if (a.portee === "pieces") regles.push("Valable sur les pièces détachées et accessoires uniquement");
  if (a.clientRequis) regles.push("Réservé aux clients identifiés (carte du magasin)");
  if (a.declencheur === "cumul") regles.push(`Dès ${a.seuilCents / 100} € dépensés au total (une seule fois par client)`);
  else if (a.declencheur === "achat") regles.push(`Dès ${a.seuilCents / 100} € d'achat`);
  else {
    const f = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");
    regles.push(`Du ${f(a.dateDebut)} au ${f(a.dateFin)}` + (a.seuilCents > 0 ? `, dès ${a.seuilCents / 100} € d'achat` : ""));
  }
  return { titre: a.libelle, avantage: av, regles };
}

async function offresDuMoment() {
  const av = (await avantagesActifs()).map(txtAvantage);
  const pl = (await sql`SELECT id, titre, note, to_char(date, 'YYYY-MM-DD') AS date, to_char(date_fin, 'YYYY-MM-DD') AS date_fin FROM marketing_planning WHERE type = 'offre' AND date <= ${AUJ} AND COALESCE(date_fin, date) >= ${AUJ} ORDER BY date`) as any[];
  return { avantages: av, offres: pl.map((p) => ({ id: p.id, titre: p.titre, note: p.note, date: p.date, dateFin: p.date_fin })) };
}

app.get("/api/marketing/offres", async (c) => c.json(await offresDuMoment()));

app.get("/api/marketing", async (c) => {
  const idees = (await sql`SELECT id, type, texte, auteur, magasin, statut, cree_le FROM marketing_idees ORDER BY (statut = 'nouvelle') DESC, id DESC LIMIT 200`) as any[];
  const planning = (await sql`SELECT id, titre, type, canal, note, to_char(date, 'YYYY-MM-DD') AS date, to_char(date_fin, 'YYYY-MM-DD') AS date_fin FROM marketing_planning WHERE COALESCE(date_fin, date) >= ${AUJ} - 7 ORDER BY date, id LIMIT 200`) as any[];
  const moi = (c.get("user") as any)?.prenom ?? "";
  return c.json({
    moi,
    idees: idees.map((i) => ({ id: i.id, type: i.type, texte: i.texte, auteur: i.auteur, magasin: i.magasin, statut: i.statut, date: i.cree_le })),
    planning: planning.map((p) => ({ id: p.id, titre: p.titre, type: p.type, canal: p.canal, note: p.note, date: p.date, dateFin: p.date_fin })),
    ...(await offresDuMoment()),
  });
});

app.post("/api/marketing/idee", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const texte = clean(b.texte, 1000);
  if (!texte) throw new AppError(400, "Écris ton idée.");
  const type = b.type === "big" ? "big" : "idee";
  const u = c.get("user") as any;
  await sql`INSERT INTO marketing_idees (type, texte, auteur, magasin) VALUES (${type}, ${texte}, ${u?.prenom ?? ""}, ${u?.magasin ?? ""})`;
  return c.json({ message: "Idée envoyée, merci !" });
});

app.post("/api/marketing/idee/statut", async (c) => {
  exigeResponsable(c);
  const b = await c.req.json().catch(() => ({}));
  if (!STATUTS.includes(b.statut)) throw new AppError(400, "Statut invalide.");
  await sql`UPDATE marketing_idees SET statut = ${b.statut} WHERE id = ${Number(b.id)}`;
  return c.json({ ok: true });
});

app.post("/api/marketing/idee/supprimer", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const u = c.get("user") as any;
  const [i] = (await sql`SELECT auteur FROM marketing_idees WHERE id = ${Number(b.id)}`) as any[];
  if (!i) throw new AppError(404, "Idée introuvable.");
  if (i.auteur !== u?.prenom) exigeResponsable(c);
  await sql`DELETE FROM marketing_idees WHERE id = ${Number(b.id)}`;
  return c.json({ ok: true });
});

app.post("/api/marketing/planning", async (c) => {
  exigeResponsable(c);
  const b = await c.req.json().catch(() => ({}));
  const titre = clean(b.titre, 160);
  if (!titre) throw new AppError(400, "Donne un titre.");
  if (!dateOk(b.date)) throw new AppError(400, "Date invalide.");
  const fin = dateOk(b.dateFin) && b.dateFin >= b.date ? b.dateFin : null;
  const type = TYPES.includes(b.type) ? b.type : "post";
  const canal = clean(b.canal, 60), note = clean(b.note, 2000);
  if (b.id) await sql`UPDATE marketing_planning SET date = ${b.date}, date_fin = ${fin}, titre = ${titre}, type = ${type}, canal = ${canal}, note = ${note} WHERE id = ${Number(b.id)}`;
  else await sql`INSERT INTO marketing_planning (date, date_fin, titre, type, canal, note) VALUES (${b.date}, ${fin}, ${titre}, ${type}, ${canal}, ${note})`;
  return c.json({ message: "Planning enregistré." });
});

app.post("/api/marketing/planning/supprimer", async (c) => {
  exigeResponsable(c);
  const b = await c.req.json().catch(() => ({}));
  await sql`DELETE FROM marketing_planning WHERE id = ${Number(b.id)}`;
  return c.json({ ok: true });
});
