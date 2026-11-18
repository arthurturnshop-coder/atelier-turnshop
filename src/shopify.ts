export const SHOP = Bun.env.SHOPIFY_STORE_DOMAIN ?? "";
export const SHOP_CLIENT_ID = Bun.env.SHOPIFY_CLIENT_ID ?? "";
export const SHOP_CLIENT_SECRET = Bun.env.SHOPIFY_CLIENT_SECRET ?? "";
export const SHOP_API = "2025-10";
let shopCache: { token: string; expires: number } | null = null;

export async function shopifyToken(): Promise<string> {
  if (shopCache && shopCache.expires > Date.now() + 60_000) return shopCache.token;
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: SHOP_CLIENT_ID, client_secret: SHOP_CLIENT_SECRET, grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(8000),
  });
  const json: any = await res.json();
  if (!json.access_token) throw new Error("Jeton Shopify refusé");
  shopCache = { token: json.access_token, expires: Date.now() + Number(json.expires_in ?? 3600) * 1000 };
  return shopCache.token;
}

export async function shopifyRead(query: string, variables: Record<string, unknown>): Promise<any> {
  const token = await shopifyToken();
  const res = await fetch(`https://${SHOP}/admin/api/${SHOP_API}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8000),
  });
  const json: any = await res.json();
  if (json.errors) throw new Error("Requête Shopify refusée");
  return json.data;
}

export const FIDELITE_QUERY = `query($q: String!) { customers(first: 1, query: $q) { nodes { id points: metafield(namespace: "fidelite", key: "points") { value } } } }`;
export const PRODUITS_QUERY = `query($q: String!) { products(first: 6, query: $q) { nodes { id title vendor variants(first: 3) { nodes { sku barcode price inventoryQuantity } } } } }`;
