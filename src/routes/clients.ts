import { app } from "../app";
import { SYNC } from "../config";
import { sql } from "../db";
import { PRODUITS_QUERY, PRODUITS_QUERY_LIEUX, shopifyRead } from "../shopify";
import { AppError, clean } from "../util";

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
  const like = `%${q}%`;
  const rows = await sql`SELECT id FROM clients WHERE prenom ILIKE ${like} OR nom ILIKE ${like} OR email ILIKE ${like} OR telephone ILIKE ${like} ORDER BY nom LIMIT 8`;
  return c.json(await Promise.all(rows.map((r: any) => fiche(r.id))));
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
    const search = ressembleCode ? `${t} OR sku:${t} OR barcode:${t}` : t;
    let data: any;
    try { data = await shopifyRead(PRODUITS_QUERY_LIEUX, { q: search }); }
    catch { data = await shopifyRead(PRODUITS_QUERY, { q: search }); }
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
  return c.json({ clients, reparations, produits, produitsIndisponibles });
});

app.get("/api/customer", async (c) => c.json(await fiche(Number(c.req.query("id")))));

app.post("/api/clients", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const nom = clean(b.nom, 80);
  if (!nom) throw new AppError(400, "Le nom est obligatoire.");
  const [row] = await sql`INSERT INTO clients (prenom, nom, telephone, email) VALUES (${clean(b.prenom, 80)}, ${nom}, ${clean(b.telephone, 40)}, ${clean(b.email, 120)}) RETURNING id`;
  return c.json({ id: row.id, message: SYNC ? "Client créé." : "Client créé (synchro Shopify éteinte)." });
});

app.post("/api/clients/modifier", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!(id > 0)) throw new AppError(404, "Client introuvable.");
  const nom = clean(b.nom, 80);
  if (!nom) throw new AppError(400, "Le nom est obligatoire.");
  const [client] = await sql`SELECT id FROM clients WHERE id = ${id}`;
  if (!client) throw new AppError(404, "Client introuvable.");
  await sql`UPDATE clients SET prenom = ${clean(b.prenom, 80)}, nom = ${nom}, telephone = ${clean(b.telephone, 40)}, email = ${clean(b.email, 120)} WHERE id = ${id}`;
  return c.json({ message: "Client modifié." });
});

app.post("/api/trottinettes", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const marque = clean(b.marque, 60), modele = clean(b.modele, 60), serie = clean(b.serie, 60);
  if (!marque || !modele || !serie) throw new AppError(400, "Marque, modèle et numéro de série sont obligatoires.");
  const clientId = Number(b.customerId);
  await fiche(clientId);
  try {
    await sql`INSERT INTO trottinettes (client_id, marque, modele, serie) VALUES (${clientId}, ${marque}, ${modele}, ${serie})`;
  } catch {
    throw new AppError(409, "Ce numéro de série est déjà associé à ce client.");
  }
  return c.json({ message: "Trottinette associée." });
});
