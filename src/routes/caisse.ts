import { app } from "../app";
import { sql } from "../db";
import { lireParametres } from "./parametres";
import { AppError, clean, signature } from "../util";

// Les points Shopify (lecture seule) restent affichés à part dans le profil.
export async function soldeFidelite(clientId: number) {
  const p = await lireParametres();
  const [dep] = (await sql`SELECT COALESCE(sum(total_cents), 0)::int AS n FROM ventes WHERE client_id = ${clientId}`) as any[];
  const [uti] = (await sql`SELECT COALESCE(sum(remise_cents), 0)::int AS n FROM ventes WHERE client_id = ${clientId}`) as any[];
  const depenseEuros = dep.n / 100;
  const gagneEuros = Math.floor(depenseEuros / p.eurosPourPalier) * p.remiseEuros;
  const disponibleEuros = Math.max(0, gagneEuros - uti.n / 100);
  const prochainPalierIn = p.eurosPourPalier - (depenseEuros % p.eurosPourPalier);
  return { depenseEuros, disponibleEuros, prochainPalierIn, regle: p };
}

app.get("/api/caisse/client", async (c) => {
  const id = Number(c.req.query("id"));
  if (!(id > 0)) throw new AppError(404, "Client introuvable.");
  const [cl] = (await sql`SELECT id, prenom, nom, telephone, email FROM clients WHERE id = ${id}`) as any[];
  if (!cl) throw new AppError(404, "Client introuvable.");
  return c.json({ client: { id: cl.id, name: `${cl.prenom} ${cl.nom}`.trim(), phone: cl.telephone, email: cl.email }, fidelite: await soldeFidelite(id) });
});

// Trouver un client à partir d'un scan (douchette = clavier) : email, téléphone ou numéro de client.
app.get("/api/caisse/scan", async (c) => {
  const q = clean(c.req.query("q"), 120);
  if (!q) return c.json({ client: null });
  const num = /^\d+$/.test(q) && q.length < 8 ? Number(q) : 0;
  const [cl] = (await sql`SELECT id FROM clients WHERE email ILIKE ${q} OR replace(telephone, ' ', '') = ${q.replace(/\s/g, "")} OR id = ${num} ORDER BY id LIMIT 1`) as any[];
  return c.json({ clientId: cl ? cl.id : null });
});

// Encaisser : lignes + paiements (carte / espèces / virement, plusieurs possibles) + remise fidélité éventuelle.
app.post("/api/caisse/encaisser", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const lignes = Array.isArray(b.lignes) ? b.lignes : [];
  if (!lignes.length) throw new AppError(400, "Le panier est vide.");
  const nettoyees = lignes.map((l: any) => ({
    libelle: clean(l.libelle, 200),
    quantite: Math.max(1, Math.min(999, Math.round(Number(l.quantite) || 1))),
    prixCents: Math.max(0, Math.round((Number(String(l.prix ?? "0").replace(",", ".")) || 0) * 100)),
  }));
  if (nettoyees.some((l: any) => !l.libelle)) throw new AppError(400, "Chaque ligne doit avoir un libellé.");
  const brut = nettoyees.reduce((s: number, l: any) => s + l.quantite * l.prixCents, 0);

  const clientId = Number(b.clientId) > 0 ? Number(b.clientId) : null;
  const reparationId = Number(b.repairId) > 0 ? Number(b.repairId) : null;
  let remiseCents = 0;
  if (b.utiliserFidelite === true) {
    if (!clientId) throw new AppError(400, "Choisis un client pour utiliser sa fidélité.");
    const s = await soldeFidelite(clientId);
    remiseCents = Math.min(Math.round(s.disponibleEuros * 100), brut);
  }
  const totalCents = brut - remiseCents;

  const paiements = (Array.isArray(b.paiements) ? b.paiements : []).map((p: any) => ({
    moyen: String(p.moyen ?? ""),
    cents: Math.max(0, Math.round((Number(String(p.montant ?? "0").replace(",", ".")) || 0) * 100)),
  })).filter((p: any) => p.cents > 0);
  if (paiements.some((p: any) => !["carte", "especes", "virement"].includes(p.moyen))) throw new AppError(400, "Moyen de paiement inconnu.");
  const payeTotal = paiements.reduce((s: number, p: any) => s + p.cents, 0);
  if (payeTotal !== totalCents) throw new AppError(400, `Les paiements (${(payeTotal / 100).toFixed(2)} €) ne correspondent pas au total (${(totalCents / 100).toFixed(2)} €).`);

  const u = c.get("user");
  const p = await lireParametres();
  const pointsGagnes = Math.floor(totalCents / 100 / p.eurosPourPalier);
  const [v] = (await sql`INSERT INTO ventes (client_id, reparation_id, magasin, vendeur, total_cents, remise_cents, points_gagnes, points_utilises) VALUES (${clientId}, ${reparationId}, ${u.magasin ?? null}, ${u.prenom}, ${totalCents}, ${remiseCents}, ${pointsGagnes}, ${remiseCents > 0 ? 1 : 0}) RETURNING id`) as any[];
  for (const l of nettoyees) {
    await sql`INSERT INTO vente_lignes (vente_id, libelle, quantite, prix_unitaire_cents) VALUES (${v.id}, ${l.libelle}, ${l.quantite}, ${l.prixCents})`;
  }
  for (const pa of paiements) {
    await sql`INSERT INTO vente_paiements (vente_id, moyen, montant_cents) VALUES (${v.id}, ${pa.moyen}, ${pa.cents})`;
  }
  if (reparationId) {
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${reparationId}, 'caisse', ${`Encaissement de ${(totalCents / 100).toFixed(2)} €${signature(c)}`})`;
  }
  return c.json({ id: v.id, message: "Vente enregistrée (caisse interne, rien n'est envoyé à Shopify).", totalCents, remiseCents });
});
