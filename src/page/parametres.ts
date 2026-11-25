export const PARAMETRES = `// ---------- Paramètres (admins) ----------
var BRV=null,BRVBUSY=false,BRVMSG="",BRVTE="",PSEC="";var FOURNP=null;
var RCEDIT=0,RCMSG="",RCF={txt:"",f:"s1",p:false,raw:null};
var RCJ=["","lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];
function rcOptions(){
  var o=[["j1","Tous les jours"],["j2","Tous les 2 jours"],["j3","Tous les 3 jours"]];
  for(var i=1;i<=7;i++)o.push(["s"+i,"Chaque "+RCJ[i]]);
  o.push(["m1","Le 1er de chaque mois"],["m15","Le 15 de chaque mois"],["m31","Le dernier jour de chaque mois"]);
  if(RCF.f==="x"&&RCF.raw)o.push(["x","Garder : "+RCF.raw.libelle]);
  return o}
function rcValeur(r){
  if(r.unite==="jours"&&r.intervalle<=3)return"j"+r.intervalle;
  if(r.unite==="semaines"&&r.intervalle===1)return"s"+r.jourSemaine;
  if(r.unite==="mois"&&r.intervalle===1&&(r.jourMois===1||r.jourMois===15||r.jourMois===31))return"m"+r.jourMois;
  return"x"}
function optHtml(x){
  var o=x.options||[];
  return"<div class='muted'>Options : "+(o.length?o.map(function(y){return esc(y.nom)+" (+"+eur(y.prixCents)+") <button class='link' data-act='poSuppr' data-id='"+y.id+"'>retirer</button>"}).join(" · "):"aucune")+"</div>"
    +"<div class='dl'><input id='po-n-"+x.id+"' class='lb' placeholder='Nouvelle option (ex : valve tubeless)'><input id='po-p-"+x.id+"' class='p' placeholder='Prix €'><select id='po-t-"+x.id+"' class='t'><option value='piece'>Pièce</option><option value='main_oeuvre'>Main-d&#39;œuvre</option></select><button class='sec' data-act='poAdd' data-id='"+x.id+"'>Ajouter l'option</button></div>"}
var PSEDIT=0,PSMSG="",PSF={nom:"",prix:"",avecPiece:false,aide:"",qs:"",qr:""};
var TICK=null,TICKMSG="",SHOPCMD=null,SHOPRES="",PARAM=null,GARP=null,AVL=null,AVMSG="",AVDEC="achat",AVF={libelle:"",seuil:"",dd:"",df:"",effet:"cadeau",valeur:""};
function avDesc(a){return esc(avLabel(a))+" · "+esc(avCondition(a))}
function avForm(){
  var f=AVF,d=AVDEC,sel=function(val,cur,txt){return"<option value='"+val+"'"+(val===cur?" selected":"")+">"+txt+"</option>"};
  var h="<div class='avform'><b>Ajouter un cadeau ou une offre</b>"
    +"<label class='muted'>Nom (ex : Gant offert, -10 % week-end)</label><input id='avl' value='"+esc(f.libelle)+"'>"
    +"<label class='muted'>Quand ?</label><select id='avd' data-act='avType'>"+sel("achat",d,"Quand l'achat atteint un montant")+sel("cumul",d,"Quand le client a dépensé un total en caisse")+sel("date",d,"À une date ou sur une période")+"</select>";
  if(d==="date")h+="<label class='muted'>Du</label><input id='avdd' type='date' value='"+esc(f.dd)+"'><label class='muted'>Au</label><input id='avdf' type='date' value='"+esc(f.df)+"'>";
  h+="<label class='muted'>"+(d==="date"?"Achat minimum (€, facultatif)":d==="cumul"?"Total dépensé à atteindre (€)":"Montant d'achat à atteindre (€)")+"</label><input id='avs' value='"+esc(f.seuil)+"' placeholder='ex : 100'>"
    +"<label class='muted'>Récompense</label><select id='ave' data-act='avType'>"+sel("cadeau",f.effet,"Un cadeau (à remettre au client)")+sel("euros",f.effet,"Une remise en euros")+sel("pourcent",f.effet,"Une remise en pourcentage")+"</select>";
  if(f.effet!=="cadeau")h+="<label class='muted'>"+(f.effet==="euros"?"Montant de la remise (€)":"Pourcentage de remise (%)")+"</label><input id='avv' value='"+esc(f.valeur)+"'>";
  return h+"<button data-act='avSave'>Ajouter</button><div class='muted'>"+esc(AVMSG)+"</div></div>"}
var MODS=null,MODBUSY=false,MODOPEN=0,MODMSG="";
function modLoad(){if(MODS===null&&!MODBUSY){MODBUSY=true;api("/modeles").then(function(d){MODS=d.modeles;MODBUSY=false;render()}).catch(function(){MODS=[];MODBUSY=false;render()})}}
function modCard(){
  var q=(document.getElementById("mod-q")||{}).value||"";var ql=q.toLowerCase();
  var h="<div class='card'><div class='step'>Modèles de trottinettes et pièces compatibles</div><div class='muted'>"+MODS.length+" modèles. Ouvre un modèle pour lui rattacher les pneus et pièces compatibles (pris dans le catalogue turnshop.fr). Le client les verra dans son espace.</div>"
    +"<input id='mod-q' placeholder='Filtrer les modèles...' value='"+esc(q)+"' data-act='modFiltre'>"
    +"<div class='dl'><input id='mod-ma' class='t' placeholder='Marque'><input id='mod-mo' class='lb' placeholder='Modèle'><button data-act='modAdd'>Ajouter</button></div>";
  MODS.filter(function(m){return !ql||(m.marque+" "+m.modele).toLowerCase().indexOf(ql)>=0}).slice(0,60).forEach(function(m){
    var o=MODOPEN===m.id;
    h+="<div class='avrow'><div><b>"+esc(m.marque)+" "+esc(m.modele)+"</b> <span class='tag"+(m.pieces.length?" ok":"")+"'>"+m.pieces.length+" pièce"+(m.pieces.length>1?"s":"")+"</span></div><div class='actions'><button class='sec' data-act='modOpen' data-id='"+m.id+"'>"+(o?"Fermer":"Pièces")+"</button><button class='danger' data-act='modSuppr' data-id='"+m.id+"'>Supprimer</button></div></div>";
    if(o){h+="<div class='card'>"+(m.pieces.length?m.pieces.map(function(p){return"<div class='avrow'><div>"+esc(p.libelle)+" <span class='muted'>"+esc(p.sku||"")+"</span></div><button class='link' data-act='modPieceSuppr' data-id='"+p.id+"'>Retirer</button></div>"}).join(""):"<div class='muted'>Aucune pièce rattachée.</div>")+"<div class='step'>Ajouter une pièce compatible</div>"+prodBox("mod"+m.id)+"</div>"}});
  var nl=String.fromCharCode(10);
  h+="<div class='step' style='margin-top:10px'>Import CSV (marque;modele;categorie;sku;libelle)</div><textarea id='mod-csv' rows='4' placeholder='Xiaomi;M365;pneu;SKU-123;Pneu 8.5 pouces'></textarea><button class='sec' data-act='modImport'>Importer</button><div class='muted'>"+esc(MODMSG)+"</div></div>";
  return h}
function vParam(){
  if(ROLE!=="admin"){app.innerHTML="<div class='card'>Réservé aux administrateurs.</div>";return}
  if(SHOPCMD===null){SHOPCMD=undefined;api("/reglages/commandes").then(function(d){SHOPCMD=d.actif;render()}).catch(function(){SHOPCMD=false;render()})}
  if(TICK===null){TICK=undefined;api("/reglages/ticket").then(function(d){TICK=d;render()}).catch(function(){TICK={entete:"",avisAmiens:"",avisRouen:""};render()})}
  if(!PARAM||!AVL){
    app.innerHTML="<div class='card'>Chargement…</div>";
    Promise.all([api("/parametres"),api("/avantages")]).then(function(r){PARAM=r[0];AVL=r[1];render()}).catch(function(e){app.innerHTML="<div class='card'>"+esc(e.message)+"</div>"});return}
  var S={};var h="<div class='card'><div class='step'>Programme de fidélité</div><div class='muted'>Règle de départ : 100 € dépensés = 5 € offerts. Tu peux la changer quand tu veux.</div>"
    +"<label class='muted'>Euros à dépenser pour gagner un palier</label><input id='pe1' value='"+esc(PARAM.eurosPourPalier)+"'>"
    +"<label class='muted'>Remise offerte à chaque palier (€)</label><input id='pr1' value='"+esc(PARAM.remiseEuros)+"'>"
    +"<button data-act='saveParam'>Enregistrer</button><div class='muted' id='parmsg'></div></div>";
  if(GARP===null){GARP=undefined;api("/parametres/garantie").then(function(d){GARP=d;render()}).catch(function(){GARP={jours:7};render()})}
  S.garantie="<div class='card'><div class='step'>Garantie fournisseur</div><div class='muted'>Quand tu cliques « Demande faite au fournisseur » dans une prise en charge, une relance revient dans la to-do tous les X jours.</div>"
    +"<label class='muted'>Délai de relance (jours)</label><input id='gj1' value='"+esc(GARP?GARP.jours:7)+"'><button data-act='saveGarP'>Enregistrer</button><div class='muted' id='garmsg'></div></div>";
  h+="<div class='card'><div class='step'>Cadeaux et offres</div><div class='muted'>Ils apparaissent automatiquement en caisse quand les conditions sont remplies (le vendeur peut les décocher).</div>";
  if(!AVL.length)h+="<div class='muted' style='margin:8px 0'>Aucun cadeau ni offre pour l'instant.</div>";
  AVL.forEach(function(a){h+="<div class='avrow'><div><b>"+esc(a.libelle)+"</b>"+(a.actif?"":" <span class='tag'>désactivé</span>")+"<div class='muted'>"+avDesc(a)+"</div></div><div class='actions'><button class='sec' data-act='avEtat' data-id='"+a.id+"' data-v='"+(a.actif?0:1)+"'>"+(a.actif?"Désactiver":"Réactiver")+"</button><button class='sec' data-act='avSuppr' data-id='"+a.id+"'>Supprimer</button></div></div>"});
  h+=avForm()+"</div>";
  S.fid=h;h="";
  if(BRV===null&&!BRVBUSY){BRVBUSY=true;api("/brevo").then(function(d){BRV=d;BRVBUSY=false;render()}).catch(function(){BRV={configure:false,auto:{},messages:[]};BRVBUSY=false;render()})}
  if(BRV){var BL=[["avis","Demande d'avis après encaissement"],["rdv","Rappel de rendez-vous (la veille, entre 9 h et 19 h)"],["piece","Pièce arrivée (réparation reprend)"],["pret","Trottinette prête à récupérer"],["garde","Gardiennage : dernier jour (J4), rappel chaque semaine, abandon à 30 jours"],["anniv","Anniversaire du compte (1 an) : email avec offre révision à 39,90 €"],["bonexp","Bons d'achat (valables 12 mois) : email 6 mois, 3 mois et 1 mois avant expiration"]],BO=[["off","Désactivé"],["email","Activé (email)"]];
    h+="<div class='card'><div class='step'>Envois automatiques aux clients (Brevo)</div>"
      +(BRV.configure?"<div class='muted'>Brevo est connecté."+(BRV.expediteurEmail?"":" Il manque BREVO_EMAIL_EXPEDITEUR dans Railway pour les emails.")+"</div>":"<div class='muted'><b>Brevo n'est pas connecté.</b> Dans Railway, ajoute les variables BREVO_API_KEY (clé API Brevo) et BREVO_EMAIL_EXPEDITEUR (adresse d'envoi validée dans Brevo).</div>");
    BL.forEach(function(x){h+="<label class='muted'>"+esc(x[1])+"</label><select id='bv-"+x[0]+"'>"+BO.map(function(o){return"<option value='"+o[0]+"'"+((BRV.auto[x[0]]||"off")===o[0]?" selected":"")+">"+o[1]+"</option>"}).join("")+"</select>"});
    h+="<button data-act='brvSave'>Enregistrer</button>"
      +"<div class='step' style='margin-top:12px'>Tester l'envoi</div><div class='dl'><input id='bv-te' class='lb' placeholder='Ton email' value='"+esc(BRVTE)+"'><button class='sec' data-act='brvTest'>Envoyer un test</button></div><div class='muted'>"+esc(BRVMSG)+"</div>";
    if((BRV.messages||[]).length){h+="<div class='step' style='margin-top:12px'>Derniers envois</div>";BRV.messages.forEach(function(m){h+="<div class='muted'>"+esc(dateLongue(m.cree_le))+" · "+esc(m.type)+" · "+esc(m.canal)+" · "+esc(m.client||m.destinataire)+" · "+(m.statut==="envoye"?"envoyé":"<b>erreur</b> "+esc(m.erreur||""))+"</div>"})}
    h+="</div>"}
  S.brevo=h;h="";
  trecLoad();
  if(TREC){var JS=["","lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];
    h+="<div class='card'><div class='step'>To-do list récurrente</div><div class='muted'>Ces tâches reviennent toutes seules dans l'onglet « Récurrentes » du Dashboard, à la fréquence choisie. Elles ne se modifient qu'ici.</div>";
    if(!TREC.length)h+="<div class='muted' style='margin:8px 0'>Aucune tâche récurrente.</div>";
    TREC.forEach(function(r){h+="<div class='avrow'><div><b>"+esc(r.texte)+"</b>"+(r.priorite?" <span class='tag warn'>priorité</span>":"")+(r.actif?"":" <span class='tag'>désactivée</span>")+"<div class='muted'>"+esc(r.libelle)+" · prochaine fois : "+jourCourt(r.prochaine)+"</div></div><div class='actions'><button class='sec' data-act='rcEdit' data-id='"+r.id+"'>Modifier</button><button class='sec' data-act='rcEtat' data-id='"+r.id+"' data-v='"+(r.actif?"0":"1")+"'>"+(r.actif?"Désactiver":"Activer")+"</button><button class='danger' data-act='rcSuppr' data-id='"+r.id+"'>Supprimer</button></div></div>"});
    h+="<div class='step' style='margin-top:10px'>"+(RCEDIT?"Modifier la tâche":"Nouvelle tâche récurrente")+"</div><input id='rc-txt' placeholder='Ex : Vider les poubelles, faire la caisse, commander les consommables' value='"+esc(RCF.txt)+"'>"
      +"<div class='muted'>Quand ?</div><select id='rc-f'>"+rcOptions().map(function(o){return"<option value='"+o[0]+"'"+(o[0]===RCF.f?" selected":"")+">"+esc(o[1])+"</option>"}).join("")+"</select>"
      +"<label class='muted' style='display:flex;gap:8px;align-items:center'><input type='checkbox' id='rc-p' style='width:auto;margin:0' "+(RCF.p?"checked":"")+"> Marquer comme priorité</label>"
      +"<button data-act='rcSave'>"+(RCEDIT?"Enregistrer":"Ajouter")+"</button><div class='muted'>"+esc(RCMSG)+"</div></div>"}
  S.todo=h;h="";
  modLoad();
  if(MODS)h+=modCard();
  S.modeles=h;h="";
  prestaLoad();
  if(PRESTA){h+="<div class='card'><div class='step'>Prestations (main-d'œuvre du devis)</div><div class='muted'>Ces boutons apparaissent dans les devis. Si la prestation demande une pièce (ex : pneu), l'atelier propose de la choisir dans le catalogue.</div>";
    if(!PRESTA.prestations.length)h+="<div class='muted' style='margin:8px 0'>Aucune prestation.</div>";
    PRESTA.prestations.forEach(function(x){h+="<div class='avrow'><div><b>"+esc(x.nom)+"</b> · "+eur(x.prixCents)+(x.actif?"":" <span class='tag'>désactivée</span>")+(x.avecPiece?"<div class='muted'>Avec choix : "+esc(x.pieceAide||"pièce")+"</div>":"")+optHtml(x)+(x.qteSeuil>0&&x.qteRemiseCents>0?"<div class='muted'>Dès "+x.qteSeuil+" fois : -"+eur(x.qteRemiseCents)+"</div>":"")+"</div><div class='actions'><button class='sec' data-act='psEdit' data-id='"+x.id+"'>Modifier</button><button class='sec' data-act='psEtat' data-id='"+x.id+"' data-v='"+(x.actif?"0":"1")+"'>"+(x.actif?"Désactiver":"Activer")+"</button><button class='danger' data-act='psSuppr' data-id='"+x.id+"'>Supprimer</button></div></div>"});
    h+="<div class='step' style='margin-top:10px'>"+(PSEDIT?"Modifier la prestation":"Nouvelle prestation")+"</div><input id='ps-nom' placeholder='Ex : Pneu + pose' value='"+esc(PSF.nom)+"'><input id='ps-prix' placeholder='Prix main-d&#39;œuvre € (ex : 30)' value='"+esc(PSF.prix)+"'>"
      +"<label class='muted' style='display:flex;gap:8px;align-items:center'><input type='checkbox' id='ps-piece' style='width:auto;margin:0' "+(PSF.avecPiece?"checked":"")+"> Il faut choisir une pièce en plus</label><input id='ps-aide' placeholder='Quelle pièce ? (ex : pneu)' value='"+esc(PSF.aide)+"'>"
      +"<div class='muted'>Condition de remise propre à cette prestation (laisser vide si aucune) :</div><div class='dl'><span class='muted'>Dès</span><input id='ps-qs' class='q' type='number' min='0' value='"+esc(PSF.qs)+"'><span class='muted'>fois cette prestation, remise de</span><input id='ps-qr' class='p' placeholder='€' value='"+esc(PSF.qr)+"'></div>"
      +"<button data-act='psSave'>"+(PSEDIT?"Enregistrer":"Ajouter")+"</button>"
      +"<div class='step' style='margin-top:14px'>Remise plusieurs prestations</div><div class='muted'>Appliquée automatiquement, seulement si aucune offre ou cadeau n'est utilisé.</div>"
      +"<div class='dl'><input id='mu-n' class='q' type='number' min='2' value='"+PRESTA.multi.seuil+"'><span class='muted'>prestations ou plus =</span><input id='mu-e' class='p' value='"+esc(String(PRESTA.multi.remiseCents/100).replace(".",","))+"'><span class='muted'>€ de remise</span><button data-act='multiSave'>Enregistrer</button></div>"
      +"<div class='muted'>"+esc(PSMSG)+"</div></div>"}
  S.presta=h;h="";
  h+="<div class='card'><div class='step'>Connexion Shopify</div><div class='muted'>Teste la connexion au catalogue turnshop.fr.</div><button data-act='shopTest'>Tester la connexion</button><div id='shopres'>"+(SHOPRES||"")+"</div></div>";
  h+="<div class='card'><div class='step'>Commandes Shopify à la facturation</div><div class='muted'>Quand on encaisse un devis de réparation, une commande (pièces + main-d'œuvre) est créée dans Shopify et rattachée au compte du client. Elle décompte le stock des pièces.</div><div class='big'>"+(SHOPCMD?"Activé":"Désactivé")+"</div><div class='actions'><button class='"+(SHOPCMD?"sec":"")+"' data-act='shopCmd' data-v='1'>Activer</button><button class='"+(SHOPCMD?"":"sec")+"' data-act='shopCmd' data-v='0'>Désactiver</button></div></div>";
  S.shopify=h;h="";
  if(TICK){var nl=String.fromCharCode(10);h+="<div class='card'><div class='step'>Ticket de caisse</div><div class='muted'>Imprimé en 80 mm (choisis ton imprimante à tickets dans la fenêtre d'impression). Le QR code du bas mène à ta page d'avis Google.</div>"
    +"<label class='muted'>En-tête (une ligne par ligne : nom, adresse, SIRET...)</label><textarea id='tk-ent' rows='4'>"+esc(TICK.entete)+"</textarea>"
    +"<label class='muted'>Lien d'avis Google - Amiens</label><input id='tk-am' value='"+esc(TICK.avisAmiens)+"' placeholder='https://g.page/r/...'>"
    +"<label class='muted'>Lien d'avis Google - Rouen</label><input id='tk-ro' value='"+esc(TICK.avisRouen)+"' placeholder='https://g.page/r/...'>"
    +"<label class='muted'>Devis : lien du QR « Prendre rendez-vous »</label><input id='tk-rdv' value='"+esc(TICK.rdvUrl||"")+"' placeholder='https://turnshop.fr/...'>"
    +"<label class='muted'>Facture : lien du QR « Notre site / carte de fidélité »</label><input id='tk-site' value='"+esc(TICK.siteUrl||"")+"' placeholder='https://turnshop.fr'>"
    +"<label class='muted'>Devis : coordonnées Amiens (adresse, téléphone...)</label><textarea id='tk-ca' rows='2'>"+esc(TICK.coordAmiens||"")+"</textarea>"
    +"<label class='muted'>Devis : coordonnées Rouen (adresse, téléphone...)</label><textarea id='tk-cr' rows='2'>"+esc(TICK.coordRouen||"")+"</textarea>"
    +"<button data-act='tickSave'>Enregistrer le ticket</button><div class='muted'>"+esc(TICKMSG)+"</div></div>"}
  S.ticket=h;h="";
  cptLoad();
  if(CPT)h+=cptCard();
  S.compta=h;h="";
  maitLoad();
  if(MAIT)h+=maitCard();
  S.maitres=h;
  if(typeof LISTES!=="undefined"&&LISTES===null&&typeof listesCharge==="function")listesCharge();
  S.listes="<div class='card'><div class='step'>Pannes fréquentes</div><div class='muted'>Une par ligne. Ce sont les boutons sous « Panne décrite par le client ».</div><textarea id='ls-p' rows='9'>"+esc(((LISTES&&LISTES.pannes)||[]).join("\\n"))+"</textarea>"
    +"<div class='step' style='margin-top:12px'>États à l'arrivée</div><div class='muted'>Une par ligne. C'est la liste déroulante « État à l'arrivée ».</div><textarea id='ls-e' rows='8'>"+esc(((LISTES&&LISTES.etats)||[]).join("\\n"))+"</textarea>"
    +"<button data-act='saveListes'>Enregistrer</button><div class='muted' id='lsmsg'></div></div>";
  if(FOURNP===null){FOURNP=undefined;api("/achats").then(function(d){FOURNP=d.fournisseurs;render()}).catch(function(){FOURNP=[];render()})}
  S.fourn="<div class='card'><div class='step'>Nouveau fournisseur</div><div class='dl'><input id='fn' class='lb' placeholder='Nom (ex : eWheel)'><input id='fe' class='lb' placeholder='Email pour les commandes'><button data-act='fAdd'>Ajouter</button></div><div class='muted'>"+esc(CMDMSG||"")+"</div></div><div class='card'><div class='step'>Mes fournisseurs</div>"+(FOURNP?FOURNP.map(function(f){return"<div class='muted'>"+esc(f.nom)+(f.email?" · "+esc(f.email):"")+"</div>"}).join(""):"<div class='muted'>Chargement…</div>")+"<div class='muted' style='margin-top:6px'>L'email et le franco se règlent dans l'onglet Commandes.</div></div>";
  S.defi=defiParam();
  S.mdp=mdpParam();
  var SEC=[['defi','Défi du mois','Meilleur réparateur et meilleur vendeur, cadeau'],['mdp','Mot de passe','Changer mon mot de passe, réinitialiser un membre'],['fourn','Fournisseurs','Ajouter un fournisseur de commandes (eWheel...)'],['maitres','Produit maître','Un nom pour plusieurs produits, affiché sur le devis'],['listes','Pannes et états','Boutons de pannes et liste des états à la création'],['garantie','Garanties fournisseur','Délai de relance dans la to-do'],['fid','Carte de fidélité et cadeaux','Règle des points, cadeaux et offres'],['brevo','Emails et rappels automatiques','Avis Google, rappel de RDV, pièce arrivée (Brevo)'],['todo','To-do récurrente','Tâches qui reviennent toutes seules'],['modeles','Modèles de trottinettes et pièces','Pneus et pièces compatibles par modèle'],['presta','Prestations et remises','Tarifs du devis et remise plusieurs prestations'],['shopify','Connexion Shopify','Test de connexion, commandes Shopify à la facturation'],['ticket','Ticket de caisse','En-tête et liens des avis Google'],['compta','Comptabilité et export','Comptes, analytique, journal des ventes (CSV)']];
  if(!PSEC){
    var POLES=[["Atelier",["presta","modeles","listes","garantie"]],["Caisse et clients",["ticket","fid","compta"]],["Stock et catalogue",["fourn","maitres","shopify"]],["Automatisations",["brevo","todo"]],["Équipe",["defi","mdp"]]],hp="";
    POLES.forEach(function(P){hp+="<div class='card'><div class='step'>"+P[0]+"</div>"+P[1].map(function(k){var x=SEC.filter(function(y){return y[0]===k})[0];return x?"<button class='sec hrow' data-act='parSec' data-s='"+x[0]+"'><b>"+x[1]+"</b><br><span class='muted'>"+x[2]+"</span></button>":""}).join("")+"</div>"});
    app.innerHTML=hp;return}
  var cur=SEC.filter(function(x){return x[0]===PSEC})[0];
  app.innerHTML="<button class='sec' data-act='parBack' style='max-width:260px'>← Paramètres</button><div class='step' style='margin:10px 0'>"+(cur?cur[1]:"")+"</div>"+(S[PSEC]||"<div class='card'>Chargement…</div>")}
`;
