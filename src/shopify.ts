export const SHOP = Bun.env.SHOPIFY_STORE_DOMAIN ?? "";
export const SHOP_CLIENT_ID = Bun.env.SHOPIFY_CLIENT_ID ?? "";
export const SHOP_CLIENT_SECRET = Bun.env.SHOPIFY_CLIENT_SECRET ?? "";
export const SHOP_API = "2025-10";
let shopCache: { token: string; expires: number } | null = null;

export function oublierJetonShopify() { shopCache = null; }

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

export async function shopifyRead(query: string, variables: Record<string, unknown>, retry = true): Promise<any> {
  const token = await shopifyToken();
  const res = await fetch(`https://${SHOP}/admin/api/${SHOP_API}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8000),
  });
  const json: any = await res.json();
  if (json.errors) {
    if (retry && JSON.stringify(json.errors).includes("Access denied")) { shopCache = null; return shopifyRead(query, variables, false); }
    throw new Error("Requête Shopify refusée");
  }
  return json.data;
}

export const FIDELITE_QUERY = `query($q: String!) { customers(first: 1, query: $q) { nodes { id points: metafield(namespace: "fidelite", key: "points") { value } } } }`;
export const PRODUITS_QUERY = `query($q: String!) { products(first: 12, query: $q) { nodes { id title vendor variants(first: 5) { nodes { id title sku barcode price inventoryQuantity } } } } }`;

// Écriture (mutations) : renvoie les données ou lève une erreur lisible.
export async function shopifyMutate(query: string, variables: Record<string, unknown>, version: string = SHOP_API, retry = true): Promise<any> {
  const token = await shopifyToken();
  const res = await fetch(`https://${SHOP}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (json.errors) {
    // Les droits de l'app ont pu changer depuis que le jeton a été mis en cache : on en redemande un neuf.
    if (retry && JSON.stringify(json.errors).includes("Access denied")) { shopCache = null; return shopifyMutate(query, variables, version, false); }
    throw new Error("Shopify : " + JSON.stringify(json.errors).slice(0, 300));
  }
  return json.data;
}

// Même recherche, avec le stock détaillé par emplacement (demande le droit read_locations).
export const PRODUITS_QUERY_LIEUX = `query($q: String!) { products(first: 12, query: $q) { nodes { id title vendor variants(first: 5) { nodes { id title sku barcode price inventoryQuantity inventoryItem { inventoryLevels(first: 10) { nodes { location { name } quantities(names: ["available"]) { quantity } } } } } } } } }`;
