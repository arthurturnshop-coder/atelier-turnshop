import { app } from "../app";
import { BLOCAGE_MS, ESSAIS_MAX, MAGASINS, PASSWORD } from "../config";
import { sql } from "../db";
import { AppError, clean, magasinsDe, samePassword } from "../util";
import { createHash, randomInt } from "node:crypto";
import { envoiEmail, brevoConfigure } from "../brevo";
// Même empreinte que caissier.ts (pas d'import : il enregistrerait ses routes avant ce contrôle d'accès).
const hashCode = (code: string) => createHash("sha256").update("turn-caisse:" + code).digest("hex");

const essais = new Map<string, { echecs: number; bloqueJusque: number }>();

app.get("/auth/profils", async (c) => {
  const magasin = clean(c.req.query("magasin"), 20);
  if (!MAGASINS.includes(magasin)) throw new AppError(400, "Magasin inconnu.");
  const rows = await sql`SELECT prenom, role, magasins, mdp_hash FROM utilisateurs WHERE actif = true ORDER BY id`;
  return c.json((rows as any[]).filter((u) => magasinsDe(u).includes(magasin)).map((u) => ({ prenom: u.prenom, role: u.role, aDefini: u.mdp_hash != null })));
});

app.post("/auth/connexion", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const prenom = clean(b.prenom, 40);
  const magasin = clean(b.magasin, 20);
  const motdepasse = String(b.motdepasse ?? "");
  if (!prenom || !MAGASINS.includes(magasin)) throw new AppError(400, "Profil ou magasin inconnu.");
  const cle = prenom.toLowerCase();
  const essai = essais.get(cle);
  if (essai && essai.bloqueJusque > Date.now()) {
    const min = Math.ceil((essai.bloqueJusque - Date.now()) / 60_000);
    throw new AppError(429, `Trop d'essais. Réessaie dans ${min} min.`);
  }
  const [u] = await sql`SELECT * FROM utilisateurs WHERE prenom = ${prenom} AND actif = true`;
  if (!u || !magasinsDe(u).includes(magasin)) throw new AppError(403, "Ce profil n'a pas accès à ce magasin.");
  if (u.mdp_hash == null) {
    if (motdepasse.length < 6) throw new AppError(400, "Le mot de passe doit faire au moins 6 caractères.");
    const hash = await Bun.password.hash(motdepasse);
    await sql`UPDATE utilisateurs SET mdp_hash = ${hash} WHERE id = ${u.id} AND mdp_hash IS NULL`;
  } else {
    const ok = await Bun.password.verify(motdepasse, u.mdp_hash);
    if (!ok) {
      const e = essais.get(cle) ?? { echecs: 0, bloqueJusque: 0 };
      e.echecs += 1;
      if (e.echecs >= ESSAIS_MAX) { e.bloqueJusque = Date.now() + BLOCAGE_MS; e.echecs = 0; }
      essais.set(cle, e);
      throw new AppError(401, "Mot de passe incorrect.");
    }
  }
  essais.delete(cle);
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  await sql`INSERT INTO sessions (token, utilisateur_id, magasin) VALUES (${token}, ${u.id}, ${magasin})`;
  return c.json({ token, prenom: u.prenom, role: u.role, magasin });
});

// Accès de secours par email : un code à 8 chiffres, valable 10 min, envoyé aux gérants (SECOURS_EMAILS dans Railway pour changer les adresses).
await sql`CREATE TABLE IF NOT EXISTS secours_codes (id SERIAL PRIMARY KEY, hash TEXT NOT NULL, expire TIMESTAMPTZ NOT NULL, essais INT NOT NULL DEFAULT 0, utilise BOOLEAN NOT NULL DEFAULT false, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
const SECOURS_DEST = () => (Bun.env.SECOURS_EMAILS || "arthurturnshop@gmail.com,antoineturnshop@gmail.com").split(",").map((x) => x.trim()).filter(Boolean);
const hashSecours = (c: string) => createHash("sha256").update("turn-secours:" + c).digest("hex");

app.post("/auth/secours-code", async (c) => {
  if (!brevoConfigure()) throw new AppError(503, "L'envoi d'emails n'est pas branché (Brevo) : utilise le mot de passe équipe.");
  const [r] = (await sql`SELECT count(*)::int AS h, count(*) FILTER (WHERE cree_le > now() - interval '60 seconds')::int AS m FROM secours_codes WHERE cree_le > now() - interval '1 hour'`) as any[];
  if (r.m > 0) throw new AppError(429, "Un code vient d'être envoyé. Attends 1 minute avant d'en redemander un.");
  if (r.h >= 5) throw new AppError(429, "Trop de demandes. Réessaie dans une heure.");
  const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
  await sql`UPDATE secours_codes SET utilise = true WHERE utilise = false`;
  await sql`INSERT INTO secours_codes (hash, expire) VALUES (${hashSecours(code)}, now() + interval '10 minutes')`;
  const quand = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
  const texte = `Code d'accès de secours à l'atelier TURN : ${code}\n\nValable 10 minutes, utilisable une seule fois. Demandé le ${quand}.\n\nSi personne de l'équipe n'a demandé ce code, ignore ce message.`;
  let ok = 0;
  for (const a of SECOURS_DEST()) { try { await envoiEmail(a, "Code d'accès de secours : " + code, texte); ok++; } catch { /* on tente les autres adresses */ } }
  if (!ok) throw new AppError(502, "L'email n'a pas pu partir. Utilise le mot de passe équipe.");
  return c.json({ message: "Code envoyé aux gérants par email (valable 10 min)." });
});

app.post("/auth/secours-verif", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const code = String(b.code ?? "").replace(/\D/g, "");
  const [k] = (await sql`SELECT id, hash, essais FROM secours_codes WHERE utilise = false AND expire > now() ORDER BY id DESC LIMIT 1`) as any[];
  if (!k) throw new AppError(403, "Aucun code valide : demande-en un nouveau.");
  if (code.length !== 8 || hashSecours(code) !== k.hash) {
    const n = k.essais + 1;
    await sql`UPDATE secours_codes SET essais = ${n}, utilise = ${n >= 5} WHERE id = ${k.id}`;
    throw new AppError(403, n >= 5 ? "Trop d'erreurs : demande un nouveau code." : "Code incorrect.");
  }
  await sql`UPDATE secours_codes SET utilise = true WHERE id = ${k.id}`;
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  await sql`INSERT INTO sessions (token, utilisateur_id, magasin) VALUES (${token}, NULL, NULL)`;
  return c.json({ token, prenom: "Secours", role: "admin", magasin: "" });
});

app.post("/auth/deconnexion", async (c) => {
  const tok = c.req.header("x-atelier-token") ?? "";
  if (tok) await sql`DELETE FROM sessions WHERE token = ${tok}`;
  return c.json({ message: "Déconnecté." });
});

// Poste partagé : la personne qui agit vraiment tape son code à 3 chiffres ; l'action est alors faite à son nom et avec SES droits.
const echecsCode = new Map<string, { n: number; jusque: number }>();
async function acteurParCode(code: string, magasin: string | null, cle: string) {
  const e = echecsCode.get(cle);
  if (e && e.jusque > Date.now()) throw new AppError(429, "Trop d'essais de code. Réessaie dans quelques minutes.");
  if (/^\d{3}$/.test(code)) {
    const rc = (await sql`SELECT prenom, role, magasins FROM utilisateurs WHERE actif = true AND code_caisse = ${hashCode(code)}`) as any[];
    for (const r of rc) if (!magasin || magasinsDe(r).includes(magasin)) { echecsCode.delete(cle); return { prenom: r.prenom, role: r.role, magasin }; }
  }
  const x = echecsCode.get(cle) ?? { n: 0, jusque: 0 };
  x.n += 1; if (x.n >= 5) { x.jusque = Date.now() + 5 * 60_000; x.n = 0; }
  echecsCode.set(cle, x);
  throw new AppError(403, "Code inconnu pour ce magasin.");
}

app.use("/api/*", async (c, next) => {
  const tok = c.req.header("x-atelier-token") ?? "";
  let base: any = null;
  if (tok) {
    const [s] = await sql`SELECT u.prenom, u.role, s.magasin FROM sessions s JOIN utilisateurs u ON u.id = s.utilisateur_id WHERE s.token = ${tok} AND u.actif = true AND s.cree_le > now() - interval '14 hours'`;
    if (s) base = { prenom: s.prenom, role: s.role, magasin: s.magasin, session: s.prenom };
  }
  if (!base && tok) {
    const [x] = await sql`SELECT 1 AS ok FROM sessions WHERE token = ${tok} AND utilisateur_id IS NULL AND cree_le > now() - interval '14 hours'`;
    if (x) base = { prenom: "Secours", role: "admin", magasin: null, secours: true, session: "Secours" };
  }
  if (!base && PASSWORD && samePassword(c.req.header("x-atelier-password") ?? "", PASSWORD)) base = { prenom: "Secours", role: "admin", magasin: null, secours: true };
  if (!base) return c.json({ error: "non autorisé" }, 401);
  const code = c.req.header("x-atelier-code") ?? "";
  if (code) {
    const a = await acteurParCode(code, base.magasin, (tok || "pw").slice(0, 24));
    base = { ...a, session: base.session ?? "Secours" };
  }
  // Vue « Rouen + Amiens mélangés » : réservée aux admins (rôle de la personne qui agit).
  if (c.req.header("x-atelier-vue") === "tous" && base.role === "admin") base = { ...base, tous: true };
  c.set("user", base);
  return next();
});

// Qui est derrière ce code ? (sert au poste partagé)
app.post("/api/acteur", async (c) => {
  const u = c.get("user") as any;
  return c.json({ prenom: u.prenom, role: u.role, magasin: u.magasin });
});
