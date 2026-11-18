import { Hono } from "hono";
import { STATUTS, SYNC } from "./config";
import { AppError } from "./util";

export const app = new Hono<{ Variables: { user: any } }>();

app.onError((e, c) => {
  if (e instanceof AppError) return c.json({ error: e.message }, e.status as any);
  console.log(JSON.stringify({ event: "erreur", message: String((e as any)?.message ?? e).slice(0, 300) }));
  return c.json({ error: "Erreur interne, réessayer." }, 500);
});

app.get("/health", (c) => c.text("ok"));
app.get("/config", (c) => c.json({ statuts: STATUTS, shopifySync: SYNC }));
