import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { AppError, clean, signature } from "../util";
import { acomptesDe } from "./acomptes";

const pcn = (id: number) => "PC-" + String(id).padStart(4, "0");

// Validation d'un rendez-vous pris en ligne : accepter, proposer un autre créneau, ou refuser.
app.post("/api/reparations/rdv", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const repId = Number(b.repairId);
  const action = String(b.action ?? "");
  const [r] = (await sql`SELECT id, source, rdv_souhaite, rdv_statut FROM reparations WHERE id = ${repId} AND supprime_le IS NULL`) as any[];
  if (!r || r.source !== "web") throw new AppError(404, "Demande en ligne introuvable.");
  if (action === "accepter") {
    await sql`UPDATE reparations SET rdv_statut = 'confirme', maj_le = now() WHERE id = ${repId}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${repId}, 'statut', ${"Rendez-vous accepté : " + r.rdv_souhaite + signature(c)})`;
    return c.json({ message: "Rendez-vous confirmé. Le client le voit dans son espace. Pense à le placer dans le Planning." });
  }
  if (action === "proposer") {
    const date = clean(b.date, 10);
    const cren = b.creneau === "après-midi" ? "après-midi" : "matin";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date + "T12:00:00Z").getTime())) throw new AppError(400, "Choisis une date.");
    await sql`UPDATE reparations SET rdv_souhaite = ${date + " " + cren}, rdv_statut = 'propose', maj_le = now() WHERE id = ${repId}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${repId}, 'statut', ${"Autre créneau proposé au client : " + date + " " + cren + signature(c)})`;
    return c.json({ message: "Créneau proposé : le client doit répondre dans son espace." });
  }
  if (action === "refuser") {
    const ac = await acomptesDe(repId);
    if (ac.resteCents > 0) throw new AppError(400, "Un acompte est versé : rembourse-le d'abord (bloc « Acompte »), puis refuse la demande.");
    await sql`UPDATE reparations SET rdv_statut = 'refuse', supprime_le = now(), debut = NULL, technicien = NULL, duree_min = NULL WHERE id = ${repId}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${repId}, 'statut', ${"Demande refusée " + pcn(repId) + signature(c)})`;
    return c.json({ message: "Demande refusée et retirée de la liste.", supprime: true });
  }
  throw new AppError(400, "Action inconnue.");
});
