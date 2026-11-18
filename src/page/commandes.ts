export const COMMANDES = `// ---------- Commandes fournisseurs ----------
var CMD=null,CMDMSG="";
function nlc(){return String.fromCharCode(10)}
function texteCommande(f){
  var nl=nlc();
  return"Bonjour,"+nl+nl+"Merci de préparer la commande suivante pour TURN SOCIETY :"+nl+f.panier.map(function(l){return"- "+l.quantite+" x "+l.libelle+(l.sku?" (réf. "+l.sku+")":"")}).join(nl)+nl+nl+"Cordialement,"+nl+"TURN SOCIETY"}
function csvCommande(f){var nl=nlc();return"libelle;reference;quantite"+nl+f.panier.map(function(l){return'"'+l.libelle.replace(/"/g,"")+'";'+(l.sku||"")+";"+l.quantite}).join(nl)}
function trouveF(id){return(CMD&&CMD.fournisseurs||[]).filter(function(f){return f.id===id})[0]}
function ligneCmd(l,mode){
  var h="<tr><td>"+esc(l.libelle)+(l.sku?" <span class='muted'>"+esc(l.sku)+"</span>":"")+(l.client?"<div class='muted'>Pour "+esc(l.client)+(l.reparationId?" (fiche "+l.reparationId+")":"")+"</div>":"")+"</td>";
  if(mode==="panier")h+="<td class='n'><input type='number' min='1' value='"+l.quantite+"' data-act='cmdQte' data-id='"+l.id+"'></td><td class='n'><button class='link' data-act='cmdDel' data-id='"+l.id+"'>Retirer</button></td>";
  else if(mode==="commandee")h+="<td class='n'>"+l.quantite+"</td><td class='n'><button data-act='cmdRecevoir' data-id='"+l.id+"'>Réceptionner</button></td>";
  else h+="<td class='n'>"+l.quantite+"</td><td class='n'><span class='tag ok'>Reçu</span></td>";
  return h+"</tr>"}
function vCmd(){
  if(!CMD){app.innerHTML="<div class='card'>Chargement…</div>";api("/achats").then(function(d){CMD=d;render()}).catch(function(e){app.innerHTML="<div class='card'>"+esc(e.message)+"</div>"});return}
  var h="<div class='pmsg'>"+esc(CMDMSG)+"</div><div class='card'><div class='step'>Nouveau fournisseur</div><div class='dl'><input id='fn' class='lb' placeholder='Nom (ex : eWheel)'><input id='fe' class='lb' placeholder='Email pour les commandes'><button data-act='fAdd'>Ajouter</button></div></div>";
  if(!CMD.fournisseurs.length)h+="<div class='card'>Ajoute ton premier fournisseur ci-dessus (eWheel, ...). Chaque fournisseur a son panier.</div>";
  CMD.fournisseurs.forEach(function(f){
    h+="<div class='card'><div class='head'><div class='big'>"+esc(f.nom)+"</div><div class='dl'><input id='fe-"+f.id+"' value='"+esc(f.email)+"' placeholder='Email de commande' class='lb'><button class='sec' data-act='fMail' data-id='"+f.id+"'>Enregistrer l'email</button></div></div>";
    h+="<div class='step' style='margin-top:10px'>Panier ("+f.panier.length+")</div>";
    if(f.panier.length)h+="<table class='devis' style='width:100%'><tr><th>Produit</th><th class='n'>Qté</th><th></th></tr>"+f.panier.map(function(l){return ligneCmd(l,"panier")}).join("")+"</table>";
    else h+="<div class='muted'>Panier vide.</div>";
    h+="<div style='margin-top:8px'>"+prodBox("cmd"+f.id)+"</div><div class='dl' style='margin-top:6px'><input id='cl-"+f.id+"' class='lb' placeholder='Ou saisie libre : produit / référence'><input id='cq-"+f.id+"' class='q' type='number' min='1' value='1'><button class='sec' data-act='cmdLigne' data-id='"+f.id+"'>Ajouter</button></div>";
    if(f.panier.length)h+="<div class='actions'><button data-act='cmdPasser' data-id='"+f.id+"'>Marquer comme commandé</button><button class='sec' data-act='cmdCopy' data-id='"+f.id+"'>Copier la commande</button><button class='sec' data-act='cmdCsv' data-id='"+f.id+"'>Télécharger (CSV)</button>"
      +(f.email?"<a class='btn' href='mailto:"+esc(f.email)+"?subject="+encodeURIComponent("Commande TURN SOCIETY")+"&body="+encodeURIComponent(texteCommande(f))+"'>Envoyer par email</a>":"")+"</div><div class='muted'>L'envoi direct par l'API du fournisseur s'ajoute fournisseur par fournisseur.</div>";
    if(f.commandees.length){h+="<div class='step' style='margin-top:12px'>Commandé, en attente de réception ("+f.commandees.length+")</div><table class='devis' style='width:100%'><tr><th>Produit</th><th class='n'>Qté</th><th></th></tr>"+f.commandees.map(function(l){return ligneCmd(l,"commandee")}).join("")+"</table><div class='actions'><button class='sec' data-act='cmdRecevoirTout' data-id='"+f.id+"'>Tout réceptionner</button></div>"}
    if(f.recues.length)h+="<div class='step' style='margin-top:12px'>Reçu cette semaine</div><table class='devis' style='width:100%'>"+f.recues.map(function(l){return ligneCmd(l,"recue")}).join("")+"</table>";
    h+="</div>"});
  app.innerHTML=h}
function cmdRun(p,msg){return p.then(function(d){CMDMSG=(d&&d.message)||msg||"";CMD=null;render()}).catch(function(e){CMDMSG=e.message;render()})}
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
  try{var d=await api("/achats");var fs=d.fournisseurs;
    if(!fs.length){alert("Crée d'abord un fournisseur dans l'onglet Commandes.");TAB="cmd";CMD=d;FICHE=null;render();return}
    var f=fs[0];
    if(fs.length>1){var rep=prompt("Quel fournisseur ? Tape le numéro :"+nlc()+fs.map(function(x,i){return(i+1)+" = "+x.nom}).join(nlc()),"1");if(!rep)return;f=fs[(+rep)-1];if(!f){alert("Numéro inconnu.");return}}
    var r=await api("/achats/depuis-devis",{devisLigneId:+b.dataset.id,fournisseurId:f.id});CMD=null;await recharger(FICHE.id)}catch(e){alert(e.message)}};
ACTS.clientPrevenu=function(b){api("/reparations/client-prevenu",{repairId:+b.dataset.id}).then(function(){return recharger(+b.dataset.id)}).catch(function(e){alert(e.message)})};
`;
