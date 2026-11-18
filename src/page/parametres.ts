export const PARAMETRES = `// ---------- Paramètres (admins) ----------
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
var PSEDIT=0,PSMSG="",PSF={nom:"",prix:"",avecPiece:false,aide:"",qs:"",qr:""};
var TICK=null,TICKMSG="",SHOPCMD=null,SHOPRES="",PARAM=null,AVL=null,AVMSG="",AVDEC="achat",AVF={libelle:"",seuil:"",dd:"",df:"",effet:"cadeau",valeur:""};
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
function vParam(){
  if(ROLE!=="admin"){app.innerHTML="<div class='card'>Réservé aux administrateurs.</div>";return}
  if(SHOPCMD===null){SHOPCMD=undefined;api("/reglages/commandes").then(function(d){SHOPCMD=d.actif;render()}).catch(function(){SHOPCMD=false;render()})}
  if(TICK===null){TICK=undefined;api("/reglages/ticket").then(function(d){TICK=d;render()}).catch(function(){TICK={entete:"",avisAmiens:"",avisRouen:""};render()})}
  if(!PARAM||!AVL){
    app.innerHTML="<div class='card'>Chargement…</div>";
    Promise.all([api("/parametres"),api("/avantages")]).then(function(r){PARAM=r[0];AVL=r[1];render()}).catch(function(e){app.innerHTML="<div class='card'>"+esc(e.message)+"</div>"});return}
  var h="<div class='card'><div class='step'>Programme de fidélité</div><div class='muted'>Règle de départ : 100 € dépensés = 5 € offerts. Tu peux la changer quand tu veux.</div>"
    +"<label class='muted'>Euros à dépenser pour gagner un palier</label><input id='pe1' value='"+esc(PARAM.eurosPourPalier)+"'>"
    +"<label class='muted'>Remise offerte à chaque palier (€)</label><input id='pr1' value='"+esc(PARAM.remiseEuros)+"'>"
    +"<button data-act='saveParam'>Enregistrer</button><div class='muted' id='parmsg'></div></div>";
  h+="<div class='card'><div class='step'>Cadeaux et offres</div><div class='muted'>Ils apparaissent automatiquement en caisse quand les conditions sont remplies (le vendeur peut les décocher).</div>";
  if(!AVL.length)h+="<div class='muted' style='margin:8px 0'>Aucun cadeau ni offre pour l'instant.</div>";
  AVL.forEach(function(a){h+="<div class='avrow'><div><b>"+esc(a.libelle)+"</b>"+(a.actif?"":" <span class='tag'>désactivé</span>")+"<div class='muted'>"+avDesc(a)+"</div></div><div class='actions'><button class='sec' data-act='avEtat' data-id='"+a.id+"' data-v='"+(a.actif?0:1)+"'>"+(a.actif?"Désactiver":"Réactiver")+"</button><button class='sec' data-act='avSuppr' data-id='"+a.id+"'>Supprimer</button></div></div>"});
  h+=avForm()+"</div>";
  trecLoad();
  if(TREC){var JS=["","lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];
    h+="<div class='card'><div class='step'>To-do list récurrente</div><div class='muted'>Ces tâches reviennent toutes seules dans l'onglet « Récurrentes » du Dashboard, à la fréquence choisie. Elles ne se modifient qu'ici.</div>";
    if(!TREC.length)h+="<div class='muted' style='margin:8px 0'>Aucune tâche récurrente.</div>";
    TREC.forEach(function(r){h+="<div class='avrow'><div><b>"+esc(r.texte)+"</b>"+(r.priorite?" <span class='tag warn'>priorité</span>":"")+(r.actif?"":" <span class='tag'>désactivée</span>")+"<div class='muted'>"+esc(r.libelle)+" · prochaine fois : "+jourCourt(r.prochaine)+"</div></div><div class='actions'><button class='sec' data-act='rcEdit' data-id='"+r.id+"'>Modifier</button><button class='sec' data-act='rcEtat' data-id='"+r.id+"' data-v='"+(r.actif?"0":"1")+"'>"+(r.actif?"Désactiver":"Activer")+"</button><button class='danger' data-act='rcSuppr' data-id='"+r.id+"'>Supprimer</button></div></div>"});
    h+="<div class='step' style='margin-top:10px'>"+(RCEDIT?"Modifier la tâche":"Nouvelle tâche récurrente")+"</div><input id='rc-txt' placeholder='Ex : Vider les poubelles, faire la caisse, commander les consommables' value='"+esc(RCF.txt)+"'>"
      +"<div class='muted'>Quand ?</div><select id='rc-f'>"+rcOptions().map(function(o){return"<option value='"+o[0]+"'"+(o[0]===RCF.f?" selected":"")+">"+esc(o[1])+"</option>"}).join("")+"</select>"
      +"<label class='muted' style='display:flex;gap:8px;align-items:center'><input type='checkbox' id='rc-p' style='width:auto;margin:0' "+(RCF.p?"checked":"")+"> Marquer comme priorité</label>"
      +"<button data-act='rcSave'>"+(RCEDIT?"Enregistrer":"Ajouter")+"</button><div class='muted'>"+esc(RCMSG)+"</div></div>"}
  prestaLoad();
  if(PRESTA){h+="<div class='card'><div class='step'>Prestations (main-d'œuvre du devis)</div><div class='muted'>Ces boutons apparaissent dans les devis. Si la prestation demande une pièce (ex : pneu), l'atelier propose de la choisir dans le catalogue.</div>";
    if(!PRESTA.prestations.length)h+="<div class='muted' style='margin:8px 0'>Aucune prestation.</div>";
    PRESTA.prestations.forEach(function(x){h+="<div class='avrow'><div><b>"+esc(x.nom)+"</b> · "+eur(x.prixCents)+(x.actif?"":" <span class='tag'>désactivée</span>")+(x.avecPiece?"<div class='muted'>Avec choix : "+esc(x.pieceAide||"pièce")+"</div>":"")+(x.qteSeuil>0&&x.qteRemiseCents>0?"<div class='muted'>Dès "+x.qteSeuil+" fois : -"+eur(x.qteRemiseCents)+"</div>":"")+"</div><div class='actions'><button class='sec' data-act='psEdit' data-id='"+x.id+"'>Modifier</button><button class='sec' data-act='psEtat' data-id='"+x.id+"' data-v='"+(x.actif?"0":"1")+"'>"+(x.actif?"Désactiver":"Activer")+"</button><button class='danger' data-act='psSuppr' data-id='"+x.id+"'>Supprimer</button></div></div>"});
    h+="<div class='step' style='margin-top:10px'>"+(PSEDIT?"Modifier la prestation":"Nouvelle prestation")+"</div><input id='ps-nom' placeholder='Ex : Pneu + pose' value='"+esc(PSF.nom)+"'><input id='ps-prix' placeholder='Prix main-d&#39;œuvre € (ex : 30)' value='"+esc(PSF.prix)+"'>"
      +"<label class='muted' style='display:flex;gap:8px;align-items:center'><input type='checkbox' id='ps-piece' style='width:auto;margin:0' "+(PSF.avecPiece?"checked":"")+"> Il faut choisir une pièce en plus</label><input id='ps-aide' placeholder='Quelle pièce ? (ex : pneu)' value='"+esc(PSF.aide)+"'>"
      +"<div class='muted'>Condition de remise propre à cette prestation (laisser vide si aucune) :</div><div class='dl'><span class='muted'>Dès</span><input id='ps-qs' class='q' type='number' min='0' value='"+esc(PSF.qs)+"'><span class='muted'>fois cette prestation, remise de</span><input id='ps-qr' class='p' placeholder='€' value='"+esc(PSF.qr)+"'></div>"
      +"<button data-act='psSave'>"+(PSEDIT?"Enregistrer":"Ajouter")+"</button>"
      +"<div class='step' style='margin-top:14px'>Remise plusieurs prestations</div><div class='muted'>Appliquée automatiquement, seulement si aucune offre ou cadeau n'est utilisé.</div>"
      +"<div class='dl'><input id='mu-n' class='q' type='number' min='2' value='"+PRESTA.multi.seuil+"'><span class='muted'>prestations ou plus =</span><input id='mu-e' class='p' value='"+esc(String(PRESTA.multi.remiseCents/100).replace(".",","))+"'><span class='muted'>€ de remise</span><button data-act='multiSave'>Enregistrer</button></div>"
      +"<div class='muted'>"+esc(PSMSG)+"</div></div>"}
  h+="<div class='card'><div class='step'>Connexion Shopify</div><div class='muted'>Teste la connexion au catalogue turnshop.fr.</div><button data-act='shopTest'>Tester la connexion</button><div id='shopres'>"+(SHOPRES||"")+"</div></div>";
  h+="<div class='card'><div class='step'>Commandes Shopify à la facturation</div><div class='muted'>Quand on encaisse un devis de réparation, une commande (pièces + main-d'œuvre) est créée dans Shopify et rattachée au compte du client. Elle décompte le stock des pièces.</div><div class='big'>"+(SHOPCMD?"Activé":"Désactivé")+"</div><div class='actions'><button class='"+(SHOPCMD?"sec":"")+"' data-act='shopCmd' data-v='1'>Activer</button><button class='"+(SHOPCMD?"":"sec")+"' data-act='shopCmd' data-v='0'>Désactiver</button></div></div>";
  if(TICK){var nl=String.fromCharCode(10);h+="<div class='card'><div class='step'>Ticket de caisse</div><div class='muted'>Imprimé en 80 mm (choisis ton imprimante à tickets dans la fenêtre d'impression). Le QR code du bas mène à ta page d'avis Google.</div>"
    +"<label class='muted'>En-tête (une ligne par ligne : nom, adresse, SIRET...)</label><textarea id='tk-ent' rows='4'>"+esc(TICK.entete)+"</textarea>"
    +"<label class='muted'>Lien d'avis Google - Amiens</label><input id='tk-am' value='"+esc(TICK.avisAmiens)+"' placeholder='https://g.page/r/...'>"
    +"<label class='muted'>Lien d'avis Google - Rouen</label><input id='tk-ro' value='"+esc(TICK.avisRouen)+"' placeholder='https://g.page/r/...'>"
    +"<button data-act='tickSave'>Enregistrer le ticket</button><div class='muted'>"+esc(TICKMSG)+"</div></div>"}
  app.innerHTML=h}
`;
