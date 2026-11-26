export const RETOURSSITE = `// ---------- Retours : clients du site, SAV garantie, pièces renvoyées aux fournisseurs ----------
var RS={d:null,msg:"",nouv:false,filtre:"tous",type:"retour",modele:false};
var RSTAT={demande:"Demande reçue",attente:"Colis attendu",recu:"Colis reçu",ok:"Testé OK",ko:"Testé : défaut",rembourse:"Remboursé",fournisseur:"Chez le fournisseur",refuse:"Refusé",clos:"Clôturé"};
function rsLoad(){api("/retours-site").then(function(d){RS.d=d;if(TAB==="rsite")render()}).catch(function(e){RS.msg=e.message;RS.d=RS.d||{retours:[],modele:""};if(TAB==="rsite")render()})}
function rsFerme(r){return r.statut==="rembourse"||r.statut==="refuse"||r.statut==="clos"}
function rsBtn(id,etat,txt,cls){return"<button class='"+(cls||"")+"' data-act='rsEtat' data-id='"+id+"' data-etat='"+etat+"'>"+txt+"</button>"}
function rsCarte(r){
  var h="<div class='card'><div style='display:flex;gap:8px;align-items:center;flex-wrap:wrap'><b>R"+r.id+"</b> <span class='tag"+(r.type==="garantie"?" warn":"")+"'>"+(r.type==="garantie"?"SAV garantie":r.type==="fournisseur"?"Fournisseur":"Retour client")+"</span> <span class='tag'>"+esc(r.type==="fournisseur"?({demande:"À renvoyer",fournisseur:"Renvoyé, en attente",rembourse:"Avoir / remboursement reçu",clos:"Terminé",refuse:"Annulé"}[r.statut]||r.statut):(RSTAT[r.statut]||r.statut))+"</span><span class='muted'>"+esc(dateLongue(r.cree))+(r.par?" · "+esc(r.par):"")+"</span></div>"
    +"<div style='margin-top:4px'><b>"+esc(r.produit)+"</b>"+(r.commande?" · commande "+esc(r.commande):"")+"</div>"
    +((r.nom||r.email||r.telephone)?"<div class='muted'>"+esc(r.nom)+(r.email?" · "+esc(r.email):"")+(r.telephone?" · "+esc(r.telephone):"")+"</div>":"")
    +(r.motif?"<div class='muted'>Motif : "+esc(r.motif)+"</div>":"")
    +(r.mail?"<div class='muted'>Mail d instructions envoyé le "+esc(dateLongue(r.mail))+"</div>":"")
    +(r.fournisseur?"<div class='muted'>Fournisseur : "+esc(r.fournisseur)+"</div>":"")
    +(r.montantCents?"<div class='muted'>Montant : "+eur(r.montantCents)+"</div>":"");
  if(!rsFerme(r)&&r.type==="fournisseur"){
    var a2="";
    if(r.statut==="demande")a2+="<input id='rs-f"+r.id+"' class='lb' placeholder='Fournisseur' value='"+esc(r.fournisseur||"")+"' style='max-width:200px'>"+rsBtn(r.id,"fournisseur","Colis renvoyé au fournisseur")+rsBtn(r.id,"refuse","Annuler","sec");
    else a2+="<input id='rs-m"+r.id+"' class='lb' placeholder='Montant de l avoir (€)' value='"+(r.montantCents?(r.montantCents/100).toFixed(2).replace(".",","):"")+"' style='max-width:200px'>"+rsBtn(r.id,"rembourse","Avoir / remboursement reçu")+rsBtn(r.id,"clos","Remplacée par le fournisseur","sec");
    h+="<div class='actions' style='margin-top:8px'>"+a2+"</div>";
  }else if(!rsFerme(r)){
    var a="";
    if(r.statut==="demande")a+=(RS.d.emailOk&&r.email?"<button data-act='rsMail' data-id='"+r.id+"'>Envoyer le mail d instructions</button>":"")+rsBtn(r.id,"attente","Mail déjà envoyé","sec")+rsBtn(r.id,"refuse","Refuser","sec");
    else if(r.statut==="attente")a+=rsBtn(r.id,"recu","Colis reçu")+(RS.d.emailOk&&r.email?"<button class='sec' data-act='rsMail' data-id='"+r.id+"'>Renvoyer le mail</button>":"")+rsBtn(r.id,"refuse","Refuser","sec");
    else if(r.statut==="recu")a+=rsBtn(r.id,"ok","Testé : tout est OK")+rsBtn(r.id,"ko","Testé : défaut constaté","sec");
    else if(r.statut==="ok")a+="<input id='rs-m"+r.id+"' class='lb' placeholder='Montant à rembourser (€)' value='"+(r.montantCents?(r.montantCents/100).toFixed(2).replace(".",","):"")+"' style='max-width:200px'>"+rsBtn(r.id,"rembourse","Remboursé dans Shopify")+rsBtn(r.id,"refuse","Refuser / renvoyer au client","sec");
    else if(r.statut==="ko")a+="<input id='rs-f"+r.id+"' class='lb' placeholder='Fournisseur (ex : eWheel)' value='"+esc(r.fournisseur||"")+"' style='max-width:200px'>"+rsBtn(r.id,"fournisseur","Envoyé au fournisseur")+"<input id='rs-m"+r.id+"' class='lb' placeholder='Remboursement client (€)' style='max-width:180px'>"+rsBtn(r.id,"rembourse","Remboursé dans Shopify","sec")+rsBtn(r.id,"refuse","Refuser","sec");
    else if(r.statut==="fournisseur")a+=rsBtn(r.id,"clos","Dossier terminé")+"<input id='rs-m"+r.id+"' class='lb' placeholder='Remboursement client (€)' style='max-width:180px'>"+rsBtn(r.id,"rembourse","Remboursé dans Shopify","sec");
    h+="<div class='actions' style='margin-top:8px'>"+a+"</div>";
  }
  h+="<textarea id='rs-n"+r.id+"' rows='2' style='width:100%;margin-top:8px' placeholder='Notes (test, état du produit, échanges avec le client...)'>"+esc(r.note||"")+"</textarea><div class='actions'><button class='sec' data-act='rsNote' data-id='"+r.id+"'>Enregistrer la note</button></div></div>";
  return h}
function vRsite(){
  if(!RS.d){rsLoad();app.innerHTML="<div class='caisse'><div class='card'>Chargement…</div></div>";return}
  var L=(RS.d.retours||[]).filter(function(r){return RS.filtre==='tous'||(RS.filtre==='fournisseur'?r.type==='fournisseur':r.type!=='fournisseur')}),ouv=L.filter(function(r){return !rsFerme(r)}),fer=L.filter(rsFerme);
  var h="<div class='caisse'><h3>Retours</h3>"
    +"<div class='actions'><button data-act='rsNouv'>"+(RS.nouv?"Fermer":"+ Nouveau retour")+"</button><button class='sec' data-act='rsModele'>"+(RS.modele?"Masquer":"Modifier le mail type")+"</button></div>"
    +"<div class='actions'><button class='"+(RS.filtre==="tous"?"":"sec")+"' data-act='rsFiltre' data-f='tous'>Tous</button><button class='"+(RS.filtre==="client"?"":"sec")+"' data-act='rsFiltre' data-f='client'>Clients</button><button class='"+(RS.filtre==="fournisseur"?"":"sec")+"' data-act='rsFiltre' data-f='fournisseur'>Fournisseurs</button></div>"
    +(RS.msg?"<div class='muted'>"+esc(RS.msg)+"</div>":"");
  if(RS.modele)h+="<div class='card'><div class='step'>Mail envoyé au client</div><div class='muted'>Variables : {prenom} {commande} {produit} {numero}</div><textarea id='rs-modele' rows='12' style='width:100%'>"+esc(RS.d.modele||"")+"</textarea><div class='actions'><button data-act='rsModeleSave'>Enregistrer le mail</button></div></div>";
  if(RS.nouv){var fo=RS.type==="fournisseur";h+="<div class='card'><div class='step'>Nouveau retour</div>"
    +"<div class='actions'><button data-act='rsType' data-t='retour' class='"+(RS.type==="retour"?"":"sec")+"'>Client (site)</button><button data-act='rsType' data-t='garantie' class='"+(RS.type==="garantie"?"":"sec")+"'>SAV garantie</button><button data-act='rsType' data-t='fournisseur' class='"+(fo?"":"sec")+"'>Pièce au fournisseur</button></div>"
    +(fo?"<div class='dl'><input id='rs-fou' class='lb' placeholder='Fournisseur (ex : eWheel)'><input id='rs-cmd' class='lb' placeholder='N° de commande ou BL fournisseur'></div>":"<div class='dl'><input id='rs-nom' class='lb' placeholder='Nom du client'><input id='rs-em' class='lb' placeholder='Email'></div><div class='dl'><input id='rs-tel' class='lb' placeholder='Téléphone'><input id='rs-cmd' class='lb' placeholder='N° de commande (#1234)'></div>")
    +"<div class='dl'><input id='rs-prod' class='lb' placeholder='"+(fo?"Pièce à renvoyer":"Produit concerné")+"'>"+(fo?"<input id='rs-mt' class='lb' placeholder='Montant attendu (€)'>":"")+"</div>"
    +"<textarea id='rs-motif' rows='3' style='width:100%' placeholder='"+(fo?"Motif (défectueuse, mauvaise référence, erreur de commande...)":"Motif indiqué par le client (formulaire du site)")+"'></textarea>"
    +"<div class='actions'><button data-act='rsCree'>Enregistrer</button></div></div>"}
  h+="<div class='step' style='margin-top:12px'>À traiter ("+ouv.length+")</div>"+(ouv.length?ouv.map(rsCarte).join(""):"<div class='card muted'>Aucun retour en cours.</div>");
  if(fer.length)h+="<div class='step' style='margin-top:12px'>Terminés ("+fer.length+")</div>"+fer.slice(0,20).map(rsCarte).join("");
  app.innerHTML=h+"</div>"}
ACTS.rsNouv=function(){RS.nouv=!RS.nouv;RS.type="retour";render()};
ACTS.rsModele=function(){RS.modele=!RS.modele;render()};
ACTS.rsType=function(b){RS.type=b.dataset.t;render()};
ACTS.rsFiltre=function(b){RS.filtre=b.dataset.f;render()};
ACTS.rsCree=async function(){try{var d=await api("/retours-site",{type:RS.type||"retour",nom:v("rs-nom"),email:v("rs-em"),telephone:v("rs-tel"),commande:v("rs-cmd"),produit:v("rs-prod"),motif:v("rs-motif"),fournisseur:RS.type==="fournisseur"?v("rs-fou"):"",montantCents:RS.type==="fournisseur"?Math.round(parseFloat((v("rs-mt")||"0").replace(",","."))*100)||0:0});RS.msg=d.message;RS.nouv=false;RS.d=null;render()}catch(e){alert(e.message)}};
ACTS.rsModeleSave=async function(){try{var d=await api("/retours-site/modele",{texte:v("rs-modele")});RS.msg=d.message;RS.modele=false;RS.d=null;render()}catch(e){alert(e.message)}};
ACTS.rsMail=async function(b){try{var d=await api("/retours-site/mail",{id:Number(b.dataset.id)});RS.msg=d.message;RS.d=null;render()}catch(e){alert(e.message)}};
ACTS.rsNote=async function(b){try{await api("/retours-site/maj",{id:Number(b.dataset.id),note:v("rs-n"+b.dataset.id)});RS.msg="Note enregistrée.";RS.d=null;render()}catch(e){alert(e.message)}};
ACTS.rsEtat=async function(b){var id=Number(b.dataset.id),o={id:id,statut:b.dataset.etat,note:v("rs-n"+id)};
  var m=document.getElementById("rs-m"+id);if(m&&m.value)o.montantCents=Math.round(parseFloat(m.value.replace(",","."))*100)||0;
  var f=document.getElementById("rs-f"+id);if(f)o.fournisseur=f.value;
  try{await api("/retours-site/maj",o);RS.d=null;render()}catch(e){alert(e.message)}};
`;
