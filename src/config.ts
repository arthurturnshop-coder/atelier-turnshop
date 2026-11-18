export const PASSWORD = Bun.env.ATELIER_PASSWORD ?? "";
export const SYNC = (Bun.env.SHOPIFY_SYNC ?? "false") === "true";
export const STATUTS = ["reçu", "diagnostic", "devis envoyé", "en attente de pièce", "en réparation", "prêt", "récupéré"];
export const MAGASINS = ["Amiens", "Rouen"];
export const ESSAIS_MAX = 5;
export const BLOCAGE_MS = 5 * 60_000;
export const CONSIGNES = ["upsell", "offre", "fidelite", "autre"];
export const AVIS_DELAI_HEURES = 24;
