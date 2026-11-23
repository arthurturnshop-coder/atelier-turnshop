import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { shopifyMutate } from "../shopify";
import { AppError, exigeAdmin } from "../util";

// Réglage : créer ou non une commande Shopify quand on facture une réparation.
export async function commandesActives(): Promise<boolean> {
  const [r] = (await sql`SELECT valeur FROM reglages WHERE cle = 'shopify_commandes'`) as any[];
  return r?.valeur !== "0"; // actif par défaut : toute facturation de réparation crée la commande Shopify
}

app.get("/api/reglages/commandes", async (c) => c.json({ actif: await commandesActives() }));
app.post("/api/reglages/commandes", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  await sql`INSERT INTO reglages (cle, valeur) VALUES ('shopify_commandes', ${b.actif === true ? "1" : "0"}) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`;
  return c.json({ actif: b.actif === true });
});

const montant = (cents: number) => ({ shopMoney: { amount: (cents / 100).toFixed(2), currencyCode: "EUR" } });
const PASSERELLE: Record<string, string> = { carte: "Carte (atelier)", especes: "Espèces (atelier)", virement: "Virement (atelier)" };

// Construit la commande Shopify à partir d'une vente de l'atelier (prix TTC, TVA 20 %).
export function construireCommande(v: any, client: any, rep: any, lignes: any[], paiements: any[]) {
  const brut = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire_cents, 0);
  const net = v.total_cents + (v.acompte_deduit_cents ?? 0);
  const remise = Math.max(0, brut - net);
  const tva = Math.round(net - net / 1.2);
  const nom = client ? `${client.prenom} ${client.nom}`.trim() : "";
  const order: any = {
    currency: "EUR",
    financialStatus: "PAID",
    fulfillmentStatus: "FULFILLED",
    taxesIncluded: true,
    taxLines: [{ title: "TVA 20 %", rate: 0.2, priceSet: montant(tva) }],
    sourceName: "atelier-turn",
    sourceIdentifier: `atelier-vente-${v.id}`,
    tags: rep ? ["atelier", "reparation"] : ["atelier", "boutique"],
    note: (rep ? `Réparation n°${rep.id} · ${rep.marque} ${rep.modele} (N° ${rep.serie}) · ${rep.panne}` : `Vente boutique${v.magasin ? " " + v.magasin : ""}`).slice(0, 500) + (v.numero_facture ? ` · Facture ${v.numero_facture}` : ""),
    customAttributes: [{ key: "Ticket atelier", value: String(v.id) }, ...(v.numero_facture ? [{ key: "Facture atelier", value: String(v.numero_facture) }] : []), ...(rep ? [{ key: "Réparation", value: String(rep.id) }] : [])],
    processedAt: new Date(v.cree_le).toISOString(),
    lineItems: lignes.map((l) => {
      const base: any = { quantity: l.quantite, priceSet: montant(l.prix_unitaire_cents), requiresShipping: false, taxable: true };
      if (l.shopify_variant_id) base.variantId = l.shopify_variant_id;
      else { base.title = l.libelle; if (l.sku) base.sku = l.sku; }
      return base;
    }),
    transactions: paiements.map((p) => ({ kind: "SALE", status: "SUCCESS", gateway: PASSERELLE[p.moyen] ?? p.moyen, amountSet: montant(p.montant_cents) })),
  };
  if (remise > 0) order.discountCode = { itemFixedDiscountCode: { code: "REMISE ATELIER", amountSet: montant(remise) } };
  if (!client) { /* vente au comptoir sans client : commande sans compte */ }
  else if (client.shopify_id) order.customer = { toAssociate: { id: client.shopify_id } };
  else if (client.email) order.customer = { toUpsert: { email: client.email, firstName: client.prenom || undefined, lastName: client.nom || undefined, phone: client.telephone || undefined } };
  else order.note += ` · Client : ${nom} ${client.telephone || ""} (sans email : pas de compte rattaché)`;
  return order;
}

// Crée la commande Shopify d'une vente. Ne lève jamais : l'encaissement reste valable quoi qu'il arrive.
export async function creerCommandeShopify(venteId: number): Promise<{ ok: boolean; nom?: string; erreur?: string }> {
  try {
    const [v] = (await sql`SELECT * FROM ventes WHERE id = ${venteId}`) as any[];
    if (!v) return { ok: false, erreur: "Vente introuvable." };
    if (v.shopify_order_id) return { ok: true, nom: v.shopify_order_name };
    if ((v.type ?? "vente") !== "vente") return { ok: false, erreur: "Les acomptes ne partent pas vers Shopify (ils comptent dans la facture finale)." };
    const [client] = v.client_id ? ((await sql`SELECT * FROM clients WHERE id = ${v.client_id}`) as any[]) : [undefined];
    const [rep] = !v.reparation_id ? [undefined] : (await sql`SELECT r.id, r.panne, t.marque, t.modele, t.serie FROM reparations r JOIN trottinettes t ON t.id = r.trottinette_id WHERE r.id = ${v.reparation_id}`) as any[];
    const lignes = (await sql`SELECT * FROM vente_lignes WHERE vente_id = ${v.id} ORDER BY id`) as any[];
    const paiements = (await sql`SELECT * FROM vente_paiements WHERE vente_id = ${v.id} ORDER BY id`) as any[];
    // Les acomptes déjà encaissés comptent comme des paiements de la commande.
    const acs = (await sql`SELECT va.montant_cents, COALESCE((SELECT moyen FROM vente_paiements WHERE vente_id = va.acompte_id ORDER BY montant_cents DESC LIMIT 1), 'carte') AS moyen FROM vente_acomptes va WHERE va.vente_id = ${v.id}`) as any[];
    for (const a of acs) paiements.push({ moyen: a.moyen, montant_cents: a.montant_cents });
    const order = construireCommande(v, client, rep, lignes, paiements);
    const data = await shopifyMutate(
      `mutation($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) { orderCreate(order: $order, options: $options) { order { id name customer { id } } userErrors { field message } } }`,
      { order, options: { inventoryBehaviour: "DECREMENT_IGNORING_POLICY", sendReceipt: !!String(client?.email ?? "").trim(), sendFulfillmentReceipt: false } },
    );
    const res = data?.orderCreate;
    if (res?.userErrors?.length) throw new Error(res.userErrors.map((e: any) => e.message).join(" · "));
    if (!res?.order?.id) throw new Error("Shopify n'a pas renvoyé de commande.");
    await sql`UPDATE ventes SET shopify_order_id = ${res.order.id}, shopify_order_name = ${res.order.name}, shopify_erreur = NULL WHERE id = ${v.id}`;
    if (client && !client.shopify_id && res.order.customer?.id) await sql`UPDATE clients SET shopify_id = ${res.order.customer.id} WHERE id = ${client.id}`;
    if (v.reparation_id) await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${v.reparation_id}, 'caisse', ${`Commande Shopify ${res.order.name} créée`})`;
    return { ok: true, nom: res.order.name };
  } catch (e: any) {
    const erreur = String(e?.message ?? e).slice(0, 300);
    await sql`UPDATE ventes SET shopify_erreur = ${erreur} WHERE id = ${venteId}`;
    console.log(JSON.stringify({ event: "commande-shopify", venteId, message: erreur }));
    return { ok: false, erreur };
  }
}

app.post("/api/caisse/shopify", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!(await commandesActives())) throw new AppError(400, "L'envoi des commandes vers Shopify est désactivé dans Paramètres.");
  const r = await creerCommandeShopify(Number(b.venteId));
  return c.json(r);
});
