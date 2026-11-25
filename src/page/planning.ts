export const PLANNING = `// ---------- Planning : vue semaine (ou jour), 8 h - 19 h, créneaux de 15 min ----------
var PH0=480,PSLOT=22,PNSLOT=44,PVIEW="semaine",PTECH="",PDEF=60;
var PFILT="tout";
var PCOLS=["#2f6fd0","#1d8a3a","#e07b00","#7b3fc4","#0f8b8d","#c2185b"];
var PDURS=[[15,"15 min"],[30,"30 min"],[45,"45 min"],[60,"1 h"],[90,"1 h 30"],[120,"2 h"],[180,"3 h"]];
function p2(n){return(n<10?"0":"")+n}
function hParis(d){var o={};new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(d).forEach(function(x){o[x.type]=x.value});return o}
function minParis(iso){var o=hParis(new Date(iso));return +o.hour*60+ +o.minute}
function offParis(jour){var h=+hParis(new Date(jour+"T12:00:00Z")).hour-12;return(h<0?"-":"+")+p2(Math.abs(h))+":00"}
function isoParis(jour,min){return jour+"T"+p2(Math.floor(min/60))+":"+p2(min%60)+":00"+offParis(jour)}
function hm(min){return Math.floor(min/60)+"h"+p2(min%60)}
function durLabel(m){var f=PDURS.filter(function(x){return x[0]===m})[0];return f?f[1]:m+" min"}
function aujourdhui(){return new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Paris"}).format(new Date())}
function jourParis(iso){return new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Paris"}).format(new Date(iso))}
function decaleJour(j,n){return new Date(new Date(j+"T12:00:00Z").getTime()+n*86400000).toISOString().slice(0,10)}
function jourCourt(j){return new Date(j+"T12:00:00Z").toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short",timeZone:"Europe/Paris"})}
function jourNum(j,opt){return new Date(j+"T12:00:00Z").toLocaleDateString("fr-FR",Object.assign({timeZone:"Europe/Paris"},opt))}
function magDefaut(){return(MAG==="Amiens"||MAG==="Rouen")?MAG:"Amiens"}
function findRep(id){var P=PLAN||{planifiees:[],nonPlanifiees:[]};return P.planifiees.concat(P.nonPlanifiees,P.enRetard||[]).filter(function(r){return r.id===id})[0]}
function setMsg(t){PMSG=t;var el=document.getElementById("pmsg");if(el)el.textContent=t}
function loadPlan(msg){
  var seq=++PSEQ;
  return api("/planning?jour="+PJOUR+"&vue="+(PVIEW==="semaine"?"semaine":"jour")+"&magasin="+encodeURIComponent(PMAG)).then(function(d){
    if(seq!==PSEQ)return;PLAN=d;PMSG=msg||"";renderPlan()
  }).catch(function(e){if(seq!==PSEQ)return;PMSG=e.message;renderPlan()})}
function enregistrer(id,tech,debut,duree,okMsg){
  setMsg("Enregistrement…");
  return api("/planning/planifier",{repairId:id,technicien:tech,debut:debut,dureeMin:duree,magasin:PMAG}).then(function(d){
    PPEND=null;PSEL=null;
    var warn=d.chevauchement&&d.chevauchement.length?"Attention : chevauchement avec une autre réparation de "+tech+".":"";
    return loadPlan(warn||okMsg||"Planning enregistré.")
  }).catch(function(e){setMsg(e.message)})}
function techDefaut(P){var t=techsDe(P);return PTECH||(t.indexOf(PRENOM)>=0?PRENOM:"")}
function techsDe(P){var techs=(P.techniciens||[]).slice();P.planifiees.forEach(function(r){if(r.technicien&&techs.indexOf(r.technicien)<0)techs.push(r.technicien)});return techs}
function couleurTech(techs,t){var i=techs.indexOf(t);return i<0?0:i%PCOLS.length}
function colonnes(P,techs){
  if(PVIEW==="semaine")return(P.jours||[PJOUR]).map(function(j){return{jour:j,tech:PTECH,label:jourCourt(j)}});
  var tl=(PTECH&&techs.indexOf(PTECH)>=0)?[PTECH]:techs;
  return tl.map(function(t){return{jour:PJOUR,tech:t,label:t}})}
function placerVoies(items){
  items.sort(function(a,b){return a.s-b.s||a.e-b.e});
  var groupes=[],cur=null;
  items.forEach(function(it){if(!cur||it.s>=cur.fin){cur={fin:it.e,items:[]};groupes.push(cur)}cur.items.push(it);cur.fin=Math.max(cur.fin,it.e)});
  groupes.forEach(function(g){var fins=[];g.items.forEach(function(it){var i=0;while(i<fins.length&&fins[i]>it.s)i++;fins[i]=it.e;it.voie=i});g.items.forEach(function(it){it.nv=fins.length})})}
function optHeures(sel){var o="";for(var m=PH0;m<PH0+PNSLOT*15;m+=15)o+="<option value='"+m+"'"+(m===sel?" selected":"")+">"+hm(m)+"</option>";return o}
function panelHtml(r,techs,P){
  var plan=!!r.debut;
  var jour=plan?jourParis(r.debut):(((P.jours||[]).indexOf(aujourdhui())>=0)?aujourdhui():((P.jours||[PJOUR])[0]));
  var min=plan?minParis(r.debut):540;
  var tech=r.technicien||PTECH||(techs.indexOf(PRENOM)>=0?PRENOM:techs[0])||"";
  var d=+r.dureeMin||PDEF,opts=PDURS.map(function(x){return x[0]});
  if(opts.indexOf(d)<0)opts.push(d);
  opts.sort(function(a,b){return a-b});
  var h="<div class='card ppanel' id='ppanel'><div class='head'><b>"+esc(r.client)+"</b><button class='sec' data-act='pCloseSel'>Fermer</button></div>"
    +"<div class='muted'>"+esc(r.trottinette)+" · "+esc(r.statut)+(r.enMagasin===false?" · pas en magasin":"")+"</div><div class='muted'>"+esc(r.panne)+"</div>"
    +"<div class='step'>"+(plan?"Modifier le créneau":"Planifier")+"</div>"
    +"<div class='prow'><select id='ptech'>"+techs.map(function(t){return"<option"+(t===tech?" selected":"")+">"+esc(t)+"</option>"}).join("")+"</select>"
    +"<input type='date' id='pdate' value='"+esc(jour)+"'><select id='ptime'>"+optHeures(min)+"</select>"
    +"<select id='pdu'>"+opts.map(function(m){return"<option value='"+m+"'"+(m===d?" selected":"")+">"+durLabel(m)+"</option>"}).join("")+"</select></div>"
    +"<div class='actions'><button data-act='pSaveSel' data-id='"+r.id+"'>"+(plan?"Enregistrer":"Planifier")+"</button>"+(plan?"<button class='sec' data-act='pRetirer' data-id='"+r.id+"'>Retirer du planning</button>":"")+"</div>"
    +"<button class='sec' data-act='ouvrirFiche' data-id='"+r.id+"'>Ouvrir la fiche</button><button class='sec' data-act='pOpenCli' data-cid='"+r.customerId+"'>Voir le profil du client</button></div>";
  return h}
function renderPlan(){
  var el=document.getElementById("pl");if(!el)return;
  var P=PLAN||{techniciens:[],jours:[PJOUR],planifiees:[],nonPlanifiees:[]};
  var techs=techsDe(P),cols=colonnes(P,techs),auj=aujourdhui(),sem=PVIEW==="semaine";
  var jrs=P.jours||[PJOUR];
  var titre=sem?("Semaine du "+jourNum(jrs[0],{day:"numeric",month:"long"})+" au "+jourNum(jrs[jrs.length-1],{day:"numeric",month:"long"})):jourNum(PJOUR,{weekday:"long",day:"numeric",month:"long"});
  var h="<div class='card pctl'><div class='prow'><button class='sec' data-act='pDay' data-d='-1'>←</button><input type='date' id='pj' value='"+esc(PJOUR)+"'><button class='sec' data-act='pDay' data-d='1'>→</button><button class='sec' data-act='pToday'>Aujourd'hui</button>"
    +"<button class='"+(sem?"":"sec")+"' data-act='pView' data-v='semaine'>Semaine</button><button class='"+(sem?"sec":"")+"' data-act='pView' data-v='jour'>Jour</button></div>"
    +"<div class='prow'><select id='pm'>"+["Amiens","Rouen"].map(function(m){return"<option"+(m===PMAG?" selected":"")+">"+m+"</option>"}).join("")+"</select>"
    +"<select id='pft'><option value=''>Tous les techniciens</option>"+techs.map(function(t){return"<option"+(t===PTECH?" selected":"")+">"+esc(t)+"</option>"}).join("")+"</select>"
    +"<b>"+esc(titre)+"</b></div>"
    +"<div class='prow' style='margin-top:6px'>"+techs.map(function(t){return"<span class='tchip' style='border-left:6px solid "+PCOLS[couleurTech(techs,t)]+"'>"+esc(t)+"</span>"}).join("")+"</div></div>";
  h+="<div class='pmsg' id='pmsg'>"+esc(PMSG)+"</div>";
  var side="";
  var nl=P.nonPlanifiees||[];
  var er=P.enRetard||[];
  var ft=PFILT;
  var item=function(r,late){return"<div class='pcard ucard"+(late?" late":(r.enMagasin===false?" abs":""))+(PSEL===r.id?" sel":"")+"' data-id='"+r.id+"' data-pl='0'><b>"+esc(r.client)+"</b><div>"+esc(r.trottinette)+"</div><div class='muted'>"+esc(r.statut)+" · "+(late?"<b style='color:#d00'>En retard</b> · prévue le "+esc(jourNum(jourParis(r.debut),{day:"numeric",month:"short"}))+" "+esc(hm(minParis(r.debut))):esc(r.panne)+(r.enMagasin===false?" · pas en magasin":""))+"</div></div>"};
  var fb=function(k,ic,n,tt){return"<button class='pf"+(ft===k?" on":"")+"' data-act='pFilt' data-f='"+k+"' title='"+tt+"'>"+ic+" <b>"+n+"</b></button>"};
  side+="<div class='card pside"+(er.length?" late":"")+"'><div class='pfrow'>"+fb("tout","&#9776;",er.length+nl.length,"Tout")+fb("np","&#128197;",nl.length,"Non planifiées")+fb("late","&#9888;&#65039;",er.length,"En retard")+"</div>"
    +"<div class='muted' style='font-size:12px'>Glisse une carte sur le planning ou touche-la pour la planifier.</div>";
  var vis=(ft!=="np"?er.map(function(r){return item(r,true)}):[]).concat(ft!=="late"?nl.map(function(r){return item(r,false)}):[]);
  if(!vis.length)side+="<div class='muted' style='margin-top:8px'>Rien à afficher.</div>";
  side+=vis.join("");
  side+="</div>";
  var main="";
  if(PPEND){
    main+="<div class='card' id='ppend'><b>Quel technicien pour "+esc(PPEND.nom)+" ?</b> <span class='muted'>"+esc(jourCourt(PPEND.jour))+" à "+hm(PPEND.min)+" · "+durLabel(PPEND.dur)+"</span><div class='prow' style='margin-top:8px'>"
      +techs.map(function(t){return"<button class='sec' data-act='pPickTech' data-t='"+esc(t)+"'>"+esc(t)+"</button>"}).join("")
      +"<button class='sec' data-act='pCancelPend'>Annuler</button></div></div>";
  }
  var sel=PSEL!==null?findRep(PSEL):null;
  if(sel)main+=panelHtml(sel,techs,P);
  main+="<div class='pwrap'><div class='pgin'>";
  var tc="<div class='ptc'><div class='pth'>Heure</div><div class='pbody'>";
  for(var hh=8;hh<=19;hh++)tc+="<div class='plab' style='top:"+((hh-8)*4*PSLOT-7)+"px'>"+hh+" h</div>";
  main+=tc+"</div></div>";
  var nowMin=minParis(new Date().toISOString());
  cols.forEach(function(col){
    var info=P.planifiees.filter(function(r){return jourParis(r.debut)===col.jour&&(!col.tech||r.technicien===col.tech)}).map(function(r){var s=minParis(r.debut);return{r:r,s:s,e:s+(+r.dureeMin||15)}});
    info.forEach(function(a){a.ovl=info.some(function(b){return b!==a&&b.r.technicien===a.r.technicien&&a.s<b.e&&b.s<a.e})});
    placerVoies(info);
    main+="<div class='pcol' data-jour='"+esc(col.jour)+"' data-tech='"+esc(col.tech)+"'><div class='pth"+(col.jour===auj&&sem?" today":"")+"'>"+esc(col.label)+"</div><div class='pbody'>";
    if(col.jour===auj&&nowMin>=PH0&&nowMin<PH0+PNSLOT*15)main+="<div class='pnow' style='top:"+((nowMin-PH0)/15*PSLOT)+"px'></div>";
    info.forEach(function(a){
      var top=(a.s-PH0)/15*PSLOT,ht=(a.e-a.s)/15*PSLOT-2;
      var abs=a.r.enMagasin===false,w=100/a.nv,l=a.voie*w;
      main+="<div class='pcard tc"+couleurTech(techs,a.r.technicien)+(a.ovl?" ovl":"")+(abs?" abs":"")+(PSEL===a.r.id?" sel":"")+"' data-id='"+a.r.id+"' data-pl='1' style='top:"+top+"px;height:"+ht+"px;left:calc("+l+"% + 2px);width:calc("+w+"% - 4px);right:auto'><b>"+esc(a.r.client)+"</b><div>"+esc(a.r.trottinette)+"</div><div class='muted'>"+hm(a.s)+" · "+(a.e-a.s)+" min"+(col.tech?"":" · "+esc(a.r.technicien||""))+(abs?" · pas en magasin":"")+"</div></div>"});
    main+="</div></div>";
  });
  main+="</div></div>";
  h+="<div class='pcols'>"+side+"<div class='pmain'>"+main+"</div></div>";
  el.innerHTML=h;
  document.getElementById("pj").addEventListener("change",function(e){var val=e.target.value;if(val.length===10&&!isNaN(Date.parse(val))){PJOUR=val;PSEL=null;PPEND=null;loadPlan()}});
  document.getElementById("pm").addEventListener("change",function(e){PMAG=e.target.value;PSEL=null;PPEND=null;PTECH="";loadPlan()});
  document.getElementById("pft").addEventListener("change",function(e){PTECH=e.target.value;PPEND=null;renderPlan()});
}
ACTS.fichePlanif=function(b){var id=+b.dataset.id,f=FICHE;ATSUB="planning";FICHE=null;PSEL=id;PPEND=null;PMSG="";PTECH="";var md=f&&String(f.rdvSouhaite||"").match(/\d{4}-\d{2}-\d{2}/);if(md)PJOUR=md[0];if(f&&f.magasin&&(f.magasin==="Amiens"||f.magasin==="Rouen"))PMAG=f.magasin;render()};
ACTS.dvEnvoyer=function(b){var id=+b.dataset.id;if(!confirm("Envoyer le devis actuel au client (email avec lien pour accepter ou refuser) ?"))return;DVENV.msg="Envoi en cours...";render();
  api("/devis/envoyer",{repairId:id}).then(function(d){DVENV={id:0,list:null,msg:d.message};return recharger(id)}).catch(function(e){DVENV.msg=e.message;render()})};
ACTS.dvCopier=function(b){var u=b.dataset.url;if(navigator.clipboard)navigator.clipboard.writeText(u).then(function(){DVENV.msg="Lien copié.";render()},function(){prompt("Lien du devis :",u)});else prompt("Lien du devis :",u)};
ACTS.subEnc=function(b){SVF=null;ATSUB=b.dataset.sub;if(ATSUB==="devis"){DV.ed=null;DV.list=null;DV.msg=""}if(ATSUB==="depot"){DEP.list=null;DEP.msg="";DEP.nouv=false}FICHE=null;PSEL=null;PPEND=null;PMSG="";render()};
ACTS.pDay=function(b){PJOUR=decaleJour(PJOUR,(+b.dataset.d)*(PVIEW==="semaine"?7:1));PSEL=null;PPEND=null;loadPlan()};
ACTS.pToday=function(){PJOUR=aujourdhui();PSEL=null;PPEND=null;loadPlan()};
ACTS.pFilt=function(b){PFILT=b.dataset.f;renderPlan()};
ACTS.pView=function(b){PVIEW=b.dataset.v;PSEL=null;PPEND=null;loadPlan()};
ACTS.pPickTech=function(b){if(!PPEND)return;var p=PPEND;enregistrer(p.id,b.dataset.t,isoParis(p.jour,p.min),p.dur,"Planifiée pour "+b.dataset.t+".")};
ACTS.pCancelPend=function(){PPEND=null;renderPlan()};
ACTS.pCloseSel=function(){PSEL=null;renderPlan()};
ACTS.pSaveSel=function(b){
  var id=+b.dataset.id,jour=v("pdate");
  if(!jour||isNaN(Date.parse(jour))){setMsg("Choisis un jour.");return}
  var tech=v("ptech");if(!tech){setMsg("Choisis un technicien.");return}
  if(jour!==PJOUR&&(PLAN&&PLAN.jours||[]).indexOf(jour)<0)PJOUR=jour;
  enregistrer(id,tech,isoParis(jour,+v("ptime")),+v("pdu"),"Planning enregistré.")};
ACTS.pRetirer=function(b){var id=+b.dataset.id;api("/planning/retirer",{repairId:id}).then(function(){PSEL=null;PPEND=null;return loadPlan("Réparation retirée du planning.")}).catch(function(e){setMsg(e.message)})};
ACTS.pOpenCli=function(b){api("/customer?id="+b.dataset.cid).then(function(c){CUR=c;TAB="accueil";FICHE=null;ADDT=false;RECEP=null;EDITCLI=false;FID=null;PSEL=null;render()}).catch(function(e){setMsg(e.message)})};

function dropCible(e,d){
  var cols=document.querySelectorAll(".pcol"),col=null,i;
  for(i=0;i<cols.length;i++){var cr=cols[i].getBoundingClientRect();if(e.clientX>=cr.left&&e.clientX<cr.right){col=cols[i];break}}
  if(!col)return null;
  var body=col.querySelector(".pbody").getBoundingClientRect();
  var off=d.pl?Math.min(d.oy,40):8;
  var slot=Math.round((e.clientY-off-body.top)/PSLOT);slot=Math.max(0,Math.min(PNSLOT-1,slot));
  return{col:col,slot:slot,body:col.querySelector(".pbody")}}
function dropMontre(e,d){
  var old=document.getElementById("pdrop");if(old)old.remove();
  var c=dropCible(e,d);if(!c)return;
  var rep=findRep(d.id),dur=(rep&&+rep.dureeMin)||PDEF;
  var z=document.createElement("div");z.id="pdrop";
  z.style.cssText="position:absolute;left:2px;right:2px;top:"+(c.slot*PSLOT)+"px;height:"+(dur/15*PSLOT-2)+"px;background:rgba(47,111,208,.25);border:2px dashed #2f6fd0;border-radius:6px;pointer-events:none;z-index:5;font-size:11px;padding:1px 4px";
  z.textContent=hm(PH0+c.slot*15);
  c.body.appendChild(z)}
document.addEventListener("mousedown",function(e){var pl=document.getElementById("pl");if(pl&&e.target.closest&&e.target.closest(".pcard")&&pl.contains(e.target))e.preventDefault()});
document.addEventListener("pointerdown",function(e){
  var pl=document.getElementById("pl");if(!pl||e.button>0)return;
  var c=e.target.closest?e.target.closest(".pcard"):null;if(!c||!pl.contains(c))return;
  DRAG={el:c,id:+c.dataset.id,pl:c.dataset.pl==="1",oy:e.clientY-c.getBoundingClientRect().top,sx:e.clientX,sy:e.clientY,moved:false,pid:e.pointerId};
  try{c.setPointerCapture(e.pointerId)}catch(x){}
});
document.addEventListener("pointermove",function(e){
  if(!DRAG||e.pointerId!==DRAG.pid)return;
  var dx=e.clientX-DRAG.sx,dy=e.clientY-DRAG.sy;
  if(!DRAG.moved&&Math.abs(dx)+Math.abs(dy)<6)return;
  if(!DRAG.moved){
    DRAG.moved=true;DRAG.el.classList.add("drag");
    if(!DRAG.pl){
      var r0=DRAG.el.getBoundingClientRect(),ph=document.createElement("div");
      ph.style.cssText="height:"+r0.height+"px;margin:"+getComputedStyle(DRAG.el).margin;
      DRAG.el.parentNode.insertBefore(ph,DRAG.el);DRAG.ph=ph;
      DRAG.el.style.cssText+=";position:fixed;left:"+r0.left+"px;top:"+r0.top+"px;width:"+r0.width+"px;height:"+r0.height+"px;margin:0;z-index:9999";
    }
  }
  DRAG.el.style.transform="translate("+dx+"px,"+dy+"px)";
  dropMontre(e,DRAG);
  e.preventDefault();
});
document.addEventListener("pointerup",pointerFin);
function dragNettoie(d){
  d.el.style.transform="";d.el.classList.remove("drag");
  if(d.ph){d.el.style.position="";d.el.style.left="";d.el.style.top="";d.el.style.width="";d.el.style.height="";d.el.style.margin="";d.el.style.zIndex="";if(d.ph.parentNode)d.ph.parentNode.removeChild(d.ph)}}
document.addEventListener("pointercancel",function(e){if(DRAG&&e.pointerId===DRAG.pid){dragNettoie(DRAG);var oz=document.getElementById("pdrop");if(oz)oz.remove();DRAG=null}});
function pointerFin(e){
  if(!DRAG||e.pointerId!==DRAG.pid)return;
  var d=DRAG;DRAG=null;
  if(!d.moved){d.el.style.transform="";PSEL=d.id;PPEND=null;renderPlan();var pp=document.getElementById("ppanel");if(pp)pp.scrollIntoView({block:"nearest"});return}
  dragNettoie(d);
  var oldz=document.getElementById("pdrop");if(oldz)oldz.remove();
  var cb=dropCible(e,d);
  if(!cb){setMsg("Dépose la carte sur une colonne du planning.");return}
  var col=cb.col,slot=cb.slot;
    var min=PH0+slot*15,jour=col.dataset.jour,rep=findRep(d.id);
  if(!rep)return;
  var tech=col.dataset.tech||rep.technicien||techDefaut(PLAN||{techniciens:[],planifiees:[]});
  var dur=+rep.dureeMin||PDEF;
  if(d.pl&&rep.technicien===tech&&jourParis(rep.debut)===jour&&minParis(rep.debut)===min)return;
  if(!tech){PPEND={id:rep.id,nom:rep.client,jour:jour,min:min,dur:dur};PSEL=null;setMsg("");renderPlan();var pe=document.getElementById("ppend");if(pe)pe.scrollIntoView({block:"nearest"});return}
  enregistrer(rep.id,tech,isoParis(jour,min),dur,d.pl?"Déplacée.":"Planifiée "+durLabel(dur)+" le "+jourCourt(jour)+" à "+hm(min)+" : touche la carte pour changer la durée.");
}
`;
