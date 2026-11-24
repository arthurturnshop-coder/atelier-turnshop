import { app } from "../app";
import { sql } from "../db";
import { AppError, clean, exigeResponsable } from "../util";

// ---------- Espace process et bonnes pratiques : pages lisibles par toute l'équipe, modifiables par admin/responsable ----------
await sql`CREATE TABLE IF NOT EXISTS process_pages (id SERIAL PRIMARY KEY, titre TEXT NOT NULL, categorie TEXT NOT NULL DEFAULT 'Général', contenu TEXT NOT NULL DEFAULT '', ordre INT NOT NULL DEFAULT 100, maj_le TIMESTAMPTZ NOT NULL DEFAULT now(), maj_par TEXT)`;

const DEPART: [string, string, string, string][] = [
  ["Ouverture du magasin", "Ouverture et clôture", "# Avant d'ouvrir\n- [ ] Allumer les postes, l'imprimante à tickets et le TPE\n- [ ] Ouvrir la caisse dans le logiciel (Dashboard > Caisse)\n- [ ] Lire les consignes du jour et la to-do du Dashboard\n- [ ] Regarder le planning du jour : qui répare quoi, les rendez-vous, les chantiers en retard\n- [ ] Vérifier les colis et pièces arrivés (onglet Commandes)\n# Ambiance\n- [ ] Magasin rangé, vitrine propre, trottinettes de démo chargées", ""],
  ["Fermeture et clôture de caisse", "Ouverture et clôture", "# Clôture\n- [ ] Terminer les encaissements en cours\n- [ ] Compter les espèces et faire la clôture dans le logiciel (ticket Z)\n- [ ] Vérifier que les écarts sont expliqués\n- [ ] Mettre les espèces à déposer de côté pour la banque\n# Magasin\n- [ ] Cocher la to-do récurrente de fin de journée\n- [ ] Mettre les trottinettes de clients en sécurité, brancher les chargeurs prévus\n- [ ] Éteindre, fermer à clé\nLa caisse de la veille doit être fermée avant de pouvoir vendre le lendemain.", ""],
  ["Prendre en charge une trottinette", "Atelier", "# Réception\n1. Chercher le client (nom, téléphone, email). S'il n'existe pas, le créer.\n2. Créer la prise en charge : panne décrite avec les mots du client, état de la trottinette, remarques (rayures, accessoires laissés).\n3. Le numéro de série n'est pas obligatoire à la prise en charge.\n4. Dire au client le délai annoncé et qu'il recevra un devis avant toute dépense.\n# Ensuite\n- Planifier la réparation dans le planning (glisser la carte, elle se programme à ton nom).\n- Ranger la trottinette à l'emplacement prévu et noter le numéro de prise en charge dessus.", ""],
  ["Faire un devis", "Atelier", "# Construire le devis\n- Ajouter d'abord les prestations (main-d'œuvre), puis les produits dessous.\n- Chercher les pièces par nom ou code-barres. Si la pièce n'est pas en stock, la commander depuis le devis.\n- Utiliser les remises prévues (plusieurs prestations, offres) plutôt que d'inventer un prix.\n# Envoi\n- Envoyer le devis par email : le client peut le voir et l'accepter en ligne.\n- Ne pas démarrer une réparation chère sans accord du client.\n# Rendez-vous manqué\n- Si le client ne vient pas à son rendez-vous, 5 € sont facturés (blocage du créneau).", ""],
  ["Planifier et suivre une réparation", "Atelier", "- Les cartes non planifiées se glissent dans le planning : elles prennent ton nom par défaut, tu peux changer de technicien en les déplaçant dans sa colonne.\n- Les chantiers en retard apparaissent à gauche : les replanifier le jour même.\n- Mettre le statut à jour au fil de l'eau (en cours, en attente de pièce, prêt).\n- Pièce arrivée : la réparation reprend, le client est prévenu si l'envoi automatique est activé.\n- Quand c'est terminé, passer en « prêt » : le client est prévenu et le gardiennage commence à compter.", ""],
  ["Remettre la trottinette et facturer", "Atelier", "1. Vérifier que le devis est à jour (tout ce qui a été fait est dessus).\n2. Facturer depuis la prise en charge : les lignes arrivent dans le panier de la caisse.\n3. Encaisser (voir « Encaisser une vente »).\n4. Essayer la trottinette avec le client, expliquer ce qui a été fait.\n5. Passer la réparation en « récupéré ».\n# Gardiennage\n- Passé le délai de gardiennage, le client est relancé si l'envoi automatique est activé. Dans l'espace client, le gardiennage s'affiche en rouge : venir la chercher au plus vite.", ""],
  ["Vendre une trottinette", "Caisse et ventes", "# Règles à ne jamais oublier\n- Le numéro de série est obligatoire à la vente d'une trottinette (caisse comme devis) : il sert à la garantie.\n- Le client doit être choisi : la garantie est liée à son compte.\n- Vérifier le numéro de série directement sur le cadre, ne pas le recopier d'une boîte.\n# Étapes\n1. Scanner la carte du client ou le chercher.\n2. Ajouter la trottinette et les accessoires.\n3. Saisir le numéro de série dans « Enregistrer un véhicule ».\n4. Encaisser.", ""],
  ["Encaisser une vente", "Caisse et ventes", "1. Identifier le client (carte, email ou téléphone) pour la fidélité : 100 € dépensés = 5 € offerts.\n2. Vérifier les offres et cadeaux proposés par la caisse.\n3. Choisir le moyen de paiement (boutons « Tout en carte / espèces / virement » ou montants séparés).\n4. Celui qui encaisse tape SON mot de passe dans le champ au-dessus du bouton Encaisser : la vente est enregistrée à son nom.\n5. Remettre le ticket ou l'envoyer par email.\n# À ne pas faire\n- Ne jamais encaisser avec le mot de passe d'un collègue.\n- Ne jamais mettre une vente sur un autre moyen de paiement que celui réellement utilisé.", ""],
  ["Garantie et SAV", "Clients et service", "# Retrouver vite la garantie\n- Rechercher le numéro de série dans la recherche : on voit le propriétaire, la date de vente et la facture.\n- Le numéro figure aussi sur la fiche client et sur le ticket Z du jour de la vente.\n# Traiter\n1. Vérifier que la panne est couverte (date de vente, type de panne).\n2. Faire la prise en charge et préciser dans la panne que c'est une garantie.\n3. Si le fournisseur doit intervenir, cliquer « Demande faite au fournisseur » : une relance revient dans la to-do.\n# Changement de propriétaire\n- Si un client récupère la trottinette d'un autre, la transférer sur son compte (fiche de la trottinette > transférer).", ""],
  ["Avis Google et fidélisation", "Clients et service", "- Demander un avis Google aux clients satisfaits : le QR code est au bas du ticket de caisse.\n- L'envoi automatique d'une demande d'avis après encaissement peut être activé dans Paramètres.\n- Proposer systématiquement la carte de fidélité : un client identifié, c'est de la fidélité gagnée.\n- Répondre aux avis, bons ou mauvais, avec courtoisie, dans les 48 h.", ""],
  ["Bonnes pratiques de l'équipe", "Général", "- Accueillir le client dans les 30 secondes, même si on est occupé : un « bonjour, je suis à vous dans 2 minutes » suffit.\n- Chaque mot de passe est personnel et ne se prête pas.\n- Écrire dans le chat interne plutôt que dans des groupes perso : tout le monde voit l'info.\n- Un doute sur un prix, une garantie ou une remise : demander au responsable avant de promettre.\n- Un bug ou une idée pour le logiciel : l'ampoule 💡 en haut, c'est fait pour ça.\n- Atelier propre en fin de journée : outils rangés, pièces étiquetées, déchets triés.", ""],
];
const [{ n }] = (await sql`SELECT count(*)::int AS n FROM process_pages`) as any[];
if (!n) { let o = 10; for (const [t, c, ct] of DEPART) await sql`INSERT INTO process_pages (titre, categorie, contenu, ordre, maj_par) VALUES (${t}, ${c}, ${ct}, ${o += 10}, 'Départ')`; }

app.get("/api/process", async (c) => {
  const rows = (await sql`SELECT id, titre, categorie, contenu, ordre, maj_le, maj_par FROM process_pages ORDER BY ordre, id`) as any[];
  return c.json(rows.map((r) => ({ id: r.id, titre: r.titre, categorie: r.categorie, contenu: r.contenu, majLe: r.maj_le, majPar: r.maj_par })));
});

app.post("/api/process/enregistrer", async (c) => {
  exigeResponsable(c);
  const b = await c.req.json().catch(() => ({}));
  const titre = clean(b.titre, 120), categorie = clean(b.categorie, 60) || "Général", contenu = String(b.contenu ?? "").slice(0, 20000);
  if (!titre) throw new AppError(400, "Donne un titre.");
  const u = c.get("user") as any;
  if (Number(b.id) > 0) {
    const [r] = (await sql`UPDATE process_pages SET titre = ${titre}, categorie = ${categorie}, contenu = ${contenu}, maj_le = now(), maj_par = ${u.prenom} WHERE id = ${Number(b.id)} RETURNING id`) as any[];
    if (!r) throw new AppError(404, "Page introuvable.");
    return c.json({ id: r.id, message: "Page enregistrée." });
  }
  const [{ m }] = (await sql`SELECT COALESCE(max(ordre), 0)::int AS m FROM process_pages`) as any[];
  const [r] = (await sql`INSERT INTO process_pages (titre, categorie, contenu, ordre, maj_par) VALUES (${titre}, ${categorie}, ${contenu}, ${m + 10}, ${u.prenom}) RETURNING id`) as any[];
  return c.json({ id: r.id, message: "Page créée." });
});

app.post("/api/process/supprimer", async (c) => {
  exigeResponsable(c);
  const b = await c.req.json().catch(() => ({}));
  await sql`DELETE FROM process_pages WHERE id = ${Number(b.id)}`;
  return c.json({ message: "Page supprimée." });
});
