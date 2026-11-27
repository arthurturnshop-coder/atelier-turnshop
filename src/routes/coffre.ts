import { app } from "../app";
import { sql } from "../db";
import { AppError, clean, exigeAdmin } from "../util";
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";

// ---------- Coffre : comptes et mots de passe utiles. Chiffrés en base (AES-256-GCM), clé dérivée du mot de passe du coffre
// (jamais stocké) : sans lui, même la base de données ne révèle rien. Lecture : toute personne connectée qui connaît le mot de passe.
// Création / modification / changement du mot de passe : administrateurs.
await sql`CREATE TABLE IF NOT EXISTS coffre_meta (id INT PRIMARY KEY DEFAULT 1, sel TEXT NOT NULL, verif TEXT NOT NULL)`;
await sql`CREATE TABLE IF NOT EXISTS coffre_entrees (id SERIAL PRIMARY KEY, service TEXT NOT NULL, identifiant TEXT NOT NULL DEFAULT '', secret TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', maj_le TIMESTAMPTZ NOT NULL DEFAULT now())`;

const cle = (mdp: string, sel: Buffer) => pbkdf2Sync(mdp, sel, 200000, 32, "sha256");
function chiffre(texte: string, k: Buffer): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(texte, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}
function dechiffre(s: string, k: Buffer): string {
  if (!s) return "";
  const [iv, tag, enc] = s.split(".").map((x) => Buffer.from(x, "base64"));
  const d = createDecipheriv("aes-256-gcm", k, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

const essais = new Map<string, { n: number; jusque: number }>();
async function ouvrir(c: any, mdp: unknown): Promise<Buffer> {
  const qui = String((c.get("user") as any)?.prenom ?? "?");
  const e = essais.get(qui);
  if (e && e.jusque > Date.now()) throw new AppError(429, "Trop d'essais : attends une minute.");
  const [m] = (await sql`SELECT sel, verif FROM coffre_meta WHERE id = 1`) as any[];
  if (!m) throw new AppError(409, "Le coffre n'a pas encore de mot de passe : un administrateur doit le créer.");
  const sel = Buffer.from(m.sel, "base64"), k = cle(String(mdp ?? ""), sel);
  let ok = false;
  try { ok = dechiffre(m.verif, k) === "coffre-ok"; } catch { ok = false; }
  if (!ok) {
    const n = (e?.n ?? 0) + 1;
    essais.set(qui, { n, jusque: n >= 5 ? Date.now() + 60000 : 0 });
    if (n >= 5) essais.set(qui, { n: 0, jusque: Date.now() + 60000 });
    throw new AppError(403, "Mot de passe du coffre incorrect.");
  }
  essais.delete(qui);
  return k;
}
async function liste(k: Buffer) {
  const rows = (await sql`SELECT id, service, identifiant, secret, note FROM coffre_entrees ORDER BY lower(service), id`) as any[];
  return rows.map((r) => { let secret = ""; try { secret = dechiffre(r.secret, k); } catch { secret = "⚠ illisible"; } return { id: r.id, service: r.service, identifiant: r.identifiant, secret, note: r.note }; });
}

app.get("/api/coffre/etat", async (c) => {
  const [m] = (await sql`SELECT id FROM coffre_meta WHERE id = 1`) as any[];
  return c.json({ cree: !!m });
});

app.post("/api/coffre/creer", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const mdp = String(b.mdp ?? "");
  if (mdp.length < 6) throw new AppError(400, "Choisis un mot de passe d'au moins 6 caractères.");
  const [m] = (await sql`SELECT id FROM coffre_meta WHERE id = 1`) as any[];
  if (m) throw new AppError(409, "Le coffre existe déjà.");
  const sel = randomBytes(16);
  await sql`INSERT INTO coffre_meta (id, sel, verif) VALUES (1, ${sel.toString("base64")}, ${chiffre("coffre-ok", cle(mdp, sel))})`;
  return c.json({ message: "Coffre créé." });
});

app.post("/api/coffre/ouvrir", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const k = await ouvrir(c, b.mdp);
  return c.json({ entrees: await liste(k) });
});

app.post("/api/coffre/entree", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const k = await ouvrir(c, b.mdp);
  const service = clean(b.service, 120);
  if (!service) throw new AppError(400, "Indique le service (ex : Shopify, Brevo, TPE…).");
  const enc = chiffre(String(b.secret ?? "").slice(0, 300), k);
  if (b.id) await sql`UPDATE coffre_entrees SET service = ${service}, identifiant = ${clean(b.identifiant, 200)}, secret = ${enc}, note = ${clean(b.note, 500)}, maj_le = now() WHERE id = ${Number(b.id)}`;
  else await sql`INSERT INTO coffre_entrees (service, identifiant, secret, note) VALUES (${service}, ${clean(b.identifiant, 200)}, ${enc}, ${clean(b.note, 500)})`;
  return c.json({ entrees: await liste(k) });
});

app.post("/api/coffre/supprimer", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const k = await ouvrir(c, b.mdp);
  await sql`DELETE FROM coffre_entrees WHERE id = ${Number(b.id)}`;
  return c.json({ entrees: await liste(k) });
});

app.post("/api/coffre/changer-mdp", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const ancien = await ouvrir(c, b.mdp);
  const neuf = String(b.nouveau ?? "");
  if (neuf.length < 6) throw new AppError(400, "Le nouveau mot de passe doit faire au moins 6 caractères.");
  const sel = randomBytes(16), k2 = cle(neuf, sel);
  const rows = (await sql`SELECT id, secret FROM coffre_entrees`) as any[];
  const re = rows.map((r) => ({ id: r.id, secret: chiffre(dechiffre(r.secret, ancien), k2) }));
  await sql.begin(async (tx: any) => {
    for (const r of re) await tx`UPDATE coffre_entrees SET secret = ${r.secret} WHERE id = ${r.id}`;
    await tx`UPDATE coffre_meta SET sel = ${sel.toString("base64")}, verif = ${chiffre("coffre-ok", k2)} WHERE id = 1`;
  });
  return c.json({ message: "Mot de passe du coffre changé." });
});
