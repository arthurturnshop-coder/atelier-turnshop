export const COMPTA = `// ---------- Comptabilité (admins, dans Paramètres) ----------
var CPT=null,CPTBUSY=false,CPTMSG="";
ACTS.parSec=function(b){PSEC=b.dataset.s;render()};
ACTS.parBack=function(){PSEC="";render()};
var CPTLAB={piece:"Pièce vendue",article:"Article / produit vendu",main_oeuvre:"Main d'œuvre",consommable:"Consommables",port:"Port facturé",remise:"Remises accordées",piece_achetee:"Pièce achetée",tva_collectee:"TVA collectée",tva_deductible:"TVA déductible",acompte:"Acomptes clients",carte:"Encaissement carte",especes:"Encaissement espèces",virement:"Encaissement virement",en_ligne:"Encaissement en ligne (Shopify)"};
function cptLoad(){if(CPT===null&&!CPTBUSY){CPTBUSY=true;api("/compta/config").then(function(d){CPT=d;CPTBUSY=false;render()}).catch(function(e){CPT={comptes:[],defauts:[],analytiques:[]};CPTMSG=e.message;CPTBUSY=false;render()})}}
function cptCard(){
  var d=new Date(),pad=function(n){return(n<10?"0":"")+n},iso=function(x){return x.getFullYear()+"-"+pad(x.getMonth()+1)+"-"+pad(x.getDate())};
  var deb=iso(new Date(d.getFullYear(),d.getMonth(),1)),fin=iso(d);
  var h="<div class='card'><div class='step'>Comptabilité : export pour le comptable</div><div class='muted'>Journal des ventes (une écriture équilibrée par vente ou acompte : encaissement, produits HT, TVA 20 %). Les comptes sont à valider avec ton comptable.</div>"
    +"<div class='dl' style='margin-top:6px'><span class='muted'>Du</span><input id='cx-d' type='date' value='"+deb+"'><span class='muted'>au</span><input id='cx-f' type='date' value='"+fin+"'><select id='cx-m'><option value=''>"+esc(MAG||"Tous")+" (ma session)</option><option value='Amiens'>Amiens</option><option value='Rouen'>Rouen</option><option value='tous'>Les deux (mélangés)</option></select><button data-act='cptExport'>Télécharger le journal des ventes (CSV)</button></div>"
    +"<div class='muted'>Le journal des achats viendra quand les prix d'achat seront saisis à la réception des commandes.</div>";
  h+="<div class='step' style='margin-top:14px'>Compte utilisé par défaut</div>";
  CPT.defauts.forEach(function(x){
    h+="<div class='dl' style='align-items:center'><span class='lb'>"+esc(CPTLAB[x.cle]||x.cle)+"</span><select data-cptdef='"+esc(x.cle)+"'>"+CPT.comptes.map(function(c){return"<option value='"+esc(c.code)+"'"+(c.code===x.code?" selected":"")+">"+esc(c.code+" - "+c.libelle)+"</option>"}).join("")+"</select></div>"});
  h+="<div class='step' style='margin-top:14px'>Code analytique par boutique</div><div class='dl'>"+CPT.analytiques.map(function(a){return"<span class='muted'>"+esc(a.magasin)+"</span><input id='an-"+esc(a.magasin)+"' class='q' value='"+esc(a.code)+"'>"}).join("")+"<button data-act='cptAna'>Enregistrer</button></div>"
    +"<div class='muted'>Les réparations (atelier) prennent le code Atelier, les autres ventes le code de leur boutique.</div>";
  h+="<div class='step' style='margin-top:14px'>Liste des comptes</div>"+CPT.comptes.map(function(c){return"<div class='muted'><b>"+esc(c.code)+"</b> · "+esc(c.libelle)+" · "+esc(c.type)+"</div>"}).join("")
    +"<div class='dl' style='margin-top:6px'><input id='cp-c' class='q' placeholder='Code'><input id='cp-l' class='lb' placeholder='Libellé'><select id='cp-t'><option value='produit'>Produit (7…)</option><option value='charge'>Charge (6…)</option><option value='tva'>TVA</option><option value='tiers'>Tiers (4…)</option><option value='tresorerie'>Trésorerie (5…)</option></select><button data-act='cptAdd'>Ajouter / modifier</button></div>"
    +"<div class='muted'>"+esc(CPTMSG)+"</div></div>";
  return h}
ACTS.cptExport=function(){
  var du=v("cx-d"),au=v("cx-f");if(!du||!au){CPTMSG="Choisis la période.";render();return}
  var hd={};if(TOK)hd["x-atelier-token"]=TOK;else hd["x-atelier-password"]=PW;
  fetch("/api/compta/export?du="+du+"&au="+au+"&magasin="+encodeURIComponent(v("cx-m")),{headers:hd}).then(function(r){if(!r.ok)return r.json().then(function(j){throw new Error(j.error||"Erreur")});return r.blob()}).then(function(b){
    var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="journal-"+(v("cx-m")||MAG||"tous").toLowerCase()+"-"+du+"-"+au+".csv";document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500);CPTMSG="Journal téléchargé.";render()}).catch(function(e){CPTMSG=e.message;render()})};
ACTS.cptAna=function(){Promise.all(CPT.analytiques.map(function(a){return api("/compta/analytique",{magasin:a.magasin,code:v("an-"+a.magasin)})})).then(function(){CPT=null;CPTMSG="Codes analytiques enregistrés.";render()}).catch(function(e){CPTMSG=e.message;render()})};
ACTS.cptAdd=function(){api("/compta/compte",{code:v("cp-c"),libelle:v("cp-l"),type:v("cp-t")}).then(function(d){CPT=null;CPTMSG=d.message;render()}).catch(function(e){CPTMSG=e.message;render()})};
document.addEventListener("change",function(e){var t=e.target;if(!t||!t.dataset||!t.dataset.cptdef)return;api("/compta/defaut",{cle:t.dataset.cptdef,code:t.value}).then(function(d){CPTMSG=d.message;CPT=null;render()}).catch(function(er){CPTMSG=er.message;render()})});
`;
