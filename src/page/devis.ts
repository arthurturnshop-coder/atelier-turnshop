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
  DV.list.forEach(function(d,i){h+="<button class='sec hrow' data-act='dvOuvre' data-i='"+i+"'><b>"+dvNum(d.id)+"</b> · "+esc(d.nom||"Sans nom")+" · "+esc(d.trottinette||"")+" · <b>"+eur(d.totalCents)+"</b> · "+esc(day(d.date))+(d.commandeClient?" · <span class='tag ok'>Commande client</span>":d.reparationId?" · <span class='tag ok'>Rattaché à "+pcn(d.reparationId)+"</span>":"")+"</button>"});
  app.innerHTML=h+"</div>"}
function vDevisEd(){
  var d=DV.ed,rat=!!d.reparationId;
  var h=subHtml()+(DV.msg?"<div class='pmsg'>"+esc(DV.msg)+"</div>":"")+"<div class='card'><div class='step'>"+(d.id?"Devis "+dvNum(d.id):"Nouveau devis")+(d.commandeClient?" · commande client":rat?" · rattaché à "+pcn(d.reparationId):"")+"</div>";
  h+="<div class='dl'><input id='dq' class='lb' placeholder='Retrouver un client existant (nom, téléphone, email)'><button class='sec' data-act='dvChercher'>Chercher</button></div>";
  if(DV.res)h+=DV.res.length?DV.res.map(function(c,i){return"<button class='sec hrow' data-act='dvChoisir' data-i='"+i+"'><b>"+esc(c.name)+"</b> <span class='muted'>"+esc((c.phone||c.telephone||""))+" "+esc(c.email||"")+"</span></button>"}).join(""):"<div class='muted'>Aucun client trouvé.</div>";
  h+="<div class='muted'>Client : choisis un client existant ci-dessus, ou laisse vide (devis sans nom), ou renseigne nom + téléphone ou email (sa fiche client sera créée ou retrouvée).</div><div class='dl'><input id='dn' placeholder='Nom du client' value='"+esc(d.nom)+"'><input id='dt' placeholder='Téléphone' value='"+esc(d.telephone)+"'><input id='de' placeholder='Email' value='"+esc(d.email)+"'></div>"
    +"<div class='dl'><input id='dtr' placeholder='Trottinette (ex : Xiaomi M365)' value='"+esc(d.trottinette)+"'><input id='dob' placeholder='Objet du devis' value='"+esc(d.objet)+"'></div>"
    +""+dvPrestaBox()+"<div class='step' style='margin-top:10px'>Lignes (prix TTC)</div><div class='muted'>Une pièce du catalogue turnshop.fr ? Cherche-la ou scanne-la ici :</div>"+prodBox("dvs")+(DV.hint?"<div class='pmsg'>"+esc(DV.hint)+"</div>":"");
  d.lignes.forEach(function(l,i){h+="<div class='dl'><input id='dl"+i+"' class='lb' placeholder='Pièce ou main d oeuvre' value='"+esc(l.libelle)+"'><input id='dq"+i+"' class='q' type='number' min='1' value='"+(l.quantite||1)+"'><input id='dp"+i+"' class='p' placeholder='Prix €' value='"+(l.prixCents?(l.prixCents/100).toFixed(2).replace(".",","):"")+"'><button class='link' data-act='dvDelL' data-i='"+i+"'>Suppr.</button></div><div class='dl' style='margin:-4px 0 6px'><input id='ds"+i+"' class='lb' placeholder='🛴 N° de série (si trottinette ; plusieurs : sépare par une virgule)' value='"+esc(l.series||"")+"'></div>"});
  h+="<div class='actions'><button class='sec' data-act='dvAddL'>+ Ligne</button></div><div style='font-size:20px;margin:8px 0'><b>Total TTC : "+eur(dvTotal(d.lignes))+"</b></div>"
    +"<div class='actions'>"+(rat?"":"<button data-act='dvSave'>Enregistrer</button>")+(d.id?"<button class='sec' data-act='dvPrint'>Imprimer</button>":"")
    +(d.id&&!rat?"<button data-act='dvFact'>Facturer (passer en caisse)</button><button class='sec' data-act='dvRatt'>Créer une prise en charge</button>":"")+(rat?"<button data-act='dvSerieSave'>Enregistrer les n° de série</button>":"")+(d.commandeClient?"<button data-act='dvFactCC'>💶 Facturer (encaisser le solde)</button>":"")+(d.commandeClient?"<button class='sec' data-act='dvConvPC'>Créer une prise en charge</button>":rat?"<button class='sec' data-act='dvVoirPC'>Ouvrir "+pcn(d.reparationId)+"</button>":"")
    +(d.id&&!rat?"<button class='danger' data-act='dvSuppr'>Supprimer</button>":"")+"<button class='sec' data-act='dvRetour'>Retour à la liste</button></div></div>";
  app.innerHTML=h}
function dvLire(){
  var d=DV.ed;if(!d||!document.getElementById("dn"))return;
  d.nom=v("dn");d.telephone=v("dt");d.email=v("de");d.trottinette=v("dtr");d.objet=v("dob");
  d.lignes=d.lignes.map(function(l,i){var p=Number(String(v("dp"+i)).replace(",","."))||0;return{libelle:v("dl"+i),quantite:Math.max(1,Number(v("dq"+i))||1),prixCents:Math.round(p*100),series:v("ds"+i),variantId:l.variantId||"",sku:l.sku||""}})}
function dvPayload(){var d=DV.ed;return{id:d.id,clientId:d.clientId,nom:d.nom,telephone:d.telephone,email:d.email,trottinette:d.trottinette,objet:d.objet,lignes:d.lignes.map(function(l){return{libelle:l.libelle,quantite:l.quantite,prix:(l.prixCents/100).toFixed(2),series:l.series||"",variantId:l.variantId||"",sku:l.sku||""}})}}
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
    PAN=DV.ed.lignes.map(function(l){var sr=String(l.series||"").split(",").map(function(x){return x.trim()}).filter(Boolean);return{libelle:l.libelle,quantite:l.quantite,prix:String(l.prixCents/100).replace(".",","),type:"article",variantId:l.variantId||"",sku:l.sku||"",trott:sr.length>0,series:sr}});
    CCLI=d?d.client:null;CFID=d?d.fidelite:null;CUSE=false;CAVOFF=[];CREC=null;CHOPEN=0;CREP=null;CACO=0;CPAY={carte:"",especes:"",virement:"",bon_achat:""};CMSG="";
    DV.ed=null;DV.list=null;FICHE=null;CUR=null;TAB="accueil";if(d)await chargeHisto();else render()}catch(e){alert(e.message)}};
async function cartVersDevis(){
  if(!PAN.length){alert("Le panier est vide.");return null}
  var nom=CCLI?CCLI.name:(prompt("Nom du client ? (laisse vide pour un devis sans nom)")||"").trim();
  var tel=CCLI?(CCLI.phone||""):"";
  if(!CCLI&&nom){tel=(prompt("Téléphone du client (sa fiche client sera créée) ?")||"").trim();if(!tel)return null}
  var r=await api("/devis-simples",{clientId:CCLI?CCLI.id:0,nom:nom,telephone:tel,email:CCLI?(CCLI.email||""):"",lignes:PAN.map(function(l){return{libelle:l.libelle,quantite:l.quantite,prix:l.prix,variantId:l.variantId||"",sku:l.sku||"",series:(l.series||[]).filter(Boolean).join(",")}})});
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
ACTS.cCmdClient=async function(){
  if(!PAN.length){alert("Le panier est vide.");return}
  if(!CCLI){alert("Choisis d'abord le client (recherche ou scan de carte).");return}
  lirePay();
  var tot=panierTotal(),dom=livIdx()>=0;
  var pay={carte:pxCents(CPAY.carte),especes:pxCents(CPAY.especes),virement:pxCents(CPAY.virement),bon_achat:pxCents(CPAY.bon_achat)};
  var bonFid=remiseCents();if(bonFid>0)pay.bon_achat+=bonFid;
  var sum=pay.carte+pay.especes+pay.virement+pay.bon_achat;
  if(sum<=0){alert("Saisis d'abord ce que le client paie (carte, espèces, virement ou bon d'achat), puis clique sur « Commander pour le client ».");return}
  if(sum>tot){var ex=sum-tot;if(pay.especes>=ex)pay.especes-=ex;else{alert("Le client paie "+eur(sum)+" pour "+eur(tot)+" de commande.");return}sum=tot}
  var adr={adresse:"",cp:"",ville:""};
  if(dom){
    try{var a=await api("/client-adresse?id="+CCLI.id);adr={adresse:a.adresse||"",cp:a.cp||"",ville:a.ville||""}}catch(e){}
    if(!adr.adresse.trim())adr.adresse=(prompt("Adresse de livraison ?")||"").trim();
    if(!adr.cp.trim())adr.cp=(prompt("Code postal ?")||"").trim();
    if(!adr.ville.trim())adr.ville=(prompt("Ville ?")||"").trim();
    if(!adr.adresse||!adr.cp||!adr.ville){alert("Il faut l'adresse, le code postal et la ville pour livrer à domicile.");return}
  }
  var mdpP=await demandeCode("Qui encaisse l acompte ?");if(mdpP===null)return;
  var pl=[["carte",pay.carte],["especes",pay.especes],["virement",pay.virement],["bon_achat",pay.bon_achat]].filter(function(x){return x[1]>0}).map(function(x){return{moyen:x[0],montant:String(x[1]/100).replace(".",",")}});
  try{
    var r=await cartVersDevis();if(!r)return;var p=await api("/devis-simples/rattacher",{id:r.id});await api("/devis-simples/commande-client",{repairId:p.reparationId});await api("/devis-lignes/remise-client",{repairId:p.reparationId,valeur:true});
    if(dom)await api("/reparations/livraison",{repairId:p.reparationId,adresse:adr.adresse,cp:adr.cp,ville:adr.ville});
    var f=await api("/reparation?id="+p.reparationId);var m=await cmdAuto(cmdLignesPieces(f));
    await api("/reparations/acompte",{mdpCaissier:mdpP,repairId:p.reparationId,paiements:pl});
    var du=tot-sum;
    cartVide();CMD=null;CCL=null;FICHE=null;CUR=null;TAB="enc";ATSUB="devis";DV.list=null;DV.ed=null;DV.res=null;DV.hint="";
    DV.msg="Commande client créée ("+(dom?"livraison à domicile":"retrait en boutique")+") : "+m+" Acompte de "+eur(sum)+" encaissé"+(du>0?", reste à payer "+eur(du):", soldé")+".";
    try{var ls=await api("/devis-simples");DV.list=ls.devis;var d=ls.devis.filter(function(x){return x.id===r.id})[0];if(d){DV.ed=JSON.parse(JSON.stringify(d));if(!DV.ed.lignes.length)DV.ed.lignes=dvVide().lignes}}catch(e2){}
    render()}catch(e){alert(e.message)}};
ACTS.cSepOk=function(){};
ACTS.cEnPec=async function(){
  if(!PAN.length){alert("Le panier est vide.");return}
  if(!confirm("Créer une prise en charge (réparation en boutique) avec ce panier ?"))return;
  try{var r=await cartVersDevis();if(!r)return;var p=await api("/devis-simples/rattacher",{id:r.id});cartVide();DV.list=null;await ouvrirFiche(p.reparationId)}catch(e){alert(e.message)}};
ACTS.dvSerieSave=async function(b){dvLire();btnFlash(b,"Enregistrement…");try{var r=await api("/devis-simples/series",{id:DV.ed.id,series:DV.ed.lignes.map(function(l){return l.series||""})});DV.msg=r.message;DV.list=null;render()}catch(e){render();alert(e.message)}};
ACTS.dvFactCC=async function(){try{FICHE=await api("/reparation?id="+DV.ed.reparationId);await ACTS.facturer({dataset:{}})}catch(e){alert(e.message)}};
ACTS.dvConvPC=async function(){try{await api("/devis-simples/commande-client",{repairId:DV.ed.reparationId,valeur:false});var id=DV.ed.reparationId;DV.list=null;DV.ed=null;await ouvrirFiche(id)}catch(e){alert(e.message)}};
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
