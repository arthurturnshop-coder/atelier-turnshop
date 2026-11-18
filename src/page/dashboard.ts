export const DASHBOARD = `// ---------- Dashboard ----------
function blocConsignes(){
  if(!CONS)return"<div class='card cons'><b>Consignes du jour</b><div class='muted'>Chargement…</div></div>";
  if(EDITCONS){
    return"<div class='card cons'><b>Consignes du jour</b>"+Object.keys(CLAB).map(function(k){
      return"<div class='lab'>"+esc(CLAB[k])+"</div><textarea id='c-"+k+"' rows='2'>"+esc(CONS[k]||"")+"</textarea>"}).join("")
      +"<button data-act='saveCons'>Enregistrer</button><button class='sec' data-act='cancelCons'>Annuler</button></div>"}
  var any=Object.keys(CLAB).some(function(k){return CONS[k]});
  return"<div class='card cons'><b>Consignes du jour</b>"+(any?Object.keys(CLAB).filter(function(k){return CONS[k]}).map(function(k){
      return"<div class='lab'>"+esc(CLAB[k])+"</div><div class='txt'>"+esc(CONS[k])+"</div>"}).join("")
    :"<div class='muted'>Aucune consigne pour l'instant.</div>")
    +"<button class='sec' data-act='editCons'>Modifier les consignes</button></div>"}
var TACH=null,TACHBUSY=false;
function tacheLoad(){if(TACH===null&&!TACHBUSY){TACHBUSY=true;api("/taches").then(function(d){TACH=d;TACHBUSY=false;render()}).catch(function(){TACH=[];TACHBUSY=false;render()})}}
function jourCourt(d){return d?d.slice(8,10)+"/"+d.slice(5,7):""}
function blocTaches(){
  tacheLoad();
  var l=TACH||[],auj=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  var h="<div class='card taches'><b>À faire</b>";
  h+="<div class='dl' style='margin-top:8px'><input id='tt-txt' class='lb' placeholder='Nouvelle tâche (ex : commander pneus Kukirin)'><input id='tt-date' type='date' class='p'><button data-act='tAdd'>Ajouter</button></div>"
    +"<div class='muted' style='display:flex;gap:16px'><label><input type='checkbox' id='tt-prio' style='width:auto;margin:0'> Priorité</label><label><input type='checkbox' id='tt-pin' style='width:auto;margin:0'> Épingler en haut</label></div>";
  if(!l.length)h+="<div class='muted' style='margin-top:8px'>Rien à faire. Les papiers volants peuvent partir.</div>";
  l.forEach(function(t){
    var late=!t.fait&&t.echeance&&t.echeance<auj;
    h+="<div class='tache"+(t.fait?" fait":"")+((t.priorite||t.epingle)&&!t.fait?" top":"")+"'>"
      +"<button class='chk' data-act='tFait' data-id='"+t.id+"' data-v='"+(t.fait?"0":"1")+"'>"+(t.fait?"✓":"")+"</button>"
      +"<div class='tx'>"+(t.priorite&&!t.fait?"<span class='tag warn'>PRIORITÉ</span> ":"")+(t.epingle&&!t.fait?"<span class='tag'>Épinglée</span> ":"")+esc(t.texte)
      +(t.echeance?" <span class='tag"+(late?" warn":"")+"'>"+jourCourt(t.echeance)+"</span>":"")
      +"<div class='muted'>"+(t.fait&&t.faitPar?"Fait par "+esc(t.faitPar):(t.creePar?"Par "+esc(t.creePar):""))+"</div></div>"
      +"<div class='tbtn'>"+(t.fait?"":"<button class='link' data-act='tPrio' data-id='"+t.id+"' data-v='"+(t.priorite?"0":"1")+"'>"+(t.priorite?"Retirer priorité":"Priorité")+"</button> <button class='link' data-act='tPin' data-id='"+t.id+"' data-v='"+(t.epingle?"0":"1")+"'>"+(t.epingle?"Désépingler":"Épingler")+"</button> ")+"<button class='link' data-act='tSuppr' data-id='"+t.id+"'>Suppr.</button></div></div>"});
  return h+"</div>"}
function blocChiffres(){
  if(!CHIF)return"<div class='card'><b>Chiffres du jour</b><div class='muted'>Chargement…</div></div>";
  var items=[["receptionsAujourdhui","Réceptions aujourd'hui"],["enCours","Réparations en cours"],["pretesARendre","Prêtes à rendre"],["recuperees","Récupérées aujourd'hui"],["nouveauxClients","Nouveaux clients"],["avisProgrammes","Avis Google programmés"]];
  return"<div class='card'><b>Chiffres du jour</b><div class='chiffres' style='margin-top:8px'>"+items.map(function(i){
    return"<div class='chiffre'><b>"+esc(CHIF[i[0]]==null?0:CHIF[i[0]])+"</b><span>"+esc(i[1])+"</span></div>"}).join("")
    +"<div class='chiffre'><b>"+eur(CHIF.caCaisseCents||0)+"</b><span>Encaissé en caisse aujourd'hui</span></div></div></div>"}
async function loadAccueil(){
  try{CONS=await api("/consignes")}catch(e){CONS=CONS||{}}
  try{CHIF=await api("/chiffres")}catch(e){CHIF=CHIF||null}
  if(TAB==="accueil"&&!CUR&&!EDITCONS&&!NEWCLI)render()}
function newCliForm(){
  return"<div class='card'><b>Nouveau client</b><input id='pn' placeholder='Prénom'><input id='nm' placeholder='Nom'><input id='tel' placeholder='Téléphone'><input id='em' placeholder='Email'>"
    +"<button data-act='addC'>Créer le client</button><button class='sec' data-act='cancelNew'>Annuler</button><div class='muted'>La création dans Shopify est éteinte pour l'instant.</div></div>"}
function vAccueil(){
  if(CUR){vProfil();return}
  var RL={prise:"Nouvelle prise en charge",rdv:"Nouveau rendez-vous",devis:"Nouveau devis"};
  var h="<div class='dash'><div class='dleft'>"+(RACC?"<div class='card avbox'><b>"+RL[RACC]+"</b><div class='muted'>Cherche le client ci-dessous (ou crée-le), puis « Créer une prise en charge ».</div><button class='link' data-act='raccFin'>Annuler</button></div>":"")+"<div class='search'><input id='q' placeholder='Rechercher un client' autofocus><button data-act='search'>Rechercher</button></div>";
  if(NEWCLI)h+=newCliForm();
  else h+="<div class='newbtn'><button class='sec' data-act='showNew'>+ Nouveau client</button></div>";
  if(SEARCHED&&!RES.length)h+="<div class='card'>Aucun client trouvé. Utilise « + Nouveau client ».</div>";
  RES.forEach(function(c,i){
    var enCours=0;c.trottinettes.forEach(function(t){enCours+=t.reparations.filter(function(r){return r.statut!=="récupéré"}).length});
    h+="<div class='card'><b>"+esc(c.name||"Sans nom")+"</b>"+(enCours?" <span class='tag'>"+enCours+" en cours</span>":"")
      +"<div class='muted'>"+esc(c.phone||"")+(c.phone&&c.email?" · ":"")+esc(c.email||"")+"</div>"
      +"<div class='actions'><button class='sec' data-act='open' data-i='"+i+"'>Voir le profil</button><button data-act='priseEnCharge' data-i='"+i+"'>Créer une prise en charge</button></div></div>"});
  h+=blocTaches()+"<div class='grid'>"+blocConsignes()+blocChiffres()+"</div></div><div class='dright'>"+caisseHtml()+"</div></div>";
  app.innerHTML=h;caisseBind();
  var q=document.getElementById("q");if(q)q.addEventListener("keydown",function(e){if(e.key==="Enter")ACTS.search()});
  if(!CONS||!CHIF)loadAccueil()}
`;
