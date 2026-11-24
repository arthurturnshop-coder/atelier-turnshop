import { app } from "../app";
import { sql } from "../db";
import { AppError, clean, exigeAdmin } from "../util";

// ---------- Défi du mois : meilleur réparateur et meilleur vendeur, cadeau réglé dans Paramètres ----------
async function lire(cle: string, def = "") { const [r] = (await sql`SELECT valeur FROM parametres WHERE cle = ${cle}`) as any[]; return r ? String(r.valeur) : def; }
async function ecrire(cle: string, valeur: string) { await sql`INSERT INTO parametres (cle, valeur, maj_le) VALUES (${cle}, ${valeur}, now()) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, maj_le = now()`; }

async function classement(debut: string, fin: string) {
  const rep = (await sql`SELECT technicien AS nom, count(*)::int AS n FROM reparations WHERE technicien IS NOT NULL AND technicien <> '' AND supprime_le IS NULL AND pret_le >= ${debut}::date AND pret_le < ${fin}::date GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 5`) as any[];
  const ven = (await sql`SELECT vendeur AS nom, sum(total_cents)::int AS cents, count(*)::int AS n FROM ventes WHERE type = 'vente' AND vendeur IS NOT NULL AND vendeur <> '' AND vendeur <> 'Secours' AND cree_le >= ${debut}::date AND cree_le < ${fin}::date GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 5`) as any[];
  return { reparateurs: rep.map((r) => ({ nom: r.nom, n: r.n })), vendeurs: ven.map((r) => ({ nom: r.nom, cents: r.cents, n: r.n })) };
}

app.get("/api/defi", async (c) => {
  const now = new Date(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date()) + "T12:00:00Z");
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const iso = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 1)).toISOString().slice(0, 10);
  const cur = iso(y, m), suiv = iso(y, m + 1), prec = iso(y, m - 1);
  return c.json({
    actif: (await lire("defi_actif", "0")) === "1",
    cadeauReparateur: await lire("defi_cadeau_reparateur"),
    cadeauVendeur: await lire("defi_cadeau_vendeur"),
    courant: { mois: cur.slice(0, 7), ...(await classement(cur, suiv)) },
    precedent: { mois: prec.slice(0, 7), ...(await classement(prec, cur)) },
  });
});

app.post("/api/defi", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  await ecrire("defi_actif", b.actif ? "1" : "0");
  await ecrire("defi_cadeau_reparateur", clean(b.cadeauReparateur, 200));
  await ecrire("defi_cadeau_vendeur", clean(b.cadeauVendeur, 200));
  return c.json({ message: "Défi du mois enregistré." });
});

// Changer son propre mot de passe.
app.post("/api/moi/mot-de-passe", async (c) => {
  const u = c.get("user") as any;
  const b = await c.req.json().catch(() => ({}));
  const ancien = String(b.ancien ?? ""), nouveau = String(b.nouveau ?? "");
  if (u.secours) throw new AppError(400, "Le profil Secours n'a pas de mot de passe personnel.");
  if (nouveau.length < 6) throw new AppError(400, "Le nouveau mot de passe doit faire au moins 6 caractères.");
  const [row] = (await sql`SELECT id, mdp_hash FROM utilisateurs WHERE prenom = ${u.prenom} AND actif = true`) as any[];
  if (!row) throw new AppError(404, "Profil introuvable.");
  if (row.mdp_hash != null && !(await Bun.password.verify(ancien, row.mdp_hash))) throw new AppError(401, "Ancien mot de passe incorrect.");
  await sql`UPDATE utilisateurs SET mdp_hash = ${await Bun.password.hash(nouveau)} WHERE id = ${row.id}`;
  const tok = c.req.header("x-atelier-token") ?? "";
  await sql`DELETE FROM sessions WHERE utilisateur_id = ${row.id} AND token <> ${tok}`;
  return c.json({ message: "Mot de passe changé." });
});

// Admin : oublie le mot de passe d'un membre, il en choisira un nouveau à sa prochaine connexion.
app.get("/api/utilisateurs/liste", async (c) => { exigeAdmin(c); return c.json(((await sql`SELECT prenom, role FROM utilisateurs WHERE actif = true ORDER BY id`) as any[]).map((r) => ({ prenom: r.prenom, role: r.role }))); });
app.post("/api/utilisateurs/reinit-mdp", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const [u] = (await sql`UPDATE utilisateurs SET mdp_hash = NULL WHERE prenom = ${clean(b.prenom, 40)} AND actif = true RETURNING id`) as any[];
  if (!u) throw new AppError(404, "Membre introuvable.");
  await sql`DELETE FROM sessions WHERE utilisateur_id = ${u.id}`;
  return c.json({ message: "Mot de passe réinitialisé : il en choisira un nouveau à sa prochaine connexion." });
});
