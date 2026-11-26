export const BASE = `var PW=sessionStorage.getItem("atelierPw")||"",TOK=sessionStorage.getItem("atelierToken")||"",PRENOM=sessionStorage.getItem("atelierPrenom")||"",ROLE=sessionStorage.getItem("atelierRole")||"",MAG=sessionStorage.getItem("atelierMagasin")||"";
var LG={step:"mag"};
var CUR=null,RES=[],SEARCHED=false,TAB="accueil",MSG="";
var CONS=null,CHIF=null,EDITCONS=false,NEWCLI=false,ADDT=false,RECEP=null,EDITCLI=false,FID=null,FIDLOAD=null;
var ST=["reçu","diagnostic","devis envoyé","en attente de pièce","à faire","en réparation","prêt","récupéré"];
var TABS=[["accueil","Dashboard"],["enc","Atelier"],["cmd","Commandes"],["rsite","Retours"],["stock","Stock"],["etq","Étiquettes"],["cli","Client"],["process","Process"],["compta","Compta"]];
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
function saveSession(){if(!ACT){OWNP=PRENOM;OWNR=ROLE}var m={atelierToken:TOK,atelierPrenom:OWNP,atelierRole:OWNR,atelierMagasin:MAG,atelierPw:PW};Object.keys(m).forEach(function(k){if(m[k])sessionStorage.setItem(k,m[k]);else sessionStorage.removeItem(k)})}
function clearSession(){try{localStorage.removeItem("atelierViewL")}catch(e){}ACT=null;OWNP="";OWNR="";try{sessionStorage.removeItem("atelierAct")}catch(e){}VTOUS=false;try{sessionStorage.removeItem("atelierTous")}catch(e){}try{sessionStorage.removeItem("atelierView")}catch(e){}TOK="";PW="";PRENOM="";ROLE="";MAG="";CUR=null;RES=[];SEARCHED=false;CONS=null;CHIF=null;TAB="accueil";ADDT=false;RECEP=null;EDITCLI=false;FID=null;EDITCONS=false;NEWCLI=false;ATSUB="liste";VUE="tout";LST=null;FICHE=null;PJOUR="";PMAG="";PLAN=null;PSEL=null;PPEND=null;PMSG="";saveSession()}
var VTOUS=false;try{VTOUS=sessionStorage.getItem("atelierTous")==="1"}catch(e){}
var ACT=null,ACTLOCK=5*60*1000,LOCKED=false,OWNP=sessionStorage.getItem("atelierPrenom")||"",OWNR=sessionStorage.getItem("atelierRole")||"";
function actActif(){return !!(ACT&&ACT.until>Date.now())}
function actPersist(){try{if(ACT)sessionStorage.setItem("atelierAct",JSON.stringify(ACT));else sessionStorage.removeItem("atelierAct")}catch(e){}}
function setActeur(a){ACT={code:a.code||"",prenom:a.prenom,role:a.role,until:Date.now()+ACTLOCK};PRENOM=a.prenom;ROLE=a.role;actPersist();if(typeof renderWho==="function")renderWho()}
function actTouche(){if(ACT&&!LOCKED)ACT.until=Date.now()+ACTLOCK}
function verrouille(msg){
  if(LOCKED||(!TOK&&!PW))return;LOCKED=true;ACT=null;actPersist();
  var o=document.createElement("div");o.id="lockov";o.style.cssText="position:fixed;inset:0;background:#f4f5f7;z-index:10000;display:flex;align-items:center;justify-content:center";
  o.innerHTML="<div style='background:#fff;border-radius:14px;padding:26px;width:300px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.12)'><div style='font-size:34px'>&#128274;</div><div style='font-size:18px;font-weight:700;margin:4px 0'>Poste verrouillé</div><div class='muted' style='margin-bottom:10px'>Tape ton code à 3 chiffres</div><input type='password' inputmode='numeric' autocomplete='off' maxlength='3' style='font-size:30px;text-align:center;letter-spacing:8px;width:140px'><div id='lockmsg' style='color:#c0392b;min-height:20px;margin-top:8px'></div><button class='sec' data-x='1' style='margin-top:6px'>Se déconnecter</button></div>";
  document.body.appendChild(o);var inp=o.querySelector("input");inp.focus();
  if(msg)o.querySelector("#lockmsg").textContent=msg;
  async function tente(){var c=inp.value;try{
    var rq=await fetch("/api/acteur",{method:"POST",headers:{"Content-Type":"application/json","x-atelier-token":TOK||"","x-atelier-password":TOK?"":PW,"x-atelier-code":c},body:"{}"});
    var rd=await rq.json().catch(function(){return{}});
    if(rq.status===401){o.remove();LOCKED=false;clearSession();LG={step:"mag"};MSG="Session expirée : reconnecte-toi.";render();return}
    if(!rq.ok){inp.value="";o.querySelector("#lockmsg").textContent=rd.error||"Code refusé.";return}
    o.remove();LOCKED=false;setActeur({code:c,prenom:rd.prenom,role:rd.role});TAB=TAB;render()}catch(e){inp.value="";o.querySelector("#lockmsg").textContent="Erreur réseau, réessaie."}}
  inp.addEventListener("input",function(){if(/^[0-9]{3}$/.test(inp.value))tente()});
  o.querySelector("[data-x]").addEventListener("click",function(){o.remove();LOCKED=false;fetch("/auth/deconnexion",{method:"POST",headers:{"x-atelier-token":TOK}}).catch(function(){});clearSession();LG={step:"mag"};render()})}
function actLock(){verrouille()}
["click","keydown","touchstart"].forEach(function(ev){document.addEventListener(ev,actTouche,true)});
setInterval(function(){if(!TOK&&!PW)return;if(LOCKED)return;if(!ACT||ACT.until<Date.now())verrouille();else actPersist()},4000);
(function(){if(!TOK&&!PW)return;var a=null;try{a=JSON.parse(sessionStorage.getItem("atelierAct")||"null")}catch(e){}
  if(a&&a.until>Date.now()){ACT=a;PRENOM=a.prenom;ROLE=a.role}else{ACT=null;setTimeout(function(){verrouille()},0)}})();
async function api(path,body){
  var h={"Content-Type":"application/json"};if(TOK)h["x-atelier-token"]=TOK;else h["x-atelier-password"]=PW;
  if(body!==undefined&&body.mdpCaissier&&/^[0-9]{3}$/.test(String(body.mdpCaissier))){h["x-atelier-code"]=String(body.mdpCaissier)}
  else if(ACT&&ACT.code&&path!=="/acteur"){h["x-atelier-code"]=ACT.code}
  if(body!==undefined&&LOCKED)throw new Error("Poste verrouillé : tape ton code.");
  actTouche();
  if(VTOUS)h["x-atelier-vue"]="tous";
  var o={headers:h};if(body!==undefined){o.method="POST";o.body=JSON.stringify(body)}
  var r=await fetch("/api"+path,o);var d=await r.json().catch(function(){return{}});
  if(r.status===401){clearSession();LG={step:"mag"};MSG="Session expirée : reconnecte-toi.";render();throw new Error(MSG)}
  if(!r.ok)throw new Error(d.error||"Erreur, réessayer.");return d}
function renderWho(){
  var on=!!(TOK||PW);
  var rc=document.getElementById("rech");if(rc)rc.style.display=on?"":"none";
  if(!on){var rq=document.getElementById("rq");if(rq)rq.value="";rechHide()}
  var el=document.getElementById("who");if(!el)return;
  if(on&&typeof pcrLoad==="function")pcrLoad();
  el.innerHTML=on?"<span>"+esc(PRENOM)+" · "+esc(MAG||"Secours")+"</span>"+(ROLE==="admin"?"<button class='"+(VTOUS?"":"sec")+"' data-act='vueTous' title='Admin : voir Rouen et Amiens mélangés' style='margin-left:6px'>"+(VTOUS?"Vue : tous les magasins":"Vue : "+esc(MAG))+"</button>":"")+"<button class='sec' data-act='actLock' title='Verrouiller le poste' style='margin-left:6px'>&#128274;</button>"+"<button class='gear"+(TAB==="chat"?" on":"")+"' data-act='tab' data-tab='chat' title='Chat équipe' style='position:relative'>&#128172;<span id='chatb' style='display:none;position:absolute;top:-6px;right:-6px;background:#c0392b;color:#fff;border-radius:10px;font-size:11px;padding:1px 6px;font-weight:700'></span></button><button class='gear"+(TAB==="retours"?" on":"")+"' data-act='tab' data-tab='retours' title='Signaler un bug ou une idée'>&#128161;</button>"+((ROLE==="admin"||ROLE==="responsable")?"<button class='gear"+(TAB==="stats"?" on":"")+"' data-act='tab' data-tab='stats' title='Statistiques'>&#128202;</button>":"")+(ROLE==="admin"?"<button class='gear"+(TAB==="param"?" on":"")+"' data-act='tab' data-tab='param' title='Paramètres'>&#9881;</button>":"")+"<button class='sec' data-act='logout'>Changer de profil</button>":""}
var VIEWF=0,VIEWC=0;
function viewSave(){
  if(!TOK&&!PW)return;
  var xs={};try{if(typeof STSUB!=="undefined")xs.st=STSUB;if(typeof COMPSUB!=="undefined")xs.cp=COMPSUB;if(typeof ETQTAB!=="undefined")xs.eq=ETQTAB;if(typeof PTAB!=="undefined")xs.pt=PTAB;if(typeof PSEC!=="undefined")xs.ps=PSEC;if(typeof TTAB!=="undefined")xs.tt=TTAB;if(typeof SVF!=="undefined"&&SVF)xs.sv=SVF.id}catch(e){}
  var js=JSON.stringify({x:xs,t:TAB,a:ATSUB,v:VUE,f:(FICHE&&FICHE.id)||0,c:(CUR&&CUR.id)||0,k:{p:PAN,c:CCLI,u:CUSE,r:CREP,y:CPAY,o:CAVOFF}});
  try{sessionStorage.setItem("atelierView",js)}catch(e){}
  try{localStorage.setItem("atelierViewL",js)}catch(e){}
  try{history.replaceState(null,"","#"+TAB+(TAB==="enc"?"/"+ATSUB:""))}catch(e){}}
function viewRestore(){
  if(!TOK&&!PW)return;
  var s=null;try{s=JSON.parse(sessionStorage.getItem("atelierView")||"null")}catch(e){}
  if(!s){try{s=JSON.parse(localStorage.getItem("atelierViewL")||"null")}catch(e){}}
  var hs=(location.hash||"").replace("#","").split("/");
  if(hs[0]){if(!s)s={};s.t=hs[0];if(hs[1])s.a=hs[1]}
  if(!s)return;
  var ok=TABS.some(function(t){return t[0]===s.t})||s.t==="stats"||s.t==="retours"||s.t==="chat"||(s.t==="param"&&ROLE==="admin");
  if(ok)TAB=s.t;
  if(["liste","planning","creer","devis"].indexOf(s.a)>=0)ATSUB=s.a;
  if(s.v)VUE=s.v;
  if(s.x){try{var x=s.x;if(x.st&&typeof STSUB!=="undefined")STSUB=x.st;if(x.cp&&typeof COMPSUB!=="undefined")COMPSUB=x.cp;if(x.eq&&typeof ETQTAB!=="undefined")ETQTAB=x.eq;if(x.pt&&typeof PTAB!=="undefined")PTAB=x.pt;if(typeof PSEC!=="undefined"&&x.ps!==undefined)PSEC=x.ps;if(x.tt&&typeof TTAB!=="undefined")TTAB=x.tt;if(x.sv)VIEWS=x.sv}catch(e){}}
  VIEWF=s.f||0;VIEWC=s.c||0;
  if(s.k){try{if(Array.isArray(s.k.p))PAN=s.k.p;if(s.k.c){CCLI=s.k.c;CUSE=!!s.k.u;api("/caisse/client?id="+s.k.c.id).then(function(d){CFID=d.fidelite;render()}).catch(function(){})}if(s.k.y)CPAY=s.k.y;if(Array.isArray(s.k.o))CAVOFF=s.k.o}catch(e){}}}
var VIEWS=0;
function viewRestoreOpen(){
  if(VIEWS){var sv=VIEWS;VIEWS=0;SVF={id:sv,d:null,msg:""};FICHE=null;render();svLoad(sv);return}
  if(VIEWF){var f=VIEWF;VIEWF=0;VIEWC=0;ouvrirFiche(f);return}
  if(VIEWC){var c=VIEWC;VIEWC=0;rechOpen(c)}}
var CMDP="";
document.addEventListener("input",function(e){if(e.target&&e.target.id==="c-mdp")CMDP=e.target.value});
var CPOP=false;
function cPopRender(pst){
  var o=document.getElementById("cpop");
  if(!CPOP){if(o)o.remove();return}
  if(!o){o=document.createElement("div");o.id="cpop";o.className="cpop";document.body.appendChild(o)}
  o.innerHTML="<div class='cpbox'><button class='cpx' data-act='cpFerme' title='Fermer et revenir à la prise en charge'>✕</button>"+caisseHtml()+"</div>";
  caisseBind();if(pst&&o.firstChild)o.firstChild.scrollTop=pst}
function render(){
  var dr0=document.querySelector(".dright"),st0=dr0?dr0.scrollTop:0;
  // Le champ de scan garde le curseur et ce qui y est tape, meme si un rendu le recree (ex : emplacements charges apres un scan).
  var ae=document.activeElement,fps=ae&&ae.dataset&&ae.dataset.ps?ae.dataset.ps:"",fid=!fps&&ae&&ae.id==="cq"?"cq":"",fval=ae&&(fps||fid)?ae.value:"";
  var po0=document.getElementById("cpop"),pst=po0&&po0.firstChild?po0.firstChild.scrollTop:0;
  render0();
  cPopRender(pst);
  if(typeof pPopRender==="function")pPopRender();
  if(st0){var dr1=document.querySelector(".dright");if(dr1)dr1.scrollTop=st0}
  if(fps||fid){var ne=fid?document.getElementById(fid):document.querySelector("[data-ps='"+fps+"']");if(ne&&document.activeElement!==ne){if(!ne.value&&fval)ne.value=fval;ne.focus({preventScroll:true})}}}
function render0(){
  if(TAB==="compta"&&ROLE!=="admin")TAB="accueil";
  renderWho();
  if(!TOK&&!PW){vLogin();return}
  nav.innerHTML=TABS.filter(function(t){return (t[0]!=="param"||ROLE==="admin")&&(t[0]!=="compta"||ROLE==="admin")}).map(function(t){return"<button data-act='tab' data-tab='"+t[0]+"'"+(TAB===t[0]?" class='on'":"")+">"+t[1]+"</button>"}).join("")+"<button data-act='pcrPop' title='Pièces à remettre aux clients' style='margin:0 0 0 auto;align-self:center;flex:0 0 auto;background:var(--vert);color:#fff;border:0;border-radius:8px;padding:11px 20px;font-size:15px;font-weight:700;text-transform:none;letter-spacing:0'>&#128230; Client"+(typeof PCR!=="undefined"&&PCR&&PCR.pieces.length?" ("+PCR.pieces.length+")":"")+"</button>";
  try{({accueil:vAccueil,enc:vEnc,cmd:vCmd,stock:vStock,etq:vEtq,param:vParam,stats:vStats,compta:vCompta,retours:vRetours,rsite:vRsite,chat:vChat,process:vProcess,cli:function(){CLV.ventes=CLV.ventes;vClient();clCharge()}})[TAB]()}finally{viewSave()}if(typeof chatBadge==="function")chatBadge()}

// Bips de scan : aigu et court = OK, grave et long = code inconnu
var AUDIOCTX=null;
function bip(f,d,n){try{var A=window.AudioContext||window.webkitAudioContext;if(!A)return;if(!AUDIOCTX)AUDIOCTX=new A();var c=AUDIOCTX;if(c.state==="suspended")c.resume();
  for(var k=0;k<n;k++){var o=c.createOscillator(),g=c.createGain();o.type="square";o.frequency.value=f;o.connect(g);g.connect(c.destination);var t=c.currentTime+k*(d+0.07);g.gain.setValueAtTime(0.15,t);g.gain.exponentialRampToValueAtTime(0.001,t+d);o.start(t);o.stop(t+d)}}catch(e){}}
function bipOk(){bip(1800,0.09,1)}
function bipKo(){bip(300,0.22,2)}
function toastKo(t){try{var d=document.createElement("div");d.textContent=t;d.style.cssText="position:fixed;top:14px;left:50%;transform:translateX(-50%);background:#c0392b;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;z-index:99999;box-shadow:0 4px 14px rgba(0,0,0,.3)";document.body.appendChild(d);setTimeout(function(){d.remove()},3500)}catch(e){}}
function toastOk(t){try{var d=document.createElement("div");d.textContent="✓ "+t;d.style.cssText="position:fixed;top:14px;left:50%;transform:translate(-50%,-30px);opacity:0;transition:all .25s ease;background:#1e8449;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;z-index:99999;box-shadow:0 4px 14px rgba(0,0,0,.3)";document.body.appendChild(d);setTimeout(function(){d.style.opacity="1";d.style.transform="translate(-50%,0)"},20);setTimeout(function(){d.style.opacity="0";d.style.transform="translate(-50%,-30px)"},1800);setTimeout(function(){d.remove()},2200)}catch(e){}}
document.addEventListener("click",function(){setTimeout(viewSave,500)});
document.addEventListener("change",function(){setTimeout(viewSave,300)});
window.addEventListener("beforeunload",function(){viewSave();try{var d=document.querySelector(".dright");sessionStorage.setItem("atelierScroll",JSON.stringify([window.scrollY,d?d.scrollTop:0,TAB]))}catch(e){}});
setTimeout(function(){try{var sc=JSON.parse(sessionStorage.getItem("atelierScroll")||"null");if(sc&&sc[2]===TAB){window.scrollTo(0,sc[0]);var d=document.querySelector(".dright");if(d)d.scrollTop=sc[1]}}catch(e){}},900);
`;
