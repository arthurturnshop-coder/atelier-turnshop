import { shopifyMutate } from "../shopify";
import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { detailVente } from "./caisse";
import { vendeurParMdp } from "./caissier";
import { AppError, clean, exigeResponsable, signature } from "../util";
import { rembourserEnLigne } from "./pub";

const MOYENS = ["carte", "especes", "virement"];
const pcn = (id: number) => "PC-" + String(id).padStart(4, "0");

// Acomptes d'une réparation : total versé, ce qu'il reste à déduire, et la liste.
export async function acomptesDe(repId: number) {
  const rows = (await sql`SELECT id, total_cents, utilise_cents, cree_le, vendeur FROM ventes WHERE reparation_id = ${repId} AND type = 'acompte' ORDER BY id`) as any[];
  const verse = rows.reduce((s, r) => s + r.total_cents, 0);
  const reste = rows.reduce((s, r) => s + (r.total_cents - r.utilise_cents), 0);
  const ids = rows.map((r) => r.id);
  const pays = ids.length ? ((await sql`SELECT vente_id, moyen, montant_cents FROM vente_paiements WHERE vente_id = ANY(${ids}) ORDER BY id`) as any[]) : [];
  const rbs = (await sql`SELECT montant_cents, moyen, par, cree_le FROM remboursements WHERE reparation_id = ${repId} AND motif LIKE 'Acompte%' ORDER BY id`) as any[];
  const [fac] = (await sql`SELECT id, numero_facture, total_cents, cree_le FROM ventes WHERE reparation_id = ${repId} AND COALESCE(type, 'vente') <> 'acompte' ORDER BY id DESC LIMIT 1`) as any[];
  const rembourse = Math.min(verse, rbs.reduce((s, r) => s + r.montant_cents, 0));
  const histo = [
    ...rows.map((r) => ({ kind: "acompte", cents: r.total_cents, date: r.cree_le, par: r.vendeur ?? "", moyen: pays.filter((p) => p.vente_id === r.id).map((p) => p.moyen).join("+") })),
    ...rbs.map((r) => ({ kind: "remboursement", cents: r.montant_cents, date: r.cree_le, par: r.par ?? "", moyen: r.moyen })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return { facture: fac ? { id: fac.id, numero: fac.numero_facture ?? "", cents: fac.total_cents, date: fac.cree_le } : null, verseCents: verse, rembourseCents: rembourse, resteCents: reste, histo, liste: rows.map((r) => ({ id: r.id, cents: r.total_cents, date: r.cree_le })) };
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
  const vendeur = await vendeurParMdp(c, b.mdpCaissier);
  const [v] = (await sql`INSERT INTO ventes (client_id, reparation_id, magasin, vendeur, total_cents, points_gagnes, type) VALUES (${r.client_id}, ${repId}, ${u.magasin ?? null}, ${vendeur}, ${total}, 0, 'acompte') RETURNING id`) as any[];
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
  if (![...MOYENS, "bon", "carte_cadeau"].includes(moyen)) throw new AppError(400, "Choisis comment rembourser : carte, espèces, virement ou bon d'achat.");
  const [r] = (await sql`SELECT id, client_id FROM reparations WHERE id = ${repId}`) as any[];
  if (!r) throw new AppError(404, "Réparation introuvable.");
  const ac = await acomptesDe(repId);
  if (ac.resteCents <= 0) throw new AppError(400, "Aucun acompte à rembourser sur cette réparation.");
  const demande = b.montant === undefined || b.montant === "" ? ac.resteCents : Math.round((Number(String(b.montant).replace(",", ".")) || 0) * 100);
  if (demande <= 0 || demande > ac.resteCents) throw new AppError(400, `Montant à rembourser invalide (maximum ${(ac.resteCents / 100).toFixed(2).replace(".", ",")} €).`);
  const cents = demande;
  const u = c.get("user");
  // Acompte payé en ligne : remboursé sur la carte du client par Shopify, ou transformé en bon d'achat.
  const [{ n: enLigne }] = (await sql`SELECT count(*)::int AS n FROM paiements_web WHERE reparation_id = ${repId} AND statut = 'paye' AND rembourse_le IS NULL`) as any[];
  let msgLigne = "";
  if (enLigne > 0) {
    if (moyen !== "carte" && moyen !== "bon" && moyen !== "carte_cadeau") throw new AppError(400, "Ce paiement a été fait en ligne : rembourse par carte (via Shopify) ou en bon d'achat.");
    if (moyen === "carte") {
      if (cents < ac.resteCents) throw new AppError(400, "Paiement en ligne : le remboursement par carte se fait en totalité. Rembourse tout, ou fais un remboursement partiel dans Shopify.");
      try { msgLigne = await rembourserEnLigne(repId); } catch (e: any) { throw new AppError(502, "Remboursement Shopify impossible : " + String(e?.message ?? e).slice(0, 200) + ". Fais-le dans Shopify (Commandes) puis note-le ici."); }
    }
  }
  // Carte cadeau Shopify : vrai bon d'achat, utilisable en ligne et sur Shopify POS, envoyé par email au client.
  let gc: { id: string; fin: string; code: string; envoye: boolean } | null = null;
  if (moyen === "carte_cadeau") {
    const [cl] = (await sql`SELECT prenom, shopify_id FROM clients WHERE id = ${r.client_id}`) as any[];
    try {
      const input: any = { initialValue: (cents / 100).toFixed(2), note: `Remboursement acompte ${pcn(repId)}` };
      if (cl?.shopify_id) { input.customerId = cl.shopify_id; input.recipientAttributes = { id: cl.shopify_id, message: "Voici ton bon d'achat TURN Shop, utilisable en ligne et en boutique." }; }
      const d = await shopifyMutate(`mutation($input: GiftCardCreateInput!) { giftCardCreate(input: $input) { giftCard { id lastCharacters } giftCardCode userErrors { field message } } }`, { input });
      const res = d?.giftCardCreate;
      if (res?.userErrors?.length) throw new Error(res.userErrors.map((e: any) => e.message).join(" · "));
      if (!res?.giftCard?.id) throw new Error("Shopify n'a pas créé la carte cadeau.");
      gc = { id: res.giftCard.id, fin: res.giftCard.lastCharacters, code: res.giftCardCode ?? "", envoye: !!cl?.shopify_id };
    } catch (e: any) { throw new AppError(502, "Carte cadeau Shopify impossible : " + String(e?.message ?? e).slice(0, 200) + " (vérifie que l'app Shopify a l'accès aux cartes cadeaux). Rien n'a été remboursé."); }
  }
  {
    let aRetirer = cents;
    const lignes = (await sql`SELECT id, total_cents, utilise_cents FROM ventes WHERE reparation_id = ${repId} AND type = 'acompte' ORDER BY id`) as any[];
    for (const l of lignes) {
      if (aRetirer <= 0) break;
      const dispo = l.total_cents - l.utilise_cents, pris = Math.min(dispo, aRetirer);
      if (pris > 0) { await sql`UPDATE ventes SET utilise_cents = utilise_cents + ${pris} WHERE id = ${l.id}`; aRetirer -= pris; }
    }
  }
  await sql`INSERT INTO remboursements (reparation_id, client_id, montant_cents, moyen, motif, par, gift_card_id, gift_card_fin) VALUES (${repId}, ${r.client_id}, ${cents}, ${moyen}, ${"Acompte " + pcn(repId)}, ${u.prenom}, ${gc?.id ?? null}, ${gc?.fin ?? null})`;
  if (moyen === "bon") await sql`INSERT INTO bons_achat (client_id, montant_cents, motif) VALUES (${r.client_id}, ${cents}, ${"Remboursement acompte " + pcn(repId)})`;
  const nom: Record<string, string> = { carte: "par carte", especes: "en espèces", virement: "par virement", bon: "en bon d'achat", carte_cadeau: "en carte cadeau Shopify" + (gc ? " (…" + gc.fin + ")" : "") };
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${repId}, 'caisse', ${`Acompte remboursé ${nom[moyen]} : ${(cents / 100).toFixed(2)} €${signature(c)}`})`;
  return c.json({ message: gc ? `Carte cadeau Shopify de ${(cents / 100).toFixed(2).replace(".", ",")} € créée (…${gc.fin}).${gc.envoye ? " Le client la reçoit par email de Shopify." : " Le client n'a pas de compte Shopify : donne-lui ce code : " + gc.code}` : msgLigne ? msgLigne : moyen === "bon" ? "Bon d'achat créé sur la fiche du client." : `Rembourse ${(cents / 100).toFixed(2).replace(".", ",")} € ${nom[moyen]} au client.`, acompte: await acomptesDe(repId) });
});
