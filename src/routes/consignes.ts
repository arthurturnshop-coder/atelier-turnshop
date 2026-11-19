import { app } from "../app";
import { CONSIGNES } from "../config";
import { sql } from "../db";
import { FIDELITE_QUERY, shopifyRead } from "../shopify";
import { clean } from "../util";

// ---------- Consignes, chiffres, fidélité ----------
app.get("/api/consignes", async (c) => {
  const rows = await sql`SELECT cle, texte FROM consignes`;
  const out: Record<string, string> = {};
  for (const k of CONSIGNES) out[k] = "";
  for (const r of rows as any[]) if (CONSIGNES.includes(r.cle)) out[r.cle] = r.texte;
  return c.json(out);
});

app.post("/api/consignes", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  for (const k of CONSIGNES) {
    if (typeof b[k] !== "string") continue;
    const texte = clean(b[k], 600);
    await sql`INSERT INTO consignes (cle, texte, maj_le) VALUES (${k}, ${texte}, now())
      ON CONFLICT (cle) DO UPDATE SET texte = EXCLUDED.texte, maj_le = now()`;
  }
  return c.json({ message: "Consignes enregistrées." });
});

app.get("/api/chiffres", async (c) => {
  const [recues] = await sql`SELECT count(*)::int AS n FROM reparations WHERE date_depot = CURRENT_DATE AND supprime_le IS NULL`;
  const [encours] = await sql`SELECT count(*)::int AS n FROM reparations WHERE statut <> 'récupéré' AND supprime_le IS NULL`;
  const [pretes] = await sql`SELECT count(*)::int AS n FROM reparations WHERE statut = 'prêt' AND supprime_le IS NULL`;
  const [recup] = await sql`SELECT count(*)::int AS n FROM reparations WHERE statut = 'récupéré' AND maj_le::date = CURRENT_DATE AND supprime_le IS NULL`;
  const [clients] = await sql`SELECT count(*)::int AS n FROM clients WHERE cree_le::date = CURRENT_DATE`;
  const [avis] = await sql`SELECT count(*)::int AS n FROM reparations WHERE avis_statut = 'programme' AND supprime_le IS NULL`;
  const [ca] = await sql`SELECT COALESCE(sum(total_cents), 0)::int AS n FROM ventes WHERE cree_le::date = CURRENT_DATE`;
  return c.json({
    receptionsAujourdhui: recues.n,
    enCours: encours.n,
    pretesARendre: pretes.n,
    recuperees: recup.n,
    nouveauxClients: clients.n,
    avisProgrammes: avis.n,
    caCaisseCents: ca.n,
  });
});

// Chiffre d'affaires d'un client : ventes/factures de l'atelier (acompte déduit réintégré) + total dépensé côté Shopify (boutique et web).
app.get("/api/clients/ca", async (c) => {
  const id = Number(c.req.query("id"));
  if (!(id > 0)) return c.json({ atelierCents: 0, nb: 0 });
  const [a] = (await sql`SELECT COALESCE(sum(total_cents + acompte_deduit_cents), 0)::int AS ca, count(*)::int AS nb, max(cree_le) AS derniere FROM ventes WHERE client_id = ${id} AND type = 'vente'`) as any[];
  let shopifyCents: number | null = null;
  try {
    const [cl] = (await sql`SELECT email, telephone, shopify_id FROM clients WHERE id = ${id}`) as any[];
    const q = cl?.shopify_id ? `id:${String(cl.shopify_id).split("/").pop()}` : cl?.email ? `email:${clean(cl.email, 120)}` : "";
    if (q) {
      const d = await shopifyRead(`query($q: String!) { customers(first: 1, query: $q) { nodes { amountSpent { amount } } } }`, { q });
      const n = d?.customers?.nodes?.[0];
      if (n) shopifyCents = Math.round(Number(n.amountSpent?.amount ?? 0) * 100);
    }
  } catch { /* Shopify indisponible : on affiche seulement l'atelier */ }
  return c.json({ atelierCents: a.ca, nb: a.nb, derniere: a.derniere, shopifyCents });
});

app.get("/api/fidelite", async (c) => {
  try {
    const id = Number(c.req.query("id"));
    if (!(id > 0)) return c.json({ trouve: false });
    const [client] = await sql`SELECT email, telephone FROM clients WHERE id = ${id}`;
    if (!client) return c.json({ trouve: false });
    const email = clean(client.email, 120);
    const phone = clean(client.telephone, 40).replace(/\s/g, "");
    const q = email ? `email:${email}` : phone ? `phone:${phone}` : "";
    if (!q) return c.json({ trouve: false });
    const data = await shopifyRead(FIDELITE_QUERY, { q });
    const node = data?.customers?.nodes?.[0];
    if (!node) return c.json({ trouve: false });
    const points = Number(node.points?.value ?? 0);
    return c.json({ points, euros: Math.floor(points / 100) * 5, trouve: true });
  } catch (e: any) {
    console.log(JSON.stringify({ event: "fidelite", message: String(e?.message ?? e).slice(0, 300) }));
    return c.json({ trouve: false });
  }
});
