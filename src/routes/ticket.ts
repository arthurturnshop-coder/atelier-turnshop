import QRCode from "qrcode";
import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { clean, exigeAdmin } from "../util";

const ENTETE_DEFAUT = "TURN SOCIETY\nSIRET 912 779 352 00026";
const COORD_AMIENS = "6 rue de la 2e DB, Amiens";
const COORD_ROUEN = "5 bis rue d'Harcourt, 76000 Rouen";
const RDV_DEFAUT = "https://turnshop.fr/pages/prendre-rendez-vous";
const CLES = ["ticket_entete", "avis_url_Amiens", "avis_url_Rouen", "rdv_url", "coord_Amiens", "coord_Rouen"];

export async function lireTicket() {
  const rows = (await sql`SELECT cle, valeur FROM reglages WHERE cle = ANY(${CLES})`) as any[];
  const m: Record<string, string> = {};
  for (const r of rows) m[r.cle] = r.valeur;
  return { entete: m.ticket_entete ?? ENTETE_DEFAUT, avisAmiens: m.avis_url_Amiens ?? "", avisRouen: m.avis_url_Rouen ?? "", rdvUrl: m.rdv_url ?? RDV_DEFAUT, coordAmiens: m.coord_Amiens ?? COORD_AMIENS, coordRouen: m.coord_Rouen ?? COORD_ROUEN };
}

// Infos pour le ticket d'une vente : en-tête, lien d'avis de la boutique et QR code (SVG).
export async function infosTicket(magasin: string | null) {
  const t = await lireTicket();
  const url = (magasin === "Rouen" ? t.avisRouen : magasin === "Amiens" ? t.avisAmiens : t.avisAmiens || t.avisRouen) || "";
  let qrSvg = "";
  if (url) qrSvg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  return { entete: t.entete, avisUrl: url, qrSvg };
}

// Coordonnees et QR "prendre rendez-vous" pour les devis (lisible par toute l'equipe).
app.get("/api/ticket/rdv", async (c) => {
  const t = await lireTicket();
  const qrSvg = t.rdvUrl ? await QRCode.toString(t.rdvUrl, { type: "svg", margin: 0, errorCorrectionLevel: "M" }) : "";
  return c.json({ rdvUrl: t.rdvUrl, qrSvg, coordAmiens: t.coordAmiens, coordRouen: t.coordRouen });
});
app.get("/api/reglages/ticket", async (c) => { exigeAdmin(c); return c.json(await lireTicket()); });
app.post("/api/reglages/ticket", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  const valeurs: Record<string, string> = {
    ticket_entete: clean(b.entete, 400) || ENTETE_DEFAUT,
    avis_url_Amiens: clean(b.avisAmiens, 500),
    avis_url_Rouen: clean(b.avisRouen, 500),
    rdv_url: clean(b.rdvUrl, 500),
    coord_Amiens: clean(b.coordAmiens, 300),
    coord_Rouen: clean(b.coordRouen, 300),
  };
  for (const [k, v] of Object.entries(valeurs)) {
    if ((k.startsWith("avis_url") || k === "rdv_url") && v && !/^https?:\/\//i.test(v)) return c.json({ error: "Les liens doivent commencer par https://" }, 400);
  }
  for (const [k, v] of Object.entries(valeurs)) {
    await sql`INSERT INTO reglages (cle, valeur) VALUES (${k}, ${v}) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`;
  }
  return c.json({ message: "Ticket enregistré." });
});
