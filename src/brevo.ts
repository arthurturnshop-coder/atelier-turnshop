import { sql } from "./db";

// Envois automatiques d'emails et de SMS via Brevo (https://developers.brevo.com).
// Variables Railway : BREVO_API_KEY (obligatoire), BREVO_EMAIL_EXPEDITEUR (adresse validée dans Brevo), BREVO_SMS_EXPEDITEUR (11 caractères max, défaut TURNSHOP).
const API = () => Bun.env.BREVO_API_URL || "https://api.brevo.com/v3";
export const brevoConfigure = () => !!Bun.env.BREVO_API_KEY;

await sql`CREATE TABLE IF NOT EXISTS messages_envoyes (id SERIAL PRIMARY KEY, type TEXT NOT NULL, canal TEXT NOT NULL, client_id INT, reparation_id INT, vente_id INT, destinataire TEXT NOT NULL DEFAULT '', statut TEXT NOT NULL, erreur TEXT, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`;

export type Quand = "avis" | "rdv" | "piece" | "pret" | "garde" | "anniv" | "bonexp";
export const QUAND: Quand[] = ["avis", "rdv", "piece", "pret", "garde", "anniv", "bonexp"];
// Types de messages : les trois emails de gardiennage dépendent du même réglage « garde ».
export type MsgType = Quand | "garde4" | "garde_hebdo" | "abandon" | "cmdclient" | "cmdrappel3" | "cmdrappel6";
const REGLAGE = (t: MsgType): Quand => (t === "garde4" || t === "garde_hebdo" || t === "abandon" ? "garde" : t === "cmdclient" || t === "cmdrappel3" || t === "cmdrappel6" ? "piece" : t);
export type Canal = "off" | "email" | "sms" | "both";

export async function lireAuto(): Promise<Record<Quand, Canal>> {
  const rows = (await sql`SELECT cle, valeur FROM reglages WHERE cle LIKE 'brevo_%'`) as any[];
  const m: Record<string, string> = {};
  for (const r of rows) m[r.cle] = r.valeur;
  const out: any = {};
  for (const q of QUAND) out[q] = ["email", "sms", "both"].includes(m["brevo_" + q]) ? "email" : "off"; // SMS désactivés pour l'instant : tout réglage actif = email
  return out;
}

// 06 12 34 56 78 / +33 6... -> 33612345678 (format attendu par Brevo)
export function numeroSms(t: string) {
  let d = String(t ?? "").replace(/\D/g, "");
  if (d.startsWith("0033")) d = d.slice(2);
  else if (d.startsWith("0") && d.length === 10) d = "33" + d.slice(1);
  return d.length >= 11 ? d : "";
}

async function appel(chemin: string, corps: any): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(API() + chemin, { method: "POST", headers: { "api-key": Bun.env.BREVO_API_KEY ?? "", "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(corps), signal: ctl.signal });
    const txt = await r.text();
    if (!r.ok) throw new Error(`Brevo ${r.status} : ${txt.slice(0, 200)}`);
    return txt.slice(0, 200);
  } finally { clearTimeout(t); }
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LIBELLE_BOUTON = (u: string) => (/\/pub\/devis\//.test(u) ? "Voir et accepter mon devis" : /\/pub\/facture\//.test(u) ? "Voir ma facture" : /g\.page|google\.|maps/i.test(u) ? "Laisser mon avis" : "Ouvrir");

// Habillage commun de tous les emails : bandeau vert, texte lisible, liens importants en gros bouton.
export function emailHtml(texte: string): string {
  const liens: string[] = [];
  const corps = texte.split(/\n{2,}/).map((para) => {
    const seul = para.trim().match(/^https?:\/\/\S+$/);
    if (seul) { liens.push(seul[0]); return `<div style="text-align:center;margin:22px 0"><a href="${esc(seul[0])}" style="background:#1c5a34;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 26px;border-radius:10px;display:inline-block">${LIBELLE_BOUTON(seul[0])}</a></div>`; }
    // Phrase qui se termine par « : https://… » : on garde la phrase, et le lien devient un bouton.
    const fin = para.match(/^([\s\S]*?)\s*(https?:\/\/\S+)\s*$/);
    if (fin && /:\s*$/.test(fin[1])) {
      liens.push(fin[2]);
      return `<p style="margin:0 0 6px;line-height:1.55">${esc(fin[1].replace(/\s*:\s*$/, "")).replace(/\n/g, "<br>")}</p><div style="text-align:center;margin:18px 0 22px"><a href="${esc(fin[2])}" style="background:#1c5a34;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 26px;border-radius:10px;display:inline-block">${LIBELLE_BOUTON(fin[2])}</a></div>`;
    }
    const lie = esc(para).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1c5a34;font-weight:600">$1</a>').replace(/\n/g, "<br>");
    return `<p style="margin:0 0 14px;line-height:1.55">${lie}</p>`;
  }).join("");
  const secours = liens.length ? `<p style="margin:22px 0 0;font-size:12px;color:#888;line-height:1.4">Le bouton ne s'ouvre pas ? Copie ce lien dans ton navigateur :<br><span style="word-break:break-all">${esc(liens[0])}</span></p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f4f2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 10px"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden"><tr><td style="background:#1c5a34;padding:22px 28px;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:1px">TURN Shop</td></tr><tr><td style="padding:28px 28px 24px;font-size:15px">${corps}${secours}</td></tr><tr><td style="padding:16px 28px 22px;border-top:1px solid #eee;font-size:12px;color:#888;line-height:1.5">TURN SOCIETY · Boutiques Amiens et Rouen · turnshop.fr</td></tr></table></td></tr></table></body></html>`;
}

export async function envoiEmail(a: string, sujet: string, texte: string, pieces?: { name: string; content: string }[]): Promise<string> {
  const exp = Bun.env.BREVO_EMAIL_EXPEDITEUR;
  if (!exp) throw new Error("BREVO_EMAIL_EXPEDITEUR manquant (adresse expéditeur validée dans Brevo).");
  return await appel("/smtp/email", { sender: { name: "TURN Shop", email: exp }, to: [{ email: a }], subject: sujet, htmlContent: emailHtml(texte), textContent: texte, ...(pieces?.length ? { attachment: pieces } : {}) });
}

export async function envoiSms(num: string, texte: string) {
  await appel("/transactionalSMS/sms", { sender: (Bun.env.BREVO_SMS_EXPEDITEUR || "TURNSHOP").slice(0, 11), recipient: num, content: texte, type: "transactional" });
}

type Ctx = { clientId: number | null; reparationId?: number | null; venteId?: number | null; sujet: string; texte: string };

// Envoie selon le réglage (email, SMS ou les deux). Ne lève jamais d'erreur : tout est journalisé.
export async function notifier(quand: MsgType, c: Ctx): Promise<string> {
  try {
    if (!brevoConfigure() || !c.clientId) return "";
    const canal = (await lireAuto())[REGLAGE(quand)];
    if (canal === "off") return "";
    const [cl] = (await sql`SELECT email, telephone FROM clients WHERE id = ${c.clientId}`) as any[];
    if (!cl) return "";
    // Jamais deux fois le même message pour la même réparation ou vente (et un avis par client au maximum tous les 30 jours).
    if (quand === "avis") {
      const [d] = (await sql`SELECT id FROM messages_envoyes WHERE type = 'avis' AND client_id = ${c.clientId} AND statut = 'envoye' AND cree_le > now() - interval '30 days' LIMIT 1`) as any[];
      if (d) return "";
    } else if (quand === "anniv") {
      const [d] = (await sql`SELECT id FROM messages_envoyes WHERE type = 'anniv' AND client_id = ${c.clientId} AND statut = 'envoye' AND cree_le > now() - interval '300 days' LIMIT 1`) as any[];
      if (d) return "";
    } else if (quand === "garde_hebdo" && c.reparationId) {
      const [d] = (await sql`SELECT id FROM messages_envoyes WHERE type = 'garde_hebdo' AND reparation_id = ${c.reparationId} AND statut = 'envoye' AND cree_le > now() - interval '6 days' LIMIT 1`) as any[];
      if (d) return "";
    } else if (c.reparationId) {
      const [d] = (await sql`SELECT id FROM messages_envoyes WHERE type = ${quand} AND reparation_id = ${c.reparationId} AND statut = 'envoye' LIMIT 1`) as any[];
      if (d) return "";
    }
    const envois: [string, string, () => Promise<unknown>][] = [];
    const mail = String(cl.email ?? "").trim();
    const sms = numeroSms(cl.telephone); // inutilisé tant que les SMS sont désactivés (lireAuto ne renvoie que off ou email)
    if ((canal === "email" || canal === "both") && mail) envois.push(["email", mail, () => envoiEmail(mail, c.sujet, c.texte)]);
    if ((canal === "sms" || canal === "both") && sms) envois.push(["sms", sms, () => envoiSms(sms, c.texte)]);
    let ok = false;
    for (const [type, dest, f] of envois) {
      try {
        await f();
        ok = true;
        await sql`INSERT INTO messages_envoyes (type, canal, client_id, reparation_id, vente_id, destinataire, statut) VALUES (${quand}, ${type}, ${c.clientId}, ${c.reparationId ?? null}, ${c.venteId ?? null}, ${dest}, 'envoye')`;
      } catch (e: any) {
        await sql`INSERT INTO messages_envoyes (type, canal, client_id, reparation_id, vente_id, destinataire, statut, erreur) VALUES (${quand}, ${type}, ${c.clientId}, ${c.reparationId ?? null}, ${c.venteId ?? null}, ${dest}, 'erreur', ${String(e?.message ?? e).slice(0, 300)})`;
      }
    }
    return ok ? "envoye" : "";
  } catch (e: any) {
    console.log(JSON.stringify({ event: "brevo", message: String(e?.message ?? e).slice(0, 300) }));
    return "";
  }
}
