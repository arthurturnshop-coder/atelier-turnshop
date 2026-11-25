import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { envoyerPieceArrivee, envoyerCommandeArrivee } from "../automatisations";
import { shopifyRead } from "../shopify";
import { entreeStock, alertesSoeurs, produitParCode } from "./stock";
import { AppError, clean, signature } from "../util";

await sql`ALTER TABLE commande_lignes ADD COLUMN IF NOT EXISTS suivi TEXT`;
await sql`ALTER TABLE commande_lignes ADD COLUMN IF NOT EXISTS boite TEXT`;
await sql`ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS remise_client BOOLEAN NOT NULL DEFAULT false`;
await sql`ALTER TABLE commande_lignes ADD COLUMN IF NOT EXISTS remise_le TIMESTAMPTZ`;
await sql`ALTER TABLE commande_lignes ADD COLUMN IF NOT EXISTS remise_par TEXT`;
await sql`ALTER TABLE fournisseurs ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'groupe'`;
await sql`ALTER TABLE fournisseurs ADD COLUMN IF NOT EXISTS franco_cents INT`;
await sql`UPDATE fournisseurs SET mode = 'unitaire' WHERE mode = 'groupe' AND nom ~* 'aliexpress|amazon|ebay|temu|banggood' AND NOT EXISTS (SELECT 1 FROM commandes c WHERE c.fournisseur_id = fournisseurs.id)`;
await sql`ALTER TABLE commandes ADD COLUMN IF NOT EXISTS suivi TEXT`;
await sql`ALTER TABLE commande_lignes ADD COLUMN IF NOT EXISTS relance_le TIMESTAMPTZ`;
await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS piece_a_valider BOOLEAN NOT NULL DEFAULT false`;
const nettoyerQte = (n: any) => Math.max(1, Math.min(999, Math.round(Number(n) || 1)));
const magasinDe = (c: any) => (c.get("user")?.magasin === "Rouen" ? "Rouen" : "Amiens");

// Tout l'espace Commandes : par fournisseur, le panier, ce qui est commandé et ce qui est reçu récemment.
app.get("/api/achats", async (c) => {
  const fournisseurs = (await sql`SELECT id, nom, email, mode, franco_cents FROM fournisseurs WHERE actif = true ORDER BY nom`) as any[];
  const lignes = (await sql`SELECT l.*, co.suivi AS suivi_bloc, trim(cl.prenom || ' ' || cl.nom) AS client FROM commande_lignes l LEFT JOIN commandes co ON co.id = l.commande_id LEFT JOIN reparations r ON r.id = l.reparation_id LEFT JOIN clients cl ON cl.id = r.client_id
    WHERE l.statut <> 'recue' OR l.recue_le > now() - interval '7 days' ORDER BY l.id`) as any[];
  const vers = (l: any) => ({ commandeId: l.commande_id ?? null, id: l.id, libelle: l.libelle, sku: l.sku ?? "", barcode: l.barcode ?? "", variantId: l.variant_id ?? "", quantite: l.quantite, reparationId: l.reparation_id, client: l.client || "", statut: l.statut, commandeLe: l.commandee_le, recueLe: l.recue_le, suivi: l.suivi ?? l.suivi_bloc ?? "" });
  return c.json({
    fournisseurs: fournisseurs.map((f) => ({
      id: f.id, nom: f.nom, email: f.email, mode: f.mode, francoCents: f.franco_cents ?? null,
      panier: lignes.filter((l) => l.fournisseur_id === f.id && l.statut === "panier").map(vers),
      commandees: lignes.filter((l) => l.fournisseur_id === f.id && l.statut === "commandee").map(vers),
      recues: lignes.filter((l) => l.fournisseur_id === f.id && l.statut === "recue").map(vers),
    })),
  });
});

// Historique complet d'un fournisseur : chaque commande passée (regroupée par date) avec ses lignes et leur réception.

// Feuille de commande A4 : pour chaque fournisseur, les lignes du panier avec quantité, prix et codes-barres.
// Un produit maître est déplié en ses produits liés, le moins cher en premier.
app.get("/api/achats/feuille", async (c) => {
  const fid = Number(c.req.query("fournisseurId")) || 0;
  const fs = (await sql`SELECT id, nom, franco_cents FROM fournisseurs WHERE actif = true AND (${fid} = 0 OR id = ${fid}) ORDER BY nom`) as any[];
  const lignes = (await sql`SELECT l.id, l.fournisseur_id, l.libelle, l.sku, l.barcode, l.variant_id, l.quantite, d.maitre_id, d.prix_unitaire_cents AS prix_vente, trim(cl.prenom || ' ' || cl.nom) AS client
    FROM commande_lignes l LEFT JOIN devis_lignes d ON d.id = l.devis_ligne_id LEFT JOIN reparations r ON r.id = l.reparation_id LEFT JOIN clients cl ON cl.id = r.client_id
    WHERE l.statut = 'panier' AND (${fid} = 0 OR l.fournisseur_id = ${fid}) ORDER BY l.id`) as any[];
  const liens = new Map<number, any[]>();
  for (const m of new Set(lignes.map((l) => l.maitre_id).filter(Boolean))) liens.set(m, (await sql`SELECT variant_id, sku, barcode, libelle FROM maitre_liens WHERE maitre_id = ${m} ORDER BY id`) as any[]);
  const vids = [...new Set([...lignes.map((l) => l.variant_id), ...[...liens.values()].flat().map((x) => x.variant_id)].filter((x) => x && String(x).startsWith("gid://")))];
  const prix = new Map<string, { cents: number | null; cout: boolean }>();
  if (vids.length) {
    const lire = async (avecCout: boolean) => shopifyRead(`query($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { id price ${avecCout ? "inventoryItem { unitCost { amount } }" : ""} } } }`, { ids: vids });
    let d: any; try { d = await lire(true); } catch { try { d = await lire(false); } catch { d = null; } }
    for (const n of d?.nodes ?? []) if (n?.id) {
      const cout = n.inventoryItem?.unitCost?.amount;
      prix.set(n.id, cout != null ? { cents: Math.round(Number(cout) * 100), cout: true } : { cents: n.price != null ? Math.round(Number(n.price) * 100) : null, cout: false });
    }
  }
  const pv = (vid: string) => prix.get(vid) ?? { cents: null, cout: false };
  const out = fs.map((f) => ({
    id: f.id, nom: f.nom,
    lignes: lignes.filter((l) => l.fournisseur_id === f.id).map((l) => {
      const autres = (l.maitre_id ? liens.get(l.maitre_id) ?? [] : []).map((x: any) => ({ libelle: x.libelle, sku: x.sku, barcode: x.barcode, prixCents: pv(x.variant_id).cents, cout: pv(x.variant_id).cout }));
      autres.sort((a: any, b: any) => (a.prixCents ?? 1e12) - (b.prixCents ?? 1e12));
      const pl = pv(l.variant_id);
      return { libelle: l.libelle, quantite: l.quantite, sku: l.sku ?? "", barcode: l.barcode ?? "", prixCents: pl.cents ?? l.prix_vente ?? null, cout: pl.cout, client: l.client || "", maitre: autres.length > 0, options: autres };
    }),
  })).filter((f) => f.lignes.length).map((f) => {
    let total = 0, sansPrix = 0;
    for (const l of f.lignes) {
      const p = l.maitre && l.options.length ? l.options[0].prixCents : l.prixCents;
      if (p == null) sansPrix++; else total += p * l.quantite;
    }
    const fr = fs.find((x) => x.id === f.id)?.franco_cents ?? null;
    return { ...f, totalCents: total, sansPrix, francoCents: fr };
  });
  return c.json({ fournisseurs: out });
});

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

app.post("/api/achats/franco", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const v = String(b.franco ?? "").trim();
  const cents = v === "" ? null : Math.round((Number(v.replace(",", ".")) || 0) * 100);
  await sql`UPDATE fournisseurs SET franco_cents = ${cents} WHERE id = ${Number(b.id)}`;
  return c.json({ message: cents === null ? "Franco retiré." : "Franco enregistré." });
});

// Lien de panier eWheel (Shopify : /cart/ID:QTE,ID:QTE) : on retrouve la variante de chaque SKU sur le site public.
const EW_CACHE = new Map<string, { id: number; available: boolean } | null>();
async function ewVariante(sku: string) {
  const k = sku.toLowerCase();
  if (EW_CACHE.has(k) && EW_CACHE.get(k)) return EW_CACHE.get(k)!;
  const sr: any = await fetch("https://ewheel.es/search/suggest.json?q=" + encodeURIComponent(sku) + "&resources[type]=product&resources[limit]=5").then((r) => r.json()).catch(() => null);
  const ps: any[] = sr?.resources?.results?.products ?? [];
  for (const p of ps) {
    const pr: any = await fetch("https://ewheel.es/products/" + p.handle + ".js").then((r) => r.json()).catch(() => null);
    const v = (pr?.variants ?? []).find((x: any) => { const s = String(x.sku || "").toLowerCase(); return s === k || s === k + "-iu"; });
    if (v) { const r = { id: v.id as number, available: !!v.available }; EW_CACHE.set(k, r); return r; }
  }
  return null;
}
app.post("/api/achats/lien-panier", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const lignes = (await sql`SELECT sku, libelle, quantite FROM commande_lignes WHERE fournisseur_id = ${Number(b.fournisseurId)} AND statut = 'panier' ORDER BY id`) as any[];
  const parts: string[] = [], ko: string[] = [];
  const total = new Map<string, number>();
  for (const l of lignes) { if (!l.sku) { ko.push(l.libelle + " (sans référence)"); continue; } total.set(l.sku, (total.get(l.sku) ?? 0) + Number(l.quantite)); }
  for (const [sku, q] of total) {
    const v = await ewVariante(sku);
    if (!v) ko.push(sku + " (introuvable)");
    else if (!v.available) ko.push(sku + " (rupture)");
    else parts.push(v.id + ":" + q);
  }
  return c.json({ url: parts.length ? "https://ewheel.es/cart/" + parts.join(",") : "", ajoutes: parts.length, ko });
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
  if (b.mode === "groupe" || b.mode === "unitaire") await sql`UPDATE fournisseurs SET mode = ${b.mode} WHERE id = ${Number(b.id)}`;
  if (b.email !== undefined) await sql`UPDATE fournisseurs SET email = ${clean(b.email, 120)} WHERE id = ${Number(b.id)}`;
  return c.json({ message: "Fournisseur enregistré." });
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
// Numéro de suivi d'une ligne commandée (ex : commande AliExpress liée à une prise en charge).
app.post("/api/achats/ligne/suivi", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const suivi = clean(b.suivi, 80);
  const [l0] = (await sql`SELECT l.id, l.commande_id, f.mode FROM commande_lignes l JOIN fournisseurs f ON f.id = l.fournisseur_id WHERE l.id = ${Number(b.id)}`) as any[];
  if (!l0) throw new AppError(404, "Ligne introuvable.");
  let touchees: any[];
  if (l0.mode === "groupe" && l0.commande_id) {
    // Bloc (ex : eWheel) : un seul numéro de suivi pour tous les produits de la commande.
    await sql`UPDATE commandes SET suivi = ${suivi || null} WHERE id = ${l0.commande_id}`;
    await sql`UPDATE commande_lignes SET suivi = NULL WHERE commande_id = ${l0.commande_id}`;
    touchees = (await sql`SELECT reparation_id, libelle FROM commande_lignes WHERE commande_id = ${l0.commande_id}`) as any[];
  } else touchees = (await sql`UPDATE commande_lignes SET suivi = ${suivi || null} WHERE id = ${l0.id} RETURNING reparation_id, libelle`) as any[];
  if (suivi) for (const l of touchees) if (l.reparation_id) await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${l.reparation_id}, 'note', ${`Suivi de la commande « ${l.libelle} » : ${suivi}${signature(c)}`})`;
  return c.json({ message: "Suivi enregistré." });
});
// Prises en charge ouvertes (pour rattacher un produit commandé).
app.get("/api/achats/reparations-ouvertes", async (c) => {
  const rows = (await sql`SELECT r.id, trim(cl.prenom || ' ' || cl.nom) AS client, r.statut FROM reparations r LEFT JOIN clients cl ON cl.id = r.client_id WHERE r.supprime_le IS NULL AND r.statut <> 'récupéré' ORDER BY r.id DESC LIMIT 150`) as any[];
  return c.json(rows.map((r) => ({ id: r.id, client: r.client || "", statut: r.statut })));
});
// Rattacher (ou détacher avec repairId vide) une ligne à une prise en charge.
app.post("/api/achats/ligne/rattacher", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const rid = b.repairId ? Number(b.repairId) : null;
  const [l0] = (await sql`SELECT id, libelle, statut, reparation_id FROM commande_lignes WHERE id = ${Number(b.id)}`) as any[];
  if (!l0) throw new AppError(404, "Ligne introuvable.");
  if (rid) {
    const [r] = (await sql`SELECT id, statut FROM reparations WHERE id = ${rid}`) as any[];
    if (!r) throw new AppError(404, "Prise en charge introuvable.");
    await sql`UPDATE commande_lignes SET reparation_id = ${rid} WHERE id = ${l0.id}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${rid}, 'note', ${`Pièce rattachée : « ${l0.libelle} »${l0.statut === "commandee" ? " (commandée)" : ""}${signature(c)}`})`;
    if (l0.statut === "commandee" && ["reçu", "diagnostic", "devis envoyé", "à faire"].includes(r.statut)) await sql`UPDATE reparations SET statut = 'en attente de pièce' WHERE id = ${rid}`;
  } else {
    await sql`UPDATE commande_lignes SET reparation_id = NULL WHERE id = ${l0.id}`;
    if (l0.reparation_id) await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${l0.reparation_id}, 'note', ${`Pièce détachée : « ${l0.libelle} »${signature(c)}`})`;
  }
  return c.json({ message: rid ? "Rattaché à la prise en charge." : "Détaché." });
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
  const rows = (await sql`UPDATE commande_lignes SET statut = 'recue', recue_le = now() WHERE id = ANY(${ids}) AND statut = 'commandee' RETURNING reparation_id, variant_id, sku, barcode, libelle, quantite, devis_ligne_id`) as any[];
  // Produit hors catalogue (saisie libre, AliExpress…) commandé pour le stock : il entre dans le stock maison à la réception.
  // Si la ligne porte un code-barres déjà connu d'une fiche (code principal ou supplémentaire), c'est cette fiche qui est créditée,
  // sans la renommer avec le libellé du fournisseur.
  for (const l of rows) if (!l.reparation_id && !l.variant_id) {
    const fiche = l.barcode ? await produitParCode(l.barcode, magasinDe(c)) : undefined;
    await entreeStock({ code: fiche ? l.barcode : l.sku, nom: fiche ? "" : l.libelle, qte: l.quantite }, "Réception commande", magasinDe(c));
  }
  const reps = [...new Set(rows.map((r) => r.reparation_id).filter((x) => x))] as number[];
  let prets = 0;
  for (const rid of reps) {
    const [reste] = (await sql`SELECT count(*)::int AS n FROM commande_lignes WHERE reparation_id = ${rid} AND statut <> 'recue'`) as any[];
    if (reste.n > 0) continue;
    await sql`UPDATE reparations SET piece_a_valider = true, maj_le = now() WHERE id = ${rid}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${rid}, 'note', ${`📦 Pièce arrivée : à valider dans l'atelier pour passer dans « À faire »${signature(c)}`})`;
    prets++;
  }
  // Commande client (pièce « pour le client ») : email « votre commande est arrivée » dès la réception.
  const dlIds = rows.map((r) => r.devis_ligne_id).filter((x) => x);
  if (dlIds.length) {
    const cc = (await sql`SELECT reparation_id, libelle FROM devis_lignes WHERE id = ANY(${dlIds}) AND remise_client`) as any[];
    const parRep = new Map<number, string[]>();
    for (const x of cc) parRep.set(x.reparation_id, [...(parRep.get(x.reparation_id) ?? []), x.libelle]);
    for (const [rid, libs] of parRep) void envoyerCommandeArrivee(rid, libs);
  }
  // Les tâches « toujours pas arrivé » de ces lignes n'ont plus lieu d'être.
  await sql`UPDATE taches SET fait = true, fait_le = now(), fait_par = 'Réception' WHERE fait = false AND ligne_id = ANY(${ids})`;
  return c.json({ message: prets ? `${prets} réparation(s) ont une pièce arrivée : à valider dans l'atelier pour passer dans « À faire ».` : "Réception enregistrée." });
});

app.post("/api/reparations/client-prevenu", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.repairId);
  await sql`UPDATE reparations SET piece_arrivee = false WHERE id = ${id}`;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'note', ${`Client prévenu (pièce arrivée)${signature(c)}`})`;
  return c.json({ ok: true });
});

// Validation dans l'atelier : la pièce est bien là, la prise en charge passe en réparation et le client est prévenu.
app.post("/api/reparations/valider-piece", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.repairId);
  const [r] = (await sql`SELECT statut, piece_a_valider FROM reparations WHERE id = ${id} AND supprime_le IS NULL`) as any[];
  if (!r) throw new AppError(404, "Prise en charge introuvable.");
  await sql`UPDATE reparations SET statut = 'à faire', piece_a_valider = false, piece_arrivee = true, maj_le = now() WHERE id = ${id}`;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'statut', ${`Pièce validée : ${r.statut} → à faire. Client à prévenir${signature(c)}`})`;
  void envoyerPieceArrivee(id);
  return c.json({ message: "Pièce validée : la réparation passe dans « À faire »." });
});

// ---------- Pièces commandées exprès pour un client : arrivées, rangées dans une case, à remettre ----------
const BOITES_P = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"];
const pcnP = (id: number) => "PC-" + String(id).padStart(4, "0");

app.get("/api/commandes-clients", async (c) => {
  const rows = (await sql`SELECT l.id, l.libelle, l.quantite, l.statut, l.commandee_le, l.recue_le, l.remise_le, l.boite, l.reparation_id, f.nom AS fournisseur, cl.prenom, cl.nom
    FROM commande_lignes l JOIN devis_lignes dl ON dl.id = l.devis_ligne_id AND dl.remise_client JOIN reparations r ON r.id = l.reparation_id JOIN clients cl ON cl.id = r.client_id LEFT JOIN fournisseurs f ON f.id = l.fournisseur_id
    WHERE r.supprime_le IS NULL AND (l.remise_le IS NULL OR l.remise_le > now() - interval '30 days') ORDER BY (l.remise_le IS NOT NULL), l.id DESC LIMIT 200`) as any[];
  return c.json({ commandes: rows.map((l) => ({ id: l.id, libelle: l.libelle, quantite: l.quantite, statut: l.remise_le ? "remise" : l.statut, fournisseur: l.fournisseur ?? "", commandeeLe: l.commandee_le, recueLe: l.recue_le, remiseLe: l.remise_le, boite: l.boite ?? "", repairId: l.reparation_id, numero: pcnP(l.reparation_id), client: `${l.prenom} ${l.nom}`.trim() })) });
});

app.post("/api/devis-lignes/remise-client", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (b.repairId) await sql`UPDATE devis_lignes SET remise_client = ${!!b.valeur} WHERE reparation_id = ${Number(b.repairId)} AND type = 'piece' AND libelle NOT ILIKE 'Livraison à domicile%'`;
  else await sql`UPDATE devis_lignes SET remise_client = ${!!b.valeur} WHERE id = ${Number(b.id)}`;
  return c.json({ message: b.valeur ? "Cette pièce apparaîtra dans le bloc Client à son arrivée." : "Cette pièce reste côté atelier." });
});

app.get("/api/pieces-a-remettre", async (c) => {
  const rows = (await sql`SELECT l.id, l.libelle, l.quantite, l.reparation_id, l.boite, l.recue_le, l.devis_ligne_id, r.client_id, r.boite AS boite_pc, cl.prenom, cl.nom, cl.telephone
    FROM commande_lignes l JOIN reparations r ON r.id = l.reparation_id JOIN clients cl ON cl.id = r.client_id
    JOIN devis_lignes dl ON dl.id = l.devis_ligne_id AND dl.remise_client
    WHERE l.statut = 'recue' AND l.remise_le IS NULL AND r.supprime_le IS NULL ORDER BY l.recue_le`) as any[];
  const { acomptesDe } = await import("./acomptes");
  const out: any[] = [];
  for (const l of rows) {
    const ac = await acomptesDe(l.reparation_id);
    const [dv] = (await sql`SELECT COALESCE(sum(quantite * prix_unitaire_cents), 0)::int AS t FROM devis_lignes WHERE reparation_id = ${l.reparation_id}`) as any[];
    const autres = (await sql`SELECT id, panne, statut FROM reparations WHERE client_id = ${l.client_id} AND id <> ${l.reparation_id} AND supprime_le IS NULL AND statut <> 'récupéré' ORDER BY id DESC LIMIT 8`) as any[];
    out.push({ id: l.id, libelle: l.libelle, quantite: l.quantite, repairId: l.reparation_id, numero: pcnP(l.reparation_id), client: `${l.prenom} ${l.nom}`.trim(), telephone: l.telephone ?? "", boite: l.boite ?? "", boitePc: l.boite_pc ?? "", recueLe: l.recue_le,
      versetCents: ac.verseCents - ac.rembourseCents, totalCents: dv.t, facture: !!ac.facture,
      autres: autres.map((a) => ({ id: a.id, numero: pcnP(a.id), panne: a.panne, statut: a.statut })) });
  }
  const occ = (await sql`SELECT boite, id AS rid FROM reparations WHERE boite IS NOT NULL AND boite <> '' AND supprime_le IS NULL AND statut <> 'récupéré'`) as any[];
  const occL = (await sql`SELECT boite, reparation_id AS rid FROM commande_lignes WHERE boite IS NOT NULL AND boite <> '' AND remise_le IS NULL`) as any[];
  const enCours = (await sql`SELECT l.id, l.libelle, l.statut, l.commandee_le, l.reparation_id, cl.prenom, cl.nom FROM commande_lignes l JOIN devis_lignes dl ON dl.id = l.devis_ligne_id AND dl.remise_client JOIN reparations r ON r.id = l.reparation_id JOIN clients cl ON cl.id = r.client_id WHERE l.statut IN ('panier','commandee') AND r.supprime_le IS NULL ORDER BY l.id DESC`) as any[];
  return c.json({ enCours: enCours.map((l) => ({ id: l.id, libelle: l.libelle, statut: l.statut, commandeeLe: l.commandee_le, numero: pcnP(l.reparation_id), client: `${l.prenom} ${l.nom}`.trim() })), pieces: out, cases: BOITES_P.map((n) => ({ nom: n, rid: (occ.find((o) => o.boite === n) ?? occL.find((o) => o.boite === n))?.rid ?? null })) });
});

app.post("/api/pieces/boite", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id), nv = clean(b.boite, 10).toUpperCase();
  const [l] = (await sql`SELECT id, reparation_id, libelle FROM commande_lignes WHERE id = ${id} AND statut = 'recue' AND remise_le IS NULL`) as any[];
  if (!l) throw new AppError(404, "Pièce introuvable.");
  if (nv) {
    const [p1] = (await sql`SELECT id FROM reparations WHERE boite = ${nv} AND supprime_le IS NULL AND statut <> 'récupéré' AND id <> ${l.reparation_id}`) as any[];
    const [p2] = (await sql`SELECT reparation_id FROM commande_lignes WHERE boite = ${nv} AND remise_le IS NULL AND reparation_id <> ${l.reparation_id} LIMIT 1`) as any[];
    if (p1 || p2) throw new AppError(400, `La case ${nv} est déjà utilisée par ${pcnP(p1?.id ?? p2.reparation_id)}.`);
  }
  await sql`UPDATE commande_lignes SET boite = ${nv || null} WHERE id = ${id}`;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${l.reparation_id}, 'note', ${`Pièce « ${l.libelle} » ${nv ? "rangée dans la case " + nv : "sortie de sa case"}${signature(c)}`})`;
  return c.json({ message: nv ? `Rangée dans ${nv}.` : "Case libérée." });
});

app.post("/api/pieces/rattacher", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id), cible = Number(b.repairId);
  const [l] = (await sql`SELECT l.id, l.reparation_id, l.libelle, l.devis_ligne_id, r.client_id FROM commande_lignes l JOIN reparations r ON r.id = l.reparation_id WHERE l.id = ${id} AND l.statut = 'recue' AND l.remise_le IS NULL`) as any[];
  if (!l) throw new AppError(404, "Pièce introuvable.");
  const [t] = (await sql`SELECT id, client_id FROM reparations WHERE id = ${cible} AND supprime_le IS NULL`) as any[];
  if (!t) throw new AppError(404, "Prise en charge ou devis introuvable.");
  if (t.client_id !== l.client_id) throw new AppError(400, "Ce devis appartient à un autre client.");
  if (t.id === l.reparation_id) throw new AppError(400, "Déjà rattachée à cette prise en charge.");
  await sql`UPDATE commande_lignes SET reparation_id = ${cible} WHERE id = ${id}`;
  if (l.devis_ligne_id) await sql`UPDATE devis_lignes SET reparation_id = ${cible} WHERE id = ${l.devis_ligne_id}`;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${l.reparation_id}, 'note', ${`Pièce « ${l.libelle} » rattachée à ${pcnP(cible)}${signature(c)}`})`;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${cible}, 'note', ${`Pièce « ${l.libelle} » ajoutée depuis ${pcnP(l.reparation_id)}${signature(c)}`})`;
  return c.json({ message: `Pièce rattachée à ${pcnP(cible)}.` });
});

app.post("/api/pieces/remettre", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const [l] = (await sql`SELECT id, reparation_id, libelle FROM commande_lignes WHERE id = ${id} AND statut = 'recue' AND remise_le IS NULL`) as any[];
  if (!l) throw new AppError(404, "Pièce introuvable.");
  await sql`UPDATE commande_lignes SET remise_le = now(), remise_par = ${c.get("user")?.prenom ?? ""}, boite = NULL WHERE id = ${id}`;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${l.reparation_id}, 'note', ${`Pièce « ${l.libelle} » remise au client${signature(c)}`})`;
  return c.json({ message: "Pièce remise au client." });
});
