import { app } from "../app";
import { sql } from "../db";
import "./auth";
import { AppError, clean, exigeResponsable, magDe } from "../util";
import { envoiEmail, brevoConfigure } from "../brevo";

// Retours et SAV garantie des commandes du site (turnshop.fr) : demande -> mail d'instructions -> colis reçu -> test -> remboursement (fait dans Shopify) ou envoi fournisseur.
await sql`CREATE TABLE IF NOT EXISTS retours_site (
  id SERIAL PRIMARY KEY, magasin TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT 'retour', statut TEXT NOT NULL DEFAULT 'demande',
  nom TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', telephone TEXT NOT NULL DEFAULT '', commande TEXT NOT NULL DEFAULT '',
  produit TEXT NOT NULL DEFAULT '', motif TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', fournisseur TEXT NOT NULL DEFAULT '',
  montant_cents INT NOT NULL DEFAULT 0, client_id INT, par TEXT NOT NULL DEFAULT '', cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  mail_le TIMESTAMPTZ, recu_le TIMESTAMPTZ, teste_le TIMESTAMPTZ, clos_le TIMESTAMPTZ)`;

const STATUTS = ["demande", "attente", "recu", "ok", "ko", "rembourse", "fournisseur", "refuse", "clos"];
const FERMES = ["rembourse", "refuse", "clos"];

const MODELE_DEFAUT = `Bonjour {prenom},

Nous avons bien reçu votre demande de retour (commande {commande}, {produit}).

Merci de nous renvoyer le colis, bien protégé, à l'adresse suivante en indiquant votre numéro de retour {numero} :
TURN SOCIETY - 6 rue de la 2e DB - Amiens

Dès réception, nous testons l'article puis nous procédons au remboursement.

Cordialement,
L'équipe TURN Shop`;

async function modele(): Promise<string> {
  const [r] = (await sql`SELECT valeur FROM reglages WHERE cle = 'retours_site_mail'`) as any[];
  return r?.valeur || MODELE_DEFAUT;
}

const vue = (r: any) => ({ id: r.id, type: r.type, statut: r.statut, nom: r.nom, email: r.email, telephone: r.telephone, commande: r.commande, produit: r.produit, motif: r.motif, note: r.note, fournisseur: r.fournisseur, montantCents: r.montant_cents, par: r.par, magasin: r.magasin, cree: r.cree_le, mail: r.mail_le, recu: r.recu_le, teste: r.teste_le, clos: r.clos_le });

app.get("/api/retours-site", async (c) => {
  const mag = magDe(c);
  const rows = (await sql`SELECT * FROM retours_site WHERE (${mag}::text IS NULL OR magasin = ${mag}::text OR magasin = '') ORDER BY (statut IN ('rembourse','refuse','clos')), id DESC LIMIT 300`) as any[];
  return c.json({ retours: rows.map(vue), modele: await modele(), emailOk: brevoConfigure() });
});

app.post("/api/retours-site", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const u = c.get("user") as any;
  const nom = clean(b.nom, 120), email = clean(b.email, 120);
  const type = b.type === "garantie" ? "garantie" : b.type === "fournisseur" ? "fournisseur" : "retour";
  if (type !== "fournisseur" && !nom && !email) throw new AppError(400, "Indique au moins le nom ou l'email du client.");
  if (type === "fournisseur" && !clean(b.fournisseur, 120)) throw new AppError(400, "Indique le fournisseur.");
  if (!clean(b.produit, 200)) throw new AppError(400, "Indique le produit ou la pièce concernée.");
  const [r] = await sql`INSERT INTO retours_site (magasin, type, nom, email, telephone, commande, produit, motif, fournisseur, montant_cents, par) VALUES (${u?.magasin ?? ""}, ${type}, ${nom}, ${email}, ${clean(b.telephone, 40)}, ${clean(b.commande, 40)}, ${clean(b.produit, 200)}, ${clean(b.motif, 1000)}, ${clean(b.fournisseur, 120)}, ${Math.max(0, Math.round(Number(b.montantCents) || 0))}, ${u?.prenom ?? ""}) RETURNING id`;
  return c.json({ id: r.id, message: "Retour enregistré." });
});

app.post("/api/retours-site/maj", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const [r] = (await sql`SELECT * FROM retours_site WHERE id = ${id}`) as any[];
  if (!r) throw new AppError(404, "Retour introuvable.");
  const statut = b.statut === undefined ? r.statut : String(b.statut);
  if (!STATUTS.includes(statut)) throw new AppError(400, "Statut inconnu.");
  const note = b.note === undefined ? r.note : clean(b.note, 2000);
  const fournisseur = b.fournisseur === undefined ? r.fournisseur : clean(b.fournisseur, 120);
  const montant = b.montantCents === undefined ? r.montant_cents : Math.max(0, Math.round(Number(b.montantCents) || 0));
  if (statut === "fournisseur" && !fournisseur) throw new AppError(400, "Indique le fournisseur.");
  await sql`UPDATE retours_site SET statut = ${statut}, note = ${note}, fournisseur = ${fournisseur}, montant_cents = ${montant},
    recu_le = CASE WHEN ${statut} = 'recu' AND recu_le IS NULL THEN now() ELSE recu_le END,
    teste_le = CASE WHEN ${statut} IN ('ok','ko') THEN now() ELSE teste_le END,
    clos_le = CASE WHEN ${statut} IN ('rembourse','refuse','clos') THEN COALESCE(clos_le, now()) ELSE NULL END WHERE id = ${id}`;
  return c.json({ message: "Mis à jour." });
});

app.post("/api/retours-site/mail", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const [r] = (await sql`SELECT * FROM retours_site WHERE id = ${Number(b.id)}`) as any[];
  if (!r) throw new AppError(404, "Retour introuvable.");
  if (!r.email) throw new AppError(400, "Pas d'email sur ce retour.");
  if (!brevoConfigure()) throw new AppError(503, "Brevo n'est pas branché : rien n'a été envoyé.");
  const prenom = (r.nom || "").split(" ")[0] || "";
  const texte = (await modele()).replace(/\{prenom\}/g, prenom).replace(/\{commande\}/g, r.commande || "—").replace(/\{produit\}/g, r.produit).replace(/\{numero\}/g, "R" + r.id);
  try { await envoiEmail(r.email, "Votre retour TURN Shop (R" + r.id + ")", texte); } catch (e: any) { throw new AppError(502, String(e?.message ?? e)); }
  await sql`UPDATE retours_site SET mail_le = now(), statut = CASE WHEN statut = 'demande' THEN 'attente' ELSE statut END WHERE id = ${r.id}`;
  return c.json({ message: "Mail envoyé à " + r.email + "." });
});

app.post("/api/retours-site/modele", async (c) => {
  exigeResponsable(c);
  const b = await c.req.json().catch(() => ({}));
  const t = clean(b.texte, 4000);
  if (t.length < 20) throw new AppError(400, "Le mail est trop court.");
  await sql`INSERT INTO reglages (cle, valeur) VALUES ('retours_site_mail', ${t}) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`;
  return c.json({ message: "Modèle de mail enregistré." });
});

// Réception automatique des demandes du formulaire de retour du site (Make ou autre) : POST /pub/retour-formulaire avec l'en-tête x-secret = RETOURS_WEBHOOK_SECRET.
// Champs acceptés : nom, email, telephone, commande, produit, motif, texte (message brut si les champs ne sont pas séparés), ref (identifiant unique pour éviter les doublons).
app.post("/pub/retour-formulaire", async (c) => {
  const secret = Bun.env.RETOURS_WEBHOOK_SECRET ?? "";
  if (!secret || (c.req.header("x-secret") ?? "") !== secret) return c.json({ error: "non autorisé" }, 401);
  const b = await c.req.json().catch(() => ({}));
  const texte = clean(b.texte, 3000);
  const email = clean(b.email, 120) || (texte.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? "");
  const commande = clean(b.commande, 40) || (texte.match(/#\s?\d{3,7}/)?.[0] ?? "");
  const nom = clean(b.nom, 120), motif = clean(b.motif, 1000) || texte.slice(0, 1000);
  if (!email && !nom && !texte) throw new AppError(400, "Formulaire vide.");
  const ref = clean(b.ref, 120);
  if (ref) {
    const [d] = (await sql`SELECT id FROM retours_site WHERE note LIKE ${"%[ref:" + ref + "]%"} LIMIT 1`) as any[];
    if (d) return c.json({ id: d.id, message: "Déjà reçu." });
  }
  const [cl] = email ? ((await sql`SELECT id FROM clients WHERE lower(email) = lower(${email}) LIMIT 1`) as any[]) : [];
  const [r] = await sql`INSERT INTO retours_site (type, nom, email, telephone, commande, produit, motif, client_id, par, note) VALUES ('retour', ${nom}, ${email}, ${clean(b.telephone, 40)}, ${commande}, ${clean(b.produit, 200) || "À préciser (formulaire du site)"}, ${motif}, ${cl?.id ?? null}, 'Formulaire du site', ${ref ? "[ref:" + ref + "]" : ""}) RETURNING id`;
  return c.json({ id: r.id, message: "Retour créé." });
});
