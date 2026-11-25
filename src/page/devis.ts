export const DEVIS = `// ---------- Devis simples (sans prise en charge) ----------
var DV={list:null,ed:null,res:null,msg:"",hint:""};
function dvNum(id){return"DV-"+("0000"+id).slice(-4)}
function dvVide(){return{id:0,clientId:0,nom:"",telephone:"",email:"",trottinette:"",objet:"",reparationId:null,lignes:[{libelle:"",quantite:1,prixCents:0}]}}
function dvTotal(l){return l.reduce(function(t,x){return t+(x.quantite||1)*(x.prixCents||0)},0)}
function vDevis(){
  if(DV.ed){vDevisEd();return}
  if(DV.list===null){app.innerHTML=subHtml()+"<div class='card'>Chargement…</div>";api("/devis-simples").then(function(d){DV.list=d.devis;render()}).catch(function(e){DV.list=[];DV.msg=e.message;render()});return}
  var h=subHtml()+(DV.msg?"<div class='pmsg'>"+esc(DV.msg)+"</div>":"")+"<div class='card'><div class='step'>Devis</div><div class='muted'>Un devis seul, sans prise en charge. S'il se concrétise : « Facturer » (pièces vendues, passage en caisse) ou « Créer une prise en charge » (réparation).</div>";
  if(!DV.list.length)h+="<div class='muted'>Aucun devis pour l'instant.</div>";
  DV.list.forEach(function(d,i){h+="<button class='sec hrow' data-act='dvOuvre' data-i='"+i+"'><b>"+dvNum(d.id)+"</b> · "+esc(d.nom||"Sans nom")+" · "+esc(d.trottinette||"")+" · <b>"+eur(d.totalCents)+"</b> · "+esc(day(d.date))+(d.reparationId?" · <span class='tag ok'>Rattaché à "+pcn(d.reparationId)+"</span>":"")+"</button>"});
  app.innerHTML=h+"</div>"}
function vDevisEd(){
  var d=DV.ed,rat=!!d.reparationId;
  var h=subHtml()+(DV.msg?"<div class='pmsg'>"+esc(DV.msg)+"</div>":"")+"<div class='card'><div class='step'>"+(d.id?"Devis "+dvNum(d.id):"Nouveau devis")+(rat?" · rattaché à "+pcn(d.reparationId):"")+"</div>";
  h+="<div class='dl'><input id='dq' class='lb' placeholder='Retrouver un client existant (nom, téléphone, email)'><button class='sec' data-act='dvChercher'>Chercher</button></div>";
  if(DV.res)h+=DV.res.length?DV.res.map(function(c,i){return"<button class='sec hrow' data-act='dvChoisir' data-i='"+i+"'><b>"+esc(c.name)+"</b> <span class='muted'>"+esc((c.phone||c.telephone||""))+" "+esc(c.email||"")+"</span></button>"}).join(""):"<div class='muted'>Aucun client trouvé.</div>";
  h+="<div class='muted'>Client : choisis un client existant ci-dessus, ou laisse vide (devis sans nom), ou renseigne nom + téléphone ou email (sa fiche client sera créée ou retrouvée).</div><div class='dl'><input id='dn' placeholder='Nom du client' value='"+esc(d.nom)+"'><input id='dt' placeholder='Téléphone' value='"+esc(d.telephone)+"'><input id='de' placeholder='Email' value='"+esc(d.email)+"'></div>"
    +"<div class='dl'><input id='dtr' placeholder='Trottinette (ex : Xiaomi M365)' value='"+esc(d.trottinette)+"'><input id='dob' placeholder='Objet du devis' value='"+esc(d.objet)+"'></div>"
    +""+dvPrestaBox()+"<div class='step' style='margin-top:10px'>Lignes (prix TTC)</div><div class='muted'>Une pièce du catalogue turnshop.fr ? Cherche-la ou scanne-la ici :</div>"+prodBox("dvs")+(DV.hint?"<div class='pmsg'>"+esc(DV.hint)+"</div>":"");
  d.lignes.forEach(function(l,i){h+="<div class='dl'><input id='dl"+i+"' class='lb' placeholder='Pièce ou main d oeuvre' value='"+esc(l.libelle)+"'><input id='dq"+i+"' class='q' type='number' min='1' value='"+(l.quantite||1)+"'><input id='dp"+i+"' class='p' placeholder='Prix €' value='"+(l.prixCents?(l.prixCents/100).toFixed(2).replace(".",","):"")+"'><button class='link' data-act='dvDelL' data-i='"+i+"'>Suppr.</button></div>"});
  h+="<div class='actions'><button class='sec' data-act='dvAddL'>+ Ligne</button></div><div style='font-size:20px;margin:8px 0'><b>Total TTC : "+eur(dvTotal(d.lignes))+"</b></div>"
    +"<div class='actions'>"+(rat?"":"<button data-act='dvSave'>Enregistrer</button>")+(d.id?"<button class='sec' data-act='dvPrint'>Imprimer</button>":"")
    +(d.id&&!rat?"<button data-act='dvFact'>Facturer (passer en caisse)</button><button class='sec' data-act='dvRatt'>Créer une prise en charge</button>":"")+(rat?"<button class='sec' data-act='dvVoirPC'>Ouvrir "+pcn(d.reparationId)+"</button>":"")
    +(d.id&&!rat?"<button class='danger' data-act='dvSuppr'>Supprimer</button>":"")+"<button class='sec' data-act='dvRetour'>Retour à la liste</button></div></div>";
  app.innerHTML=h}
function dvLire(){
  var d=DV.ed;if(!d||!document.getElementById("dn"))return;
  d.nom=v("dn");d.telephone=v("dt");d.email=v("de");d.trottinette=v("dtr");d.objet=v("dob");
  d.lignes=d.lignes.map(function(l,i){var p=Number(String(v("dp"+i)).replace(",","."))||0;return{libelle:v("dl"+i),quantite:Math.max(1,Number(v("dq"+i))||1),prixCents:Math.round(p*100)}})}
function dvPayload(){var d=DV.ed;return{id:d.id,clientId:d.clientId,nom:d.nom,telephone:d.telephone,email:d.email,trottinette:d.trottinette,objet:d.objet,lignes:d.lignes.map(function(l){return{libelle:l.libelle,quantite:l.quantite,prix:(l.prixCents/100).toFixed(2)}})}}
ACTS.dvNouveau=function(){DV.hint="";DV.ed=dvVide();DV.res=null;DV.msg="";FICHE=null;TAB="enc";ATSUB="devis";render()};
ACTS.dvOuvre=function(b){DV.hint="";var d=DV.list[+b.dataset.i];DV.ed=JSON.parse(JSON.stringify(d));if(!DV.ed.lignes.length)DV.ed.lignes=dvVide().lignes;DV.res=null;DV.msg="";render()};
ACTS.dvRetour=function(){DV.ed=null;DV.list=null;DV.msg="";render()};
ACTS.cLivOn=async function(){if(livIdx()<0)PAN.push({libelle:"Livraison à domicile",quantite:1,prix:"4,95",type:"article",variantId:"",sku:""});
  if(CCLI&&!CLIV.adresse){try{var a=await api("/client-adresse?id="+CCLI.id);CLIV={adresse:a.adresse,cp:a.cp,ville:a.ville}}catch(e){}}render()};
ACTS.cLivOff=function(){var i=livIdx();if(i>=0)PAN.splice(i,1);render()};
function dvPrestaBox(){
  prestaLoad();
  var l=(PRESTA?PRESTA.prestations:[]).filter(function(x){return x.actif});
  var h="<div class='step' style='margin-top:10px'>Prestations</div>";
  if(!l.length)return h+"<div class='muted'>Aucune prestation. Un admin peut en créer dans ⚙ Paramètres.</div>";
  h+="<div class='presta'>"+l.slice().sort(function(a,b){return (b.usage||0)-(a.usage||0)}).slice(0,8).map(function(x){var F=PRFAM[prFam(x.nom)];return"<button class='sec' style='border-left:5px solid "+F[1]+";background:"+F[2]+"' data-act='dvAddPresta' data-id='"+x.id+"'><b>"+esc(x.nom)+"</b><br><span class='muted'>"+eur(x.prixCents)+"</span></button>"}).join("")+"</div>"+(l.length>8?"<button class='sec' data-act='prPop' style='margin:4px 0'>Voir toutes les prestations ("+l.length+")</button>":"");
  if(PRPOP)h+=prPopHtml(l);
  return h}
function dvPrestaAdd(x){dvLire();var ls=DV.ed.lignes,vide=ls.length&&!ls[ls.length-1].libelle&&!ls[ls.length-1].prixCents;var nl={libelle:x.nom,quantite:1,prixCents:x.prixCents};if(vide)ls[ls.length-1]=nl;else ls.push(nl)}
ACTS.dvAddPresta=function(b){var x=(PRESTA?PRESTA.prestations:[]).filter(function(p){return p.id===+b.dataset.id})[0];if(!x||!DV.ed)return;dvPrestaAdd(x);DV.hint=x.avecPiece?"Ajoute maintenant : "+(x.pieceAide||"la pièce")+" (cherche-la ci-dessous).":"";render()};
var _prAj=ACTS.prAjoute;
ACTS.prAjoute=function(b){
  if(DV.ed&&!FICHE&&TAB==="enc"&&ATSUB==="devis"){if(!PRPOP)return;var L=PRESTA?PRESTA.prestations:[];Object.keys(PRPOP.sel).forEach(function(id){var x=L.filter(function(p){return p.id===+id})[0];if(x)dvPrestaAdd(x)});PRPOP=null;render();return}
  return _prAj(b)};
async function dvAjoutProduit(p){
  dvLire();var r=await api("/maitres/resoudre",{libelle:p.libelle,prix:String(p.prix).replace(".",","),variantId:p.variantId,sku:p.sku,barcode:p.barcode});
  var ls=DV.ed.lignes,vide=ls.length&&!ls[ls.length-1].libelle&&!ls[ls.length-1].prixCents;
  var nl={libelle:r.libelle,quantite:1,prixCents:r.prixCents};if(vide)ls[ls.length-1]=nl;else ls.push(nl);
  DV.hint=r.maitre?"Produit maître mis sur le devis : "+r.maitre.nom+" (produit choisi : "+r.maitre.origine+")":"";render()}
ACTS.dvAddL=function(){dvLire();DV.ed.lignes.push({libelle:"",quantite:1,prixCents:0});render()};
ACTS.dvDelL=function(b){dvLire();DV.ed.lignes.splice(+b.dataset.i,1);if(!DV.ed.lignes.length)DV.ed.lignes=dvVide().lignes;render()};
ACTS.dvChercher=function(){var q=v("dq");if(!q)return;dvLire();api("/search?q="+encodeURIComponent(q)).then(function(r){DV.res=r;render()}).catch(function(e){alert(e.message)})};
ACTS.dvChoisir=function(b){var c=DV.res[+b.dataset.i];dvLire();DV.ed.clientId=c.id;DV.ed.nom=c.name;DV.ed.telephone=(c.phone||c.telephone||"");DV.ed.email=c.email||"";DV.res=null;render()};
ACTS.dvSave=async function(b){dvLire();if(b)btnFlash(b,"Enregistrement…");try{var r=await api("/devis-simples",dvPayload());DV.ed.id=r.id;DV.msg=r.message;DV.list=null;render();var nb=document.querySelector("[data-act=dvSave]");if(nb)btnFlash(nb,"✓ Devis enregistré")}catch(e){render();alert(e.message)}};
ACTS.dvSuppr=async function(){if(!confirm("Supprimer ce devis ?"))return;try{await api("/devis-simples/supprimer",{id:DV.ed.id});DV.ed=null;DV.list=null;DV.msg="Devis supprimé.";render()}catch(e){alert(e.message)}};
ACTS.dvRatt=async function(){
  dvLire();
  if(!confirm("Créer une prise en charge (réparation) avec ces lignes ? Pour une vente de pièces seulement, utilise « Facturer »."))return;
  try{var s=await api("/devis-simples",dvPayload());DV.ed.id=s.id;var r=await api("/devis-simples/rattacher",{id:s.id});DV.ed=null;DV.list=null;await ouvrirFiche(r.reparationId)}catch(e){alert(e.message)}};
ACTS.dvFact=async function(){
  dvLire();
  if(PAN.length&&!confirm("Le panier de la caisse n'est pas vide : le remplacer par ce devis ?"))return;
  try{var s=await api("/devis-simples",dvPayload());DV.ed.id=s.id;var d=null;
    if(DV.ed.clientId)d=await api("/caisse/client?id="+DV.ed.clientId);
    PAN=DV.ed.lignes.map(function(l){return{libelle:l.libelle,quantite:l.quantite,prix:String(l.prixCents/100).replace(".",","),type:"article",variantId:"",sku:""}});
    CCLI=d?d.client:null;CFID=d?d.fidelite:null;CUSE=false;CAVOFF=[];CREC=null;CHOPEN=0;CREP=null;CACO=0;CPAY={carte:"",especes:"",virement:"",bon_achat:""};CMSG="";
    DV.ed=null;DV.list=null;FICHE=null;CUR=null;TAB="accueil";if(d)await chargeHisto();else render()}catch(e){alert(e.message)}};
async function cartVersDevis(){
  if(!PAN.length){alert("Le panier est vide.");return null}
  var nom=CCLI?CCLI.name:(prompt("Nom du client ? (laisse vide pour un devis sans nom)")||"").trim();
  var tel=CCLI?(CCLI.phone||""):"";
  if(!CCLI&&nom){tel=(prompt("Téléphone du client (sa fiche client sera créée) ?")||"").trim();if(!tel)return null}
  var r=await api("/devis-simples",{clientId:CCLI?CCLI.id:0,nom:nom,telephone:tel,email:CCLI?(CCLI.email||""):"",lignes:PAN.map(function(l){return{libelle:l.libelle,quantite:l.quantite,prix:l.prix}})});
  return r}
function cartVide(){PAN=[];CPAY={carte:"",especes:"",virement:"",bon_achat:""};CMSG="";CCLI=null;CFID=null;CUSE=false;CAVOFF=[];CREP=null;CACO=0}
ACTS.cEnDevis=async function(){
  try{var r=await cartVersDevis();if(!r)return;cartVide();DV.list=null;DV.ed=null;DV.res=null;DV.hint="";DV.msg="Devis "+dvNum(r.id)+" enregistré.";FICHE=null;CUR=null;TAB="enc";ATSUB="devis";
    try{var ls=await api("/devis-simples");DV.list=ls.devis;var d=ls.devis.filter(function(x){return x.id===r.id})[0];if(d){DV.ed=JSON.parse(JSON.stringify(d));if(!DV.ed.lignes.length)DV.ed.lignes=dvVide().lignes}}catch(e2){}
    render()}catch(e){alert(e.message)}};
var CMDFID=0;
async function cmdAuto(ids){
  var ok=0,msg="";
  for(var k=0;k<ids.length;k++){
    var r=await api("/achats/depuis-devis",{devisLigneId:ids[k],fournisseurId:CMDFID||undefined});
    if(r.choix){
      var fs=r.fournisseurs;if(!fs.length){alert("Crée d'abord un fournisseur dans l'onglet Commandes.");return"aucun fournisseur"}
      var rep=prompt("Quel fournisseur ? Tape le numéro :"+String.fromCharCode(10)+fs.map(function(x,i){return(i+1)+" = "+x.nom}).join(String.fromCharCode(10)),"1");if(!rep)return"annulé";
      var f=fs[(parseInt(rep,10)||1)-1];if(!f)return"fournisseur inconnu";CMDFID=f.id;
      r=await api("/achats/depuis-devis",{devisLigneId:ids[k],fournisseurId:f.id})}
    ok++;msg=r.message||msg}
  CMDFID=0;return ok?ok+" pièce(s) ajoutée(s) au panier fournisseur.":"Aucune pièce à commander dans le panier (les lignes doivent être des pièces)."}
function cmdLignesPieces(d){return((d.devis&&d.devis.lignes)||d.lignes||[]).filter(function(l){return l.type==="piece"&&!l.commande&&!/^Livraison à domicile/i.test(l.libelle)}).map(function(l){return l.id})}
var CMDLIV={mode:"boutique",adresse:"",cp:"",ville:"",pay:""};
function cmdPopHtml(){
  return"<div class='cpop' id='cmdpop'><div class='cpbox' style='max-width:520px;padding:18px'><div class='step'>Commande pour "+esc(CCLI?CCLI.name:"")+"</div><div class='muted'>Comment le client récupère sa commande ?</div>"
    +"<div class='seg' style='margin:10px 0'><button class='"+(CMDLIV.mode==="boutique"?"on":"")+"' data-act='cmdMode' data-m='boutique'>🏬 Retrait en boutique</button><button class='"+(CMDLIV.mode==="domicile"?"on":"")+"' data-act='cmdMode' data-m='domicile'>🚚 Livraison à domicile (+4,95 €)</button></div>"
    +(CMDLIV.mode==="domicile"?"<div class='muted'>La commande part via le site, comme une commande web, à son adresse.</div><div class='dl'><input id='cmd-a' class='lb' placeholder='Adresse' value='"+esc(CMDLIV.adresse)+"'></div><div class='dl'><input id='cmd-c' placeholder='Code postal' value='"+esc(CMDLIV.cp)+"' style='max-width:140px'><input id='cmd-v' class='lb' placeholder='Ville' value='"+esc(CMDLIV.ville)+"'></div>":"")
    +"<div class='muted' style='margin-top:8px'>Le client paie maintenant ? (le paiement est enregistré sur son compte)</div><div class='seg' style='margin:6px 0'>"+[["","Pas encore"],["carte","💳 Carte"],["especes","💶 Espèces"],["virement","🏦 Virement"]].map(function(x){return"<button class='"+(CMDLIV.pay===x[0]?"on":"")+"' data-act='cmdPay' data-m='"+x[0]+"'>"+x[1]+"</button>"}).join("")+"</div>"
    +"<div class='actions'><button data-act='cmdGo'>Créer la commande</button><button class='sec' data-act='cmdFerme'>Annuler</button></div></div></div>"}
function cmdPopShow(){var o=document.getElementById("cmdpop");if(o)o.remove();document.body.insertAdjacentHTML("beforeend",cmdPopHtml())}
document.addEventListener("input",function(e){var i=e.target&&e.target.id;if(i==="cmd-a")CMDLIV.adresse=e.target.value;else if(i==="cmd-c")CMDLIV.cp=e.target.value;else if(i==="cmd-v")CMDLIV.ville=e.target.value});
ACTS.cmdPay=function(b){CMDLIV.pay=b.dataset.m;cmdPopShow()};
ACTS.cmdMode=function(b){CMDLIV.mode=b.dataset.m;cmdPopShow()};
ACTS.cmdFerme=function(){var o=document.getElementById("cmdpop");if(o)o.remove()};
ACTS.cCmdClient=async function(){
  if(!PAN.length){alert("Le panier est vide.");return}
  if(!CCLI){alert("Choisis d'abord le client (recherche ou scan de carte).");return}
  CMDLIV={mode:"boutique",adresse:"",cp:"",ville:""};
  try{var a=await api("/client-adresse?id="+CCLI.id);CMDLIV.adresse=a.adresse;CMDLIV.cp=a.cp;CMDLIV.ville=a.ville}catch(e){}
  cmdPopShow()};
ACTS.cmdGo=async function(){
  var dom=CMDLIV.mode==="domicile";
  if(dom&&(!CMDLIV.adresse.trim()||!CMDLIV.cp.trim()||!CMDLIV.ville.trim())){alert("Indique l'adresse, le code postal et la ville.");return}
  var mdpP=null;if(CMDLIV.pay){mdpP=await demandeCode("Qui encaisse ?");if(mdpP===null)return}
  ACTS.cmdFerme();
  try{
    if(dom&&livIdx()<0)PAN.push({libelle:"Livraison à domicile",quantite:1,prix:"4,95",type:"article",variantId:"",sku:""});
    var r=await cartVersDevis();if(!r)return;var p=await api("/devis-simples/rattacher",{id:r.id});await api("/devis-lignes/remise-client",{repairId:p.reparationId,valeur:true});
    if(dom)await api("/reparations/livraison",{repairId:p.reparationId,adresse:CMDLIV.adresse,cp:CMDLIV.cp,ville:CMDLIV.ville});
    var f=await api("/reparation?id="+p.reparationId);var m=await cmdAuto(cmdLignesPieces(f));
    var payMsg="";if(CMDLIV.pay){var du=payInfo(f).due;if(du>0){await api("/reparations/acompte",{mdpCaissier:mdpP,repairId:p.reparationId,paiements:[{moyen:CMDLIV.pay,montant:String(du/100).replace(".",",")}]});payMsg=" Paiement de "+eur(du)+" enregistré sur son compte."}}
    cartVide();DV.list=null;CMD=null;CCL=null;CMDMSG="Commande client créée ("+(dom?"livraison à domicile":"retrait en boutique")+") : "+m+" Devis et dossier : PC-"+("0000"+p.reparationId).slice(-4)+"."+payMsg;FICHE=null;CUR=null;TAB="cmd";render()}catch(e){alert(e.message)}};
ACTS.cSepOk=function(){};
ACTS.cEnPec=async function(){
  if(!PAN.length){alert("Le panier est vide.");return}
  if(!confirm("Créer une prise en charge (réparation en boutique) avec ce panier ?"))return;
  try{var r=await cartVersDevis();if(!r)return;var p=await api("/devis-simples/rattacher",{id:r.id});cartVide();DV.list=null;await ouvrirFiche(p.reparationId)}catch(e){alert(e.message)}};
ACTS.dvVoirPC=function(){ouvrirFiche(DV.ed.reparationId)};
ACTS.dvPrint=async function(b){
  btnFlash(b);dvLire();var rv=await rdvInfos();var d=DV.ed,nl=String.fromCharCode(10),t=dvTotal(d.lignes),ht=Math.round(t/1.2),tva=t-ht;
  var es=entSplit(TICKENT),ent=es.haut;
  var h="<div class='rc'>"+ent+(MAG?"<br>Boutique "+esc(MAG):"")+"</div>"+devisCoord(rv)+"<hr><div class='rc'><b>DEVIS</b></div><div class='rc' style='font-size:18px'><b>"+dvNum(d.id)+"</b></div>"
    +"<div class='rl'><span>Date</span><span>"+new Date().toLocaleDateString("fr-FR")+"</span></div><hr>"
    +"<div class='rm'>Client</div><div><b>"+esc(d.nom||"Sans nom")+"</b></div>"+(d.telephone?"<div>"+esc(d.telephone)+"</div>":"")+(d.trottinette?"<div class='rm' style='margin-top:4px'>Trottinette</div><div><b>"+esc(d.trottinette)+"</b></div>":"")+(d.objet?"<div class='rm' style='margin-top:4px'>Objet : "+esc(d.objet)+"</div>":"")+"<hr>";
  d.lignes.forEach(function(l){h+="<div class='rl'><span>"+l.quantite+" × "+esc(l.libelle)+"</span><span>"+eur(l.quantite*l.prixCents)+"</span></div>"});
  h+="<hr><div class='rl rt'><span>TOTAL TTC</span><span>"+eur(t)+"</span></div><div class='rl rm'><span>Total HT</span><span>"+eur(ht)+"</span></div><div class='rl rm'><span>TVA 20 %</span><span>"+eur(tva)+"</span></div>"
    +"<hr><div class='rc rm'>Devis valable 30 jours. Document non contractuel tant qu'il n'est pas validé par le client.</div>"+devisQr(rv)+""+entBas(es,"Merci de votre confiance !");
  impImprimer(h,"recu",pecCss())};
var TICKENT="";
`;
