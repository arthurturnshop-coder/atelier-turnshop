export const PROCESS = `// ---------- Espace process et bonnes pratiques ----------
var PRC={pages:null,sel:0,q:"",ed:null,msg:""};
function prcCharge(){api("/process").then(function(d){PRC.pages=d;if(TAB==="process")render()}).catch(function(e){PRC.pages=[];PRC.msg=e.message;if(TAB==="process")render()})}
function prcPeut(){return ROLE==="admin"||ROLE==="responsable"||!ROLE}
function prcTexte(t){
  var nl=String.fromCharCode(10),out="",lst=false;
  String(t||"").split(nl).forEach(function(l){
    var li=/^- (.*)$/.exec(l),ch=/^- \\[ \\] (.*)$/.exec(l),h=/^# (.*)$/.exec(l);
    if(ch){if(!lst){out+="<div style='margin:4px 0'>";lst=true}out+="<label style='display:flex;gap:8px;align-items:flex-start;padding:3px 0'><input type='checkbox' style='width:auto;margin:3px 0 0'><span>"+esc(ch[1])+"</span></label>";return}
    if(li){if(!lst){out+="<div style='margin:4px 0'>";lst=true}out+="<div style='padding:2px 0 2px 14px;text-indent:-14px'>• "+esc(li[1])+"</div>";return}
    if(lst){out+="</div>";lst=false}
    if(h){out+="<div class='step' style='margin:14px 0 4px'>"+esc(h[1])+"</div>";return}
    if(l.trim())out+="<div style='padding:3px 0'>"+esc(l)+"</div>"});
  if(lst)out+="</div>";return out}
function vProcess(){
  if(!PRC.pages){prcCharge();app.innerHTML="<div class='caisse'><h3>📘 Process et bonnes pratiques</h3><div class='muted'>Chargement…</div></div>";return}
  var h="<div class='caisse'><h3>📘 Process et bonnes pratiques</h3>";
  if(PRC.ed){
    var e=PRC.ed;
    h+="<div class='card'><div class='step'>"+(e.id?"Modifier la page":"Nouvelle page")+"</div><input id='pr-t' placeholder='Titre' value='"+esc(e.titre)+"'><input id='pr-c' list='pr-cats' placeholder='Catégorie (ex : Atelier, Caisse et ventes)' value='"+esc(e.categorie)+"'><datalist id='pr-cats'>"+prcCats().map(function(c){return"<option value='"+esc(c)+"'>"}).join("")+"</datalist>"
      +"<textarea id='pr-x' rows='16' placeholder='Écris la procédure...'>"+esc(e.contenu)+"</textarea>"
      +"<div class='muted'>Astuces : une ligne qui commence par « # » est un titre, « - » une puce, « - [ ] » une case à cocher, « 1. » une étape numérotée.</div>"
      +"<div class='actions'><button data-act='prcSave'>Enregistrer</button><button class='sec' data-act='prcCancel'>Annuler</button>"+(e.id?"<button class='sec' data-act='prcDel' data-id='"+e.id+"' style='color:#c0392b'>Supprimer</button>":"")+"</div><div class='muted'>"+esc(PRC.msg)+"</div></div>";
    return app.innerHTML=h+"</div>"}
  var sel=PRC.pages.filter(function(p){return p.id===PRC.sel})[0];
  if(sel){
    h+="<button class='sec' data-act='prcBack' style='max-width:260px'>← Tous les process</button><div class='card' style='margin-top:8px'><div class='muted'>"+esc(sel.categorie)+"</div><h3 style='margin:2px 0 6px'>"+esc(sel.titre)+"</h3>"+prcTexte(sel.contenu)
      +"<div class='muted' style='margin-top:12px'>Dernière mise à jour : "+esc(dateLongue(sel.majLe))+(sel.majPar&&sel.majPar!=="Départ"?" par "+esc(sel.majPar):"")+"</div>"
      +(prcPeut()?"<div class='actions'><button class='sec' data-act='prcEdit' data-id='"+sel.id+"'>✏️ Modifier</button></div>":"")+"</div>";
    return app.innerHTML=h+"</div>"}
  var q=PRC.q.toLowerCase(),L=PRC.pages.filter(function(p){return!q||(p.titre+" "+p.categorie+" "+p.contenu).toLowerCase().indexOf(q)>=0});
  h+="<div class='card'><div class='dl'><input id='prc-q' class='lb' placeholder='Chercher un process (ex : garantie, clôture, devis)' value='"+esc(PRC.q)+"'>"+(prcPeut()?"<button data-act='prcNew'>+ Nouvelle page</button>":"")+"</div><div class='muted'>"+esc(PRC.msg)+"</div></div>";
  var cats=[];L.forEach(function(p){if(cats.indexOf(p.categorie)<0)cats.push(p.categorie)});
  if(!L.length)h+="<div class='card muted'>Aucun process trouvé.</div>";
  cats.forEach(function(c){h+="<div class='card'><div class='step'>"+esc(c)+"</div>"+L.filter(function(p){return p.categorie===c}).map(function(p){return"<button class='sec hrow' data-act='prcOpen' data-id='"+p.id+"'><b>"+esc(p.titre)+"</b></button>"}).join("")+"</div>"});
  app.innerHTML=h+coffreHtml()+"</div>"}
var CFR={cree:null,mdp:"",entrees:null,msg:"",ed:null,vu:{},t:0,b:false};
function coffreCharge(){if(CFR.cree===null&&!CFR.b){CFR.b=true;api("/coffre/etat").then(function(d){CFR.cree=!!d.cree;CFR.b=false;if(TAB==="process")render()}).catch(function(){CFR.cree=false;CFR.b=false})}}
function coffreVerrou(){clearTimeout(CFR.t);CFR.mdp="";CFR.entrees=null;CFR.ed=null;CFR.vu={};if(TAB==="process")render()}
function coffreArme(){clearTimeout(CFR.t);CFR.t=setTimeout(coffreVerrou,120000)}
function coffreHtml(){
  coffreCharge();
  var h="<div class='card' style='border-left-color:#8a6d00'><div class='step'>🔐 Comptes et mots de passe utiles</div>"+(CFR.msg?"<div class='tag warn'>"+esc(CFR.msg)+"</div>":"");
  if(CFR.cree===null)return h+"<div class='muted'>Chargement…</div></div>";
  if(!CFR.cree){
    return h+(ROLE==="admin"?"<div class='muted'>Aucun coffre pour l instant. Choisis un mot de passe (6 caractères minimum) : il ne sera jamais enregistré et sert à chiffrer les comptes. <b>S il est perdu, les comptes sont perdus.</b></div><div class='dl'><input id='cf-n' type='password' autocomplete='new-password' placeholder='Mot de passe du coffre'><button data-act='cfCreer'>Créer le coffre</button></div>":"<div class='muted'>Le coffre n a pas encore été créé par un administrateur.</div>")+"</div>"}
  if(!CFR.entrees)return h+"<div class='muted'>Protégé par le mot de passe du coffre.</div><div class='dl'><input id='cf-m' type='password' autocomplete='off' placeholder='Mot de passe du coffre'><button data-act='cfOuvrir'>Ouvrir</button></div></div>";
  var e=CFR.ed,adm=ROLE==="admin";
  h+="<div class='muted'>Ouvert : se referme tout seul au bout de 2 minutes.</div><table class='devis' style='width:100%'><tr><th>Service</th><th>Identifiant</th><th>Mot de passe</th><th>Note</th><th></th></tr>"
   +CFR.entrees.map(function(x){var vu=CFR.vu[x.id];return"<tr><td><b>"+esc(x.service)+"</b></td><td>"+esc(x.identifiant)+"</td><td style='font-family:monospace'>"+(vu?esc(x.secret):"••••••••")+" <button class='sec' style='min-height:0;padding:1px 6px;font-size:12px' data-act='cfVoir' data-id='"+x.id+"'>"+(vu?"Cacher":"Voir")+"</button> <button class='sec' style='min-height:0;padding:1px 6px;font-size:12px' data-act='cfCopie' data-id='"+x.id+"'>Copier</button></td><td class='muted'>"+esc(x.note)+"</td><td>"+(adm?"<button class='sec' style='min-height:0;padding:1px 6px;font-size:12px' data-act='cfEdit' data-id='"+x.id+"'>Modifier</button> <button class='link' data-act='cfDel' data-id='"+x.id+"'>Suppr.</button>":"")+"</td></tr>"}).join("")+"</table>"
   +(CFR.entrees.length?"":"<div class='muted'>Aucun compte pour l instant.</div>");
  if(adm){e=e||{id:0,service:"",identifiant:"",secret:"",note:""};
    h+="<div class='step' style='margin-top:10px'>"+(e.id?"Modifier":"Ajouter un compte")+"</div><div class='dl'><input id='cf-s' placeholder='Service (Shopify, Brevo, TPE…)' value='"+esc(e.service)+"'><input id='cf-i' placeholder='Identifiant / e-mail' value='"+esc(e.identifiant)+"'></div><div class='dl'><input id='cf-p' placeholder='Mot de passe' value='"+esc(e.secret)+"' autocomplete='off'><input id='cf-o' placeholder='Note (facultatif)' value='"+esc(e.note)+"'></div><div class='actions'><button data-act='cfSave' data-id='"+e.id+"'>Enregistrer</button>"+(e.id?"<button class='sec' data-act='cfNew'>Annuler</button>":"")+"</div>"
     +"<div class='dl' style='margin-top:8px'><input id='cf-nv' type='password' autocomplete='new-password' placeholder='Nouveau mot de passe du coffre'><button class='sec' data-act='cfChange'>Changer le mot de passe du coffre</button></div>"}
  return h+"<div class='actions'><button class='sec' data-act='cfVerrou'>🔒 Verrouiller</button></div></div>"}
ACTS.cfCreer=function(){api("/coffre/creer",{mdp:v("cf-n")}).then(function(){CFR.cree=true;CFR.msg="Coffre créé. Ouvre-le avec ton mot de passe.";render()}).catch(function(e){CFR.msg=e.message;render()})};
ACTS.cfOuvrir=function(){var m=v("cf-m");api("/coffre/ouvrir",{mdp:m}).then(function(d){CFR.mdp=m;CFR.entrees=d.entrees;CFR.msg="";coffreArme();render()}).catch(function(e){CFR.msg=e.message;render()})};
ACTS.cfVerrou=function(){CFR.msg="";coffreVerrou()};
ACTS.cfVoir=function(b){CFR.vu[b.dataset.id]=!CFR.vu[b.dataset.id];coffreArme();render()};
ACTS.cfCopie=function(b){var x=(CFR.entrees||[]).filter(function(y){return y.id===+b.dataset.id})[0];if(x&&navigator.clipboard)navigator.clipboard.writeText(x.secret).then(function(){toastOk("Mot de passe copié.")});coffreArme()};
ACTS.cfEdit=function(b){CFR.ed=(CFR.entrees||[]).filter(function(y){return y.id===+b.dataset.id})[0]||null;coffreArme();render()};
ACTS.cfNew=function(){CFR.ed=null;render()};
ACTS.cfSave=function(b){api("/coffre/entree",{mdp:CFR.mdp,id:+b.dataset.id||0,service:v("cf-s"),identifiant:v("cf-i"),secret:v("cf-p"),note:v("cf-o")}).then(function(d){CFR.entrees=d.entrees;CFR.ed=null;CFR.msg="";coffreArme();render()}).catch(function(e){CFR.msg=e.message;render()})};
ACTS.cfDel=function(b){if(!confirm("Supprimer ce compte du coffre ?"))return;api("/coffre/supprimer",{mdp:CFR.mdp,id:+b.dataset.id}).then(function(d){CFR.entrees=d.entrees;coffreArme();render()}).catch(function(e){CFR.msg=e.message;render()})};
ACTS.cfChange=function(){api("/coffre/changer-mdp",{mdp:CFR.mdp,nouveau:v("cf-nv")}).then(function(){CFR.msg="Mot de passe du coffre changé : rouvre-le avec le nouveau.";coffreVerrou()}).catch(function(e){CFR.msg=e.message;render()})};
function prcCats(){var c=[];(PRC.pages||[]).forEach(function(p){if(c.indexOf(p.categorie)<0)c.push(p.categorie)});return c}
document.addEventListener("input",function(e){if(e.target&&e.target.id==="prc-q"){PRC.q=e.target.value;var p=e.target.selectionStart;vProcess();var n=document.getElementById("prc-q");if(n){n.focus();try{n.setSelectionRange(p,p)}catch(x){}}}});
ACTS.prcOpen=function(b){PRC.sel=+b.dataset.id;PRC.msg="";render();window.scrollTo(0,0)};
ACTS.prcBack=function(){PRC.sel=0;PRC.ed=null;render()};
ACTS.prcNew=function(){PRC.ed={id:0,titre:"",categorie:"",contenu:""};PRC.msg="";render()};
ACTS.prcEdit=function(b){var p=PRC.pages.filter(function(x){return x.id===+b.dataset.id})[0];if(p){PRC.ed={id:p.id,titre:p.titre,categorie:p.categorie,contenu:p.contenu};PRC.msg="";render()}};
ACTS.prcCancel=function(){PRC.ed=null;PRC.msg="";render()};
ACTS.prcSave=function(){api("/process/enregistrer",{id:PRC.ed.id,titre:v("pr-t"),categorie:v("pr-c"),contenu:document.getElementById("pr-x").value}).then(function(d){PRC.ed=null;PRC.sel=d.id;PRC.pages=null;PRC.msg="";render()}).catch(function(e){PRC.msg=e.message;render()})};
ACTS.prcDel=function(b){if(!confirm("Supprimer cette page ?"))return;api("/process/supprimer",{id:+b.dataset.id}).then(function(){PRC.ed=null;PRC.sel=0;PRC.pages=null;render()}).catch(function(e){PRC.msg=e.message;render()})};
`;
