import { app } from "./app";
// L'ordre compte : auth.ts installe la protection /api/* avant toutes les routes /api.
import "./routes/auth";
import "./routes/clients";
import "./routes/reparations";
import "./routes/planning";
import "./routes/consignes";
import "./routes/parametres";
import "./routes/avantages";
import "./routes/prestations";
import "./routes/modeles";
import "./routes/pub";
import "./routes/taches";
import "./routes/brevo";
import "./routes/diagnostic";
import "./routes/ticket";
import "./routes/achats";
import "./routes/stock";
import "./routes/maitres";
import "./routes/compta";
import "./routes/banque";
import "./routes/devisenvoi";
import "./routes/cloture";
import "./routes/retours";
import "./routes/garantie";
import "./routes/sav";
import "./routes/chat";
import "./routes/defi";
import "./routes/process";
import "./routes/stats";
import "./routes/commandes";
import "./routes/acomptes";
import "./routes/rdv";
import "./routes/devis";
import "./routes/depot";
import "./routes/sauvegarde";
import "./routes/synthese";
import "./routes/caisse";
import "./automatisations";
import { HTML } from "./page";

app.get("/", (c) => c.html(HTML));

app.get("/favori", (c) => {
  const m = HTML.match(/function EWB\(\)\{[\s\S]*?\n\}\nfunction ewLien/);
  const fn = m ? m[0].replace(/\nfunction ewLien$/, "") : "";
  const code = "javascript:(" + fn + ")()";
  const href = "javascript:(" + encodeURIComponent(fn) + ")()";
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Favori Remplir panier</title>
<body style="font-family:system-ui;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.5">
<h2>🛒 Favori « Remplir panier »</h2>
<p><b>Méthode 1 :</b> attrape le bouton vert avec la souris et glisse-le dans la barre de favoris (Cmd + Maj + B pour l'afficher).</p>
<p><a href="${esc(href)}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#2e7d32;color:#fff;text-decoration:none;font-weight:700;font-size:18px">🛒 Remplir panier</a></p>
<p><b>Méthode 2 (si le glisser ne marche pas) :</b></p>
<ol><li>Clique sur « Copier le code » ci-dessous.</li><li>Ajoute n'importe quelle page en favori (Cmd + D), puis modifie ce favori (clic droit &gt; Modifier) : colle le code à la place de l'adresse (URL) et nomme-le « Remplir panier ».</li></ol>
<button onclick="navigator.clipboard.writeText(document.getElementById('c').value).then(function(){this.textContent='Copié ✓'}.bind(this))" style="padding:10px 16px;font-size:16px">Copier le code</button>
<textarea id="c" style="display:block;width:100%;height:80px;margin-top:10px" readonly>${esc(code)}</textarea>
</body>`);
});

export default { port: Number(Bun.env.PORT ?? 3000), fetch: app.fetch };
