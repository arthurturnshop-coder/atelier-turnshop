import { timingSafeEqual } from "node:crypto";


export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const clean = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
export const magasinsDe = (u: { magasins: string }) => u.magasins.split(",").map((m) => m.trim());

export function samePassword(a: string, b: string): boolean {
  const ha = new Bun.CryptoHasher("sha256").update(a).digest();
  const hb = new Bun.CryptoHasher("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function signature(c: any): string {
  const u = c.get("user");
  return u && !u.secours ? ` — par ${u.prenom}${u.magasin ? ` (${u.magasin})` : ""}` : "";
}

// Admins et responsables seulement (supprimer, paramètres, remises).
export function exigeResponsable(c: any) {
  const u = c.get("user");
  if (!u || !(u.secours || u.role === "admin" || u.role === "responsable")) throw new AppError(403, "Réservé aux responsables.");
}
export function exigeAdmin(c: any) {
  const u = c.get("user");
  if (!u || !(u.secours || u.role === "admin")) throw new AppError(403, "Réservé aux administrateurs.");
}

// Magasin de la session (null = profil Secours : voit tout). Les lignes sans magasin (anciennes) restent visibles des deux côtés.
export const magDe = (c: any): string | null => c.get("user")?.magasin ?? null;
