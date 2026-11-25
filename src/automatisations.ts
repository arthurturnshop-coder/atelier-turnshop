import { sql } from "./db";
import { GARDE, infosGarde } from "./garde";
import { verifierPaiementsWeb } from "./routes/pub";
import { lireAuto, notifier } from "./brevo";
import { relancesDevis } from "./routes/devisenvoi";
import { infosTicket } from "./routes/ticket";
import { ANNIV_PRIX_CENTS } from "./config";

// Textes des messages envoyés aux clients.
const prenomDe = (p: string) => (p && p.trim() ? ` ${p.trim()}` : "");

export async function envoyerAvis(venteId: number) {
  const [v] = (await sql`SELECT v.id, v.client_id, v.magasin, v.reparation_id, c.prenom FROM ventes v JOIN clients c ON c.id = v.client_id WHERE v.id = ${venteId}`) as any[];
  if (!v) return;
  const { avisUrl } = await infosTicket(v.magasin ?? null);
  if (!avisUrl) return;
  const texte = `Bonjour${prenomDe(v.prenom)}, merci pour votre visite chez TURN Shop ! Votre avis nous aide beaucoup, et une récompense vous attend : ${avisUrl}`;
  const r = await notifier("avis", { clientId: v.client_id, venteId, reparationId: null, sujet: "Votre avis sur TURN Shop", texte });
  if (r && v.reparation_id) await sql`UPDATE reparations SET avis_statut = 'envoye', avis_envoi_le = NULL WHERE id = ${v.reparation_id}`;
}

async function repInfo(id: number) {
  const [r] = (await sql`SELECT r.id, r.client_id, r.magasin, r.debut, r.date_depot, c.prenom, t.marque, t.modele FROM reparations r JOIN clients c ON c.id = r.client_id JOIN trottinettes t ON t.id = r.trottinette_id WHERE r.id = ${id}`) as any[];
  return r;
}

export async function envoyerPieceArrivee(repId: number) {
  const r = await repInfo(repId);
  if (!r) return;
  const trott = `${r.marque} ${r.modele}`.trim();
  await notifier("piece", { clientId: r.client_id, reparationId: repId, sujet: "Votre pièce est arrivée - TURN Shop", texte: `Bonjour${prenomDe(r.prenom)}, la pièce pour votre ${trott} est arrivée. Nous poursuivons la réparation et nous vous prévenons dès qu'elle est prête. L'équipe TURN Shop` });
}

export async function envoyerCommandeArrivee(repId: number, libelles: string[]) {
  const r = await repInfo(repId);
  if (!r) return;
  const liste = libelles.slice(0, 5).join(", ");
  await notifier("cmdclient", { clientId: r.client_id, reparationId: repId, sujet: "Votre commande est arrivée - TURN Shop", texte: `Bonjour${prenomDe(r.prenom)}, votre commande (${liste}) est arrivée en boutique. Vous pouvez venir la récupérer quand vous voulez. L'équipe TURN Shop` });
}

export async function envoyerPret(repId: number) {
  const r = await repInfo(repId);
  if (!r) return;
  const trott = `${r.marque} ${r.modele}`.trim();
  await notifier("pret", { clientId: r.client_id, reparationId: repId, sujet: "Votre trottinette est prête - TURN Shop", texte: `Bonjour${prenomDe(r.prenom)}, votre ${trott} est prête ! Vous pouvez venir la récupérer à la boutique. L'équipe TURN Shop` });
}

// Tourne toutes les 10 minutes : rappels de rendez-vous (veille, entre 9 h et 19 h) et demandes d'avis programmées.
async function cycle() {
  try {
    const auto = await lireAuto();
    const [h] = (await sql`SELECT extract(hour FROM now() AT TIME ZONE 'Europe/Paris')::int AS h, to_char(((now() AT TIME ZONE 'Europe/Paris')::date + 1), 'YYYY-MM-DD') AS demain`) as any[];
    if (auto.rdv !== "off" && h.h >= 9 && h.h < 19) {
      const rows = (await sql`SELECT r.id, r.client_id, to_char(r.debut AT TIME ZONE 'Europe/Paris', 'HH24:MI') AS heure, c.prenom, t.marque, t.modele
        FROM reparations r JOIN clients c ON c.id = r.client_id JOIN trottinettes t ON t.id = r.trottinette_id
        WHERE r.supprime_le IS NULL AND r.en_magasin = false AND r.statut = 'reçu'
          AND COALESCE((r.debut AT TIME ZONE 'Europe/Paris')::date, r.date_depot) = ${h.demain}::date
          AND NOT EXISTS (SELECT 1 FROM messages_envoyes m WHERE m.type = 'rdv' AND m.reparation_id = r.id AND m.statut = 'envoye')`) as any[];
      for (const r of rows) {
        const trott = `${r.marque} ${r.modele}`.trim();
        await notifier("rdv", { clientId: r.client_id, reparationId: r.id, sujet: "Rappel de votre rendez-vous - TURN Shop", texte: `Bonjour${prenomDe(r.prenom)}, petit rappel : votre rendez-vous chez TURN Shop est demain${r.heure ? " à " + r.heure : ""} pour votre ${trott}. À demain !` });
      }
    }
    try { await verifierPaiementsWeb(); } catch { /* réessai au prochain cycle */ }
    try { await relancesDevis(); } catch (e) { console.error("relancesDevis", e); }
    // Demandes de RDV jamais payées : abandonnées après 48 h (elles n'ont jamais été visibles de l'atelier).
    try { await sql`UPDATE reparations SET rdv_statut = 'annule' WHERE rdv_statut = 'a_payer' AND cree_le < now() - interval '48 hours'`; } catch { /* sans gravité */ }
    // Gardiennage : trottinette prête mais pas récupérée.
    if (auto.garde !== "off" && h.h >= 9 && h.h < 19) {
      const prets = (await sql`SELECT r.id, r.client_id, r.pret_le, r.abandonnee_le, r.statut, c.prenom, t.marque, t.modele FROM reparations r JOIN clients c ON c.id = r.client_id JOIN trottinettes t ON t.id = r.trottinette_id WHERE r.statut = 'prêt' AND r.pret_le IS NOT NULL AND r.abandonnee_le IS NULL AND r.supprime_le IS NULL`) as any[];
      for (const r of prets) {
        const g = infosGarde(r.pret_le, r.statut, r.abandonnee_le);
        if (!g) continue;
        const trott = `${r.marque} ${r.modele}`.trim();
        const frais = (g.fraisCents / 100).toFixed(2).replace(".", ",");
        if (g.jours >= GARDE.abandonJour) {
          await sql`UPDATE reparations SET abandonnee_le = now(), maj_le = now() WHERE id = ${r.id}`;
          await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${r.id}, 'statut', ${"Trottinette considérée comme abandonnée (plus de " + GARDE.abandonJour + " jours en gardiennage)"})`;
          await sql`INSERT INTO taches (texte, echeance, priorite, cree_par, reparation_id) VALUES (${"Trottinette abandonnée : " + r.prenom + " (" + trott + ") PC-" + String(r.id).padStart(4, "0")}, (now() AT TIME ZONE 'Europe/Paris')::date, true, 'Gardiennage', ${r.id})`;
          await notifier("abandon", { clientId: r.client_id, reparationId: r.id, sujet: "Votre trottinette est considérée comme abandonnée - TURN Shop", texte: `Bonjour${prenomDe(r.prenom)}, votre ${trott} est en gardiennage depuis plus de ${GARDE.abandonJour} jours. Elle est désormais considérée comme abandonnée et aucun recours ne sera possible. L'équipe TURN Shop` });
        } else if (g.jours >= GARDE.rappelJour + 7) {
          await notifier("garde_hebdo", { clientId: r.client_id, reparationId: r.id, sujet: "Votre trottinette est en gardiennage - TURN Shop", texte: `Bonjour${prenomDe(r.prenom)}, votre ${trott} est prête depuis ${g.jours} jours et se trouve en gardiennage (frais actuels : ${frais} €, à raison de ${(GARDE.prixCents / 100).toFixed(0)} € par jour). Merci de venir la récupérer avant ${GARDE.abandonJour} jours : passé ce délai, elle sera considérée comme abandonnée et il n'y aura plus aucun recours. L'équipe TURN Shop` });
        } else if (g.jours >= GARDE.rappelJour) {
          await notifier("garde4", { clientId: r.client_id, reparationId: r.id, sujet: "Dernier jour pour récupérer votre trottinette - TURN Shop", texte: `Bonjour${prenomDe(r.prenom)}, votre ${trott} est prête depuis ${g.jours} jours. Il vous reste 1 jour pour venir la récupérer : ensuite, des frais de gardiennage de ${(GARDE.prixCents / 100).toFixed(0)} € par jour s'appliqueront. L'équipe TURN Shop` });
        }
      }
    }
    // Anniversaire du compte : email avec l'offre révision, le jour J (une fois par an et par client).
    if (auto.anniv !== "off" && h.h >= 9 && h.h < 19) {
      const prix = (ANNIV_PRIX_CENTS / 100).toFixed(2).replace(".", ",");
      const rows = (await sql`SELECT id, prenom FROM clients WHERE email <> '' AND cree_le <= now() - interval '360 days'
        AND to_char(cree_le AT TIME ZONE 'Europe/Paris', 'MM-DD') = to_char(now() AT TIME ZONE 'Europe/Paris', 'MM-DD')
        AND NOT EXISTS (SELECT 1 FROM messages_envoyes m WHERE m.type = 'anniv' AND m.client_id = clients.id AND m.cree_le > now() - interval '300 days') LIMIT 40`) as any[];
      for (const r of rows) await notifier("anniv", { clientId: r.id, sujet: "C'est l'anniversaire de votre carte TURN Shop : une offre pour vous", texte: `Bonjour${prenomDe(r.prenom)}, cela fait un an que vous êtes client TURN Shop, merci pour votre confiance ! Pour fêter ça, nous vous offrons la révision de votre trottinette à ${prix} € (au lieu du tarif habituel).\n\nPrésentez-vous en boutique ou prenez rendez-vous, et dites simplement que c'est l'anniversaire de votre carte. L'équipe TURN Shop` });
    }
    // Bons d'achat : valables 12 mois. Emails de prévenance 6 mois, 3 mois puis 1 mois avant l'expiration (un seul envoi par étape).
    if (auto.bonexp !== "off" && h.h >= 9 && h.h < 19) {
      const bons = (await sql`SELECT b.id, b.client_id, b.montant_cents, b.rappels, c.prenom,
          to_char((b.cree_le + interval '12 months') AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY') AS expire,
          CASE WHEN b.cree_le <= now() - interval '11 months' THEN 3 WHEN b.cree_le <= now() - interval '9 months' THEN 2 WHEN b.cree_le <= now() - interval '6 months' THEN 1 ELSE 0 END AS etape
        FROM bons_achat b JOIN clients c ON c.id = b.client_id
        WHERE b.montant_cents > 0 AND b.cree_le > now() - interval '12 months' AND c.email <> '' AND b.rappels < 3 AND b.cree_le <= now() - interval '6 months' LIMIT 40`) as any[];
      for (const b of bons) {
        if (b.etape <= b.rappels) continue;
        const { restants } = await (await import("./routes/caisse")).bonsRestants(b.client_id);
        const rest = restants.find((x) => x.id === b.id)?.restantCents ?? 0;
        if (rest <= 0) { await sql`UPDATE bons_achat SET rappels = 3 WHERE id = ${b.id}`; continue; }
        b.montant_cents = rest;
        const reste = b.etape === 1 ? "6 mois" : b.etape === 2 ? "3 mois" : "1 mois";
        const r = await notifier("bonexp", { clientId: b.client_id, sujet: `Votre bon d'achat TURN Shop expire dans ${reste}`, texte: `Bonjour${prenomDe(b.prenom)}, vous avez un bon d'achat de ${(b.montant_cents / 100).toFixed(2).replace(".", ",")} € chez TURN Shop. Il est valable jusqu'au ${b.expire}, soit dans ${reste}. Passez en boutique pour l'utiliser avant cette date, il sera déduit directement à l'encaissement.\n\nL'équipe TURN Shop` });
        if (r === "envoye") await sql`UPDATE bons_achat SET rappels = ${b.etape} WHERE id = ${b.id}`;
      }
    }
    // Commandes clients passées chez le fournisseur sans nouvelle depuis 7 jours : une tâche dans la to-do.
    const vieilles = (await sql`SELECT l.id, l.libelle, l.reparation_id, f.nom AS fournisseur, cl.prenom, cl.nom FROM commande_lignes l JOIN devis_lignes dl ON dl.id = l.devis_ligne_id AND dl.remise_client JOIN reparations r ON r.id = l.reparation_id JOIN clients cl ON cl.id = r.client_id LEFT JOIN fournisseurs f ON f.id = l.fournisseur_id WHERE l.statut = 'commandee' AND l.commandee_le < now() - interval '7 days'`) as any[];
    for (const v of vieilles) {
      const texte = `Commande client sans nouvelle depuis 7 jours : ${v.libelle} pour ${`${v.prenom} ${v.nom}`.trim()} (PC-${String(v.reparation_id).padStart(4, "0")}${v.fournisseur ? ", " + v.fournisseur : ""}) [CC${v.id}]`;
      const [dej] = await sql`SELECT id FROM taches WHERE texte = ${texte}`;
      if (!dej) await sql`INSERT INTO taches (texte, priorite, cree_par) VALUES (${texte}, true, 'Automatique')`;
    }
    if (auto.avis !== "off") {
      const rows = (await sql`SELECT r.id, r.client_id, r.magasin, c.prenom FROM reparations r JOIN clients c ON c.id = r.client_id WHERE r.avis_statut = 'programme' AND r.avis_envoi_le <= now() AND r.supprime_le IS NULL LIMIT 20`) as any[];
      for (const r of rows) {
        const { avisUrl } = await infosTicket(r.magasin ?? null);
        if (!avisUrl) continue;
        const ok = await notifier("avis", { clientId: r.client_id, reparationId: null, sujet: "Votre avis sur TURN Shop", texte: `Bonjour${prenomDe(r.prenom)}, merci pour votre visite chez TURN Shop ! Votre avis nous aide beaucoup, et une récompense vous attend : ${avisUrl}` });
        if (ok) await sql`UPDATE reparations SET avis_statut = 'envoye', avis_envoi_le = NULL WHERE id = ${r.id}`;
      }
    }
  } catch (e: any) {
    console.log(JSON.stringify({ event: "automatisations", message: String(e?.message ?? e).slice(0, 300) }));
  }
}
setInterval(cycle, 10 * 60 * 1000);
setTimeout(cycle, 30 * 1000);
