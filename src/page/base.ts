export const BASE = `var PW=sessionStorage.getItem("atelierPw")||"",TOK=sessionStorage.getItem("atelierToken")||"",PRENOM=sessionStorage.getItem("atelierPrenom")||"",ROLE=sessionStorage.getItem("atelierRole")||"",MAG=sessionStorage.getItem("atelierMagasin")||"";
var LG={step:"mag"};
var CUR=null,RES=[],SEARCHED=false,TAB="accueil",MSG="";
var CONS=null,CHIF=null,EDITCONS=false,NEWCLI=false,ADDT=false,RECEP=null,EDITCLI=false,FID=null,FIDLOAD=null;
var ST=["reçu","diagnostic","devis envoyé","en attente de pièce","en réparation","prêt","récupéré"];
var TABS=[["accueil","Dashboard"],["enc","Atelier"],["cmd","Commandes"],["stock","Stock"],["etq","Étiquettes"]];
var CLAB={upsell:"Upsell du jour",offre:"Offre du moment",fidelite:"Avantages de la carte fidélité",autre:"Autre consigne"};
var RACC="",ATSUB="liste",VUE="tout",LST=null,FICHE=null,PJOUR="",PMAG="",PLAN=null,PMSG="",PSEQ=0,DRAG=null,PSEL=null,PPEND=null;
var app=document.getElementById("app"),nav=document.getElementById("nav");
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(m){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]})}
function v(id){var e=document.getElementById(id);return e?String(e.value).trim():""}
function eur(c){return (c/100).toFixed(2).replace(".",",")+" €"}
function day(d){try{return new Date(d).toLocaleDateString("fr-FR")}catch(e){return d||""}}
function dayHour(d){try{return new Date(d).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}catch(e){return d||""}}
function today(){return new Date().toISOString().slice(0,10)}
function initiales(c){var s=((c.prenom||"").charAt(0)+(c.nom||"").charAt(0)).toUpperCase();return s||"?"}
function estResp(){return ROLE==="admin"||ROLE==="responsable"}
function saveSession(){var m={atelierToken:TOK,atelierPrenom:PRENOM,atelierRole:ROLE,atelierMagasin:MAG,atelierPw:PW};Object.keys(m).forEach(function(k){if(m[k])sessionStorage.setItem(k,m[k]);else sessionStorage.removeItem(k)})}
function clearSession(){TOK="";PW="";PRENOM="";ROLE="";MAG="";CUR=null;RES=[];SEARCHED=false;CONS=null;CHIF=null;TAB="accueil";ADDT=false;RECEP=null;EDITCLI=false;FID=null;EDITCONS=false;NEWCLI=false;ATSUB="liste";VUE="tout";LST=null;FICHE=null;PJOUR="";PMAG="";PLAN=null;PSEL=null;PPEND=null;PMSG="";saveSession()}
async function api(path,body){
  var h={"Content-Type":"application/json"};if(TOK)h["x-atelier-token"]=TOK;else h["x-atelier-password"]=PW;
  var o={headers:h};if(body!==undefined){o.method="POST";o.body=JSON.stringify(body)}
  var r=await fetch("/api"+path,o);var d=await r.json().catch(function(){return{}});
  if(r.status===401){clearSession();LG={step:"mag"};MSG="Session expirée : reconnecte-toi.";render();throw new Error(MSG)}
  if(!r.ok)throw new Error(d.error||"Erreur, réessayer.");return d}
function renderWho(){
  var on=!!(TOK||PW);
  var rc=document.getElementById("rech");if(rc)rc.style.display=on?"":"none";
  if(!on){var rq=document.getElementById("rq");if(rq)rq.value="";rechHide()}
  var el=document.getElementById("who");if(!el)return;
  el.innerHTML=on?"<span>"+esc(PRENOM)+" · "+esc(MAG||"Secours")+"</span>"+(ROLE==="admin"?"<button class='gear"+(TAB==="param"?" on":"")+"' data-act='tab' data-tab='param' title='Paramètres'>&#9881;</button>":"")+"<button class='sec' data-act='logout'>Changer de profil</button>":""}
function render(){
  renderWho();
  if(!TOK&&!PW){vLogin();return}
  nav.innerHTML=TABS.filter(function(t){return t[0]!=="param"||ROLE==="admin"}).map(function(t){return"<button data-act='tab' data-tab='"+t[0]+"'"+(TAB===t[0]?" class='on'":"")+">"+t[1]+"</button>"}).join("");
  ({accueil:vAccueil,enc:vEnc,cmd:vCmd,stock:vStock,etq:vEtq,param:vParam})[TAB]()}
`;
