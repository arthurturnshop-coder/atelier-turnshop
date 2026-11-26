import { app } from "../app";
import { sql } from "../db";
import { AppError, clean, exigeAdmin } from "../util";

// Un avantage = un cadeau ou une remise, déclenché par :
//  - cumul : le client a dépensé X € au total en caisse (une seule fois par client)
//  - achat : l'achat en cours atteint X €
//  - date  : valable entre deux dates (avec, si on veut, un achat minimum)
export type Avantage = {
  id: number; libelle: string; declencheur: "cumul" | "achat" | "date";
  seuilCents: number; dateDebut: string | null; dateFin: string | null;
  effet: "cadeau" | "euros" | "pourcent"; valeur: number; actif: boolean;
  portee: "tout" | "pieces"; clientRequis: boolean;
};

const AUJOURDHUI = sql`(now() AT TIME ZONE 'Europe/Paris')::date`;

function versAvantage(r: any): Avantage {
  return {
    id: r.id, libelle: r.libelle, declencheur: r.declencheur, seuilCents: r.seuil_cents,
    dateDebut: r.date_debut ?? null, dateFin: r.date_fin ?? null,
    effet: r.effet, valeur: Number(r.valeur), actif: r.actif === true,
    portee: r.portee === "pieces" ? "pieces" : "tout", clientRequis: r.client_requis === true,
  };
}

// Avantages actifs et valables aujourd'hui (utilisés par la caisse).
export async function avantagesActifs(): Promise<Avantage[]> {
  const rows = (await sql`SELECT id, libelle, declencheur, seuil_cents, to_char(date_debut, 'YYYY-MM-DD') AS date_debut, to_char(date_fin, 'YYYY-MM-DD') AS date_fin, effet, valeur, actif, portee, client_requis
    FROM avantages
    WHERE actif = true
      AND (date_debut IS NULL OR date_debut <= (now() AT TIME ZONE 'Europe/Paris')::date)
      AND (date_fin IS NULL OR date_fin >= (now() AT TIME ZONE 'Europe/Paris')::date)
    ORDER BY id`) as any[];
  return rows.map(versAvantage);
}

// Ce qu'on sait d'un client : total dépensé en caisse et avantages "cumul" déjà reçus.
export async function contexteClient(clientId: number) {
  const [dep] = (await sql`SELECT COALESCE(sum(total_cents + acompte_deduit_cents), 0)::int AS n FROM ventes WHERE client_id = ${clientId} AND type = 'vente'`) as any[];
  const recus = (await sql`SELECT DISTINCT va.avantage_id FROM vente_avantages va JOIN ventes v ON v.id = va.vente_id WHERE v.client_id = ${clientId} AND va.avantage_id IS NOT NULL`) as any[];
  return { depenseCents: dep.n as number, recus: recus.map((r) => r.avantage_id as number) };
}

export function estApplicable(a: Avantage, brutCents: number, ctx: { depenseCents: number; recus: number[] } | null, baseCents: number = brutCents, clientId: number | null = null): boolean {
  if (a.clientRequis && !(clientId && clientId > 0)) return false;
  if (a.portee === "pieces" && baseCents <= 0) return false;
  if (a.declencheur === "cumul") return !!ctx && !ctx.recus.includes(a.id) && ctx.depenseCents + brutCents >= a.seuilCents;
  return brutCents >= a.seuilCents;
}

export function remiseDe(a: Avantage, brutCents: number, baseCents: number = brutCents): number {
  if (a.portee === "pieces") brutCents = baseCents;
  if (a.effet === "euros") return Math.round(a.valeur * 100);
  if (a.effet === "pourcent") return Math.round((brutCents * a.valeur) / 100);
  return 0;
}

app.get("/api/caisse/avantages", async (c) => c.json(await avantagesActifs()));

// ---------- Réglages (admins) ----------
app.get("/api/avantages", async (c) => {
  exigeAdmin(c);
  const rows = (await sql`SELECT id, libelle, declencheur, seuil_cents, to_char(date_debut, 'YYYY-MM-DD') AS date_debut, to_char(date_fin, 'YYYY-MM-DD') AS date_fin, effet, valeur, actif, portee, client_requis FROM avantages ORDER BY id`) as any[];
  return c.json(rows.map(versAvantage));
});

const dateOk = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const nombre = (v: unknown) => Number(String(v ?? "").replace(",", "."));

app.post("/api/avantages", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const libelle = clean(b.libelle, 120);
  if (!libelle) throw new AppError(400, "Donne un nom à l'avantage (ex : Casque offert).");
  const declencheur = String(b.declencheur ?? "");
  if (!["cumul", "achat", "date"].includes(declencheur)) throw new AppError(400, "Déclencheur inconnu.");
  const effet = String(b.effet ?? "");
  if (!["cadeau", "euros", "pourcent"].includes(effet)) throw new AppError(400, "Type d'avantage inconnu.");

  const seuil = b.seuil === "" || b.seuil == null ? 0 : nombre(b.seuil);
  if (!(seuil >= 0)) throw new AppError(400, "Montant invalide.");
  const seuilCents = Math.round(seuil * 100);
  if ((declencheur === "cumul" || declencheur === "achat") && seuilCents <= 0) throw new AppError(400, "Indique le montant à partir duquel l'avantage s'applique.");

  const debut = clean(b.dateDebut, 10) || null, fin = clean(b.dateFin, 10) || null;
  if ((debut && !dateOk(debut)) || (fin && !dateOk(fin))) throw new AppError(400, "Date invalide.");
  if (declencheur === "date" && (!debut || !fin)) throw new AppError(400, "Une offre sur une période a besoin d'une date de début et d'une date de fin.");
  if (debut && fin && fin < debut) throw new AppError(400, "La date de fin est avant la date de début.");

  let valeur = 0;
  if (effet !== "cadeau") {
    valeur = nombre(b.valeur);
    if (!(valeur > 0)) throw new AppError(400, "Indique la valeur de la remise.");
    if (effet === "pourcent" && valeur > 100) throw new AppError(400, "Une remise ne peut pas dépasser 100 %.");
  }
  await sql`INSERT INTO avantages (libelle, declencheur, seuil_cents, date_debut, date_fin, effet, valeur) VALUES (${libelle}, ${declencheur}, ${seuilCents}, ${debut}, ${fin}, ${effet}, ${valeur})`;
  await sql`UPDATE avantages SET portee = ${b.portee === "pieces" ? "pieces" : "tout"}, client_requis = ${b.clientRequis === true} WHERE id = (SELECT max(id) FROM avantages)`;
  return c.json({ message: "Avantage ajouté." });
});

app.post("/api/avantages/etat", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const [a] = await sql`SELECT id FROM avantages WHERE id = ${id}`;
  if (!a) throw new AppError(404, "Avantage introuvable.");
  await sql`UPDATE avantages SET actif = ${b.actif === true} WHERE id = ${id}`;
  return c.json({ message: b.actif === true ? "Avantage réactivé." : "Avantage désactivé." });
});

app.post("/api/avantages/supprimer", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.id);
  const [a] = await sql`SELECT id FROM avantages WHERE id = ${id}`;
  if (!a) throw new AppError(404, "Avantage introuvable.");
  await sql`DELETE FROM avantages WHERE id = ${id}`;
  return c.json({ message: "Avantage supprimé (les ventes passées gardent leur historique)." });
});

// Offre Black Friday 2026 : -20 % sur pièces détachées et accessoires pour les clients avec la carte du magasin (jusqu'au samedi 28/11).
{
  const [dej] = (await sql`SELECT 1 FROM reglages WHERE cle = 'seed_black_friday_2026'`) as any[];
  if (!dej) {
    await sql`INSERT INTO avantages (libelle, declencheur, seuil_cents, date_debut, date_fin, effet, valeur, portee, client_requis) VALUES ('Black Friday : -20 % pièces et accessoires (carte du magasin)', 'date', 0, '2026-11-26', '2026-11-28', 'pourcent', 20, 'pieces', true)`;
    await sql`INSERT INTO reglages (cle, valeur) VALUES ('seed_black_friday_2026', '1') ON CONFLICT (cle) DO NOTHING`;
  }
}
