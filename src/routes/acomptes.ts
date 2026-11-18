import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { detailVente } from "./caisse";
import { AppError, clean, exigeResponsable, signature } from "../util";

const MOYENS = ["carte", "especes", "virement"];
const pcn = (id: number) => "PC-" + String(id).padStart(4, "0");

// Acomptes d'une réparation : total versé, ce qu'il reste à déduire, et la liste.
export async function acomptesDe(repId: number) {
  const rows = (await sql`SELECT id, total_cents, utilise_cents, cree_le FROM ventes WHERE reparation_id = ${repId} AND type = 'acompte' ORDER BY id`) as any[];
  const verse = rows.reduce((s, r) => s + r.total_cents, 0);
  const reste = rows.reduce((s, r) => s + (r.total_cents - r.utilise_cents), 0);
  return { verseCents: verse, resteCents: reste, liste: rows.map((r) => ({ id: r.id, cents: r.total_cents, date: r.cree_le })) };
}

// Encaisser un acompte (ou un paiement avant réparation) : pas de commande Shopify, pas d'avis, pas de points.
app.post("/api/reparations/acompte", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const repId = Number(b.repairId);
  const [r] = (await sql`SELECT id, client_id FROM reparations WHERE id = ${repId} AND supprime_le IS NULL`) as any[];
  if (!r) throw new AppError(404, "Réparation introuvable.");
  const paiements = (Array.isArray(b.paiements) ? b.paiements : []).map((p: any) => ({
    moyen: String(p.moyen ?? ""),
    cents: Math.max(0, Math.round((Number(String(p.montant ?? "0").replace(",", ".")) || 0) * 100)),
  })).filter((p: any) => p.cents > 0);
  if (!paiements.length) throw new AppError(400, "Indique le montant de l'acompte.");
  if (paiements.some((p: any) => !MOYENS.includes(p.moyen))) throw new AppError(400, "Moyen de paiement inconnu.");
  const total = paiements.reduce((s: number, p: any) => s + p.cents, 0);
  const u = c.get("user");
  const [v] = (await sql`INSERT INTO ventes (client_id, reparation_id, magasin, vendeur, total_cents, points_gagnes, type) VALUES (${r.client_id}, ${repId}, ${u.magasin ?? null}, ${u.prenom}, ${total}, 0, 'acompte') RETURNING id`) as any[];
  await sql`INSERT INTO vente_lignes (vente_id, libelle, quantite, prix_unitaire_cents, type) VALUES (${v.id}, ${"Acompte réparation " + pcn(repId)}, 1, ${total}, 'article')`;
  for (const p of paiements) await sql`INSERT INTO vente_paiements (vente_id, moyen, montant_cents) VALUES (${v.id}, ${p.moyen}, ${p.cents})`;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${repId}, 'caisse', ${`Acompte encaissé : ${(total / 100).toFixed(2)} €${signature(c)}`})`;
  const [vv] = (await sql`SELECT v.*, trim(cl.prenom || ' ' || cl.nom) AS client_nom FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id WHERE v.id = ${v.id}`) as any[];
  return c.json({ message: "Acompte enregistré.", vente: await detailVente(vv), acompte: await acomptesDe(repId) });
});

// Rembourser ce qu'il reste de l'acompte : carte, espèces, virement ou bon d'achat (utilisable tout de suite en caisse).
app.post("/api/reparations/rembourser", async (c) => {
  exigeResponsable(c);
  const b = await c.req.json().catch(() => ({}));
  const repId = Number(b.repairId);
  const moyen = String(b.moyen ?? "");
  if (![...MOYENS, "bon"].includes(moyen)) throw new AppError(400, "Choisis comment rembourser : carte, espèces, virement ou bon d'achat.");
  const [r] = (await sql`SELECT id, client_id FROM reparations WHERE id = ${repId}`) as any[];
  if (!r) throw new AppError(404, "Réparation introuvable.");
  const ac = await acomptesDe(repId);
  if (ac.resteCents <= 0) throw new AppError(400, "Aucun acompte à rembourser sur cette réparation.");
  const u = c.get("user");
  await sql`UPDATE ventes SET utilise_cents = total_cents WHERE reparation_id = ${repId} AND type = 'acompte'`;
  await sql`INSERT INTO remboursements (reparation_id, client_id, montant_cents, moyen, motif, par) VALUES (${repId}, ${r.client_id}, ${ac.resteCents}, ${moyen}, ${"Acompte " + pcn(repId)}, ${u.prenom})`;
  if (moyen === "bon") await sql`INSERT INTO bons_achat (client_id, montant_cents, motif) VALUES (${r.client_id}, ${ac.resteCents}, ${"Remboursement acompte " + pcn(repId)})`;
  const nom: Record<string, string> = { carte: "par carte", especes: "en espèces", virement: "par virement", bon: "en bon d'achat" };
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${repId}, 'caisse', ${`Acompte remboursé ${nom[moyen]} : ${(ac.resteCents / 100).toFixed(2)} €${signature(c)}`})`;
  return c.json({ message: moyen === "bon" ? "Bon d'achat créé sur la fiche du client." : `Rembourse ${(ac.resteCents / 100).toFixed(2).replace(".", ",")} € ${nom[moyen]} au client.`, acompte: await acomptesDe(repId) });
});
