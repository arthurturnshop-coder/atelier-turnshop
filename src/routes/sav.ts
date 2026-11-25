import { app } from "../app";
import { sql } from "../db";
import "./auth";
import { delaiRelance } from "./garantie";
import { AppError, clean, exigeResponsable, signature } from "../util";
import { detailVente } from "./caisse";

// SAV depuis une vente : remboursement, échange (bon d'achat), garantie d'une pièce (suivi + relances hebdomadaires jusqu'à contrôle).
await sql`CREATE TABLE IF NOT EXISTS sav_dossiers (
  id SERIAL PRIMARY KEY, vente_id INT NOT NULL, client_id INT, magasin TEXT,
  type TEXT NOT NULL CHECK (type IN ('garantie','echange','remboursement')),
  libelle TEXT NOT NULL, quantite INT NOT NULL DEFAULT 1, montant_cents INT NOT NULL DEFAULT 0, motif TEXT NOT NULL DEFAULT '',
  fournisseur TEXT NOT NULL DEFAULT '', rma TEXT NOT NULL DEFAULT '',
  statut TEXT NOT NULL DEFAULT 'a_traiter', demande_le TIMESTAMPTZ, relance_le DATE, issue TEXT NOT NULL DEFAULT '',
  cree_par TEXT, cree_le TIMESTAMPTZ NOT NULL DEFAULT now(), close_le TIMESTAMPTZ, close_par TEXT)`;
await sql`ALTER TABLE remboursements ADD COLUMN IF NOT EXISTS vente_id INT, ADD COLUMN IF NOT EXISTS magasin TEXT`;

await sql`CREATE TABLE IF NOT EXISTS sav_journal (id SERIAL PRIMARY KEY, dossier_id INT NOT NULL, texte TEXT NOT NULL, par TEXT NOT NULL DEFAULT '', cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS sav_pdfs (id SERIAL PRIMARY KEY, dossier_id INT NOT NULL, nom TEXT NOT NULL, taille INT NOT NULL, data BYTEA NOT NULL, type TEXT NOT NULL DEFAULT 'autre', par TEXT NOT NULL DEFAULT '', cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
const jn = async (dossierId: number, texte: string, c: any) => { const u = c.get("user") as any; await sql`INSERT INTO sav_journal (dossier_id, texte, par) VALUES (${dossierId}, ${texte}, ${u?.prenom ?? ""})`; };

const euros = (x: any) => Math.round((Number(String(x ?? "").replace(",", ".")) || 0) * 100);
const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " €";

async function venteEtLigne(venteId: number, ligne?: number) {
  const [v] = (await sql`SELECT v.*, trim(cl.prenom || ' ' || cl.nom) AS client_nom FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id WHERE v.id = ${venteId}`) as any[];
  if (!v) throw new AppError(404, "Vente introuvable.");
  let l: any = null;
  if (ligne !== undefined) {
    const ls = (await sql`SELECT libelle, quantite, prix_unitaire_cents FROM vente_lignes WHERE vente_id = ${v.id} ORDER BY id`) as any[];
    l = ls[ligne];
    if (!l) throw new AppError(400, "Choisis l'article concerné.");
  }
  return { v, l };
}
// Déjà rendu sur une vente : remboursements + échanges (bons d'achat). Empêche de rendre plusieurs fois la même chose.
async function dejaRendu(venteId: number) {
  const [r] = (await sql`SELECT COALESCE(sum(montant_cents), 0)::int AS n FROM remboursements WHERE vente_id = ${venteId}`) as any[];
  const [e] = (await sql`SELECT COALESCE(sum(montant_cents), 0)::int AS n FROM sav_dossiers WHERE vente_id = ${venteId} AND type = 'echange' AND statut <> 'annule'`) as any[];
  return { remb: r.n, ech: e.n, total: r.n + e.n };
}
const nomFacture = (v: any) => v.numero_facture ?? `Ticket n° ${v.id}`;

app.post("/api/sav/rembourser", async (c) => {
  exigeResponsable(c);
  const b = await c.req.json().catch(() => ({}));
  const { v } = await venteEtLigne(Number(b.venteId));
  const montant = euros(b.montant);
  const moyen = String(b.moyen ?? "");
  if (!["carte", "especes", "virement", "bon"].includes(moyen)) throw new AppError(400, "Choisis comment rembourser.");
  if (montant <= 0) throw new AppError(400, "Indique le montant à rembourser.");
  const dj = await dejaRendu(v.id);
  if (montant + dj.total > v.total_cents) throw new AppError(400, `Maximum encore remboursable : ${eur(Math.max(0, v.total_cents - dj.total))} (déjà rendu sur cette vente : ${eur(dj.total)}).`);
  if (moyen === "bon" && !v.client_id) throw new AppError(400, "Un bon d'achat demande un client sur la vente.");
  const u = c.get("user") as any;
  const motif = clean(b.motif, 200);
  await sql`INSERT INTO remboursements (reparation_id, client_id, montant_cents, moyen, motif, par, vente_id, magasin) VALUES (${v.reparation_id ?? null}, ${v.client_id ?? null}, ${montant}, ${moyen}, ${`Vente ${nomFacture(v)}${motif ? " · " + motif : ""}`}, ${u?.prenom ?? ""}, ${v.id}, ${v.magasin ?? null})`;
  if (moyen === "bon") await sql`INSERT INTO bons_achat (client_id, montant_cents, motif) VALUES (${v.client_id}, ${montant}, ${"Remboursement " + nomFacture(v)})`;
  await sql`INSERT INTO sav_dossiers (vente_id, client_id, magasin, type, libelle, montant_cents, motif, statut, issue, cree_par, close_le, close_par) VALUES (${v.id}, ${v.client_id ?? null}, ${v.magasin ?? null}, 'remboursement', ${"Remboursement " + nomFacture(v)}, ${montant}, ${motif}, 'termine', ${moyen}, ${u?.prenom ?? ""}, now(), ${u?.prenom ?? ""})`;
  return c.json({ message: `${eur(montant)} remboursés (${moyen === "bon" ? "bon d'achat sur la cagnotte" : moyen}).${v.shopify_order_id ? " Pense à rembourser aussi la commande dans Shopify." : ""}` });
});

app.post("/api/sav/echange", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const { v, l } = await venteEtLigne(Number(b.venteId), Number(b.ligne));
  if (!v.client_id) throw new AppError(400, "Un échange demande un client sur la vente (le bon d'achat est mis sur son compte).");
  const qte = Math.max(1, Math.min(l.quantite, Math.round(Number(b.quantite) || l.quantite)));
  const montant = qte * l.prix_unitaire_cents;
  const dj = await dejaRendu(v.id);
  if (montant + dj.total > v.total_cents) throw new AppError(400, `Déjà rendu sur cette vente : ${eur(dj.total)} (sur ${eur(v.total_cents)}). Rien de plus à échanger.`);
  const [deja] = (await sql`SELECT COALESCE(sum(quantite), 0)::int AS n FROM sav_dossiers WHERE vente_id = ${v.id} AND type = 'echange' AND libelle = ${l.libelle} AND statut <> 'annule'`) as any[];
  if (deja.n + qte > l.quantite) throw new AppError(400, `Cet article a déjà été échangé (${deja.n} sur ${l.quantite}).`);
  const u = c.get("user") as any;
  await sql`INSERT INTO bons_achat (client_id, montant_cents, motif) VALUES (${v.client_id}, ${montant}, ${`Échange ${l.libelle} (${nomFacture(v)})`})`;
  await sql`INSERT INTO sav_dossiers (vente_id, client_id, magasin, type, libelle, quantite, montant_cents, motif, statut, cree_par, close_le, close_par) VALUES (${v.id}, ${v.client_id}, ${v.magasin ?? null}, 'echange', ${l.libelle}, ${qte}, ${montant}, ${clean(b.motif, 200)}, 'termine', ${u?.prenom ?? ""}, now(), ${u?.prenom ?? ""})`;
  return c.json({ message: `Bon d'achat de ${eur(montant)} créé sur la cagnotte de ${v.client_nom}. Il choisit son nouvel article et utilise la cagnotte à l'encaissement.` });
});

app.post("/api/sav/garantie", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const { v, l } = await venteEtLigne(Number(b.venteId), Number(b.ligne));
  const [gd] = (await sql`SELECT count(*)::int AS n FROM sav_dossiers WHERE vente_id = ${v.id} AND type = 'garantie' AND libelle = ${l.libelle} AND statut IN ('a_traiter', 'demande_faite')`) as any[];
  if (gd.n) throw new AppError(400, "Un dossier garantie est déjà ouvert pour cet article.");
  const u = c.get("user") as any;
  const jours = 3;
  const [nd] = (await sql`INSERT INTO sav_dossiers (vente_id, client_id, magasin, type, libelle, quantite, montant_cents, motif, fournisseur, statut, relance_le, cree_par) VALUES (${v.id}, ${v.client_id ?? null}, ${v.magasin ?? null}, 'garantie', ${l.libelle}, 1, ${l.prix_unitaire_cents}, ${clean(b.motif, 300)}, ${clean(b.fournisseur, 80)}, 'a_traiter', ${(await sql`SELECT ((now() AT TIME ZONE 'Europe/Paris')::date + ${jours}::int)::text AS d`)[0].d}, ${u?.prenom ?? ""}) RETURNING id`) as any[];
  await jn(nd.id, `Dossier ouvert : ${l.libelle}${clean(b.motif, 200) ? " · " + clean(b.motif, 200) : ""}`, c);

  return c.json({ message: "Dossier garantie créé.", id: nd.id });
});

app.get("/api/sav/dossiers", async (c) => {
  const rows = (await sql`SELECT d.*, to_char(d.relance_le, 'YYYY-MM-DD') AS relance, v.numero_facture, trim(cl.prenom || ' ' || cl.nom) AS client_nom
    FROM sav_dossiers d JOIN ventes v ON v.id = d.vente_id LEFT JOIN clients cl ON cl.id = d.client_id
    WHERE d.type = 'garantie' AND d.statut IN ('a_traiter', 'demande_faite') ORDER BY d.id DESC LIMIT 100`) as any[];
  const [{ auj }] = (await sql`SELECT (now() AT TIME ZONE 'Europe/Paris')::date::text AS auj`) as any[];
  return c.json({ dossiers: rows.map((d) => ({
    id: d.id, libelle: d.libelle, client: d.client_nom || "", numero: d.numero_facture ?? `Ticket n° ${d.vente_id}`, statut: d.statut, motif: d.motif, fournisseur: d.fournisseur, rma: d.rma,
    venteId: d.vente_id, clientId: d.client_id, demandeLe: d.demande_le, relanceLe: d.relance, enRetard: !!d.relance && d.relance <= auj, creeLe: d.cree_le,
  })) });
});

app.post("/api/sav/maj", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const [d] = (await sql`SELECT * FROM sav_dossiers WHERE id = ${id}`) as any[];
  if (!d) throw new AppError(404, "Dossier introuvable.");
  const u = c.get("user") as any;
  const jours = await delaiRelance();
  const a = String(b.action ?? "");
  const prochaine = sql`((now() AT TIME ZONE 'Europe/Paris')::date + ${jours}::int)`;
  if (a === "demande") {
    await sql`UPDATE sav_dossiers SET statut = 'demande_faite', demande_le = now(), fournisseur = ${clean(b.fournisseur, 80) || d.fournisseur}, rma = ${clean(b.rma, 60)}, relance_le = ${prochaine} WHERE id = ${id}`;
  } else if (a === "relance") {
    await sql`UPDATE sav_dossiers SET relance_le = ${prochaine} WHERE id = ${id}`;
  } else if (["piece_recue", "rembourse_fournisseur", "refus", "annule"].includes(a)) {
    await sql`UPDATE sav_dossiers SET statut = ${a === "annule" ? "annule" : "termine"}, issue = ${a}, close_le = now(), close_par = ${u?.prenom ?? ""}, relance_le = NULL WHERE id = ${id}`;
    await sql`UPDATE taches SET fait = true, fait_le = now() WHERE fait = false AND cree_par = 'Garantie' AND texte LIKE ${"Garantie #" + id + " %"}`;
  } else throw new AppError(400, "Action inconnue.");
  const LIB: Record<string, string> = { demande: "Demande faite au fournisseur" + (clean(b.fournisseur, 80) ? " (" + clean(b.fournisseur, 80) + ")" : ""), relance: "Fournisseur relancé", piece_recue: "Pièce reçue", rembourse_fournisseur: "Remboursé par le fournisseur", refus: "Refusé par le fournisseur", annule: "Dossier annulé" };
  await jn(id, LIB[a], c);
  return c.json({ message: "OK" });
});

// Relances : tâche dans la to-do quand la date de relance est atteinte (puis prochaine échéance dans le délai réglé, 7 jours par défaut).
async function relancer() {
  try {
    const jours = await delaiRelance();
    const dus = (await sql`SELECT d.id, d.libelle, d.statut, trim(cl.prenom || ' ' || cl.nom) AS client_nom FROM sav_dossiers d LEFT JOIN clients cl ON cl.id = d.client_id
      WHERE d.type = 'garantie' AND d.statut IN ('a_traiter', 'demande_faite') AND d.relance_le IS NOT NULL AND d.relance_le <= (now() AT TIME ZONE 'Europe/Paris')::date`) as any[];
    for (const d of dus) {
      const texte = `Garantie #${d.id} : ${d.statut === "a_traiter" ? "faire la demande au fournisseur" : "relancer le fournisseur"} (${d.libelle}${d.client_nom ? ", " + d.client_nom : ""})`;
      const [ex] = (await sql`SELECT id FROM taches WHERE fait = false AND texte = ${texte} LIMIT 1`) as any[];
      if (!ex) await sql`INSERT INTO taches (texte, echeance, priorite, cree_par) VALUES (${texte}, (now() AT TIME ZONE 'Europe/Paris')::date, true, 'Garantie')`;
      await sql`UPDATE sav_dossiers SET relance_le = ((now() AT TIME ZONE 'Europe/Paris')::date + ${jours}::int) WHERE id = ${d.id}`;
    }
  } catch (e: any) { console.log(JSON.stringify({ event: "sav-relance", message: String(e?.message ?? e).slice(0, 200) })); }
}
setInterval(relancer, 30 * 60 * 1000);
setTimeout(relancer, 90 * 1000);

// Fiche d'un dossier garantie pièce : ticket, infos, factures d'achat (PDF), journal.
app.get("/api/sav/dossier/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [d] = (await sql`SELECT d.*, to_char(d.relance_le, 'YYYY-MM-DD') AS relance FROM sav_dossiers d WHERE d.id = ${id}`) as any[];
  if (!d) throw new AppError(404, "Dossier introuvable.");
  const [v] = (await sql`SELECT v.*, trim(cl.prenom || ' ' || cl.nom) AS client_nom FROM ventes v LEFT JOIN clients cl ON cl.id = v.client_id WHERE v.id = ${d.vente_id}`) as any[];
  const [cl] = d.client_id ? ((await sql`SELECT id, prenom, nom, telephone, email FROM clients WHERE id = ${d.client_id}`) as any[]) : [null];
  const pdfs = (await sql`SELECT id, nom, taille, type, par, cree_le FROM sav_pdfs WHERE dossier_id = ${id} ORDER BY id`) as any[];
  const journal = (await sql`SELECT texte, par, cree_le FROM sav_journal WHERE dossier_id = ${id} ORDER BY id`) as any[];
  return c.json({
    dossier: { id: d.id, type: d.type, libelle: d.libelle, quantite: d.quantite, montantCents: d.montant_cents, motif: d.motif, fournisseur: d.fournisseur, rma: d.rma, statut: d.statut, issue: d.issue, demandeLe: d.demande_le, relanceLe: d.relance, creeLe: d.cree_le, creePar: d.cree_par, venteId: d.vente_id },
    client: cl ? { id: cl.id, name: `${cl.prenom} ${cl.nom}`.trim(), phone: cl.telephone, email: cl.email } : null,
    vente: v ? await detailVente(v) : null,
    pdfs: pdfs.map((p) => ({ id: p.id, nom: p.nom, taille: p.taille, type: p.type, par: p.par, le: p.cree_le })),
    journal: journal.map((j) => ({ texte: j.texte, par: j.par, le: j.cree_le })),
  });
});

app.post("/api/sav/dossier/infos", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const [d] = (await sql`SELECT id FROM sav_dossiers WHERE id = ${id}`) as any[];
  if (!d) throw new AppError(404, "Dossier introuvable.");
  await sql`UPDATE sav_dossiers SET fournisseur = ${clean(b.fournisseur, 80)}, rma = ${clean(b.rma, 60)}, motif = ${clean(b.motif, 300)} WHERE id = ${id}`;
  await jn(id, `Infos mises à jour (fournisseur : ${clean(b.fournisseur, 80) || "-"}, RMA : ${clean(b.rma, 60) || "-"})`, c);
  return c.json({ message: "Enregistré." });
});

app.post("/api/sav/dossier/note", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const t = clean(b.texte, 500);
  if (!t) throw new AppError(400, "Écris une note.");
  await jn(id, t, c);
  return c.json({ message: "Note ajoutée." });
});

app.post("/api/sav/pdf", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.dossierId);
  const [d] = (await sql`SELECT id FROM sav_dossiers WHERE id = ${id}`) as any[];
  if (!d) throw new AppError(404, "Dossier introuvable.");
  const buf = Buffer.from(String(b.data ?? ""), "base64");
  if (buf.length < 20 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new AppError(400, "Ce fichier n'est pas un PDF.");
  if (buf.length > 8 * 1024 * 1024) throw new AppError(400, "PDF trop lourd (8 Mo maximum).");
  const [n] = (await sql`SELECT count(*)::int AS n FROM sav_pdfs WHERE dossier_id = ${id}`) as any[];
  if (n.n >= 10) throw new AppError(400, "10 PDF maximum par dossier.");
  const type = ["facture_client", "facture_fournisseur"].includes(String(b.type)) ? String(b.type) : "autre";
  const nom = clean(String(b.nom ?? "facture.pdf"), 120) || "facture.pdf";
  const u = c.get("user") as any;
  await sql`INSERT INTO sav_pdfs (dossier_id, nom, taille, data, type, par) VALUES (${id}, ${nom}, ${buf.length}, ${buf}, ${type}, ${u?.prenom ?? ""})`;
  await jn(id, `${type === "facture_client" ? "Facture d'achat client" : type === "facture_fournisseur" ? "Facture d'achat fournisseur" : "PDF"} ajouté(e) : ${nom}`, c);
  return c.json({ message: "PDF ajouté." });
});

app.get("/api/sav/pdf/:id/fichier", async (c) => {
  const [p] = (await sql`SELECT nom, data FROM sav_pdfs WHERE id = ${Number(c.req.param("id"))}`) as any[];
  if (!p) throw new AppError(404, "PDF introuvable.");
  return new Response(p.data, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${encodeURIComponent(p.nom)}"` } });
});

app.post("/api/sav/pdf/supprimer", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  await sql`DELETE FROM sav_pdfs WHERE id = ${Number(b.id)}`;
  return c.json({ message: "PDF supprimé." });
});
