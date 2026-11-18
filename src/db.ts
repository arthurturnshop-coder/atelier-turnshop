export const sql = new Bun.SQL(Bun.env.DATABASE_URL ?? "");

await sql`CREATE TABLE IF NOT EXISTS clients (id SERIAL PRIMARY KEY, prenom TEXT NOT NULL DEFAULT '', nom TEXT NOT NULL, telephone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', shopify_id TEXT, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS trottinettes (id SERIAL PRIMARY KEY, client_id INT NOT NULL REFERENCES clients(id), marque TEXT NOT NULL, modele TEXT NOT NULL, serie TEXT NOT NULL, cree_le TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (client_id, serie))`;
await sql`CREATE TABLE IF NOT EXISTS reparations (id SERIAL PRIMARY KEY, client_id INT NOT NULL REFERENCES clients(id), trottinette_id INT NOT NULL REFERENCES trottinettes(id), statut TEXT NOT NULL DEFAULT 'reçu', panne TEXT NOT NULL, etat TEXT NOT NULL DEFAULT '', remarques TEXT NOT NULL DEFAULT '', date_depot DATE NOT NULL DEFAULT CURRENT_DATE, cree_le TIMESTAMPTZ NOT NULL DEFAULT now(), maj_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS journal (id SERIAL PRIMARY KEY, reparation_id INT NOT NULL REFERENCES reparations(id), date TIMESTAMPTZ NOT NULL DEFAULT now(), type TEXT NOT NULL, texte TEXT NOT NULL)`;
await sql`CREATE TABLE IF NOT EXISTS consignes (cle TEXT PRIMARY KEY, texte TEXT NOT NULL DEFAULT '', maj_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS avis_statut TEXT NOT NULL DEFAULT 'aucun'`;
await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS avis_envoi_le TIMESTAMPTZ`;
await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS technicien TEXT, ADD COLUMN IF NOT EXISTS debut TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS duree_min INT, ADD COLUMN IF NOT EXISTS magasin TEXT`;
await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS en_magasin BOOLEAN NOT NULL DEFAULT true`;
// Nouveautés v2 : commentaire interne, garantie, suppression douce.
await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS commentaire_interne TEXT NOT NULL DEFAULT ''`;
await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS sous_garantie BOOLEAN NOT NULL DEFAULT false`;
await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS supprime_le TIMESTAMPTZ`;
// Lignes de devis : type 'main_oeuvre' ou 'piece'.
await sql`CREATE TABLE IF NOT EXISTS devis_lignes (id SERIAL PRIMARY KEY, reparation_id INT NOT NULL REFERENCES reparations(id), type TEXT NOT NULL CHECK (type IN ('main_oeuvre','piece')), libelle TEXT NOT NULL, quantite INT NOT NULL DEFAULT 1, prix_unitaire_cents INT NOT NULL DEFAULT 0, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS shopify_variant_id TEXT`;
await sql`ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS sku TEXT`;
await sql`ALTER TABLE reparations ADD COLUMN IF NOT EXISTS piece_arrivee BOOLEAN NOT NULL DEFAULT false`;
await sql`CREATE TABLE IF NOT EXISTS fournisseurs (id SERIAL PRIMARY KEY, nom TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', actif BOOLEAN NOT NULL DEFAULT true)`;
await sql`CREATE TABLE IF NOT EXISTS commande_lignes (id SERIAL PRIMARY KEY, fournisseur_id INT NOT NULL REFERENCES fournisseurs(id), libelle TEXT NOT NULL, sku TEXT, variant_id TEXT, quantite INT NOT NULL DEFAULT 1, reparation_id INT REFERENCES reparations(id), devis_ligne_id INT, statut TEXT NOT NULL DEFAULT 'panier' CHECK (statut IN ('panier','commandee','recue')), cree_le TIMESTAMPTZ NOT NULL DEFAULT now(), commandee_le TIMESTAMPTZ, recue_le TIMESTAMPTZ)`;
await sql`CREATE TABLE IF NOT EXISTS reglages (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL)`;
// Caisse : ventes, lignes de vente, paiements, paramètres de fidélité.
await sql`CREATE TABLE IF NOT EXISTS ventes (id SERIAL PRIMARY KEY, client_id INT REFERENCES clients(id), reparation_id INT REFERENCES reparations(id), magasin TEXT, vendeur TEXT, total_cents INT NOT NULL DEFAULT 0, remise_cents INT NOT NULL DEFAULT 0, points_gagnes INT NOT NULL DEFAULT 0, points_utilises INT NOT NULL DEFAULT 0, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS vente_lignes (id SERIAL PRIMARY KEY, vente_id INT NOT NULL REFERENCES ventes(id), libelle TEXT NOT NULL, quantite INT NOT NULL DEFAULT 1, prix_unitaire_cents INT NOT NULL DEFAULT 0)`;
await sql`CREATE TABLE IF NOT EXISTS vente_paiements (id SERIAL PRIMARY KEY, vente_id INT NOT NULL REFERENCES ventes(id), moyen TEXT NOT NULL CHECK (moyen IN ('carte','especes','virement')), montant_cents INT NOT NULL)`;
await sql`ALTER TABLE ventes ADD COLUMN IF NOT EXISTS shopify_order_id TEXT`;
await sql`ALTER TABLE ventes ADD COLUMN IF NOT EXISTS shopify_order_name TEXT`;
await sql`ALTER TABLE ventes ADD COLUMN IF NOT EXISTS shopify_erreur TEXT`;
await sql`ALTER TABLE vente_lignes ADD COLUMN IF NOT EXISTS type TEXT`;
await sql`ALTER TABLE vente_lignes ADD COLUMN IF NOT EXISTS shopify_variant_id TEXT`;
await sql`ALTER TABLE vente_lignes ADD COLUMN IF NOT EXISTS sku TEXT`;
await sql`CREATE TABLE IF NOT EXISTS avantages (id SERIAL PRIMARY KEY, libelle TEXT NOT NULL, declencheur TEXT NOT NULL CHECK (declencheur IN ('cumul','achat','date')), seuil_cents INT NOT NULL DEFAULT 0, date_debut DATE, date_fin DATE, effet TEXT NOT NULL CHECK (effet IN ('cadeau','euros','pourcent')), valeur NUMERIC NOT NULL DEFAULT 0, actif BOOLEAN NOT NULL DEFAULT true, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS vente_avantages (id SERIAL PRIMARY KEY, vente_id INT NOT NULL REFERENCES ventes(id), avantage_id INT, libelle TEXT NOT NULL, effet TEXT NOT NULL, remise_cents INT NOT NULL DEFAULT 0)`;
await sql`CREATE TABLE IF NOT EXISTS parametres (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL DEFAULT '', maj_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`INSERT INTO parametres (cle, valeur) VALUES ('fidelite_euros_pour_palier', '100'), ('fidelite_remise_euros', '5') ON CONFLICT (cle) DO NOTHING`;
await sql`CREATE TABLE IF NOT EXISTS utilisateurs (id SERIAL PRIMARY KEY, prenom TEXT UNIQUE NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin', 'responsable', 'technicien')), magasins TEXT NOT NULL, mdp_hash TEXT NULL, actif BOOLEAN DEFAULT true)`;
await sql`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, utilisateur_id INT, magasin TEXT, cree_le TIMESTAMPTZ DEFAULT now())`;
export const PROFILS_INITIAUX: [string, string, string][] = [
  ["Arthur", "admin", "Amiens,Rouen"],
  ["Antoine", "admin", "Amiens,Rouen"],
  ["Nico", "responsable", "Amiens"],
  ["Liam", "responsable", "Rouen"],
  ["Jonathan", "technicien", "Rouen"],
];
for (const [prenom, role, magasins] of PROFILS_INITIAUX) {
  await sql`INSERT INTO utilisateurs (prenom, role, magasins) VALUES (${prenom}, ${role}, ${magasins}) ON CONFLICT (prenom) DO NOTHING`;
}
await sql`ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS barcode TEXT, ADD COLUMN IF NOT EXISTS marque TEXT`;
await sql`ALTER TABLE commande_lignes ADD COLUMN IF NOT EXISTS barcode TEXT`;
await sql`CREATE TABLE IF NOT EXISTS taches (id SERIAL PRIMARY KEY, texte TEXT NOT NULL, echeance DATE, epingle BOOLEAN NOT NULL DEFAULT false, priorite BOOLEAN NOT NULL DEFAULT false, fait BOOLEAN NOT NULL DEFAULT false, fait_le TIMESTAMPTZ, fait_par TEXT, cree_par TEXT, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS taches_rec (id SERIAL PRIMARY KEY, texte TEXT NOT NULL, unite TEXT NOT NULL DEFAULT 'jours' CHECK (unite IN ('jours','semaines','mois')), intervalle INT NOT NULL DEFAULT 1, jour_semaine INT NOT NULL DEFAULT 1, jour_mois INT NOT NULL DEFAULT 1, priorite BOOLEAN NOT NULL DEFAULT false, actif BOOLEAN NOT NULL DEFAULT true, prochaine DATE NOT NULL, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`ALTER TABLE taches ADD COLUMN IF NOT EXISTS recurrente_id INT`;
