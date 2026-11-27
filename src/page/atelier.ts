export const ATELIER = `// ---------- Atelier : sous-menu Liste / Planning ----------
function subHtml(){
  return "<div class='sub'><button class='"+(ATSUB==="liste"?"":"sec")+"' data-act='subEnc' data-sub='liste'>Liste</button><button class='"+(ATSUB==="planning"?"":"sec")+"' data-act='subEnc' data-sub='planning'>Planning</button><button class='"+(ATSUB==="devis"?"":"sec")+"' data-act='subEnc' data-sub='devis'>Devis</button><button class='"+(ATSUB==="depot"?"":"sec")+"' data-act='subEnc' data-sub='depot'>Dépôt-vente</button><span class='spacer'></span><button data-act='creer' data-k='prise'>+ Prise en charge</button><button class='sec' data-act='creer' data-k='rdv'>+ Rendez-vous</button><button class='sec' data-act='dvNouveau'>+ Devis</button></div>"}
function vEnc(){
  if(ATSUB==="planning"){
    if(!PJOUR)PJOUR=aujourdhui();
    if(!PMAG)PMAG=magDefaut();
    app.innerHTML=subHtml()+"<div id='pl'>Chargement…</div>";
    loadPlan();
    return}
  if(ATSUB==="creer"){vCreer();return}
  if(ATSUB==="devis"){vDevis();return}
  if(ATSUB==="depot"){vDepot();return}
  if(SVF){vSavFiche();return}
  if(FICHE){vFiche();return}
  app.innerHTML=subHtml()+"<div id='vues' class='vues'></div><div id='liste'>Chargement…</div>";
  loadEnc()}
var VUES=[["tout","Tout"],["rdv","Rendez-vous"],["afaire","À faire"],["commande","En commande"],["pretes","Prêtes"],["garantie","Sous garantie"],["pieces","🛠 Pièces garantie"]];
function vuesHtml(cpt){
  return VUES.map(function(x){return"<button class='"+(VUE===x[0]?"on":"")+"' data-act='vue' data-vue='"+x[0]+"'>"+x[1]+"<b>"+(x[0]==="pieces"?(SAV?SAV.length:0):(cpt?cpt[x[0]=="rdv"?"rdv":x[0]]:0))+"</b></button>"}).join("")}
async function loadEnc(){
  var el=document.getElementById("liste");if(!el)return;var d;
  try{d=await api("/reparations?vue="+encodeURIComponent(VUE==="pieces"?"tout":VUE));try{SAV=(await api("/sav/dossiers")).dossiers}catch(e2){}}catch(e){el.innerHTML="<div class='card'>"+esc(e.message)+"</div>";return}
  LST=d;
  var vu=document.getElementById("vues");if(vu)vu.innerHTML=vuesHtml(d.compteurs);
  if(VUE==="pieces"){el.innerHTML=(SAV&&SAV.length?blocGaranties(true):"<div class='card'>Aucune pièce sous garantie en cours. Pour en ouvrir une : fiche client > Achats > ouvre le ticket > « 🛠 Garantie pièce ».</div>");return}
  var l=d.reparations;
  if(!l.length){el.innerHTML="<div class='card'>Aucune réparation dans cette vue.</div>";return}
  var card=function(r){
    var cls="tk"+(r.enMagasin===false?" abs":(r.statut==="prêt"?" pret":(r.statut==="en attente de pièce"?" cmd":"")));
    return"<button class='"+cls+"' data-act='ouvrirFiche' data-id='"+r.id+"'><div class='l1'><span><b>"+pcn(r.id)+"</b> · "+esc(r.client)+"</span><span class='tag'>"+esc(r.statut)+"</span></div>"
      +"<div>"+esc(r.trottinette)+"</div><div class='muted'>"+esc(r.panne)+"</div>"
      +"<div class='muted'>"+(r.boite?"<span class='tag'>📦 "+esc(r.boite)+"</span> ":"")+(r.pieceAValider?"<span class='tag warn'>📦 Pièce arrivée : à valider</span> ":"")+(r.pieceArrivee?"<span class='tag warn'>Pièce arrivée : prévenir</span> ":"")+(r.source==="web"?"<span class='tag ok'>Demande en ligne</span> ":"")+(r.rdvStatut==="attente"?"<span class='tag warn'>RDV à valider</span> ":"")+(r.enMagasin===false?"<span class='tag warn'>Pas en magasin</span> ":"")+(r.sousGarantie?"<span class='tag ok'>Sous garantie</span> ":"")+(r.abandonnee?"<span class='tag warn'>Abandonnée</span> ":(r.garde&&r.garde.fraisCents>0?"<span class='tag warn'>Gardiennage "+eur(r.garde.fraisCents)+"</span> ":(r.garde&&r.garde.jours>=4?"<span class='tag warn'>Prête depuis "+r.garde.jours+" j</span> ":"")))+"Dépôt "+esc(day(r.dateDepot))+"</div></button>"};
  if(VUE==="tout"){
    var AFE=["reçu","diagnostic","devis envoyé","à faire","en réparation"];
    var cols=[["Rendez-vous",function(r){return r.enMagasin===false}],["Commande",function(r){return r.statut==="en attente de pièce"}],["À faire",function(r){return r.enMagasin!==false&&AFE.indexOf(r.statut)>=0}],["Sous garantie",function(r){return r.sousGarantie===true}],["Prête",function(r){return r.statut==="prêt"}]];
    el.innerHTML="<div class='kan'>"+cols.map(function(c){var x=l.filter(c[1]);return"<div class='kcol'><div class='khead'>"+c[0]+" <b>"+x.length+"</b></div>"+(x.length?x.map(card).join(""):"<div class='muted'>Aucune</div>")+"</div>"}).join("")+"</div>";return}
  el.innerHTML="<div class='grid'>"+l.map(card).join("")+"</div>"}

// ---------- Fiche d'une réparation : clic sur le ticket ----------
async function ouvrirFiche(id){
  try{FICHE=await api("/reparation?id="+id)}catch(e){alert(e.message);return}
  SVF=null;TAB="enc";ATSUB="liste";CUR=null;render()}
var DVENV={id:0,list:null,msg:""};
function dvEnvHtml(f){
  if(DVENV.id!==f.id){DVENV={id:f.id,list:null,msg:DVENV.msg};api("/devis/envois?repairId="+f.id).then(function(l){DVENV.list=l;render()}).catch(function(){})}
  var h=DVENV.msg?"<div class='muted'><b>"+esc(DVENV.msg)+"</b></div>":"";
  var L=DVENV.id===f.id&&DVENV.list||[];
  var libs={envoye:"Envoyé, en attente de réponse",accepte:"Accepté par le client",refuse:"Refusé par le client",expire:"Lien expiré",remplace:"Remplacé par un devis plus récent"};
  L.slice(0,3).forEach(function(e,i){
    var d=new Date(e.envoyeLe).toLocaleDateString("fr-FR");
    h+="<div class='muted'>Devis du "+d+" ("+eur(e.totalCents)+") : <b>"+(libs[e.statut]||esc(e.statut))+"</b>"+(e.commentaire?" · « "+esc(e.commentaire)+" »":"")+(e.relanceLe?" · relancé":"")
      +(i===0&&(e.statut==="envoye"||e.statut==="accepte")?" <button class='sec' data-act='dvCopier' data-url='"+esc(e.url)+"'>Copier le lien</button>":"")+"</div>"});
  return h}
function devisHtml(f){
  var d=f.devis,mo=d.lignes.filter(function(l){return l.type==="main_oeuvre"}),pi=d.lignes.filter(function(l){return l.type==="piece"});
  function table(titre,lignes){
    if(!lignes.length)return"<div class='muted'>"+titre+" : aucune ligne.</div>";
    return"<div class='step'>"+titre+"</div><table><tr><th>Libellé</th><th class='n'>Qté</th><th class='n'>Prix</th><th class='n'>Total</th></tr>"
      +lignes.map(function(l){return"<tr><td>"+esc(l.libelle)+(l.prixManuel?" <span class='tag warn'>Prix manuel</span>":"")+(l.origineCents!=null?" <span class='tag ok'>Remise -"+eur(l.origineCents-l.prixCents)+"</span>":"")+"<div class='dvact'>"+(l.type==="piece"&&!/^Livraison à domicile/i.test(l.libelle)?(l.commande?"<span class='tag "+(l.commande==="recue"?"ok":"warn")+"'>"+({panier:"À commander",commandee:"Commandée",recue:"Reçue"}[l.commande]||"")+"</span> ":"<button class='sec' data-act='aCommander' data-id='"+l.id+"'>À commander</button> "):"")+(l.type==="piece"&&!/^Livraison à domicile/i.test(l.libelle)?"<button class='"+(l.remiseClient?"":"sec")+"' data-act='remCli' data-id='"+l.id+"' data-v='"+(l.remiseClient?0:1)+"' title='La pièce apparaîtra dans le bloc Client à son arrivée'>📦 "+(l.remiseClient?"Client ✓":"Client")+"</button> ":"")+(l.type==="piece"&&!/^Livraison à domicile/i.test(l.libelle)?"<button class='sec' data-act='jumOpen' data-id='"+l.id+"'>🔗 Réf.</button> ":"")+"<button class='link' data-act='delLigne' data-id='"+l.id+"'>Retirer</button></div></td><td class='n' style='white-space:nowrap'><button class='sec' data-act='lgQte' data-id='"+l.id+"' data-q='"+(l.quantite-1)+"' style='padding:2px 8px'>−</button> <input class='lgq' data-lid='"+l.id+"' value='"+l.quantite+"' inputmode='numeric' style='width:44px;text-align:center'> <button class='sec' data-act='lgQte' data-id='"+l.id+"' data-q='"+(l.quantite+1)+"' style='padding:2px 8px'>+</button></td><td class='n'><input class='lgp' data-lid='"+l.id+"' value='"+(l.prixCents/100).toFixed(2).replace(".",",")+"' inputmode='decimal' style='width:76px;text-align:right'> €</td><td class='n'>"+eur(l.quantite*l.prixCents)+"</td></tr>"+(l.type==="piece"&&JUM===l.id?"<tr><td colspan='4'><div class='muted'>Cherche ou scanne la référence réellement montée : elle sera reliée au même produit maître.</div>"+prodBox("jum"+l.id)+"</td></tr>":"")}).join("")+"</table>"}
  var ajout=prestaBox(f)+"<div class='step' style='margin-top:10px'>Ajouter une ligne</div><div class='muted'>Une pièce du catalogue turnshop.fr ? Cherche-la ici :</div>"+prodBox("devis")+"<div class='step' style='margin-top:10px'>📦 Commande séparée (le client repart avec, ex : gants)</div><div class='muted'>Cherche le produit : il est commandé tout de suite et arrive dans le bloc Client, sans toucher à la réparation.</div>"+prodBox("sep")+"<div class='dl'>"
    +"<select id='lt' class='t'><option value='main_oeuvre'>Main-d'œuvre</option><option value='piece'>Pièce détachée</option></select>"
    +"<input id='ll' class='lb' placeholder='Ex : changement de pneu / pneu 10x3 CST'>"
    +"<input id='lq' class='q' type='number' min='1' value='1'><input id='lp' class='p' placeholder='Prix €'>"
    +"<button data-act='addLigne' data-id='"+f.id+"'>Ajouter</button></div>";
  return"<div class='devis devis2'><div class='dv-g'>"+ajout+"</div><div class='dv-d card'><div class='step'>Devis en cours</div>"+table("Forfaits main-d'œuvre",mo)+table("Pièces détachées",pi)
    +(d.remiseMultiCents?"<div class='muted'>Remise plusieurs prestations : -"+eur(d.remiseMultiCents)+" (non cumulable avec une offre)</div>":"")
    +"<div class='tot'>Total du devis : "+eur(d.netCents==null?d.totalCents:d.netCents)+"</div>"
    +payRecap(f)+"<div class='actions'>"+((f.acompte&&f.acompte.facture)?"":"<button class='sec' data-act='facturer' data-m='acompte' data-id='"+f.id+"'>💶 Acompte / paiement d'avance</button>")+(d.lignes.length?"<button data-act='facturer' data-m='paiement' data-id='"+f.id+"'>🧾 Facturer ce devis</button> <button class='sec' data-act='dvEnvoyer' data-id='"+f.id+"'>📧 Envoyer le devis au client</button>":"")+"</div>"
    +dvEnvHtml(f)+"</div></div>"}
var PRFAM=[["Freins","#c0392b","#fbeceb"],["Pneus et roues","#2471a3","#eaf2fa"],["Électrique","#d68910","#fdf3e1"],["Mécanique","#7d3c98","#f4ecf7"],["Entretien et divers","#1e8449","#e9f5ee"]];
function prFam(n){n=(n||"").toLowerCase();var i=4;
  if(/frein|plaquette|disque|purge|levier/.test(n))i=0;
  else if(/pneu|chambre|valve|roulement|roue/.test(n))i=1;
  else if(/batterie|data|moteur|contr|gâchette|gachette|éclairage|eclairage|led/.test(n))i=2;
  else if(/colonne|garde-boue|boue/.test(n))i=3;
  return i}
var PRPOP=null;
document.addEventListener('input',function(e){if(e.target&&e.target.id==='pr-q')prFiltre(e.target.value)});
function prPopHtml(l){
  var n=Object.keys(PRPOP.sel).length;
  return"<div class='prpop' data-act='prFond'><div class='prbox'><div class='step'>Toutes les prestations</div><input id='pr-q' placeholder='Rechercher une prestation…' autocomplete='off'><div class='prlist'>"
    +PRFAM.map(function(F,fi){var L=l.filter(function(x){return prFam(x.nom)===fi});if(!L.length)return"";
      return"<div class='prfam' style='color:"+F[1]+";border-color:"+F[1]+"'>"+F[0]+"</div>"+L.map(function(x){var on=PRPOP.sel[x.id];return"<button class='prrow"+(on?" on":"")+"' style='border:3px solid "+F[1]+";"+(on?"background:"+F[1]+";color:#fff":"background:"+F[2])+"' data-act='prTog' data-id='"+x.id+"' data-n='"+esc((x.nom+" "+(x.raccourci||"")).toLowerCase())+"' data-r='"+esc(x.raccourci||"")+"' data-f='"+fi+"'><span>"+(on?"✓ ":"")+esc(x.nom)+"</span>"+(x.raccourci?"<b class='prcode'>"+esc(x.raccourci)+"</b>":"")+"<span class='muted'>"+eur(x.prixCents)+(x.avecPiece?" + "+esc(x.pieceAide||"pièce"):"")+"</span></button>"}).join("")}).join("")
    +"</div><div class='actions'><button data-act='prAjoute'"+(n?"":" disabled")+">Ajouter la sélection ("+n+")</button><button class='sec' data-act='prFerme'>Fermer</button></div></div></div>"}
function prestaBox(f){
  prestaLoad();
  var l=(PRESTA?PRESTA.prestations:[]).filter(function(x){return x.actif});
  var h="<div class='step' style='margin-top:10px'>Prestations</div>";
  if(!l.length)h+="<div class='muted'>Aucune prestation. Un admin peut en créer dans ⚙ Paramètres.</div>";
  else h+="<div class='presta'>"+l.slice().sort(function(a,b){return (b.usage||0)-(a.usage||0)}).slice(0,8).map(function(x){var F=PRFAM[prFam(x.nom)];return"<button class='sec' style='border-left:5px solid "+F[1]+";background:"+F[2]+"' data-act='addPresta' data-id='"+x.id+"'><b>"+esc(x.nom)+"</b>"+(x.raccourci?"<b class='prcode'>"+esc(x.raccourci)+"</b>":"")+"<br><span class='muted'>"+eur(x.prixCents)+(x.avecPiece?" + "+esc(x.pieceAide||"pièce"):"")+"</span></button>"}).join("")+"</div>"+(l.length>8?"<button class='sec' data-act='prPop' style='margin:4px 0'>Voir toutes les prestations ("+l.length+")</button>":"");
  if(PRPOP)h+=prPopHtml(l);
  if(PRESTA&&PRESTA.multi&&PRESTA.multi.remiseCents)h+="<div class='muted'>"+PRESTA.multi.seuil+" prestations ou plus : -"+eur(PRESTA.multi.remiseCents)+" (sans offre cumulée)</div>";
  var xo=DEVOPT?(PRESTA?PRESTA.prestations:[]).filter(function(p){return p.id===DEVOPT})[0]:null;
  if(xo&&(xo.options||[]).length)h+="<div class='step' style='margin-top:10px'>Options pour "+esc(xo.nom)+"</div><div class='presta'>"+xo.options.map(function(o){return"<button class='sec' data-act='addOpt' data-pid='"+xo.id+"' data-id='"+o.id+"'><b>"+esc(o.nom)+"</b><br><span class='muted'>+"+eur(o.prixCents)+"</span></button>"}).join("")+"</div>";
  if(DEVHINT)h+="<div class='card avbox'><b>"+esc(DEVHINT)+"</b></div>";
  return h}
function vFiche(){
  var f=FICHE;
  var h=subHtml()+"<button class='sec' data-act='fermerFiche' style='position:sticky;top:76px;z-index:9;width:auto;max-width:260px;white-space:nowrap;padding:10px 14px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.25);background:#fff'>← Retour à la liste</button>"
    +"<div class='card fiche'><div class='head'><div><div class='big'>"+pcn(f.id)+" · "+esc(f.client)+"</div><div>"+esc(f.trottinette)+"</div></div>"
    +"<div class='actions' style='margin:0'><button data-act='fichePlanif' data-id='"+f.id+"'>📅 Planifier</button><button class='sec' data-act='pecPrint' data-id='"+f.id+"'>Ticket de prise en charge</button>"+pecNbSelect(f.id)+"<button class='sec' data-act='docPrint' data-mode='devis' data-id='"+f.id+"'>Ticket devis</button><button class='sec' data-act='docPrint' data-mode='facture' data-id='"+f.id+"'>Ticket facture</button><button class='sec' data-act='pOpenCli' data-cid='"+f.customerId+"'>Voir le profil du client</button>"
    +(estResp()?"<button class='danger' data-act='supprFiche' data-id='"+f.id+"'>Supprimer</button>":"")+"</div></div>"
    +(f.pieceAValider?"<div class='card avbox'><b>📦 Pièce arrivée</b><div class='muted'>Vérifie que la pièce est bien là et correcte, puis valide : la réparation passe dans « À faire » et le client est prévenu.</div><div class='actions'><button data-act='validerPiece' data-id='"+f.id+"'>✅ Valider : passer dans À faire</button></div></div>":"")
    +cmdCard(f)
    +(f.pieceArrivee?"<div class='card avbox'><b>Pièce arrivée : prévenir le client</b><div class='muted'>"+esc(f.phone||"")+" "+esc(f.email||"")+"</div><div class='actions'>"+(f.email?"<a class='btn' href='mailto:"+esc(f.email)+"?subject="+encodeURIComponent("Votre pièce est arrivée - TURN Shop")+"&body="+encodeURIComponent("Bonjour, la pièce pour votre "+f.trottinette+" est arrivée. Nous pouvons poursuivre la réparation. L'équipe TURN Shop")+"'>Envoyer un email</a>":"")+"<button data-act='clientPrevenu' data-id='"+f.id+"'>Client prévenu</button></div></div>":"")
    +((f.remarques||"").indexOf("Autorisations client")===0?"<div class='card avbox'><b>🔧 "+esc(f.remarques)+"</b><div class='muted'>Si tu changes une pièce non prévue : ajoute-la au devis puis envoie l extension de devis au client.</div></div>":"")
    +(f.source==="web"?webHtml(f):"")
    +"<div class='muted'>"+(f.phone?esc(f.phone)+" · ":"")+"Dépôt "+esc(day(f.dateDepot))+"</div>"
    +(f.enMagasin===false?"<div class='tag warn' style='margin:6px 0'>Trottinette pas en magasin</div><button data-act='arrivee' data-id='"+f.id+"' data-fiche='1'>Trottinette arrivée</button>":"")
    +"<div class='step' style='margin-top:10px'>Statut</div><div class='stbtns'>"+ST.map(function(s){if(s==="devis envoyé"&&s!==f.statut)return"<button class='dis' disabled title='Se met tout seul quand tu envoies le devis au client'>"+esc(s)+" (auto)</button>";return"<button class='"+(s===f.statut?"on":"")+"' data-act='setStatut' data-id='"+f.id+"' data-s='"+esc(s)+"'>"+esc(s)+"</button>"}).join("")+"</div>"
    +"<button class='"+(f.sousGarantie?"":"sec")+"' data-act='setGarantie' data-id='"+f.id+"' data-v='"+(f.sousGarantie?0:1)+"' style='margin-top:8px;padding:12px 18px;font-size:16px;font-weight:800;"+(f.sousGarantie?"":"border:2px solid var(--vert);")+"'>"+(f.sousGarantie?"🛡 SOUS GARANTIE ✓ (clique pour retirer)":"🛡 Cette réparation est sous garantie ?")+"</button>"+(f.sousGarantie?"":"<div class='muted'>Clique pour ouvrir le suivi garantie : N° RMA, factures, demande au fournisseur.</div>")+"</div>"
    +codeCard(f)+boiteCard(f)+affairesCard(f)+garantieHtml(f)+(f.sousGarantie?facturesAchatHtml(f):"")+gardeHtml(f)
    +"<div class='card'><div class='step'>Description de la panne</div><textarea id='fp' rows='3'>"+esc(f.panne)+"</textarea>"
    +"<div class='step'>Commentaire interne (visible seulement par TURN)</div><textarea id='fc' rows='3' placeholder='Ce que le client a demandé, ce qu il faudrait lui proposer...'>"+esc(f.commentaireInterne||"")+"</textarea>"
    +"<button data-act='saveFiche' data-id='"+f.id+"'>Enregistrer la description et le commentaire</button></div>"
    +"<div class='card'><div class='step'>Devis</div>"+devisHtml(f)+"</div>"
    +"<div class='card'><div class='step'>Historique</div>"+(f.journal||[]).slice().reverse().map(function(j){return"<div class='hist'>"+esc(dayHour(j.date))+" · "+esc(j.texte)+"</div>"}).join("")
    +"<input id='fn' placeholder='Ajouter une note à l historique'><button class='sec' data-act='addNote' data-id='"+f.id+"'>Ajouter la note</button></div>";
  app.innerHTML=h}
function cmdCard(f){
  if(!f.commandes||!f.commandes.length)return"";
  return"<div class='card'><div class='step'>Pièces commandées</div>"+f.commandes.map(function(l){
    var tard=l.statut==="commandee"&&l.jours>=7;
    return"<div style='padding:6px 0;border-top:1px solid #eee'><b>"+esc(l.libelle)+"</b> <span class='muted'>("+esc(l.fournisseur)+")</span> "+(l.statut==="recue"?"<span class='tag ok'>Reçue</span>":"<span class='tag"+(tard?" warn":"")+"'>Commandée il y a "+l.jours+" j"+(tard?" · toujours pas arrivée ?":"")+"</span>")
      +"<div class='dl' style='margin-top:4px'><input id='fsv-"+l.id+"' value='"+esc(l.suivi||"")+"' placeholder='N° de suivi'><button class='sec' data-act='cmdSuiviFiche' data-id='"+l.id+"' data-r='"+f.id+"'>OK</button>"+(l.suivi?"<a class='link' target='_blank' rel='noopener' href='https://t.17track.net/fr#nums="+encodeURIComponent(l.suivi)+"'>Suivre le colis</a>":"")+"</div></div>"}).join("")+"</div>"}
function codeCard(f){return"<div class='card'><div class='step'>🔑 Code / mot de passe de la trottinette</div><div class='dl'><input id='fk' value='"+esc(f.codeAcces||"")+"' placeholder='Facultatif : code de déverrouillage, mot de passe de l app...'><button class='sec' data-act='codeSave' data-t='"+f.trottinetteId+"' data-id='"+f.id+"'>Enregistrer</button></div><div class='muted'>Gardé sur la trottinette du client : pas besoin de le redemander la prochaine fois.</div></div>"}
var BXOC=null;
function boitesCharge(){if(BXOC===null){BXOC=undefined;api("/boites").then(function(d){BXOC=d.boites;if(TAB==="enc")render()}).catch(function(){BXOC=[]})}}
var AFFL=["Casque","Clés","Chargeur","Autre"];
function affairesBox(pre){return"<div class='muted' style='margin-top:6px'>🎒 Affaires laissées par le client</div><div class='actions' style='flex-wrap:wrap'>"+AFFL.map(function(a,i){return"<label class='muted' style='display:flex;gap:6px;align-items:center'><input type='checkbox' id='"+pre+"-af"+i+"' style='width:auto;margin:0'> "+a+"</label>"}).join("")+"</div><div class='muted'>Casque coché = 3 tickets (un à agrafer au casque).</div>"}
function affairesLire(pre){return AFFL.filter(function(a,i){var e=document.getElementById(pre+"-af"+i);return e&&e.checked})}
function affairesCard(f){var A=f.affaires||[];return"<div class='card'><div class='step'>🎒 Affaires laissées par le client</div><div class='actions' style='flex-wrap:wrap'>"+AFFL.map(function(a){var on=A.indexOf(a)>=0;return"<button class='"+(on?"":"sec")+"' data-act='affSet' data-id='"+f.id+"' data-a='"+a+"'>"+(on?"✓ ":"")+a+"</button>"}).join("")+"</div>"+(A.length?"":"<div class='muted'>Rien de laissé.</div>")+"</div>"}
function boiteSelect(id){
  boitesCharge();var L=BXOC&&BXOC.length?BXOC:["C1","C2","C3","C4","C5","C6","C7","C8"].map(function(n){return{nom:n,repairId:null}});
  return"<select id='"+id+"'><option value=''>📦 Boîte de rangement (aucune)</option>"+L.map(function(b){return"<option value='"+esc(b.nom)+"'"+(b.repairId?" disabled":"")+">"+esc(b.nom)+(b.repairId?" (prise : "+pcn(b.repairId)+")":"")+"</option>"}).join("")+"</select>"}
function boiteCard(f){
  boitesCharge();var L=BXOC&&BXOC.length?BXOC:["C1","C2","C3","C4","C5","C6","C7","C8"].map(function(n){return{nom:n,repairId:null}});
  return"<div class='card'><div class='step'>📦 Matériel rangé dans la boîte</div><div class='actions' style='flex-wrap:wrap'>"+L.map(function(b){
    var moi=f.boite===b.nom,pris=b.repairId&&b.repairId!==f.id;
    return"<button class='"+(moi?"":"sec")+(pris?" dis":"")+"' "+(pris?"disabled title='"+esc(b.client||"")+"' ":"")+"data-act='boiteSet' data-id='"+f.id+"' data-b='"+esc(b.nom)+"'>"+esc(b.nom)+(pris?"<br><span style='font-size:11px'>"+pcn(b.repairId)+"</span>":"")+"</button>"}).join("")
    +(f.boite?"<button class='sec' data-act='boiteSet' data-id='"+f.id+"' data-b=''>Retirer</button>":"")+"</div>"+(f.boite?"":"<div class='muted'>Pas encore rangé.</div>")+"</div>"}
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
function payRecap(f){var P=payInfo(f);if(!P.a.verseCents&&!P.a.facture)return"";
  return"<div class='muted' style='margin:6px 0'>💶 Versé : <b>"+eur(P.net)+"</b>"+(P.tot>0?" · "+(P.due<0?"À rembourser : <b>"+eur(-P.due)+"</b>":"Reste à payer : <b>"+eur(P.due)+"</b>"):"")+(P.a.facture?" · <span class='tag ok'>Facturé "+esc(P.a.facture.numero||"")+"</span>":"")+"</div>"}
var ACM="carte",ACV=null,ACR="",RBM="";
function moyBtns(cur,act){return"<div class='seg'>"+[["carte","💳 Carte"],["especes","💶 Espèces"],["virement","🏦 Virement"]].map(function(m){return"<button class='"+(cur===m[0]?"on":"")+"' data-act='"+act+"' data-m='"+m[0]+"'>"+m[1]+"</button>"}).join("")+"</div>"}
function payInfo(f){
  var a=f.acompte||{verseCents:0,rembourseCents:0,resteCents:0,histo:[],facture:null},d=f.devis||{lignes:[]};
  var tot=d.lignes&&d.lignes.length?(d.netCents==null?d.totalCents:d.netCents):0;
  var net=a.verseCents-(a.rembourseCents||0),due=tot-net;
  return{a:a,tot:tot,net:net,due:due}}
function acompteHtml(f){
  var P=payInfo(f),a=P.a,tot=P.tot,net=P.net,due=P.due;
  var h="<div class='card'><div class='step'>💶 Paiements de la réparation</div>";
  var etat=a.facture?["Facturé","ok"]:(tot>0?(due<=0?(due<0?["Trop perçu : à rembourser","warn"]:["Soldé : prêt à facturer","ok"]):(net>0?["Acompte versé : reste "+eur(due),"warn"]:["Aucun paiement","warn"])):["Devis vide","warn"]);
  h+="<div class='paytiles'><div><span>Total du devis</span><b>"+(tot>0?eur(tot):"—")+"</b></div><div><span>Déjà versé</span><b>"+eur(net)+"</b></div><div class='"+(due>0?"due":"okk")+"'><span>"+(due<0?"À rembourser":"Reste à payer")+"</span><b>"+(tot>0?eur(Math.abs(due)):"—")+"</b></div></div>"
    +"<div style='margin:6px 0'><span class='tag "+etat[1]+"'>"+etat[0]+(a.facture&&a.facture.numero?" "+esc(a.facture.numero):"")+"</span></div>";
  if((a.histo||[]).length){h+="<table class='payh'><tr><th>Date</th><th>Mouvement</th><th>Moyen</th><th>Par</th><th class='n'>Montant</th></tr>"+a.histo.map(function(x){var re=x.kind==="remboursement";return"<tr><td>"+esc(dateLongue(x.date))+"</td><td>"+(re?"↩ Remboursement":"➕ Acompte / paiement")+"</td><td>"+esc((x.moyen||"").replace(/_/g," ").replace("especes","espèces"))+"</td><td>"+esc(x.par||"")+"</td><td class='n' style='color:"+(re?"#b00":"#1e8449")+"'><b>"+(re?"-":"+")+eur(x.cents)+"</b></td></tr>"}).join("")+"</table>"}
  else h+="<div class='muted'>Aucun paiement pour l'instant.</div>";
  if(!a.facture){
    var def=ACV!==null?ACV:(due>0?String(due/100).replace(".",","):"");
    h+="<div class='step' style='margin-top:14px'>Encaisser (acompte ou solde)</div>"+moyBtns(ACM,"acMoy")
      +"<div class='dl'><input id='ac-m' style='flex:0 0 180px;width:180px' placeholder='Montant €' value='"+esc(def)+"'>"
      +(due>0?"<button class='sec' data-act='acSolde' data-v='"+String(due/100).replace(".",",")+"'>Solde : "+eur(due)+"</button>"+(net===0&&due>=200?"<button class='sec' data-act='acSolde' data-v='"+String(Math.round(due/2)/100).replace(".",",")+"'>50 % : "+eur(Math.round(due/2))+"</button>":""):"")+"</div>"
      +(ACM==="especes"?"<div class='dl'><input id='ac-r' style='flex:0 0 300px;width:300px' placeholder='Espèces remises par le client €' value='"+esc(ACR)+"'><div id='ac-rendu' class='big' style='color:#b00;margin:0'></div></div>":"")
      +"<button data-act='acompte' data-id='"+f.id+"' style='width:100%;min-height:52px'>Encaisser le paiement</button>";
    if(!CPOP&&tot>0&&(f.devis.lignes||[]).length)h+="<div class='step' style='margin-top:14px'>Facture finale</div>"
      +"<button data-act='acSolder' data-id='"+f.id+"' style='width:100%;min-height:52px'>"+(due>0?"✅ Encaisser le solde ("+eur(due)+") et facturer":"✅ Facturer (déjà soldé)")+"</button>"
      +"<div class='muted'>Les acomptes sont déduits automatiquement. Offres ou cagnotte à appliquer ? <button class='link' data-act='facturer' data-id='"+f.id+"'>Passer en caisse</button> (tu pourras revenir sur la fiche depuis l'Atelier).</div>";
    if(net>0&&estResp())h+="<div class='step' style='margin-top:14px'>Rembourser le client</div><div class='seg'>"+[["carte","💳 Carte"],["especes","💶 Espèces"],["virement","🏦 Virement"],["bon","🎟 Bon d'achat atelier"],["carte_cadeau","🎁 Carte cadeau Shopify"]].map(function(m){return"<button class='"+(RBM===m[0]?"on":"")+"' data-act='rbMoy' data-m='"+m[0]+"'>"+m[1]+"</button>"}).join("")+"</div>"
      +"<div class='dl'><input id='rb-m' style='flex:0 0 180px;width:180px' placeholder='Montant € (vide = tout)' value=''>"+(due<0?"<button class='sec' data-act='rbTrop' data-v='"+String(-due/100).replace(".",",")+"'>Trop perçu : "+eur(-due)+"</button>":"")+"<button class='danger' data-act='rbFait' data-id='"+f.id+"'>Rembourser</button></div><div class='muted'>Maximum remboursable : "+eur(a.resteCents)+"</div>"}
  else h+="<div class='muted'>Facture "+esc(a.facture.numero||"")+" de "+eur(a.facture.cents)+" · "+esc(dateLongue(a.facture.date))+". Pour la réimprimer : « Ticket facture » en haut de la fiche.</div>";
  return h+"</div>"}
document.addEventListener('input',function(e){if(!e.target)return;if(e.target.id==='ac-m')ACV=e.target.value;if(e.target.id==='ac-r')ACR=e.target.value;if(e.target.id==='ac-m'||e.target.id==='ac-r'){var m=pxCents(v('ac-m')),r=pxCents(v('ac-r')),o=document.getElementById('ac-rendu');if(o)o.textContent=r>m&&m>0?'💶 À rendre au client : '+eur(r-m):''}});
document.addEventListener("change",function(e){var t=e.target;if(t&&t.classList&&t.classList.contains("lgr")&&FICHE){api("/devis/ligne/remise",{id:Number(t.dataset.lid),valeur:t.value}).then(function(){recharger(FICHE.id)}).catch(function(er){alert(er.message);recharger(FICHE.id)});return}if(t&&t.classList&&t.classList.contains("lgp")&&FICHE){api("/devis/ligne/prix",{id:Number(t.dataset.lid),prix:t.value}).then(function(){recharger(FICHE.id)}).catch(function(er){alert(er.message);recharger(FICHE.id)})}});
document.addEventListener("change",function(e){var t=e.target;if(t&&t.classList&&t.classList.contains("lgq")&&FICHE){api("/devis/ligne/quantite",{id:Number(t.dataset.lid),quantite:t.value}).then(function(){recharger(FICHE.id)}).catch(function(er){alert(er.message);recharger(FICHE.id)})}});
async function recharger(id){try{FICHE=await api("/reparation?id="+id);render()}catch(e){FICHE=null;render()}}

async function refresh(){if(CUR){CUR=await api("/customer?id="+CUR.id);render()}}
async function search(){var q=v("q");if(!q)return;try{RES=await api("/search?q="+encodeURIComponent(q));SEARCHED=true}catch(e){alert(e.message);return}render()}

`;
