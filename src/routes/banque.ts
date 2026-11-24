import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { AppError, clean, exigeAdmin } from "../util";
import { createHash } from "node:crypto";

// Compta > Banque : débits et crédits du relevé bancaire, classés par catégorie et par magasin, tableaux par mois.
await sql`CREATE TABLE IF NOT EXISTS banque_ops (id SERIAL PRIMARY KEY, cle TEXT UNIQUE NOT NULL, jour DATE NOT NULL, libelle TEXT NOT NULL, debit_cents INT NOT NULL DEFAULT 0, credit_cents INT NOT NULL DEFAULT 0, categorie TEXT NOT NULL DEFAULT 'À classer', magasin TEXT NOT NULL DEFAULT 'Commun', manuel BOOLEAN NOT NULL DEFAULT false, importe_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS banque_regles (id SERIAL PRIMARY KEY, motif TEXT NOT NULL, sens TEXT NOT NULL DEFAULT 'debit', categorie TEXT NOT NULL, magasin TEXT NOT NULL DEFAULT 'Commun', ordre INT NOT NULL DEFAULT 100)`;

// Règles de départ (motif = expression régulière sur le libellé complet, en majuscules). Modifiables ensuite depuis l'écran.
const DEPART: [string, string, string, string][] = [
  ["COMCB|FRAIS PAIE CB|PAIE CB OP|EURO-INFORMATION|FACT SGT|SGT\\d{8}", "debit", "Frais bancaires", "Commun"],
  ["ECH PRET|PRET (CAP|INT|ASS)", "debit", "Emprunt (échéances)", "Commun"],
  ["AXA ASSURANCES", "debit", "Assurances", "Commun"],
  ["ORANGE", "debit", "Télécom et internet", "Commun"],
  ["REMB", "debit", "Remboursements", "Commun"],
  ["SHIFTER|GOOGLE WORKSPACE|ADOBE|ANTHROPIC|SHOPIFY\\*|SHOPIFY INC|RAILWAY|RING LLC|AMAZON PRIME", "debit", "Logiciels et abonnements", "Commun"],
  ["TEES THINGS|EW-\\d{5}", "debit", "Achats marchandises (Ewheel)", "Commun"],
  ["LSNR|VOLT-CORP|PROCONCEPT|JOYOR|WATTIZ|ALIEXPRESS|ALIPAY|IMPORT EXP", "debit", "Achats marchandises", "Commun"],
  ["VIR (FA\\d+|S\\d{5}|\\d{5})\\b|^(FA\\d+|S\\d{5}|\\d{5})\\b", "debit", "Achats marchandises (virements fournisseurs)", "Commun"],
  ["TOP ARTHUR|MASCRET ANTOINE|AMIAUD STEVEN|GUILLOT NICOLAS|TOP LOUIS|DANZELLE MARTIAL", "debit", "Salaires et rémunérations", "Commun"],
  ["C\\.ARGENT|RETRAIT", "debit", "Retraits espèces", "Commun"],
  ["NOTE DE FRAIS", "debit", "Notes de frais", "Commun"],
  ["BURGER KING|STARBUCKS|PAIN|SANEF|STATIONNEMEN|SUMUP|CANNEVIERE|PALU|SAVEURS", "debit", "Repas et déplacements", "Commun"],
  ["AUCHAN|INTERMARCH|LEROY|BUREAU VALLEE|AU BUREAU|ONLINEPRINTE|AMAZON", "debit", "Fournitures et petit matériel", "Commun"],
  ["REMCB", "credit", "Encaissements CB (TPE)", "Commun"],
  ["STRIPE|PAYPAL|SHOPIFY", "credit", "Ventes en ligne (Shopify)", "Commun"],
  ["VRST", "credit", "Dépôts d'espèces", "Commun"],
  ["REM CHQ", "credit", "Chèques remis", "Commun"],
  ["PAIEMENT CB|FRAIS PAIE CB|REMB", "credit", "Remboursements reçus", "Commun"],
  ["^VIR", "credit", "Virements reçus (clients)", "Commun"],
];
const [{ n: nbRegles }] = (await sql`SELECT count(*)::int AS n FROM banque_regles`) as any[];
if (!nbRegles) { let o = 10; for (const [m, s, c, mg] of DEPART) await sql`INSERT INTO banque_regles (motif, sens, categorie, magasin, ordre) VALUES (${m}, ${s}, ${c}, ${mg}, ${o += 10})`; }

type Regle = { motif: string; sens: string; categorie: string; magasin: string };
async function regles(): Promise<Regle[]> { return (await sql`SELECT motif, sens, categorie, magasin FROM banque_regles ORDER BY ordre, id`) as any[]; }
function classe(rs: Regle[], libelle: string, debit: number, credit: number): { categorie: string; magasin: string } {
  const t = libelle.toUpperCase();
  const sens = debit > 0 ? "debit" : "credit";
  for (const r of rs) {
    if (r.sens !== sens) continue;
    try { if (new RegExp(r.motif, "i").test(t)) { const rouen = /ROUEN|\bROU\b/.test(t), amiens = /AMIENS|LONGUEAU/.test(t); return { categorie: r.categorie, magasin: r.magasin !== "Commun" ? r.magasin : rouen ? "Rouen" : amiens ? "Amiens" : "Commun" }; } } catch { /* motif invalide : ignoré */ }
  }
  return { categorie: sens === "debit" ? "À classer" : "Autres encaissements", magasin: /ROUEN|\bROU\b/.test(t) ? "Rouen" : /AMIENS|LONGUEAU/.test(t) ? "Amiens" : "Commun" };
}

// --- Lecture d'un CSV de relevé (séparateur ; , ou tabulation). Colonnes reconnues : date, libellé/opération, débit, crédit (ou montant signé).
function decoupe(ligne: string, sep: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < ligne.length; i++) {
    const ch = ligne[i];
    if (ch === '"') { if (q && ligne[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === sep && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}
function centimes(s: string): number {
  const t = String(s ?? "").replace(/[\s €]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) : 0;
}
function signe(s: string): number { return /^\s*-/.test(String(s ?? "")) ? -1 : 1; }
function dateIso(s: string): string | null {
  const m = String(s ?? "").trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  const i = String(s ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return i ? `${i[1]}-${i[2]}-${i[3]}` : null;
}
function lireCsv(texte: string) {
  const lignes = texte.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lignes.length < 2) throw new AppError(400, "Fichier vide.");
  const sep = [";", "\t", ","].sort((a, b) => lignes[0].split(b).length - lignes[0].split(a).length)[0];
  const ent = decoupe(lignes[0], sep).map((x) => x.toLowerCase());
  const idx = (re: RegExp) => ent.findIndex((x) => re.test(x));
  const iDate = idx(/^date( de l.?op|$)|^date$/) >= 0 ? idx(/^date( de l.?op|$)|^date$/) : idx(/date/);
  const iLib = idx(/libell|op[ée]ration|d[ée]tail|description/);
  const iDeb = idx(/d[ée]bit/), iCre = idx(/cr[ée]dit/), iMont = idx(/montant/);
  if (iDate < 0 || iLib < 0 || (iDeb < 0 && iCre < 0 && iMont < 0)) throw new AppError(400, "Colonnes non reconnues : il faut au minimum date, libellé et débit/crédit (ou montant).");
  const ops: { jour: string; libelle: string; debit: number; credit: number }[] = [];
  for (const l of lignes.slice(1)) {
    const c = decoupe(l, sep);
    const jour = dateIso(c[iDate]); if (!jour) continue;
    let debit = iDeb >= 0 ? centimes(c[iDeb]) : 0, credit = iCre >= 0 ? centimes(c[iCre]) : 0;
    if (iMont >= 0 && !debit && !credit) { const v = centimes(c[iMont]); if (signe(c[iMont]) < 0) debit = v; else credit = v; }
    if (!debit && !credit) continue;
    ops.push({ jour, libelle: clean(c[iLib], 400).replace(/\s+/g, " "), debit, credit });
  }
  return ops;
}

app.post("/api/banque/import", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const ops = lireCsv(String(b.texte ?? "").slice(0, 3_000_000));
  if (!ops.length) throw new AppError(400, "Aucune opération trouvée dans ce fichier.");
  const rs = await regles();
  const vus = new Map<string, number>();
  let nouveaux = 0;
  for (const o of ops) {
    const base = `${o.jour}|${o.libelle}|${o.debit}|${o.credit}`;
    const rang = (vus.get(base) ?? 0) + 1; vus.set(base, rang);
    const cle = createHash("sha1").update(base + "|" + rang).digest("hex");
    const k = classe(rs, o.libelle, o.debit, o.credit);
    const r = (await sql`INSERT INTO banque_ops (cle, jour, libelle, debit_cents, credit_cents, categorie, magasin) VALUES (${cle}, ${o.jour}, ${o.libelle}, ${o.debit}, ${o.credit}, ${k.categorie}, ${k.magasin}) ON CONFLICT (cle) DO NOTHING RETURNING id`) as any[];
    if (r.length) nouveaux++;
  }
  return c.json({ message: `${nouveaux} opération(s) ajoutée(s), ${ops.length - nouveaux} déjà connue(s).`, nouveaux });
});

// Opérations d'un mois (ou toutes les « À classer »).
app.get("/api/banque/ops", async (c) => {
  exigeAdmin(c);
  const mois = clean(c.req.query("mois"), 7), aClasser = c.req.query("a_classer") === "1";
  const rows = (aClasser
    ? await sql`SELECT * FROM banque_ops WHERE categorie = 'À classer' ORDER BY jour DESC, id DESC LIMIT 400`
    : await sql`SELECT * FROM banque_ops WHERE to_char(jour, 'YYYY-MM') = ${mois} ORDER BY jour DESC, id DESC LIMIT 800`) as any[];
  const cats = (await sql`SELECT DISTINCT categorie FROM banque_ops UNION SELECT DISTINCT categorie FROM banque_regles ORDER BY 1`) as any[];
  return c.json({ categories: cats.map((x) => x.categorie), ops: rows.map((r) => ({ id: r.id, jour: String(r.jour instanceof Date ? r.jour.toLocaleDateString("sv-SE") : r.jour).slice(0, 10), libelle: r.libelle, debitCents: r.debit_cents, creditCents: r.credit_cents, categorie: r.categorie, magasin: r.magasin })) });
});

// Synthèse : par mois, catégorie × magasin.
app.get("/api/banque/synthese", async (c) => {
  exigeAdmin(c);
  const sens = c.req.query("sens") === "credit" ? "credit" : "debit";
  const rows = (sens === "debit"
    ? await sql`SELECT to_char(jour, 'YYYY-MM') AS mois, categorie, magasin, sum(debit_cents)::int AS n FROM banque_ops WHERE debit_cents > 0 GROUP BY 1, 2, 3`
    : await sql`SELECT to_char(jour, 'YYYY-MM') AS mois, categorie, magasin, sum(credit_cents)::int AS n FROM banque_ops WHERE credit_cents > 0 GROUP BY 1, 2, 3`) as any[];
  const [{ n: aClasser }] = (await sql`SELECT count(*)::int AS n FROM banque_ops WHERE categorie = 'À classer'`) as any[];
  const mois: Record<string, Record<string, Record<string, number>>> = {};
  for (const r of rows) { ((mois[r.mois] ??= {})[r.categorie] ??= {})[r.magasin] = r.n; }
  // TVA estimée : montants TTC à 20 % sur les catégories concernées (estimation, à confirmer avec le comptable).
  const avecTva = sens === "debit" ? /achats|logiciels|télécom|fournitures/i : /encaissements|ventes|dépôts|chèques|virements reçus/i;
  return c.json({ sens, aClasser, mois: Object.keys(mois).sort().reverse().map((m) => {
    const lignes = Object.entries(mois[m]).map(([categorie, v]) => { const total = (v.Amiens ?? 0) + (v.Rouen ?? 0) + (v.Commun ?? 0); return { categorie, amiens: v.Amiens ?? 0, rouen: v.Rouen ?? 0, commun: v.Commun ?? 0, tva: avecTva.test(categorie) ? Math.round(total / 6) : 0 }; }).sort((a, b) => (b.amiens + b.rouen + b.commun) - (a.amiens + a.rouen + a.commun));
    return { mois: m, total: lignes.reduce((t, l) => t + l.amiens + l.rouen + l.commun, 0), tva: lignes.reduce((t, l) => t + l.tva, 0), lignes };
  }) });
});


// Pilotage : CA (caisse + web), marge brute estimée, charges, résultat et TVA estimés, par mois.
app.get("/api/banque/pilotage", async (c) => {
  exigeAdmin(c);
  const caisse = (await sql`SELECT to_char(cree_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM') AS mois, COALESCE(magasin, 'Commun') AS magasin, sum(total_cents)::int AS ttc, count(*)::int AS nb FROM ventes WHERE type = 'vente' GROUP BY 1, 2`) as any[];
  const deb = (await sql`SELECT to_char(jour, 'YYYY-MM') AS mois, categorie, sum(debit_cents)::int AS n FROM banque_ops WHERE debit_cents > 0 GROUP BY 1, 2`) as any[];
  const web = (await sql`SELECT to_char(jour, 'YYYY-MM') AS mois, sum(credit_cents)::int AS n FROM banque_ops WHERE credit_cents > 0 AND categorie ILIKE '%ventes en ligne%' GROUP BY 1`) as any[];
  const ms = new Set<string>([...caisse.map((r) => r.mois), ...deb.map((r) => r.mois), ...web.map((r) => r.mois)]);
  const ht = (n: number) => Math.round(n / 1.2);
  const mois = [...ms].sort().reverse().map((m) => {
    const cs = caisse.filter((r) => r.mois === m);
    const am = cs.find((r) => r.magasin === "Amiens")?.ttc ?? 0, ro = cs.find((r) => r.magasin === "Rouen")?.ttc ?? 0;
    const caisseTtc = cs.reduce((t, r) => t + r.ttc, 0), nb = cs.reduce((t, r) => t + r.nb, 0);
    const webTtc = web.find((r) => r.mois === m)?.n ?? 0;
    const caTtc = caisseTtc + webTtc, caHt = ht(caTtc);
    let achatsTtc = 0, salaires = 0, tvaRec = 0, charges = 0, retraits = 0;
    for (const r of deb.filter((x) => x.mois === m)) {
      const cat = String(r.categorie);
      if (/retraits/i.test(cat)) { retraits += r.n; continue; }
      if (/^remboursements/i.test(cat)) continue;
      const avecTva = /achats|logiciels|télécom|fournitures/i.test(cat);
      if (avecTva) tvaRec += Math.round(r.n / 6);
      if (/achats/i.test(cat)) achatsTtc += r.n;
      else if (/salaires/i.test(cat)) salaires += r.n;
      else charges += avecTva ? ht(r.n) : r.n;
    }
    const achatsHt = ht(achatsTtc), marge = caHt - achatsHt;
    return { mois: m, amiens: am, rouen: ro, web: webTtc, caTtc, caHt, nb, panier: nb ? Math.round(caisseTtc / nb) : 0, achatsHt, marge, margePct: caHt > 0 ? Math.round((marge * 1000) / caHt) / 10 : 0, salaires, charges, resultat: marge - salaires - charges, tvaCollectee: Math.round(caTtc / 6), tvaRecup: tvaRec, tvaAPayer: Math.round(caTtc / 6) - tvaRec, retraits };
  });
  return c.json({ mois });
});

app.post("/api/banque/classer", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id), categorie = clean(b.categorie, 80), magasin = ["Amiens", "Rouen", "Commun"].includes(b.magasin) ? b.magasin : "Commun";
  if (!(id > 0) || !categorie) throw new AppError(400, "Choisis une catégorie.");
  const [o] = (await sql`UPDATE banque_ops SET categorie = ${categorie}, magasin = ${magasin}, manuel = true WHERE id = ${id} RETURNING libelle, debit_cents, credit_cents`) as any[];
  if (!o) throw new AppError(404, "Opération introuvable.");
  let regle = "";
  if (b.memoriser) {
    const mots = o.libelle.toUpperCase().replace(/\d+/g, " ").split(/[^A-ZÀ-Ý*.-]+/).filter((w: string) => w.length >= 4 && !/^(PAIEMENT|CARTE|SEPA|PRLV|REMB|FRAIS|VIREMENT|EUROS?)$/.test(w)).slice(0, 2);
    if (mots.length) {
      regle = mots.map((w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
      const sens = o.debit_cents > 0 ? "debit" : "credit";
      await sql`INSERT INTO banque_regles (motif, sens, categorie, magasin, ordre) VALUES (${regle}, ${sens}, ${categorie}, ${magasin}, 5)`;
      // Applique la nouvelle règle aux autres opérations pas encore corrigées à la main.
      const autres = (await sql`SELECT id, libelle, debit_cents, credit_cents FROM banque_ops WHERE manuel = false AND ((${sens} = 'debit' AND debit_cents > 0) OR (${sens} = 'credit' AND credit_cents > 0))`) as any[];
      for (const a of autres) { try { if (new RegExp(regle, "i").test(a.libelle.toUpperCase())) await sql`UPDATE banque_ops SET categorie = ${categorie}, magasin = ${magasin} WHERE id = ${a.id}`; } catch { /* ignoré */ } }
    }
  }
  return c.json({ message: regle ? "Classé, et règle mémorisée pour les prochains relevés." : "Classé.", regle });
});

app.get("/api/banque/export", async (c) => {
  exigeAdmin(c);
  const rows = (await sql`SELECT to_char(jour, 'YYYY-MM') AS mois, categorie, magasin, sum(debit_cents)::int AS d, sum(credit_cents)::int AS cr FROM banque_ops GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2`) as any[];
  const e = (n: number) => (n / 100).toFixed(2).replace(".", ",");
  const csv = "mois;categorie;magasin;debits;credits\n" + rows.map((r) => `${r.mois};"${r.categorie}";${r.magasin};${e(r.d)};${e(r.cr)}`).join("\n");
  return c.json({ csv });
});
