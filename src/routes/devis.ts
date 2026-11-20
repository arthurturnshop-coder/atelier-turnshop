import { app } from "../app";
import { sql } from "../db";
import "./auth";
import { AppError, clean } from "../util";

// Devis simples : un devis seul (numéro DV-xxxx), sans prise en charge. Rattaché à une prise en charge seulement s'il se concrétise.
await sql`CREATE TABLE IF NOT EXISTS devis_simples (id SERIAL PRIMARY KEY, client_id INT, nom TEXT NOT NULL DEFAULT '', telephone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', trottinette TEXT NOT NULL DEFAULT '', objet TEXT NOT NULL DEFAULT '', magasin TEXT NOT NULL DEFAULT 'Amiens', cree_par TEXT NOT NULL DEFAULT '', reparation_id INT, supprime_le TIMESTAMPTZ, cree_le TIMESTAMPTZ NOT NULL DEFAULT now(), maj_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS devis_simples_lignes (id SERIAL PRIMARY KEY, devis_id INT NOT NULL REFERENCES devis_simples(id), type TEXT NOT NULL DEFAULT 'piece', libelle TEXT NOT NULL, quantite INT NOT NULL DEFAULT 1, prix_unitaire_cents INT NOT NULL DEFAULT 0)`;

const vue = (d: any, lignes: any[]) => ({
  id: d.id, clientId: d.client_id, nom: d.nom, telephone: d.telephone, email: d.email, trottinette: d.trottinette, objet: d.objet, magasin: d.magasin, creePar: d.cree_par,
  reparationId: d.reparation_id, date: d.cree_le,
  lignes: lignes.map((l) => ({ type: l.type, libelle: l.libelle, quantite: l.quantite, prixCents: l.prix_unitaire_cents })),
  totalCents: lignes.reduce((t, l) => t + l.quantite * l.prix_unitaire_cents, 0),
});

app.get("/api/devis-simples", async (c) => {
  const rows = (await sql`SELECT * FROM devis_simples WHERE supprime_le IS NULL ORDER BY id DESC LIMIT 100`) as any[];
  const ids = rows.map((r) => r.id);
  const ls = ids.length ? ((await sql`SELECT * FROM devis_simples_lignes WHERE devis_id = ANY(${ids}) ORDER BY id`) as any[]) : [];
  return c.json({ devis: rows.map((r) => vue(r, ls.filter((l) => l.devis_id === r.id))) });
});

app.post("/api/devis-simples", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const u = c.get("user") as any;
  const lignes = (Array.isArray(b.lignes) ? b.lignes : []).slice(0, 60).map((l: any) => ({
    type: l.type === "main_oeuvre" ? "main_oeuvre" : "piece", libelle: clean(l.libelle, 200),
    quantite: Math.max(1, Math.min(999, Math.round(Number(l.quantite) || 1))),
    prix: Math.max(0, Math.round((Number(String(l.prix ?? "0").replace(",", ".")) || 0) * 100)),
  })).filter((l: any) => l.libelle);
  if (!lignes.length) throw new AppError(400, "Ajoute au moins une ligne au devis.");
  const nom = clean(b.nom, 120);
  if (!nom && !Number(b.clientId)) throw new AppError(400, "Indique le nom du client.");
  let id = Number(b.id) || 0;
  if (id) {
    const [d] = (await sql`SELECT * FROM devis_simples WHERE id = ${id} AND supprime_le IS NULL`) as any[];
    if (!d) throw new AppError(404, "Devis introuvable.");
    if (d.reparation_id) throw new AppError(400, "Ce devis est déjà rattaché à une prise en charge : modifie-le depuis la fiche.");
    await sql`UPDATE devis_simples SET client_id = ${Number(b.clientId) || null}, nom = ${nom}, telephone = ${clean(b.telephone, 40)}, email = ${clean(b.email, 120)}, trottinette = ${clean(b.trottinette, 120)}, objet = ${clean(b.objet, 300)}, maj_le = now() WHERE id = ${id}`;
    await sql`DELETE FROM devis_simples_lignes WHERE devis_id = ${id}`;
  } else {
    [{ id }] = (await sql`INSERT INTO devis_simples (client_id, nom, telephone, email, trottinette, objet, magasin, cree_par) VALUES (${Number(b.clientId) || null}, ${nom}, ${clean(b.telephone, 40)}, ${clean(b.email, 120)}, ${clean(b.trottinette, 120)}, ${clean(b.objet, 300)}, ${u?.magasin === "Rouen" ? "Rouen" : "Amiens"}, ${u?.prenom ?? ""}) RETURNING id`) as any[];
  }
  for (const l of lignes) await sql`INSERT INTO devis_simples_lignes (devis_id, type, libelle, quantite, prix_unitaire_cents) VALUES (${id}, ${l.type}, ${l.libelle}, ${l.quantite}, ${l.prix})`;
  return c.json({ id, message: "Devis enregistré." });
});

app.post("/api/devis-simples/supprimer", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  await sql`UPDATE devis_simples SET supprime_le = now() WHERE id = ${Number(b.id)} AND reparation_id IS NULL`;
  return c.json({ message: "Devis supprimé." });
});

// Le devis se concrétise : création de la prise en charge (client et trottinette si besoin) et copie des lignes.
app.post("/api/devis-simples/rattacher", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const [d] = (await sql`SELECT * FROM devis_simples WHERE id = ${Number(b.id)} AND supprime_le IS NULL`) as any[];
  if (!d) throw new AppError(404, "Devis introuvable.");
  if (d.reparation_id) return c.json({ reparationId: d.reparation_id, message: "Déjà rattaché." });
  let clientId = d.client_id;
  if (!clientId) {
    const parts = d.nom.trim().split(/\s+/);
    const nom = parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
    const prenom = parts.length > 1 ? parts[0] : "";
    [{ id: clientId }] = (await sql`INSERT INTO clients (prenom, nom, telephone, email) VALUES (${prenom}, ${nom}, ${d.telephone}, ${d.email}) RETURNING id`) as any[];
  }
  const mots = (d.trottinette || "Trottinette à préciser").trim().split(/\s+/);
  const marque = mots[0], modele = mots.slice(1).join(" ") || "à préciser";
  const [t] = (await sql`INSERT INTO trottinettes (client_id, marque, modele, serie) VALUES (${clientId}, ${marque}, ${modele}, ${"NC-" + Date.now()}) RETURNING id`) as any[];
  const [r] = (await sql`INSERT INTO reparations (client_id, trottinette_id, panne, date_depot, en_magasin, magasin) VALUES (${clientId}, ${t.id}, ${"Devis DV-" + String(d.id).padStart(4, "0") + (d.objet ? " : " + d.objet : "")}, CURRENT_DATE, false, ${d.magasin}) RETURNING id`) as any[];
  const ls = (await sql`SELECT * FROM devis_simples_lignes WHERE devis_id = ${d.id} ORDER BY id`) as any[];
  for (const l of ls) await sql`INSERT INTO devis_lignes (reparation_id, type, libelle, quantite, prix_unitaire_cents) VALUES (${r.id}, ${l.type}, ${l.libelle}, ${l.quantite}, ${l.prix_unitaire_cents})`;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${r.id}, 'statut', ${"Prise en charge créée à partir du devis DV-" + String(d.id).padStart(4, "0") + ", trottinette pas encore en magasin"})`;
  await sql`UPDATE devis_simples SET reparation_id = ${r.id}, client_id = ${clientId}, maj_le = now() WHERE id = ${d.id}`;
  return c.json({ reparationId: r.id, message: "Prise en charge créée avec les lignes du devis." });
});
