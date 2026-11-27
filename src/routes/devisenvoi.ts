import { app } from "../app";
import { sql } from "../db";
import "./auth";
import { AppError, signature } from "../util";
import { brevoConfigure, envoiEmail } from "../brevo";
import { devisDe } from "./reparations";
import { acomptesDe } from "./acomptes";
import { creerPaiementWeb, limite } from "./pub";

// Envoi du devis au client : lien sécurisé (jeton aléatoire, 30 jours), accepter / refuser, acompte en ligne.
await sql`CREATE TABLE IF NOT EXISTS devis_envois (
  id SERIAL PRIMARY KEY, reparation_id INT NOT NULL REFERENCES reparations(id), token TEXT NOT NULL UNIQUE,
  lignes JSONB NOT NULL, total_cents INT NOT NULL, remise_cents INT NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'envoye', commentaire TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
  envoye_par TEXT NOT NULL DEFAULT '', envoye_le TIMESTAMPTZ NOT NULL DEFAULT now(), repondu_le TIMESTAMPTZ,
  relance_le TIMESTAMPTZ, expire_le TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days')`;

const BASE = () => (Bun.env.PUBLIC_URL || "https://atelier-turnshop-production.up.railway.app").replace(/\/$/, "");
const lien = (t: string) => `${BASE()}/pub/devis/${t}`;
const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " €";
const pc = (id: number) => "PC-" + String(id).padStart(4, "0");
const esc = (t: any) => String(t ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m] as string));

function texteMail(prenom: string, rep: any, url: string, relance: boolean) {
  return `Bonjour ${prenom || ""},\n\n${relance ? "Petit rappel : ton devis" : "Ton devis"} pour ta trottinette (${rep.marque} ${rep.modele}, dossier ${pc(rep.id)}) est prêt.\n\nTu peux le consulter, l'accepter ou le refuser ici :\n${url}\n\nUne fois accepté, tu peux régler l'acompte en ligne en toute sécurité. Tu retrouves aussi le suivi de ta réparation dans ton compte sur turnshop.fr.\n\nÀ bientôt,\nL'équipe TURN Shop`;
}

app.post("/api/devis/envoyer", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(b.repairId);
  const [r] = (await sql`SELECT r.id, r.statut, r.client_id, cl.prenom, cl.email, t.marque, t.modele FROM reparations r JOIN clients cl ON cl.id = r.client_id JOIN trottinettes t ON t.id = r.trottinette_id WHERE r.id = ${id} AND r.supprime_le IS NULL`) as any[];
  if (!r) throw new AppError(404, "Réparation introuvable.");
  const dv = await devisDe(id);
  if (!dv.lignes.length || dv.netCents <= 0) throw new AppError(400, "Ajoute d'abord des lignes avec un prix au devis.");
  const mail = String(r.email ?? "").trim();
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await sql`UPDATE devis_envois SET statut = 'remplace' WHERE reparation_id = ${id} AND statut = 'envoye'`;
  const u = c.get("user") as any;
  await sql`INSERT INTO devis_envois (reparation_id, token, lignes, total_cents, remise_cents, email, envoye_par) VALUES (${id}, ${token}, ${JSON.stringify(dv.lignes.map((l: any) => ({ libelle: l.libelle, quantite: l.quantite, prixCents: l.prixCents })))}::jsonb, ${dv.netCents}, ${dv.remiseMultiCents}, ${mail}, ${u?.prenom ?? ""})`;
  if (r.statut !== "devis envoyé" && ["reçu", "diagnostic"].includes(r.statut)) {
    await sql`UPDATE reparations SET statut = 'devis envoyé', maj_le = now() WHERE id = ${id}`;
    await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'statut', ${`Statut : ${r.statut} → devis envoyé${signature(c)}`})`;
  }
  const url = lien(token);
  let envoye = false, message = "";
  if (!mail) message = "Le client n'a pas d'email : copie le lien et envoie-le-lui.";
  else if (!brevoConfigure()) message = "Envoi d'emails non configuré (Brevo) : copie le lien et envoie-le au client.";
  else {
    try { await envoiEmail(mail, `Ton devis TURN Shop ${pc(id)}`, texteMail(r.prenom, r, url, false)); envoye = true; message = `Devis envoyé par email à ${mail}.`; }
    catch (e: any) { message = "Email non parti (" + String(e?.message ?? e).slice(0, 120) + ") : copie le lien et envoie-le au client."; }
  }
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'note', ${`Devis de ${eur(dv.netCents)} ${envoye ? "envoyé par email au client" : "prêt (lien à transmettre au client)"}${signature(c)}`})`;
  return c.json({ url, envoye, message });
});

app.get("/api/devis/envois", async (c) => {
  const id = Number(c.req.query("repairId"));
  const rows = (await sql`SELECT id, token, statut, total_cents, commentaire, envoye_le, repondu_le, relance_le, expire_le FROM devis_envois WHERE reparation_id = ${id} ORDER BY id DESC LIMIT 10`) as any[];
  return c.json(rows.map((r) => ({ id: r.id, url: lien(r.token), statut: r.statut === "envoye" && new Date(r.expire_le) < new Date() ? "expire" : r.statut, totalCents: r.total_cents, commentaire: r.commentaire, envoyeLe: r.envoye_le, reponduLe: r.repondu_le, relanceLe: r.relance_le })));
});

async function envoiDe(c: any) {
  limite(c);
  const t = String(c.req.param("token") ?? "");
  if (!/^[a-f0-9]{64}$/.test(t)) throw new AppError(404, "Lien invalide.");
  const [e] = (await sql`SELECT * FROM devis_envois WHERE token = ${t}`) as any[];
  if (!e) throw new AppError(404, "Lien invalide.");
  return e;
}

app.post("/pub/devis/:token/repondre", async (c) => {
  const e = await envoiDe(c);
  const b = await c.req.json().catch(() => ({}));
  if (e.statut !== "envoye") throw new AppError(400, e.statut === "remplace" ? "Un devis plus récent t'a été envoyé : utilise le dernier email." : "Tu as déjà répondu à ce devis.");
  if (new Date(e.expire_le) < new Date()) throw new AppError(400, "Ce lien a expiré : contacte l'atelier.");
  const decision = b.decision === "accepte" ? "accepte" : b.decision === "refuse" ? "refuse" : "";
  if (!decision) throw new AppError(400, "Choisis accepter ou refuser.");
  const com = String(b.commentaire ?? "").trim().slice(0, 500);
  await sql`UPDATE devis_envois SET statut = ${decision}, commentaire = ${com}, repondu_le = now() WHERE id = ${e.id}`;
  const id = e.reparation_id;
  await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'note', ${`Devis ${decision === "accepte" ? "ACCEPTÉ" : "REFUSÉ"} par le client (lien email)${com ? " : " + com : ""}`})`;
  if (decision === "accepte") {
    const r = (await sql`UPDATE reparations SET statut = 'à faire', maj_le = now() WHERE id = ${id} AND statut = 'devis envoyé' RETURNING id`) as any[];
    if (r.length) await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${id}, 'statut', 'Statut : devis envoyé → à faire (devis accepté par le client)')`;
  }
  await sql`INSERT INTO taches (texte, echeance, priorite, cree_par, reparation_id) VALUES (${`Devis ${decision === "accepte" ? "accepté" : "refusé"} ${pc(id)}${com ? " : " + com : ""}`}, (now() AT TIME ZONE 'Europe/Paris')::date, true, 'Espace client', ${id})`;
  return c.json({ ok: true, decision });
});

app.post("/pub/devis/:token/payer", async (c) => {
  const e = await envoiDe(c);
  const b = await c.req.json().catch(() => ({}));
  if (e.statut !== "accepte") throw new AppError(400, "Accepte d'abord le devis.");
  const [r] = (await sql`SELECT r.id, r.client_id, cl.email, cl.shopify_id FROM reparations r JOIN clients cl ON cl.id = r.client_id WHERE r.id = ${e.reparation_id} AND r.supprime_le IS NULL`) as any[];
  if (!r) throw new AppError(404, "Réparation introuvable.");
  return c.json(await creerPaiementWeb(r.id, r.client_id, r.shopify_id ?? "", r.email ?? "", b.mode === "total" ? "total" : "acompte"));
});

app.get("/pub/devis/:token", async (c) => {
  const e = await envoiDe(c);
  const [r] = (await sql`SELECT r.id, t.marque, t.modele, cl.prenom FROM reparations r JOIN trottinettes t ON t.id = r.trottinette_id JOIN clients cl ON cl.id = r.client_id WHERE r.id = ${e.reparation_id}`) as any[];
  const ac = await acomptesDe(e.reparation_id);
  const reste = Math.max(0, e.total_cents - ac.verseCents);
  const expire = e.statut === "envoye" && new Date(e.expire_le) < new Date();
  let ls: any = e.lignes; while (typeof ls === "string") ls = JSON.parse(ls);
  const lignes = (ls as any[]).map((l) => `<tr><td>${esc(l.quantite)} × ${esc(l.libelle)}</td><td class="n">${l.prixCents > 0 ? eur(l.quantite * l.prixCents) : "à confirmer"}</td></tr>`).join("");
  const peutAcompte = ac.verseCents === 0;
  const etat = expire ? "<p class='info'>Ce lien a expiré. Contacte l'atelier pour recevoir un nouveau devis.</p>"
    : e.statut === "remplace" ? "<p class='info'>Un devis plus récent t'a été envoyé : utilise le dernier email.</p>"
    : e.statut === "refuse" ? "<p class='info'>Tu as refusé ce devis. Merci de ta réponse, l'atelier va revenir vers toi si besoin.</p>"
    : e.statut === "accepte" ? `<p class='ok'>✅ Devis accepté, merci !</p>${reste > 0 ? `<p>${peutAcompte ? "Pour lancer la réparation, tu peux régler un acompte en ligne ou la totalité." : "Il reste " + eur(reste) + " à régler."}</p>${peutAcompte ? "<button onclick=\"pay('acompte')\">Régler l'acompte en ligne</button> " : ""}<button class="${peutAcompte ? "sec" : ""}" onclick="pay('total')">Payer ${eur(reste)} en ligne</button>` : "<p>Rien à régler pour le moment.</p>"}`
    : `<p>Tu es d'accord avec ce devis ?</p><textarea id="com" placeholder="Un commentaire pour l'atelier (facultatif)" rows="3"></textarea><div class="b"><button onclick="rep('accepte')">J'accepte le devis</button><button class="sec" onclick="rep('refuse')">Je refuse</button></div>`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Ton devis TURN Shop ${pc(e.reparation_id)}</title>
<style>body{font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#f4f4f2;margin:0;color:#111}header{background:#285a38;color:#fff;padding:16px 20px;font-size:20px;font-weight:700}main{max-width:560px;margin:0 auto;padding:16px}.card{background:#fff;border-radius:14px;padding:18px;box-shadow:0 1px 4px rgba(0,0,0,.08)}h1{font-size:20px;margin:0 0 4px}.m{color:#666;font-size:14px;margin:0 0 14px}table{width:100%;border-collapse:collapse}td{padding:8px 0;border-bottom:1px solid #eee;vertical-align:top}td.n{text-align:right;white-space:nowrap;padding-left:12px}.tot td{font-weight:700;border-bottom:0}button{background:#285a38;color:#fff;border:0;border-radius:10px;padding:13px 18px;font-size:16px;font-weight:600;cursor:pointer;margin:6px 6px 0 0}button.sec{background:#fff;color:#285a38;border:2px solid #285a38}textarea{width:100%;box-sizing:border-box;border:1px solid #ccc;border-radius:10px;padding:10px;font-size:15px}.ok{color:#1d6b32;font-weight:700}.info{background:#eef3ee;padding:12px;border-radius:10px}.err{color:#b00020}</style></head><body><header>TURN Shop</header><main><div class="card"><h1>Ton devis ${pc(e.reparation_id)}</h1><p class="m">${esc(r.marque)} ${esc(r.modele)}</p>
<table>${lignes}${e.remise_cents > 0 ? `<tr><td>Remise</td><td class="n">- ${eur(e.remise_cents)}</td></tr>` : ""}<tr class="tot"><td>Total</td><td class="n">${eur(e.total_cents)}</td></tr>${ac.verseCents > 0 ? `<tr><td>Déjà versé</td><td class="n">${eur(ac.verseCents)}</td></tr><tr class="tot"><td>Reste à régler</td><td class="n">${eur(reste)}</td></tr>` : ""}</table>
<div id="zone" style="margin-top:14px">${etat}</div><p id="msg" class="err"></p></div></main>
<script>var T=${JSON.stringify(e.token)};function msg(t){document.getElementById("msg").textContent=t}
function post(u,b){return fetch("/pub/devis/"+T+u,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||j.message||"Erreur");return j})})}
function rep(d){msg("");var c=document.getElementById("com");post("/repondre",{decision:d,commentaire:c?c.value:""}).then(function(){location.reload()}).catch(function(e){msg(e.message)})}
function pay(m){msg("Ouverture du paiement...");post("/payer",{mode:m}).then(function(j){location.href=j.url}).catch(function(e){msg(e.message)})}</script></body></html>`;
  return c.html(html);
});

// Relance unique après 48 h sans réponse ; expiration à 30 jours.
export async function relancesDevis() {
  await sql`UPDATE devis_envois SET statut = 'expire' WHERE statut = 'envoye' AND expire_le < now()`;
  if (!brevoConfigure()) return;
  const rows = (await sql`SELECT e.id, e.token, e.email, e.reparation_id, cl.prenom, t.marque, t.modele FROM devis_envois e JOIN reparations r ON r.id = e.reparation_id JOIN clients cl ON cl.id = r.client_id JOIN trottinettes t ON t.id = r.trottinette_id
    WHERE e.statut = 'envoye' AND e.relance_le IS NULL AND e.email <> '' AND e.envoye_le < now() - interval '48 hours' AND r.supprime_le IS NULL LIMIT 20`) as any[];
  for (const e of rows) {
    await sql`UPDATE devis_envois SET relance_le = now() WHERE id = ${e.id}`;
    try {
      await envoiEmail(e.email, `Rappel : ton devis TURN Shop ${pc(e.reparation_id)}`, texteMail(e.prenom, { id: e.reparation_id, marque: e.marque, modele: e.modele }, lien(e.token), true));
      await sql`INSERT INTO journal (reparation_id, type, texte) VALUES (${e.reparation_id}, 'note', 'Relance automatique du devis envoyée au client')`;
    } catch (err) { console.error("relanceDevis", err); }
  }
}
