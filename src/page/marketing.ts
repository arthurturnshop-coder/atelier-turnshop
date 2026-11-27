export const MARKETING = `// ---------- Communication & marketing ----------
var MKT=null,MKTB=false,MKTE=null,MKTMSG="",OFP=false,OFD=null;
function mktCharge(){if(MKT===null&&!MKTB){MKTB=true;api("/marketing").then(function(d){MKT=d;MKTB=false;if(TAB==="mkt")render()}).catch(function(e){MKT={idees:[],planning:[],avantages:[],offres:[],err:e.message};MKTB=false;if(TAB==="mkt")render()})}}
function mktResp(){return ROLE==="admin"||ROLE==="responsable"}
var MKTLB={post:"📱 Post",offre:"🏷️ Offre",event:"🎉 Évènement"};
var MKTST={nouvelle:"Nouvelle",retenue:"✅ Retenue",faite:"🎯 Faite",refusee:"✖ Écartée"};
function mktJour(s){if(!s)return"";var p=s.split("-");return p[2]+"/"+p[1]}
function mktPeriode(p){return p.dateFin&&p.dateFin!==p.date?"du "+mktJour(p.date)+" au "+mktJour(p.dateFin):mktJour(p.date)}
function vMarketing(){
  mktCharge();
  if(!MKT){app.innerHTML="<div class='caisse'><h3>📣 Communication & marketing</h3><div class='muted'>Chargement…</div></div>";return}
  var h="<div class='caisse'><h3>📣 Communication & marketing</h3>"+(MKTMSG?"<div class='tag ok'>"+esc(MKTMSG)+"</div>":"")
  +"<div class='fiche2'><div>";
  // Idées
  h+="<div class='card'><div class='step'>💡 Une idée de post ?</div>"
    +"<div class='actions'><button id='mk-t1' class='on' data-act='mkType' data-t='idee'>💡 Idée</button><button id='mk-t2' class='sec' data-act='mkType' data-t='big'>🚀 Big idée</button></div>"
    +"<textarea id='mk-x' rows='3' placeholder='Ex : vidéo avant/après d une réparation, photo du client avec sa trottinette neuve…'></textarea>"
    +"<button data-act='mkIdee'>Envoyer l idée</button></div>"
    +"<div class='card'><div class='step'>Idées de l équipe</div>"
    +(MKT.idees.length?MKT.idees.map(function(i){return"<div class='hrow' style='border-top:1px solid #d3dbd5;padding:6px 0'><div><b>"+(i.type==="big"?"🚀 Big idée":"💡 Idée")+"</b> · <span class='muted'>"+esc(i.auteur)+" · "+esc(dayHour(i.date))+"</span> <span class='tag'>"+esc(MKTST[i.statut]||i.statut)+"</span></div><div>"+esc(i.texte)+"</div>"
      +"<div class='actions' style='flex-wrap:wrap'>"+(mktResp()?["retenue","faite","refusee"].map(function(s){return"<button class='sec' style='min-height:0;padding:2px 8px;font-size:12px' data-act='mkStatut' data-id='"+i.id+"' data-s='"+s+"'>"+MKTST[s]+"</button>"}).join(""):"")+((mktResp()||i.auteur===MKT.moi)?"<button class='link' data-act='mkIdeeDel' data-id='"+i.id+"'>Supprimer</button>":"")+"</div></div>"}).join(""):"<div class='muted'>Aucune idée pour l instant : lance-toi !</div>")
    +"</div></div><div>";
  // Offres du moment
  h+="<div class='card'><div class='step'>🏷️ Offres en cours</div>"+offreHtml(MKT)+"</div>";
  // Planning
  h+="<div class='card'><div class='step'>🗓 Planning à venir</div>"
    +(MKT.planning.length?MKT.planning.map(function(p){return"<div style='border-top:1px solid #d3dbd5;padding:6px 0'><b>"+esc(mktPeriode(p))+"</b> · "+esc(MKTLB[p.type]||p.type)+(p.canal?" · <span class='muted'>"+esc(p.canal)+"</span>":"")+"<div>"+esc(p.titre)+"</div>"+(p.note?"<div class='muted' style='white-space:pre-wrap'>"+esc(p.note)+"</div>":"")
      +(mktResp()?"<div class='actions'><button class='sec' style='min-height:0;padding:2px 8px;font-size:12px' data-act='mkPlEdit' data-id='"+p.id+"'>Modifier</button><button class='link' data-act='mkPlDel' data-id='"+p.id+"'>Supprimer</button></div>":"")+"</div>"}).join(""):"<div class='muted'>Rien de prévu pour l instant.</div>")
    +"</div>";
  if(mktResp()){var e=MKTE||{id:0,date:"",dateFin:"",titre:"",type:"post",canal:"",note:""};
    h+="<div class='card'><div class='step'>"+(e.id?"Modifier":"Ajouter au planning")+"</div>"
      +"<div class='dl'><select id='mp-ty'>"+Object.keys(MKTLB).map(function(k){return"<option value='"+k+"'"+(e.type===k?" selected":"")+">"+MKTLB[k]+"</option>"}).join("")+"</select><input id='mp-ti' placeholder='Titre (ex : Offre Noël -20 % pièces)' value='"+esc(e.titre)+"'></div>"
      +"<div class='dl'><label>Du <input id='mp-d' type='date' value='"+esc(e.date)+"'></label><label>au <input id='mp-f' type='date' value='"+esc(e.dateFin||"")+"'></label><input id='mp-c' placeholder='Canal (Insta, TikTok, site…)' value='"+esc(e.canal)+"'></div>"
      +"<textarea id='mp-n' rows='3' placeholder='Description : pour une offre, mets l avantage et les règles'>"+esc(e.note)+"</textarea>"
      +"<div class='actions'><button data-act='mkPlSave' data-id='"+e.id+"'>Enregistrer</button>"+(e.id?"<button class='sec' data-act='mkPlNew'>Annuler</button>":"")+"</div></div>"}
  app.innerHTML=h+"</div></div></div>"}
function offreHtml(d){
  var a=d.avantages||[],o=d.offres||[];
  if(!a.length&&!o.length)return"<div class='muted'>Aucune offre en cours.</div>";
  return a.map(function(x){return"<div class='ofb'><b>"+esc(x.titre)+"</b> <span class='tag ok'>"+esc(x.avantage)+"</span><ul>"+x.regles.map(function(r){return"<li>"+esc(r)+"</li>"}).join("")+"</ul></div>"}).join("")
   +o.map(function(x){return"<div class='ofb'><b>"+esc(x.titre)+"</b> <span class='muted'>"+esc(mktPeriode(x))+"</span>"+(x.note?"<div style='white-space:pre-wrap'>"+esc(x.note)+"</div>":"")+"</div>"}).join("")}
function offrePopRender(){
  var o=document.getElementById("opop");
  if(!OFP){if(o)o.remove();return}
  if(!o){o=document.createElement("div");o.id="opop";o.className="cpop";document.body.appendChild(o)}
  o.innerHTML="<div class='cpbox' style='max-width:620px'><button class='cpx' data-act='offreFerme' title='Fermer'>✕</button><h3>🏷️ Offre du moment</h3>"+(OFD?offreHtml(OFD):"<div class='muted'>Chargement…</div>")+"</div>"}
`;
