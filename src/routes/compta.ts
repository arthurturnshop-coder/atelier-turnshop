import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { AppError, clean, exigeAdmin, magDe } from "../util";

// ---- Plan de comptes (modifiable par les admins) : à valider avec le comptable ----
await sql`CREATE TABLE IF NOT EXISTS comptes_compta (code TEXT PRIMARY KEY, libelle TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'produit', actif BOOLEAN NOT NULL DEFAULT true)`;
await sql`CREATE TABLE IF NOT EXISTS comptes_defauts (cle TEXT PRIMARY KEY, code TEXT NOT NULL)`;
await sql`CREATE TABLE IF NOT EXISTS analytiques (magasin TEXT PRIMARY KEY, code TEXT NOT NULL)`;
await sql`ALTER TABLE vente_lignes ADD COLUMN IF NOT EXISTS compte TEXT`;
await sql`ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS compte TEXT`;

const COMPTES: [string, string, string][] = [
  ["707", "Ventes de marchandises (pièces vendues)", "produit"],
  ["706", "Prestations de services (main d'œuvre)", "produit"],
  ["708", "Produits des activités annexes (port facturé)", "produit"],
  ["709", "Rabais, remises et ristournes accordés", "produit"],
  ["607", "Achats de marchandises (pièces achetées)", "charge"],
  ["606", "Achats non stockés (consommables)", "charge"],
  ["44571", "TVA collectée", "tva"],
  ["44566", "TVA déductible sur biens et services", "tva"],
  ["4191", "Clients - acomptes reçus", "tiers"],
  ["411", "Clients", "tiers"],
  ["511", "Cartes bancaires à l'encaissement", "tresorerie"],
  ["512", "Banque", "tresorerie"],
  ["530", "Caisse", "tresorerie"],
  ["471", "Compte d'attente (entrées / sorties de caisse à affecter)", "tiers"],
  ["4198", "Bons d'achat et avoirs à honorer", "tiers"],
];
const DEFAUTS: [string, string][] = [
  ["piece", "707"], ["article", "707"], ["main_oeuvre", "706"], ["consommable", "606"], ["port", "708"], ["remise", "709"],
  ["piece_achetee", "607"], ["tva_collectee", "44571"], ["tva_deductible", "44566"], ["acompte", "4191"],
  ["carte", "511"], ["especes", "530"], ["virement", "512"], ["en_ligne", "512"],
];
for (const [code, libelle, type] of COMPTES) await sql`INSERT INTO comptes_compta (code, libelle, type) VALUES (${code}, ${libelle}, ${type}) ON CONFLICT (code) DO NOTHING`;
for (const [cle, code] of DEFAUTS) await sql`INSERT INTO comptes_defauts (cle, code) VALUES (${cle}, ${code}) ON CONFLICT (cle) DO NOTHING`;
for (const [m, code] of [["Amiens", "AMI"], ["Rouen", "ROU"], ["Atelier", "ATE"]]) await sql`INSERT INTO analytiques (magasin, code) VALUES (${m}, ${code}) ON CONFLICT (magasin) DO NOTHING`;

app.get("/api/compta/config", async (c) => {
  exigeAdmin(c);
  const comptes = (await sql`SELECT code, libelle, type, actif FROM comptes_compta ORDER BY code`) as any[];
  const defauts = (await sql`SELECT cle, code FROM comptes_defauts ORDER BY cle`) as any[];
  const analytiques = (await sql`SELECT magasin, code FROM analytiques ORDER BY magasin`) as any[];
  return c.json({ comptes, defauts, analytiques });
});

app.post("/api/compta/compte", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const code = clean(b.code, 12).replace(/\s+/g, "");
  const libelle = clean(b.libelle, 120);
  if (!/^\d{2,10}$/.test(code)) throw new AppError(400, "Le code du compte est composé de chiffres (ex : 707).");
  if (!libelle) throw new AppError(400, "Indique le libellé du compte.");
  const type = ["produit", "charge", "tva", "tiers", "tresorerie"].includes(b.type) ? b.type : "produit";
  await sql`INSERT INTO comptes_compta (code, libelle, type) VALUES (${code}, ${libelle}, ${type}) ON CONFLICT (code) DO UPDATE SET libelle = ${libelle}, type = ${type}, actif = true`;
  return c.json({ message: "Compte enregistré." });
});

app.post("/api/compta/defaut", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const cle = clean(b.cle, 30), code = clean(b.code, 12);
  const [ex] = (await sql`SELECT 1 AS x FROM comptes_compta WHERE code = ${code}`) as any[];
  const [k] = (await sql`SELECT 1 AS x FROM comptes_defauts WHERE cle = ${cle}`) as any[];
  if (!ex || !k) throw new AppError(400, "Compte inconnu : ajoute-le d'abord dans la liste des comptes.");
  await sql`UPDATE comptes_defauts SET code = ${code} WHERE cle = ${cle}`;
  return c.json({ message: "Compte par défaut modifié." });
});

app.post("/api/compta/analytique", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const m = clean(b.magasin, 20), code = clean(b.code, 12).toUpperCase().replace(/\s+/g, "");
  if (!["Amiens", "Rouen", "Atelier"].includes(m) || !code) throw new AppError(400, "Code analytique invalide.");
  await sql`UPDATE analytiques SET code = ${code} WHERE magasin = ${m}`;
  return c.json({ message: "Code analytique modifié." });
});

// ---- Export : journal des ventes (écritures équilibrées, une écriture par vente / acompte) ----
const csv = (x: any) => { const s = String(x ?? ""); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const eur2 = (n: number) => (n / 100).toFixed(2).replace(".", ",");
const jjmmaaaa = (d: Date) => { const p = new Date(d.getTime() + 3600_000); return `${String(p.getUTCDate()).padStart(2, "0")}/${String(p.getUTCMonth() + 1).padStart(2, "0")}/${p.getUTCFullYear()}`; };

app.get("/api/compta/export", async (c) => {
  exigeAdmin(c);
  const du = clean(c.req.query("du"), 10), au = clean(c.req.query("au"), 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(du) || !/^\d{4}-\d{2}-\d{2}$/.test(au)) throw new AppError(400, "Indique la période (du / au).");
  const mq = clean(c.req.query("magasin"), 20);
  const mg: string | null = mq === "tous" ? null : mq === "Amiens" || mq === "Rouen" ? mq : magDe(c);
  const comptes = new Map(((await sql`SELECT code, libelle FROM comptes_compta`) as any[]).map((x) => [x.code, x.libelle]));
  const def = new Map(((await sql`SELECT cle, code FROM comptes_defauts`) as any[]).map((x) => [x.cle, x.code]));
  const ana = new Map(((await sql`SELECT magasin, code FROM analytiques`) as any[]).map((x) => [x.magasin, x.code]));
  const ventes = (await sql`SELECT v.*, c.prenom, c.nom FROM ventes v LEFT JOIN clients c ON c.id = v.client_id WHERE (v.cree_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${du}::date AND ${au}::date AND (${mg}::text IS NULL OR v.magasin IS NULL OR v.magasin = ${mg}) ORDER BY v.id`) as any[];
  const L: string[] = ["Journal;Date;Pièce;Compte;Libellé du compte;Libellé;Débit;Crédit;Analytique;Client"];
  const ecr = (dt: Date, piece: string, compte: string, lib: string, deb: number, cre: number, an: string, cl: string) =>
    L.push([ "VE", jjmmaaaa(dt), piece, compte, comptes.get(compte) ?? "", lib, deb ? eur2(deb) : "", cre ? eur2(cre) : "", an, cl ].map(csv).join(";"));
  let totalD = 0, totalC = 0;
  for (const v of ventes) {
    const dt = new Date(v.cree_le), piece = (v.type === "acompte" ? "AC-" : "V-") + String(v.id).padStart(6, "0");
    const an = v.reparation_id ? (ana.get("Atelier") ?? "ATE") : (ana.get(v.magasin) ?? "");
    const cl = `${v.prenom ?? ""} ${v.nom ?? ""}`.trim();
    const pays = (await sql`SELECT moyen, montant_cents FROM vente_paiements WHERE vente_id = ${v.id}`) as any[];
    const P = v.total_cents as number;
    for (const p of pays) ecr(dt, piece, def.get(p.moyen) ?? "512", `Encaissement ${p.moyen}`, p.montant_cents, 0, an, cl);
    totalD += pays.reduce((s, p) => s + p.montant_cents, 0);
    if (v.type === "acompte") {
      ecr(dt, piece, def.get("acompte") ?? "4191", "Acompte client", 0, P, an, cl);
      totalC += P;
      continue;
    }
    const lignes = (await sql`SELECT libelle, quantite, prix_unitaire_cents, type, compte FROM vente_lignes WHERE vente_id = ${v.id} ORDER BY id`) as any[];
    const A = v.acompte_deduit_cents ?? 0;
    const brut = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire_cents, 0);
    const R = Math.max(0, brut - A - P); // remises (fidélité, offres) en TTC
    const Rh = Math.round(R / 1.2);
    if (A) { ecr(dt, piece, def.get("acompte") ?? "4191", "Acompte déduit", A, 0, an, cl); totalD += A; }
    if (Rh) { ecr(dt, piece, def.get("remise") ?? "709", "Remises accordées", Rh, 0, an, cl); totalD += Rh; }
    let H = 0, dette = 0;
    for (const l of lignes) {
      const dv = /DV#(\d+)/.exec(String(l.libelle));
      if (dv) {
        // Dépôt-vente : on ne déclare que la commission + la remise en état ; le reste est dû au déposant (compte de tiers, hors CA et TVA)
        const tot = l.quantite * l.prix_unitaire_cents;
        const [d] = (await sql`SELECT * FROM depots_vente WHERE id = ${Number(dv[1])}`) as any[];
        const pris = d ? (await (await import("./depot")).vueDepot(d)) : null;
        const part = pris ? Math.min(tot, pris.commissionCents + pris.fraisCents) : tot;
        const due = tot - part;
        if (due > 0) { dette += due; ecr(dt, piece, "467", "Dépôt-vente à reverser au déposant", 0, due, an, cl); }
        const ht = Math.round(part / 1.2);
        H += ht;
        if (ht) ecr(dt, piece, "706", `Commission et remise en état dépôt-vente DV#${dv[1]}`, 0, ht, an, cl);
        continue;
      }
      const ht = Math.round((l.quantite * l.prix_unitaire_cents) / 1.2);
      H += ht;
      ecr(dt, piece, l.compte || def.get(l.type ?? "article") || def.get("article") || "707", l.libelle, 0, ht, an, cl);
    }
    const tva = pays.reduce((s, p) => s + p.montant_cents, 0) + A + Rh - H - dette; // TVA = ce qui équilibre l'écriture
    if (tva) ecr(dt, piece, def.get("tva_collectee") ?? "44571", "TVA collectée 20 %", 0, tva, an, cl);
    totalC += H + tva + dette;
  }
  // Reversements aux déposants (dépôt-vente) : on solde la dette 467 contre la caisse (530) ou la banque (512).
  const rv = (await sql`SELECT d.id, d.reverse_le, d.reverse_moyen, d.reverse_cents, c.prenom, c.nom FROM depots_vente d JOIN clients c ON c.id = d.client_id WHERE d.statut = 'reverse' AND d.reverse_cents > 0 AND (d.reverse_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${du}::date AND ${au}::date AND (${mg}::text IS NULL OR d.magasin IS NULL OR d.magasin = ${mg}) ORDER BY d.reverse_le`) as any[];
  for (const r of rv) {
    const dt = new Date(r.reverse_le), piece = "RV-DV" + String(r.id).padStart(5, "0"), cl = `${r.prenom ?? ""} ${r.nom ?? ""}`.trim();
    const cpt = r.reverse_moyen === "especes" ? (def.get("especes") ?? "530") : "512";
    const e = (compte: string, lib: string, deb: number, cre: number) => L.push([ "OD", jjmmaaaa(dt), piece, compte, comptes.get(compte) ?? "", lib, deb ? eur2(deb) : "", cre ? eur2(cre) : "", "", cl ].map(csv).join(";"));
    e("467", `Reversement dépôt-vente DV#${r.id} au déposant`, r.reverse_cents, 0);
    e(cpt, `Reversement dépôt-vente DV#${r.id} (${r.reverse_moyen})`, 0, r.reverse_cents);
  }
  // Remboursements clients : on annule la vente (remise 709 + TVA) ou l'acompte (4191) ; le moyen de remboursement sort de la caisse / banque / bons d'achat.
  const cptMoyen = (m: string) => (m === "especes" ? def.get("especes") ?? "530" : m === "carte" ? def.get("carte") ?? "511" : m === "bon" ? "4198" : def.get("virement") ?? "512");
  const rb = (await sql`SELECT r.id, r.cree_le, r.montant_cents, r.moyen, r.vente_id, COALESCE(r.magasin, rep.magasin) AS mag, c.prenom, c.nom FROM remboursements r LEFT JOIN reparations rep ON rep.id = r.reparation_id LEFT JOIN clients c ON c.id = r.client_id
    WHERE (r.cree_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${du}::date AND ${au}::date AND (${mg}::text IS NULL OR COALESCE(r.magasin, rep.magasin) IS NULL OR COALESCE(r.magasin, rep.magasin) = ${mg}) ORDER BY r.id`) as any[];
  for (const r of rb) {
    const dt = new Date(r.cree_le), piece = "RB-" + String(r.id).padStart(6, "0"), cl = `${r.prenom ?? ""} ${r.nom ?? ""}`.trim(), an = ana.get(r.mag) ?? "";
    const e = (compte: string, lib: string, deb: number, cre: number) => L.push([ "OD", jjmmaaaa(dt), piece, compte, comptes.get(compte) ?? "", lib, deb ? eur2(deb) : "", cre ? eur2(cre) : "", an, cl ].map(csv).join(";"));
    if (r.vente_id) {
      const ht = Math.round(r.montant_cents / 1.2);
      e(def.get("remise") ?? "709", `Remboursement client (vente V-${String(r.vente_id).padStart(6, "0")})`, ht, 0);
      e(def.get("tva_collectee") ?? "44571", "TVA collectée annulée 20 %", r.montant_cents - ht, 0);
    } else e(def.get("acompte") ?? "4191", "Remboursement d'acompte", r.montant_cents, 0);
    e(cptMoyen(r.moyen), `Remboursement client (${r.moyen})`, 0, r.montant_cents);
  }
  // Entrées / sorties de caisse (hors ventes) : à affecter par le comptable via le compte d'attente 471.
  const mv = (await sql`SELECT id, magasin, sens, montant_cents, motif, par, cree_le FROM mouvements_cash WHERE (cree_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${du}::date AND ${au}::date AND (${mg}::text IS NULL OR magasin = ${mg}) AND motif NOT LIKE 'Reversement dépôt-vente DV-%' ORDER BY id`) as any[]; // les reversements dépôt-vente ont déjà leur écriture RV-DV
  for (const m of mv) {
    const dt = new Date(m.cree_le), piece = "MC-" + String(m.id).padStart(6, "0"), an = ana.get(m.magasin) ?? "";
    const e = (compte: string, lib: string, deb: number, cre: number) => L.push([ "CA", jjmmaaaa(dt), piece, compte, comptes.get(compte) ?? "", lib, deb ? eur2(deb) : "", cre ? eur2(cre) : "", an, m.par ?? "" ].map(csv).join(";"));
    const lib = `${m.sens === "entree" ? "Entrée" : "Sortie"} de caisse : ${m.motif || "sans motif"}`;
    if (m.sens === "entree") { e(def.get("especes") ?? "530", lib, m.montant_cents, 0); e("471", lib, 0, m.montant_cents); }
    else { e("471", lib, m.montant_cents, 0); e(def.get("especes") ?? "530", lib, 0, m.montant_cents); }
  }
  const nom = `journal-${mg ? mg.toLowerCase() : "tous"}-${du}-${au}.csv`;
  return new Response("﻿" + L.join("\r\n") + "\r\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${nom}"` } });
});
