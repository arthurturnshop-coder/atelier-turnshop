import { app } from "../app";
// Doit passer après la protection /api/* (auth.ts attend la base : sans cet import, cette route serait ouverte à tous).
import "./auth";
import { SHOP, SHOP_CLIENT_ID, SHOP_CLIENT_SECRET, SHOP_API } from "../shopify";
import { exigeAdmin } from "../util";

// Test pas à pas de la connexion Shopify (admins). Ne renvoie jamais les secrets.
app.get("/api/shopify/diagnostic", async (c) => {
  exigeAdmin(c);
  const etapes: { nom: string; ok: boolean; detail: string }[] = [];
  const add = (nom: string, ok: boolean, detail: string) => etapes.push({ nom, ok, detail });
  add("Adresse de la boutique (SHOPIFY_STORE_DOMAIN)", !!SHOP, SHOP ? SHOP : "manquante");
  add("Identifiant de l'app (SHOPIFY_CLIENT_ID)", !!SHOP_CLIENT_ID, SHOP_CLIENT_ID ? "présent" : "manquant");
  add("Secret de l'app (SHOPIFY_CLIENT_SECRET)", !!SHOP_CLIENT_SECRET, SHOP_CLIENT_SECRET ? "présent" : "manquant");
  if (!SHOP || !SHOP_CLIENT_ID || !SHOP_CLIENT_SECRET) return c.json({ etapes });
  let token = "";
  try {
    const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: SHOP_CLIENT_ID, client_secret: SHOP_CLIENT_SECRET, grant_type: "client_credentials" }),
      signal: AbortSignal.timeout(8000),
    });
    const txt = await res.text();
    let j: any = {}; try { j = JSON.parse(txt); } catch {}
    if (j.access_token) { token = j.access_token; add("Connexion à Shopify", true, `OK. Droits accordés : ${j.scope ?? "inconnus"}`); }
    else add("Connexion à Shopify", false, `Refusée (HTTP ${res.status}) : ${txt.replace(/<[^>]+>/g, " ").slice(0, 200)}`);
  } catch (e: any) { add("Connexion à Shopify", false, String(e?.message ?? e).slice(0, 200)); }
  if (token) {
    try {
      const res = await fetch(`https://${SHOP}/admin/api/${SHOP_API}/graphql.json`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
        body: JSON.stringify({ query: `{ products(first: 1) { nodes { title } } }` }), signal: AbortSignal.timeout(8000),
      });
      const j: any = await res.json();
      if (j.errors) add("Lecture des produits", false, JSON.stringify(j.errors).slice(0, 250));
      else add("Lecture des produits", true, `OK (exemple : ${j.data?.products?.nodes?.[0]?.title ?? "aucun produit"})`);
    } catch (e: any) { add("Lecture des produits", false, String(e?.message ?? e).slice(0, 200)); }
  }
  if (token) {
    try {
      const res = await fetch(`https://${SHOP}/admin/api/${SHOP_API}/graphql.json`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
        body: JSON.stringify({ query: `{ locations(first: 10) { nodes { name } } }` }), signal: AbortSignal.timeout(8000),
      });
      const j: any = await res.json();
      if (j.errors) add("Stock par boutique (emplacements)", false, "Droit read_locations manquant sur l'app : le stock s'affiche en total seulement.");
      else add("Stock par boutique (emplacements)", true, `Emplacements : ${(j.data?.locations?.nodes ?? []).map((n: any) => n.name).join(", ") || "aucun"}`);
    } catch (e: any) { add("Stock par boutique (emplacements)", false, String(e?.message ?? e).slice(0, 200)); }
  }
  return c.json({ etapes });
});
