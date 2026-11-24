import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { AppError, clean } from "../util";

// Chat interne : un fil « Équipe » pour tout le monde + des messages privés entre deux personnes.
await sql`CREATE TABLE IF NOT EXISTS chat_messages (id SERIAL PRIMARY KEY, de TEXT NOT NULL, a TEXT, texte TEXT NOT NULL, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`CREATE INDEX IF NOT EXISTS chat_messages_a ON chat_messages (a, id)`;
await sql`CREATE TABLE IF NOT EXISTS chat_lus (prenom TEXT NOT NULL, conv TEXT NOT NULL, dernier_id INT NOT NULL DEFAULT 0, PRIMARY KEY (prenom, conv))`;

const moi = (c: any): string => String((c.get("user") as any)?.prenom ?? "");

// Membres de l'équipe (pour choisir à qui écrire).
app.get("/api/chat/equipe", async (c) => {
  const rows = (await sql`SELECT prenom, magasins FROM utilisateurs WHERE actif = true ORDER BY prenom`) as any[];
  return c.json({ moi: moi(c), membres: rows.filter((r) => r.prenom !== moi(c)).map((r) => ({ prenom: r.prenom, magasins: r.magasins })) });
});

// Messages d'une conversation ("equipe" ou le prénom d'un collègue) ; la marque comme lue.
app.get("/api/chat/messages", async (c) => {
  const me = moi(c);
  const conv = clean(c.req.query("conv"), 60) || "equipe";
  const rows = (conv === "equipe"
    ? await sql`SELECT id, de, a, texte, cree_le FROM chat_messages WHERE a IS NULL ORDER BY id DESC LIMIT 200`
    : await sql`SELECT id, de, a, texte, cree_le FROM chat_messages WHERE (de = ${me} AND a = ${conv}) OR (de = ${conv} AND a = ${me}) ORDER BY id DESC LIMIT 200`) as any[];
  rows.reverse();
  const dernier = rows.length ? rows[rows.length - 1].id : 0;
  if (dernier) await sql`INSERT INTO chat_lus (prenom, conv, dernier_id) VALUES (${me}, ${conv}, ${dernier}) ON CONFLICT (prenom, conv) DO UPDATE SET dernier_id = GREATEST(chat_lus.dernier_id, ${dernier})`;
  return c.json({ messages: rows.map((r) => ({ id: r.id, de: r.de, texte: r.texte, le: r.cree_le })) });
});

app.post("/api/chat/envoyer", async (c) => {
  const me = moi(c);
  const b = await c.req.json().catch(() => ({}));
  const texte = clean(b.texte, 2000);
  if (!texte) throw new AppError(400, "Écris un message.");
  const conv = clean(b.conv, 60) || "equipe";
  if (conv !== "equipe") {
    const [u] = (await sql`SELECT 1 AS ok FROM utilisateurs WHERE prenom = ${conv} AND actif = true`) as any[];
    if (!u) throw new AppError(404, "Personne introuvable.");
  }
  await sql`INSERT INTO chat_messages (de, a, texte) VALUES (${me}, ${conv === "equipe" ? null : conv}, ${texte})`;
  return c.json({ message: "Envoyé." });
});

// Messages non lus : total + par conversation (pastille dans l'en-tête).
app.get("/api/chat/non-lus", async (c) => {
  const me = moi(c);
  const eq = (await sql`SELECT count(*)::int AS n FROM chat_messages m WHERE m.a IS NULL AND m.de <> ${me} AND m.id > COALESCE((SELECT dernier_id FROM chat_lus WHERE prenom = ${me} AND conv = 'equipe'), 0)`) as any[];
  const dm = (await sql`SELECT m.de AS conv, count(*)::int AS n FROM chat_messages m WHERE m.a = ${me} AND m.id > COALESCE((SELECT dernier_id FROM chat_lus WHERE prenom = ${me} AND conv = m.de), 0) GROUP BY m.de`) as any[];
  const par: Record<string, number> = { equipe: eq[0]?.n ?? 0 };
  for (const r of dm) par[r.conv] = r.n;
  return c.json({ total: Object.values(par).reduce((s, n) => s + n, 0), par });
});
