import { app } from "../app";
import { sql } from "../db";
import "./auth";
import { AppError, clean, exigeResponsable } from "../util";

// Caisse : ouverture (montant du tiroir) -> ventes -> fermeture (ticket Z stocké, écart compté/attendu).
await sql`CREATE TABLE IF NOT EXISTS caisse_sessions (
  id SERIAL PRIMARY KEY, magasin TEXT NOT NULL, jour DATE NOT NULL, ouverte_le TIMESTAMPTZ NOT NULL DEFAULT now(), fond_cents INT NOT NULL DEFAULT 0, ouvert_par TEXT NOT NULL DEFAULT '',
  fermee_le TIMESTAMPTZ, ferme_par TEXT, especes_attendues_cents INT, especes_comptees_cents INT, ecart_cents INT, totaux JSONB, nb_ventes INT, note TEXT NOT NULL DEFAULT '')`;
// Reprise des anciennes clôtures (une par jour) comme sessions fermées, une seule fois.
try {
  const [vide] = (await sql`SELECT count(*)::int AS n FROM caisse_sessions`) as any[];
  if (vide.n === 0) await sql`INSERT INTO caisse_sessions (magasin, jour, ouverte_le, fond_cents, ouvert_par, fermee_le, ferme_par, especes_attendues_cents, especes_comptees_cents, ecart_cents, totaux, nb_ventes, note)
    SELECT magasin, jour, cree_le, fond_cents, par, cree_le, par, especes_attendues_cents, especes_comptees_cents, ecart_cents, totaux, nb_ventes, note FROM clotures_caisse`;
} catch {}

const magDe = (c: any) => (c.get("user")?.magasin === "Rouen" ? "Rouen" : "Amiens");
const euros = (x: any) => Math.round((Number(String(x ?? "").replace(",", ".")) || 0) * 100);
const parse = (j: any) => (typeof j === "string" ? JSON.parse(j) : j);

async function calcul(m: string, de: Date | string, a: Date | string | null) {
  const fin = a ?? new Date();
  const pay = (await sql`SELECT p.moyen, sum(p.montant_cents)::int AS n FROM vente_paiements p JOIN ventes v ON v.id = p.vente_id
    WHERE v.magasin = ${m} AND v.cree_le >= ${de} AND v.cree_le <= ${fin} GROUP BY p.moyen`) as any[];
  const [nb] = (await sql`SELECT count(*)::int AS n, COALESCE(sum(total_cents), 0)::int AS total FROM ventes
    WHERE magasin = ${m} AND COALESCE(type, '') <> 'acompte' AND cree_le >= ${de} AND cree_le <= ${fin}`) as any[];
  const [ac] = (await sql`SELECT count(*)::int AS n FROM ventes WHERE magasin = ${m} AND type = 'acompte' AND cree_le >= ${de} AND cree_le <= ${fin}`) as any[];
  const remb = (await sql`SELECT rb.moyen, sum(rb.montant_cents)::int AS n FROM remboursements rb JOIN reparations r ON r.id = rb.reparation_id
    WHERE r.magasin = ${m} AND rb.cree_le >= ${de} AND rb.cree_le <= ${fin} GROUP BY rb.moyen`) as any[];
  const par: Record<string, number> = { carte: 0, especes: 0, virement: 0, en_ligne: 0 };
  for (const p of pay) par[p.moyen] = p.n;
  const rem: Record<string, number> = {};
  for (const r of remb) rem[r.moyen] = r.n;
  return { encaisse: par, rembourse: rem, nbVentes: nb.n, nbAcomptes: ac.n, caCents: nb.total, especesNettes: par.especes - (rem.especes ?? 0) };
}

const vue = (s: any) => s && ({
  id: s.id, magasin: s.magasin, jour: String(s.jour).slice(0, 10), ouverteLe: s.ouverte_le, fondCents: s.fond_cents, ouvertPar: s.ouvert_par,
  fermeeLe: s.fermee_le, fermePar: s.ferme_par, attenduCents: s.especes_attendues_cents, compteCents: s.especes_comptees_cents, ecartCents: s.ecart_cents,
  note: s.note, nbVentes: s.nb_ventes, totaux: s.totaux ? parse(s.totaux) : null,
});

// État de la caisse : session ouverte (avec totaux en direct) ou fermée (dernier ticket Z + fond conseillé).
app.get("/api/caisse/session", async (c) => {
  const m = magDe(c);
  const [ouv] = (await sql`SELECT * FROM caisse_sessions WHERE magasin = ${m} AND fermee_le IS NULL ORDER BY id DESC LIMIT 1`) as any[];
  const [der] = (await sql`SELECT * FROM caisse_sessions WHERE magasin = ${m} AND fermee_le IS NOT NULL ORDER BY id DESC LIMIT 1`) as any[];
  const live = ouv ? await calcul(m, ouv.ouverte_le, null) : null;
  return c.json({ magasin: m, ouverte: ouv ? vue(ouv) : null, live, dernier: der ? vue(der) : null, fondConseilleCents: der?.especes_comptees_cents ?? 0 });
});

app.post("/api/caisse/ouvrir", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const m = magDe(c);
  if (b.fond === undefined || b.fond === "") throw new AppError(400, "Saisis le montant présent dans le tiroir.");
  const fond = euros(b.fond);
  if (fond < 0) throw new AppError(400, "Montant invalide.");
  const [ex] = (await sql`SELECT id FROM caisse_sessions WHERE magasin = ${m} AND fermee_le IS NULL LIMIT 1`) as any[];
  if (ex) throw new AppError(409, "La caisse est déjà ouverte.");
  const u = c.get("user") as any;
  await sql`INSERT INTO caisse_sessions (magasin, jour, fond_cents, ouvert_par) VALUES (${m}, (now() AT TIME ZONE 'Europe/Paris')::date, ${fond}, ${u?.prenom ?? ""})`;
  return c.json({ message: "Caisse ouverte." });
});

app.post("/api/caisse/fermer", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const m = magDe(c);
  if (b.compte === undefined || b.compte === "") throw new AppError(400, "Saisis le montant d'espèces compté dans le tiroir.");
  const compte = euros(b.compte);
  if (compte < 0) throw new AppError(400, "Montant invalide.");
  const [ouv] = (await sql`SELECT * FROM caisse_sessions WHERE magasin = ${m} AND fermee_le IS NULL ORDER BY id DESC LIMIT 1`) as any[];
  if (!ouv) throw new AppError(409, "La caisse n'est pas ouverte.");
  const fin = new Date();
  const calc = await calcul(m, ouv.ouverte_le, fin);
  const attendu = ouv.fond_cents + calc.especesNettes;
  const u = c.get("user") as any;
  await sql`UPDATE caisse_sessions SET fermee_le = ${fin}, ferme_par = ${u?.prenom ?? ""}, especes_attendues_cents = ${attendu}, especes_comptees_cents = ${compte},
    ecart_cents = ${compte - attendu}, totaux = ${JSON.stringify(calc)}::jsonb, nb_ventes = ${calc.nbVentes}, note = ${clean(b.note, 300)} WHERE id = ${ouv.id}`;
  return c.json({ message: "Caisse fermée. Ticket Z enregistré." });
});

// Historique : encaissements jour par jour (par moyen) + tickets Z, pour vérifier les écarts compte / caisse sur un mois.
app.get("/api/caisse/cloture-historique", async (c) => {
  exigeResponsable(c);
  const u = c.get("user") as any;
  const demande = String(c.req.query("magasin") ?? "");
  const m = u?.role === "admin" && (demande === "Amiens" || demande === "Rouen") ? demande : magDe(c);
  const q = String(c.req.query("periode") ?? "30j");
  const [{ auj }] = (await sql`SELECT (now() AT TIME ZONE 'Europe/Paris')::date AS auj`) as any[];
  let du: string, au: string;
  if (q === "mois") { [{ du, au }] = (await sql`SELECT date_trunc('month', ${auj}::date)::date::text AS du, ${auj}::date::text AS au`) as any[]; }
  else if (q === "mois-1") { [{ du, au }] = (await sql`SELECT (date_trunc('month', ${auj}::date) - interval '1 month')::date::text AS du, (date_trunc('month', ${auj}::date) - interval '1 day')::date::text AS au`) as any[]; }
  else { [{ du, au }] = (await sql`SELECT (${auj}::date - 30)::text AS du, ${auj}::date::text AS au`) as any[]; }
  const pay = (await sql`SELECT (v.cree_le AT TIME ZONE 'Europe/Paris')::date::text AS j, p.moyen, sum(p.montant_cents)::int AS n FROM vente_paiements p JOIN ventes v ON v.id = p.vente_id
    WHERE v.magasin = ${m} AND (v.cree_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${du}::date AND ${au}::date GROUP BY 1, 2`) as any[];
  const remb = (await sql`SELECT (rb.cree_le AT TIME ZONE 'Europe/Paris')::date::text AS j, sum(rb.montant_cents)::int AS n FROM remboursements rb JOIN reparations r ON r.id = rb.reparation_id
    WHERE r.magasin = ${m} AND (rb.cree_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${du}::date AND ${au}::date GROUP BY 1`) as any[];
  const sess = (await sql`SELECT * FROM caisse_sessions WHERE magasin = ${m} AND jour BETWEEN ${du}::date AND ${au}::date ORDER BY id DESC`) as any[];
  const jours: Record<string, any> = {};
  const J = (j: string) => (jours[j] ??= { jour: j, carte: 0, especes: 0, virement: 0, en_ligne: 0, rembourse: 0 });
  for (const p of pay) J(p.j)[p.moyen] = p.n;
  for (const r of remb) J(r.j).rembourse = r.n;
  return c.json({
    magasin: m, du, au,
    jours: Object.values(jours).sort((a: any, b: any) => (a.jour < b.jour ? 1 : -1)),
    sessions: sess.map(vue),
  });
});

// Tous les tickets Z enregistrés (12 mois), pour les retrouver et les réimprimer. Réservé au responsable.
app.get("/api/caisse/tickets-z", async (c) => {
  exigeResponsable(c);
  const u = c.get("user") as any;
  const demande = String(c.req.query("magasin") ?? "");
  const m = u?.role === "admin" ? (demande === "Amiens" || demande === "Rouen" ? demande : "") : magDe(c);
  const sess = (await sql`SELECT * FROM caisse_sessions WHERE fermee_le IS NOT NULL AND (${m} = '' OR magasin = ${m}) AND jour >= (now() - interval '12 months')::date ORDER BY id DESC LIMIT 400`) as any[];
  return c.json({ sessions: sess.map(vue) });
});
