import { createHash } from "node:crypto";
import { sql } from "../db";
import { app } from "../app";
import { AppError, exigeAdmin, magasinsDe } from "../util";

// ---------- Qui encaisse ? La personne tape SON mot de passe au moment d'encaisser : la vente est à son nom ----------
const ECHECS = new Map<string, { n: number; jusque: number }>();

await sql`ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS code_caisse TEXT`;
export const hashCode = (code: string) => createHash("sha256").update("turn-caisse:" + code).digest("hex");

export async function vendeurParMdp(c: any, mdp: unknown): Promise<string> {
  const u = c.get("user") as any;
  const saisi = String(mdp ?? "");
  // Profil Secours (mot de passe général) : pas de personne à identifier.
  if (u.secours) return u.prenom;
  const cle = String(u.prenom).toLowerCase();
  const e = ECHECS.get(cle);
  if (e && e.jusque > Date.now()) throw new AppError(429, "Trop d'essais. Réessaie dans quelques minutes.");
  if (!saisi) throw new AppError(400, "Tape ton code à 3 chiffres.");
  if (/^\d{3}$/.test(saisi)) {
    const rc = (await sql`SELECT prenom, magasins FROM utilisateurs WHERE actif = true AND code_caisse = ${hashCode(saisi)}`) as any[];
    for (const r of rc) if (!u.magasin || magasinsDe(r).includes(u.magasin)) { ECHECS.delete(cle); return r.prenom; }
  }
  const rows = (await sql`SELECT prenom, magasins, mdp_hash FROM utilisateurs WHERE actif = true AND mdp_hash IS NOT NULL`) as any[];
  for (const r of rows) {
    if (u.magasin && !magasinsDe(r).includes(u.magasin)) continue;
    if (await Bun.password.verify(saisi, r.mdp_hash)) { ECHECS.delete(cle); return r.prenom; }
  }
  const x = ECHECS.get(cle) ?? { n: 0, jusque: 0 };
  x.n += 1; if (x.n >= 5) { x.jusque = Date.now() + 5 * 60_000; x.n = 0; }
  ECHECS.set(cle, x);
  throw new AppError(401, "Code incorrect.");
}

// Définir son code de caisse (3 chiffres), après vérification de son mot de passe ; l'admin peut aussi le fixer pour un membre.
async function poserCode(prenom: string, code: string) {
  if (!/^\d{3}$/.test(code)) throw new AppError(400, "Le code doit faire exactement 3 chiffres.");
  const h = hashCode(code);
  const [pris] = (await sql`SELECT prenom FROM utilisateurs WHERE actif = true AND code_caisse = ${h} AND prenom <> ${prenom}`) as any[];
  if (pris) throw new AppError(400, "Ce code est déjà pris par un collègue, choisis-en un autre.");
  await sql`UPDATE utilisateurs SET code_caisse = ${h} WHERE prenom = ${prenom} AND actif = true`;
}
app.post("/api/moi/code-caisse", async (c) => {
  const u = c.get("user") as any;
  const b = await c.req.json().catch(() => ({}));
  if (u.secours) throw new AppError(400, "Le profil Secours n'a pas de code personnel.");
  const [row] = (await sql`SELECT mdp_hash FROM utilisateurs WHERE prenom = ${u.prenom} AND actif = true`) as any[];
  if (!row) throw new AppError(404, "Profil introuvable.");
  if (row.mdp_hash != null && !(await Bun.password.verify(String(b.motdepasse ?? ""), row.mdp_hash))) throw new AppError(401, "Mot de passe incorrect.");
  await poserCode(u.prenom, String(b.code ?? ""));
  return c.json({ message: "Code de caisse enregistré." });
});
app.post("/api/utilisateurs/code-caisse", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  await poserCode(String(b.prenom ?? ""), String(b.code ?? ""));
  return c.json({ message: "Code de caisse enregistré pour " + b.prenom + "." });
});
