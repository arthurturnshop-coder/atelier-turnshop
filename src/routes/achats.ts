import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { envoyerPieceArrivee } from "../automatisations";
import { entreeStock } from "./stock";
import { alertesSoeurs, resoudre } from "./maitres";
import { AppError, clean, signature } from "../util";

const nettoyerQte = (n: any) => Math.max(1, Math.min(999, Math.round(Number(n) || 1)));
const magasinDe = (c: any) => (c.get("user")?.magasin === "Rouen" ? "Rouen" : "Amiens");

// Tout l'espace Commandes : par fournisseur, le panier, ce qui est commandé et ce qui est reçu récemment.
app.get("/api/achats", async (c) => {
  const fournisseurs = (await sql`SELECT id, nom, email FROM fournisseurs WHERE actif = true ORDER BY nom`) as any[];
  const lignes = (await sql`SELECT l.*, trim(cl.prenom || ' ' || cl.nom) AS client FROM commande_lignes l LEFT JOIN reparations r ON r.id = l.reparation_id LEFT JOIN clients cl ON cl.id = r.client_id
    WHERE l.statut <> 'recue' OR l.recue_le > now() - interval '7 days' ORDER BY l.id`) as any[];
  const vers = (l: any) => ({ commandeId: l.commande_id ?? null, id: l.id, libelle: l.libelle, sku: l.sku ?? "", barcode: l.barcode ?? "", variantId: l.variant_id ?? "", quantite: l.quantite, reparationId: l.reparation_id, client: l.client || "", statut: l.statut, commandeLe: l.commandee_le, recueLe: l.recue_le });
  return c.json({
    fournisseurs: fournisseurs.map((f) => ({
      id: f.id, nom: f.nom, email: f.email,
      panier: lignes.filter((l) => l.fournisseur_id === f.id && l.statut === "panier").map(vers),
      commandees: lignes.filter((l) => l.fournisseur_id === f.id && l.statut === "commandee").map(vers),
      recues: lignes.filter((l) => l.fournisseur_id === f.id && l.statut === "recue").map(vers),
    })),
  });
});

// Historique complet d'un fournisseur : chaque commande passée (regroupée par date) avec ses lignes et leur réception.
app.get("/api/achats/historique", async (c) => {
  const id = Number(c.req.query("fournisseurId"));
  const rows = (await sql`SELECT l.id, l.commande_id, l.libelle, l.sku, l.barcode, l.quantite, l.statut, l.commandee_le, l.recue_le, l.reparation_id, trim(cl.prenom || ' ' || cl.nom) AS client
    FROM commande_lignes l LEFT JOIN reparations r ON r.id = l.reparation_id LEFT JOIN clients cl ON cl.id = r.client_id
    WHERE l.fournisseur_id = ${id} AND l.commandee_le IS NOT NULL ORDER BY l.commandee_le DESC, l.id LIMIT 500`) as any[];
  const groupes: any[] = [];
  for (const r of rows) {
    let g = groupes.find((x) => x.id === r.commande_id);
    if (!g) { g = { id: r.commande_id, date: new Date(r.commandee_le).toISOString(), lignes: [] }; groupes.push(g); }
    g.lignes.push({ id: r.id, libelle: r.libelle, sku: r.sku ?? "", barcode: r.barcode ?? "", quantite: r.quantite, statut: r.statut, recueLe: r.recue_le, reparationId: r.reparation_id, client: r.client || "" });
  }
  return c.json(groupes);
});

app.post("/api/achats/fournisseur", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const nom = clean(b.nom, 80);
  if (!nom) throw new AppError(400, "Le nom du fournisseur est obligatoire.");
  await sql`INSERT INTO fournisseurs (nom, email) VALUES (${nom}, ${clean(b.email, 120)})`;
  return c.json({ message: "Fournisseur ajouté." });
});

app.post("/api/achats/fournisseur/modifier", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  await sql`UPDATE fournisseurs SET email = ${clean(b.email, 120)} WHERE id = ${Number(b.id)}`;
  return c.json({ message: "Email du fournisseur enregistré." });
});

// Ajouter une ligne au panier d'un fournisseur (produit du catalogue Shopify ou saisie libre).
app.post("/api/achats/ligne", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const libelle = clean(b.libelle, 200);
  if (!libelle) throw new AppError(400, "Le libellé est obligatoire.");
  const [f] = await sql`SELECT id FROM fournisseurs WHERE id = ${Number(b.fournisseurId)} AND actif = true`;
  if (!f) throw new AppError(400, "Choisis un fournisseur.");
  await sql`INSERT INTO commande_lignes (fournisseur_id, libelle, sku, barcode, variant_id, quantite) VALUES (${f.id}, ${libelle}, ${clean(b.sku, 80) || null}, ${clean(b.barcode, 80) || null}, ${clean(b.variantId, 80) || null}, ${nettoyerQte(b.quantite)})`;
  // Même pièce (référence sœur) déjà au panier ou commandée chez un autre fournisseur ?
  const avertissements = await alertesSoeurs({ ref: clean(b.barcode, 80) || clean(b.sku, 80), fournisseurId: f.id, magasin: magasinDe(c) });
  return c.json({ message: ["Ajouté au panier.", ...avertissements].join(" "), avertissements });
});

// Depuis un devis : « À commander ». La prise en charge passe en « en attente de pièce » (vue En commande).
app.post("/api/achats/depuis-devis", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const [d] = (await sql`SELECT * FROM devis_lignes WHERE id = ${Number(b.devisLigneId)} AND type = 'piece'`) as any[];
  if (!d) throw new AppError(404, "Ligne de pièce introuvable.");
  // Quel fournisseur ? 1) celui choisi, 2) celui déjà utilisé pour ce produit, 3) celui dont le nom correspond à la marque Shopify, 4) l'unique fournisseur.
  const fs = (await sql`SELECT id, nom FROM fournisseurs WHERE actif = true ORDER BY nom`) as any[];
  let f: any = fs.find((x) => x.id === Number(b.fournisseurId));
  let raison = "";
  if (!f && (d.shopify_variant_id || d.sku)) {
    const [h] = (await sql`SELECT fournisseur_id FROM commande_lignes WHERE (${d.shopify_variant_id ?? ""} <> '' AND variant_id = ${d.shopify_variant_id ?? ""}) OR (${d.sku ?? ""} <> '' AND sku = ${d.sku ?? ""}) ORDER BY id DESC LIMIT 1`) as any[];
    f = h && fs.find((x) => x.id === h.fournisseur_id);
    if (f) raison = "habituel pour ce produit";
  }
  if (!f && d.marque) {
    const mq = String(d.marque).toLowerCase();
    f = fs.find((x) => mq.includes(x.nom.toLowerCase()) || x.nom.toLowerCase().includes(mq));
    if (f) raison = `marque ${d.marque}`;
  }
  if (!f && fs.length === 1) { f = fs[0]; raison = "seul fournisseur"; }
  if (!f) return c.json({ choix: true, fournisseurs: fs, message: "Choisis un fournisseur." });
  const [deja] = await sql`SELECT id FROM commande_lignes WHERE devis_ligne_id = ${d.id} AND statut <> 'recue'`;
  if (deja) throw new AppError(400, "Cette pièce est déjà dans un panier ou commandée.");
  await sql`INSERT INTO commande_lignes (fournisseur_id, libelle, sku, barcode, variant_id, quantite, reparation_id, devis_ligne_id) VALUES (${f.id}, ${d.libelle}, ${d.sku}, ${d.barcode}, ${d.shopify_variant_id}, ${d.quantite}, ${d.reparation_id}, ${d.id})`;
  const [r] = (await sql`SELECT statut FROM reparations WHERE id = ${d.reparation_id}`) as any[];
  if (r && r.statut !== "en attente de pièce") {
    await sql`UPDATE reparations SET statut = 'en attente de pièce', piece_arrivee = false, maj_le = now() WHERE id = ${d.reparation_id}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${d.reparation_id}, 'statut', ${`Statut : ${r.statut} → en attente de pièce${signature(c)}`})`;
  }
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${d.reparation_id}, 'note', ${`Pièce à commander chez ${f.nom} : ${d.quantite} × ${d.libelle}${signature(c)}`})`;
  const avertissements = await alertesSoeurs({ ref: d.barcode || d.sku, fournisseurId: f.id, magasin: magasinDe(c) });
  return c.json({ message: [`Ajouté au panier ${f.nom}${raison ? ` (${raison})` : ""}.`, ...avertissements].join(" "), avertissements });
});

app.post("/api/achats/ligne/maj", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  await sql`UPDATE commande_lignes SET quantite = ${nettoyerQte(b.quantite)} WHERE id = ${Number(b.id)} AND statut = 'panier'`;
  return c.json({ ok: true });
});
app.post("/api/achats/ligne/supprimer", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  await sql`DELETE FROM commande_lignes WHERE id = ${Number(b.id)} AND statut = 'panier'`;
  return c.json({ ok: true });
});

// Marquer le panier d'un fournisseur comme commandé.
app.post("/api/achats/commander", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.fournisseurId);
  const [f] = await sql`SELECT nom FROM fournisseurs WHERE id = ${id}`;
  if (!f) throw new AppError(404, "Fournisseur introuvable.");
  const [{ n: nbPanier }] = (await sql`SELECT count(*)::int AS n FROM commande_lignes WHERE fournisseur_id = ${id} AND statut = 'panier'`) as any[];
  if (!nbPanier) throw new AppError(400, "Le panier est vide.");
  const [cmd] = (await sql`INSERT INTO commandes (fournisseur_id) VALUES (${id}) RETURNING id`) as any[];
  const rows = (await sql`UPDATE commande_lignes SET statut = 'commandee', commandee_le = now(), commande_id = ${cmd.id} WHERE fournisseur_id = ${id} AND statut = 'panier' RETURNING id, reparation_id, libelle`) as any[];
  for (const r of rows) {
    if (r.reparation_id) await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${r.reparation_id}, 'note', ${`Pièce commandée chez ${f.nom} : ${r.libelle}${signature(c)}`})`;
  }
  return c.json({ message: `Commande n°${String(cmd.id).padStart(4, "0")} ${f.nom} enregistrée (${rows.length} ligne(s)).`, commandeId: cmd.id });
});

// Réception : quand toutes les pièces d'une prise en charge sont là, elle repasse « en réparation » (À faire)
// et la fiche signale « pièce arrivée : prévenir le client ».
app.post("/api/achats/recevoir", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const ids: number[] = (Array.isArray(b.ids) ? b.ids : [b.id]).map(Number).filter((n: number) => n > 0);
  if (!ids.length) throw new AppError(400, "Rien à réceptionner.");
  const rows = (await sql`UPDATE commande_lignes SET statut = 'recue', recue_le = now() WHERE id = ANY(${ids}) AND statut = 'commandee' RETURNING reparation_id, variant_id, sku, barcode, libelle, quantite`) as any[];
  // Produit hors catalogue (saisie libre, AliExpress…) commandé pour le stock : il entre dans le stock maison à la réception.
  // Si la ligne porte le code-barres d'un fournisseur associé à un produit maître, c'est le stock du maître qui est crédité.
  for (const l of rows) if (!l.reparation_id && !l.variant_id) {
    const parAlias = l.barcode && (await resoudre(l.barcode)).alias;
    await entreeStock({ code: parAlias ? l.barcode : l.sku, nom: l.libelle, qte: l.quantite }, "Réception commande", magasinDe(c));
  }
  const reps = [...new Set(rows.map((r) => r.reparation_id).filter((x) => x))] as number[];
  let prets = 0;
  for (const rid of reps) {
    const [reste] = (await sql`SELECT count(*)::int AS n FROM commande_lignes WHERE reparation_id = ${rid} AND statut <> 'recue'`) as any[];
    if (reste.n > 0) continue;
    const [r] = (await sql`SELECT statut FROM reparations WHERE id = ${rid}`) as any[];
    await sql`UPDATE reparations SET statut = 'en réparation', piece_arrivee = true, maj_le = now() WHERE id = ${rid}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${rid}, 'statut', ${`Pièce(s) reçue(s) : ${r?.statut ?? ""} → en réparation. Client à prévenir${signature(c)}`})`;
    prets++;
    void envoyerPieceArrivee(rid);
  }
  return c.json({ message: prets ? `${prets} réparation(s) repassent à faire : pense à prévenir le client.` : "Réception enregistrée." });
});

app.post("/api/reparations/client-prevenu", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.repairId);
  await sql`UPDATE reparations SET piece_arrivee = false WHERE id = ${id}`;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'note', ${`Client prévenu (pièce arrivée)${signature(c)}`})`;
  return c.json({ ok: true });
});
