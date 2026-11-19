export const COMMANDES = `// ---------- Commandes fournisseurs ----------
var CMD=null,CMDMSG="",RE=null;
function nlc(){return String.fromCharCode(10)}
function texteCommande(f){
  var nl=nlc();
  return"Bonjour,"+nl+nl+"Merci de préparer la commande suivante pour TURN SOCIETY :"+nl+f.panier.map(function(l){return"- "+l.quantite+" x "+l.libelle+(l.sku?" (réf. "+l.sku+")":"")}).join(nl)+nl+nl+"Cordialement,"+nl+"TURN SOCIETY"}
function csvCommande(f){var nl=nlc();return"libelle;reference;quantite"+nl+f.panier.map(function(l){return'"'+l.libelle.replace(/"/g,"")+'";'+(l.sku||"")+";"+l.quantite}).join(nl)}
function trouveF(id){return(CMD&&CMD.fournisseurs||[]).filter(function(f){return f.id===id})[0]}
function refsCmd(l){
  var h="";
  if(l.sku)h+="<div class='muted'>SKU "+esc(l.sku)+" <button class='link' data-act='copier' data-t='"+esc(l.sku)+"' data-l='Copier le SKU'>Copier le SKU</button></div>";
  if(l.barcode)h+="<div class='muted'>Code-barres "+esc(l.barcode)+" <button class='link' data-act='copier' data-t='"+esc(l.barcode)+"' data-l='Copier'>Copier</button></div>";
  if(!l.sku&&!l.barcode)h+="<div class='muted'>Pas de SKU ni de code-barres <button class='link' data-act='copier' data-t='"+esc(l.libelle)+"' data-l='Copier le nom'>Copier le nom</button></div>";
  return h}
function ligneCmd(l,mode){
  var h="<tr><td>"+(l.commandeId&&mode!=="panier"?"<span class='tag'>"+cmdNum(l.commandeId)+"</span> ":"")+esc(l.libelle)+refsCmd(l)+(l.client?"<div class='muted'>Pour "+esc(l.client)+(l.reparationId?" (fiche "+l.reparationId+")":"")+"</div>":"")+"</td>";
  if(mode==="panier")h+="<td class='n'><input type='number' min='1' value='"+l.quantite+"' data-act='cmdQte' data-id='"+l.id+"'></td><td class='n'><button class='link' data-act='cmdDel' data-id='"+l.id+"'>Retirer</button></td>";
  else if(mode==="commandee")h+="<td class='n'>"+l.quantite+"</td><td class='n'><button data-act='cmdRecevoir' data-id='"+l.id+"'>Réceptionner</button></td>";
  else h+="<td class='n'>"+l.quantite+"</td><td class='n'><span class='tag ok'>Reçu</span></td>";
  return h+"</tr>"}
function vCmd(){
  if(!CMD){app.innerHTML="<div class='card'>Chargement…</div>";api("/achats").then(function(d){return api("/stock/reappro?magasin="+encodeURIComponent(MAG||"")).then(function(r){RE=r;return d}).catch(function(){RE=null;return d})}).then(function(d){CMD=d;render()}).catch(function(e){app.innerHTML="<div class='card'>"+esc(e.message)+"</div>"});return}
  var h="<div class='pmsg'>"+esc(CMDMSG)+"</div><div class='card'><div class='step'>Nouveau fournisseur</div><div class='dl'><input id='fn' class='lb' placeholder='Nom (ex : eWheel)'><input id='fe' class='lb' placeholder='Email pour les commandes'><button data-act='fAdd'>Ajouter</button></div></div>";
  if(RE&&RE.produits.length){
    h+="<div class='card'><div class='step'>À recommander : stock minimum atteint ("+RE.produits.length+")</div><div class='muted'>Suggestion pour "+esc(RE.magasin)+". Choisis le fournisseur et ajoute au panier.</div>";
    RE.produits.forEach(function(p){
      h+="<div class='dl' style='margin-top:6px;align-items:center'><div class='lb'><b>"+esc(p.nom)+"</b><div class='muted'>"+p.qte+" en stock / minimum "+p.min+(p.enCommande?" · "+p.enCommande+" déjà en commande":"")+(p.emplacement?" · "+esc(p.emplacement):"")+"</div></div>"
        +"<input id='rq-"+p.id+"' class='q' type='number' min='1' value='"+p.aCommander+"' title='Quantité à commander'>"
        +"<select id='rf-"+p.id+"'>"+CMD.fournisseurs.map(function(f){return"<option value='"+f.id+"'>"+esc(f.nom)+"</option>"}).join("")+"</select>"
        +"<button data-act='cmdReappro' data-id='"+p.id+"'>Ajouter au panier</button></div>"});
    h+="</div>"}
  if(!CMD.fournisseurs.length)h+="<div class='card'>Ajoute ton premier fournisseur ci-dessus (eWheel, ...). Chaque fournisseur a son panier.</div>";
  CMD.fournisseurs.forEach(function(f){
    h+="<div class='card'><div class='head'><div class='big'>"+esc(f.nom)+"</div><div class='dl'><input id='fe-"+f.id+"' value='"+esc(f.email)+"' placeholder='Email de commande' class='lb'><button class='sec' data-act='fMail' data-id='"+f.id+"'>Enregistrer l'email</button></div></div>";
    if(REC&&REC.fid===f.id)h+=recepHtml(f);
    h+="<div class='actions' style='margin-top:6px'><button class='sec' data-act='histoOpen' data-id='"+f.id+"'>"+(HISTC&&HISTC.fid===f.id?"Masquer l'historique":"Historique des commandes")+"</button></div>"+(HISTC&&HISTC.fid===f.id?histoCmdHtml():"");
    h+="<div class='step' style='margin-top:10px'>Panier ("+f.panier.length+")</div>";
    if(f.panier.length)h+="<table class='devis' style='width:100%'><tr><th>Produit</th><th class='n'>Qté</th><th></th></tr>"+f.panier.map(function(l){return ligneCmd(l,"panier")}).join("")+"</table>";
    else h+="<div class='muted'>Panier vide.</div>";
    h+="<div style='margin-top:8px'>"+prodBox("cmd"+f.id)+"</div><div class='dl' style='margin-top:6px'><input id='cl-"+f.id+"' class='lb' placeholder='Ou saisie libre : produit / référence'><input id='cq-"+f.id+"' class='q' type='number' min='1' value='1'><button class='sec' data-act='cmdLigne' data-id='"+f.id+"'>Ajouter</button></div>";
    if(f.panier.length)h+="<div class='actions'><button data-act='cmdPasser' data-id='"+f.id+"'>Marquer comme commandé</button><button class='sec' data-act='cmdCopy' data-id='"+f.id+"'>Copier la commande</button><button class='sec' data-act='cmdCsv' data-id='"+f.id+"'>Télécharger (CSV)</button>"
      +(f.email?"<a class='btn' href='mailto:"+esc(f.email)+"?subject="+encodeURIComponent("Commande TURN SOCIETY")+"&body="+encodeURIComponent(texteCommande(f))+"'>Envoyer par email</a>":"")+"</div><div class='muted'>L'envoi direct par l'API du fournisseur s'ajoute fournisseur par fournisseur.</div>";
    if(f.commandees.length){h+="<div class='step' style='margin-top:12px'>Commandé, en attente de réception ("+f.commandees.length+")</div><table class='devis' style='width:100%'><tr><th>Produit</th><th class='n'>Qté</th><th></th></tr>"+f.commandees.map(function(l){return ligneCmd(l,"commandee")}).join("")+"</table><div class='actions'><button data-act='recOpen' data-id='"+f.id+"'>Réceptionner (scan)</button><button class='sec' data-act='cmdRecevoirTout' data-id='"+f.id+"'>Tout réceptionner</button></div>"}
    if(f.recues.length)h+="<div class='step' style='margin-top:12px'>Reçu cette semaine</div><table class='devis' style='width:100%'>"+f.recues.map(function(l){return ligneCmd(l,"recue")}).join("")+"</table>"
    if(f.recues.length)h+=ecHtml(f);
    h+="</div>"});
  app.innerHTML=h}
function cmdRun(p,msg){return p.then(function(d){HISTC=null;CMDMSG=(d&&d.message)||msg||"";CMD=null;render()}).catch(function(e){CMDMSG=e.message;render()})}
ACTS.cmdReappro=function(b){var id=+b.dataset.id,f=document.getElementById("rf-"+id);if(!f||!f.value){CMDMSG="Ajoute d'abord un fournisseur.";render();return}cmdRun(api("/stock/reappro/ajouter",{id:id,fournisseurId:+f.value,quantite:v("rq-"+id)}))};
ACTS.fAdd=function(){cmdRun(api("/achats/fournisseur",{nom:v("fn"),email:v("fe")}))};
ACTS.fMail=function(b){cmdRun(api("/achats/fournisseur/modifier",{id:+b.dataset.id,email:v("fe-"+b.dataset.id)}))};
ACTS.cmdLigne=function(b){var id=+b.dataset.id;cmdRun(api("/achats/ligne",{fournisseurId:id,libelle:v("cl-"+id),quantite:v("cq-"+id)}))};
ACTS.cmdDel=function(b){cmdRun(api("/achats/ligne/supprimer",{id:+b.dataset.id}))};
ACTS.cmdPasser=function(b){if(!confirm("Marquer ce panier comme commandé ? (pense à l'avoir envoyé au fournisseur)"))return;cmdRun(api("/achats/commander",{fournisseurId:+b.dataset.id}))};
ACTS.cmdRecevoir=function(b){cmdRun(api("/achats/recevoir",{id:+b.dataset.id}))};
ACTS.cmdRecevoirTout=function(b){var f=trouveF(+b.dataset.id);if(!f)return;cmdRun(api("/achats/recevoir",{ids:f.commandees.map(function(l){return l.id})}))};
ACTS.cmdCopy=function(b){var f=trouveF(+b.dataset.id);if(!f)return;var t=texteCommande(f);
  if(navigator.clipboard)navigator.clipboard.writeText(t).then(function(){CMDMSG="Commande copiée.";render()},function(){alert(t)});else alert(t)};
ACTS.cmdCsv=function(b){var f=trouveF(+b.dataset.id);if(!f)return;
  var blob=new Blob([csvCommande(f)],{type:"text/csv"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="commande-"+f.nom.replace(/[^a-z0-9]+/gi,"-")+".csv";document.body.appendChild(a);a.click();a.remove()};
document.addEventListener("change",function(e){var t=e.target;if(!t||!t.dataset||t.dataset.act!=="cmdQte")return;api("/achats/ligne/maj",{id:+t.dataset.id,quantite:t.value}).then(function(){CMD=null;CMDMSG="";}).catch(function(err){CMDMSG=err.message})});
ACTS.aCommander=async function(b){
  try{var r=await api("/achats/depuis-devis",{devisLigneId:+b.dataset.id});
    if(r.choix){
      var fs=r.fournisseurs;
      if(!fs.length){alert("Crée d'abord un fournisseur dans l'onglet Commandes.");TAB="cmd";CMD=null;FICHE=null;render();return}
      var rep=prompt("Quel fournisseur ? Tape le numéro :"+nlc()+fs.map(function(x,i){return(i+1)+" = "+x.nom}).join(nlc()),"1");if(!rep)return;
      var f=fs[(+rep)-1];if(!f){alert("Numéro inconnu.");return}
      r=await api("/achats/depuis-devis",{devisLigneId:+b.dataset.id,fournisseurId:f.id})}
    DEVHINT=r.message||"";CMD=null;await recharger(FICHE.id)}catch(e){alert(e.message)}};
// ---------- Historique des commandes fournisseur ----------
var HISTC=null;
function dateHeure(d){try{var x=new Date(d);return x.toLocaleDateString("fr-FR")+" à "+x.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}catch(e){return d||""}}
ACTS.histoOpen=async function(b){var id=+b.dataset.id;if(HISTC&&HISTC.fid===id){HISTC=null;render();return}
  try{var g=await api("/achats/historique?fournisseurId="+id);HISTC={fid:id,groupes:g};render()}catch(e){alert(e.message)}};
function cmdNum(id){return"CMD-"+("0000"+id).slice(-4)}
var HISTOPEN=0;
ACTS.histoCmd=function(b){var id=+b.dataset.id;HISTOPEN=HISTOPEN===id?0:id;render()};
function histoCmdHtml(){
  var g=HISTC.groupes;
  if(!g.length)return"<div class='card'><div class='muted'>Aucune commande passée avec ce fournisseur pour l'instant.</div></div>";
  return"<div class='card'><div class='step'>Historique des commandes</div><div class='muted'>Clique sur une commande pour voir ce qui a été commandé.</div>"+g.map(function(c){
    var tout=c.lignes.every(function(l){return l.statut==="recue"}),nb=c.lignes.reduce(function(s,l){return s+l.quantite},0),ouvert=HISTOPEN===c.id;
    var h="<button class='sec hrow' data-act='histoCmd' data-id='"+c.id+"'><b>"+cmdNum(c.id)+"</b> · "+esc(dateHeure(c.date))+" · "+nb+" article"+(nb>1?"s":"")+" <span class='tag "+(tout?"ok":"warn")+"'>"+(tout?"Reçue en entier":"En attente")+"</span></button>";
    if(ouvert)h+="<div class='card' style='margin:0 0 8px'><b>Commande "+cmdNum(c.id)+"</b> du "+esc(dateHeure(c.date))
      +"<table class='devis' style='width:100%'><tr><th>Produit</th><th class='n'>Qté</th><th></th></tr>"+c.lignes.map(function(l){return"<tr><td>"+esc(l.libelle)+refsCmd(l)+(l.client?"<div class='muted'>Pour "+esc(l.client)+(l.reparationId?" ("+pcn(l.reparationId)+")":"")+"</div>":"")+"</td><td class='n'>"+esc(l.quantite)+"</td><td class='n'>"+(l.statut==="recue"?"<span class='tag ok'>Reçue le "+esc(day(l.recueLe))+"</span>":"<span class='tag warn'>Commandée</span>")+"</td></tr>"}).join("")+"</table></div>";
    return h}).join("")+"</div>"}
// ---------- Réception par scan ----------
var REC=null;
function recNorm(c){return String(c||"").trim().toLowerCase()}
ACTS.recOpen=function(b){REC={fid:+b.dataset.id,scans:{},bad:[],msg:"Scanne les produits reçus."};render();setTimeout(function(){var i=document.getElementById("rc");if(i)i.focus()},50)};
ACTS.recClose=function(){REC=null;render()};
ACTS.recPlus=function(b){if(!REC)return;var id=b.dataset.id;REC.scans[id]=(REC.scans[id]||0)+1;render()};
ACTS.recMoins=function(b){if(!REC)return;var id=b.dataset.id;REC.scans[id]=Math.max(0,(REC.scans[id]||0)-1);render()};
async function recepScan(code){
  var f=REC&&trouveF(REC.fid);if(!f)return;
  var c=recNorm(code),ligne=f.commandees.filter(function(l){return(l.barcode&&recNorm(l.barcode)===c)||(l.sku&&recNorm(l.sku)===c)})[0];
  if(!ligne){
    try{var r=await api("/code?q="+encodeURIComponent(code));
      if(r.produit)ligne=f.commandees.filter(function(l){return l.variantId&&l.variantId===r.produit.variantId})[0]}catch(e){}}
  if(ligne){REC.scans[ligne.id]=(REC.scans[ligne.id]||0)+1;REC.msg="✓ "+ligne.libelle}
  else{REC.bad.push(code);REC.msg="✗ Code "+code+" : pas dans cette commande"}
  render();setTimeout(function(){var i=document.getElementById("rc");if(i)i.focus()},50)}
var ECMD={fid:0,sel:null,msg:""};
function ecHtml(f){
  var h="<div class='card' style='margin-top:10px;background:#fafafa'><div class='step'>Étiquettes des produits reçus</div><div class='actions'>"
    +"<button data-act='ecUn' data-id='"+f.id+"'>Tout en 1 exemplaire</button>"
    +"<button data-act='ecQte' data-id='"+f.id+"'>Tout selon les quantités</button>"
    +"<button class='sec' data-act='ecChoix' data-id='"+f.id+"'>Choisir les étiquettes</button></div>";
  if(ECMD.fid===f.id&&ECMD.sel){
    h+="<table class='devis' style='width:100%;margin-top:8px'><tr><th></th><th>Produit</th><th class='n'>Étiquettes</th></tr>"+f.recues.map(function(l){
      var on=ECMD.sel[l.id]!==undefined;
      return"<tr><td><input type='checkbox' data-act='ecChk' data-id='"+l.id+"'"+(on?" checked":"")+"></td><td>"+esc(l.libelle)+"</td><td class='n'><input type='number' min='1' max='200' style='width:70px' data-act='ecNb' data-id='"+l.id+"' value='"+(on?ECMD.sel[l.id]:l.quantite)+"'></td></tr>"}).join("")+"</table>"
      +"<div class='actions'><button data-act='ecSel' data-id='"+f.id+"'>Créer les étiquettes cochées</button></div>"}
  if(ECMD.msg&&ECMD.fid===f.id)h+="<div class='muted'>"+esc(ECMD.msg)+"</div>";
  return h+"</div>"}
async function ecCreer(f,mode){
  var L=f.recues.filter(function(l){return mode!=="sel"||ECMD.sel[l.id]!==undefined});
  if(!L.length){ECMD.msg="Coche au moins un produit.";render();return}
  ECMD.fid=f.id;ECMD.msg="Préparation des étiquettes...";render();
  for(var i=0;i<L.length;i++){
    var l=L[i],code=l.barcode||l.sku||"",prix="0",titre=l.libelle;
    var nb=mode==="un"?1:mode==="qte"?l.quantite:ECMD.sel[l.id];
    try{
      if(code){var r=await api("/code?q="+encodeURIComponent(code));
        if(r.produit&&r.produit.prix!==undefined)prix=String(r.produit.prix);
        else{var lc=await api("/stock/scan",{magasin:MAG||"",code:code,local:true});if(lc.produit)prix=(lc.produit.prixCents/100).toFixed(2)}}
    }catch(e){}
    ETQ.push({titre:titre,prix:prix,barcode:l.barcode||"",sku:l.sku||"",qte:Math.max(1,Math.min(200,nb||1))})}
  ECMD.msg="";ECMD.sel=null;TAB="etq";render()}
ACTS.ecUn=function(b){var f=trouveF(+b.dataset.id);if(f)ecCreer(f,"un")};
ACTS.ecQte=function(b){var f=trouveF(+b.dataset.id);if(f)ecCreer(f,"qte")};
ACTS.ecChoix=function(b){var id=+b.dataset.id,f=trouveF(id);if(!f)return;ECMD.fid=id;ECMD.sel={};f.recues.forEach(function(l){ECMD.sel[l.id]=l.quantite});render()};
ACTS.ecSel=function(b){var f=trouveF(+b.dataset.id);if(f)ecCreer(f,"sel")};
document.addEventListener("change",function(e){var t=e.target;if(!t||!t.dataset||!ECMD.sel)return;
  if(t.dataset.act==="ecChk"){var id=+t.dataset.id;if(t.checked){var n=document.querySelector("input[data-act=ecNb][data-id='"+id+"']");ECMD.sel[id]=Math.max(1,Number(n&&n.value)||1)}else delete ECMD.sel[id]}
  if(t.dataset.act==="ecNb"&&ECMD.sel[+t.dataset.id]!==undefined)ECMD.sel[+t.dataset.id]=Math.max(1,Math.min(200,Number(t.value)||1))});

function recepHtml(f){
  var ok=0,manque=[],trop=[];
  var rows=f.commandees.map(function(l){
    var n=REC.scans[l.id]||0,st;
    if(n===l.quantite){ok++;st="<span class='tag ok'>OK</span>"}
    else if(n>l.quantite){trop.push(l.libelle+" ("+n+" scannés pour "+l.quantite+")");st="<span class='tag warn'>En trop</span>"}
    else{manque.push(l.libelle+" ("+n+"/"+l.quantite+")");st="<span class='tag warn'>Manque "+(l.quantite-n)+"</span>"}
    return"<tr><td>"+esc(l.libelle)+refsCmd(l)+"</td><td class='n'>"+n+" / "+l.quantite+"</td><td class='n'>"+st+" <button class='sec' data-act='recMoins' data-id='"+l.id+"'>-</button> <button class='sec' data-act='recPlus' data-id='"+l.id+"'>+</button></td></tr>"}).join("");
  var tout=!manque.length&&!trop.length&&!REC.bad.length;
  var h="<div class='card' style='border:2px solid #111'><div class='step'>Réception de la commande "+esc(f.nom)+"</div>"
    +"<div class='dl'><input id='rc' class='lb' placeholder='Scanne un produit (ou tape le code puis Entrée)' autocomplete='off'><button data-act='recClose' class='sec'>Fermer</button></div>"
    +"<div class='muted'>"+esc(REC.msg)+"</div>"
    +"<table class='devis' style='width:100%'><tr><th>Produit</th><th class='n'>Scanné</th><th></th></tr>"+rows+"</table>";
  if(tout)h+="<div class='rec-ok'><b>✅ Tout est bon : la commande est complète.</b></div>";
  else{
    h+="<div class='rec-ko'><b>⚠ Écarts :</b>";
    if(manque.length)h+="<div>Manquant : "+esc(manque.join(" ; "))+"</div>";
    if(trop.length)h+="<div>En trop : "+esc(trop.join(" ; "))+"</div>";
    if(REC.bad.length)h+="<div>Hors commande : "+esc(REC.bad.join(", "))+"</div>";
    h+="</div>"}
  h+="<div class='actions'><button data-act='recValide'"+(ok?"":" disabled")+">Valider la réception ("+ok+" ligne"+(ok>1?"s":"")+" complète"+(ok>1?"s":"")+")</button></div>"
    +"<div class='muted'>Seules les lignes complètes sont réceptionnées. Le reste reste « commandé ».</div></div>";
  return h}
ACTS.recValide=function(){
  var f=REC&&trouveF(REC.fid);if(!f)return;
  var ids=f.commandees.filter(function(l){return(REC.scans[l.id]||0)===l.quantite}).map(function(l){return l.id});
  if(!ids.length)return;
  REC=null;cmdRun(api("/achats/recevoir",{ids:ids}))};
document.addEventListener("keydown",function(e){var t=e.target;if(t&&t.id==="rc"&&e.key==="Enter"){var c=t.value.trim();t.value="";if(c)recepScan(c)}});
ACTS.clientPrevenu=function(b){api("/reparations/client-prevenu",{repairId:+b.dataset.id}).then(function(){return recharger(+b.dataset.id)}).catch(function(e){alert(e.message)})};
`;
