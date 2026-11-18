import { app } from "../app";
import { MAGASINS } from "../config";
import { sql } from "../db";
import { AppError, clean, magasinsDe, signature } from "../util";

export function partsParis(d: Date): Record<string, string> {
  const p: Record<string, string> = {};
  const f = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  return p;
}

export async function magasinDemande(c: any, brut: unknown): Promise<string> {
  const u = c.get("user");
  const m = clean(brut, 20) || u.magasin || "";
  if (!MAGASINS.includes(m)) throw new AppError(400, "Magasin inconnu.");
  if (!u.secours) {
    const [row] = await sql`SELECT magasins FROM utilisateurs WHERE prenom = ${u.prenom} AND actif = true`;
    if (!row || !magasinsDe(row).includes(m)) throw new AppError(403, "Pas d'accès à ce magasin.");
  }
  return m;
}

export function ligneListePlanning(r: any) {
  return {
    id: r.id,
    customerId: r.client_id,
    client: `${r.prenom} ${r.nom}`.trim(),
    trottinette: `${r.marque} ${r.modele} (N° ${r.serie})`,
    panne: r.panne,
    statut: r.statut,
    technicien: r.technicien,
    debut: r.debut,
    dureeMin: r.duree_min,
    enMagasin: r.en_magasin !== false,
  };
}

app.get("/api/planning", async (c) => {
  const jour = clean(c.req.query("jour"), 10) || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || isNaN(Date.parse(jour))) throw new AppError(400, "Date invalide.");
  const magasin = await magasinDemande(c, c.req.query("magasin"));
  const magasinUtilisateur = c.get("user").magasin ?? magasin;

  const utilisateurs = await sql`SELECT prenom, magasins FROM utilisateurs WHERE actif = true ORDER BY id`;
  const techniciens = (utilisateurs as any[]).filter((u) => magasinsDe(u).includes(magasin)).map((u) => u.prenom);

  const planifiees = await sql`SELECT r.id, r.client_id, r.statut, r.panne, r.technicien, r.debut, r.duree_min, r.en_magasin,
      c.prenom, c.nom, t.marque, t.modele, t.serie
    FROM reparations r
    JOIN clients c ON c.id = r.client_id
    JOIN trottinettes t ON t.id = r.trottinette_id
    WHERE r.debut IS NOT NULL AND r.supprime_le IS NULL
      AND to_char(r.debut AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') = ${jour}
      AND COALESCE(r.magasin, ${magasinUtilisateur}) = ${magasin}
    ORDER BY r.debut, r.id`;
  const nonPlanifiees = await sql`SELECT r.id, r.client_id, r.statut, r.panne, r.technicien, r.debut, r.duree_min, r.en_magasin,
      c.prenom, c.nom, t.marque, t.modele, t.serie
    FROM reparations r
    JOIN clients c ON c.id = r.client_id
    JOIN trottinettes t ON t.id = r.trottinette_id
    WHERE r.debut IS NULL AND r.supprime_le IS NULL
      AND r.statut <> 'récupéré'
      AND COALESCE(r.magasin, ${magasinUtilisateur}) = ${magasin}
    ORDER BY r.cree_le, r.id`;

  return c.json({
    techniciens,
    planifiees: (planifiees as any[]).map(ligneListePlanning),
    nonPlanifiees: (nonPlanifiees as any[]).map(ligneListePlanning),
  });
});

app.post("/api/planning/planifier", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.repairId);
  if (!(id > 0)) throw new AppError(404, "Réparation introuvable.");
  const [r] = await sql`SELECT id FROM reparations WHERE id = ${id} AND supprime_le IS NULL`;
  if (!r) throw new AppError(404, "Réparation introuvable.");

  const dureeMin = Number(b.dureeMin);
  if (!Number.isInteger(dureeMin) || dureeMin < 15 || dureeMin > 480 || dureeMin % 15 !== 0) {
    throw new AppError(400, "Durée : multiple de 15 min, entre 15 et 480 min.");
  }
  const brutDebut = String(b.debut ?? "");
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(brutDebut)) throw new AppError(400, "Heure de début invalide (ISO avec fuseau).");
  const debut = new Date(brutDebut);
  if (isNaN(debut.getTime())) throw new AppError(400, "Heure de début invalide.");
  if (debut.getUTCMinutes() % 15 !== 0 || debut.getUTCSeconds() !== 0 || debut.getUTCMilliseconds() !== 0) {
    throw new AppError(400, "L'heure de début doit être alignée sur un quart d'heure.");
  }
  const technicien = clean(b.technicien, 40);
  const [t] = await sql`SELECT prenom FROM utilisateurs WHERE prenom = ${technicien} AND actif = true`;
  if (!t) throw new AppError(400, "Technicien inconnu ou inactif.");

  const magasin = await magasinDemande(c, b.magasin);
  const fin = new Date(debut.getTime() + dureeMin * 60_000);

  await sql`UPDATE reparations SET technicien = ${technicien}, debut = ${debut.toISOString()}, duree_min = ${dureeMin},
    magasin = ${magasin}, maj_le = now() WHERE id = ${id}`;

  const chev = await sql`SELECT id FROM reparations
    WHERE technicien = ${technicien} AND id <> ${id} AND debut IS NOT NULL AND supprime_le IS NULL
      AND debut < ${fin.toISOString()}::timestamptz
      AND debut + duree_min * interval '1 minute' > ${debut.toISOString()}::timestamptz
    ORDER BY debut, id`;

  const p = partsParis(debut);
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'planning',
    ${`Planifiée le ${p.day}/${p.month} à ${p.hour}h${p.minute} pour ${dureeMin} min (${technicien})${signature(c)}`})`;

  return c.json({ ok: true, chevauchement: (chev as any[]).map((x) => x.id) });
});

app.post("/api/planning/retirer", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.repairId);
  if (!(id > 0)) throw new AppError(404, "Réparation introuvable.");
  const [r] = await sql`SELECT id FROM reparations WHERE id = ${id}`;
  if (!r) throw new AppError(404, "Réparation introuvable.");
  await sql`UPDATE reparations SET technicien = NULL, debut = NULL, duree_min = NULL, maj_le = now() WHERE id = ${id}`;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'planning', ${"Retirée du planning" + signature(c)})`;
  return c.json({ ok: true, message: "Réparation retirée du planning." });
});
