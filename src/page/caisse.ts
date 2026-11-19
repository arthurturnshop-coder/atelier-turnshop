export const CAISSE = `// ---------- Caisse (colonne de droite du Dashboard) ----------
var PAN=[],CCLI=null,CFID=null,CUSE=false,CPAY={carte:"",especes:"",virement:""},CREP=null,CMSG="";
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
var MOY={carte:"Carte",especes:"Espèces",virement:"Virement",en_ligne:"En ligne"};
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
function lirePay(){CPAY={carte:v("pc"),especes:v("pe"),virement:v("pv")}}
function dateLongue(d){try{return new Date(d).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Paris"})}catch(e){return d||""}}
function recuHtml(r){
  var ttc=r.totalCents,ht=Math.round(ttc/1.2),tva=ttc-ht,t=r.ticket||{},nl=String.fromCharCode(10);
  var ent=(t.entete||"TURN SOCIETY").split(nl).map(function(x,i){return i===0?"<b>"+esc(x)+"</b>":esc(x)}).join("<br>");
  var h="<div class='recu' data-recu='"+r.id+"'><div class='rc'>"+ent+(r.magasin?"<br>Boutique "+esc(r.magasin):"")+"</div><hr>"
    +"<div class='rl'><span>"+(r.shopify&&r.shopify.nom?"Facture "+esc(r.shopify.nom):"Ticket n° "+r.id)+"</span><span>"+esc(dateLongue(r.date))+"</span></div>"
    +"<div class='rm'>Vendeur : "+esc(r.vendeur||"")+(r.client?" · Client : "+esc(r.client):"")+"</div><hr>";
  r.lignes.forEach(function(l){h+="<div class='rl'><span>"+l.quantite+" × "+esc(l.libelle)+"</span><span>"+eur(l.quantite*l.prixCents)+"</span></div>"});
  h+="<hr><div class='rl'><span>Sous-total</span><span>"+eur(r.brutCents)+"</span></div>";
  r.avantages.forEach(function(a){h+="<div class='rl'><span>"+(a.effet==="cadeau"?"Cadeau : ":"Offre : ")+esc(a.libelle)+"</span><span>"+(a.remiseCents?"-"+eur(a.remiseCents):"offert")+"</span></div>"});
  if(r.fideliteCents)h+="<div class='rl'><span>Fidélité</span><span>-"+eur(r.fideliteCents)+"</span></div>";
  var acd=r.acompteDeduitCents||0;ttc=r.totalCents+acd;ht=Math.round(ttc/1.2);tva=ttc-ht;
  h+="<div class='rl rt'><span>TOTAL TTC</span><span>"+eur(ttc)+"</span></div>"
    +"<div class='rl rm'><span>Total HT</span><span>"+eur(ht)+"</span></div><div class='rl rm'><span>TVA 20 %</span><span>"+eur(tva)+"</span></div><hr>";
  if(acd)h+="<div class='rl'><span>Acompte déjà versé</span><span>-"+eur(acd)+"</span></div><div class='rl'><span>Reste payé aujourd'hui</span><span>"+eur(r.totalCents)+"</span></div>";
  r.paiements.forEach(function(p){h+="<div class='rl'><span>Payé en "+esc((MOY[p.moyen]||p.moyen).toLowerCase())+"</span><span>"+eur(p.cents)+"</span></div>"});
  if(t.qrSvg)h+="<hr><div class='rc'><b>Laissez-nous un avis</b><br>et recevez une récompense !</div><div class='qr'>"+t.qrSvg+"</div>";
  return h+"<div class='rc rm'>Merci de votre visite !</div></div>"}
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
function histoHtml(){
  if(!CHIST)return"";
  var h="<div class='card'><div class='step'>"+(CCLI?"Achats de "+esc(CCLI.name):"Ventes du jour")+"</div>";
  if(!CHIST.length)h+="<div class='muted'>Aucun achat en caisse pour le moment.</div>";
  CHIST.forEach(function(r){
    var res=r.lignes.slice(0,2).map(function(l){return esc(l.libelle)}).join(", ")+(r.lignes.length>2?"…":"");
    h+="<button class='sec hrow' data-act='cRecu' data-id='"+r.id+"'><b>"+esc(dateLongue(r.date))+"</b> · "+eur(r.totalCents)+(CCLI?"":" · "+esc(r.client||"sans client"))+"<br><span class='muted'>"+res+"</span></button>";
    if(CHOPEN===r.id)h+=recuHtml(r)+shopHtml(r)+"<div class='actions'><button class='sec' data-act='cPrint' data-id='"+r.id+"'>Imprimer le reçu</button></div>"});
  return h+"</div>"}
function caisseHtml(){
  if(CAV===null&&!CAVBUSY){CAVBUSY=true;api("/caisse/avantages").then(function(d){CAV=d;CAVBUSY=false;render()}).catch(function(){CAV=[];CAVBUSY=false})}
  prestaLoad();
  var brut=panierTotal(),av=avRemTotal(brut),rem=remiseCents(),aco=acoDeduit(brut-av-rem),net=brut-av-rem-aco;
  var h="<div class='caisse'><h3>Caisse</h3>";
  if(CREC)h+="<div class='card'><b>Vente enregistrée</b>"+recuHtml(CREC)+shopHtml(CREC)+avisBtns(CREC)+"<div class='actions'><button data-act='cPrint' data-id='"+CREC.id+"'>Imprimer le reçu</button><button class='sec' data-act='cFermeRecu'>Fermer</button></div></div>";
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
  else h+="<table class='panier' style='width:100%;border-collapse:collapse'><tr><th style='text-align:left'>Article</th><th>Qté</th><th>Prix €</th><th></th></tr>"+PAN.map(function(l,i){return"<tr><td>"+esc(l.libelle)+"</td><td><input type='number' min='1' value='"+l.quantite+"' data-act='cQte' data-i='"+i+"'></td><td><input value='"+esc(l.prix)+"' data-act='cPrix' data-i='"+i+"'></td><td><button class='link' data-act='cDel' data-i='"+i+"'>Retirer</button></td></tr>"}).join("")+"</table>";
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
    +"<div class='pay'><span>Carte</span><input id='pc' placeholder='0,00' value='"+esc(CPAY.carte)+"'></div><div class='pay'><span>Espèces</span><input id='pe' placeholder='0,00' value='"+esc(CPAY.especes)+"'></div><div class='pay'><span>Virement</span><input id='pv' placeholder='0,00' value='"+esc(CPAY.virement)+"'></div>"
    +"<div class='actions'><button class='sec' data-act='cTout' data-m='carte'>Tout en carte</button><button class='sec' data-act='cTout' data-m='especes'>Tout en espèces</button><button class='sec' data-act='cTout' data-m='virement'>Tout en virement</button></div>"
    +"<button data-act='cEncaisser'>Encaisser</button><div class='muted'>"+esc(CMSG)+"</div></div>";
  h+=histoHtml()+"</div>";
  return h}
async function ajouterProduit(p,ctx){
  if(ctx==="devis"){if(!FICHE)return;DEVHINT="";await api("/devis/ligne",{repairId:FICHE.id,type:"piece",libelle:p.libelle,quantite:1,prix:String(p.prix).replace(".",","),variantId:p.variantId,sku:p.sku,barcode:p.barcode,marque:p.marque});await recharger(FICHE.id);return}
  if(ctx.indexOf("cmd")===0){var d=await api("/achats/ligne",{fournisseurId:+ctx.slice(3),libelle:p.libelle,sku:p.sku,barcode:p.barcode,variantId:p.variantId,quantite:1});CMDMSG=d.message;CMD=null;render();return}
  lirePay();CUR=null;FICHE=null;TAB="accueil";CREC=null;
  var ex=PAN.filter(function(l){return l.variantId&&l.variantId===p.variantId})[0];
  if(ex)ex.quantite++;else PAN.push({libelle:p.libelle,quantite:1,prix:String(p.prix).replace(".",","),type:"piece",variantId:p.variantId,sku:p.sku});
  CMSG="Ajouté : "+p.libelle+(p.stock==null?"":" (stock "+p.stock+")");render()}
async function scanCode(q,ctx,silent){
  q=(q||"").trim();if(!q)return;
  var mpc=q.match(/^pc[^0-9a-z]*0*([0-9]+)$/i);if(mpc){ouvrirFiche(Number(mpc[1]));return}
  try{
    var r=await api("/code?q="+encodeURIComponent(q));
    if(r.produit){await ajouterProduit(r.produit,ctx);return}
    if(ctx!=="caisse"){if(!silent)alert("Code inconnu : "+q);return}
    var cid=r.clientId;
    if(!cid){var s=await api("/caisse/scan?q="+encodeURIComponent(q));cid=s.clientId}
    if(!cid){if(silent)return;CMSG=(r.erreurProduit?"Catalogue indisponible. ":"")+"Code inconnu : "+q+" (ni produit, ni client).";lirePay();render();return}
    var d=await api("/caisse/client?id="+cid);
    CUR=null;FICHE=null;TAB="accueil";CCLI=d.client;CFID=d.fidelite;CUSE=false;CMSG="";CAVOFF=[];CHOPEN=0;lirePay();await chargeHisto()
  }catch(e){if(!silent)alert(e.message)}}
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
  return api(url).then(function(d){CHIST=d.ventes;render()}).catch(function(e){CMSG=e.message;render()})}
document.addEventListener("change",function(e){var t=e.target;if(!t||!t.dataset||t.dataset.act!=="cAv")return;var id=+t.dataset.id,i=CAVOFF.indexOf(id);if(t.checked&&i>=0)CAVOFF.splice(i,1);if(!t.checked&&i<0)CAVOFF.push(id);lirePay();render()});
`;
