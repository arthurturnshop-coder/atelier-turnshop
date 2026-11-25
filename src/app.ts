import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { STATUTS, SYNC } from "./config";
import { AppError } from "./util";

export const app = new Hono<{ Variables: { user: any } }>();

// En-têtes de sécurité (pas de CSP : la page utilise du script en ligne). Le logiciel interne ne doit pas être mis en iframe ; /pub est appelé en fetch par la Shopify.
app.use("*", secureHeaders({ contentSecurityPolicy: undefined, crossOriginResourcePolicy: false, crossOriginOpenerPolicy: false, crossOriginEmbedderPolicy: false, xFrameOptions: "DENY", referrerPolicy: "strict-origin-when-cross-origin" }));

app.onError((e, c) => {
  if (e instanceof AppError) return c.json({ error: e.message }, e.status as any);
  console.log(JSON.stringify({ event: "erreur", message: String((e as any)?.message ?? e).slice(0, 300) }));
  return c.json({ error: "Erreur interne, réessayer." }, 500);
});

app.get("/health", (c) => c.text("ok"));
app.get("/config", (c) => c.json({ statuts: STATUTS, shopifySync: SYNC }));
