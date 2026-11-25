import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import "./banque";
import { AppError, clean, exigeAdmin } from "../util";

// ---------- Compta > Synthèse : CA logiciel, CA banque, rapprochement, TVA estimée, dépenses par pôle, marge ----------
await sql`CREATE TABLE IF NOT EXISTS tva_deductible_mois (mois TEXT PRIMARY KEY, montant_cents INT NOT NULL)`;

const ENT = ["Amiens", "Rouen", "Commun"] as const;
type Ent = (typeof ENT)[number];
const entDe = (m: any): Ent => (m === "Amiens" || m === "Rouen" ? m : "Commun");
const ht = (n: number) => Math.round(n / 1.2);
const tva6 = (n: number) => Math.round(n / 6); // TVA contenue dans un TTC à 20 %
const zero = () => ({ Amiens: 0, Rouen: 0, Commun: 0 }) as Record<Ent, number>;
const somme = (o: Record<Ent, number>) => o.Amiens + o.Rouen + o.Commun;

// Pôles de dépenses (catégories de la banque). avecTva : le relevé est en TTC, on passe en HT.
const POLES: { cle: string; nom: string; re: RegExp; tva: boolean }[] = [
  { cle: "pieces", nom: "Pièces détachées et marchandises", re: /^achats/i, tva: true },
  { cle: "salaires", nom: "Salaires et rémunérations", re: /salaires/i, tva: false },
  { cle: "web", nom: "Site web et logiciels", re: /logiciels/i, tva: true },
  { cle: "banque", nom: "Frais bancaires et emprunt", re: /frais bancaires|emprunt/i, tva: false },
  { cle: "assur", nom: "Assurances et télécom", re: /assurances|télécom/i, tva: true },
  { cle: "fourn", nom: "Fournitures, repas et déplacements", re: /fournitures|repas|notes de frais/i, tva: true },
];
const AUTRE = { cle: "autres", nom: "À classer / autres dépenses", tva: false };
const DEDUCTIBLE = /achats|logiciels|télécom|fournitures/i; // catégories dont on estime la TVA récupérable (comme le Pilotage)

app.get("/api/compta/synthese", async (c) => {
  exigeAdmin(c);
  const m = clean(c.req.query("mois"), 7);
  const lm = ((await sql`SELECT DISTINCT to_char(cree_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM') AS m FROM ventes UNION SELECT DISTINCT to_char(jour, 'YYYY-MM') FROM banque_ops`) as any[]).map((r) => r.m as string).filter(Boolean).sort().reverse();
  const mois = /^\d{4}-\d{2}$/.test(m) ? m : lm[0];
  if (!mois) return c.json({ liste: [], mois: "" });

  // --- Logiciel (ventes FS) ---
  const vts = (await sql`SELECT COALESCE(magasin, 'Commun') AS mg, sum(total_cents + acompte_deduit_cents)::int AS ttc, count(*)::int AS nb FROM ventes WHERE type = 'vente' AND to_char(cree_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM') = ${mois} GROUP BY 1`) as any[];
  const rbs = (await sql`SELECT COALESCE(r.magasin, rep.magasin, 'Commun') AS mg, sum(r.montant_cents)::int AS n FROM remboursements r LEFT JOIN reparations rep ON rep.id = r.reparation_id WHERE r.vente_id IS NOT NULL AND to_char(r.cree_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM') = ${mois} GROUP BY 1`) as any[];
  const pay = (await sql`SELECT COALESCE(v.magasin, 'Commun') AS mg, p.moyen, sum(p.montant_cents)::int AS n FROM vente_paiements p JOIN ventes v ON v.id = p.vente_id WHERE to_char(v.cree_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM') = ${mois} GROUP BY 1, 2`) as any[];
  const mvc = (await sql`SELECT magasin AS mg, sens, sum(montant_cents)::int AS n FROM mouvements_cash WHERE to_char(cree_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM') = ${mois} AND motif NOT LIKE 'Reversement dépôt-vente DV-%' GROUP BY 1, 2`) as any[];
  const logTtc = zero(), logNb = zero(), logRemb = zero(), logCb = zero(), logEsp = zero(), logVir = zero(), logMvt = zero();
  for (const r of vts) { logTtc[entDe(r.mg)] += r.ttc; logNb[entDe(r.mg)] += r.nb; }
  for (const r of rbs) logRemb[entDe(r.mg)] += r.n;
  for (const r of pay) (r.moyen === "carte" ? logCb : r.moyen === "especes" ? logEsp : logVir)[entDe(r.mg)] += r.n;
  for (const r of mvc) logMvt[entDe(r.mg)] += r.sens === "entree" ? r.n : -r.n;
  const nbLog = somme(logNb);

  // --- Banque ---
  const cre = (await sql`SELECT magasin, categorie, sum(credit_cents)::int AS n FROM banque_ops WHERE credit_cents > 0 AND to_char(jour, 'YYYY-MM') = ${mois} GROUP BY 1, 2`) as any[];
  const deb = (await sql`SELECT magasin, categorie, sum(debit_cents)::int AS n FROM banque_ops WHERE debit_cents > 0 AND to_char(jour, 'YYYY-MM') = ${mois} GROUP BY 1, 2`) as any[];
  const bCb = zero(), bEsp = zero(), bVir = zero(), bCa = zero();
  for (const r of cre) {
    const e = entDe(r.magasin), cat = String(r.categorie);
    if (/encaissements cb/i.test(cat)) bCb[e] += r.n;
    else if (/dépôts/i.test(cat)) bEsp[e] += r.n;
    else if (/chèques|virements reçus|ventes en ligne/i.test(cat)) bVir[e] += r.n;
    if (/ventes en ligne|encaissements|dépôts|chèques remis|virements reçus/i.test(cat)) bCa[e] += r.n;
  }
  let retraits = 0;
  for (const r of deb) if (/retraits/i.test(String(r.categorie))) retraits += r.n;
  const releve = cre.length > 0 || deb.length > 0;

  // --- CA retenu pour la marge : logiciel s'il y a des ventes ce mois-là, sinon encaissements de la banque ---
  const source = nbLog > 0 ? "logiciel" : "banque";
  const caTtc = zero();
  for (const e of ENT) caTtc[e] = source === "logiciel" ? Math.max(0, logTtc[e] - logRemb[e]) + (e === "Commun" ? bVir_enLigne(cre) : 0) : bCa[e];
  function bVir_enLigne(rows: any[]) { return rows.filter((r) => /ventes en ligne/i.test(String(r.categorie))).reduce((t, r) => t + r.n, 0); }

  // --- Rapprochement logiciel / banque ---
  const ligneR = (nom: string, log: Record<Ent, number>, ban: Record<Ent, number>) => ({ nom, amiens: { log: log.Amiens, ban: ban.Amiens }, rouen: { log: log.Rouen, ban: ban.Rouen }, ensemble: { log: somme(log), ban: somme(ban) } });
  const espLog = zero(); for (const e of ENT) espLog[e] = logEsp[e] + logMvt[e];
  const rapprochement = [
    ligneR("Cartes bancaires (TPE)", logCb, bCb),
    ligneR("Espèces (encaissées, nettes des entrées/sorties, vs dépôts en banque)", espLog, bEsp),
    ligneR("Virements, chèques et ventes en ligne", logVir, bVir),
  ];

  // --- TVA estimée ---
  const [tm] = (await sql`SELECT montant_cents FROM tva_deductible_mois WHERE mois = ${mois}`) as any[];
  let dedEstim = 0;
  for (const r of deb) if (DEDUCTIBLE.test(String(r.categorie))) dedEstim += tva6(r.n);
  const collectee = tva6(somme(caTtc));
  const tva = { collectee, deductibleEstimee: dedEstim, deductibleSaisie: tm ? tm.montant_cents : null,
    sansAchats: collectee, avecEstimee: collectee - dedEstim, avecSaisie: tm ? collectee - tm.montant_cents : null };

  // --- Dépenses par pôle (HT quand le relevé est en TTC) et marges ---
  const poles = [...POLES.map((p) => ({ cle: p.cle, nom: p.nom })), { cle: AUTRE.cle, nom: AUTRE.nom }].map((p) => ({ ...p, v: zero() }));
  for (const r of deb) {
    const cat = String(r.categorie);
    if (/retraits|^remboursements/i.test(cat)) continue;
    const def = POLES.find((p) => p.re.test(cat));
    const pole = poles.find((p) => p.cle === (def ? def.cle : AUTRE.cle))!;
    pole.v[entDe(r.magasin)] += def?.tva ? ht(r.n) : r.n;
  }
  const caHt = zero(); for (const e of ENT) caHt[e] = ht(caTtc[e]);
  const pieces = poles.find((p) => p.cle === "pieces")!.v;
  const margeBrute = zero(), charges = zero(), net = zero();
  for (const e of ENT) {
    margeBrute[e] = caHt[e] - pieces[e];
    charges[e] = poles.filter((p) => p.cle !== "pieces").reduce((t, p) => t + p.v[e], 0);
    net[e] = margeBrute[e] - charges[e];
  }
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n * 1000) / d) / 10 : null);
  return c.json({
    liste: lm, mois, releve, source, nbVentes: nbLog,
    caLogiciel: { amiens: { ttc: logTtc.Amiens, remb: logRemb.Amiens, nb: logNb.Amiens }, rouen: { ttc: logTtc.Rouen, remb: logRemb.Rouen, nb: logNb.Rouen }, commun: { ttc: logTtc.Commun, remb: logRemb.Commun, nb: logNb.Commun } },
    caBanque: { amiens: bCa.Amiens, rouen: bCa.Rouen, commun: bCa.Commun, retraitsEspeces: retraits },
    rapprochement, tva,
    poles: poles.map((p) => ({ cle: p.cle, nom: p.nom, amiens: p.v.Amiens, rouen: p.v.Rouen, commun: p.v.Commun, total: somme(p.v) })),
    marges: { caHt: { amiens: caHt.Amiens, rouen: caHt.Rouen, commun: caHt.Commun, total: somme(caHt) }, margeBrute: { amiens: margeBrute.Amiens, rouen: margeBrute.Rouen, commun: margeBrute.Commun, total: somme(margeBrute), pct: pct(somme(margeBrute), somme(caHt)) }, charges: { amiens: charges.Amiens, rouen: charges.Rouen, commun: charges.Commun, total: somme(charges) }, net: { amiens: net.Amiens, rouen: net.Rouen, commun: net.Commun, total: somme(net), pct: pct(somme(net), somme(caHt)) } },
  });
});

app.post("/api/compta/tva-deductible", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const mois = clean(b.mois, 7);
  if (!/^\d{4}-\d{2}$/.test(mois)) throw new AppError(400, "Mois invalide.");
  const brut = String(b.montant ?? "").trim();
  if (!brut) { await sql`DELETE FROM tva_deductible_mois WHERE mois = ${mois}`; return c.json({ message: "TVA déductible saisie retirée : l'estimation reprend." }); }
  const n = Number(brut.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new AppError(400, "Montant invalide.");
  await sql`INSERT INTO tva_deductible_mois (mois, montant_cents) VALUES (${mois}, ${Math.round(n * 100)}) ON CONFLICT (mois) DO UPDATE SET montant_cents = EXCLUDED.montant_cents`;
  return c.json({ message: "TVA déductible du mois enregistrée." });
});
