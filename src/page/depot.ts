export const DEPOT = `// ---------- Dépôt-vente de trottinettes ----------
var DEP={list:null,msg:"",nouv:false,res:null,cli:null,ts:[],ch:0,open:0};
var DEPST={revision:["Révision en cours","warn"],en_vente:["En vente","ok"],vendu:["Vendu : à reverser","warn"],reverse:["Reversé","ok"],retire:["Retiré",""]};
function depEur(c){return eur(c)}
function depCharge(){api("/depots").then(function(d){DEP.list=d.depots;render()}).catch(function(e){DEP.list=[];DEP.msg=e.message;render()})}
function vDepot(){
  if(DEP.list===null){app.innerHTML=subHtml()+"<div class='card'>Chargement…</div>";depCharge();return}
  var h=subHtml()+(DEP.msg?"<div class='pmsg'>"+esc(DEP.msg)+"</div>":"");
  h+="<div class='card'><div class='step'>Dépôt-vente de trottinettes</div><div class='muted'>Commission boutique : 50 € + 10 % du prix de vente. Révision complète et remplacement des pièces critiques obligatoires (une prise en charge est créée au dépôt, son coût est déduit du reversement).</div><button data-act='depNouv'>+ Nouveau dépôt</button></div>";
  if(DEP.nouv)h+=depForm();
  var enc=DEP.list.filter(function(d){return d.statut==="revision"||d.statut==="en_vente"||d.statut==="vendu"}),fin=DEP.list.filter(function(d){return d.statut==="reverse"||d.statut==="retire"});
  if(!enc.length&&!DEP.nouv)h+="<div class='card'>Aucun dépôt en cours.</div>";
  h+=enc.map(depCarte).join("");
  if(fin.length)h+="<div class='card'><div class='step'>Terminés ("+fin.length+")</div>"+fin.map(function(d){return"<div class='muted' style='padding:4px 0'>DV-"+d.id+" · "+esc(d.marque+" "+d.modele)+" · "+esc(d.client)+" · "+(DEPST[d.statut]||[d.statut])[0]+(d.statut==="reverse"?" ("+depEur(d.reverseCents)+")":"")+"</div>"}).join("")+"</div>";
  app.innerHTML=h}
function depCarte(d){
  var st=DEPST[d.statut]||[d.statut,""],op=DEP.open===d.id,vendu=d.statut==="vendu";
  var h="<div class='card'><div style='display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap'><div><b>DV-"+d.id+" · "+esc(d.marque+" "+d.modele)+"</b> <span class='tag "+st[1]+"'>"+st[0]+"</span><div class='muted'>"+esc(d.client)+(d.telephone?" · "+esc(d.telephone):"")+(d.annee?" · "+esc(d.annee):"")+(d.km?" · "+esc(d.km)+" km":"")+(d.magasin?" · "+esc(d.magasin):"")+(d.emplacement?" · 📍 "+esc(d.emplacement):"")+"</div></div><div style='text-align:right'><div style='font-size:22px;font-weight:800'>"+depEur(vendu&&d.prixVenduCents?d.prixVenduCents:d.prixCents)+"</div><div class='muted'>"+(vendu?"prix de vente":"prix affiché")+"</div></div></div>";
  h+="<table class='payh' style='margin:8px 0'><tr><td>Commission boutique ("+depEur(d.fixeCents)+" + "+d.pct+" %)</td><td class='n'>- "+depEur(d.commissionCents)+"</td></tr><tr><td>Remise en état"+(d.fraisAuto?" <span class='muted'>(total du devis "+esc(d.numero)+")</span>":"")+"</td><td class='n'>- "+depEur(d.fraisCents)+"</td></tr><tr><td><b>"+(vendu||d.statut==="reverse"?"À reverser au déposant":"Estimation pour le déposant")+"</b></td><td class='n'><b style='font-size:18px;color:#1e8449'>"+depEur(d.statut==="reverse"?d.reverseCents:d.reverserCents)+"</b></td></tr></table>";
  if(d.statut==="reverse")h+="<div class='muted'>Reversé le "+esc(dateLongue(d.reverseLe))+" par "+esc(d.reversePar)+"</div>";
  h+="<div class='actions'>";
  if(d.repairId)h+="<button class='sec' data-act='depPC' data-id='"+d.repairId+"'>🔧 Révision "+esc(d.numero)+"</button>";
  if(d.statut==="revision")h+="<button data-act='depStatut' data-id='"+d.id+"' data-s='en_vente'>✅ Révision faite : mettre en vente</button>";
  if(d.statut==="en_vente"){h+="<button data-act='depVendre' data-id='"+d.id+"'>🛒 Vendre en caisse</button><button class='sec' data-act='depStatut' data-id='"+d.id+"' data-s='retire'>Retirer de la vente</button>"}
  if(d.statut==="revision")h+="<button class='sec' data-act='depVendre' data-id='"+d.id+"'>🛒 Vendre en caisse</button>";
  if(d.shopifyUrl)h+="<a class='sec' style='display:inline-block;padding:12px 16px' target='_blank' href='"+esc(d.shopifyUrl)+"'>🛍 Fiche Shopify</a>";
  else if(d.statut!=="vendu")h+="<button class='sec' data-act='depShopify' data-id='"+d.id+"'>🛍 Créer la fiche Shopify</button>";
  if(vendu)h+="<span class='muted'>Reverser par :</span><div class='seg' style='flex:0 1 auto'><button data-act='depReverse' data-id='"+d.id+"' data-m='virement'>🏦 Virement</button><button data-act='depReverse' data-id='"+d.id+"' data-m='especes'>💶 Espèces</button><button data-act='depReverse' data-id='"+d.id+"' data-m='cheque'>Chèque</button></div>";
  if(d.statut!=="reverse")h+="<button class='sec' data-act='depOpen' data-id='"+d.id+"'>✏ Modifier</button>";
  h+="</div>";
  if(op)h+="<div class='dl' style='margin-top:8px'><input id='dp-p' placeholder='Prix €' value='"+String(d.prixCents/100).replace(".",",")+"'><input id='dp-f' placeholder='Commission fixe €' value='"+String(d.fixeCents/100).replace(".",",")+"'><input id='dp-c' placeholder='Commission %' value='"+d.pct+"'><input id='dp-r' placeholder='Remise en état € (vide = auto)' value='"+(d.fraisAuto?"":String(d.fraisCents/100).replace(".",","))+"'></div><div class='dl'><input id='dp-e' class='lb' placeholder='Emplacement en boutique' value='"+esc(d.emplacement)+"'></div><div class='actions'><button data-act='depSave' data-id='"+d.id+"'>Enregistrer</button><button class='sec' data-act='depOpen' data-id='"+d.id+"'>Fermer</button></div>";
  return h+"</div>"}
var DEPQ=null;
function depQuest(){
  if(!DEPQ){api("/depots/questionnaire").then(function(d){DEPQ=d;render()}).catch(function(){DEPQ={champs:[],accessoires:[]}});return""}
  var P={couleur:"Noir, gris…",vitesse:"25 km/h (débridable ?)",autonomie:"40 km",poids:"15 kg",batterie:"36 V 10 Ah, état correct",moteur:"350 W",freins:"Disque hydraulique",pneus:"10 pouces tubeless, usure moyenne",suspensions:"Avant et arrière",eclairage:"Phare, stop, clignotants",ecran:"Fonctionne",garantie:"Aucune"};
  return"<div class='step' style='margin-top:10px'>Questionnaire (remplit la fiche Shopify automatiquement)</div><div class='dl' style='flex-wrap:wrap'>"+DEPQ.champs.map(function(c){return"<input id='dq-"+c.k+"' placeholder='"+esc(c.l+" : "+(P[c.k]||""))+"' style='flex:1 1 240px'>"}).join("")+"</div>"
    +"<div class='muted' style='margin-top:6px'>Fourni avec la trottinette :</div><div class='seg' style='flex-wrap:wrap'>"+DEPQ.accessoires.map(function(a,i){return"<label style='display:inline-flex;gap:6px;align-items:center;padding:8px 12px;border:1px solid #bbb;border-radius:8px;margin:3px'><input type='checkbox' class='dq-acc' value='"+esc(a)+"'> "+esc(a)+"</label>"}).join("")+"</div>"}
function depOptions(){var o={};if(DEPQ)DEPQ.champs.forEach(function(c){var e=document.getElementById("dq-"+c.k);if(e&&e.value.trim())o[c.k]=e.value.trim()});o.accessoires=Array.prototype.slice.call(document.querySelectorAll(".dq-acc")).filter(function(e){return e.checked}).map(function(e){return e.value});return o}
function depForm(){
  var h="<div class='card'><div class='step'>Nouveau dépôt</div>";
  if(!DEP.cli){
    h+="<div class='dl'><input id='dn-q' class='lb' placeholder='Chercher le déposant (nom, téléphone, email)'><button data-act='depCherche'>Chercher</button></div>";
    if(DEP.res)h+=(DEP.res.length?DEP.res.map(function(c,i){return"<button class='sec hrow' data-act='depChoisi' data-i='"+i+"'><b>"+esc(c.name)+"</b> <span class='muted'>"+esc(c.phone||"")+" "+esc(c.email||"")+"</span></button>"}).join(""):"<div class='muted'>Aucun client trouvé : crée-le d'abord (onglet Client).</div>");
  }else{
    h+="<div><b>"+esc(DEP.cli.name)+"</b> <button class='link' data-act='depChange'>Changer</button></div>";
    if(DEP.ts.length)h+="<div class='muted' style='margin-top:6px'>Sa trottinette :</div><div class='seg'>"+DEP.ts.map(function(t){return"<button class='"+(DEP.ch===t.id?"on":"")+"' data-act='depTrott' data-id='"+t.id+"'>"+esc(t.marque+" "+t.modele)+"</button>"}).join("")+"<button class='"+(DEP.ch===0?"on":"")+"' data-act='depTrott' data-id='0'>Autre trottinette</button></div>";
    if(!DEP.ts.length||DEP.ch===0)h+="<div class='dl'><input id='dn-ma' placeholder='Marque'><input id='dn-mo' placeholder='Modèle'></div>";
    h+=depQuest();
    h+="<div class='dl'><input id='dn-an' placeholder='Année'><input id='dn-km' placeholder='Kilométrage'><input id='dn-px' placeholder='Prix de vente souhaité €'></div><div class='dl'><input id='dn-et' class='lb' placeholder='État (rayures, pièces usées…)'></div><div class='dl'><input id='dn-em' class='lb' placeholder='Emplacement en boutique (facultatif)'></div><div class='dl'><input id='dn-no' class='lb' placeholder='Note'></div>"
      +"<div class='muted'>Une prise en charge « révision + pièces critiques » est créée automatiquement.</div><div class='actions'><button data-act='depCree'>Enregistrer le dépôt</button><button class='sec' data-act='depNouv'>Annuler</button></div>"}
  return h+"</div>"}
ACTS.depNouv=function(){DEP.nouv=!DEP.nouv;DEP.res=null;DEP.cli=null;DEP.ts=[];DEP.ch=0;render()};
ACTS.depCherche=function(){var q=v("dn-q");if(!q)return;api("/search?q="+encodeURIComponent(q)).then(function(r){DEP.res=r;render()}).catch(function(e){alert(e.message)})};
ACTS.depChoisi=function(b){var c=DEP.res[+b.dataset.i];DEP.cli=c;DEP.ts=c.trottinettes||[];DEP.ch=DEP.ts.length?DEP.ts[0].id:0;render()};
ACTS.depChange=function(){DEP.cli=null;DEP.res=null;render()};
ACTS.depTrott=function(b){DEP.ch=+b.dataset.id;render()};
ACTS.depCree=async function(){
  try{var d=await api("/depots",{clientId:DEP.cli.id,trottinetteId:DEP.ts.length&&DEP.ch?DEP.ch:0,marque:v("dn-ma"),modele:v("dn-mo"),annee:v("dn-an"),km:v("dn-km"),prix:v("dn-px"),etat:v("dn-et"),emplacement:v("dn-em"),note:v("dn-no"),options:depOptions()});
    DEP.nouv=false;DEP.cli=null;DEP.res=null;DEP.msg=d.message;DEP.list=null;render()}catch(e){alert(e.message)}};
ACTS.depOpen=function(b){var id=+b.dataset.id;DEP.open=DEP.open===id?0:id;render()};
ACTS.depSave=async function(b){try{await api("/depots/maj",{id:+b.dataset.id,prix:v("dp-p"),fixe:v("dp-f"),pct:v("dp-c"),frais:v("dp-r"),emplacement:v("dp-e")});DEP.open=0;DEP.list=null;render()}catch(e){alert(e.message)}};
ACTS.depStatut=async function(b){try{await api("/depots/maj",{id:+b.dataset.id,statut:b.dataset.s});DEP.list=null;render()}catch(e){alert(e.message)}};
ACTS.depPC=function(b){ouvrirFiche(+b.dataset.id)};
ACTS.depShopify=async function(b){b.disabled=true;try{var d=await api("/depots/shopify",{id:+b.dataset.id});DEP.msg=d.message;DEP.list=null;render()}catch(e){b.disabled=false;alert(e.message)}};
ACTS.depReverse=async function(b){var d=DEP.list.filter(function(x){return x.id===+b.dataset.id})[0];if(!confirm("Reverser "+depEur(d.reverserCents)+" à "+d.client+" ("+b.dataset.m+") ?"))return;try{var r=await api("/depots/reverser",{id:d.id,moyen:b.dataset.m});DEP.msg=r.message;DEP.list=null;render()}catch(e){alert(e.message)}};
ACTS.depVendre=function(b){var d=DEP.list.filter(function(x){return x.id===+b.dataset.id})[0];if(!d)return;
  if(PAN.length&&!confirm("Le panier de la caisse n'est pas vide : il sera remplacé."))return;
  cReset();PAN.push({libelle:"Trottinette dépôt-vente DV#"+d.id+" : "+d.marque+" "+d.modele,quantite:1,prix:String(d.prixCents/100).replace(".",",")});
  CUR=null;FICHE=null;CPOP=false;TAB="accueil";render()};
`;
