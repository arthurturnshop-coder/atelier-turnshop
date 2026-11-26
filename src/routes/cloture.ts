import { app } from "../app";
import { sql } from "../db";
import "./auth";
import { vendeurParMdp } from "./caissier";
import { AppError, clean, exigeResponsable } from "../util";

// Caisse : ouverture (montant du tiroir) -> ventes -> fermeture (ticket Z stocké, écart compté/attendu).
await sql`CREATE TABLE IF NOT EXISTS caisse_sessions (
  id SERIAL PRIMARY KEY, magasin TEXT NOT NULL, jour DATE NOT NULL, ouverte_le TIMESTAMPTZ NOT NULL DEFAULT now(), fond_cents INT NOT NULL DEFAULT 0, ouvert_par TEXT NOT NULL DEFAULT '',
  fermee_le TIMESTAMPTZ, ferme_par TEXT, especes_attendues_cents INT, especes_comptees_cents INT, ecart_cents INT, totaux JSONB, nb_ventes INT, note TEXT NOT NULL DEFAULT '')`;
await sql`ALTER TABLE caisse_sessions ADD COLUMN IF NOT EXISTS ajouts JSONB NOT NULL DEFAULT '[]'::jsonb`;
// Reprise des anciennes clôtures (une par jour) comme sessions fermées, une seule fois.
try {
  const [vide] = (await sql`SELECT count(*)::int AS n FROM caisse_sessions`) as any[];
  if (vide.n === 0) await sql`INSERT INTO caisse_sessions (magasin, jour, ouverte_le, fond_cents, ouvert_par, fermee_le, ferme_par, especes_attendues_cents, especes_comptees_cents, ecart_cents, totaux, nb_ventes, note)
    SELECT magasin, jour, cree_le, fond_cents, par, cree_le, par, especes_attendues_cents, especes_comptees_cents, ecart_cents, totaux, nb_ventes, note FROM clotures_caisse`;
} catch {}

const magDe = (c: any) => (c.get("user")?.magasin === "Rouen" ? "Rouen" : "Amiens");
const euros = (x: any) => Math.round((Number(String(x ?? "").replace(",", ".")) || 0) * 100);
const parse = (j: any) => (typeof j === "string" ? JSON.parse(j) : j);

await sql`CREATE TABLE IF NOT EXISTS mouvements_cash (id SERIAL PRIMARY KEY, magasin TEXT NOT NULL, sens TEXT NOT NULL, montant_cents INT NOT NULL, motif TEXT NOT NULL DEFAULT '', par TEXT, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;

async function calcul(m: string, de: Date | string, a: Date | string | null) {
  const fin = a ?? new Date();
  const pay = (await sql`SELECT p.moyen, sum(p.montant_cents)::int AS n FROM vente_paiements p JOIN ventes v ON v.id = p.vente_id
    WHERE v.magasin = ${m} AND v.cree_le >= ${de} AND v.cree_le <= ${fin} GROUP BY p.moyen`) as any[];
  const [nb] = (await sql`SELECT count(*)::int AS n, COALESCE(sum(total_cents), 0)::int AS total FROM ventes
    WHERE magasin = ${m} AND COALESCE(type, '') <> 'acompte' AND cree_le >= ${de} AND cree_le <= ${fin}`) as any[];
  const [ac] = (await sql`SELECT count(*)::int AS n, COALESCE(sum(total_cents), 0)::int AS total FROM ventes WHERE magasin = ${m} AND type = 'acompte' AND cree_le >= ${de} AND cree_le <= ${fin}`) as any[];
  const remb = (await sql`SELECT rb.moyen, sum(rb.montant_cents)::int AS n FROM remboursements rb LEFT JOIN reparations r ON r.id = rb.reparation_id
    WHERE COALESCE(rb.magasin, r.magasin) = ${m} AND rb.cree_le >= ${de} AND rb.cree_le <= ${fin} GROUP BY rb.moyen`) as any[];
  const mv = (await sql`SELECT sens, montant_cents, motif, par, cree_le FROM mouvements_cash WHERE magasin = ${m} AND cree_le >= ${de} AND cree_le <= ${fin} ORDER BY id`) as any[];
  const entrees = mv.filter((x) => x.sens === "entree").reduce((a, x) => a + x.montant_cents, 0);
  const sorties = mv.filter((x) => x.sens === "sortie").reduce((a, x) => a + x.montant_cents, 0);
  const mouvements = mv.map((x) => ({ sens: x.sens, cents: x.montant_cents, motif: x.motif, par: x.par ?? "", le: x.cree_le }));
  const par: Record<string, number> = { carte: 0, especes: 0, virement: 0, en_ligne: 0, bon_achat: 0 };
  for (const p of pay) par[p.moyen] = p.n;
  const rem: Record<string, number> = {};
  for (const r of remb) rem[r.moyen] = r.n;
  const tr = (await sql`SELECT v.numero_facture, vl.libelle, vl.series, trim(cl.prenom || ' ' || cl.nom) AS client FROM vente_lignes vl JOIN ventes v ON v.id = vl.vente_id LEFT JOIN clients cl ON cl.id = v.client_id
    WHERE v.magasin = ${m} AND v.cree_le >= ${de} AND v.cree_le <= ${fin} AND jsonb_array_length(vl.series) > 0 ORDER BY v.id`) as any[];
  const trottinettes = tr.flatMap((r: any) => (r.series as string[]).map((serie) => ({ facture: r.numero_facture ?? "", libelle: r.libelle, serie, client: r.client ?? "" })));
  return { trottinettes, encaisse: par, rembourse: rem, nbVentes: nb.n, nbAcomptes: ac.n, acomptesCents: ac.total, caCents: nb.total, especesNettes: par.especes - (rem.especes ?? 0) + entrees - sorties, entreesCash: entrees, sortiesCash: sorties, mouvements };
}

const vue = (s: any) => s && ({
  id: s.id, magasin: s.magasin, jour: s.jour instanceof Date ? s.jour.toLocaleDateString("sv-SE") : String(s.jour).slice(0, 10), ouverteLe: s.ouverte_le, fondCents: s.fond_cents, ouvertPar: s.ouvert_par,
  fermeeLe: s.fermee_le, fermePar: s.ferme_par, attenduCents: s.especes_attendues_cents, compteCents: s.especes_comptees_cents, ecartCents: s.ecart_cents,
  note: s.note, nbVentes: s.nb_ventes, totaux: s.totaux ? parse(s.totaux) : null, ajouts: s.ajouts ? parse(s.ajouts) : [],
});

// État de la caisse : session ouverte (avec totaux en direct) ou fermée (dernier ticket Z + fond conseillé).
app.get("/api/caisse/session", async (c) => {
  const m = magDe(c);
  const [ouv] = (await sql`SELECT * FROM caisse_sessions WHERE magasin = ${m} AND fermee_le IS NULL ORDER BY id DESC LIMIT 1`) as any[];
  const [der] = (await sql`SELECT * FROM caisse_sessions WHERE magasin = ${m} AND fermee_le IS NOT NULL ORDER BY id DESC LIMIT 1`) as any[];
  const live = ouv ? await calcul(m, ouv.ouverte_le, null) : null;
  const [{ auj }] = (await sql`SELECT (now() AT TIME ZONE 'Europe/Paris')::date::text AS auj`) as any[];
  const ouvV: any = ouv ? vue(ouv) : null;
  if (ouvV) ouvV.perimee = ouvV.jour < auj;
  let fondC = der?.especes_comptees_cents ?? 0, mvFerme: any[] = [];
  if (!ouv) {
    mvFerme = (await sql`SELECT sens, montant_cents, motif, par, cree_le FROM mouvements_cash WHERE magasin = ${m} AND cree_le > ${der?.fermee_le ?? "1970-01-01"} ORDER BY id`) as any[];
    fondC += mvFerme.reduce((a, x) => a + (x.sens === "entree" ? x.montant_cents : -x.montant_cents), 0);
  }
  return c.json({ magasin: m, ouverte: ouvV, live, dernier: der ? vue(der) : null, fondConseilleCents: fondC, mouvementsFerme: mvFerme.map((x) => ({ sens: x.sens, cents: x.montant_cents, motif: x.motif, par: x.par ?? "", le: x.cree_le })) });
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

app.post("/api/caisse/mouvement", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const m = magDe(c);
  const sens = b.sens === "entree" ? "entree" : b.sens === "sortie" ? "sortie" : "";
  if (!sens) throw new AppError(400, "Choisis entrée ou sortie d'espèces.");
  const cents = euros(b.montant);
  if (cents <= 0) throw new AppError(400, "Indique le montant.");
  const motif = clean(b.motif, 200);
  if (!motif) throw new AppError(400, "Indique le motif (ex : reversement dépôt-vente, achat fournitures, fond de caisse).");
  const par = await vendeurParMdp(c, b.mdpCaissier);
  await sql`INSERT INTO mouvements_cash (magasin, sens, montant_cents, motif, par) VALUES (${m}, ${sens}, ${cents}, ${motif}, ${par})`;
  return c.json({ message: sens === "entree" ? "Entrée d'espèces enregistrée." : "Sortie d'espèces enregistrée." });
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
  const remb = (await sql`SELECT (rb.cree_le AT TIME ZONE 'Europe/Paris')::date::text AS j, sum(rb.montant_cents)::int AS n FROM remboursements rb LEFT JOIN reparations r ON r.id = rb.reparation_id
    WHERE COALESCE(rb.magasin, r.magasin) = ${m} AND (rb.cree_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${du}::date AND ${au}::date GROUP BY 1`) as any[];
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

// Ventes retrouvées après coup : celles du jour d'un ticket Z fermé, hors de sa fenêtre d'ouverture, pas encore ajoutées.
app.get("/api/caisse/ventes-orphelines", async (c) => {
  exigeResponsable(c);
  const id = Number(c.req.query("session"));
  const [s] = (await sql`SELECT * FROM caisse_sessions WHERE id = ${id} AND fermee_le IS NOT NULL`) as any[];
  if (!s) throw new AppError(404, "Ticket Z introuvable.");
  const deja = new Set<number>((await sql`SELECT (a->>'venteId')::int AS id FROM caisse_sessions, jsonb_array_elements(ajouts) a`).map((r: any) => r.id));
  const ventes = (await sql`SELECT id, numero_facture, total_cents, type, cree_le FROM ventes WHERE magasin = ${s.magasin}
    AND (cree_le AT TIME ZONE 'Europe/Paris')::date = ${s.jour}::date AND (cree_le < ${s.ouverte_le} OR cree_le > ${s.fermee_le}) ORDER BY cree_le`) as any[];
  return c.json({ ventes: ventes.filter((v) => !deja.has(v.id)).map((v) => ({ id: v.id, numero: v.numero_facture ?? `Ticket n° ${v.id}`, totalCents: v.total_cents, type: v.type, le: v.cree_le })) });
});

// Ajoute une vente retrouvée au ticket Z : recalcule totaux, espèces attendues et écart, et note la date d'ajout.
app.post("/api/caisse/ajouter-vente", async (c) => {
  exigeResponsable(c);
  const b = await c.req.json().catch(() => ({}));
  const [s] = (await sql`SELECT * FROM caisse_sessions WHERE id = ${Number(b.session)} AND fermee_le IS NOT NULL`) as any[];
  if (!s) throw new AppError(404, "Ticket Z introuvable.");
  const [v] = (await sql`SELECT id, numero_facture, total_cents, type FROM ventes WHERE id = ${Number(b.vente)} AND magasin = ${s.magasin}`) as any[];
  if (!v) throw new AppError(404, "Vente introuvable pour ce magasin.");
  const ajouts: any[] = s.ajouts ? parse(s.ajouts) : [];
  const [dejaAilleurs] = (await sql`SELECT 1 AS x FROM caisse_sessions, jsonb_array_elements(ajouts) a WHERE (a->>'venteId')::int = ${v.id} LIMIT 1`) as any[];
  if (dejaAilleurs) throw new AppError(409, "Cette vente est déjà ajoutée à un ticket Z.");
  const pay = (await sql`SELECT moyen, sum(montant_cents)::int AS n FROM vente_paiements WHERE vente_id = ${v.id} GROUP BY moyen`) as any[];
  const t = parse(s.totaux) ?? { encaisse: { carte: 0, especes: 0, virement: 0, en_ligne: 0 }, rembourse: {}, nbVentes: 0, nbAcomptes: 0, caCents: 0, especesNettes: 0 };
  let esp = 0;
  for (const p of pay) { t.encaisse[p.moyen] = (t.encaisse[p.moyen] ?? 0) + p.n; if (p.moyen === "especes") esp += p.n; }
  if (v.type === "acompte") { t.nbAcomptes = (t.nbAcomptes ?? 0) + 1; t.acomptesCents = (t.acomptesCents ?? 0) + v.total_cents; } else { t.nbVentes += 1; t.caCents += v.total_cents; }
  t.especesNettes = (t.especesNettes ?? 0) + esp;
  const attendu = (s.especes_attendues_cents ?? 0) + esp;
  const [{ le }] = (await sql`SELECT now() AS le`) as any[];
  ajouts.push({ venteId: v.id, numero: v.numero_facture ?? `Ticket n° ${v.id}`, totalCents: v.total_cents, especesCents: esp, ajouteLe: le });
  await sql`UPDATE caisse_sessions SET totaux = ${JSON.stringify(t)}::jsonb, nb_ventes = ${t.nbVentes}, especes_attendues_cents = ${attendu},
    ecart_cents = ${(s.especes_comptees_cents ?? 0) - attendu}, ajouts = ${JSON.stringify(ajouts)}::jsonb WHERE id = ${s.id}`;
  return c.json({ message: "Vente ajoutée au ticket Z." });
});
