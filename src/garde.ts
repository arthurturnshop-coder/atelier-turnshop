// Règles de gardiennage : trottinette prête mais pas récupérée.
export const GARDE = { rappelJour: 4, franchiseJours: 5, prixCents: 500, abandonJour: 30 };

const jourParis = (d: Date | string) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

export function infosGarde(pretLe: any, statut: string, abandonneeLe: any) {
  if (statut !== "prêt" || !pretLe) return null;
  const a = Date.parse(jourParis(pretLe) + "T00:00:00Z"), b = Date.parse(jourParis(new Date()) + "T00:00:00Z");
  const jours = Math.max(0, Math.round((b - a) / 86400000));
  const joursFrais = Math.max(0, jours - GARDE.franchiseJours);
  return { jours, joursFrais, fraisCents: joursFrais * GARDE.prixCents, prixCents: GARDE.prixCents, abandonnee: !!abandonneeLe, abandonDans: Math.max(0, GARDE.abandonJour - jours) };
}
