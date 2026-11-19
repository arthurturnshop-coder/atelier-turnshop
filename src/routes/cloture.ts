import { app } from "../app";
import { sql } from "../db";
import "./auth";
import { AppError, clean } from "../util";

// Clôture de caisse (ticket Z) : encaissements du jour par moyen, remboursements, comptage des espèces, écart.
await sql`CREATE TABLE IF NOT EXISTS clotures_caisse (
  id SERIAL PRIMARY KEY, magasin TEXT NOT NULL, jour DATE NOT NULL, fond_cents INT NOT NULL DEFAULT 0,
  especes_attendues_cents INT NOT NULL, especes_comptees_cents INT NOT NULL, ecart_cents INT NOT NULL,
  totaux JSONB NOT NULL, nb_ventes INT NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', par TEXT NOT NULL DEFAULT '',
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (magasin, jour))`;

const magDe = (c: any) => (c.get("user")?.magasin === "Rouen" ? "Rouen" : "Amiens");
const jourOk = (j: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(j ?? "")) ? String(j) : "");

async function calcul(m: string, jour: string) {
  const pay = (await sql`SELECT p.moyen, sum(p.montant_cents)::int AS n FROM vente_paiements p JOIN ventes v ON v.id = p.vente_id
    WHERE v.magasin = ${m} AND (v.cree_le AT TIME ZONE 'Europe/Paris')::date = ${jour}::date GROUP BY p.moyen`) as any[];
  const [nb] = (await sql`SELECT count(*)::int AS n, COALESCE(sum(total_cents), 0)::int AS total FROM ventes
    WHERE magasin = ${m} AND COALESCE(type, '') <> 'acompte' AND (cree_le AT TIME ZONE 'Europe/Paris')::date = ${jour}::date`) as any[];
  const [ac] = (await sql`SELECT count(*)::int AS n FROM ventes WHERE magasin = ${m} AND type = 'acompte' AND (cree_le AT TIME ZONE 'Europe/Paris')::date = ${jour}::date`) as any[];
  const remb = (await sql`SELECT rb.moyen, sum(rb.montant_cents)::int AS n FROM remboursements rb JOIN reparations r ON r.id = rb.reparation_id
    WHERE r.magasin = ${m} AND (rb.cree_le AT TIME ZONE 'Europe/Paris')::date = ${jour}::date GROUP BY rb.moyen`) as any[];
  const par: Record<string, number> = { carte: 0, especes: 0, virement: 0, en_ligne: 0 };
  for (const p of pay) par[p.moyen] = p.n;
  const rem: Record<string, number> = {};
  for (const r of remb) rem[r.moyen] = r.n;
  return { encaisse: par, rembourse: rem, nbVentes: nb.n, nbAcomptes: ac.n, caCents: nb.total, especesNettes: par.especes - (rem.especes ?? 0) };
}

app.get("/api/caisse/cloture", async (c) => {
  const m = magDe(c);
  const jour = jourOk(c.req.query("jour")) || ((await sql`SELECT (now() AT TIME ZONE 'Europe/Paris')::date::text AS j`) as any[])[0].j;
  const calc = await calcul(m, jour);
  const [ex] = (await sql`SELECT * FROM clotures_caisse WHERE magasin = ${m} AND jour = ${jour}::date`) as any[];
  const recents = (await sql`SELECT jour::text AS jour, ecart_cents, par FROM clotures_caisse WHERE magasin = ${m} ORDER BY jour DESC LIMIT 7`) as any[];
  return c.json({ magasin: m, jour, ...calc, cloture: ex ? { fondCents: ex.fond_cents, attenduCents: ex.especes_attendues_cents, compteCents: ex.especes_comptees_cents, ecartCents: ex.ecart_cents, note: ex.note, par: ex.par, le: ex.cree_le, totaux: ex.totaux } : null, recents: recents.map((r) => ({ jour: r.jour, ecartCents: r.ecart_cents, par: r.par })) });
});

app.post("/api/caisse/cloture", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const m = magDe(c);
  const jour = jourOk(b.jour) || ((await sql`SELECT (now() AT TIME ZONE 'Europe/Paris')::date::text AS j`) as any[])[0].j;
  const euros = (x: any) => Math.round((Number(String(x ?? "").replace(",", ".")) || 0) * 100);
  const fond = Math.max(0, euros(b.fond)), compte = euros(b.compte);
  if (b.compte === undefined || b.compte === "" || compte < 0) throw new AppError(400, "Saisis le montant d'espèces compté dans le tiroir.");
  const calc = await calcul(m, jour);
  const attendu = fond + calc.especesNettes;
  const u = c.get("user") as any;
  try {
    await sql`INSERT INTO clotures_caisse (magasin, jour, fond_cents, especes_attendues_cents, especes_comptees_cents, ecart_cents, totaux, nb_ventes, note, par)
      VALUES (${m}, ${jour}::date, ${fond}, ${attendu}, ${compte}, ${compte - attendu}, ${JSON.stringify(calc)}::jsonb, ${calc.nbVentes}, ${clean(b.note, 300)}, ${u?.prenom ?? ""})`;
  } catch { throw new AppError(409, "La caisse de ce jour est déjà clôturée."); }
  return c.json({ message: "Caisse clôturée." });
});
