export const DEFI = `// ---------- Défi du mois + mot de passe ----------
var DEFI=null,DEFIMSG="",MDPMSG="",UTL=null;
function defiCharge(){if(DEFI===null){DEFI=undefined;api("/defi").then(function(d){DEFI=d;if(TAB==="accueil"||TAB==="param")render()}).catch(function(){DEFI={actif:false}})}}
function defiMoisLib(m){var n=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];return n[+m.slice(5,7)-1]+" "+m.slice(0,4)}
function defiListe(l,fmt){if(!l.length)return"<div class='muted'>Pas encore de chiffres.</div>";var med=["🥇","🥈","🥉","4.","5."];return l.map(function(x,i){return"<div style='display:flex;justify-content:space-between;font-size:13px'><span>"+med[i]+" "+esc(x.nom)+"</span><b>"+fmt(x)+"</b></div>"}).join("")}
function blocDefi(){
  defiCharge();
  if(!DEFI||!DEFI.actif)return"";
  var c=DEFI.courant,p=DEFI.precedent,fr=function(x){return x.n+" réparation"+(x.n>1?"s":"")},fv=function(x){return eur(x.cents)};
  var h="<div class='card'><div class='step'>🏆 Défi du mois · "+esc(defiMoisLib(c.mois))+"</div><div style='display:flex;gap:16px;flex-wrap:wrap'>"
    +"<div style='flex:1;min-width:180px'><b>Meilleur réparateur</b>"+(DEFI.cadeauReparateur?"<div class='muted'>Cadeau : "+esc(DEFI.cadeauReparateur)+"</div>":"")+defiListe(c.reparateurs,fr)+"</div>"
    +"<div style='flex:1;min-width:180px'><b>Meilleur vendeur</b>"+(DEFI.cadeauVendeur?"<div class='muted'>Cadeau : "+esc(DEFI.cadeauVendeur)+"</div>":"")+defiListe(c.vendeurs,fv)+"</div></div>";
  if(p.reparateurs.length||p.vendeurs.length)h+="<div class='muted' style='margin-top:8px'>Gagnants de "+esc(defiMoisLib(p.mois))+" : réparateur <b>"+esc(p.reparateurs.length?p.reparateurs[0].nom:"-")+"</b> · vendeur <b>"+esc(p.vendeurs.length?p.vendeurs[0].nom:"-")+"</b></div>";
  return h+"</div>"}
function defiParam(){
  if(DEFI===null||DEFI===undefined){defiCharge();return"<div class='card'>Chargement…</div>"}
  return"<div class='card'><div class='step'>Défi du mois</div><div class='muted'>Chaque mois, le classement du meilleur réparateur (nombre de réparations terminées) et du meilleur vendeur (chiffre d'affaires en caisse) s'affiche sur le Dashboard.</div>"
    +"<label class='muted' style='display:flex;gap:8px;align-items:center'><input type='checkbox' id='df-on' style='width:auto;margin:0' "+(DEFI.actif?"checked":"")+"> Activer le défi</label>"
    +"<label class='muted'>Cadeau du meilleur réparateur</label><input id='df-r' value='"+esc(DEFI.cadeauReparateur||"")+"' placeholder='Ex : 50 € de bon d&#39;achat'>"
    +"<label class='muted'>Cadeau du meilleur vendeur</label><input id='df-v' value='"+esc(DEFI.cadeauVendeur||"")+"' placeholder='Ex : une journée off'>"
    +"<button data-act='defiSave'>Enregistrer</button><div class='muted'>"+esc(DEFIMSG)+"</div></div>"}
function mdpParam(){
  if(UTL===null){UTL=undefined;api("/utilisateurs/liste").then(function(d){UTL=d;render()}).catch(function(){UTL=[];render()})}
  var h="<div class='card'><div class='step'>Changer mon mot de passe</div><input id='mp-a' type='password' placeholder='Ancien mot de passe' autocomplete='current-password'><input id='mp-n' type='password' placeholder='Nouveau mot de passe (6 caractères minimum)' autocomplete='new-password'>"
    +"<button data-act='mdpSave'>Changer</button><div class='muted'>"+esc(MDPMSG)+"</div></div>";
  if(UTL&&UTL.length)h+="<div class='card'><div class='step'>Code de caisse (3 chiffres)</div><div class='muted'>Chaque membre a son code, unique. C'est lui qu'on tape dans la fenêtre qui s'ouvre quand on clique sur Encaisser.</div><div class='dl'><select id='kc-u'>"+UTL.map(function(u){return"<option>"+esc(u.prenom)+"</option>"}).join("")+"</select><input id='kc-c' inputmode='numeric' maxlength='3' placeholder='3 chiffres' style='max-width:110px'><button class='sec' data-act='kcSave'>Définir</button></div></div>";
  if(UTL&&UTL.length)h+="<div class='card'><div class='step'>Mot de passe oublié par un membre</div><div class='muted'>Son mot de passe est effacé : il en choisit un nouveau à sa prochaine connexion.</div><div class='dl'><select id='mp-u'>"+UTL.map(function(u){return"<option>"+esc(u.prenom)+"</option>"}).join("")+"</select><button class='sec' data-act='mdpReinit'>Réinitialiser</button></div></div>";
  return h}
ACTS.defiSave=function(){api("/defi",{actif:document.getElementById("df-on").checked,cadeauReparateur:v("df-r"),cadeauVendeur:v("df-v")}).then(function(d){DEFIMSG=d.message;DEFI=null;render()}).catch(function(e){DEFIMSG=e.message;render()})};
ACTS.mdpSave=function(){api("/moi/mot-de-passe",{ancien:document.getElementById("mp-a").value,nouveau:document.getElementById("mp-n").value}).then(function(d){MDPMSG=d.message;render()}).catch(function(e){MDPMSG=e.message;render()})};
function demandeCode(titre){
  return new Promise(function(res){
    var o=document.createElement("div");o.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center";
    o.innerHTML="<div style='background:#fff;border-radius:14px;padding:22px;width:290px;text-align:center'><div style='font-size:18px;font-weight:700;margin-bottom:4px'>"+esc(titre)+"</div><div class='muted' style='margin-bottom:10px'>Tape ton code à 3 chiffres</div><input type='password' inputmode='numeric' autocomplete='off' maxlength='40' style='font-size:30px;text-align:center;letter-spacing:10px;width:100%;box-sizing:border-box'><div class='actions' style='justify-content:center;margin-top:10px'><button class='sec' data-x='1'>Annuler</button></div></div>";
    document.body.appendChild(o);var inp=o.querySelector("input"),done=false;inp.focus();
    function fin(x){if(done)return;done=true;o.remove();res(x)}
    inp.addEventListener("input",function(){if(/^[0-9]{3}$/.test(inp.value))fin(inp.value)});
    inp.addEventListener("keydown",function(e){if(e.key==="Enter"&&inp.value)fin(inp.value);if(e.key==="Escape")fin(null)});
    o.querySelector("[data-x]").addEventListener("click",function(){fin(null)})})}
ACTS.mdpPrompt=function(){var ch=prompt("1 = changer mon mot de passe\\n2 = définir mon code de caisse (3 chiffres)","2");if(ch===null)return;if(ch.trim()==="2"){var m=prompt("Ton mot de passe actuel :");if(m===null)return;var k=prompt("Nouveau code de caisse (3 chiffres) :");if(k===null)return;api("/moi/code-caisse",{motdepasse:m,code:k}).then(function(d){alert(d.message)}).catch(function(e){alert(e.message)});return}ACTS.mdpMot()};
ACTS.mdpMot=function(){var a=prompt("Ancien mot de passe :");if(a===null)return;var n=prompt("Nouveau mot de passe (6 caractères minimum) :");if(n===null)return;api("/moi/mot-de-passe",{ancien:a,nouveau:n}).then(function(d){alert(d.message)}).catch(function(e){alert(e.message)})};
ACTS.kcSave=function(){api("/utilisateurs/code-caisse",{prenom:document.getElementById("kc-u").value,code:document.getElementById("kc-c").value}).then(function(d){MDPMSG=d.message;render()}).catch(function(e){MDPMSG=e.message;render()})};
ACTS.mdpReinit=function(){var u=document.getElementById("mp-u").value;if(!confirm("Réinitialiser le mot de passe de "+u+" ?"))return;api("/utilisateurs/reinit-mdp",{prenom:u}).then(function(d){MDPMSG=d.message;render()}).catch(function(e){MDPMSG=e.message;render()})};
`;
