export const PROFIL = `var TRF=null;
// ---------- Profil client ----------
function blocAvisRep(r){
  if(r.statut!=="récupéré")return"";
  if(r.avis_statut==="programme")return"<div class='avis'><b>Avis Google</b><div>Demande programmée pour le "+esc(dayHour(r.avis_envoi_le))+".</div><div class='muted'>L'envoi automatique n'est pas encore branché : rien ne part pour l'instant.</div></div>";
  if(r.avis_statut==="refuse")return"<div class='avis'><b>Avis Google</b><div class='muted'>Pas de demande d'avis pour cette réparation.</div></div>";
  return"<div class='avis'><b>Avis Google</b><div class='muted'>Le client est-il content ? Tu choisis.</div><div class='row'><button data-act='avisOui' data-id='"+r.id+"'>Demander un avis dans 24 h</button><button class='sec' data-act='avisNon' data-id='"+r.id+"'>Pas de demande d'avis</button></div></div>"}
function repHtml(r){
  var hist=(r.journal||[]).slice(-3).map(function(j){return"<div class='hist'>"+esc(dayHour(j.date))+" · "+esc(j.texte)+"</div>"}).join("");
  var abs=r.en_magasin===false;
  return"<div class='rep'><div class='st'><b>"+esc(day(r.date_depot))+"</b><span class='tag'>"+esc(r.statut)+"</span>"+(abs?"<span class='tag warn'>Trottinette pas en magasin</span>":"")+(r.sous_garantie?"<span class='tag ok'>Sous garantie</span>":"")+"</div><div>"+esc(r.panne)+"</div>"+hist
    +(abs?"<button data-act='arrivee' data-id='"+r.id+"'>Trottinette arrivée</button>":"")
    +"<button class='sec' data-act='ouvrirFiche' data-id='"+r.id+"'>Ouvrir la fiche</button>"+factRep(r)+blocAvisRep(r)+"</div>"}
function factRep(r){
  if(!PACH||!CUR||PACH.id!==CUR.id)return"";
  var f=PACH.list.filter(function(x){return x.reparationId===r.id});
  return f.map(function(x){return"<button class='sec' data-act='pFact' data-id='"+x.id+"'>🧾 Facture "+esc(x.numero||"n° "+x.id)+" · "+eur(x.totalCents)+"</button>"}).join("")}
function payeLib(r){
  if(!PACH||!CUR||PACH.id!==CUR.id)return"";
  var f=PACH.list.filter(function(x){return x.reparationId===r.id});
  if(f.length){var tot=0;f.forEach(function(x){tot+=x.totalCents});return"<span class='tag ok'>✓ Payé "+eur(tot)+"</span>"}
  return r.statut==="récupéré"?"<span class='tag warn'>Aucune facture trouvée</span>":"<span class='tag'>Pas encore payé</span>"}
function repLigne(r){
  var j=(r.journal||[]).map(function(x){return"<div class='hist'>"+esc(dayHour(x.date))+" · "+esc(x.texte)+"</div>"}).join("");
  return"<div class='rep'><div class='st'><b>"+esc(day(r.date_depot))+"</b><span class='tag'>"+esc(r.statut)+"</span>"+payeLib(r)+(r.sous_garantie?"<span class='tag ok'>Sous garantie</span>":"")+"</div><div>"+esc(r.panne)+"</div>"
    +"<button class='sec' data-act='ouvrirFiche' data-id='"+r.id+"'>Ouvrir la fiche</button>"+factRep(r)
    +(j?"<details style='margin-top:6px'><summary class='muted' style='cursor:pointer'>Journal du passage</summary>"+j+"</details>":"")+"</div>"}
function recepForm(t){
  return"<div class='rep'><div class='step'>Nouvelle prise en charge pour "+esc(t.marque+" "+t.modele)+"</div>"
    +"<textarea id='p' rows='3' placeholder='Panne décrite par le client'></textarea><input id='e' placeholder='État à l arrivée'><textarea id='r' rows='2' placeholder='Remarques'></textarea>"+boiteSelect("b")+affairesBox("a")+"<input id='k' placeholder='🔑 Code / mot de passe de la trottinette (facultatif)'><input id='d' type='date' value='"+today()+"'>"
    +"<label class='muted' style='display:flex;gap:8px;align-items:center'><input id='abs' type='checkbox' style='width:auto;margin:0'"+(RACC==="rdv"||RACC==="devis"?" checked":"")+"> La trottinette n'est pas encore en magasin (rendez-vous)</label>"
    +"<label class='muted' style='display:flex;gap:8px;align-items:center'><input id='gar' type='checkbox' style='width:auto;margin:0'> Sous garantie</label>"
    +"<label class='muted' style='display:flex;gap:8px;align-items:center'><input id='pec' type='checkbox' checked style='width:auto;margin:0'> Imprimer le ticket de prise en charge "+pecNbSelect("rc")+"</label>"
    +"<button data-act='addR' data-t='"+t.id+"'>Créer la fiche de réparation</button><button class='sec' data-act='cancelRecep'>Annuler</button></div>"}
function fidHtml(){
  if(FID===null)return"Points fidélité : chargement…";
  if(!FID.trouve)return"Points fidélité : non disponible";
  return"Points fidélité : "+esc(FID.points)+" points (réduction disponible : "+esc(FID.euros)+" €)"}
var FUS=null;
function fusLigne(x,i){return"<button class='sec hrow' data-act='fusOk' data-i='"+i+"'><b>"+esc(x.name)+"</b> · "+esc(x.phone||"pas de tél.")+" · "+esc(x.email||"pas d'email")+"<br><span class='muted'>Créée le "+esc(day(x.creeLe))+" · "+x.trottinettes.length+" trottinette"+(x.trottinettes.length>1?"s":"")+" · "+x.trottinettes.reduce(function(n,t){return n+t.reparations.length},0)+" réparation(s)</span></button>"}
function fusionHtml(){
  var c=CUR;if(!FUS||!c||FUS.id!==c.id)return"";
  var h="<div class='card avbox'><b>Fusionner « "+esc(c.name)+" » dans quelle fiche ?</b><div class='muted'>Choisis la fiche à GARDER : tout (trottinettes, réparations, achats) sera déplacé dessus, puis cette fiche-ci sera supprimée.</div>";
  FUS.liste=(FUS.sug||[]).concat((FUS.res||[]).filter(function(r){return !(FUS.sug||[]).some(function(s){return s.id===r.id})}));
  if(FUS.sug===null)h+="<div class='muted'>Recherche des fiches ressemblantes…</div>";
  else if(FUS.sug.length)h+="<div class='step' style='margin-top:8px'>Fiches qui lui ressemblent</div>"+FUS.sug.map(function(x,i){return fusLigne(x,i)}).join("");
  else h+="<div class='muted'>Aucune fiche ressemblante trouvée automatiquement.</div>";
  h+="<div class='dl' style='margin-top:8px'><input id='fus-q' value='"+esc(FUS.q||"")+"' placeholder='Ou cherche : nom, email, téléphone'><button data-act='fusCherche'>Chercher</button><button class='link' data-act='fusNo'>Fermer</button></div>";
  if(FUS.res){var ex=FUS.res.filter(function(r){return !(FUS.sug||[]).some(function(s){return s.id===r.id})});h+=ex.length?ex.map(function(x){return fusLigne(x,FUS.liste.indexOf(x))}).join(""):"<div class='muted'>Rien d'autre trouvé.</div>"}
  return h+"</div>"}
var PTAB="rep";
var CACLI=null,CALOAD=null,PACH=null,PACHLOAD=0,PACHOPEN=0;
function achatsHtml(){
  var c=CUR;if(!c)return"";
  var h="<div class='step' style='margin-top:14px'>Achats en caisse</div>";
  if(!PACH||PACH.id!==c.id)return h+"<div class='card muted'>Chargement…</div>";
  if(!PACH.list.length)return h+"<div class='card muted'>Aucun achat en caisse pour ce client.</div>";
  h+="<div class='card'>";
  PACH.list.forEach(function(r){
    var res=r.lignes.slice(0,2).map(function(l){return esc(l.libelle)}).join(", ")+(r.lignes.length>2?"…":"");
    h+="<button class='sec hrow' data-act='pAchOpen' data-id='"+r.id+"'><b>"+esc(dateLongue(r.date))+"</b> · "+eur(r.totalCents)+savTags(r)+"<br><span class='muted'>"+res+"</span></button>";
    if(PACHOPEN===r.id)h+=recuBloc(r)});
  return h+"</div>"}
async function loadAch(){
  var c=CUR;if(!c)return;PACHLOAD=c.id;var d;
  try{d=await api("/caisse/historique?clientId="+c.id)}catch(e){d={ventes:[]}}
  PACHLOAD=0;PACH={id:c.id,list:d.ventes||[]};if(CUR&&CUR.id===c.id&&TAB==="accueil")render()}
function caHtml(){
  if(CACLI===null||CACLI.id!==(CUR&&CUR.id))return"Chiffre d'affaires : chargement…";
  var d=CACLI.d,t="Chiffre d'affaires atelier : <b>"+eur(d.atelierCents)+"</b> ("+d.nb+" facture"+(d.nb>1?"s":"")+(d.derniere?", dernière le "+esc(day(d.derniere)):"")+")";
  if(d.shopifyCents!=null)t+=" · Total dépensé sur Shopify (boutique + web) : <b>"+eur(d.shopifyCents)+"</b>";
  return t}
async function loadCa(){
  var c=CUR;if(!c)return;CALOAD=c.id;var d;
  try{d=await api("/clients/ca?id="+c.id)}catch(e){d={atelierCents:0,nb:0}}
  CALOAD=null;if(!CUR||CUR.id!==c.id)return;
  CACLI={id:c.id,d:d};kpiMaj()}
function kpiHtml(){
  var f=FID,d=CACLI&&CUR&&CACLI.id===CUR.id?CACLI.d:null;
  function ln(l,x){return"<tr><td style='padding:4px 14px 4px 0;color:#666'>"+l+"</td><td style='padding:4px 0;text-align:right;font-weight:700;white-space:nowrap'>"+x+"</td></tr>"}
  var t="<table style='border-collapse:collapse;font-size:15px'>";
  t+=ln("Points fidélité",f===null?"…":f.trouve?esc(f.points)+" pts":"-");
  t+=ln("Cagnotte caisse (bons d'achat, fidélité)",d?"<span style='color:var(--vert2)'>"+(Math.round((d.cagnotteEuros||0)*100)/100).toString().replace(".",",")+" €</span>":"…");
  t+=ln("Réduction Shopify",f===null?"…":f.trouve?esc(f.euros)+" €":"-");
  t+=ln("CA atelier",d?eur(d.atelierCents):"…");
  t+=ln("Factures atelier",d?d.nb+(d.derniere?" <span style='font-weight:400;color:#666'>(dernière le "+esc(day(d.derniere))+")</span>":""):"…");
  t+=ln("Dépensé sur Shopify",d?(d.shopifyCents!=null?eur(d.shopifyCents):"-"):"…");
  return t+"</table>"}
function kpiMaj(){var el=document.getElementById("kpi");if(el)el.innerHTML=kpiHtml()}
function vProfil(){
  var c=CUR;
  var h="<button class='sec' data-act='back' style='max-width:260px'>← Retour au dashboard</button>"
    +"<div class='card'><div class='profil'><div class='avatar'>"+esc(initiales(c))+"</div><div style='flex:1 1 auto'>";
  if(EDITCLI){
    h+="<input id='ep' placeholder='Prénom' value='"+esc(c.prenom||"")+"'><input id='en' placeholder='Nom' value='"+esc(c.nom||"")+"'><input id='et' placeholder='Téléphone' value='"+esc(c.phone||"")+"'><input id='ee' placeholder='Email' value='"+esc(c.email||"")+"'>"
      +"<button data-act='saveCli'>Enregistrer</button><button class='sec' data-act='cancelCli'>Annuler</button>";
  }else{
    h+="<div class='big'>"+esc(c.name||"Client")+"</div>"
      +"<div class='muted'>"+esc(c.phone||"Pas de téléphone")+" · "+esc(c.email||"Pas d'email")+"</div><div class='muted'>Client depuis le "+esc(day(c.creeLe))+"</div>"
      +avisBandeau(c.id)+"<button class='sec' data-act='editCli'>Modifier</button>"+(estResp()?" <button class='sec' data-act='cliFusion'>Fusionner dans une autre fiche</button> <button class='danger' data-act='cliSuppr'>Supprimer la fiche</button>":"");
  }
  h+="</div><div id='kpi' style='flex:0 0 auto;margin-left:auto'>"+kpiHtml()+"</div></div></div>";
  h+=fusionHtml();
  if(ADDT)h+="<div class='card'><b>Ajouter une trottinette</b><input id='m' placeholder='Marque'><input id='mo' placeholder='Modèle'><input id='s' placeholder='Numéro de série'><button data-act='addT'>Associer</button><button class='sec' data-act='cancelAddT'>Annuler</button></div>";
  else h+="<button class='sec' data-act='showAddT'>+ Ajouter une trottinette</button>";
  var nbR=0;c.trottinettes.forEach(function(t){nbR+=t.reparations.length});
  h+="<div class='dl' style='margin-top:14px'><button class='"+(PTAB==="rep"?"":"sec")+"' data-act='pTab' data-t='rep'>🔧 Réparations ("+nbR+")</button><button class='"+(PTAB==="ach"?"":"sec")+"' data-act='pTab' data-t='ach'>🛒 Achats"+(PACH&&PACH.id===c.id?" ("+PACH.list.length+")":"")+"</button></div>";
  if(PTAB==="ach"){h+=achatsHtml();app.innerHTML=h;if((!PACH||PACH.id!==c.id)&&PACHLOAD!==c.id)loadAch();if(FID===null&&FIDLOAD!==c.id)loadFid();if((CACLI===null||CACLI.id!==c.id)&&CALOAD!==c.id)loadCa();return}
  h+="<div class='step' style='margin-top:14px'>🛠 Prise en charge d'aujourd'hui et réparations en cours</div>";
  var encours=[];c.trottinettes.forEach(function(t){t.reparations.forEach(function(r){if(r.statut!=="récupéré")encours.push({t:t,r:r})})});
  if(!encours.length)h+="<div class='card muted'>Rien en cours pour ce client. Pour une nouvelle prise en charge, clique sur « Réception » sur le véhicule ci-dessous.</div>";
  encours.forEach(function(x){h+="<div class='card'><b>"+esc(x.t.marque+" "+x.t.modele)+"</b> <span class='tag'>N° "+esc(x.t.serie)+"</span>"+repHtml(x.r)+"</div>"});
  h+="<div class='step' style='margin-top:18px'>🛴 Mes véhicules</div>";
  if(!c.trottinettes.length)h+="<div class='card muted'>Aucune trottinette associée. Ajoute-la ci-dessus.</div>";
  c.trottinettes.forEach(function(t){
    var open=t.reparations.filter(function(r){return r.statut!=="récupéré"}).length;
    h+="<div class='card scoot'><div class='head'><div><b>"+esc(t.marque)+" "+esc(t.modele)+"</b> <span class='tag'>N° "+esc(t.serie)+"</span></div>"
      +(open?"<span class='tag'>"+open+" en cours</span>":"")+"</div><div class='muted'>🔑 "+(t.code_acces?"Code : <b>"+esc(t.code_acces)+"</b> ":"Pas de code enregistré ")+"<button class='link' data-act='codeProfil' data-t='"+t.id+"' data-c='"+esc(t.code_acces||"")+"' style='font-size:12px'>"+(t.code_acces?"modifier":"ajouter")+"</button></div>";
    if(typeof TRF!=="undefined"&&TRF&&TRF.t===t.id){
      h+="<div class='card'><b>Nouveau propriétaire</b><div class='dl'><input id='trf-q' value='"+esc(TRF.q||"")+"' placeholder='Nom, téléphone ou email'><button data-act='trfCherche'>Chercher</button><button class='link' data-act='trfNon'>Annuler</button></div>";
      if(TRF.res)h+=TRF.res.length?TRF.res.map(function(x,i){return"<div><button class='sec' data-act='trfOk' data-i='"+i+"'>"+esc(x.prenom+" "+x.nom)+(x.telephone?" · "+esc(x.telephone):"")+"</button></div>"}).join(""):"<div class='muted'>Aucun client trouvé.</div>";
      h+="</div>"}
    else h+="<div><button class='link' data-act='trfOpen' data-t='"+t.id+"' style='font-size:12px;opacity:.7'>↔ Changer de propriétaire</button></div>";
    if(RECEP===t.id)h+=recepForm(t);
    else h+="<button data-act='openRecep' data-t='"+t.id+"'>Réception</button>";
    if(!t.reparations.length)h+="<div class='muted' style='margin-top:8px'>Aucun passage à l'atelier.</div>";
    if(t.reparations.length)h+="<div class='step' style='margin-top:10px'>Historique du véhicule</div>";
    t.reparations.forEach(function(r){h+=repLigne(r)});
    h+="</div>"});
  app.innerHTML=h;
  if(FID===null&&FIDLOAD!==c.id)loadFid();
  if((CACLI===null||CACLI.id!==c.id)&&CALOAD!==c.id)loadCa();
  if((!PACH||PACH.id!==c.id)&&PACHLOAD!==c.id)loadAch()}
async function loadFid(){
  var c=CUR;if(!c)return;FIDLOAD=c.id;var d;
  try{d=await api("/fidelite?id="+c.id)}catch(e){d={trouve:false}}
  FIDLOAD=null;
  if(!CUR||CUR.id!==c.id)return;
  FID=d;kpiMaj()}
var AVC={};
function avisBandeau(id){
  if(!id)return"";var a=AVC[id];
  if(a===undefined){AVC[id]=null;api("/clients/avis?id="+id).then(function(d){AVC[id]=d;render()}).catch(function(){AVC[id]={err:1}});return""}
  if(!a||a.err)return"";
  if(a.recompenseLe)return"<div class='muted' style='margin-top:6px'>&#127873; Récompense avis Google offerte le "+esc(day(a.recompenseLe))+(a.recompensePar?" par "+esc(a.recompensePar):"")+".</div>";
  return"<div style='margin-top:8px;padding:10px 12px;border-radius:8px;background:#fdf0d5'><b>&#127873; Avis Google"+(a.envoyeLe?" : demande envoyée le "+esc(day(a.envoyeLe)):"")+"</b><div class='muted'>Si le client montre son avis posté sur son téléphone, offre-lui la récompense.</div><button data-act='avisRec' data-id='"+id+"' style='margin-top:6px'>&#9989; Avis vu, récompense offerte</button></div>"}
`;
