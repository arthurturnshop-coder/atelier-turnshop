import { sql } from "../db";
import { AppError, magasinsDe } from "../util";

// ---------- Qui encaisse ? La personne tape SON mot de passe au moment d'encaisser : la vente est à son nom ----------
const ECHECS = new Map<string, { n: number; jusque: number }>();

export async function vendeurParMdp(c: any, mdp: unknown): Promise<string> {
  const u = c.get("user") as any;
  const saisi = String(mdp ?? "");
  // Profil Secours (mot de passe général) : pas de personne à identifier.
  if (u.secours) return u.prenom;
  const cle = String(u.prenom).toLowerCase();
  const e = ECHECS.get(cle);
  if (e && e.jusque > Date.now()) throw new AppError(429, "Trop d'essais. Réessaie dans quelques minutes.");
  if (!saisi) throw new AppError(400, "Celui qui encaisse doit taper son mot de passe.");
  const rows = (await sql`SELECT prenom, magasins, mdp_hash FROM utilisateurs WHERE actif = true AND mdp_hash IS NOT NULL`) as any[];
  for (const r of rows) {
    if (u.magasin && !magasinsDe(r).includes(u.magasin)) continue;
    if (await Bun.password.verify(saisi, r.mdp_hash)) { ECHECS.delete(cle); return r.prenom; }
  }
  const x = ECHECS.get(cle) ?? { n: 0, jusque: 0 };
  x.n += 1; if (x.n >= 5) { x.jusque = Date.now() + 5 * 60_000; x.n = 0; }
  ECHECS.set(cle, x);
  throw new AppError(401, "Mot de passe incorrect.");
}
