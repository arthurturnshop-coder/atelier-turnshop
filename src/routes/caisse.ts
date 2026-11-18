import { app } from "../app";
import { sql } from "../db";
import { lireParametres } from "./parametres";
import { shopifyRead } from "../shopify";
import { infosTicket } from "./ticket";
import { commandesActives, creerCommandeShopify } from "./commandes";
import { remiseMulti } from "./prestations";
import { avantagesActifs, contexteClient, estApplicable, remiseDe } from "./avantages";
import { AppError, clean, signature } from "../util";

// Les points Shopify (lecture seule) restent affichés à part dans le profil.
export async function soldeFidelite(clientId: number) {
  const p = await lireParametres();
  const [dep] = (await sql`SELECT COALESCE(sum(total_cents), 0)::int AS n FROM ventes WHERE client_id = ${clientId}`) as any[];
  const [uti] = (await sql`SELECT COALESCE(sum(remise_cents), 0)::int AS n FROM ventes WHERE client_id = ${clientId}`) as any[];
  const depenseEuros = dep.n / 100;
  const gagneEuros = Math.floor(depenseEuros / p.eurosPourPalier) * p.remiseEuros;
  const disponibleEuros = Math.max(0, gagneEuros - uti.n / 100);
  const prochainPalierIn = p.eurosPourPalier - (depenseEuros % p.eurosPourPalier);
  return { depenseEuros, disponibleEuros, prochainPalierIn, regle: p };
}

app.get("/api/caisse/client", async (c) => {
  const id = Number(c.req.query("id"));
  if (!(id > 0)) throw new AppError(404, "Client introuvable.");
  const [cl] = (await sql`SELECT id, prenom, nom, telephone, email FROM clients WHERE id = ${id}`) as any[];
  if (!cl) throw new AppError(404, "Client introuvable.");
  const ctx = await contexteClient(id);
  return c.json({ client: { id: cl.id, name: `${cl.prenom} ${cl.nom}`.trim(), phone: cl.telephone, email: cl.email }, fidelite: { ...(await soldeFidelite(id)), depenseCents: ctx.depenseCents, recus: ctx.recus } });
});

// Trouver un client à partir d'un scan (douchette = clavier) : email, téléphone, numéro de client,
// ou contenu du QR code de la carte (email, lien ou identifiant client Shopify).
// Si le client n'existe pas encore dans l'atelier mais existe dans Shopify, on le crée ici.
app.get("/api/caisse/scan", async (c) => {
  const q = clean(c.req.query("q"), 300);
  if (!q) return c.json({ clientId: null });
  const email = (q.match(/[^\s<>"'?&=:]+@[^\s<>"'?&=]+\.[a-z]{2,}/i) ?? [])[0] ?? "";
  const gid = (q.match(/(?:Customer\/|customers\/)(\d{6,})/i) ?? [])[1] ?? "";
  const tel = q.replace(/[\s.\-]/g, "");
  const num = /^\d+$/.test(q) && q.length < 8 ? Number(q) : 0;
  const gidLike = gid ? `%/${gid}` : "";
  const [cl] = (await sql`SELECT id FROM clients WHERE (${email} <> '' AND email ILIKE ${email}) OR (${email} = '' AND email ILIKE ${q}) OR replace(telephone, ' ', '') = ${tel} OR id = ${num} OR (${gidLike} <> '' AND shopify_id LIKE ${gidLike}) ORDER BY id LIMIT 1`) as any[];
  if (cl) return c.json({ clientId: cl.id });
  // Pas trouvé dans l'atelier : on cherche dans Shopify.
  try {
    const terme = email ? `email:${email}` : gid ? `id:${gid}` : /^\+?\d{9,15}$/.test(tel) ? `phone:${tel}` : "";
    if (!terme) return c.json({ clientId: null });
    const data = await shopifyRead(`query($q: String!) { customers(first: 1, query: $q) { nodes { id firstName lastName email phone } } }`, { q: terme });
    const s = data?.customers?.nodes?.[0];
    if (!s) return c.json({ clientId: null });
    const [deja] = (await sql`SELECT id FROM clients WHERE shopify_id = ${s.id}`) as any[];
    if (deja) return c.json({ clientId: deja.id });
    const [neuf] = (await sql`INSERT INTO clients (prenom, nom, telephone, email, shopify_id) VALUES (${clean(s.firstName, 80)}, ${clean(s.lastName, 80) || clean(s.email, 80) || "Client"}, ${clean(s.phone, 40)}, ${clean(s.email, 120)}, ${s.id}) RETURNING id`) as any[];
    return c.json({ clientId: neuf.id, cree: true });
  } catch (e: any) {
    console.log(JSON.stringify({ event: "scan-shopify", message: String(e?.message ?? e).slice(0, 200) }));
    return c.json({ clientId: null });
  }
});

// Un code scanné : code-barres / référence d'un produit Shopify, ou client (carte, QR, téléphone, email).
app.get("/api/code", async (c) => {
  const q = clean(c.req.query("q"), 300).trim();
  if (!q) return c.json({});
  const num = /^\d+$/.test(q) && q.length < 8 ? Number(q) : 0;
  const tel = q.replace(/[\s.\-]/g, "");
  const [local] = (await sql`SELECT id FROM clients WHERE replace(telephone, ' ', '') = ${tel} OR id = ${num} OR email ILIKE ${q} LIMIT 1`) as any[];
  if (local) return c.json({ clientId: local.id });
  if (/^[A-Za-z0-9._\-\/]{4,40}$/.test(q)) {
    try {
      const t = q.replace(/["\\]/g, "");
      const data = await shopifyRead(`query($q: String!) { products(first: 3, query: $q) { nodes { title variants(first: 50) { nodes { id title sku barcode price inventoryQuantity } } } } }`, { q: `barcode:${t} OR sku:${t}` });
      for (const p of data?.products?.nodes ?? []) {
        const v = (p.variants?.nodes ?? []).find((x: any) => (x.barcode ?? "").toLowerCase() === q.toLowerCase() || (x.sku ?? "").toLowerCase() === q.toLowerCase());
        if (v) {
          const vt = v.title && v.title !== "Default Title" ? ` - ${v.title}` : "";
          return c.json({ produit: { libelle: `${p.title}${vt}`.slice(0, 200), prix: String(v.price ?? "0"), variantId: v.id, sku: v.sku ?? "", barcode: v.barcode ?? "", marque: p.vendor ?? "", stock: v.inventoryQuantity ?? null } });
        }
      }
    } catch (e: any) {
      console.log(JSON.stringify({ event: "scan-produit", message: String(e?.message ?? e).slice(0, 200) }));
      return c.json({ erreurProduit: true });
    }
  }
  return c.json({});
});

// Détail complet d'une vente (pour le reçu).
async function detailVente(v: any) {
  const lignes = (await sql`SELECT libelle, quantite, prix_unitaire_cents FROM vente_lignes WHERE vente_id = ${v.id} ORDER BY id`) as any[];
  const pays = (await sql`SELECT moyen, montant_cents FROM vente_paiements WHERE vente_id = ${v.id} ORDER BY id`) as any[];
  const avs = (await sql`SELECT libelle, effet, remise_cents FROM vente_avantages WHERE vente_id = ${v.id} ORDER BY id`) as any[];
  const brut = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire_cents, 0);
  return {
    id: v.id, date: v.cree_le, magasin: v.magasin, vendeur: v.vendeur, client: v.client_nom || null,
    totalCents: v.total_cents, fideliteCents: v.remise_cents, brutCents: brut,
    lignes: lignes.map((l) => ({ libelle: l.libelle, quantite: l.quantite, prixCents: l.prix_unitaire_cents })),
    paiements: pays.map((p) => ({ moyen: p.moyen, cents: p.montant_cents })),
    avantages: avs.map((x) => ({ libelle: x.libelle, effet: x.effet, remiseCents: x.remise_cents })),
    ticket: await infosTicket(v.magasin ?? null),
    reparationId: v.reparation_id ?? null,
    shopify: { nom: v.shopify_order_name ?? null, erreur: v.shopify_erreur ?? null, eligible: !!(v.reparation_id && v.client_id) },
  };
}

// Historique : les achats d'un client, ou les ventes du jour si aucun client.
app.get("/api/caisse/historique", async (c) => {
  const id = Number(c.req.query("clientId"));
  const rows = (id > 0
    ? await sql`SELECT v.*, trim(cl.prenom || ' ' || cl.nom) AS client_nom FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id WHERE v.client_id = ${id} ORDER BY v.id DESC LIMIT 30`
    : await sql`SELECT v.*, trim(cl.prenom || ' ' || cl.nom) AS client_nom FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id WHERE (v.cree_le AT TIME ZONE 'Europe/Paris')::date = (now() AT TIME ZONE 'Europe/Paris')::date ORDER BY v.id DESC LIMIT 30`) as any[];
  const ventes = [];
  for (const r of rows) ventes.push(await detailVente(r));
  return c.json({ ventes });
});

// Encaisser : lignes + paiements (carte / espèces / virement, plusieurs possibles) + remise fidélité éventuelle.
app.post("/api/caisse/encaisser", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const lignes = Array.isArray(b.lignes) ? b.lignes : [];
  if (!lignes.length) throw new AppError(400, "Le panier est vide.");
  const nettoyees = lignes.map((l: any) => ({
    libelle: clean(l.libelle, 200),
    quantite: Math.max(1, Math.min(999, Math.round(Number(l.quantite) || 1))),
    prixCents: Math.max(0, Math.round((Number(String(l.prix ?? "0").replace(",", ".")) || 0) * 100)),
    type: ["piece", "main_oeuvre"].includes(l.type) ? l.type : "article",
    variantId: clean(l.variantId, 80) || null,
    sku: clean(l.sku, 80) || null,
  }));
  if (nettoyees.some((l: any) => !l.libelle)) throw new AppError(400, "Chaque ligne doit avoir un libellé.");
  const brut = nettoyees.reduce((s: number, l: any) => s + l.quantite * l.prixCents, 0);

  const clientId = Number(b.clientId) > 0 ? Number(b.clientId) : null;
  const reparationId = Number(b.repairId) > 0 ? Number(b.repairId) : null;
  // Avantages choisis (cadeaux / remises) : revalidés ici, appliqués dans l'ordre sans jamais dépasser le total.
  const ids: number[] = (Array.isArray(b.avantageIds) ? b.avantageIds : []).map(Number).filter((n: number) => n > 0).sort((x: number, y: number) => x - y);
  const appliques: { id: number; libelle: string; effet: string; cents: number }[] = [];
  if (ids.length) {
    const actifs = await avantagesActifs();
    const ctx = clientId ? await contexteClient(clientId) : null;
    let reste = brut;
    for (const id of ids) {
      const a = actifs.find((x) => x.id === id);
      if (!a || !estApplicable(a, brut, ctx)) continue;
      const cents = Math.min(remiseDe(a, brut), reste);
      reste -= cents;
      appliques.push({ id: a.id, libelle: a.libelle, effet: a.effet, cents });
    }
  }
  // Remise multi-prestations : seulement si aucune offre n'est appliquée.
  if (!appliques.length) {
    const rm = await remiseMulti(nettoyees, brut);
    if (rm > 0) appliques.push({ id: null as any, libelle: "Remise plusieurs prestations", effet: "euros", cents: rm });
  }
  const remAvantages = appliques.reduce((s, a) => s + a.cents, 0);
  let remiseCents = 0;
  if (b.utiliserFidelite === true) {
    if (!clientId) throw new AppError(400, "Choisis un client pour utiliser sa fidélité.");
    const s = await soldeFidelite(clientId);
    remiseCents = Math.min(Math.round(s.disponibleEuros * 100), brut - remAvantages);
  }
  const totalCents = brut - remAvantages - remiseCents;

  const paiements = (Array.isArray(b.paiements) ? b.paiements : []).map((p: any) => ({
    moyen: String(p.moyen ?? ""),
    cents: Math.max(0, Math.round((Number(String(p.montant ?? "0").replace(",", ".")) || 0) * 100)),
  })).filter((p: any) => p.cents > 0);
  if (paiements.some((p: any) => !["carte", "especes", "virement"].includes(p.moyen))) throw new AppError(400, "Moyen de paiement inconnu.");
  const payeTotal = paiements.reduce((s: number, p: any) => s + p.cents, 0);
  if (payeTotal !== totalCents) throw new AppError(400, `Les paiements (${(payeTotal / 100).toFixed(2)} €) ne correspondent pas au total (${(totalCents / 100).toFixed(2)} €).`);

  const u = c.get("user");
  const p = await lireParametres();
  const pointsGagnes = Math.floor(totalCents / 100 / p.eurosPourPalier);
  const [v] = (await sql`INSERT INTO ventes (client_id, reparation_id, magasin, vendeur, total_cents, remise_cents, points_gagnes, points_utilises) VALUES (${clientId}, ${reparationId}, ${u.magasin ?? null}, ${u.prenom}, ${totalCents}, ${remiseCents}, ${pointsGagnes}, ${remiseCents > 0 ? 1 : 0}) RETURNING id`) as any[];
  for (const l of nettoyees) {
    await sql`INSERT INTO vente_lignes (vente_id, libelle, quantite, prix_unitaire_cents, type, shopify_variant_id, sku) VALUES (${v.id}, ${l.libelle}, ${l.quantite}, ${l.prixCents}, ${l.type}, ${l.variantId}, ${l.sku})`;
  }
  for (const a of appliques) {
    await sql`INSERT INTO vente_avantages (vente_id, avantage_id, libelle, effet, remise_cents) VALUES (${v.id}, ${a.id}, ${a.libelle}, ${a.effet}, ${a.cents})`;
  }
  for (const pa of paiements) {
    await sql`INSERT INTO vente_paiements (vente_id, moyen, montant_cents) VALUES (${v.id}, ${pa.moyen}, ${pa.cents})`;
  }
  if (reparationId) {
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${reparationId}, 'caisse', ${`Encaissement de ${(totalCents / 100).toFixed(2)} €${signature(c)}`})`;
  }
  if (reparationId && clientId && (await commandesActives())) await creerCommandeShopify(v.id);
  const [vv] = (await sql`SELECT v.*, trim(cl.prenom || ' ' || cl.nom) AS client_nom FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id WHERE v.id = ${v.id}`) as any[];
  return c.json({ id: v.id, message: "Vente enregistrée.", totalCents, remiseCents, vente: await detailVente(vv) });
});
