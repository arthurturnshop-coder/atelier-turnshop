import { app } from "../app";
import { sql } from "../db";
import "./auth";
import { exigeResponsable } from "../util";

// Statistiques : CA encaissé, ventes, réparations, techniciens, devis, stock. Réservé aux responsables.
app.get("/api/stats", async (c) => {
  exigeResponsable(c);
  const u = c.get("user") as any;
  const p = String(c.req.query("periode") ?? "mois");
  let m = String(c.req.query("magasin") ?? "");
  if (m !== "Amiens" && m !== "Rouen") m = "";
  if (u.role !== "admin" && !u.secours && u.magasin && (u.magasin === "Amiens" || u.magasin === "Rouen")) m = u.magasin;
  const [d] = (await sql`SELECT
    CASE ${p} WHEN 'jour' THEN today WHEN '7j' THEN today - 6 WHEN 'mois' THEN date_trunc('month', today)::date
      WHEN 'mois-1' THEN (date_trunc('month', today) - interval '1 month')::date WHEN 'annee' THEN date_trunc('year', today)::date ELSE date_trunc('month', today)::date END::text AS du,
    CASE ${p} WHEN 'mois-1' THEN (date_trunc('month', today) - interval '1 day')::date ELSE today END::text AS au,
    today::text AS aujourdhui
    FROM (SELECT (now() AT TIME ZONE 'Europe/Paris')::date AS today) t`) as any[];
  const { du, au } = d;
  const longueur = ((await sql`SELECT (${au}::date - ${du}::date + 1)::int AS n`) as any[])[0].n;
  const duPrec = ((await sql`SELECT (${du}::date - ${longueur}::int)::text AS d`) as any[])[0].d;
  const auPrec = ((await sql`SELECT (${du}::date - 1)::text AS d`) as any[])[0].d;

  const encaisse = async (a: string, b: string) => (((await sql`SELECT COALESCE(sum(pa.montant_cents), 0)::int AS n FROM vente_paiements pa JOIN ventes v ON v.id = pa.vente_id
    WHERE (v.cree_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${a}::date AND ${b}::date AND (${m} = '' OR v.magasin = ${m})`) as any[])[0].n) as number;
  const caCents = await encaisse(du, au), caPrec = await encaisse(duPrec, auPrec);
  const parMoyen = (await sql`SELECT pa.moyen, sum(pa.montant_cents)::int AS n FROM vente_paiements pa JOIN ventes v ON v.id = pa.vente_id
    WHERE (v.cree_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${du}::date AND ${au}::date AND (${m} = '' OR v.magasin = ${m}) GROUP BY pa.moyen ORDER BY 2 DESC`) as any[];
  const parJour = (await sql`SELECT (v.cree_le AT TIME ZONE 'Europe/Paris')::date::text AS j, sum(pa.montant_cents)::int AS n FROM vente_paiements pa JOIN ventes v ON v.id = pa.vente_id
    WHERE (v.cree_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${du}::date AND ${au}::date AND (${m} = '' OR v.magasin = ${m}) GROUP BY 1 ORDER BY 1`) as any[];
  const [vt] = (await sql`SELECT count(*)::int AS nb, COALESCE(sum(total_cents + acompte_deduit_cents), 0)::int AS total FROM ventes v
    WHERE v.type = 'vente' AND (v.cree_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${du}::date AND ${au}::date AND (${m} = '' OR v.magasin = ${m})`) as any[];
  const parType = (await sql`SELECT COALESCE(l.type, 'article') AS t, sum(l.quantite * l.prix_unitaire_cents)::int AS n FROM vente_lignes l JOIN ventes v ON v.id = l.vente_id
    WHERE v.type = 'vente' AND (v.cree_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${du}::date AND ${au}::date AND (${m} = '' OR v.magasin = ${m}) GROUP BY 1 ORDER BY 2 DESC`) as any[];
  const topArticles = (await sql`SELECT l.libelle, sum(l.quantite)::int AS qte, sum(l.quantite * l.prix_unitaire_cents)::int AS n FROM vente_lignes l JOIN ventes v ON v.id = l.vente_id
    WHERE v.type = 'vente' AND (v.cree_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${du}::date AND ${au}::date AND (${m} = '' OR v.magasin = ${m}) GROUP BY 1 ORDER BY 3 DESC LIMIT 8`) as any[];
  const [rep] = (await sql`SELECT
    (SELECT count(*)::int FROM reparations WHERE supprime_le IS NULL AND date_depot BETWEEN ${du}::date AND ${au}::date AND (${m} = '' OR magasin = ${m})) AS deposees,
    (SELECT count(*)::int FROM reparations WHERE supprime_le IS NULL AND (pret_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${du}::date AND ${au}::date AND (${m} = '' OR magasin = ${m})) AS pretes,
    (SELECT COALESCE(round(avg(EXTRACT(EPOCH FROM (pret_le - cree_le)) / 86400)::numeric, 1), 0)::float FROM reparations WHERE supprime_le IS NULL AND (pret_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${du}::date AND ${au}::date AND (${m} = '' OR magasin = ${m})) AS delai_jours,
    (SELECT count(*)::int FROM reparations WHERE supprime_le IS NULL AND statut NOT IN ('prêt', 'récupéré') AND (${m} = '' OR magasin = ${m})) AS en_cours`) as any[];
  const parModele = (await sql`SELECT t.marque || ' ' || t.modele AS n, count(*)::int AS nb FROM reparations r JOIN trottinettes t ON t.id = r.trottinette_id
    WHERE r.supprime_le IS NULL AND r.date_depot BETWEEN ${du}::date AND ${au}::date AND (${m} = '' OR r.magasin = ${m}) GROUP BY 1 ORDER BY 2 DESC LIMIT 6`) as any[];
  const parTech = (await sql`SELECT COALESCE(NULLIF(technicien, ''), 'Non attribué') AS n, count(*)::int AS nb FROM reparations
    WHERE supprime_le IS NULL AND (pret_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${du}::date AND ${au}::date AND (${m} = '' OR magasin = ${m}) GROUP BY 1 ORDER BY 2 DESC`) as any[];
  const [dv] = (await sql`SELECT count(*)::int AS envoyes, count(*) FILTER (WHERE e.statut = 'accepte')::int AS acceptes, count(*) FILTER (WHERE e.statut = 'refuse')::int AS refuses
    FROM devis_envois e JOIN reparations r ON r.id = e.reparation_id WHERE (e.envoye_le AT TIME ZONE 'Europe/Paris')::date BETWEEN ${du}::date AND ${au}::date AND (${m} = '' OR r.magasin = ${m})`) as any[];
  const [st] = (await sql`SELECT COALESCE(sum(qte * achat_ht_cents), 0)::int AS valeur, count(*) FILTER (WHERE stock_min > 0 AND qte < stock_min)::int AS a_recommander, count(*)::int AS refs
    FROM stock_produits WHERE archive_le IS NULL AND (${m} = '' OR magasin = ${m})`) as any[];
  return c.json({
    periode: p, du, au, magasin: m, peutChoisirMagasin: u.role === "admin" || !!u.secours,
    ca: { cents: caCents, precedentCents: caPrec, parMoyen: parMoyen.map((x) => ({ moyen: x.moyen, cents: x.n })), parJour: parJour.map((x) => ({ jour: x.j, cents: x.n })) },
    ventes: { nb: vt.nb, totalCents: vt.total, panierMoyenCents: vt.nb ? Math.round(vt.total / vt.nb) : 0, parType: parType.map((x) => ({ type: x.t, cents: x.n })), topArticles: topArticles.map((x) => ({ libelle: x.libelle, qte: x.qte, cents: x.n })) },
    reparations: { deposees: rep.deposees, pretes: rep.pretes, delaiJours: rep.delai_jours, enCours: rep.en_cours, parModele: parModele.map((x) => ({ nom: x.n, nb: x.nb })), parTechnicien: parTech.map((x) => ({ nom: x.n, nb: x.nb })) },
    devis: { envoyes: dv.envoyes, acceptes: dv.acceptes, refuses: dv.refuses },
    stock: { valeurCents: st.valeur, aRecommander: st.a_recommander, references: st.refs },
  });
});
