import { app } from "../app";
import { sql } from "../db";
import { lireParametres } from "./parametres";
import { shopifyRead, shopifyMutate } from "../shopify";
import { infosTicket } from "./ticket";
import { commandesActives, creerCommandeShopify } from "./commandes";
import { envoyerAvis } from "../automatisations";
import { remiseMulti } from "./prestations";
import { avantagesActifs, contexteClient, estApplicable, remiseDe } from "./avantages";
import { AppError, clean, signature } from "../util";
import { brevoConfigure, envoiEmail } from "../brevo";

// Les points Shopify (lecture seule) restent affichés à part dans le profil.
export async function soldeFidelite(clientId: number) {
  const p = await lireParametres();
  const [dep] = (await sql`SELECT COALESCE(sum(total_cents + acompte_deduit_cents), 0)::int AS n FROM ventes WHERE client_id = ${clientId} AND type = 'vente'`) as any[];
  const [uti] = (await sql`SELECT COALESCE(sum(remise_cents), 0)::int AS n FROM ventes WHERE client_id = ${clientId}`) as any[];
  // Le bon d'achat ne devient utilisable que le lendemain : seules les ventes d'avant aujourd'hui (heure de Paris) comptent.
  const [avant] = (await sql`SELECT COALESCE(sum(total_cents + acompte_deduit_cents), 0)::int AS n FROM ventes WHERE client_id = ${clientId} AND type = 'vente' AND cree_le < date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris'`) as any[];
  const depenseEuros = dep.n / 100;
  const gagneEuros = Math.floor(avant.n / 100 / p.eurosPourPalier) * p.remiseEuros;
  const [bons] = (await sql`SELECT COALESCE(sum(montant_cents), 0)::int AS n FROM bons_achat WHERE client_id = ${clientId}`) as any[];
  const disponibleEuros = Math.max(0, gagneEuros + bons.n / 100 - uti.n / 100);
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
    const mail = clean(s.email, 120).toLowerCase();
    if (mail) {
      const [pareil] = (await sql`SELECT id FROM clients WHERE lower(trim(email)) = ${mail} LIMIT 1`) as any[];
      if (pareil) { await sql`UPDATE clients SET shopify_id = COALESCE(shopify_id, ${s.id}) WHERE id = ${pareil.id}`; return c.json({ clientId: pareil.id }); }
    }
    const [neuf] = (await sql`INSERT INTO clients (prenom, nom, telephone, email, shopify_id) VALUES (${clean(s.firstName, 80)}, ${clean(s.lastName, 80) || clean(s.email, 80) || "Client"}, ${clean(s.phone, 40)}, ${clean(s.email, 120)}, ${s.id}) RETURNING id`) as any[];
    return c.json({ clientId: neuf.id, cree: true });
  } catch (e: any) {
    console.log(JSON.stringify({ event: "scan-shopify", message: String(e?.message ?? e).slice(0, 200) }));
    return c.json({ clientId: null });
  }
});

// Un code scanné : code-barres / référence d'un produit Shopify, ou client (carte, QR, téléphone, email).
// Numéro de facture continu (F-2026-00001…) donné à chaque vente encaissée.
await sql`CREATE SEQUENCE IF NOT EXISTS facture_seq`;
await sql`ALTER TABLE ventes ADD COLUMN IF NOT EXISTS numero_facture TEXT`;
// Case de rangement (A1, B12…) d'un produit Shopify : mémorisée ici, ou reprise du stock local si le produit y est.
await sql`CREATE TABLE IF NOT EXISTS emplacements_produits (variant_id TEXT PRIMARY KEY, emplacement TEXT NOT NULL DEFAULT '', maj_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
const caseDe = async (variantId: string, codes: string[]): Promise<string> => {
  const [e] = (await sql`SELECT emplacement FROM emplacements_produits WHERE variant_id = ${variantId} AND emplacement <> ''`) as any[];
  if (e) return e.emplacement;
  const cs = codes.filter(Boolean);
  if (!cs.length) return "";
  const [l] = (await sql`SELECT emplacement FROM stock_produits WHERE code IN ${sql(cs)} AND archive_le IS NULL AND emplacement <> '' ORDER BY qte DESC LIMIT 1`) as any[];
  return l?.emplacement ?? "";
};
app.post("/api/emplacement", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const variantId = clean(b.variantId, 80);
  const lieu = clean(b.emplacement, 20).toUpperCase().replace(/\s+/g, "");
  if (!variantId) throw new AppError(400, "Produit inconnu.");
  await sql`INSERT INTO emplacements_produits (variant_id, emplacement) VALUES (${variantId}, ${lieu}) ON CONFLICT (variant_id) DO UPDATE SET emplacement = ${lieu}, maj_le = now()`;
  const codes = [clean(b.barcode, 80), clean(b.sku, 80)].filter(Boolean);
  if (codes.length) await sql`UPDATE stock_produits SET emplacement = ${lieu} WHERE code IN ${sql(codes)} AND archive_le IS NULL`;
  return c.json({ emplacement: lieu });
});

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
          return c.json({ produit: { libelle: `${p.title}${vt}`.slice(0, 200), prix: String(v.price ?? "0"), variantId: v.id, sku: v.sku ?? "", barcode: v.barcode ?? "", marque: p.vendor ?? "", stock: v.inventoryQuantity ?? null, emplacement: await caseDe(v.id, [v.barcode ?? "", v.sku ?? ""]) } });
        }
      }
    } catch (e: any) {
      console.log(JSON.stringify({ event: "scan-produit", message: String(e?.message ?? e).slice(0, 200) }));
      return c.json({ erreurProduit: true });
    }
  }
  return c.json({});
});

// Recherche de ventes / factures de caisse : par nom, n°, montant, produit, date ; avec ou sans compte client.
app.get("/api/ventes/recherche", async (c) => {
  const q = clean(c.req.query("q"), 80);
  const like = "%" + q.replace(/[%_\\]/g, "") + "%";
  const num = Number(q.replace(/^#/, ""));
  const euros = Number(q.replace(",", ".").replace(/[^0-9.]/g, ""));
  const cts = Number.isFinite(euros) && /\d/.test(q) ? Math.round(euros * 100) : -1;
  const du = /^\d{4}-\d{2}-\d{2}$/.test(String(c.req.query("du") ?? "")) ? String(c.req.query("du")) : "";
  const rows = (await sql`SELECT v.*, trim(cl.prenom || ' ' || cl.nom) AS client_nom FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id
    WHERE (${du} = '' OR (v.cree_le AT TIME ZONE 'Europe/Paris')::date = NULLIF(${du}, '')::date)
    AND (${q} = '' OR trim(cl.prenom || ' ' || cl.nom) ILIKE ${like} OR cl.email ILIKE ${like} OR cl.telephone ILIKE ${like}
      OR v.id = ${Number.isFinite(num) && Number.isInteger(num) ? num : -1} OR v.total_cents = ${cts}
      OR EXISTS (SELECT 1 FROM vente_lignes vl WHERE vl.vente_id = v.id AND vl.libelle ILIKE ${like}))
    ORDER BY v.id DESC LIMIT 40`) as any[];
  const ventes = [];
  for (const r of rows) ventes.push(await detailVente(r));
  return c.json({ ventes });
});

// Détail complet d'une vente (pour le reçu).
export async function detailVente(v: any) {
  const lignes = (await sql`SELECT libelle, quantite, prix_unitaire_cents FROM vente_lignes WHERE vente_id = ${v.id} ORDER BY id`) as any[];
  const pays = (await sql`SELECT moyen, montant_cents FROM vente_paiements WHERE vente_id = ${v.id} ORDER BY id`) as any[];
  const avs = (await sql`SELECT libelle, effet, remise_cents FROM vente_avantages WHERE vente_id = ${v.id} ORDER BY id`) as any[];
  const brut = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire_cents, 0);
  const [co] = v.client_id ? ((await sql`SELECT prenom, telephone, email FROM clients WHERE id = ${v.client_id}`) as any[]) : [];
  return {
    contact: { prenom: co?.prenom ?? "", tel: co?.telephone ?? "", email: co?.email ?? "" },
    type: v.type ?? "vente", acompteDeduitCents: v.acompte_deduit_cents ?? 0,
    numero: v.numero_facture ?? null,
    id: v.id, date: v.cree_le, magasin: v.magasin, vendeur: v.vendeur, client: v.client_nom || null,
    totalCents: v.total_cents, fideliteCents: v.remise_cents, brutCents: brut,
    lignes: lignes.map((l) => ({ libelle: l.libelle, quantite: l.quantite, prixCents: l.prix_unitaire_cents })),
    paiements: pays.map((p) => ({ moyen: p.moyen, cents: p.montant_cents })),
    avantages: avs.map((x) => ({ libelle: x.libelle, effet: x.effet, remiseCents: x.remise_cents })),
    ticket: await infosTicket(v.magasin ?? null),
    reparationId: v.reparation_id ?? null,
    shopify: { nom: v.shopify_order_name ?? null, erreur: v.shopify_erreur ?? null, eligible: (v.type ?? "vente") === "vente" },
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
  // Acomptes déjà versés sur cette réparation : déduits du total, dans l'ordre, sans jamais dépasser ce qui reste à payer.
  const deduits: { id: number; cents: number }[] = [];
  let aDeduire = brut - remAvantages - remiseCents;
  if (reparationId) {
    const ac = (await sql`SELECT id, total_cents - utilise_cents AS reste FROM ventes WHERE reparation_id = ${reparationId} AND type = 'acompte' AND total_cents - utilise_cents > 0 ORDER BY id`) as any[];
    for (const a of ac) {
      const x = Math.min(a.reste, aDeduire);
      if (x <= 0) break;
      deduits.push({ id: a.id, cents: x });
      aDeduire -= x;
    }
  }
  const acompteDeduit = deduits.reduce((s, d) => s + d.cents, 0);
  const totalCents = brut - remAvantages - remiseCents - acompteDeduit;

  const paiements = (Array.isArray(b.paiements) ? b.paiements : []).map((p: any) => ({
    moyen: String(p.moyen ?? ""),
    cents: Math.max(0, Math.round((Number(String(p.montant ?? "0").replace(",", ".")) || 0) * 100)),
  })).filter((p: any) => p.cents > 0);
  if (paiements.some((p: any) => !["carte", "especes", "virement"].includes(p.moyen))) throw new AppError(400, "Moyen de paiement inconnu.");
  const payeTotal = paiements.reduce((s: number, p: any) => s + p.cents, 0);
  if (payeTotal !== totalCents) throw new AppError(400, `Les paiements (${(payeTotal / 100).toFixed(2)} €) ne correspondent pas au total (${(totalCents / 100).toFixed(2)} €).`);

  const u = c.get("user");
  const p = await lireParametres();
  const pointsGagnes = Math.floor((totalCents + acompteDeduit) / 100 / p.eurosPourPalier);
  const [v] = (await sql`INSERT INTO ventes (client_id, reparation_id, magasin, vendeur, total_cents, remise_cents, points_gagnes, points_utilises, acompte_deduit_cents) VALUES (${clientId}, ${reparationId}, ${u.magasin ?? null}, ${u.prenom}, ${totalCents}, ${remiseCents}, ${pointsGagnes}, ${remiseCents > 0 ? 1 : 0}, ${acompteDeduit}) RETURNING id`) as any[];
  await sql`UPDATE ventes SET numero_facture = 'F-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('facture_seq')::text, 5, '0') WHERE id = ${v.id}`;
  for (const l of nettoyees) {
    await sql`INSERT INTO vente_lignes (vente_id, libelle, quantite, prix_unitaire_cents, type, shopify_variant_id, sku) VALUES (${v.id}, ${l.libelle}, ${l.quantite}, ${l.prixCents}, ${l.type}, ${l.variantId}, ${l.sku})`;
  }
  for (const d of deduits) {
    await sql`INSERT INTO vente_acomptes (vente_id, acompte_id, montant_cents) VALUES (${v.id}, ${d.id}, ${d.cents})`;
    await sql`UPDATE ventes SET utilise_cents = utilise_cents + ${d.cents} WHERE id = ${d.id}`;
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
  if (await commandesActives()) await creerCommandeShopify(v.id);
  if (clientId) void envoyerAvis(v.id);
  const [vv] = (await sql`SELECT v.*, trim(cl.prenom || ' ' || cl.nom) AS client_nom FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id WHERE v.id = ${v.id}`) as any[];
  return c.json({ id: v.id, message: "Vente enregistrée.", totalCents, remiseCents, vente: await detailVente(vv) });
});

// Envoi du reçu / de la facture par email (texte du ticket fourni par l'écran, adresse = client de la vente ou saisie).
app.post("/api/caisse/email", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.venteId);
  const texte = String(b.texte ?? "").slice(0, 8000);
  const [v] = (await sql`SELECT v.id, v.reparation_id, v.shopify_order_id, v.shopify_order_name, cl.email FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id WHERE v.id = ${id}`) as any[];
  if (!v) throw new AppError(404, "Vente introuvable.");
  const a = String(b.a ?? "").trim() || String(v.email ?? "").trim();
  if (!a) throw new AppError(422, "Pas d'email pour ce client : saisis une adresse.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)) throw new AppError(400, "Adresse email invalide.");
  // Vente déjà dans Shopify : Shopify envoie lui-même la facture (pas besoin de Brevo).
  if (v.shopify_order_id) {
    try {
      const d = await shopifyMutate(`mutation($id: ID!, $email: EmailInput) { orderInvoiceSend(id: $id, email: $email) { userErrors { message } } }`, { id: v.shopify_order_id, email: { to: a } });
      const errs = d?.orderInvoiceSend?.userErrors ?? [];
      if (!errs.length) {
        if (v.reparation_id) await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${v.reparation_id}, 'note', ${`Facture ${v.shopify_order_name ?? ""} envoyée par Shopify à ${a}${signature(c)}`})`;
        return c.json({ message: "Facture " + (v.shopify_order_name ?? "") + " envoyée à " + a + " par Shopify." });
      }
      console.log(JSON.stringify({ event: "facture-shopify", venteId: id, message: errs[0].message }));
    } catch (e: any) { console.log(JSON.stringify({ event: "facture-shopify", venteId: id, message: String(e?.message ?? e).slice(0, 200) })); }
  }
  if (!texte) throw new AppError(400, "Reçu vide.");
  if (!brevoConfigure()) throw new AppError(503, "Les emails ne sont pas encore branchés (Brevo) : rien n'a été envoyé.");
  await envoiEmail(a, "Ton reçu TURN Shop", "Bonjour,\n\nVoici ton reçu / ta facture TURN Shop :\n\n" + texte + "\n\nMerci de ta visite !\nL'équipe TURN Shop");
  if (v.reparation_id) await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${v.reparation_id}, 'note', ${`Reçu / facture envoyé par email à ${a}${signature(c)}`})`;
  return c.json({ message: "Reçu envoyé à " + a + "." });
});
