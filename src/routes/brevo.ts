import { app } from "../app";
import { sql } from "../db";
// Doit passer après la protection /api/* (voir auth.ts).
import "./auth";
import { brevoConfigure, envoiEmail, envoiSms, lireAuto, numeroSms, QUAND } from "../brevo";
import { AppError, clean, exigeAdmin } from "../util";

app.get("/api/brevo", async (c) => {
  exigeAdmin(c);
  const messages = (await sql`SELECT m.type, m.canal, m.destinataire, m.statut, m.erreur, m.cree_le, trim(c.prenom || ' ' || c.nom) AS client FROM messages_envoyes m LEFT JOIN clients c ON c.id = m.client_id ORDER BY m.id DESC LIMIT 15`) as any[];
  return c.json({ configure: brevoConfigure(), expediteurEmail: !!Bun.env.BREVO_EMAIL_EXPEDITEUR, auto: await lireAuto(), messages });
});

app.post("/api/brevo", async (c) => {
  exigeAdmin(c);
  const b = await c.req.json().catch(() => ({}));
  for (const q of QUAND) {
    const v = ["off", "email", "sms", "both"].includes(b[q]) ? b[q] : "off";
    await sql`INSERT INTO reglages (cle, valeur) VALUES (${"brevo_" + q}, ${v}) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`;
  }
  return c.json({ message: "Envois automatiques enregistrés." });
});

app.post("/api/brevo/test", async (c) => {
  exigeAdmin(c);
  if (!brevoConfigure()) throw new AppError(400, "BREVO_API_KEY n'est pas renseignée dans Railway.");
  const b = await c.req.json().catch(() => ({}));
  const mail = clean(b.email, 120), tel = numeroSms(clean(b.tel, 40));
  if (!mail && !tel) throw new AppError(400, "Tape un email ou un numéro de mobile pour le test.");
  try {
    if (mail) await envoiEmail(mail, "Test TURN Shop", "Ceci est un test d'envoi depuis l'Atelier TURN.");
    if (tel) await envoiSms(tel, "Test TURN Shop : l'envoi de SMS fonctionne.");
  } catch (e: any) {
    throw new AppError(502, String(e?.message ?? e));
  }
  return c.json({ message: "Test envoyé : vérifie ta boîte mail ou ton téléphone." });
});
