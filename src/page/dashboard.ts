export const DASHBOARD = `// ---------- Dashboard ----------
var CICO={upsell:"🛒",offre:"🏷️",fidelite:"💳",autre:"📌"};
function blocConsignes(){
  var T="<div class='card cons'><div class='cons-h'><b>Consignes du jour</b>";
  if(!CONS)return T+"</div><div class='muted'>Chargement…</div></div>";
  if(EDITCONS){
    return T+"</div><div class='cons-g'>"+Object.keys(CLAB).map(function(k){
      return"<div class='ct ct-"+k+"'><div class='ct-l'>"+CICO[k]+" "+esc(CLAB[k])+"</div><textarea id='c-"+k+"' rows='2'>"+esc(CONS[k]||"")+"</textarea></div>"}).join("")
      +"</div><div class='cons-b'><button data-act='saveCons'>Enregistrer</button><button class='sec' data-act='cancelCons'>Annuler</button></div></div>"}
  var ks=Object.keys(CLAB).filter(function(k){return CONS[k]});
  return T+"<button class='sec cons-e' data-act='editCons'>Modifier</button></div>"+(ks.length?"<div class='cons-g'>"+ks.map(function(k){
      return"<div class='ct ct-"+k+"'><div class='ct-l'>"+CICO[k]+" "+esc(CLAB[k])+"</div><div class='ct-t'>"+esc(CONS[k])+"</div></div>"}).join("")+"</div>"
    :"<div class='muted'>Aucune consigne pour l'instant.</div>")+"</div>"}
var TACH=null,TACHBUSY=false,TREC=null,TRECBUSY=false,TTAB="ponct";
var TSEQ=0;
function tacheLoad(){if(TACH===null&&!TACHBUSY){TACHBUSY=true;var s=++TSEQ;api("/taches").then(function(d){if(s!==TSEQ)return;TACH=d;TACHBUSY=false;render()}).catch(function(){if(s!==TSEQ)return;TACH=[];TACHBUSY=false;render()})}}
function tacheRecharge(){TSEQ++;TACH=null;TACHBUSY=false;render()}
function trecLoad(){if(TREC===null&&!TRECBUSY){TRECBUSY=true;api("/taches/recurrentes").then(function(d){TREC=d;TRECBUSY=false;render()}).catch(function(){TREC=[];TRECBUSY=false;render()})}}
function jourCourt(d){return d?d.slice(8,10)+"/"+d.slice(5,7):""}
function blocTaches(){
  tacheLoad();
  var rec=TTAB==="rec",pec=TTAB==="pec",l=(TACH||[]).filter(function(t){return rec?t.recurrente:pec?(!t.recurrente&&t.reparationId):(!t.recurrente&&!t.reparationId)}),nPec=(TACH||[]).filter(function(t){return !t.recurrente&&t.reparationId&&!t.fait}).length,auj=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  var h="<div class='card taches'><div class='ttabs'><button class='"+(rec||pec?"sec":"")+"' data-act='tTab' data-v='ponct'>À faire</button><button class='"+(pec?"":"sec")+"' data-act='tTab' data-v='pec'>Prise en charge"+(nPec?" ("+nPec+")":"")+"</button><button class='"+(rec?"":"sec")+"' data-act='tTab' data-v='rec'>Récurrentes</button></div>";
  if(pec)h+="<div class='muted' style='margin-top:8px'>Tout ce qui concerne l'atelier : rendez-vous à confirmer, relances de devis, garanties, pièces à rappeler.</div>";
  else if(!rec){
    h+="<div class='dl' style='margin-top:8px'><input id='tt-txt' class='lb' placeholder='Nouvelle tâche (ex : commander pneus Kukirin)'><input id='tt-date' type='date' class='p'><button data-act='tAdd'>Ajouter</button></div>"
      +"<div class='muted' style='display:flex;gap:16px'><label><input type='checkbox' id='tt-prio' style='width:auto;margin:0'> Priorité</label><label><input type='checkbox' id='tt-pin' style='width:auto;margin:0'> Épingler en haut</label></div>"}
  else h+="<div class='muted' style='margin-top:8px'>Tâches qui reviennent toutes seules. Elles se modifient uniquement dans ⚙ Paramètres.</div>";
  if(!l.length)h+="<div class='muted' style='margin-top:8px'>"+(rec?"Aucune tâche récurrente à faire pour l'instant.":pec?"Rien à traiter côté atelier.":"Rien à faire. Les papiers volants peuvent partir.")+"</div>";
  l.forEach(function(t){
    var late=!t.fait&&t.echeance&&t.echeance<auj;
    h+="<div class='tache"+(t.fait?" fait":"")+((t.priorite||t.epingle)&&!t.fait?" top":"")+"'>"
      +"<button class='chk' data-act='tFait' data-id='"+t.id+"' data-v='"+(t.fait?"0":"1")+"'>"+(t.fait?"✓":"")+"</button>"
      +"<div class='tx'>"+(t.priorite&&!t.fait?"<span class='tag warn'>PRIORITÉ</span> ":"")+(t.epingle&&!t.fait?"<span class='tag'>Épinglée</span> ":"")+esc(t.texte)
      +(t.echeance?" <span class='tag"+(late?" warn":"")+"'>"+jourCourt(t.echeance)+"</span>":"")
      +"<div class='muted'>"+(t.fait&&t.faitPar?"Fait par "+esc(t.faitPar):(t.creePar?"Par "+esc(t.creePar):""))+"</div>"
      +(t.reparationId&&!t.fait?"<div class='actions' style='margin:4px 0'>"+(t.tel?"<a class='btn' href='tel:"+esc(t.tel.replace(/ /g,""))+"'>Appeler "+esc(t.tel)+"</a><a class='btn' href='sms:"+esc(t.tel.replace(/ /g,""))+"?&body="+encodeURIComponent("Bonjour, petit rappel de votre rendez-vous chez TURN Shop pour votre "+(t.trott||"trottinette")+". À bientôt !")+"'>Envoyer un SMS</a>":"")+"<button class='sec' data-act='ouvrirFiche' data-id='"+t.reparationId+"'>Ouvrir la fiche</button></div>":"")+"</div>"
      +(rec?"":"<div class='tbtn'>"+(t.fait?"":"<button class='link' data-act='tPrio' data-id='"+t.id+"' data-v='"+(t.priorite?"0":"1")+"'>"+(t.priorite?"Retirer priorité":"Priorité")+"</button> <button class='link' data-act='tPin' data-id='"+t.id+"' data-v='"+(t.epingle?"0":"1")+"'>"+(t.epingle?"Désépingler":"Épingler")+"</button> ")+"<button class='link' data-act='tSuppr' data-id='"+t.id+"'>Suppr.</button></div>")+"</div>"});
  if(rec){
    trecLoad();
    var act=(TREC||[]).filter(function(r){return r.actif});
    if(act.length){h+="<div class='step' style='margin-top:12px'>Planning des récurrences</div>";
      act.forEach(function(r){h+="<div class='muted'>"+esc(r.texte)+" · "+esc(r.libelle)+" · prochaine fois : "+jourCourt(r.prochaine)+"</div>"})}}
  return h+"</div>"}
var SAV=null,SAVED=0;
function savReload(){return api("/sav/dossiers").then(function(d){SAV=d.dossiers;render()}).catch(function(){})}
function savDate(x){return x?x.slice(8,10)+"/"+x.slice(5,7):""}
function blocGaranties(){
  if(!SAV||!SAV.length)return"";
  var h="<div class='card'><b>Garanties en cours ("+SAV.length+")</b>";
  SAV.forEach(function(d){
    var st=d.statut==="a_traiter"?"À traiter : faire la demande au fournisseur":"Demande faite"+(d.demandeLe?" le "+savDate(String(d.demandeLe).slice(0,10)):"")+(d.fournisseur?" chez "+esc(d.fournisseur):"")+(d.rma?" · RMA "+esc(d.rma):"");
    h+="<div style='border-top:1px solid #e3e3e3;padding:8px 0'><b>"+esc(d.libelle)+"</b> · "+esc(d.client||"sans client")+" · "+esc(d.numero)+(d.motif?"<div class='muted'>"+esc(d.motif)+"</div>":"")
      +"<div"+(d.enRetard?" style='color:#b00;font-weight:700'":" class='muted'")+">"+st+(d.relanceLe?" · prochaine relance le "+savDate(d.relanceLe):"")+"</div>";
    if(SAVED===d.id)h+="<div class='dl'><input id='sv-f' placeholder='Fournisseur' value='"+esc(d.fournisseur||"")+"'><input id='sv-r' placeholder='N° RMA (facultatif)'></div><div class='actions'><button data-act='savDem' data-id='"+d.id+"'>Valider</button><button class='sec' data-act='savDemNo'>Annuler</button></div>";
    else if(d.statut==="a_traiter")h+="<div class='actions'><button data-act='savDemOpen' data-id='"+d.id+"'>Demande faite au fournisseur</button><button class='sec' data-act='savAct' data-a='annule' data-id='"+d.id+"'>Annuler le dossier</button></div>";
    else h+="<div class='actions'><button class='sec' data-act='savAct' data-a='relance' data-id='"+d.id+"'>Relancé</button><button data-act='savAct' data-a='piece_recue' data-id='"+d.id+"'>✓ Pièce reçue</button><button data-act='savAct' data-a='rembourse_fournisseur' data-id='"+d.id+"'>✓ Remboursé</button><button class='sec' data-act='savAct' data-a='refus' data-id='"+d.id+"'>Refusé</button></div>";
    h+="</div>"});
  return h+"</div>"}
function blocChiffres(){
  if(!CHIF)return"<div class='card'><b>Chiffres du jour</b><div class='muted'>Chargement…</div></div>";
  var items=[["receptionsAujourdhui","Réceptions aujourd'hui"],["enCours","Réparations en cours"],["pretesARendre","Prêtes à rendre"],["recuperees","Récupérées aujourd'hui"],["nouveauxClients","Nouveaux clients"],["avisProgrammes","Avis Google programmés"]];
  return"<div class='card'><b>Chiffres du jour</b><div class='chiffres' style='margin-top:8px'>"+items.map(function(i){
    return"<div class='chiffre'><b>"+esc(CHIF[i[0]]==null?0:CHIF[i[0]])+"</b><span>"+esc(i[1])+"</span></div>"}).join("")
    +"<div class='chiffre'><b>"+eur(CHIF.caCaisseCents||0)+"</b><span>Encaissé en caisse aujourd'hui</span></div><div class='chiffre'><b>"+eur(CHIF.caMoisCents||0)+"</b><span>CA de "+new Date().toLocaleDateString("fr-FR",{month:"long"})+" (mois en cours)</span></div></div></div>"}
async function loadAccueil(){
  try{CONS=await api("/consignes")}catch(e){CONS=CONS||{}}
  try{CHIF=await api("/chiffres")}catch(e){CHIF=CHIF||null}
  try{SAV=(await api("/sav/dossiers")).dossiers}catch(e){}
  if(TAB==="accueil"&&!CUR&&!EDITCONS&&!NEWCLI)render()}
var NEWPRE="";
function newPre(){var q=NEWPRE.trim(),r={pn:"",nm:"",tel:"",em:""};if(!q)return r;if(q.indexOf("@")>0)r.em=q;else if(/^[0-9 .+]{6,}$/.test(q))r.tel=q;else{var m=q.split(" ").filter(function(x){return x});if(m.length>1){r.pn=m[0];r.nm=m.slice(1).join(" ")}else r.nm=q}return r}
function newCliForm(){var pre=newPre();
  return"<div class='card'><b>Nouveau client</b><input id='pn' placeholder='Prénom' value='"+esc(pre.pn)+"'><input id='nm' placeholder='Nom' value='"+esc(pre.nm)+"'><input id='tel' placeholder='Téléphone' value='"+esc(pre.tel)+"'><input id='em' placeholder='Email' value='"+esc(pre.em)+"'>"
    +"<button data-act='addC'>Créer le client</button><button class='sec' data-act='cancelNew'>Annuler</button><div class='muted'>La création dans Shopify est éteinte pour l'instant.</div></div>"}
function vAccueil(){
  if(CUR){vProfil();return}
  var RL={prise:"Nouvelle prise en charge",rdv:"Nouveau rendez-vous",devis:"Nouveau devis"};
  var h="<div class='dash'><div class='dleft'><div class='dtop'><div class='dtl'>"+(RACC?"<div class='card avbox'><b>"+RL[RACC]+"</b><div class='muted'>Cherche le client ci-dessous (ou crée-le), puis « Créer une prise en charge ».</div><button class='link' data-act='raccFin'>Annuler</button></div>":"")+"<div class='search'><input id='q' placeholder='Rechercher un client' autofocus><button data-act='search'>Rechercher</button></div>";
  if(NEWCLI)h+=newCliForm();
  else h+="<div class='newbtn'><button class='sec' data-act='showNew'>+ Nouveau client</button></div>";
  if(SEARCHED&&!RES.length)h+="<div class='card'>Aucun client trouvé.</div>";
  if(SEARCHED&&!NEWCLI)h+="<div class='actions'><button class='sec' data-act='showNewPre' data-q='"+esc(v("q"))+"'>+ Créer un client « "+esc(v("q"))+" »</button></div>";
  RES.forEach(function(c,i){
    var enCours=0;c.trottinettes.forEach(function(t){enCours+=t.reparations.filter(function(r){return r.statut!=="récupéré"}).length});
    h+="<div class='card'><b>"+esc(c.name||"Sans nom")+"</b>"+(enCours?" <span class='tag'>"+enCours+" en cours</span>":"")
      +"<div class='muted'>"+esc(c.phone||"")+(c.phone&&c.email?" · ":"")+esc(c.email||"")+"</div>"
      +"<div class='actions'><button class='sec' data-act='open' data-i='"+i+"'>Voir le profil</button><button data-act='priseEnCharge' data-i='"+i+"'>Créer une prise en charge</button></div></div>"});
  h+="</div>"+blocConsignes()+"</div>"+blocTaches()+blocGaranties()+blocChiffres()+"</div><div class='dright'>"+caisseHtml()+"</div></div>";
  app.innerHTML=h;caisseBind();
  var q=document.getElementById("q");if(q)q.addEventListener("keydown",function(e){if(e.key==="Enter")ACTS.search()});
  if(!CONS||!CHIF)loadAccueil()}
`;
