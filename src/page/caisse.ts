export const CAISSE = `// ---------- Caisse (colonne de droite du Dashboard) ----------
var CMODE="paiement";
function modeBar(){return"<div class='modebar'><button class='"+(CMODE==="acompte"?"on":"")+"' data-act='cMode' data-m='acompte'>1 · Acompte</button><button class='"+(CMODE==="paiement"?"on":"")+"' data-act='cMode' data-m='paiement'>2 · Paiement (facture)</button></div>"}
var PAN=[],CCLI=null,CFID=null,CUSE=false,CPAY={carte:"",especes:"",virement:"",bon_achat:""},CREP=null,CMSG="",CAFF=[],CRAFF=[];
function affBanner(a){return a&&a.length?"<div class='card avbox' style='border:2px solid #b00'><b>🎒 À rendre au client : "+esc(a.join(", "))+"</b></div>":""}
var CVEH=false;
var CAV=null,CAVBUSY=false,CAVOFF=[],CREC=null,CHIST=null,CHOPEN=0;
var PRESTA=null,PRESBUSY=false,DEVHINT="",CACO=0,DEVOPT=0;
function acoDeduit(reste){return CREP&&CACO>0?Math.max(0,Math.min(CACO,reste)):0}
var CLIV={adresse:"",cp:"",ville:""};
function livIdx(){for(var i=0;i<PAN.length;i++)if(/^Livraison à domicile/i.test(PAN[i].libelle))return i;return -1}
function livHtml(){
  if(livIdx()<0)return"<div style='margin-top:8px'><button class='sec' data-act='cLivOn'>🚚 Livraison à domicile : 4,95 €</button></div>";
  return"<div class='card avbox' style='margin-top:8px'><b>🚚 Livraison à domicile (4,95 €)</b><div class='dl'><input id='cliv-a' class='lb' placeholder='Adresse' value='"+esc(CLIV.adresse)+"'></div><div class='dl'><input id='cliv-c' placeholder='Code postal' value='"+esc(CLIV.cp)+"' style='max-width:140px'><input id='cliv-v' class='lb' placeholder='Ville' value='"+esc(CLIV.ville)+"'></div><button class='link' data-act='cLivOff'>Retirer la livraison</button></div>"}
function livBody(){return livIdx()<0?null:{adresse:CLIV.adresse,cp:CLIV.cp,ville:CLIV.ville}}
document.addEventListener("input",function(e){var i=e.target&&e.target.id;if(i==="cliv-a")CLIV.adresse=e.target.value;else if(i==="cliv-c")CLIV.cp=e.target.value;else if(i==="cliv-v")CLIV.ville=e.target.value});
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
var CNET=0;
function renduTxt(){var t=0;["pc","pe","pv","pb"].forEach(function(i){var e=document.getElementById(i);t+=pxCents(e?e.value:"")||0});var x=t-CNET;return x>0&&CPAY&&(document.getElementById("pe")?pxCents(document.getElementById("pe").value)>=x:true)?"💶 À rendre au client : "+eur(x):""}
document.addEventListener("input",function(e){if(e.target&&/^p[cevb]$/.test(e.target.id)){var r=document.getElementById("pay-rendu");if(r)r.textContent=renduTxt()}});
function lirePay(){CPAY={carte:v("pc"),especes:v("pe"),virement:v("pv"),bon_achat:v("pb")}}
function dateLongue(d){try{return new Date(d).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Paris"})}catch(e){return d||""}}
function serieHtml(l,i){
  if(l.trott){var q=Math.max(1,l.quantite|0),h="<div style='margin-top:6px'><b>🛴 N° de série (obligatoire)</b>";
    for(var k=0;k<q;k++)h+="<input data-act='cSerie' data-i='"+i+"' data-k='"+k+"' value='"+esc((l.series||[])[k]||"")+"' placeholder='N° de série"+(q>1?" "+(k+1):"")+"' style='display:block;margin-top:4px;width:100%;max-width:260px'>";
    return h+"</div>"}
  return""}
function serieOk(l){if(!l.trott)return true;var q=Math.max(1,l.quantite|0);for(var k=0;k<q;k++){if(String((l.series||[])[k]||"").trim().length<3)return false}return true}
function savHisto(r){
  var ev=[];
  (r.sav||[]).forEach(function(d){
    var m=d.motif?" ("+esc(d.motif)+")":"";
    if(d.type==="remboursement")ev.push([d.le,"↩ Remboursement "+eur(d.montantCents)+" en "+esc(({carte:"carte",especes:"espèces",virement:"virement",bon:"bon d'achat"})[d.issue]||d.issue)+m,d.par]);
    else if(d.type==="echange")ev.push([d.le,"🔁 Échange : "+esc(d.libelle)+" → bon d'achat "+eur(d.montantCents)+m,d.par]);
    else{ev.push([d.le,"🛠 Garantie ouverte : "+esc(d.libelle)+m,d.par]);
      if(d.demandeLe)ev.push([d.demandeLe,"🛠 Garantie : demande faite au fournisseur ("+esc(d.libelle)+")",""]);
      if(d.statut==="termine")ev.push([d.closeLe,"🛠 Garantie terminée ("+esc(d.libelle)+") : "+(d.issue==="piece_recue"?"pièce reçue":d.issue==="rembourse_fournisseur"?"remboursée par le fournisseur":d.issue==="refus"?"refusée":"clôturée"),d.closePar])}});
  if(!ev.length)return"<div class='card' style='margin:0'><b>Historique</b><div class='muted'>Aucun mouvement sur cette vente.</div></div>";
  ev.sort(function(a,b){return new Date(a[0])-new Date(b[0])});
  return"<div class='card' style='margin:0'><b>Historique</b>"+ev.map(function(e){return"<div style='font-size:14px;margin-top:8px;border-top:1px solid #e3e3e3;padding-top:6px'><span class='muted'>"+esc(dateLongue(e[0]))+(e[2]?" · "+esc(e[2]):"")+"</span><br>"+e[1]+"</div>"}).join("")+"</div>"}
function recuHtml(r){
  var ttc=r.totalCents,ht=Math.round(ttc/1.2),tva=ttc-ht,t=r.ticket||{};
  var es=entSplit(t.entete),ent=es.haut,ri=RDVI||{};
  var h="<div class='recu' data-recu='"+r.id+"'><div class='rc'>"+ent+(r.magasin?"<br>Boutique "+esc(r.magasin):"")+"</div>"+devisCoord(ri)+"<hr>"
    +"<div class='rc'><b>FACTURE</b></div>"
    +"<div class='rc' style='font-size:18px'><b>"+(r.numero?esc(r.numero):"Ticket n° "+r.id)+"</b></div>"
    +"<div class='rl'><span>Date</span><span>"+esc(dateLongue(r.date))+"</span></div>"
    +"<div class='rm'>Vendeur : "+esc(r.vendeur||"")+"</div><hr>"
    +(r.client?"<div class='rm'>Client</div><div><b>"+esc(r.client)+"</b></div>"+(r.contact&&r.contact.tel?"<div>"+esc(r.contact.tel)+"</div>":"")+"<hr>":"");
  r.lignes.forEach(function(l){h+="<div class='rl'><span>"+l.quantite+" × "+esc(l.libelle)+"</span><span>"+eur(l.quantite*l.prixCents)+"</span></div>"+((l.series||[]).length?"<div style='font-size:12px'>N° de série : "+l.series.map(esc).join(", ")+"</div>":"")});
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
    +(c.email?"<button data-act='cAvisMail' data-id='"+r.id+"'>Envoyer l avis par email</button>":"")
    +"</div></div>"}
function shopHtml(r){
  var s=r.shopify;if(!s||!s.eligible)return"";
  if(s.nom)return"<div class='muted'>Commande Shopify "+esc(s.nom)+" créée (visible sur le compte du client).</div>";
  return"<div class='muted'>"+(s.erreur?"Pas partie vers Shopify : "+esc(s.erreur):"Pas envoyée à Shopify.")+"</div><div class='actions'><button class='sec' data-act='cShopRetry' data-id='"+r.id+"'>Envoyer vers Shopify</button></div>"}
var VJ=null,VJOPEN=0,SAVF=null;
function recuBloc(r){
  var bt="style='margin:0;width:100%;white-space:nowrap'";
  return"<div style='display:flex;gap:16px;justify-content:center;align-items:flex-start;flex-wrap:wrap'><div style='flex:0 1 340px;min-width:240px'>"+savHisto(r)+"</div>"+recuHtml(r)
    +"<div style='display:flex;flex-direction:column;gap:8px;min-width:210px;flex:0 1 380px'><button class='sec' "+bt+" data-act='cPrint' data-id='"+r.id+"'>Imprimer le reçu</button><button class='sec' "+bt+" data-act='cEmail' data-id='"+r.id+"'>✉ Envoyer par email</button>"
    +(estResp()?"<button class='sec' "+bt+" data-act='svOpen' data-m='remb' data-id='"+r.id+"'>↩ Rembourser</button>":"")
    +"<button class='sec' "+bt+" data-act='svOpen' data-m='ech' data-id='"+r.id+"'>🔁 Échanger / bon d achat</button><button class='sec' "+bt+" data-act='svOpen' data-m='gar' data-id='"+r.id+"'>🛠 Garantie pièce</button>"+savForm(r)+"</div></div>"}
function savTags(r){
  var a=r.sav||[];if(!a.length)return"";
  var remb=0,ech=0,gar=[];a.forEach(function(d){if(d.type==="remboursement")remb+=d.montantCents;else if(d.type==="echange")ech+=d.montantCents;else gar.push(d)});
  var t=[];
  if(remb)t.push(remb>=r.totalCents?"↩ Remboursé":"↩ Partiellement remboursé ("+eur(remb)+")");
  if(ech)t.push("🔁 Échangé / bon d'achat ("+eur(ech)+")");
  gar.forEach(function(d){t.push("🛠 Garantie : "+esc(d.libelle)+" · "+(d.statut==="a_traiter"?"à traiter":d.statut==="demande_faite"?"demande faite au fournisseur":d.issue==="piece_recue"?"pièce reçue":d.issue==="rembourse_fournisseur"?"remboursée par le fournisseur":d.issue==="refus"?"refusée":"terminée"))});
  return t.map(function(x){return"<span class='tag' style='margin-left:6px'>"+x+"</span>"}).join("")}
function savForm(r){
  var f=SAVF;if(!f||f.vid!==r.id)return"";
  var opts=r.lignes.map(function(l,i){return"<option value='"+i+"'>"+esc(l.quantite+" x "+l.libelle)+" : "+eur(l.prixCents*l.quantite)+"</option>"}).join("");
  var h="<div class='card avbox'>";
  if(f.mode==="remb")h+="<b>Rembourser cette vente</b><div class='dl'><label class='muted'>Montant (€)</label><input id='sv-m' value='"+(r.totalCents/100).toFixed(2).split(".").join(",")+"'></div><div class='dl'><label class='muted'>Remboursé en</label><select id='sv-moy'><option value='carte'>Carte</option><option value='especes'>Espèces</option><option value='virement'>Virement</option><option value='bon'>Bon d achat (cagnotte)</option></select></div><div class='dl'><input id='sv-mot' placeholder='Motif (facultatif)'></div>";
  else if(f.mode==="ech")h+="<b>Échanger un article</b><div class='muted'>Un bon d achat du montant de l article est créé sur la cagnotte du client : il choisit son nouvel article et l utilise à l encaissement.</div><div class='dl'><label class='muted'>Article rendu</label><select id='sv-l'>"+opts+"</select></div><div class='dl'><input id='sv-mot' placeholder='Motif (facultatif)'></div>";
  else h+="<b>Garantie d une pièce</b><div class='muted'>Le dossier apparaît dans Garanties en cours sur le dashboard, avec relance toutes les semaines jusqu à ce que la pièce soit reçue ou remboursée.</div><div class='dl'><label class='muted'>Article défectueux</label><select id='sv-l'>"+opts+"</select></div><div class='dl'><input id='sv-mot' placeholder='Problème constaté'></div><div class='dl'><input id='sv-f' placeholder='Fournisseur (facultatif)'></div>";
  return h+"<div class='actions'><button data-act='svOk' data-id='"+r.id+"'>Valider</button><button class='sec' data-act='svNo'>Annuler</button></div></div>"}
function vjSync(){
  var o=document.getElementById("vj");
  if(!VJ){if(o)o.remove();if(PACHOPEN&&CUR)render();return}
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
    h+="<div style='display:flex;gap:8px;align-items:stretch;margin-top:6px'><button class='sec hrow' style='flex:1;margin:0' data-act='cVjRecu' data-id='"+r.id+"'><b>"+esc(dateLongue(r.date))+"</b> · "+eur(r.totalCents)+" · "+esc(r.client||"sans client")+(r.numero?" · "+esc(r.numero):"")+savTags(r)+"<br><span class='muted'>"+res+"</span></button>"+(r.clientId?"<button class='sec' style='margin:0;font-size:22px;padding:0 16px' title='Ouvrir le profil de "+esc(r.client||"ce client")+"' data-act='cVjClient' data-cid='"+r.clientId+"'>👤</button>":"")+"</div>";
    if(VJOPEN===r.id)h+=recuBloc(r)});
  return h+"<div class='actions'><button data-act='cVjFerme'>Fermer</button></div></div>"}
function histoHtml(){
  if(!CHIST)return"";
  var h="<div class='card'><div class='step'>"+(CCLI?"Achats de "+esc(CCLI.name):"Ventes du jour")+"</div>";
  if(!CHIST.length)h+="<div class='muted'>Aucun achat en caisse pour le moment.</div>";
  CHIST.forEach(function(r){
    var res=r.lignes.slice(0,2).map(function(l){return esc(l.libelle)}).join(", ")+(r.lignes.length>2?"…":"");
    h+="<button class='sec hrow' data-act='cRecu' data-id='"+r.id+"'><b>"+esc(dateLongue(r.date))+"</b> · "+eur(r.totalCents)+(CCLI?"":" · "+esc(r.client||"sans client"))+savTags(r)+"<br><span class='muted'>"+res+"</span></button>";
    if(CHOPEN===r.id)h+=recuHtml(r)+shopHtml(r)+"<div class='actions'><button class='sec' data-act='cPrint' data-id='"+r.id+"'>Imprimer le reçu</button><button class='sec' data-act='cEmail' data-id='"+r.id+"'>✉ Envoyer par email</button></div>"});
  return h+"</div>"}
function caisseHtml(){
  if(CAV===null&&!CAVBUSY){CAVBUSY=true;api("/caisse/avantages").then(function(d){CAV=d;CAVBUSY=false;render()}).catch(function(){CAV=[];CAVBUSY=false})}
  prestaLoad();
  if(!CLO.d&&!CLOBUSY){CLOBUSY=true;api("/caisse/session").then(function(d){CLO.d=d;CLOBUSY=false;render()}).catch(function(){CLOBUSY=false})}
  if(!CLO.d)return"<div class='caisse'><h3>Caisse</h3><div class='muted'>Chargement...</div></div>";
  if(caisseBloquee()){
    var hb="<div class='caisse'><h3>Caisse"+(CPOP?"":" <button class='sec' data-act='cVjOuvre' title='Ventes du jour' style='float:right;width:48px;height:48px;padding:0;font-size:24px'>📋</button>"+((PAN.length||CCLI||CREP)?" <button class='sec' data-act='cNouv' title='Nouvelle vente (vide panier et client)' style='float:right;margin-right:8px;width:48px;height:48px;padding:0;font-size:24px'>↻</button>":""))+"</h3>";
    if(CREC)hb+="<div class='card'><b>Vente enregistrée</b>"+recuHtml(CREC)+"<div class='actions'><button data-act='cPrint' data-id='"+CREC.id+"'>Imprimer le reçu</button><button class='sec' data-act='cFermeRecu'>Fermer</button></div></div>";
    hb+="<div class='card' style='text-align:center'><div style='font-size:28px;font-weight:700;color:#b00'>🔒 CAISSE FERMÉE</div><div class='muted'>"+(CLO.d.ouverte?"Ferme la caisse de la veille pour continuer.":"Ouvre la caisse pour accéder aux ventes.")+"</div></div>";
    return hb+(CPOP?"":histoHtml()+cloHtml())+"</div>"}
  var brut=panierTotal(),av=avRemTotal(brut),rem=remiseCents(),aco=acoDeduit(brut-av-rem),net=brut-av-rem-aco;
  var h="<div class='caisse'><h3>Caisse"+(CPOP?"":" <button class='sec' data-act='cVjOuvre' title='Ventes du jour' style='float:right;width:48px;height:48px;padding:0;font-size:24px'>📋</button>"+((PAN.length||CCLI||CREP)?" <button class='sec' data-act='cNouv' title='Nouvelle vente (vide panier et client)' style='float:right;margin-right:8px;width:48px;height:48px;padding:0;font-size:24px'>↻</button>":""))+"</h3>";
  if(CREC)h+="<div class='card'><b>Vente enregistrée</b>"+affBanner(CRAFF)+recuHtml(CREC)+shopHtml(CREC)+avisBtns(CREC)+"<div class='actions'><button data-act='cPrint' data-id='"+CREC.id+"'>Imprimer le reçu</button><button class='sec' data-act='cEmail' data-id='"+CREC.id+"'>✉ Envoyer par email</button><button class='sec' data-act='cFermeRecu'>Fermer</button></div></div>";
  if(CREP)h+=affBanner(CAFF)+"<div class='card avbox'><b>Facturation de la réparation n°"+CREP+"</b><div class='muted'>Les lignes du devis sont dans le panier. À l'encaissement, la commande est créée dans Shopify.</div><button class='link' data-act='cpFerme'>↩ Retour à la prise en charge</button></div>";
  h+="<div class='card'><div class='step'>Client (scan carte, email ou téléphone)</div><div class='search'><input id='cq' placeholder='Scan carte, email ou téléphone'><button data-act='cScan'>Chercher</button></div>";
  if(CCLI)h+="<div style='margin-top:8px'><b>"+esc(CCLI.name)+"</b> <span class='muted'>"+esc(CCLI.phone||"")+"</span> <button class='link' data-act='cClient0'>Retirer</button></div><div class='actions' style='margin-top:4px'><button class='sec' data-act='cProfil'>Voir le profil</button><button class='sec' data-act='cProfilMod'>Modifier</button></div>"+(CCLI.anniversaire?"<div class='card avbox' style='margin-top:6px'><b>🎂 C'est son anniversaire !</b><div class='muted'>"+CCLI.anniversaire.annees+" an"+(CCLI.anniversaire.annees>1?"s":"")+" que le compte existe : proposer la révision à "+eur(CCLI.anniversaire.prixCents)+".</div></div>":"");
  else h+="<div class='muted' style='margin-top:6px'>Vente sans client. <button class='link' data-act='cJour'>Voir les ventes du jour</button></div>";
  if(CCLI&&CFID){
    var gagne=Math.floor(net/100/CFID.regle.eurosPourPalier);
    h+="<div class='fidbox'><b>Fidélité</b><div>Déjà dépensé en caisse : "+(CFID.depenseEuros).toFixed(2).replace(".",",")+" € · prochain palier dans "+CFID.prochainPalierIn.toFixed(2).replace(".",",")+" €</div>"
      +"<div>Cet achat rapporte "+gagne+" palier(s) ("+CFID.regle.remiseEuros+" € offerts tous les "+CFID.regle.eurosPourPalier+" €).</div>";
    if(CFID.disponibleEuros>0)h+="<div><b>"+CFID.disponibleEuros.toFixed(2).replace(".",",")+" € de bon d'achat disponible.</b> On l'utilise ?</div><div class='actions'><button class='"+(CUSE?"":"sec")+"' data-act='cUse' data-v='1'>Oui, utiliser</button><button class='"+(CUSE?"sec":"")+"' data-act='cUse' data-v='0'>Non</button></div>";
    else h+="<div class='muted'>Aucun bon d'achat disponible pour l'instant.</div>";
    h+="</div>"}
  h+="</div>";
  if(CREP&&CPOP&&CMODE==="acompte"&&FICHE)return h+acompteHtml(FICHE)+modeBar()+"</div>";
  h+="<div class='card'><div class='step'>Panier</div>";
  if(!PAN.length)h+="<div class='muted'>Panier vide. Ajoute un article ci-dessous.</div>";
  else h+="<table class='panier' style='width:100%;border-collapse:collapse'><tr><th style='text-align:left'>Article</th><th>Qté</th><th>Prix €</th><th></th></tr>"+PAN.map(function(l,i){return"<tr><td>"+esc(l.libelle)+((l.barcode||l.sku)?"<div class='muted' style='font-size:12px'>"+(l.barcode?"EAN "+esc(l.barcode):"")+(l.barcode&&l.sku?" · ":"")+(l.sku?"sku "+esc(l.sku):"")+"</div>":"")+(l.emplacement?"<div style='font-size:13px'><b>📍 "+esc(l.emplacement)+"</b></div>":"")+serieHtml(l,i)+"</td><td><input type='number' min='1' value='"+l.quantite+"' data-act='cQte' data-i='"+i+"'></td><td><input value='"+esc(l.prix)+"' data-act='cPrix' data-i='"+i+"'></td><td><button class='link' data-act='cDel' data-i='"+i+"'>Retirer</button></td></tr>"}).join("")+"</table>";
  var nonT=PAN.map(function(l,i){return{l:l,i:i}}).filter(function(x){return !x.l.trott});
  if(PAN.length&&nonT.length){
    if(CVEH)h+="<div class='dl' style='margin-top:6px'><select id='cveh-l'>"+nonT.map(function(x){return"<option value='"+x.i+"'>"+esc(x.l.libelle)+"</option>"}).join("")+"</select><button data-act='cVehOk'>Enregistrer le véhicule</button><button class='link' data-act='cVehNon'>Annuler</button></div>";
    else h+="<div style='margin-top:4px'><button class='link' data-act='cVehOpen' style='font-size:12px;opacity:.7'>🛴 Enregistrer un véhicule</button></div>"}
  h+="<div style='margin-top:8px'>"+prodBox("caisse")+"</div>";
  h+=livHtml();
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
  CNET=net;h+="<div class='big'>À payer : "+eur(net)+"</div><div id='pay-rendu' class='big' style='color:#b00'>"+renduTxt()+"</div>"
    +"<div class='pay'><span>Carte</span><input id='pc' placeholder='0,00' value='"+esc(CPAY.carte)+"'></div><div class='pay'><span>Espèces</span><input id='pe' placeholder='0,00' value='"+esc(CPAY.especes)+"'></div><div class='pay'><span>Virement</span><input id='pv' placeholder='0,00' value='"+esc(CPAY.virement)+"'></div>"+((CCLI&&CFID&&CFID.disponibleEuros>0)?"<div class='pay'><span>Cagnotte</span><button class='"+(CUSE?"":"sec")+"' data-act='cUse' data-v='"+(CUSE?0:1)+"'>"+(CUSE?"✓ "+eur(remiseCents())+" utilisés (annuler)":"Utiliser les "+CFID.disponibleEuros.toFixed(2).replace(".",",")+" € de la cagnotte")+"</button></div>":"")
    +"<div class='actions'><button class='sec' data-act='cTout' data-m='carte'>Tout en carte</button><button class='sec' data-act='cTout' data-m='especes'>Tout en espèces</button><button class='sec' data-act='cTout' data-m='virement'>Tout en virement</button></div>"
    +"<button data-act='cEncaisser' style='width:100%;margin-top:6px;padding:14px;font-size:17px'>Encaisser</button><div class='muted'>"+esc(CMSG)+"</div>"
    +"<div class='muted' style='margin-top:10px'>Le client ne se décide pas maintenant ?</div><div class='actions'><button class='sec' data-act='cEnDevis'>Mettre en devis</button><button class='sec' data-act='cEnPec'>Faire réparer en boutique</button><button class='sec' data-act='cCmdClient'>📦 Commander pour le client</button></div></div>";
  h+=(CPOP?modeBar():histoHtml()+cloHtml())+"</div>";
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
