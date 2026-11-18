import { app } from "../app";
import { AVIS_DELAI_HEURES, STATUTS } from "../config";
import { sql } from "../db";
import { AppError, clean, exigeResponsable, signature } from "../util";

export async function devisDe(repId: number) {
  const lignes = (await sql`SELECT d.id, d.type, d.libelle, d.quantite, d.prix_unitaire_cents, d.shopify_variant_id, d.sku, (SELECT statut FROM commande_lignes cl WHERE cl.devis_ligne_id = d.id ORDER BY cl.id DESC LIMIT 1) AS cmd FROM devis_lignes d WHERE d.reparation_id = ${repId} ORDER BY d.type DESC, d.id`) as any[];
  const total = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire_cents, 0);
  return { lignes: lignes.map((l) => ({ id: l.id, type: l.type, libelle: l.libelle, quantite: l.quantite, prixCents: l.prix_unitaire_cents, variantId: l.shopify_variant_id ?? "", sku: l.sku ?? "", commande: l.cmd ?? "" })), totalCents: total };
}

export function ligneListe(r: any, journal: any[]) {
  return {
    id: r.id,
    customerId: r.client_id,
    client: `${r.prenom} ${r.nom}`.trim(),
    phone: r.telephone ?? "",
    email: r.email ?? "",
    pieceArrivee: r.piece_arrivee === true,
    trottinette: `${r.marque} ${r.modele} (N° ${r.serie})`,
    statut: r.statut,
    panne: r.panne,
    etat: r.etat,
    remarques: r.remarques,
    commentaireInterne: r.commentaire_interne,
    sousGarantie: r.sous_garantie === true,
    dateDepot: r.date_depot,
    avisStatut: r.avis_statut,
    avisEnvoiLe: r.avis_envoi_le,
    enMagasin: r.en_magasin !== false,
    journal: journal.filter((j) => j.reparation_id === r.id).map((j) => ({ date: j.date, type: j.type, texte: j.texte })),
  };
}

// Liste des réparations : vue = rdv | afaire | commande | pretes | garantie | tout. Compteurs renvoyés avec.
app.get("/api/reparations", async (c) => {
  const vue = clean(c.req.query("vue"), 20) || "tout";
  const rows = (await sql`SELECT r.*, c.prenom, c.nom, c.telephone, c.email, t.marque, t.modele, t.serie FROM reparations r JOIN clients c ON c.id = r.client_id JOIN trottinettes t ON t.id = r.trottinette_id WHERE r.supprime_le IS NULL AND r.statut <> 'récupéré' ORDER BY r.maj_le DESC, r.id DESC LIMIT 300`) as any[];
  const compteurs = {
    rdv: rows.filter((r) => r.en_magasin === false).length,
    afaire: rows.filter((r) => r.en_magasin !== false && ["reçu", "diagnostic", "devis envoyé", "en réparation"].includes(r.statut)).length,
    commande: rows.filter((r) => r.statut === "en attente de pièce").length,
    pretes: rows.filter((r) => r.statut === "prêt").length,
    garantie: rows.filter((r) => r.sous_garantie === true).length,
    tout: rows.length,
  };
  const filtre = (r: any) => {
    if (vue === "rdv") return r.en_magasin === false;
    if (vue === "afaire") return r.en_magasin !== false && ["reçu", "diagnostic", "devis envoyé", "en réparation"].includes(r.statut);
    if (vue === "commande") return r.statut === "en attente de pièce";
    if (vue === "pretes") return r.statut === "prêt";
    if (vue === "garantie") return r.sous_garantie === true;
    return true;
  };
  const sel = rows.filter(filtre).slice(0, 100);
  const ids = sel.map((r) => r.id);
  const journal = ids.length ? ((await sql`SELECT reparation_id, date, type, texte FROM journal WHERE reparation_id = ANY(${ids}) ORDER BY id`) as any[]) : [];
  return c.json({ compteurs, reparations: sel.map((r) => ligneListe(r, journal)) });
});

// Fiche détaillée d'une réparation (ouverte au clic sur le ticket).
app.get("/api/reparation", async (c) => {
  const id = Number(c.req.query("id"));
  const [r] = (await sql`SELECT r.*, c.prenom, c.nom, c.telephone, c.email, t.marque, t.modele, t.serie FROM reparations r JOIN clients c ON c.id = r.client_id JOIN trottinettes t ON t.id = r.trottinette_id WHERE r.id = ${id} AND r.supprime_le IS NULL`) as any[];
  if (!r) throw new AppError(404, "Réparation introuvable.");
  const journal = (await sql`SELECT reparation_id, date, type, texte FROM journal WHERE reparation_id = ${id} ORDER BY id`) as any[];
  return c.json({ ...ligneListe(r, journal), devis: await devisDe(id), statuts: STATUTS });
});

// Nouvelle prise en charge. enMagasin:false = rendez-vous, sousGarantie:true = garantie.
app.post("/api/reparations", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const panne = clean(b.panne, 1000);
  if (!panne) throw new AppError(400, "La panne décrite par le client est obligatoire.");
  const clientId = Number(b.customerId), trottId = Number(b.trottinetteId);
  const [t] = await sql`SELECT id FROM trottinettes WHERE id = ${trottId} AND client_id = ${clientId}`;
  if (!t) throw new AppError(400, "Trottinette inconnue pour ce client.");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.dateDepot ?? "") ? b.dateDepot : new Date().toISOString().slice(0, 10);
  const enMagasin = b.enMagasin !== false;
  const garantie = b.sousGarantie === true;
  const [r] = await sql`INSERT INTO reparations (client_id, trottinette_id, panne, etat, remarques, date_depot, en_magasin, sous_garantie) VALUES (${clientId}, ${trottId}, ${panne}, ${clean(b.etat, 500)}, ${clean(b.remarques, 1000)}, ${date}, ${enMagasin}, ${garantie}) RETURNING id`;
  const texte = enMagasin ? "Reçu à l'atelier" : "Prise en charge créée, trottinette pas encore en magasin";
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${r.id}, 'statut', ${texte + (garantie ? " (sous garantie)" : "") + signature(c)})`;
  return c.json({ id: r.id, message: "Fiche de réparation créée." });
});

app.post("/api/reparations/arrivee", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.repairId);
  const [r] = await sql`SELECT id, en_magasin FROM reparations WHERE id = ${id}`;
  if (!r) throw new AppError(404, "Réparation introuvable.");
  if (r.en_magasin !== false) throw new AppError(400, "Cette trottinette est déjà en magasin.");
  await sql`UPDATE reparations SET en_magasin = true, date_depot = CURRENT_DATE, statut = 'reçu', maj_le = now() WHERE id = ${id}`;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'statut', ${"Trottinette arrivée en magasin" + signature(c)})`;
  return c.json({ message: "Trottinette arrivée en magasin." });
});

// Mise à jour : statut, note, commentaire interne, garantie, panne. Tout est optionnel.
app.post("/api/reparations/maj", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.repairId);
  const [r] = await sql`SELECT * FROM reparations WHERE id = ${id} AND supprime_le IS NULL`;
  if (!r) throw new AppError(404, "Réparation introuvable.");
  const statut = b.statut ? String(b.statut) : "";
  if (statut && !STATUTS.includes(statut)) throw new AppError(400, "Statut inconnu.");
  const note = clean(b.note, 500);
  const changed = !!statut && statut !== r.statut;
  let touche = false;
  if (changed) {
    await sql`UPDATE reparations SET statut = ${statut}, maj_le = now() WHERE id = ${id}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'statut', ${`Statut : ${r.statut} → ${statut}${signature(c)}`})`;
    touche = true;
  }
  if (typeof b.commentaireInterne === "string" && b.commentaireInterne.trim() !== r.commentaire_interne) {
    await sql`UPDATE reparations SET commentaire_interne = ${clean(b.commentaireInterne, 2000)}, maj_le = now() WHERE id = ${id}`;
    touche = true;
  }
  if (typeof b.panne === "string" && clean(b.panne, 1000) && clean(b.panne, 1000) !== r.panne) {
    await sql`UPDATE reparations SET panne = ${clean(b.panne, 1000)}, maj_le = now() WHERE id = ${id}`;
    touche = true;
  }
  if (typeof b.sousGarantie === "boolean" && b.sousGarantie !== (r.sous_garantie === true)) {
    await sql`UPDATE reparations SET sous_garantie = ${b.sousGarantie}, maj_le = now() WHERE id = ${id}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'statut', ${(b.sousGarantie ? "Marquée sous garantie" : "Garantie retirée") + signature(c)})`;
    touche = true;
  }
  if (note) {
    await sql`UPDATE reparations SET maj_le = now() WHERE id = ${id}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'note', ${note + signature(c)})`;
    touche = true;
  }
  if (!touche) throw new AppError(400, "Rien à enregistrer.");
  return c.json({ message: "Réparation mise à jour." });
});

// Lignes de devis : ajouter / modifier / supprimer.
app.post("/api/devis/ligne", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const repId = Number(b.repairId);
  const [r] = await sql`SELECT id FROM reparations WHERE id = ${repId} AND supprime_le IS NULL`;
  if (!r) throw new AppError(404, "Réparation introuvable.");
  const type = b.type === "piece" ? "piece" : "main_oeuvre";
  const libelle = clean(b.libelle, 200);
  if (!libelle) throw new AppError(400, "Le libellé est obligatoire.");
  const quantite = Math.max(1, Math.min(999, Math.round(Number(b.quantite) || 1)));
  const prixCents = Math.max(0, Math.round((Number(String(b.prix ?? "0").replace(",", ".")) || 0) * 100));
  await sql`INSERT INTO devis_lignes (reparation_id, type, libelle, quantite, prix_unitaire_cents, shopify_variant_id, sku) VALUES (${repId}, ${type}, ${libelle}, ${quantite}, ${prixCents}, ${clean(b.variantId, 80) || null}, ${clean(b.sku, 80) || null})`;
  await sql`UPDATE reparations SET maj_le = now() WHERE id = ${repId}`;
  return c.json({ devis: await devisDe(repId) });
});

app.post("/api/devis/ligne/supprimer", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const [l] = await sql`SELECT reparation_id FROM devis_lignes WHERE id = ${id}`;
  if (!l) throw new AppError(404, "Ligne introuvable.");
  await sql`DELETE FROM devis_lignes WHERE id = ${id}`;
  await sql`UPDATE reparations SET maj_le = now() WHERE id = ${l.reparation_id}`;
  return c.json({ devis: await devisDe(l.reparation_id) });
});

// Suppression douce : la fiche disparaît des listes mais reste en base (récupérable).
app.post("/api/reparations/supprimer", async (c) => {
  exigeResponsable(c);
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.repairId);
  const [r] = await sql`SELECT id FROM reparations WHERE id = ${id} AND supprime_le IS NULL`;
  if (!r) throw new AppError(404, "Réparation introuvable.");
  await sql`UPDATE reparations SET supprime_le = now(), debut = NULL, technicien = NULL, duree_min = NULL WHERE id = ${id}`;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'statut', ${"Fiche supprimée" + signature(c)})`;
  return c.json({ message: "Fiche supprimée." });
});

app.post("/api/reparations/avis", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.repairId);
  const choix = String(b.choix ?? "");
  if (!["programme", "refuse"].includes(choix)) throw new AppError(400, "Choix inconnu.");
  const [r] = await sql`SELECT * FROM reparations WHERE id = ${id}`;
  if (!r) throw new AppError(404, "Réparation introuvable.");
  if (r.statut !== "récupéré") throw new AppError(400, "La demande d'avis se choisit une fois la réparation récupérée.");
  if (choix === "programme") {
    await sql`UPDATE reparations SET avis_statut = 'programme', avis_envoi_le = now() + ${AVIS_DELAI_HEURES} * interval '1 hour', maj_le = now() WHERE id = ${id}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'avis', ${`Demande d'avis Google programmée dans ${AVIS_DELAI_HEURES} h (envoi pas encore branché)`})`;
    return c.json({ message: `Demande d'avis programmée dans ${AVIS_DELAI_HEURES} h.` });
  }
  await sql`UPDATE reparations SET avis_statut = 'refuse', avis_envoi_le = NULL, maj_le = now() WHERE id = ${id}`;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'avis', 'Pas de demande d''avis Google')`;
  return c.json({ message: "Pas de demande d'avis pour cette réparation." });
});
