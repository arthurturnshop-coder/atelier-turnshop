export const ATELIER = `// ---------- Atelier : sous-menu Liste / Planning ----------
function subHtml(){
  return "<div class='sub'><button class='"+(ATSUB==="liste"?"":"sec")+"' data-act='subEnc' data-sub='liste'>Liste</button><button class='"+(ATSUB==="planning"?"":"sec")+"' data-act='subEnc' data-sub='planning'>Planning</button><span class='spacer'></span><button data-act='racc' data-k='prise'>+ Prise en charge</button><button class='sec' data-act='racc' data-k='rdv'>+ Rendez-vous</button><button class='sec' data-act='racc' data-k='devis'>+ Devis</button></div>"}
function vEnc(){
  if(ATSUB==="planning"){
    if(!PJOUR)PJOUR=aujourdhui();
    if(!PMAG)PMAG=magDefaut();
    app.innerHTML=subHtml()+"<div id='pl'>Chargement…</div>";
    loadPlan();
    return}
  if(FICHE){vFiche();return}
  app.innerHTML=subHtml()+"<div id='vues' class='vues'></div><div id='liste'>Chargement…</div>";
  loadEnc()}
var VUES=[["rdv","Rendez-vous"],["afaire","À faire"],["commande","En commande"],["pretes","Prêtes"],["garantie","Sous garantie"],["tout","Tout"]];
function vuesHtml(cpt){
  return VUES.map(function(x){return"<button class='"+(VUE===x[0]?"on":"")+"' data-act='vue' data-vue='"+x[0]+"'>"+x[1]+"<b>"+(cpt?cpt[x[0]=="rdv"?"rdv":x[0]]:0)+"</b></button>"}).join("")}
async function loadEnc(){
  var el=document.getElementById("liste");if(!el)return;var d;
  try{d=await api("/reparations?vue="+encodeURIComponent(VUE))}catch(e){el.innerHTML="<div class='card'>"+esc(e.message)+"</div>";return}
  LST=d;
  var vu=document.getElementById("vues");if(vu)vu.innerHTML=vuesHtml(d.compteurs);
  var l=d.reparations;
  if(!l.length){el.innerHTML="<div class='card'>Aucune réparation dans cette vue.</div>";return}
  el.innerHTML="<div class='grid'>"+l.map(function(r){
    var cls="tk"+(r.enMagasin===false?" abs":(r.statut==="prêt"?" pret":(r.statut==="en attente de pièce"?" cmd":"")));
    return"<button class='"+cls+"' data-act='ouvrirFiche' data-id='"+r.id+"'><div class='l1'><span><b>"+pcn(r.id)+"</b> · "+esc(r.client)+"</span><span class='tag'>"+esc(r.statut)+"</span></div>"
      +"<div>"+esc(r.trottinette)+"</div><div class='muted'>"+esc(r.panne)+"</div>"
      +"<div class='muted'>"+(r.pieceArrivee?"<span class='tag warn'>Pièce arrivée : prévenir</span> ":"")+(r.enMagasin===false?"<span class='tag warn'>Pas en magasin</span> ":"")+(r.sousGarantie?"<span class='tag ok'>Sous garantie</span> ":"")+"Dépôt "+esc(day(r.dateDepot))+"</div></button>"}).join("")+"</div>"}

// ---------- Fiche d'une réparation : clic sur le ticket ----------
async function ouvrirFiche(id){
  try{FICHE=await api("/reparation?id="+id)}catch(e){alert(e.message);return}
  TAB="enc";ATSUB="liste";CUR=null;render()}
function devisHtml(f){
  var d=f.devis,mo=d.lignes.filter(function(l){return l.type==="main_oeuvre"}),pi=d.lignes.filter(function(l){return l.type==="piece"});
  function table(titre,lignes){
    if(!lignes.length)return"<div class='muted'>"+titre+" : aucune ligne.</div>";
    return"<div class='step'>"+titre+"</div><table><tr><th>Libellé</th><th class='n'>Qté</th><th class='n'>Prix</th><th class='n'>Total</th><th></th></tr>"
      +lignes.map(function(l){return"<tr><td>"+esc(l.libelle)+"</td><td class='n'>"+l.quantite+"</td><td class='n'>"+eur(l.prixCents)+"</td><td class='n'>"+eur(l.quantite*l.prixCents)+"</td><td class='n'>"+(l.type==="piece"?(l.commande?"<span class='tag "+(l.commande==="recue"?"ok":"warn")+"'>"+({panier:"À commander",commandee:"Commandée",recue:"Reçue"}[l.commande]||"")+"</span> ":"<button class='sec' data-act='aCommander' data-id='"+l.id+"'>À commander</button> "):"")+"<button class='link' data-act='delLigne' data-id='"+l.id+"'>Retirer</button></td></tr>"}).join("")+"</table>"}
  return"<div class='devis'>"+table("Forfaits main-d'œuvre",mo)+table("Pièces détachées",pi)
    +"<div class='tot'>Total du devis : "+eur(d.totalCents)+"</div>"
    +(d.lignes.length?"<button data-act='facturer' data-id='"+f.id+"'>Facturer ce devis (passer en caisse)</button>":"")
    +"<div class='step' style='margin-top:10px'>Ajouter une ligne</div><div class='muted'>Une pièce du catalogue turnshop.fr ? Cherche-la ici :</div>"+prodBox("devis")+"<div class='dl'>"
    +"<select id='lt' class='t'><option value='main_oeuvre'>Main-d'œuvre</option><option value='piece'>Pièce détachée</option></select>"
    +"<input id='ll' class='lb' placeholder='Ex : changement de pneu / pneu 10x3 CST'>"
    +"<input id='lq' class='q' type='number' min='1' value='1'><input id='lp' class='p' placeholder='Prix €'>"
    +"<button data-act='addLigne' data-id='"+f.id+"'>Ajouter</button></div></div>"}
function vFiche(){
  var f=FICHE;
  var h=subHtml()+"<button class='sec' data-act='fermerFiche' style='max-width:260px'>← Retour à la liste</button>"
    +"<div class='card fiche'><div class='head'><div><div class='big'>"+pcn(f.id)+" · "+esc(f.client)+"</div><div>"+esc(f.trottinette)+"</div></div>"
    +"<div class='actions' style='margin:0'><button class='sec' data-act='pOpenCli' data-cid='"+f.customerId+"'>Voir le profil du client</button>"
    +(estResp()?"<button class='danger' data-act='supprFiche' data-id='"+f.id+"'>Supprimer</button>":"")+"</div></div>"
    +(f.pieceArrivee?"<div class='card avbox'><b>Pièce arrivée : prévenir le client</b><div class='muted'>"+esc(f.phone||"")+" "+esc(f.email||"")+"</div><div class='actions'>"+(f.email?"<a class='btn' href='mailto:"+esc(f.email)+"?subject="+encodeURIComponent("Votre pièce est arrivée - TURN Shop")+"&body="+encodeURIComponent("Bonjour, la pièce pour votre "+f.trottinette+" est arrivée. Nous pouvons poursuivre la réparation. L'équipe TURN Shop")+"'>Envoyer un email</a>":"")+"<button data-act='clientPrevenu' data-id='"+f.id+"'>Client prévenu</button></div></div>":"")
    +"<div class='muted'>"+(f.phone?esc(f.phone)+" · ":"")+"Dépôt "+esc(day(f.dateDepot))+"</div>"
    +(f.enMagasin===false?"<div class='tag warn' style='margin:6px 0'>Trottinette pas en magasin</div><button data-act='arrivee' data-id='"+f.id+"' data-fiche='1'>Trottinette arrivée</button>":"")
    +"<div class='step' style='margin-top:10px'>Statut</div><div class='stbtns'>"+ST.map(function(s){return"<button class='"+(s===f.statut?"on":"")+"' data-act='setStatut' data-id='"+f.id+"' data-s='"+esc(s)+"'>"+esc(s)+"</button>"}).join("")+"</div>"
    +"<label class='muted' style='display:flex;gap:8px;align-items:center'><input type='checkbox' style='width:auto;margin:0' "+(f.sousGarantie?"checked ":"")+"data-act='setGarantie' data-id='"+f.id+"'> Sous garantie</label></div>"
    +"<div class='card'><div class='step'>Description de la panne</div><textarea id='fp' rows='3'>"+esc(f.panne)+"</textarea>"
    +"<div class='step'>Commentaire interne (visible seulement par TURN)</div><textarea id='fc' rows='3' placeholder='Ce que le client a demandé, ce qu il faudrait lui proposer...'>"+esc(f.commentaireInterne||"")+"</textarea>"
    +"<button data-act='saveFiche' data-id='"+f.id+"'>Enregistrer la description et le commentaire</button></div>"
    +"<div class='card'><div class='step'>Devis</div>"+devisHtml(f)+"</div>"
    +"<div class='card'><div class='step'>Historique</div>"+(f.journal||[]).slice().reverse().map(function(j){return"<div class='hist'>"+esc(dayHour(j.date))+" · "+esc(j.texte)+"</div>"}).join("")
    +"<input id='fn' placeholder='Ajouter une note à l historique'><button class='sec' data-act='addNote' data-id='"+f.id+"'>Ajouter la note</button></div>";
  app.innerHTML=h}
async function recharger(id){try{FICHE=await api("/reparation?id="+id);render()}catch(e){FICHE=null;render()}}

async function refresh(){if(CUR){CUR=await api("/customer?id="+CUR.id);render()}}
async function search(){var q=v("q");if(!q)return;try{RES=await api("/search?q="+encodeURIComponent(q));SEARCHED=true}catch(e){alert(e.message);return}render()}
`;
