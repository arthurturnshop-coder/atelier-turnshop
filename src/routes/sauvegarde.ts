import { app } from "../app";
import { sql } from "../db";
import { AppError, clean, exigeAdmin } from "../util";
import { brevoConfigure, envoiEmail } from "../brevo";

// ---------- Sauvegarde complète de la base (Railway n'en fait pas sur cette offre) ----------
// Export JSON compressé de toutes les tables ; restauration : bun scripts/restore.ts fichier.json.gz
const EXCLUES = new Set(["sessions"]);
const LIMITE_EMAIL = 2_800_000; // octets (Brevo accepte ~4 Mo en pièce jointe, le base64 ajoute 33 %)

const reglage = async (cle: string) => ((await sql`SELECT valeur FROM reglages WHERE cle = ${cle}`) as any[])[0]?.valeur ?? "";
const poser = async (cle: string, valeur: string) => { await sql`INSERT INTO reglages (cle, valeur) VALUES (${cle}, ${valeur}) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`; };

export async function dumpBase(): Promise<{ data: Uint8Array; tables: number; lignes: number }> {
  const noms = ((await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`) as any[]).map((r) => r.table_name as string).filter((n) => !EXCLUES.has(n) && /^[a-z0-9_]+$/i.test(n));
  const tables: Record<string, any[]> = {};
  let lignes = 0;
  for (const n of noms) {
    const [r] = (await sql.unsafe(`SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) AS d FROM "${n}" t`)) as any[];
    const arr = typeof r.d === "string" ? JSON.parse(r.d) : r.d;
    tables[n] = arr; lignes += arr.length;
  }
  const json = JSON.stringify({ version: 1, date: new Date().toISOString(), tables });
  return { data: Bun.gzipSync(new TextEncoder().encode(json)), tables: noms.length, lignes };
}

const nomFichier = () => `sauvegarde-fs-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json.gz`;

export async function sauvegardeParEmail(): Promise<string> {
  const dest = await reglage("sauvegarde_email");
  if (!dest) throw new AppError(400, "Aucun email de sauvegarde n'est réglé (Paramètres > Sauvegarde).");
  if (!brevoConfigure()) throw new AppError(503, "Les emails ne sont pas branchés (Brevo).");
  const d = await dumpBase();
  const ko = Math.round(d.data.length / 1024);
  if (d.data.length > LIMITE_EMAIL) {
    await envoiEmail(dest, "⚠ Sauvegarde FS trop lourde pour l'email", `La sauvegarde de cette nuit pèse ${ko} Ko : trop lourde pour être jointe à un email.\n\nTélécharge-la à la main dans le logiciel : Paramètres > Sauvegarde > Télécharger.`);
    const msg = `trop lourde pour l'email (${ko} Ko) : à télécharger à la main`;
    await poser("sauvegarde_derniere", `${new Date().toISOString()}|alerte|${msg}`);
    return msg;
  }
  await envoiEmail(dest, "Sauvegarde FS by TURN Shop", `Sauvegarde automatique de la base (${d.tables} tables, ${d.lignes} lignes, ${ko} Ko).\n\nGarde ce fichier : il permet de tout restaurer.`, [{ name: nomFichier(), content: Buffer.from(d.data).toString("base64") }]);
  const msg = `envoyée à ${dest} (${d.tables} tables, ${d.lignes} lignes, ${ko} Ko)`;
  await poser("sauvegarde_derniere", `${new Date().toISOString()}|ok|${msg}`);
  return msg;
}

app.get("/api/sauvegarde", async (c) => {
  exigeAdmin(c);
  const d = await dumpBase();
  await poser("sauvegarde_derniere_dl", `${new Date().toISOString()}|${(c.get("user") as any)?.prenom ?? ""}`);
  return new Response(d.data, { headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="${nomFichier()}"`, "Cache-Control": "no-store" } });
});
app.get("/api/sauvegarde/etat", async (c) => {
  exigeAdmin(c);
  const [le, ms, dl] = [await reglage("sauvegarde_email"), await reglage("sauvegarde_derniere"), await reglage("sauvegarde_derniere_dl")];
  const [date, statut, ...reste] = ms.split("|");
  return c.json({ email: le, derniere: date ? { date, statut, message: reste.join("|") } : null, dernierTelechargement: dl ? { date: dl.split("|")[0], par: dl.split("|")[1] } : null });
});
app.post("/api/sauvegarde/reglage", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const e = clean(b.email, 120);
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new AppError(400, "Email invalide.");
  await poser("sauvegarde_email", e);
  return c.json({ message: e ? "Email de sauvegarde enregistré." : "Sauvegarde par email désactivée." });
});
app.post("/api/sauvegarde/envoyer", async (c) => {
  exigeAdmin(c);
  return c.json({ message: "Sauvegarde " + (await sauvegardeParEmail()) + "." });
});

// Sauvegarde automatique chaque nuit vers 3 h (heure de Paris), une seule fois par jour.
setInterval(async () => {
  try {
    const h = Number(new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", hour12: false, timeZone: "Europe/Paris" }).format(new Date()));
    if (h !== 3 || !(await reglage("sauvegarde_email"))) return;
    const der = (await reglage("sauvegarde_derniere")).split("|")[0];
    if (der && Date.now() - new Date(der).getTime() < 20 * 3600_000) return;
    await sauvegardeParEmail();
  } catch (e: any) {
    console.log(JSON.stringify({ event: "sauvegarde_erreur", message: String(e?.message ?? e).slice(0, 200) }));
    try { await poser("sauvegarde_derniere", `${new Date().toISOString()}|erreur|${String(e?.message ?? e).slice(0, 150)}`); } catch {}
  }
}, 10 * 60_000);

// ---------- Mise en production : vider les données de test (clients, prises en charge, ventes, devis, commandes, bons d'achat…) ----------
// Garde : utilisateurs, réglages, fournisseurs, prestations, produits maîtres, stock, banque et compta. Exige une sauvegarde téléchargée il y a moins de 30 minutes.
const A_VIDER = ["clients", "trottinettes", "reparations", "journal", "devis_lignes", "devis_simples", "devis_simples_lignes", "devis_envois", "ventes", "vente_lignes", "vente_paiements", "vente_avantages", "vente_acomptes", "remboursements", "bons_achat", "paiements_web", "depots_vente", "commande_lignes", "commandes", "taches", "messages_envoyes", "mouvements_cash", "caisse_sessions", "sav_dossiers", "sav_journal", "sav_pdfs", "reparation_pdfs", "retours", "trott_transferts", "chat_messages", "chat_lus", "ca_reel_mois"];
app.post("/api/admin/vider-tests", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  if (String(b.confirmation ?? "").trim().toUpperCase() !== "VIDER") throw new AppError(400, "Tape VIDER pour confirmer.");
  const dl = (await reglage("sauvegarde_derniere_dl")).split("|")[0];
  if (!dl || Date.now() - new Date(dl).getTime() > 30 * 60_000) throw new AppError(400, "Télécharge d'abord une sauvegarde (moins de 30 minutes avant), au cas où.");
  const existantes = new Set(((await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`) as any[]).map((r) => r.table_name as string));
  const liste = A_VIDER.filter((t) => existantes.has(t));
  const noms = liste.map((t) => `"${t}"`).join(", ");
  await sql.begin(async (tx: any) => {
    await tx.unsafe(`TRUNCATE ${noms} RESTART IDENTITY`);
    await tx.unsafe(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'facture_seq') THEN PERFORM setval('facture_seq', 1, false); END IF; END $$`);
  });
  console.log(JSON.stringify({ event: "vider-tests", par: (c.get("user") as any)?.prenom ?? "", tables: liste.length }));
  return c.json({ message: `Données de test supprimées (${liste.length} tables vidées). Les numéros de facture et de dossier repartent à 1.` });
});
