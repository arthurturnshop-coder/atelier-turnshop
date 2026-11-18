export const PLANNING = `// ---------- Planning : grille 8 h - 19 h, créneaux de 15 min ----------
var PH0=480,PSLOT=22,PNSLOT=44;
var PDURS=[[15,"15 min"],[30,"30 min"],[45,"45 min"],[60,"1 h"],[90,"1 h 30"],[120,"2 h"],[180,"3 h"]];
function p2(n){return(n<10?"0":"")+n}
function hParis(d){var o={};new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(d).forEach(function(x){o[x.type]=x.value});return o}
function minParis(iso){var o=hParis(new Date(iso));return +o.hour*60+ +o.minute}
function offParis(jour){var h=+hParis(new Date(jour+"T12:00:00Z")).hour-12;return(h<0?"-":"+")+p2(Math.abs(h))+":00"}
function isoParis(jour,min){return jour+"T"+p2(Math.floor(min/60))+":"+p2(min%60)+":00"+offParis(jour)}
function hm(min){return Math.floor(min/60)+"h"+p2(min%60)}
function durLabel(m){var f=PDURS.filter(function(x){return x[0]===m})[0];return f?f[1]:m+" min"}
function aujourdhui(){return new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Paris"}).format(new Date())}
function decaleJour(j,n){return new Date(new Date(j+"T12:00:00Z").getTime()+n*86400000).toISOString().slice(0,10)}
function magDefaut(){return(MAG==="Amiens"||MAG==="Rouen")?MAG:"Amiens"}
function findRep(id){var P=PLAN||{planifiees:[],nonPlanifiees:[]};return P.planifiees.concat(P.nonPlanifiees).filter(function(r){return r.id===id})[0]}
function setMsg(t){PMSG=t;var el=document.getElementById("pmsg");if(el)el.textContent=t}
function loadPlan(msg){
  var seq=++PSEQ;
  return api("/planning?jour="+PJOUR+"&magasin="+encodeURIComponent(PMAG)).then(function(d){
    if(seq!==PSEQ)return;PLAN=d;PMSG=msg||"";renderPlan()
  }).catch(function(e){if(seq!==PSEQ)return;PMSG=e.message;renderPlan()})}
function enregistrer(id,tech,debut,duree){
  setMsg("Enregistrement…");
  return api("/planning/planifier",{repairId:id,technicien:tech,debut:debut,dureeMin:duree,magasin:PMAG}).then(function(d){
    PPEND=null;PSEL=null;
    return loadPlan(d.chevauchement&&d.chevauchement.length?"Chevauchement avec une autre réparation":"")
  }).catch(function(e){setMsg(e.message)})}
function panelHtml(r,techs){
  var h="<div class='card ppanel' id='ppanel'><div class='head'><b>"+esc(r.client)+"</b><button class='sec' data-act='pCloseSel'>Fermer</button></div>"
    +"<div class='muted'>"+esc(r.trottinette)+" · "+esc(r.statut)+(r.enMagasin===false?" · pas en magasin":"")+"</div><div class='muted'>"+esc(r.panne)+"</div>";
  if(r.debut){
    var d=+r.dureeMin||15,opts=PDURS.map(function(x){return x[0]});
    if(opts.indexOf(d)<0)opts.push(d);
    opts.sort(function(a,b){return a-b});
    h+="<div class='step'>Durée</div><select id='pdu'>"+opts.map(function(m){return"<option value='"+m+"'"+(m===d?" selected":"")+">"+durLabel(m)+"</option>"}).join("")+"</select>";
    h+="<div class='step'>Technicien</div><select id='ptech'>"+techs.map(function(t){return"<option"+(t===r.technicien?" selected":"")+">"+esc(t)+"</option>"}).join("")+"</select>";
    h+="<div class='actions'><button data-act='pSaveSel' data-id='"+r.id+"'>Enregistrer</button><button class='sec' data-act='pRetirer' data-id='"+r.id+"'>Retirer du planning</button></div>";
  }else h+="<div class='muted'>Non planifiée : glisse la carte sur une colonne.</div>";
  h+="<button class='sec' data-act='ouvrirFiche' data-id='"+r.id+"'>Ouvrir la fiche</button><button class='sec' data-act='pOpenCli' data-cid='"+r.customerId+"'>Voir le profil du client</button></div>";
  return h}
function renderPlan(){
  var el=document.getElementById("pl");if(!el)return;
  var P=PLAN||{techniciens:[],planifiees:[],nonPlanifiees:[]};
  var techs=(P.techniciens||[]).slice();
  P.planifiees.forEach(function(r){if(r.technicien&&techs.indexOf(r.technicien)<0)techs.push(r.technicien)});
  var jourLong=new Date(PJOUR+"T12:00:00Z").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",timeZone:"Europe/Paris"});
  var h="<div class='card pctl'><div class='prow'><button class='sec' data-act='pDay' data-d='-1'>←</button><input type='date' id='pj' value='"+esc(PJOUR)+"'><button class='sec' data-act='pDay' data-d='1'>→</button><button class='sec' data-act='pToday'>Aujourd'hui</button></div>"
    +"<div class='prow'><select id='pm'>"+["Amiens","Rouen"].map(function(m){return"<option"+(m===PMAG?" selected":"")+">"+m+"</option>"}).join("")+"</select><span class='muted'>"+esc(jourLong)+"</span></div></div>";
  h+="<div class='pmsg' id='pmsg'>"+esc(PMSG)+"</div>";
  if(PPEND){
    h+="<div class='card'><b>Durée pour "+esc(PPEND.nom)+"</b> <span class='muted'>→ "+esc(PPEND.tech)+" à "+hm(PPEND.min)+"</span><div class='prow' style='margin-top:8px'>"
      +PDURS.map(function(d){return"<button class='sec' data-act='pPickDur' data-min='"+d[0]+"'>"+d[1]+"</button>"}).join("")
      +"<button class='sec' data-act='pCancelPend'>Annuler</button></div></div>";
  }
  var sel=PSEL!==null?findRep(PSEL):null;
  if(sel)h+=panelHtml(sel,techs);
  h+="<div class='pwrap'><div class='pgin'>";
  var tc="<div class='ptc'><div class='pth'>Heure</div><div class='pbody'>";
  for(var hh=8;hh<=19;hh++)tc+="<div class='plab' style='top:"+((hh-8)*4*PSLOT-7)+"px'>"+hh+" h</div>";
  h+=tc+"</div></div>";
  techs.forEach(function(t){
    var info=P.planifiees.filter(function(r){return r.technicien===t}).map(function(r){var s=minParis(r.debut);return{r:r,s:s,e:s+(+r.dureeMin||15)}});
    info.forEach(function(a){a.ovl=info.some(function(b){return b!==a&&a.s<b.e&&b.s<a.e})});
    h+="<div class='pcol' data-tech='"+esc(t)+"'><div class='pth'>"+esc(t)+"</div><div class='pbody'>";
    info.forEach(function(a){
      var top=(a.s-PH0)/15*PSLOT,ht=(a.e-a.s)/15*PSLOT-2;
      var abs=a.r.enMagasin===false;
      h+="<div class='pcard"+(a.ovl?" ovl":"")+(abs?" abs":"")+"' data-id='"+a.r.id+"' data-pl='1' style='top:"+top+"px;height:"+ht+"px'><b>"+esc(a.r.client)+"</b><div>"+esc(a.r.trottinette)+"</div><div class='muted'>"+hm(a.s)+" · "+(a.e-a.s)+" min"+(abs?" · pas en magasin":"")+"</div></div>"});
    h+="</div></div>";
  });
  h+="</div></div>";
  var nl=P.nonPlanifiees||[];
  h+="<div class='card'><b>Non planifiées ("+nl.length+")</b><div class='muted'>Glisse une carte sur une colonne pour la planifier. Un toucher affiche les détails.</div>";
  if(!nl.length)h+="<div class='muted' style='margin-top:8px'>Aucune réparation à planifier.</div>";
  nl.forEach(function(r){h+="<div class='pcard ucard"+(r.enMagasin===false?" abs":"")+"' data-id='"+r.id+"' data-pl='0'><b>"+esc(r.client)+"</b><div>"+esc(r.trottinette)+"</div><div class='muted'>"+esc(r.statut)+" · "+esc(r.panne)+(r.enMagasin===false?" · pas en magasin":"")+"</div></div>"});
  h+="</div>";
  el.innerHTML=h;
  document.getElementById("pj").addEventListener("change",function(e){var val=e.target.value;if(val.length===10&&!isNaN(Date.parse(val))){PJOUR=val;PSEL=null;PPEND=null;loadPlan()}});
  document.getElementById("pm").addEventListener("change",function(e){PMAG=e.target.value;PSEL=null;PPEND=null;loadPlan()});
}
ACTS.subEnc=function(b){ATSUB=b.dataset.sub;FICHE=null;PSEL=null;PPEND=null;PMSG="";render()};
ACTS.pDay=function(b){PJOUR=decaleJour(PJOUR,+b.dataset.d);PSEL=null;PPEND=null;loadPlan()};
ACTS.pToday=function(){PJOUR=aujourdhui();PSEL=null;PPEND=null;loadPlan()};
ACTS.pPickDur=function(b){if(!PPEND)return;var p=PPEND;enregistrer(p.id,p.tech,p.debut,+b.dataset.min)};
ACTS.pCancelPend=function(){PPEND=null;renderPlan()};
ACTS.pCloseSel=function(){PSEL=null;renderPlan()};
ACTS.pSaveSel=function(b){var id=+b.dataset.id,rep=findRep(id);if(!rep)return;enregistrer(id,document.getElementById("ptech").value,rep.debut,+document.getElementById("pdu").value)};
ACTS.pRetirer=function(b){var id=+b.dataset.id;api("/planning/retirer",{repairId:id}).then(function(){PSEL=null;PPEND=null;return loadPlan("Réparation retirée du planning.")}).catch(function(e){setMsg(e.message)})};
ACTS.pOpenCli=function(b){api("/customer?id="+b.dataset.cid).then(function(c){CUR=c;TAB="accueil";FICHE=null;ADDT=false;RECEP=null;EDITCLI=false;FID=null;PSEL=null;render()}).catch(function(e){setMsg(e.message)})};

document.addEventListener("pointerdown",function(e){
  var pl=document.getElementById("pl");if(!pl||e.button>0)return;
  var c=e.target.closest?e.target.closest(".pcard"):null;if(!c||!pl.contains(c))return;
  DRAG={el:c,id:+c.dataset.id,pl:c.dataset.pl==="1",sx:e.clientX,sy:e.clientY,moved:false,pid:e.pointerId};
  try{c.setPointerCapture(e.pointerId)}catch(x){}
});
document.addEventListener("pointermove",function(e){
  if(!DRAG||e.pointerId!==DRAG.pid)return;
  var dx=e.clientX-DRAG.sx,dy=e.clientY-DRAG.sy;
  if(!DRAG.moved&&Math.abs(dx)+Math.abs(dy)<6)return;
  DRAG.moved=true;DRAG.el.classList.add("drag");DRAG.el.style.transform="translate("+dx+"px,"+dy+"px)";
  e.preventDefault();
});
document.addEventListener("pointerup",pointerFin);
document.addEventListener("pointercancel",function(e){if(DRAG&&e.pointerId===DRAG.pid){DRAG.el.style.transform="";DRAG.el.classList.remove("drag");DRAG=null}});
function pointerFin(e){
  if(!DRAG||e.pointerId!==DRAG.pid)return;
  var d=DRAG;DRAG=null;
  if(!d.moved){d.el.style.transform="";PSEL=d.id;PPEND=null;renderPlan();var pp=document.getElementById("ppanel");if(pp)pp.scrollIntoView({block:"nearest"});return}
  var r=d.el.getBoundingClientRect();
  d.el.style.transform="";d.el.classList.remove("drag");
  var cols=document.querySelectorAll(".pcol"),col=null,i;
  for(i=0;i<cols.length;i++){var cr=cols[i].getBoundingClientRect();if(e.clientX>=cr.left&&e.clientX<cr.right){col=cols[i];break}}
  if(!col){setMsg("Dépose la carte sur la colonne d'un technicien.");return}
  var body=col.querySelector(".pbody").getBoundingClientRect();
  var slot=Math.round((r.top-body.top)/PSLOT);slot=Math.max(0,Math.min(PNSLOT-1,slot));
  var min=PH0+slot*15,tech=col.dataset.tech,rep=findRep(d.id);
  if(!rep)return;
  if(d.pl&&rep.technicien===tech&&minParis(rep.debut)===min)return;
  var debut=isoParis(PJOUR,min);
  if(rep.dureeMin){enregistrer(rep.id,tech,debut,rep.dureeMin);return}
  PPEND={id:rep.id,nom:rep.client,tech:tech,min:min,debut:debut};PSEL=null;setMsg("");renderPlan();
}
render();`;
