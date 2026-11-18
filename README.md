# Atelier TURN v2

Application d'atelier de TURN SOCIETY : fiches de réparation, devis, planning, caisse interne, fidélité.
Bun + Hono + Postgres (Railway). Interface : une page HTML servie par le serveur.

## Organisation
- `src/index.ts` : démarrage (importe les routes dans le bon ordre)
- `src/config.ts`, `src/db.ts` (tables), `src/util.ts`, `src/shopify.ts` (lecture seule), `src/app.ts`
- `src/routes/` : auth, clients, reparations, planning, consignes, parametres, caisse
- `src/page.ts` + `src/page/` : la page HTML découpée en morceaux, assemblés dans l'ordre

## Variables Railway
`DATABASE_URL`, `ATELIER_PASSWORD` (accès de secours), `SHOPIFY_SYNC` (false), `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`.

## Lancer / vérifier
`bun install && bun run start` — `bun run check` pour le typage. Santé : `GET /health`.
