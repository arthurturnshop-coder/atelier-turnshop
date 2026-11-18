import { app } from "../app";
import { sql } from "../db";
import { AppError, exigeAdmin } from "../util";

// ---------- Paramètres de fidélité (réglables, réservés aux admins pour l'écriture) ----------
// Règle de départ : 100 euros dépensés = 5 euros offerts. Les points sont comptés ici en euros dépensés.
export async function lireParametres() {
  const rows = (await sql`SELECT cle, valeur FROM parametres`) as any[];
  const m: Record<string, string> = {};
  for (const r of rows) m[r.cle] = r.valeur;
  const palier = Math.max(1, Number(m.fidelite_euros_pour_palier) || 100);
  const remise = Math.max(0, Number(m.fidelite_remise_euros) || 5);
  return { eurosPourPalier: palier, remiseEuros: remise };
}

app.get("/api/parametres", async (c) => c.json(await lireParametres()));

app.post("/api/parametres", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const palier = Number(String(b.eurosPourPalier ?? "").replace(",", "."));
  const remise = Number(String(b.remiseEuros ?? "").replace(",", "."));
  if (!(palier > 0) || !(remise >= 0)) throw new AppError(400, "Valeurs invalides.");
  await sql`INSERT INTO parametres (cle, valeur, maj_le) VALUES ('fidelite_euros_pour_palier', ${String(palier)}, now()) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, maj_le = now()`;
  await sql`INSERT INTO parametres (cle, valeur, maj_le) VALUES ('fidelite_remise_euros', ${String(remise)}, now()) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, maj_le = now()`;
  return c.json({ message: "Paramètres enregistrés." });
});

// Solde de fidélité d'un client côté caisse : euros dépensés cumulés (ventes de la caisse) moins euros déjà utilisés.
