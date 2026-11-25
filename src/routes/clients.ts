import { app } from "../app";
import { SYNC } from "../config";
import { sql } from "../db";
import { PRODUITS_QUERY, PRODUITS_QUERY_LIEUX, shopifyRead } from "../shopify";
import { AppError, clean, exigeResponsable } from "../util";

export async function fiche(id: number) {
  const [client] = await sql`SELECT * FROM clients WHERE id = ${id}`;
  if (!client) throw new AppError(404, "Client introuvable.");
  const trottinettes = await sql`SELECT * FROM trottinettes WHERE client_id = ${id} ORDER BY id`;
  const reparations = await sql`SELECT * FROM reparations WHERE client_id = ${id} AND supprime_le IS NULL ORDER BY id DESC`;
  const journal = await sql`SELECT j.reparation_id, j.date, j.type, j.texte FROM journal j JOIN reparations r ON r.id = j.reparation_id WHERE r.client_id = ${id} ORDER BY j.id`;
  return {
    id: client.id,
    name: `${client.prenom} ${client.nom}`.trim(),
    prenom: client.prenom,
    nom: client.nom,
    email: client.email,
    phone: client.telephone,
    shopifyId: client.shopify_id,
    creeLe: client.cree_le,
    trottinettes: trottinettes.map((t: any) => ({
      ...t,
      reparations: reparations
        .filter((r: any) => r.trottinette_id === t.id)
        .map((r: any) => ({ ...r, journal: journal.filter((j: any) => j.reparation_id === r.id) })),
    })),
  };
}


app.get("/api/search", async (c) => {
  const q = clean(c.req.query("q"), 100);
  if (!q) return c.json([]);
  // Chaque mot doit se retrouver dans le prénom, le nom, l'email ou le téléphone (chiffres seuls pour le téléphone).
  const mots = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
  const pool = (await sql`SELECT id, lower(prenom) AS p, lower(nom) AS n, lower(email) AS e, regexp_replace(telephone, '\\D', '', 'g') AS t FROM clients ORDER BY nom LIMIT 5000`) as any[];
  const sc = (r: any) => {
    let s = 0;
    for (const m of mots) {
      const d = m.replace(/\D/g, "");
      const ok = r.p.includes(m) || r.n.includes(m) || r.e.includes(m) || (d.length >= 3 && d === m && r.t.includes(d));
      if (!ok) return -1;
      s += r.n.startsWith(m) || r.p.startsWith(m) ? 3 : (r.n === m || r.p === m ? 5 : 1);
    }
    return s;
  };
  const ids = pool.map((r) => ({ id: r.id, s: sc(r) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, 5);
  return c.json(await Promise.all(ids.map((r) => fiche(r.id))));
});

// Nom d'emplacement affiché : Amiens, Rouen, Fournisseur ou le nom Shopify tel quel.
function nomLieu(n: string) {
  const m = n.toLowerCase();
  if (m.includes("amiens")) return "Amiens";
  if (m.includes("rouen")) return "Rouen";
  if (m.includes("fourn")) return "Fournisseur";
  return n || "Stock";
}

app.get("/api/recherche", async (c) => {
  const q = clean(c.req.query("q"), 100);
  const numPC = q.match(/^(?:pc|n°|n|#)?[\s-]*0*(\d{1,9})$/i);
  if (q.length < 2 && !numPC) return c.json({ clients: [], produits: [], reparations: [] });
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const chiffres = q.replace(/\D/g, "");
  const likeTel = chiffres.length >= 4 ? `%${chiffres}%` : "@@aucun@@";
  const mailCarte = q.match(/[^\s:<>"'?&=\/]+@[^\s<>"'?&]+\.[a-z]{2,}/i);
  const likeMail = mailCarte ? mailCarte[0] : "@@aucun@@";
  const rows = await sql`SELECT id, prenom, nom, email, telephone FROM clients WHERE prenom ILIKE ${like} OR nom ILIKE ${like} OR email ILIKE ${like} OR telephone ILIKE ${like} OR regexp_replace(coalesce(telephone,''), '\\D', '', 'g') LIKE ${likeTel} OR lower(email) = lower(${likeMail}) ORDER BY nom LIMIT 5`;
  const clients = (rows as any[]).map((r) => ({ id: r.id, name: `${r.prenom} ${r.nom}`.trim(), phone: r.telephone, email: r.email }));
  const repRows = (await sql`SELECT r.id, r.statut, r.panne, c.prenom, c.nom, t.marque, t.modele FROM reparations r JOIN clients c ON c.id = r.client_id JOIN trottinettes t ON t.id = r.trottinette_id WHERE r.supprime_le IS NULL AND (${numPC ? Number(numPC[1]) : 0} = r.id OR c.prenom ILIKE ${like} OR c.nom ILIKE ${like} OR t.marque ILIKE ${like} OR t.modele ILIKE ${like} OR t.serie ILIKE ${like} OR r.panne ILIKE ${like}) ORDER BY (r.id = ${numPC ? Number(numPC[1]) : 0}) DESC, r.id DESC LIMIT 6`) as any[];
  const reparations = repRows.map((r) => ({ id: r.id, client: `${r.prenom} ${r.nom}`.trim(), trottinette: `${r.marque} ${r.modele}`.trim(), statut: r.statut, panne: r.panne }));
  let produits: any[] = [];
  let produitsIndisponibles = false;
  try {
    const t = q.replace(/["\\]/g, "");
    const ressembleCode = !/\s/.test(q) && q.length >= 6;
    // 1) recherche Shopify normale (gère déjà le pluriel) ; 2) si peu de résultats, recherche élargie par début de mot.
    const mots = t.split(/\s+/).filter(Boolean).map((w) => { const x = w.length > 4 && /s$/i.test(w) ? w.slice(0, -1) : w; return /^[A-Za-z0-9À-ÿ]+$/.test(x) ? `${x}*` : x; });
    const lance = async (qq: string) => { try { return await shopifyRead(PRODUITS_QUERY_LIEUX, { q: qq }); } catch { return await shopifyRead(PRODUITS_QUERY, { q: qq }); } };
    let data: any = await lance(ressembleCode ? `${t} OR sku:${t} OR barcode:${t}` : t);
    if (!ressembleCode && (data?.products?.nodes ?? []).length < 5) {
      const plus = await lance(mots.join(" "));
      const vus = new Set((data?.products?.nodes ?? []).map((p: any) => p.id));
      const ajout = (plus?.products?.nodes ?? []).filter((p: any) => !vus.has(p.id));
      data = { products: { nodes: [...(data?.products?.nodes ?? []), ...ajout] } };
      if (!data.products.nodes.length && mots.length > 1) {
        const long = t.split(/\s+/).filter((w) => w.length > 1).sort((x, y) => y.length - x.length)[0];
        if (long) data = await lance(`${long.replace(/s$/i, "")}*`);
      }
    }
    produits = (data?.products?.nodes ?? []).map((p: any) => ({
      id: p.id, titre: p.title, marque: p.vendor ?? "",
      variantes: (p.variants?.nodes ?? []).map((v: any) => ({
        id: v.id, titre: v.title ?? "", sku: v.sku ?? "", barcode: v.barcode ?? "", prix: v.price ?? "", stock: v.inventoryQuantity ?? null,
        lieux: (v.inventoryItem?.inventoryLevels?.nodes ?? []).map((n: any) => ({ lieu: nomLieu(n.location?.name ?? ""), qte: n.quantities?.[0]?.quantity ?? 0 })),
      })),
    }));
  } catch (e: any) {
    produitsIndisponibles = true;
    console.log(JSON.stringify({ event: "recherche-produits", message: String(e?.message ?? e).slice(0, 300) }));
  }
  // Emplacement en rayon (stock maison) : par nom/code/emplacement, et rattaché aux produits Shopify via SKU / code-barres.
  let stockLocal: any[] = [];
  try {
    const mg = c.get("user")?.magasin === "Rouen" ? "Rouen" : "Amiens";
    const like = "%" + q.replace(/[%_\\]/g, "") + "%";
    stockLocal = ((await sql`SELECT nom, code, prix_cents, qte, emplacement FROM stock_produits WHERE archive_le IS NULL AND magasin = ${mg} AND (nom ILIKE ${like} OR code ILIKE ${like} OR emplacement ILIKE ${like} OR id IN (SELECT produit_id FROM stock_codes WHERE code ILIKE ${like})) ORDER BY emplacement, nom LIMIT 8`) as any[]).map((p) => ({ nom: p.nom, code: p.code, prixCents: p.prix_cents, qte: p.qte, emplacement: p.emplacement }));
    const codes = [...new Set(produits.flatMap((p: any) => p.variantes.flatMap((v: any) => [v.sku, v.barcode]).filter(Boolean)))] as string[];
    if (codes.length) {
      const m = new Map(((await sql`SELECT code, emplacement FROM stock_produits WHERE archive_le IS NULL AND magasin = ${mg} AND emplacement <> '' AND code = ANY(${codes})`) as any[]).map((r) => [r.code, r.emplacement]));
      for (const r of (await sql`SELECT sc.code, p.emplacement FROM stock_codes sc JOIN stock_produits p ON p.id = sc.produit_id WHERE p.archive_le IS NULL AND p.magasin = ${mg} AND p.emplacement <> '' AND sc.code = ANY(${codes})`) as any[]) m.set(r.code, r.emplacement);
      for (const p of produits) for (const v of p.variantes) v.emplacement = m.get(v.sku) ?? m.get(v.barcode) ?? "";
    }
  } catch { /* stock maison indisponible : la recherche continue sans */ }
  // Numéro de série : retrouve la trottinette, son propriétaire actuel et la vente éventuelle.
  const trottinettes: any[] = [];
  if (q.length >= 3) {
    const ts = (await sql`SELECT t.id, t.marque, t.modele, t.serie, t.client_id, trim(c.prenom || ' ' || c.nom) AS client FROM trottinettes t JOIN clients c ON c.id = t.client_id WHERE t.serie ILIKE ${like} ORDER BY t.id DESC LIMIT 6`) as any[];
    for (const t of ts) {
      const [v] = (await sql`SELECT v.numero_facture, v.cree_le FROM vente_lignes vl JOIN ventes v ON v.id = vl.vente_id WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(vl.series) s WHERE lower(s) = lower(${t.serie})) ORDER BY v.id DESC LIMIT 1`) as any[];
      trottinettes.push({ id: t.id, modele: `${t.marque} ${t.modele}`.trim(), serie: t.serie, clientId: t.client_id, client: t.client, facture: v?.numero_facture ?? "", venduLe: v?.cree_le ?? null });
    }
  }
  return c.json({ clients, reparations, trottinettes, produits, produitsIndisponibles, stockLocal });
});

// Doublons : même email (sans tenir compte des majuscules) ou même numéro (9 derniers chiffres) sur une autre fiche.
const fin9 = (t: string) => { const d = String(t ?? "").replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : ""; };
export async function verifieDoublon(email: string, tel: string, sauf: number, ancien?: { email: string; telephone: string }) {
  const e = email.trim().toLowerCase();
  if (e && e !== (ancien?.email ?? "").trim().toLowerCase()) {
    const [x] = (await sql`SELECT id, prenom, nom FROM clients WHERE lower(trim(email)) = ${e} AND id <> ${sauf} LIMIT 1`) as any[];
    if (x) throw new AppError(409, `Cet email est déjà sur la fiche de ${`${x.prenom} ${x.nom}`.trim()}. Ouvre cette fiche (ou fusionne les deux).`);
  }
  const t = fin9(tel);
  if (t && t !== fin9(ancien?.telephone ?? "")) {
    const [x] = (await sql`SELECT id, prenom, nom FROM clients WHERE right(regexp_replace(telephone, '\\D', '', 'g'), 9) = ${t} AND length(regexp_replace(telephone, '\\D', '', 'g')) >= 9 AND id <> ${sauf} LIMIT 1`) as any[];
    if (x) throw new AppError(409, `Ce numéro est déjà sur la fiche de ${`${x.prenom} ${x.nom}`.trim()}. Ouvre cette fiche (ou fusionne les deux).`);
  }
}

app.get("/api/customer", async (c) => c.json(await fiche(Number(c.req.query("id")))));

app.post("/api/clients", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const nom = clean(b.nom, 80);
  if (!nom) throw new AppError(400, "Le nom est obligatoire.");
  await verifieDoublon(clean(b.email, 120), clean(b.telephone, 40), 0);
  const [row] = await sql`INSERT INTO clients (prenom, nom, telephone, email) VALUES (${clean(b.prenom, 80)}, ${nom}, ${clean(b.telephone, 40)}, ${clean(b.email, 120)}) RETURNING id`;
  return c.json({ id: row.id, message: SYNC ? "Client créé." : "Client créé (synchro Shopify éteinte)." });
});

app.post("/api/clients/modifier", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!(id > 0)) throw new AppError(404, "Client introuvable.");
  const nom = clean(b.nom, 80);
  if (!nom) throw new AppError(400, "Le nom est obligatoire.");
  const [client] = (await sql`SELECT id, email, telephone FROM clients WHERE id = ${id}`) as any[];
  if (!client) throw new AppError(404, "Client introuvable.");
  await verifieDoublon(clean(b.email, 120), clean(b.telephone, 40), id, client);
  await sql`UPDATE clients SET prenom = ${clean(b.prenom, 80)}, nom = ${nom}, telephone = ${clean(b.telephone, 40)}, email = ${clean(b.email, 120)} WHERE id = ${id}`;
  return c.json({ message: "Client modifié." });
});

// Supprimer une fiche vide (doublon). S'il y a des réparations ou des ventes, il faut fusionner.
app.post("/api/clients/supprimer", async (c) => {
  exigeResponsable(c);
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const [x] = await sql`SELECT id FROM clients WHERE id = ${id}`;
  if (!x) throw new AppError(404, "Client introuvable.");
  const [n] = (await sql`SELECT (SELECT count(*) FROM reparations WHERE client_id = ${id})::int AS r, (SELECT count(*) FROM ventes WHERE client_id = ${id})::int AS v`) as any[];
  if (n.r > 0 || n.v > 0) throw new AppError(409, `Cette fiche a ${n.r} réparation(s) et ${n.v} vente(s) : utilise « Fusionner dans une autre fiche » pour ne rien perdre.`);
  await sql`DELETE FROM trottinettes WHERE client_id = ${id}`;
  await sql`DELETE FROM clients WHERE id = ${id}`;
  return c.json({ message: "Fiche supprimée." });
});

// Fusionner un doublon dans une autre fiche : réparations, ventes et trottinettes sont déplacées, puis le doublon est supprimé.
app.post("/api/clients/fusionner", async (c) => {
  exigeResponsable(c);
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id), vers = Number(b.versId);
  if (!(id > 0) || !(vers > 0) || id === vers) throw new AppError(400, "Choisis une autre fiche.");
  const [a] = (await sql`SELECT id, email, telephone FROM clients WHERE id = ${id}`) as any[];
  const [d] = (await sql`SELECT id, email, telephone, shopify_id FROM clients WHERE id = ${vers}`) as any[];
  if (!a || !d) throw new AppError(404, "Client introuvable.");
  const ts = (await sql`SELECT id, serie FROM trottinettes WHERE client_id = ${id}`) as any[];
  for (const t of ts) {
    const [meme] = (await sql`SELECT id FROM trottinettes WHERE client_id = ${vers} AND serie = ${t.serie}`) as any[];
    if (meme) { await sql`UPDATE reparations SET trottinette_id = ${meme.id} WHERE trottinette_id = ${t.id}`; await sql`DELETE FROM trottinettes WHERE id = ${t.id}`; }
    else await sql`UPDATE trottinettes SET client_id = ${vers} WHERE id = ${t.id}`;
  }
  await sql`UPDATE reparations SET client_id = ${vers} WHERE client_id = ${id}`;
  await sql`UPDATE ventes SET client_id = ${vers} WHERE client_id = ${id}`;
  // Toutes les autres tables qui pointent vers un client (bons d'achat, paiements web, SAV, messages...) : sinon la suppression est refusée.
  for (const t of ["bons_achat", "paiements_web", "devis_simples", "messages_envoyes", "remboursements", "sav_dossiers"]) {
    try { await sql.unsafe(`UPDATE ${t} SET client_id = ${vers} WHERE client_id = ${id}`); } catch (e: any) { console.log(JSON.stringify({ event: "fusion", table: t, message: String(e?.message ?? e).slice(0, 200) })); }
  }
  try { await sql`UPDATE trott_transferts SET de_client = ${vers} WHERE de_client = ${id}`; await sql`UPDATE trott_transferts SET vers_client = ${vers} WHERE vers_client = ${id}`; } catch { /* table facultative */ }
  await sql`UPDATE clients SET email = CASE WHEN email = '' THEN ${a.email} ELSE email END, telephone = CASE WHEN telephone = '' THEN ${a.telephone} ELSE telephone END, shopify_id = COALESCE(shopify_id, ${a.shopify_id ?? null}) WHERE id = ${vers}`;
  await sql`DELETE FROM clients WHERE id = ${id}`;
  return c.json({ message: "Fiches fusionnées.", id: vers });
});

// Changer une trottinette de propriétaire (le client la récupère d'un autre). L'historique reste sur l'ancienne fiche.
await sql`CREATE TABLE IF NOT EXISTS trott_transferts (id SERIAL PRIMARY KEY, trottinette_id INT NOT NULL, de_client INT, vers_client INT NOT NULL, par TEXT NOT NULL DEFAULT '', cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
app.post("/api/trottinettes/transferer", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const tid = Number(b.trottinetteId), vers = Number(b.versClientId);
  const [t] = (await sql`SELECT id, client_id, serie FROM trottinettes WHERE id = ${tid}`) as any[];
  if (!t) throw new AppError(404, "Trottinette introuvable.");
  const [cl] = (await sql`SELECT id, prenom, nom FROM clients WHERE id = ${vers}`) as any[];
  if (!cl) throw new AppError(404, "Nouveau propriétaire introuvable.");
  if (t.client_id === vers) throw new AppError(400, "Elle est déjà sur cette fiche.");
  const [enCours] = (await sql`SELECT id FROM reparations WHERE trottinette_id = ${tid} AND statut <> 'récupéré' AND supprime_le IS NULL LIMIT 1`) as any[];
  if (enCours) throw new AppError(409, "Une réparation est en cours sur cette trottinette : termine-la avant de changer de propriétaire.");
  const [meme] = (await sql`SELECT id FROM trottinettes WHERE client_id = ${vers} AND serie = ${t.serie}`) as any[];
  if (meme) throw new AppError(409, "Ce client a déjà cette trottinette sur sa fiche.");
  await sql`UPDATE trottinettes SET client_id = ${vers} WHERE id = ${tid}`;
  await sql`INSERT INTO trott_transferts (trottinette_id, de_client, vers_client, par) VALUES (${tid}, ${t.client_id}, ${vers}, ${String((c.get("user") as any)?.prenom ?? "")})`;
  return c.json({ message: `Trottinette transférée à ${cl.prenom} ${cl.nom}.` });
});

await sql`ALTER TABLE trottinettes ADD COLUMN IF NOT EXISTS code_acces TEXT`;
// Code de déverrouillage / mot de passe de la trottinette (facultatif), pour ne pas rappeler le client à chaque fois.
app.post("/api/trottinettes/code", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const [t] = (await sql`UPDATE trottinettes SET code_acces = ${clean(b.code, 60) || null} WHERE id = ${Number(b.trottinetteId)} RETURNING id`) as any[];
  if (!t) throw new AppError(404, "Trottinette introuvable.");
  return c.json({ message: "Code enregistré." });
});

app.post("/api/trottinettes", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const marque = clean(b.marque, 60), modele = clean(b.modele, 60), serie = clean(b.serie, 60);
  if (!marque || !modele || !serie) throw new AppError(400, "Marque, modèle et numéro de série sont obligatoires.");
  const clientId = Number(b.customerId);
  await fiche(clientId);
  let tid: any;
  try {
    [tid] = (await sql`INSERT INTO trottinettes (client_id, marque, modele, serie) VALUES (${clientId}, ${marque}, ${modele}, ${serie}) RETURNING id`) as any[];
  } catch {
    throw new AppError(409, "Ce numéro de série est déjà associé à ce client.");
  }
  return c.json({ id: tid.id, message: "Trottinette associée." });
});
