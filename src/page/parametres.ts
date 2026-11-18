export const PARAMETRES = `// ---------- Paramètres (admins) ----------
var PARAM=null;
function vParam(){
  if(ROLE!=="admin"){app.innerHTML="<div class='card'>Réservé aux administrateurs.</div>";return}
  if(!PARAM){app.innerHTML="<div class='card'>Chargement…</div>";api("/parametres").then(function(d){PARAM=d;render()}).catch(function(e){app.innerHTML="<div class='card'>"+esc(e.message)+"</div>"});return}
  app.innerHTML="<div class='card'><div class='step'>Programme de fidélité</div><div class='muted'>Règle de départ : 100 € dépensés = 5 € offerts. Tu peux la changer quand tu veux.</div>"
    +"<label class='muted'>Euros à dépenser pour gagner un palier</label><input id='pe1' value='"+esc(PARAM.eurosPourPalier)+"'>"
    +"<label class='muted'>Remise offerte à chaque palier (€)</label><input id='pr1' value='"+esc(PARAM.remiseEuros)+"'>"
    +"<button data-act='saveParam'>Enregistrer</button><div class='muted' id='parmsg'></div></div>"}
`;
