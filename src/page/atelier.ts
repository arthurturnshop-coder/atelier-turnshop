export const ATELIER = `// ---------- Atelier : sous-menu Liste / Planning ----------
function subHtml(){
  return "<div class='sub'><button class='"+(ATSUB==="liste"?"":"sec")+"' data-act='subEnc' data-sub='liste'>Liste</button><button class='"+(ATSUB==="planning"?"":"sec")+"' data-act='subEnc' data-sub='planning'>Planning</button><button class='"+(ATSUB==="devis"?"":"sec")+"' data-act='subEnc' data-sub='devis'>Devis</button><span class='spacer'></span><button data-act='creer' data-k='prise'>+ Prise en charge</button><button class='sec' data-act='creer' data-k='rdv'>+ Rendez-vous</button><button class='sec' data-act='dvNouveau'>+ Devis</button></div>"}
function vEnc(){
  if(ATSUB==="planning"){
    if(!PJOUR)PJOUR=aujourdhui();
    if(!PMAG)PMAG=magDefaut();
    app.innerHTML=subHtml()+"<div id='pl'>Chargement…</div>";
    loadPlan();
    return}
  if(ATSUB==="creer"){vCreer();return}
  if(ATSUB==="devis"){vDevis();return}
  if(FICHE){vFiche();return}
  app.innerHTML=subHtml()+"<div id='vues' class='vues'></div><div id='liste'>Chargement…</div>";
  loadEnc()}
var VUES=[["tout","Tout"],["rdv","Rendez-vous"],["afaire","À faire"],["commande","En commande"],["pretes","Prêtes"],["garantie","Sous garantie"]];
function vuesHtml(cpt){
  return VUES.map(function(x){return"<button class='"+(VUE===x[0]?"on":"")+"' data-act='vue' data-vue='"+x[0]+"'>"+x[1]+"<b>"+(cpt?cpt[x[0]=="rdv"?"rdv":x[0]]:0)+"</b></button>"}).join("")}
async function loadEnc(){
  var el=document.getElementById("liste");if(!el)return;var d;
  try{d=await api("/reparations?vue="+encodeURIComponent(VUE))}catch(e){el.innerHTML="<div class='card'>"+esc(e.message)+"</div>";return}
  LST=d;
  var vu=document.getElementById("vues");if(vu)vu.innerHTML=vuesHtml(d.compteurs);
  var l=d.reparations;
  if(!l.length){el.innerHTML="<div class='card'>Aucune réparation dans cette vue.</div>";return}
  var card=function(r){
    var cls="tk"+(r.enMagasin===false?" abs":(r.statut==="prêt"?" pret":(r.statut==="en attente de pièce"?" cmd":"")));
    return"<button class='"+cls+"' data-act='ouvrirFiche' data-id='"+r.id+"'><div class='l1'><span><b>"+pcn(r.id)+"</b> · "+esc(r.client)+"</span><span class='tag'>"+esc(r.statut)+"</span></div>"
      +"<div>"+esc(r.trottinette)+"</div><div class='muted'>"+esc(r.panne)+"</div>"
      +"<div class='muted'>"+(r.pieceArrivee?"<span class='tag warn'>Pièce arrivée : prévenir</span> ":"")+(r.source==="web"?"<span class='tag ok'>Demande en ligne</span> ":"")+(r.rdvStatut==="attente"?"<span class='tag warn'>RDV à valider</span> ":"")+(r.enMagasin===false?"<span class='tag warn'>Pas en magasin</span> ":"")+(r.sousGarantie?"<span class='tag ok'>Sous garantie</span> ":"")+(r.abandonnee?"<span class='tag warn'>Abandonnée</span> ":(r.garde&&r.garde.fraisCents>0?"<span class='tag warn'>Gardiennage "+eur(r.garde.fraisCents)+"</span> ":(r.garde&&r.garde.jours>=4?"<span class='tag warn'>Prête depuis "+r.garde.jours+" j</span> ":"")))+"Dépôt "+esc(day(r.dateDepot))+"</div></button>"};
  if(VUE==="tout"){
    var AFE=["reçu","diagnostic","devis envoyé","en réparation"];
    var cols=[["Rendez-vous",function(r){return r.enMagasin===false}],["Commande",function(r){return r.statut==="en attente de pièce"}],["À faire",function(r){return r.enMagasin!==false&&AFE.indexOf(r.statut)>=0}],["Sous garantie",function(r){return r.sousGarantie===true}],["Prête",function(r){return r.statut==="prêt"}]];
    el.innerHTML="<div class='kan'>"+cols.map(function(c){var x=l.filter(c[1]);return"<div class='kcol'><div class='khead'>"+c[0]+" <b>"+x.length+"</b></div>"+(x.length?x.map(card).join(""):"<div class='muted'>Aucune</div>")+"</div>"}).join("")+"</div>";return}
  el.innerHTML="<div class='grid'>"+l.map(card).join("")+"</div>"}

// ---------- Fiche d'une réparation : clic sur le ticket ----------
async function ouvrirFiche(id){
  try{FICHE=await api("/reparation?id="+id)}catch(e){alert(e.message);return}
  TAB="enc";ATSUB="liste";CUR=null;render()}
var DVENV={id:0,list:null,msg:""};
function dvEnvHtml(f){
  if(DVENV.id!==f.id){DVENV={id:f.id,list:null,msg:DVENV.msg};api("/devis/envois?repairId="+f.id).then(function(l){DVENV.list=l;render()}).catch(function(){})}
  var h=DVENV.msg?"<div class='muted'><b>"+esc(DVENV.msg)+"</b></div>":"";
  var L=DVENV.id===f.id&&DVENV.list||[];
  var libs={envoye:"Envoyé, en attente de réponse",accepte:"Accepté par le client",refuse:"Refusé par le client",expire:"Lien expiré",remplace:"Remplacé par un devis plus récent"};
  L.slice(0,3).forEach(function(e,i){
    var d=new Date(e.envoyeLe).toLocaleDateString("fr-FR");
    h+="<div class='muted'>Devis du "+d+" ("+eur(e.totalCents)+") : <b>"+(libs[e.statut]||esc(e.statut))+"</b>"+(e.commentaire?" · « "+esc(e.commentaire)+" »":"")+(e.relanceLe?" · relancé":"")
      +(i===0&&(e.statut==="envoye"||e.statut==="accepte")?" <a href='"+esc(e.url)+"' target='_blank'>Voir la page client</a> <button class='sec' data-act='dvCopier' data-url='"+esc(e.url)+"'>Copier le lien</button>":"")+"</div>"});
  return h}
function devisHtml(f){
  var d=f.devis,mo=d.lignes.filter(function(l){return l.type==="main_oeuvre"}),pi=d.lignes.filter(function(l){return l.type==="piece"});
  function table(titre,lignes){
    if(!lignes.length)return"<div class='muted'>"+titre+" : aucune ligne.</div>";
    return"<div class='step'>"+titre+"</div><table><tr><th>Libellé</th><th class='n'>Qté</th><th class='n'>Prix</th><th class='n'>Total</th><th></th></tr>"
      +lignes.map(function(l){return"<tr><td>"+esc(l.libelle)+"</td><td class='n'>"+l.quantite+"</td><td class='n'>"+eur(l.prixCents)+"</td><td class='n'>"+eur(l.quantite*l.prixCents)+"</td><td class='n'>"+(l.type==="piece"?(l.commande?"<span class='tag "+(l.commande==="recue"?"ok":"warn")+"'>"+({panier:"À commander",commandee:"Commandée",recue:"Reçue"}[l.commande]||"")+"</span> ":"<button class='sec' data-act='aCommander' data-id='"+l.id+"'>À commander</button> "):"")+"<button class='link' data-act='delLigne' data-id='"+l.id+"'>Retirer</button></td></tr>"}).join("")+"</table>"}
  return"<div class='devis'>"+table("Forfaits main-d'œuvre",mo)+table("Pièces détachées",pi)
    +(d.remiseMultiCents?"<div class='muted'>Remise plusieurs prestations : -"+eur(d.remiseMultiCents)+" (non cumulable avec une offre)</div>":"")
    +"<div class='tot'>Total du devis : "+eur(d.netCents==null?d.totalCents:d.netCents)+"</div>"
    +(d.lignes.length?"<button data-act='facturer' data-id='"+f.id+"'>Facturer ce devis (passer en caisse)</button> <button class='sec' data-act='dvEnvoyer' data-id='"+f.id+"'>📧 Envoyer le devis au client</button>":"")
    +dvEnvHtml(f)
    +prestaBox(f)+"<div class='step' style='margin-top:10px'>Ajouter une ligne</div><div class='muted'>Une pièce du catalogue turnshop.fr ? Cherche-la ici :</div>"+prodBox("devis")+"<div class='dl'>"
    +"<select id='lt' class='t'><option value='main_oeuvre'>Main-d'œuvre</option><option value='piece'>Pièce détachée</option></select>"
    +"<input id='ll' class='lb' placeholder='Ex : changement de pneu / pneu 10x3 CST'>"
    +"<input id='lq' class='q' type='number' min='1' value='1'><input id='lp' class='p' placeholder='Prix €'>"
    +"<button data-act='addLigne' data-id='"+f.id+"'>Ajouter</button></div></div>"}
function prestaBox(f){
  prestaLoad();
  var l=(PRESTA?PRESTA.prestations:[]).filter(function(x){return x.actif});
  var h="<div class='step' style='margin-top:10px'>Prestations</div>";
  if(!l.length)h+="<div class='muted'>Aucune prestation. Un admin peut en créer dans ⚙ Paramètres.</div>";
  else h+="<div class='presta'>"+l.map(function(x){return"<button class='sec' data-act='addPresta' data-id='"+x.id+"'><b>"+esc(x.nom)+"</b><br><span class='muted'>"+eur(x.prixCents)+(x.avecPiece?" + "+esc(x.pieceAide||"pièce"):"")+"</span></button>"}).join("")+"</div>";
  if(PRESTA&&PRESTA.multi&&PRESTA.multi.remiseCents)h+="<div class='muted'>"+PRESTA.multi.seuil+" prestations ou plus : -"+eur(PRESTA.multi.remiseCents)+" (sans offre cumulée)</div>";
  var xo=DEVOPT?(PRESTA?PRESTA.prestations:[]).filter(function(p){return p.id===DEVOPT})[0]:null;
  if(xo&&(xo.options||[]).length)h+="<div class='step' style='margin-top:10px'>Options pour "+esc(xo.nom)+"</div><div class='presta'>"+xo.options.map(function(o){return"<button class='sec' data-act='addOpt' data-pid='"+xo.id+"' data-id='"+o.id+"'><b>"+esc(o.nom)+"</b><br><span class='muted'>+"+eur(o.prixCents)+"</span></button>"}).join("")+"</div>";
  if(DEVHINT)h+="<div class='card avbox'><b>"+esc(DEVHINT)+"</b></div>";
  return h}
function vFiche(){
  var f=FICHE;
  var h=subHtml()+"<button class='sec' data-act='fermerFiche' style='max-width:260px'>← Retour à la liste</button>"
    +"<div class='card fiche'><div class='head'><div><div class='big'>"+pcn(f.id)+" · "+esc(f.client)+"</div><div>"+esc(f.trottinette)+"</div></div>"
    +"<div class='actions' style='margin:0'><button data-act='fichePlanif' data-id='"+f.id+"'>📅 Planifier</button><button class='sec' data-act='pecPrint' data-id='"+f.id+"'>Ticket de prise en charge</button><button class='sec' data-act='docPrint' data-mode='devis' data-id='"+f.id+"'>Ticket devis</button><button class='sec' data-act='docPrint' data-mode='facture' data-id='"+f.id+"'>Ticket facture</button><button class='sec' data-act='pOpenCli' data-cid='"+f.customerId+"'>Voir le profil du client</button>"
    +(estResp()?"<button class='danger' data-act='supprFiche' data-id='"+f.id+"'>Supprimer</button>":"")+"</div></div>"
    +(f.pieceArrivee?"<div class='card avbox'><b>Pièce arrivée : prévenir le client</b><div class='muted'>"+esc(f.phone||"")+" "+esc(f.email||"")+"</div><div class='actions'>"+(f.email?"<a class='btn' href='mailto:"+esc(f.email)+"?subject="+encodeURIComponent("Votre pièce est arrivée - TURN Shop")+"&body="+encodeURIComponent("Bonjour, la pièce pour votre "+f.trottinette+" est arrivée. Nous pouvons poursuivre la réparation. L'équipe TURN Shop")+"'>Envoyer un email</a>":"")+"<button data-act='clientPrevenu' data-id='"+f.id+"'>Client prévenu</button></div></div>":"")
    +(f.source==="web"?webHtml(f):"")
    +"<div class='muted'>"+(f.phone?esc(f.phone)+" · ":"")+"Dépôt "+esc(day(f.dateDepot))+"</div>"
    +(f.enMagasin===false?"<div class='tag warn' style='margin:6px 0'>Trottinette pas en magasin</div><button data-act='arrivee' data-id='"+f.id+"' data-fiche='1'>Trottinette arrivée</button>":"")
    +"<div class='step' style='margin-top:10px'>Statut</div><div class='stbtns'>"+ST.map(function(s){if(s==="devis envoyé"&&s!==f.statut)return"<button class='dis' disabled title='Se met tout seul quand tu envoies le devis au client'>"+esc(s)+" (auto)</button>";return"<button class='"+(s===f.statut?"on":"")+"' data-act='setStatut' data-id='"+f.id+"' data-s='"+esc(s)+"'>"+esc(s)+"</button>"}).join("")+"</div>"
    +"<label class='muted' style='display:flex;gap:8px;align-items:center'><input type='checkbox' style='width:auto;margin:0' "+(f.sousGarantie?"checked ":"")+"data-act='setGarantie' data-id='"+f.id+"'> Sous garantie</label></div>"
    +garantieHtml(f)+gardeHtml(f)+acompteHtml(f)
    +"<div class='card'><div class='step'>Description de la panne</div><textarea id='fp' rows='3'>"+esc(f.panne)+"</textarea>"
    +"<div class='step'>Commentaire interne (visible seulement par TURN)</div><textarea id='fc' rows='3' placeholder='Ce que le client a demandé, ce qu il faudrait lui proposer...'>"+esc(f.commentaireInterne||"")+"</textarea>"
    +"<button data-act='saveFiche' data-id='"+f.id+"'>Enregistrer la description et le commentaire</button></div>"
    +"<div class='card'><div class='step'>Devis</div>"+devisHtml(f)+"</div>"
    +"<div class='card'><div class='step'>Historique</div>"+(f.journal||[]).slice().reverse().map(function(j){return"<div class='hist'>"+esc(dayHour(j.date))+" · "+esc(j.texte)+"</div>"}).join("")
    +"<input id='fn' placeholder='Ajouter une note à l historique'><button class='sec' data-act='addNote' data-id='"+f.id+"'>Ajouter la note</button></div>";
  app.innerHTML=h}
function gardeHtml(f){
  var g=f.garde;if(!g)return"";
  if(g.abandonnee)return"<div class='card avbox'><b>Trottinette considérée comme abandonnée</b><div class='muted'>Prête depuis "+g.jours+" jours sans être récupérée.</div></div>";
  return"<div class='card avbox'><b>Prête depuis "+g.jours+" jour"+(g.jours>1?"s":"")+"</b><div class='muted'>"
    +(g.fraisCents>0?"Gardiennage : "+eur(g.fraisCents)+" ("+g.joursFrais+" j x "+(g.prixCents/100)+" €), ajouté à la facture. ":"Gardiennage gratuit jusqu'au 5e jour, puis "+(g.prixCents/100)+" € par jour. ")
    +"Abandon dans "+g.abandonDans+" jours.</div></div>"}
function webHtml(f){
  var st=f.rdvStatut||"confirme";
  var h="<div class='card avbox'><b>Demande faite en ligne par le client</b><div class='muted'>"+esc(f.magasin||"")+" · créneau souhaité : "+esc(f.rdvSouhaite||"")+"</div>";
  if(!f.devis.lignes.length)h+="<div class='muted'>Panne non chiffrée : blocage de rendez-vous demandé au client (déduit de la facture, gardé s'il ne vient pas, remboursable avec « Rembourser l'acompte » ci-dessous).</div>";
  if((st==="attente"||st==="propose"||st==="confirme")&&!(f.acompte&&f.acompte.verseCents>0))h+="<div class='muted'><span class='tag warn'>Aucun acompte versé</span> Risque de RDV fantôme : le client n'a encore rien payé.</div>";
  if(st==="attente"){
    h+="<div class='step' style='margin-top:8px'>À valider</div><div class='dl'><button data-act='rdvAct' data-a='accepter' data-id='"+f.id+"'>Accepter le créneau</button><button class='danger' data-act='rdvAct' data-a='refuser' data-id='"+f.id+"'>Refuser</button></div>"
    +"<div class='dl'><input id='rdv-d' type='date' class='t'><select id='rdv-c' class='t'><option value='matin'>Matin</option><option value='après-midi'>Après-midi</option></select><button data-act='rdvAct' data-a='proposer' data-id='"+f.id+"'>Proposer un autre créneau</button></div>";
  }else if(st==="propose")h+="<div class='muted'><span class='tag warn'>Autre créneau proposé</span> En attente de la réponse du client.</div>";
  else if(st==="annule")h+="<div class='muted'><span class='tag warn'>Annulé par le client</span> Pense à rembourser l'acompte s'il y en a un.</div>";
  else if(st==="confirme")h+="<div class='muted'><span class='tag ok'>RDV confirmé</span> Place-le dans le Planning.</div>";
  return h+"</div>"}
function acompteHtml(f){
  var a=f.acompte||{verseCents:0,resteCents:0,liste:[]};
  var h="<div class='card'><div class='step'>Acompte / paiement d'avance</div>";
  if(a.verseCents>0)h+="<div>Versé : <b>"+eur(a.verseCents)+"</b> · À déduire de la facture : <b>"+eur(a.resteCents)+"</b></div>";
  else h+="<div class='muted'>Aucun acompte versé.</div>";
  h+="<div class='dl'><input id='ac-m' class='p' placeholder='Montant €'><select id='ac-t' class='t'><option value='carte'>Carte</option><option value='especes'>Espèces</option><option value='virement'>Virement</option></select><button data-act='acompte' data-id='"+f.id+"'>Encaisser l'acompte</button></div>";
  if(a.resteCents>0&&estResp())h+="<div class='step' style='margin-top:10px'>Rembourser l'acompte ("+eur(a.resteCents)+")</div><div class='dl'><select id='rb-t' class='t'><option value=''>Comment ?</option><option value='carte'>Par carte</option><option value='especes'>En espèces</option><option value='virement'>Par virement</option><option value='carte_cadeau'>Carte cadeau Shopify (bon d'achat, en ligne + boutique)</option><option value='bon'>Bon d'achat atelier (caisse du logiciel)</option></select><button class='danger' data-act='rembourse' data-id='"+f.id+"' data-c='"+a.resteCents+"'>Rembourser</button></div>";
  return h+"</div>"}
async function recharger(id){try{FICHE=await api("/reparation?id="+id);render()}catch(e){FICHE=null;render()}}

async function refresh(){if(CUR){CUR=await api("/customer?id="+CUR.id);render()}}
async function search(){var q=v("q");if(!q)return;try{RES=await api("/search?q="+encodeURIComponent(q));SEARCHED=true}catch(e){alert(e.message);return}render()}

`;
