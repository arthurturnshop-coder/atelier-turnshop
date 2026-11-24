export const BASE = `var PW=sessionStorage.getItem("atelierPw")||"",TOK=sessionStorage.getItem("atelierToken")||"",PRENOM=sessionStorage.getItem("atelierPrenom")||"",ROLE=sessionStorage.getItem("atelierRole")||"",MAG=sessionStorage.getItem("atelierMagasin")||"";
var LG={step:"mag"};
var CUR=null,RES=[],SEARCHED=false,TAB="accueil",MSG="";
var CONS=null,CHIF=null,EDITCONS=false,NEWCLI=false,ADDT=false,RECEP=null,EDITCLI=false,FID=null,FIDLOAD=null;
var ST=["reçu","diagnostic","devis envoyé","en attente de pièce","en réparation","prêt","récupéré"];
var TABS=[["accueil","Dashboard"],["enc","Atelier"],["cmd","Commandes"],["stock","Stock"],["etq","Étiquettes"],["cli","Client"],["compta","Compta"]];
var CLAB={upsell:"Upsell du jour",offre:"Offre du moment",fidelite:"Avantages de la carte fidélité",autre:"Autre consigne"};
var RACC="",ATSUB="liste",VUE="tout",LST=null,FICHE=null,PJOUR="",PMAG="",PLAN=null,PMSG="",PSEQ=0,DRAG=null,PSEL=null,PPEND=null;
var app=document.getElementById("app"),nav=document.getElementById("nav");
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(m){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]})}
function v(id){var e=document.getElementById(id);return e?String(e.value).trim():""}
function eur(c){return (c/100).toFixed(2).replace(".",",")+String.fromCharCode(160)+"€"}
function day(d){try{return new Date(d).toLocaleDateString("fr-FR")}catch(e){return d||""}}
function dayHour(d){try{return new Date(d).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}catch(e){return d||""}}
function today(){return new Date().toISOString().slice(0,10)}
function initiales(c){var s=((c.prenom||"").charAt(0)+(c.nom||"").charAt(0)).toUpperCase();return s||"?"}
function estResp(){return ROLE==="admin"||ROLE==="responsable"}
function saveSession(){var m={atelierToken:TOK,atelierPrenom:PRENOM,atelierRole:ROLE,atelierMagasin:MAG,atelierPw:PW};Object.keys(m).forEach(function(k){if(m[k])sessionStorage.setItem(k,m[k]);else sessionStorage.removeItem(k)})}
function clearSession(){try{sessionStorage.removeItem("atelierView")}catch(e){}TOK="";PW="";PRENOM="";ROLE="";MAG="";CUR=null;RES=[];SEARCHED=false;CONS=null;CHIF=null;TAB="accueil";ADDT=false;RECEP=null;EDITCLI=false;FID=null;EDITCONS=false;NEWCLI=false;ATSUB="liste";VUE="tout";LST=null;FICHE=null;PJOUR="";PMAG="";PLAN=null;PSEL=null;PPEND=null;PMSG="";saveSession()}
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
  el.innerHTML=on?"<span>"+esc(PRENOM)+" · "+esc(MAG||"Secours")+"</span><button class='gear"+(TAB==="chat"?" on":"")+"' data-act='tab' data-tab='chat' title='Chat équipe' style='position:relative'>&#128172;<span id='chatb' style='display:none;position:absolute;top:-6px;right:-6px;background:#c0392b;color:#fff;border-radius:10px;font-size:11px;padding:1px 6px;font-weight:700'></span></button><button class='gear"+(TAB==="retours"?" on":"")+"' data-act='tab' data-tab='retours' title='Signaler un bug ou une idée'>&#128161;</button>"+((ROLE==="admin"||ROLE==="responsable")?"<button class='gear"+(TAB==="stats"?" on":"")+"' data-act='tab' data-tab='stats' title='Statistiques'>&#128202;</button>":"")+(ROLE==="admin"?"<button class='gear"+(TAB==="param"?" on":"")+"' data-act='tab' data-tab='param' title='Paramètres'>&#9881;</button>":"")+"<button class='gear' data-act='mdpPrompt' title='Changer mon mot de passe'>&#128273;</button><button class='sec' data-act='logout'>Changer de profil</button>":""}
var VIEWF=0,VIEWC=0;
function viewSave(){
  if(!TOK&&!PW)return;
  try{sessionStorage.setItem("atelierView",JSON.stringify({t:TAB,a:ATSUB,v:VUE,f:(FICHE&&FICHE.id)||0,c:(CUR&&CUR.id)||0,k:{p:PAN,c:CCLI,u:CUSE,r:CREP,y:CPAY,o:CAVOFF}}))}catch(e){}}
function viewRestore(){
  if(!TOK&&!PW)return;
  var s=null;try{s=JSON.parse(sessionStorage.getItem("atelierView")||"null")}catch(e){}
  if(!s)return;
  var ok=TABS.some(function(t){return t[0]===s.t})||s.t==="stats"||s.t==="retours"||s.t==="chat"||(s.t==="param"&&ROLE==="admin");
  if(ok)TAB=s.t;
  if(["liste","planning","creer","devis"].indexOf(s.a)>=0)ATSUB=s.a;
  if(s.v)VUE=s.v;
  VIEWF=s.f||0;VIEWC=s.c||0;
  if(s.k){try{if(Array.isArray(s.k.p))PAN=s.k.p;if(s.k.c){CCLI=s.k.c;CUSE=!!s.k.u;api("/caisse/client?id="+s.k.c.id).then(function(d){CFID=d.fidelite;render()}).catch(function(){})}if(s.k.y)CPAY=s.k.y;if(Array.isArray(s.k.o))CAVOFF=s.k.o}catch(e){}}}
function viewRestoreOpen(){
  if(VIEWF){var f=VIEWF;VIEWF=0;VIEWC=0;ouvrirFiche(f);return}
  if(VIEWC){var c=VIEWC;VIEWC=0;rechOpen(c)}}
var CMDP="";
document.addEventListener("input",function(e){if(e.target&&e.target.id==="c-mdp")CMDP=e.target.value});
function render(){
  var dr0=document.querySelector(".dright"),st0=dr0?dr0.scrollTop:0;
  render0();
  if(st0){var dr1=document.querySelector(".dright");if(dr1)dr1.scrollTop=st0}}
function render0(){
  if(TAB==="compta"&&ROLE!=="admin")TAB="accueil";
  renderWho();
  if(!TOK&&!PW){vLogin();return}
  nav.innerHTML=TABS.filter(function(t){return (t[0]!=="param"||ROLE==="admin")&&(t[0]!=="compta"||ROLE==="admin")}).map(function(t){return"<button data-act='tab' data-tab='"+t[0]+"'"+(TAB===t[0]?" class='on'":"")+">"+t[1]+"</button>"}).join("");
  ({accueil:vAccueil,enc:vEnc,cmd:vCmd,stock:vStock,etq:vEtq,param:vParam,stats:vStats,compta:vCompta,retours:vRetours,chat:vChat,cli:function(){CLV.ventes=CLV.ventes;vClient();clCharge()}})[TAB]();viewSave();if(typeof chatBadge==="function")chatBadge()}

// Bips de scan : aigu et court = OK, grave et long = code inconnu
var AUDIOCTX=null;
function bip(f,d,n){try{var A=window.AudioContext||window.webkitAudioContext;if(!A)return;if(!AUDIOCTX)AUDIOCTX=new A();var c=AUDIOCTX;if(c.state==="suspended")c.resume();
  for(var k=0;k<n;k++){var o=c.createOscillator(),g=c.createGain();o.type="square";o.frequency.value=f;o.connect(g);g.connect(c.destination);var t=c.currentTime+k*(d+0.07);g.gain.setValueAtTime(0.15,t);g.gain.exponentialRampToValueAtTime(0.001,t+d);o.start(t);o.stop(t+d)}}catch(e){}}
function bipOk(){bip(1800,0.09,1)}
function bipKo(){bip(300,0.22,2)}
function toastKo(t){try{var d=document.createElement("div");d.textContent=t;d.style.cssText="position:fixed;top:14px;left:50%;transform:translateX(-50%);background:#c0392b;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;z-index:99999;box-shadow:0 4px 14px rgba(0,0,0,.3)";document.body.appendChild(d);setTimeout(function(){d.remove()},3500)}catch(e){}}
function toastOk(t){try{var d=document.createElement("div");d.textContent="✓ "+t;d.style.cssText="position:fixed;top:14px;left:50%;transform:translate(-50%,-30px);opacity:0;transition:all .25s ease;background:#1e8449;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;z-index:99999;box-shadow:0 4px 14px rgba(0,0,0,.3)";document.body.appendChild(d);setTimeout(function(){d.style.opacity="1";d.style.transform="translate(-50%,0)"},20);setTimeout(function(){d.style.opacity="0";d.style.transform="translate(-50%,-30px)"},1800);setTimeout(function(){d.remove()},2200)}catch(e){}}
`;
