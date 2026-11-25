import { app } from "../app";
import { sql } from "../db";
import "./auth";
import { AppError, clean, exigeAdmin, signature } from "../util";

// Garantie fournisseur : n° RMA, PDF de la demande, "demande faite" + relance hebdomadaire dans la to-do.
await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS garantie_rma TEXT NOT NULL DEFAULT ''`;
await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS garantie_demande_le TIMESTAMPTZ`;
await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS garantie_relance_le DATE`;
await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS garantie_close BOOLEAN NOT NULL DEFAULT false`;
await sql`CREATE TABLE IF NOT EXISTS reparation_pdfs (
  id SERIAL PRIMARY KEY, reparation_id INT NOT NULL, nom TEXT NOT NULL, taille INT NOT NULL, data BYTEA NOT NULL, par TEXT NOT NULL DEFAULT '', cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`ALTER TABLE reparation_pdfs ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'autre'`;
await sql`CREATE INDEX IF NOT EXISTS reparation_pdfs_rep ON reparation_pdfs (reparation_id)`;

export async function delaiRelance(): Promise<number> {
  const [r] = (await sql`SELECT valeur FROM parametres WHERE cle = 'garantie_relance_jours'`) as any[];
  const n = Math.round(Number(r?.valeur));
  return n >= 1 && n <= 60 ? n : 7;
}

app.get("/api/parametres/garantie", async (c) => c.json({ jours: await delaiRelance() }));
app.post("/api/parametres/garantie", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const n = Math.round(Number(String(b.jours ?? "").replace(",", ".")));
  if (!(n >= 1 && n <= 60)) throw new AppError(400, "Mets un délai entre 1 et 60 jours.");
  await sql`INSERT INTO parametres (cle, valeur, maj_le) VALUES ('garantie_relance_jours', ${String(n)}, now()) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, maj_le = now()`;
  return c.json({ message: `Relance garantie : tous les ${n} jours.` });
});

async function rep(id: number) {
  const [r] = (await sql`SELECT * FROM reparations WHERE id = ${id} AND supprime_le IS NULL`) as any[];
  if (!r) throw new AppError(404, "Réparation introuvable.");
  return r;
}
const jour = (d: any) => (d ? new Date(d).toISOString() : null);

app.get("/api/garantie/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const r = await rep(id);
  const [rl] = (await sql`SELECT to_char(garantie_relance_le, 'YYYY-MM-DD') AS d FROM reparations WHERE id = ${id}`) as any[];
  const pdfs = (await sql`SELECT id, nom, taille, par, cree_le, type FROM reparation_pdfs WHERE reparation_id = ${id} ORDER BY id`) as any[];
  return c.json({
    rma: r.garantie_rma ?? "", demandeLe: jour(r.garantie_demande_le), close: r.garantie_close === true,
    relanceLe: rl?.d ?? null, delai: await delaiRelance(),
    pdfs: pdfs.map((p) => ({ id: p.id, nom: p.nom, taille: p.taille, par: p.par, le: p.cree_le, type: p.type })),
  });
});

app.post("/api/garantie/rma", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.repairId);
  await rep(id);
  const rma = clean(b.rma, 60);
  await sql`UPDATE reparations SET garantie_rma = ${rma}, maj_le = now() WHERE id = ${id}`;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'note', ${(rma ? `N° RMA : ${rma}` : "N° RMA retiré") + signature(c)})`;
  return c.json({ message: "N° RMA enregistré." });
});

// "Demande faite au fournisseur" : lance les relances. etat = "faite" | "annulee" | "close" (réponse reçue / dossier terminé).
app.post("/api/garantie/demande", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.repairId);
  await rep(id);
  const jours = await delaiRelance();
  const etat = String(b.etat ?? "faite");
  if (etat === "faite") {
    await sql`UPDATE reparations SET garantie_demande_le = now(), garantie_close = false, garantie_relance_le = ((now() AT TIME ZONE 'Europe/Paris')::date + ${jours}::int), maj_le = now() WHERE id = ${id}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'note', ${`Demande de garantie faite au fournisseur (relance tous les ${jours} jours)` + signature(c)})`;
  } else if (etat === "close") {
    await sql`UPDATE reparations SET garantie_close = true, maj_le = now() WHERE id = ${id}`;
    await sql`UPDATE taches SET fait = true, fait_le = now() WHERE reparation_id = ${id} AND cree_par = 'Relance garantie' AND fait = false`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'note', ${"Garantie : réponse reçue, relances arrêtées" + signature(c)})`;
  } else {
    await sql`UPDATE reparations SET garantie_demande_le = NULL, garantie_relance_le = NULL, garantie_close = false, maj_le = now() WHERE id = ${id}`;
    await sql`DELETE FROM taches WHERE reparation_id = ${id} AND cree_par = 'Relance garantie' AND fait = false`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'note', ${"Demande de garantie annulée" + signature(c)})`;
  }
  return c.json({ message: "OK" });
});

// PDF (reçu en base64 dans du JSON, 8 Mo max).
app.post("/api/garantie/pdf", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.repairId);
  await rep(id);
  const buf = Buffer.from(String(b.data ?? ""), "base64");
  if (buf.length < 20 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new AppError(400, "Ce fichier n'est pas un PDF.");
  if (buf.length > 8 * 1024 * 1024) throw new AppError(400, "PDF trop lourd (8 Mo maximum).");
  const [n] = (await sql`SELECT count(*)::int AS n FROM reparation_pdfs WHERE reparation_id = ${id}`) as any[];
  if (n.n >= 10) throw new AppError(400, "10 PDF maximum par prise en charge.");
  const u = c.get("user") as any;
  const nom = clean(String(b.nom ?? "garantie.pdf"), 120) || "garantie.pdf";
  const type = ["facture_client", "facture_fournisseur"].includes(String(b.type)) ? String(b.type) : "autre";
  const lib = type === "facture_client" ? "Facture d'achat client" : type === "facture_fournisseur" ? "Facture d'achat fournisseur" : "PDF";
  await sql`INSERT INTO reparation_pdfs (reparation_id, nom, taille, data, par, type) VALUES (${id}, ${nom}, ${buf.length}, ${buf}, ${u?.prenom ?? ""}, ${type})`;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'note', ${`${lib} ajouté(e) : ${nom}` + signature(c)})`;
  return c.json({ message: "PDF ajouté." });
});

app.get("/api/garantie/pdf/:id/fichier", async (c) => {
  const [p] = (await sql`SELECT nom, data FROM reparation_pdfs WHERE id = ${Number(c.req.param("id"))}`) as any[];
  if (!p) throw new AppError(404, "PDF introuvable.");
  return new Response(p.data, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${encodeURIComponent(p.nom)}"` } });
});

app.post("/api/garantie/pdf/supprimer", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  await sql`DELETE FROM reparation_pdfs WHERE id = ${Number(b.id)}`;
  return c.json({ message: "PDF supprimé." });
});

// Relances : appelée avec la liste des tâches. Crée une tâche si la date de relance est atteinte et qu'aucune n'est ouverte.
export async function genererRelancesGarantie() {
  const jours = await delaiRelance();
  const rows = (await sql`SELECT r.id, r.garantie_rma, trim(c.prenom || ' ' || c.nom) AS client, t.marque, t.modele
    FROM reparations r JOIN clients c ON c.id = r.client_id JOIN trottinettes t ON t.id = r.trottinette_id
    WHERE r.supprime_le IS NULL AND r.sous_garantie = true AND r.garantie_demande_le IS NOT NULL AND r.garantie_close = false
      AND r.statut <> 'récupéré' AND r.garantie_relance_le <= (now() AT TIME ZONE 'Europe/Paris')::date
      AND NOT EXISTS (SELECT 1 FROM taches k WHERE k.reparation_id = r.id AND k.cree_par = 'Relance garantie' AND k.fait = false)`) as any[];
  for (const r of rows) {
    const texte = `Relancer le fournisseur : garantie ${`${r.marque} ${r.modele}`.trim()} de ${r.client}${r.garantie_rma ? ` (RMA ${r.garantie_rma})` : ""}`;
    await sql`INSERT INTO taches (texte, echeance, priorite, cree_par, reparation_id) VALUES (${texte}, (now() AT TIME ZONE 'Europe/Paris')::date, true, 'Relance garantie', ${r.id})`;
    await sql`UPDATE reparations SET garantie_relance_le = ((now() AT TIME ZONE 'Europe/Paris')::date + ${jours}::int) WHERE id = ${r.id}`;
  }
}
