export const CAISSE = `// ---------- Caisse (colonne de droite du Dashboard) ----------
var PAN=[],CCLI=null,CFID=null,CUSE=false,CPAY={carte:"",especes:"",virement:"",bon_achat:""},CREP=null,CMSG="";
var CAV=null,CAVBUSY=false,CAVOFF=[],CREC=null,CHIST=null,CHOPEN=0;
var PRESTA=null,PRESBUSY=false,DEVHINT="",CACO=0,DEVOPT=0;
function acoDeduit(reste){return CREP&&CACO>0?Math.max(0,Math.min(CACO,reste)):0}
function prestaLoad(){if(PRESTA===null&&!PRESBUSY){PRESBUSY=true;api("/prestations").then(function(d){PRESTA=d;PRESBUSY=false;render()}).catch(function(){PRESTA={prestations:[],multi:{seuil:2,remiseCents:0}};PRESBUSY=false;render()})}}
function multiRem(brut){
  if(!PRESTA||brut<=0||avChoisis(brut).length)return 0;
  var m=PRESTA.multi||{seuil:2,remiseCents:0},mo=PAN.filter(function(l){return l.type==="main_oeuvre"});
  var nb=mo.reduce(function(s,l){return s+l.quantite},0),best=nb>=m.seuil?(m.remiseCents||0):0;
  PRESTA.prestations.forEach(function(p){
    if(!p.actif||!(p.qteSeuil>0)||!(p.qteRemiseCents>0))return;
    var q=mo.filter(function(l){return l.libelle.trim().toLowerCase()===p.nom.trim().toLowerCase()}).reduce(function(s,l){return s+l.quantite},0);
    if(q>=p.qteSeuil&&p.qteRemiseCents>best)best=p.qteRemiseCents});
  return Math.min(best,brut)}
var MOY={carte:"Carte",especes:"Espèces",virement:"Virement",bon_achat:"Bon d achat",en_ligne:"En ligne"};
function pxCents(s){return Math.round(Number(String(s).replace(",","."))*100)||0}
function panierTotal(){return PAN.reduce(function(s,l){return s+l.quantite*pxCents(l.prix)},0)}
function avApplicable(a,brut){
  if(brut<=0)return false;
  if(a.declencheur==="cumul")return !!(CCLI&&CFID)&&(CFID.recus||[]).indexOf(a.id)<0&&(CFID.depenseCents||0)+brut>=a.seuilCents;
  return brut>=a.seuilCents}
function avRemise(a,brut){if(a.effet==="euros")return Math.round(a.valeur*100);if(a.effet==="pourcent")return Math.round(brut*a.valeur/100);return 0}
function avChoisis(brut){return(CAV||[]).filter(function(a){return avApplicable(a,brut)&&CAVOFF.indexOf(a.id)<0})}
function avRemTotal(brut){var reste=brut,s=0;avChoisis(brut).forEach(function(a){var c=Math.min(avRemise(a,brut),reste);reste-=c;s+=c});return s+multiRem(brut)}
function avLabel(a){return a.effet==="euros"?"-"+a.valeur+" €":a.effet==="pourcent"?"-"+a.valeur+" %":"cadeau offert"}
function avCondition(a){
  if(a.declencheur==="cumul")return"dès "+(a.seuilCents/100)+" € dépensés au total (une seule fois par client)";
  if(a.declencheur==="achat")return"dès "+(a.seuilCents/100)+" € d'achat";
  return"du "+day(a.dateDebut)+" au "+day(a.dateFin)+(a.seuilCents>0?" dès "+(a.seuilCents/100)+" € d'achat":"")}
function remiseCents(){var brut=panierTotal();return CUSE&&CFID?Math.min(Math.round(CFID.disponibleEuros*100),brut-avRemTotal(brut)):0}
function lirePay(){CPAY={carte:v("pc"),especes:v("pe"),virement:v("pv"),bon_achat:v("pb")}}
function dateLongue(d){try{return new Date(d).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Paris"})}catch(e){return d||""}}
function recuHtml(r){
  var ttc=r.totalCents,ht=Math.round(ttc/1.2),tva=ttc-ht,t=r.ticket||{};
  var es=entSplit(t.entete),ent=es.haut,ri=RDVI||{};
  var h="<div class='recu' data-recu='"+r.id+"'><div class='rc'>"+ent+(r.magasin?"<br>Boutique "+esc(r.magasin):"")+"</div>"+devisCoord(ri)+"<hr>"
    +"<div class='rc'><b>FACTURE</b></div>"
    +"<div class='rc' style='font-size:18px'><b>"+(r.numero?esc(r.numero):"Ticket n° "+r.id)+"</b></div>"
    +"<div class='rl'><span>Date</span><span>"+esc(dateLongue(r.date))+"</span></div>"
    +"<div class='rm'>Vendeur : "+esc(r.vendeur||"")+"</div><hr>"
    +(r.client?"<div class='rm'>Client</div><div><b>"+esc(r.client)+"</b></div>"+(r.contact&&r.contact.tel?"<div>"+esc(r.contact.tel)+"</div>":"")+"<hr>":"");
  r.lignes.forEach(function(l){h+="<div class='rl'><span>"+l.quantite+" × "+esc(l.libelle)+"</span><span>"+eur(l.quantite*l.prixCents)+"</span></div>"});
  h+="<hr><div class='rl'><span>Sous-total</span><span>"+eur(r.brutCents)+"</span></div>";
  r.avantages.forEach(function(a){h+="<div class='rl'><span>"+(a.effet==="cadeau"?"Cadeau : ":"Offre : ")+esc(a.libelle)+"</span><span>"+(a.remiseCents?"-"+eur(a.remiseCents):"offert")+"</span></div>"});
  if(r.fideliteCents)h+="<div class='rl'><span>Fidélité</span><span>-"+eur(r.fideliteCents)+"</span></div>";
  var acd=r.acompteDeduitCents||0;ttc=r.totalCents+acd;ht=Math.round(ttc/1.2);tva=ttc-ht;
  h+="<div class='rl rt'><span>TOTAL TTC</span><span>"+eur(ttc)+"</span></div>"
    +"<div class='rl rm'><span>Total HT</span><span>"+eur(ht)+"</span></div><div class='rl rm'><span>TVA 20 %</span><span>"+eur(tva)+"</span></div><hr>";
  if(acd)h+="<div class='rl'><span>Acompte déjà versé</span><span>-"+eur(acd)+"</span></div><div class='rl'><span>Reste payé aujourd'hui</span><span>"+eur(r.totalCents)+"</span></div>";
  r.paiements.forEach(function(p){h+="<div class='rl'><span>Payé en "+esc((MOY[p.moyen]||p.moyen).toLowerCase())+"</span><span>"+eur(p.cents)+"</span></div>"});
  if(ri.siteQrSvg||ri.avisQrAmiens||ri.avisQrRouen)h+=factureQr(ri);
  else if(t.qrSvg)h+="<hr><div class='rc'><b>Laissez-nous un avis</b><br>et recevez une récompense !</div><div class='qr'>"+t.qrSvg+"</div>";
  return h+entBas(es,"Merci de votre visite !")+"</div>"}
function avisBtns(r){
  var c=r.contact,u=r.ticket&&r.ticket.avisUrl;
  if(!u||!c||(!c.tel&&!c.email))return"";
  var nl=String.fromCharCode(10),msg="Bonjour"+(c.prenom?" "+c.prenom:"")+", merci pour votre visite chez TURN Shop ! Votre avis nous aide beaucoup, et une récompense vous attend : "+u;
  return"<div class='card avbox'><b>Demander un avis au client</b><div class='actions'>"
    +(c.tel?"<a class='btn' href='sms:"+esc(c.tel.replace(/ /g,""))+"?&body="+encodeURIComponent(msg)+"'>Envoyer par SMS</a>":"")
    +(c.email?"<a class='btn' href='mailto:"+esc(c.email)+"?subject="+encodeURIComponent("Votre avis sur TURN Shop")+"&body="+encodeURIComponent(msg+nl+nl+"L'équipe TURN Shop")+"'>Envoyer par email</a>":"")
    +"</div></div>"}
function shopHtml(r){
  var s=r.shopify;if(!s||!s.eligible)return"";
  if(s.nom)return"<div class='muted'>Commande Shopify "+esc(s.nom)+" créée (visible sur le compte du client).</div>";
  return"<div class='muted'>"+(s.erreur?"Pas partie vers Shopify : "+esc(s.erreur):"Pas envoyée à Shopify.")+"</div><div class='actions'><button class='sec' data-act='cShopRetry' data-id='"+r.id+"'>Envoyer vers Shopify</button></div>"}
var VJ=null,VJOPEN=0;
function vjSync(){
  var o=document.getElementById("vj");
  if(!VJ){if(o)o.remove();return}
  if(!o){o=document.createElement("div");o.id="vj";o.style.cssText="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:99999;overflow:auto;padding:20px";o.onclick=function(e){if(e.target===o){VJ=null;VJOPEN=0;vjSync()}};document.body.appendChild(o)}
  o.innerHTML=vjHtml()}
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&VJ){VJ=null;VJOPEN=0;vjSync()}});
function vjHtml(){
  if(!VJ)return"";
  var tot=0;VJ.forEach(function(r){tot+=r.totalCents});
  var h="<div class='card' style='max-width:720px;margin:0 auto;background:#fff'><div class='step'>Ventes du jour · "+VJ.length+" vente(s) · "+eur(tot)+"</div>";
  if(!VJ.length)h+="<div class='muted'>Aucune vente aujourd hui.</div>";
  VJ.forEach(function(r){
    var res=r.lignes.slice(0,3).map(function(l){return esc(l.libelle)}).join(", ")+(r.lignes.length>3?"…":"");
    h+="<button class='sec hrow' data-act='cVjRecu' data-id='"+r.id+"'><b>"+esc(dateLongue(r.date))+"</b> · "+eur(r.totalCents)+" · "+esc(r.client||"sans client")+(r.numero?" · "+esc(r.numero):"")+"<br><span class='muted'>"+res+"</span></button>"+(r.clientId?"<div class='actions'><button class='link' data-act='cVjClient' data-cid='"+r.clientId+"'>👤 Ouvrir le profil de "+esc(r.client||"ce client")+"</button></div>":"");
    if(VJOPEN===r.id)h+=recuHtml(r)+"<div class='actions'><button class='sec' data-act='cPrint' data-id='"+r.id+"'>Imprimer le reçu</button><button class='sec' data-act='cEmail' data-id='"+r.id+"'>✉ Envoyer par email</button></div>"});
  return h+"<div class='actions'><button data-act='cVjFerme'>Fermer</button></div></div>"}
function histoHtml(){
  if(!CHIST)return"";
  var h="<div class='card'><div class='step'>"+(CCLI?"Achats de "+esc(CCLI.name):"Ventes du jour")+"</div>";
  if(!CHIST.length)h+="<div class='muted'>Aucun achat en caisse pour le moment.</div>";
  CHIST.forEach(function(r){
    var res=r.lignes.slice(0,2).map(function(l){return esc(l.libelle)}).join(", ")+(r.lignes.length>2?"…":"");
    h+="<button class='sec hrow' data-act='cRecu' data-id='"+r.id+"'><b>"+esc(dateLongue(r.date))+"</b> · "+eur(r.totalCents)+(CCLI?"":" · "+esc(r.client||"sans client"))+"<br><span class='muted'>"+res+"</span></button>";
    if(CHOPEN===r.id)h+=recuHtml(r)+shopHtml(r)+"<div class='actions'><button class='sec' data-act='cPrint' data-id='"+r.id+"'>Imprimer le reçu</button><button class='sec' data-act='cEmail' data-id='"+r.id+"'>✉ Envoyer par email</button></div>"});
  return h+"</div>"}
function caisseHtml(){
  if(CAV===null&&!CAVBUSY){CAVBUSY=true;api("/caisse/avantages").then(function(d){CAV=d;CAVBUSY=false;render()}).catch(function(){CAV=[];CAVBUSY=false})}
  prestaLoad();
  if(!CLO.d&&!CLOBUSY){CLOBUSY=true;api("/caisse/session").then(function(d){CLO.d=d;CLOBUSY=false;render()}).catch(function(){CLOBUSY=false})}
  if(!CLO.d)return"<div class='caisse'><h3>Caisse</h3><div class='muted'>Chargement...</div></div>";
  if(caisseBloquee()){
    var hb="<div class='caisse'><h3>Caisse <button class='sec' data-act='cVjOuvre' style='float:right'>📋 Ventes du jour</button></h3>";
    if(CREC)hb+="<div class='card'><b>Vente enregistrée</b>"+recuHtml(CREC)+"<div class='actions'><button data-act='cPrint' data-id='"+CREC.id+"'>Imprimer le reçu</button><button class='sec' data-act='cFermeRecu'>Fermer</button></div></div>";
    hb+="<div class='card' style='text-align:center'><div style='font-size:28px;font-weight:700;color:#b00'>🔒 CAISSE FERMÉE</div><div class='muted'>"+(CLO.d.ouverte?"Ferme la caisse de la veille pour continuer.":"Ouvre la caisse pour accéder aux ventes.")+"</div></div>";
    return hb+histoHtml()+cloHtml()+"</div>"}
  var brut=panierTotal(),av=avRemTotal(brut),rem=remiseCents(),aco=acoDeduit(brut-av-rem),net=brut-av-rem-aco;
  var h="<div class='caisse'><h3>Caisse <button class='sec' data-act='cVjOuvre' style='float:right'>📋 Ventes du jour</button></h3>";
  if(CREC)h+="<div class='card'><b>Vente enregistrée</b>"+recuHtml(CREC)+shopHtml(CREC)+avisBtns(CREC)+"<div class='actions'><button data-act='cPrint' data-id='"+CREC.id+"'>Imprimer le reçu</button><button class='sec' data-act='cEmail' data-id='"+CREC.id+"'>✉ Envoyer par email</button><button class='sec' data-act='cFermeRecu'>Fermer</button></div></div>";
  if(CREP)h+="<div class='card avbox'><b>Facturation de la réparation n°"+CREP+"</b><div class='muted'>Les lignes du devis sont dans le panier. À l'encaissement, la commande est créée dans Shopify.</div><button class='link' data-act='cAnnuleRep'>Annuler la facturation</button></div>";
  h+="<div class='card'><div class='step'>Client (scan carte, email ou téléphone)</div><div class='search'><input id='cq' placeholder='Scan carte, email ou téléphone'><button data-act='cScan'>Chercher</button></div>";
  if(CCLI)h+="<div style='margin-top:8px'><b>"+esc(CCLI.name)+"</b> <span class='muted'>"+esc(CCLI.phone||"")+"</span> <button class='link' data-act='cClient0'>Retirer</button></div>";
  else h+="<div class='muted' style='margin-top:6px'>Vente sans client. <button class='link' data-act='cJour'>Voir les ventes du jour</button></div>";
  if(CCLI&&CFID){
    var gagne=Math.floor(net/100/CFID.regle.eurosPourPalier);
    h+="<div class='fidbox'><b>Fidélité</b><div>Déjà dépensé en caisse : "+(CFID.depenseEuros).toFixed(2).replace(".",",")+" € · prochain palier dans "+CFID.prochainPalierIn.toFixed(2).replace(".",",")+" €</div>"
      +"<div>Cet achat rapporte "+gagne+" palier(s) ("+CFID.regle.remiseEuros+" € offerts tous les "+CFID.regle.eurosPourPalier+" €).</div>";
    if(CFID.disponibleEuros>0)h+="<div><b>"+CFID.disponibleEuros.toFixed(2).replace(".",",")+" € de bon d'achat disponible.</b> On l'utilise ?</div><div class='actions'><button class='"+(CUSE?"":"sec")+"' data-act='cUse' data-v='1'>Oui, utiliser</button><button class='"+(CUSE?"sec":"")+"' data-act='cUse' data-v='0'>Non</button></div>";
    else h+="<div class='muted'>Aucun bon d'achat disponible pour l'instant.</div>";
    h+="</div>"}
  h+="</div>";
  h+="<div class='card'><div class='step'>Panier</div>";
  if(!PAN.length)h+="<div class='muted'>Panier vide. Ajoute un article ci-dessous.</div>";
  else h+="<table class='panier' style='width:100%;border-collapse:collapse'><tr><th style='text-align:left'>Article</th><th>Qté</th><th>Prix €</th><th></th></tr>"+PAN.map(function(l,i){return"<tr><td>"+esc(l.libelle)+((l.barcode||l.sku)?"<div class='muted' style='font-size:12px'>"+(l.barcode?"EAN "+esc(l.barcode):"")+(l.barcode&&l.sku?" · ":"")+(l.sku?"sku "+esc(l.sku):"")+"</div>":"")+(l.emplacement?"<div style='font-size:13px'><b>📍 "+esc(l.emplacement)+"</b></div>":"")+"</td><td><input type='number' min='1' value='"+l.quantite+"' data-act='cQte' data-i='"+i+"'></td><td><input value='"+esc(l.prix)+"' data-act='cPrix' data-i='"+i+"'></td><td><button class='link' data-act='cDel' data-i='"+i+"'>Retirer</button></td></tr>"}).join("")+"</table>";
  h+="<div style='margin-top:8px'>"+prodBox("caisse")+"</div>";
  h+="<div class='dl' style='margin-top:8px'><input id='cl' class='lb' placeholder='Article (libellé)'><input id='cq2' class='q' type='number' min='1' value='1'><input id='cp' class='p' placeholder='Prix €'><button data-act='cAdd'>Ajouter</button></div></div>";
  var dispo=(CAV||[]).filter(function(a){return avApplicable(a,brut)});
  if(dispo.length){
    h+="<div class='card avbox'><div class='step'>Offres et cadeaux disponibles</div>";
    dispo.forEach(function(a){var on=CAVOFF.indexOf(a.id)<0;
      h+="<label class='avl'><input type='checkbox' data-act='cAv' data-id='"+a.id+"'"+(on?" checked":"")+"> <b>"+esc(a.libelle)+"</b> <span class='tag'>"+esc(avLabel(a))+"</span><div class='muted'>"+esc(avCondition(a))+"</div></label>"});
    h+="</div>"}
  h+="<div class='card'><div class='step'>Paiement</div><div>Sous-total : "+eur(brut)+"</div>";
  avChoisis(brut).forEach(function(a){h+="<div>"+(a.effet==="cadeau"?"Cadeau à remettre : ":"Offre : ")+esc(a.libelle)+(a.effet==="cadeau"?"":" : -"+eur(Math.min(avRemise(a,brut),brut)))+"</div>"});
  if(multiRem(brut))h+="<div>Remise plusieurs prestations : -"+eur(multiRem(brut))+"</div>";
  if(rem)h+="<div>Remise fidélité : -"+eur(rem)+"</div>";
  if(aco)h+="<div>Acompte déjà versé : -"+eur(aco)+"</div>";
  h+="<div class='big'>À payer : "+eur(net)+"</div>"
    +"<div class='pay'><span>Carte</span><input id='pc' placeholder='0,00' value='"+esc(CPAY.carte)+"'></div><div class='pay'><span>Espèces</span><input id='pe' placeholder='0,00' value='"+esc(CPAY.especes)+"'></div><div class='pay'><span>Virement</span><input id='pv' placeholder='0,00' value='"+esc(CPAY.virement)+"'></div>"+((CCLI&&CFID&&CFID.disponibleEuros>0)?"<div class='pay'><span>Cagnotte</span><button class='"+(CUSE?"":"sec")+"' data-act='cUse' data-v='"+(CUSE?0:1)+"'>"+(CUSE?"✓ "+eur(remiseCents())+" utilisés (annuler)":"Utiliser les "+CFID.disponibleEuros.toFixed(2).replace(".",",")+" € de la cagnotte")+"</button></div>":"")
    +"<div class='actions'><button class='sec' data-act='cTout' data-m='carte'>Tout en carte</button><button class='sec' data-act='cTout' data-m='especes'>Tout en espèces</button><button class='sec' data-act='cTout' data-m='virement'>Tout en virement</button></div>"
    +"<button data-act='cEncaisser' style='width:100%;margin-top:10px;padding:14px;font-size:17px'>Encaisser</button><div class='muted'>"+esc(CMSG)+"</div>"
    +"<div class='muted' style='margin-top:10px'>Le client ne se décide pas maintenant ?</div><div class='actions'><button class='sec' data-act='cEnDevis'>Mettre en devis</button><button class='sec' data-act='cEnPec'>Faire réparer en boutique</button></div></div>";
  h+=histoHtml()+cloHtml()+"</div>";
  return h}
async function ajouterProduit(p,ctx){
  if(ctx==="etq"){ETQ.push({titre:p.libelle,prix:String(p.prix),barcode:p.barcode||"",sku:p.sku||"",qte:1});render();return}
  if(ctx.indexOf("mait")===0){await maitLier(ctx,p);return}
  if(ctx==="dvs"){await dvAjoutProduit(p);return}
  if(ctx==="devis"){if(!FICHE)return;DEVHINT="";var rd=await api("/devis/ligne",{repairId:FICHE.id,type:"piece",libelle:p.libelle,quantite:1,prix:String(p.prix).replace(".",","),variantId:p.variantId,sku:p.sku,barcode:p.barcode,marque:p.marque});if(rd.maitre)DEVHINT="Produit maître mis sur le devis : "+rd.maitre.nom+" (produit choisi : "+rd.maitre.origine+")";await recharger(FICHE.id);return}
  if(ctx.indexOf("cmd")===0){var d=await api("/achats/ligne",{fournisseurId:+ctx.slice(3),libelle:p.libelle,sku:p.sku,barcode:p.barcode,variantId:p.variantId,quantite:1});CMDMSG=d.message;CMD=null;render();return}
  lirePay();CUR=null;FICHE=null;TAB="accueil";CREC=null;
  var ex=PAN.filter(function(l){return l.variantId&&l.variantId===p.variantId})[0];
  if(ex)ex.quantite++;else PAN.push({libelle:p.libelle,quantite:1,prix:String(p.prix).replace(".",","),type:"piece",variantId:p.variantId,sku:p.sku,barcode:p.barcode||"",emplacement:p.emplacement||""});
  CMSG="Ajouté : "+p.libelle+(p.stock==null?"":" (stock "+p.stock+")")+(p.emplacement?" · 📍 CASE "+p.emplacement:" · pas de case, clique sur 📍 Case");render()}
async function cCaseFn(b){var l=PAN[+b.dataset.i];if(!l||!l.variantId)return;
  var c=prompt("Case de rangement pour : "+l.libelle+" (ex : A1, B12 — vide pour effacer)",l.emplacement||"");if(c===null)return;
  try{var d=await api("/emplacement",{variantId:l.variantId,barcode:l.barcode||"",sku:l.sku||"",emplacement:c});PAN.forEach(function(x){if(x.variantId===l.variantId)x.emplacement=d.emplacement});lirePay();render()}catch(e){alert(e.message)}};
async function scanCode(q,ctx,silent){
  var el=document.activeElement,id=el&&el.id,ps=el&&el.dataset&&el.dataset.ps;
  var ok=await scanCode0(q,ctx,silent);
  if(ok===true)bipOk();else if(ok===false){bipKo();if(silent)toastKo("Code inconnu : "+(q||"").trim()+" (pas trouvé dans Shopify)")}
  if(ok!==undefined)refocus(id,ps,ok)}
function refocus(id,ps,ok){setTimeout(function(){var e=id?document.getElementById(id):(ps?document.querySelector("[data-ps='"+ps+"']"):null);if(!e)return;if(ps||id==="cq")e.value="";e.focus()},60)}
async function scanCode0(q,ctx,silent){
  q=(q||"").trim();if(!q)return;
  var mpc=q.match(/^pc[^0-9a-z]*0*([0-9]+)$/i);if(mpc){ouvrirFiche(Number(mpc[1]));return true}
  try{
    var r=await api("/code?q="+encodeURIComponent(q));
    if(r.produit){await ajouterProduit(r.produit,ctx);return true}
    if(ctx==="etq"){var lc=await api("/stock/scan",{magasin:MAG||"",code:q,local:true});if(lc.produit){ETQ.push({empl:lc.produit.emplacement||"",titre:lc.produit.nom,prix:(lc.produit.prixCents/100).toFixed(2),barcode:lc.produit.code,sku:"",qte:Math.max(1,lc.produit.qte)});render();return true}}
    if(ctx!=="caisse"){if(!silent)alert("Code inconnu : "+q);return false}
    var cid=r.clientId;
    if(!cid){var s=await api("/caisse/scan?q="+encodeURIComponent(q));cid=s.clientId}
    if(!cid){if(silent)return false;CMSG=(r.erreurProduit?"Catalogue indisponible. ":"")+"Code inconnu : "+q+" (ni produit, ni client).";lirePay();render();return false}
    var d=await api("/caisse/client?id="+cid);
    CUR=null;FICHE=null;TAB="accueil";CCLI=d.client;CFID=d.fidelite;CUSE=false;CMSG="";CAVOFF=[];CHOPEN=0;lirePay();await chargeHisto()
  return true
  }catch(e){if(!silent)alert(e.message);return false}}
var SCBUF="",SCLAST=0;
document.addEventListener("keydown",function(e){
  var t=e.target,tag=t&&t.tagName?t.tagName:"";
  if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT")return;
  var sctx=document.getElementById("cq")?"caisse":(FICHE&&TAB==="enc"?"devis":"");if(REC&&TAB==="cmd")sctx="recep";
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(!sctx)sctx="pc";
  var now=Date.now();
  if(now-SCLAST>80)SCBUF="";
  SCLAST=now;
  if(e.key==="Enter"){if(SCBUF.length>=4){var code=SCBUF;SCBUF="";if(sctx==="pc"){if(/^pc[^0-9a-z]*0*[0-9]+$/i.test(code))ouvrirFiche(Number(code.replace(/[^0-9]/g,"")))}else if(sctx==="recep")recepScan(code);else scanCode(code,sctx)}return}
  if(e.key.length===1)SCBUF+=e.key});
function caisseBind(){var q=document.getElementById("cq");if(q)q.addEventListener("keydown",function(e){if(e.key==="Enter")ACTS.cScan()})}
function chargeHisto(){
  var url="/caisse/historique"+(CCLI?"?clientId="+CCLI.id:"");
  return rdvInfos().then(function(){return api(url)}).then(function(d){CHIST=d.ventes;render()}).catch(function(e){CMSG=e.message;render()})}
document.addEventListener("change",function(e){var t=e.target;if(!t||!t.dataset||t.dataset.act!=="cAv")return;var id=+t.dataset.id,i=CAVOFF.indexOf(id);if(t.checked&&i>=0)CAVOFF.splice(i,1);if(!t.checked&&i<0)CAVOFF.push(id);lirePay();render()});
`;
