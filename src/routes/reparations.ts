import { app } from "../app";
import { AVIS_DELAI_HEURES, STATUTS } from "../config";
import { lireTicket } from "./ticket";
import { sql } from "../db";
import { envoyerPret } from "../automatisations";
import { remiseMulti } from "./prestations";
import { acomptesDe } from "./acomptes";
import { trouverMaitre } from "./maitres";
import { GARDE, infosGarde } from "../garde";
import { AppError, clean, exigeResponsable, magDe, signature } from "../util";

// Numéro bidon : 060000000, 0666666666, 0612345678... (client sans portable).
export function telBidon(tel: string | null | undefined): boolean {
  let d = String(tel ?? "").replace(/\D/g, "");
  if (d.startsWith("0033")) d = "0" + d.slice(4);
  else if (d.startsWith("33") && d.length === 11) d = "0" + d.slice(2);
  if (!d) return true;
  if (d.length !== 10 || !d.startsWith("0")) return true;
  const fin = d.slice(2);
  if (new Set(fin).size <= 2) return true;
  if ("0123456789".includes(fin.slice(0, 6)) || "9876543210".includes(fin.slice(0, 6))) return true;
  return false;
}

export async function devisDe(repId: number) {
  const lignes = (await sql`SELECT d.id, d.type, d.libelle, d.quantite, d.prix_unitaire_cents, d.shopify_variant_id, d.sku, d.barcode, d.marque, d.remise_client, d.series, (SELECT statut FROM commande_lignes cl WHERE cl.devis_ligne_id = d.id ORDER BY cl.id DESC LIMIT 1) AS cmd FROM devis_lignes d WHERE d.reparation_id = ${repId} ORDER BY d.type DESC, d.id`) as any[];
  const total = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire_cents, 0);
  const remiseMultiCents = await remiseMulti(lignes.map((l) => ({ type: l.type, quantite: l.quantite, libelle: l.libelle })), total);
  return { remiseMultiCents, netCents: total - remiseMultiCents, lignes: lignes.map((l) => ({ id: l.id, type: l.type, libelle: l.libelle, quantite: l.quantite, prixCents: l.prix_unitaire_cents, variantId: l.shopify_variant_id ?? "", sku: l.sku ?? "", barcode: l.barcode ?? "", series: l.series ?? "", commande: l.cmd ?? "", remiseClient: !!l.remise_client })), totalCents: total };
}

await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS boite TEXT`;
await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS affaires TEXT`;
const AFFAIRES = ["Casque", "Clés", "Chargeur", "Autre"];
const affairesClean = (v: any) => (Array.isArray(v) ? AFFAIRES.filter((a) => v.includes(a)) : []);
const BOITES = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"];

export function ligneListe(r: any, journal: any[]) {
  return {
    id: r.id,
    customerId: r.client_id,
    client: `${r.prenom} ${r.nom}`.trim(),
    phone: r.telephone ?? "",
    email: r.email ?? "",
    pieceArrivee: r.piece_arrivee === true,
    pieceAValider: r.piece_a_valider === true,
    trottinette: `${r.marque} ${r.modele} (N° ${r.serie})`,
    statut: r.statut,
    panne: r.panne,
    etat: r.etat,
    remarques: r.remarques,
    commentaireInterne: r.commentaire_interne,
    sousGarantie: r.sous_garantie === true,
    garantieRma: r.garantie_rma ?? "",
    garantieDemandeLe: r.garantie_demande_le ?? null,
    dateDepot: r.date_depot,
    avisStatut: r.avis_statut,
    avisEnvoiLe: r.avis_envoi_le,
    enMagasin: r.en_magasin !== false,
    source: r.source ?? "",
    rdvSouhaite: r.rdv_souhaite ?? "",
    rdvStatut: r.rdv_statut ?? "",
    magasin: r.magasin ?? "",
    boite: r.boite ?? "",
    affaires: r.affaires ? String(r.affaires).split(",").filter(Boolean) : [],
    garde: infosGarde(r.pret_le, r.statut, r.abandonnee_le),
    abandonnee: !!r.abandonnee_le,
    journal: journal.filter((j) => j.reparation_id === r.id).map((j) => ({ date: j.date, type: j.type, texte: j.texte })),
  };
}

// Liste des réparations : vue = rdv | afaire | commande | pretes | garantie | tout. Compteurs renvoyés avec.
app.get("/api/reparations", async (c) => {
  const vue = clean(c.req.query("vue"), 20) || "tout";
  const rows = (await sql`SELECT r.*, c.prenom, c.nom, c.telephone, c.email, t.marque, t.modele, t.serie FROM reparations r JOIN clients c ON c.id = r.client_id JOIN trottinettes t ON t.id = r.trottinette_id WHERE r.supprime_le IS NULL AND r.commande_client = false AND r.statut <> 'récupéré' AND (${magDe(c)}::text IS NULL OR r.magasin IS NULL OR r.magasin = ${magDe(c)}) ORDER BY r.maj_le DESC, r.id DESC LIMIT 300`) as any[];
  const compteurs = {
    rdv: rows.filter((r) => r.en_magasin === false).length,
    afaire: rows.filter((r) => r.en_magasin !== false && ["reçu", "diagnostic", "devis envoyé", "à faire", "en réparation"].includes(r.statut)).length,
    commande: rows.filter((r) => r.statut === "en attente de pièce").length,
    pretes: rows.filter((r) => r.statut === "prêt").length,
    garantie: rows.filter((r) => r.sous_garantie === true).length,
    tout: rows.length,
  };
  const filtre = (r: any) => {
    if (vue === "rdv") return r.en_magasin === false;
    if (vue === "afaire") return r.en_magasin !== false && ["reçu", "diagnostic", "devis envoyé", "à faire", "en réparation"].includes(r.statut);
    if (vue === "commande") return r.statut === "en attente de pièce";
    if (vue === "pretes") return r.statut === "prêt";
    if (vue === "garantie") return r.sous_garantie === true;
    return true;
  };
  const sel = rows.filter(filtre).slice(0, 300);
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
  const cmds = (await sql`SELECT l.id, l.libelle, l.statut, COALESCE(l.suivi, co.suivi) AS suivi, f.nom AS fournisseur, l.commandee_le, l.recue_le FROM commande_lignes l JOIN fournisseurs f ON f.id = l.fournisseur_id LEFT JOIN commandes co ON co.id = l.commande_id WHERE l.reparation_id = ${id} AND l.statut <> 'panier' ORDER BY l.id`) as any[];
  const [tc] = (await sql`SELECT code_acces FROM trottinettes WHERE id = ${r.trottinette_id}`) as any[];
  return c.json({ ...ligneListe(r, journal), commandes: cmds.map((l) => ({ id: l.id, libelle: l.libelle, statut: l.statut, suivi: l.suivi ?? "", fournisseur: l.fournisseur, jours: l.commandee_le ? Math.floor((Date.now() - new Date(l.commandee_le).getTime()) / 86400000) : 0 })), trottinetteId: r.trottinette_id, codeAcces: tc?.code_acces ?? "", devis: await devisDe(id), acompte: await acomptesDe(id), statuts: STATUTS, ticketEntete: (await lireTicket()).entete, gardeInfo: { franchiseJours: GARDE.franchiseJours, prixCents: GARDE.prixCents, abandonJour: GARDE.abandonJour } });
});

// Nouvelle prise en charge. enMagasin:false = rendez-vous, sousGarantie:true = garantie.
app.post("/api/reparations", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const panne = clean(b.panne, 1000);
  if (!panne) throw new AppError(400, "La panne décrite par le client est obligatoire.");
  const clientId = Number(b.customerId), trottId = Number(b.trottinetteId);
  const [cl] = await sql`SELECT telephone FROM clients WHERE id = ${clientId}`;
  if (!cl) throw new AppError(400, "Client inconnu.");
  if (telBidon(cl.telephone)) throw new AppError(400, "Numéro de téléphone du client invalide (« " + (cl.telephone || "vide") + " »). Corrige la fiche client avant de créer la prise en charge.");
  const [t] = await sql`SELECT id FROM trottinettes WHERE id = ${trottId} AND client_id = ${clientId}`;
  if (!t) throw new AppError(400, "Trottinette inconnue pour ce client.");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.dateDepot ?? "") ? b.dateDepot : new Date().toISOString().slice(0, 10);
  const enMagasin = b.enMagasin !== false;
  const garantie = b.sousGarantie === true;
  const [r] = await sql`INSERT INTO reparations (client_id, trottinette_id, panne, etat, remarques, date_depot, en_magasin, sous_garantie, magasin) VALUES (${clientId}, ${trottId}, ${panne}, ${clean(b.etat, 500)}, ${clean(b.remarques, 1000)}, ${date}, ${enMagasin}, ${garantie}, ${c.get("user")?.magasin ?? null}) RETURNING id`;
  if (clean(b.codeAcces, 60)) await sql`UPDATE trottinettes SET code_acces = ${clean(b.codeAcces, 60)} WHERE id = ${trottId}`;
  const affNouv = affairesClean(b.affaires);
  if (affNouv.length) {
    await sql`UPDATE reparations SET affaires = ${affNouv.join(",")} WHERE id = ${r.id}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${r.id}, 'note', ${"Affaires laissées par le client : " + affNouv.join(", ") + signature(c)})`;
  }
  const boiteNouv = clean(b.boite, 10).toUpperCase();
  if (boiteNouv) {
    const [pris] = (await sql`SELECT id FROM reparations WHERE boite = ${boiteNouv} AND supprime_le IS NULL AND statut <> 'récupéré' AND id <> ${r.id} AND (${magDe(c)}::text IS NULL OR magasin IS NULL OR magasin = ${magDe(c)})`) as any[];
    const [prisL] = (await sql`SELECT l.reparation_id FROM commande_lignes l JOIN reparations rr ON rr.id = l.reparation_id WHERE l.boite = ${boiteNouv} AND l.remise_le IS NULL AND l.reparation_id <> ${r.id} AND (${magDe(c)}::text IS NULL OR rr.magasin IS NULL OR rr.magasin = ${magDe(c)}) LIMIT 1`) as any[];
    if (!pris && !prisL) { await sql`UPDATE reparations SET boite = ${boiteNouv} WHERE id = ${r.id}`; await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${r.id}, 'note', ${"Matériel rangé dans la boîte " + boiteNouv + signature(c)})`; }
  }
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
  if (statut === "devis envoyé" && statut !== r.statut) throw new AppError(400, "Le statut « devis envoyé » se met tout seul quand tu envoies le devis au client (bouton d'envoi dans la fiche).");
  const note = clean(b.note, 500);
  const changed = !!statut && statut !== r.statut;
  let touche = false;
  if (changed) {
    await sql`UPDATE reparations SET statut = ${statut}, maj_le = now(), pret_le = ${statut === "prêt" ? sql`now()` : (statut === "récupéré" ? sql`pret_le` : null)} WHERE id = ${id}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'statut', ${`Statut : ${r.statut} → ${statut}${signature(c)}`})`;
    touche = true;
    if (statut === "prêt") void envoyerPret(id);
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
  if (Array.isArray(b.affaires)) {
    const nv = affairesClean(b.affaires).join(",");
    if (nv !== (r.affaires ?? "")) {
      await sql`UPDATE reparations SET affaires = ${nv || null}, maj_le = now() WHERE id = ${id}`;
      await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'note', ${(nv ? "Affaires laissées par le client : " + nv.replace(/,/g, ", ") : "Plus d'affaires laissées par le client") + signature(c)})`;
      touche = true;
    }
  }
  if (typeof b.boite === "string" && clean(b.boite, 10).toUpperCase() !== (r.boite ?? "")) {
    const nv = clean(b.boite, 10).toUpperCase();
    if (nv) {
      const [pris] = (await sql`SELECT id FROM reparations WHERE boite = ${nv} AND supprime_le IS NULL AND statut <> 'récupéré' AND id <> ${id} AND (${magDe(c)}::text IS NULL OR magasin IS NULL OR magasin = ${magDe(c)})`) as any[];
      const [prisL] = (await sql`SELECT l.reparation_id FROM commande_lignes l JOIN reparations rr ON rr.id = l.reparation_id WHERE l.boite = ${nv} AND l.remise_le IS NULL AND l.reparation_id <> ${id} AND (${magDe(c)}::text IS NULL OR rr.magasin IS NULL OR rr.magasin = ${magDe(c)}) LIMIT 1`) as any[];
      if (pris || prisL) throw new AppError(400, `La boîte ${nv} est déjà utilisée par PC-${String((pris?.id ?? prisL.reparation_id)).padStart(4, "0")}.`);
    }
    await sql`UPDATE reparations SET boite = ${nv || null}, maj_le = now() WHERE id = ${id}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'note', ${(nv ? "Matériel rangé dans la boîte " + nv : "Boîte de rangement retirée") + signature(c)})`;
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
  // Un produit associé à un produit maître (Paramètres > Produit maître) : le maître prend sa place sur le devis.
  // On garde la variante / le SKU / le code-barres du produit réellement choisi (pour commander la bonne pièce)
  // et son libellé d'origine. Le prix du maître s'applique s'il en a un, sinon celui du produit choisi.
  const maitre = type === "piece" ? await trouverMaitre({ variantId: b.variantId, barcode: b.barcode, sku: b.sku }) : undefined;
  const libelleFinal = maitre ? maitre.nom : libelle;
  const prixFinal = maitre && maitre.prix_cents != null ? maitre.prix_cents : prixCents;
  await sql`INSERT INTO devis_lignes (reparation_id, type, libelle, quantite, prix_unitaire_cents, shopify_variant_id, sku, barcode, marque, maitre_id, libelle_origine) VALUES (${repId}, ${type}, ${libelleFinal}, ${quantite}, ${prixFinal}, ${clean(b.variantId, 80) || null}, ${clean(b.sku, 80) || null}, ${clean(b.barcode, 80) || null}, ${clean(b.marque, 80) || null}, ${maitre ? maitre.id : null}, ${maitre ? libelle : null})`;
  await sql`UPDATE reparations SET maj_le = now() WHERE id = ${repId}`;
  return c.json({ devis: await devisDe(repId), maitre: maitre ? { nom: maitre.nom, origine: libelle } : null });
});

app.post("/api/devis/ligne/quantite", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const [l] = await sql`SELECT reparation_id FROM devis_lignes WHERE id = ${id}`;
  if (!l) throw new AppError(404, "Ligne introuvable.");
  const q = Math.round(Number(String(b.quantite ?? "").replace(",", ".")));
  if (!(q >= 1 && q <= 999)) throw new AppError(400, "Quantité invalide (1 à 999).");
  await sql`UPDATE devis_lignes SET quantite = ${q} WHERE id = ${id}`;
  await sql`UPDATE reparations SET maj_le = now() WHERE id = ${l.reparation_id}`;
  return c.json({ devis: await devisDe(l.reparation_id) });
});

app.post("/api/devis/ligne/prix", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const [l] = await sql`SELECT reparation_id FROM devis_lignes WHERE id = ${id}`;
  if (!l) throw new AppError(404, "Ligne introuvable.");
  const p = Math.round(Number(String(b.prix ?? "").replace(/[^0-9,.-]/g, "").replace(",", ".")) * 100);
  if (!(p >= 0 && p <= 10000000)) throw new AppError(400, "Prix invalide.");
  await sql`UPDATE devis_lignes SET prix_unitaire_cents = ${p} WHERE id = ${id}`;
  await sql`UPDATE reparations SET maj_le = now() WHERE id = ${l.reparation_id}`;
  return c.json({ devis: await devisDe(l.reparation_id) });
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

// Vue « Mes casiers » : chaque boîte avec sa prise en charge (matériel) et les pièces rangées dedans.
app.get("/api/casiers", async (c) => {
  const pcs = (await sql`SELECT r.id, r.boite, r.statut, r.panne, r.magasin, cl.prenom, cl.nom, cl.telephone FROM reparations r JOIN clients cl ON cl.id = r.client_id WHERE r.boite IS NOT NULL AND r.boite <> '' AND r.supprime_le IS NULL AND r.statut <> 'récupéré' AND (${magDe(c)}::text IS NULL OR r.magasin IS NULL OR r.magasin = ${magDe(c)})`) as any[];
  const pieces = (await sql`SELECT l.id, l.libelle, l.quantite, l.boite, l.recue_le, l.reparation_id, cl.prenom, cl.nom FROM commande_lignes l JOIN reparations r ON r.id = l.reparation_id JOIN clients cl ON cl.id = r.client_id WHERE l.boite IS NOT NULL AND l.boite <> '' AND l.remise_le IS NULL AND (${magDe(c)}::text IS NULL OR r.magasin IS NULL OR r.magasin = ${magDe(c)})`) as any[];
  const pn = (id: number) => "PC-" + String(id).padStart(4, "0");
  const noms = [...new Set([...BOITES, ...pcs.map((r) => r.boite), ...pieces.map((l) => l.boite)])];
  return c.json({ casiers: noms.map((nom) => {
    const r = pcs.find((x) => x.boite === nom);
    const ps = pieces.filter((l) => l.boite === nom);
    const autre = ps.find((l) => !r || l.reparation_id !== r.id);
    const pcId = r?.id ?? autre?.reparation_id ?? null;
    const cli = r ? `${r.prenom} ${r.nom}`.trim() : autre ? `${autre.prenom} ${autre.nom}`.trim() : "";
    return { nom, libre: !r && !ps.length, repairId: pcId, numero: pcId ? pn(pcId) : "", client: cli, telephone: r?.telephone ?? "", statut: r?.statut ?? "", panne: r?.panne ?? "", materiel: !!r, magasin: r?.magasin ?? "", pieces: ps.map((l) => ({ id: l.id, libelle: l.libelle, quantite: l.quantite, recueLe: l.recue_le, numero: pn(l.reparation_id) })) };
  }) });
});

// Boîtes de rangement du matériel (C1 à C8) : libre ou occupée par quelle prise en charge.
app.get("/api/boites", async (c) => {
  const rows = (await sql`SELECT r.id, r.boite, c.prenom, c.nom FROM reparations r JOIN clients c ON c.id = r.client_id WHERE r.boite IS NOT NULL AND r.boite <> '' AND r.supprime_le IS NULL AND r.statut <> 'récupéré' AND (${magDe(c)}::text IS NULL OR r.magasin IS NULL OR r.magasin = ${magDe(c)})`) as any[];
  const lp = (await sql`SELECT l.boite, l.reparation_id AS id, cl.prenom, cl.nom FROM commande_lignes l JOIN reparations r ON r.id = l.reparation_id JOIN clients cl ON cl.id = r.client_id WHERE l.boite IS NOT NULL AND l.boite <> '' AND l.remise_le IS NULL AND (${magDe(c)}::text IS NULL OR r.magasin IS NULL OR r.magasin = ${magDe(c)})`) as any[];
  for (const x of lp) if (!rows.find((r) => r.boite === x.boite)) rows.push(x);
  const noms = [...BOITES, ...rows.map((r) => r.boite).filter((b) => !BOITES.includes(b))];
  return c.json({ boites: noms.map((nom) => { const r = rows.find((x) => x.boite === nom); return { nom, repairId: r?.id ?? null, client: r ? `${r.prenom} ${r.nom}`.trim() : "" }; }) });
});

// Pièce rangée à la main dans un casier (sans commande fournisseur) : toujours rattachée à une prise en charge, donc à un client.
app.post("/api/casiers/piece", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const repId = Number(b.repairId);
  const boite = clean(b.boite, 10);
  const libelle = clean(b.libelle, 160);
  const qte = Math.max(1, Math.min(99, Math.round(Number(b.quantite) || 1)));
  if (!libelle) throw new AppError(400, "Indique le nom de la pièce.");
  if (!boite) throw new AppError(400, "Casier manquant.");
  const [r] = (await sql`SELECT id FROM reparations WHERE id = ${repId} AND supprime_le IS NULL AND statut <> 'récupéré'`) as any[];
  if (!r) throw new AppError(404, "Prise en charge introuvable (ou déjà récupérée) : une pièce doit être rattachée à un client.");
  let [f] = (await sql`SELECT id FROM fournisseurs WHERE nom = 'Ajout manuel (sans commande)' LIMIT 1`) as any[];
  if (!f) [f] = (await sql`INSERT INTO fournisseurs (nom, actif) VALUES ('Ajout manuel (sans commande)', false) RETURNING id`) as any[];
  await sql`INSERT INTO commande_lignes (fournisseur_id, libelle, quantite, reparation_id, statut, commandee_le, recue_le, boite) VALUES (${f.id}, ${libelle}, ${qte}, ${repId}, 'recue', now(), now(), ${boite})`;
  return c.json({ message: `Pièce rangée dans ${boite} pour PC-${String(repId).padStart(4, "0")}.` });
});
