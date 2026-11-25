export const GARANTIE = `// ----- Garantie fournisseur : RMA, PDF, demande faite + relances -----
var GAR=null;
function garLoad(id){api("/garantie/"+id).then(function(d){if(GAR&&GAR.id===id){GAR.d=d;render()}}).catch(function(e){if(GAR&&GAR.id===id){GAR.msg=e.message;GAR.d={rma:"",demandeLe:null,close:false,relanceLe:null,delai:7,pdfs:[]};render()}})}
function garMaj(){if(GAR){var id=GAR.id;GAR.d=null;render();garLoad(id)}}
function garTaille(n){return n>1048576?(n/1048576).toFixed(1).split(".").join(",")+" Mo":Math.max(1,Math.round(n/1024))+" Ko"}
function garJour(x){return new Date(x).toLocaleDateString("fr-FR")}
function pdfLigne(p){return"<div class='hist'><button class='link' data-act='garPdf' data-id='"+p.id+"'>"+esc(p.nom)+"</button> · "+garTaille(p.taille)+" · "+esc(p.par||"")+" · "+esc(garJour(p.le))+" <button class='link' data-act='garPdfDel' data-id='"+p.id+"'>Supprimer</button></div>"}
function facturesAchatHtml(f){
  if(!GAR||GAR.id!==f.id){GAR={id:f.id,d:null,msg:""};garLoad(f.id)}
  var d=GAR.d;if(!d)return"<div class='card'><div class='step'>Factures d'achat</div><div class='muted'>Chargement...</div></div>";
  var cl=d.pdfs.filter(function(p){return p.type==="facture_client"}),fo=d.pdfs.filter(function(p){return p.type==="facture_fournisseur"}),au=d.pdfs.filter(function(p){return p.type!=="facture_client"&&p.type!=="facture_fournisseur"});
  var h="<div class='card'><div class='step'>Factures d'achat</div><div class='muted'>Garde ici les justificatifs d'achat : plus besoin de chercher dans les mails.</div>"
    +"<div class='step' style='margin-top:10px'>Facture d'achat du client</div>"+(cl.length?cl.map(pdfLigne).join(""):"<div class='muted'>Aucune.</div>")+"<div class='dl'><input type='file' id='gar-file-facture_client' accept='application/pdf'></div>"
    +"<div class='step' style='margin-top:10px'>Facture d'achat fournisseur</div>"+(fo.length?fo.map(pdfLigne).join(""):"<div class='muted'>Aucune.</div>")+"<div class='dl'><input type='file' id='gar-file-facture_fournisseur' accept='application/pdf'></div>";
  if(au.length)h+="<div class='step' style='margin-top:10px'>Autres PDF</div>"+au.map(pdfLigne).join("");
  if(GAR.msg)h+="<div class='muted'>"+esc(GAR.msg)+"</div>";
  return h+"</div>"}
function garantieHtml(f){
  if(!f.sousGarantie)return"";
  if(!GAR||GAR.id!==f.id){GAR={id:f.id,d:null,msg:""};garLoad(f.id)}
  var d=GAR.d;if(!d)return"<div class='card'><div class='step'>Garantie fournisseur</div><div class='muted'>Chargement...</div></div>";
  var h="<div class='card'><div class='step'>Garantie fournisseur</div>"
    +"<div class='dl'><label class='muted'>N° RMA (facultatif)</label><input id='gar-rma' value='"+esc(d.rma)+"' placeholder='N° de retour fournisseur'><button class='sec' data-act='garRma' data-id='"+f.id+"'>Enregistrer</button></div>";
  if(!d.demandeLe)h+="<div class='actions'><button data-act='garDemande' data-id='"+f.id+"' data-e='faite'>Demande faite au fournisseur</button></div><div class='muted'>Une relance sera ajoutée dans la to-do tous les "+d.delai+" jours (réglable dans Paramètres).</div>";
  else if(d.close)h+="<div><span class='tag ok'>Dossier clôturé</span> demande faite le "+esc(garJour(d.demandeLe))+"</div><div class='actions'><button class='sec' data-act='garDemande' data-id='"+f.id+"' data-e='faite'>Relancer le suivi</button></div>";
  else h+="<div><span class='tag warn'>Demande faite</span> le "+esc(garJour(d.demandeLe))+(d.relanceLe?" · prochaine relance le "+esc(d.relanceLe.slice(8,10)+"/"+d.relanceLe.slice(5,7)):"")+"</div>"
    +"<div class='actions'><button data-act='garDemande' data-id='"+f.id+"' data-e='close'>Réponse reçue : arrêter les relances</button><button class='sec' data-act='garDemande' data-id='"+f.id+"' data-e='annulee'>Annuler la demande</button></div>";
  if(GAR.msg)h+="<div class='muted'>"+esc(GAR.msg)+"</div>";
  return h+"</div>"}
ACTS.garRma=function(b){var i=document.getElementById("gar-rma");api("/garantie/rma",{repairId:+b.dataset.id,rma:i?i.value:""}).then(function(d){GAR.msg=d.message;garMaj()}).catch(function(e){alert(e.message)})};
ACTS.garDemande=function(b){
  if(b.dataset.e==="annulee"&&!confirm("Annuler la demande et supprimer les relances ?"))return;
  api("/garantie/demande",{repairId:+b.dataset.id,etat:b.dataset.e}).then(function(){GAR.msg="";TACH=null;TACHBUSY=false;garMaj();if(FICHE)recharger(FICHE.id)}).catch(function(e){alert(e.message)})};
ACTS.garPdf=function(b){
  var w=window.open("","_blank");
  var h={};if(TOK)h["x-atelier-token"]=TOK;else h["x-atelier-password"]=PW;
  fetch("/api/garantie/pdf/"+b.dataset.id+"/fichier",{headers:h}).then(function(r){if(!r.ok)throw new Error("PDF introuvable");return r.blob()}).then(function(bl){var u=URL.createObjectURL(bl);if(w)w.location=u;else window.location=u}).catch(function(e){if(w)w.close();alert(e.message)})};
ACTS.garPdfDel=function(b){if(!confirm("Supprimer ce PDF ?"))return;api("/garantie/pdf/supprimer",{id:+b.dataset.id}).then(function(){garMaj()}).catch(function(e){alert(e.message)})};
document.addEventListener("change",function(e){
  var t=e.target;if(!t||String(t.id).indexOf("gar-file")!==0||!t.files||!t.files[0]||!GAR)return;
  var fl=t.files[0];
  if(fl.size>8*1024*1024){alert("PDF trop lourd (8 Mo maximum).");t.value="";return}
  var rd=new FileReader();
  rd.onload=function(){var data=String(rd.result).split(",")[1]||"";GAR.msg="Envoi du PDF...";render();
    api("/garantie/pdf",{repairId:GAR.id,nom:fl.name,data:data,type:String(t.id).replace("gar-file-","")}).then(function(d){GAR.msg=d.message;garMaj()}).catch(function(er){GAR.msg=er.message;render()})};
  rd.readAsDataURL(fl)});
// ----- Fiche d'un dossier garantie pièce (chargeur, pièce détachée...) : ticket, infos, factures d'achat, journal -----
var SVF=null;
function svLoad(id){api("/sav/dossier/"+id).then(function(d){if(SVF&&SVF.id===id){SVF.d=d;render()}}).catch(function(e){alert(e.message);SVF=null;render()})}
function svMaj(){if(SVF){var id=SVF.id;SVF.d=null;render();svLoad(id)}}
function svPdfLigne(p){return"<div class='hist'><button class='link' data-act='svPdf' data-id='"+p.id+"'>"+esc(p.nom)+"</button> · "+garTaille(p.taille)+" · "+esc(p.par||"")+" · "+esc(garJour(p.le))+" <button class='link' data-act='svPdfDel' data-id='"+p.id+"'>Supprimer</button></div>"}
function vSavFiche(){
  if(!SVF.d){app.innerHTML="<button class='sec' data-act='svBack' style='max-width:260px'>← Retour aux pièces garantie</button><div class='card'>Chargement…</div>";return}
  var d=SVF.d,x=d.dossier,v=d.vente;
  var etat=x.statut==="a_traiter"?"À traiter : faire la demande au fournisseur":x.statut==="demande_faite"?"Demande faite"+(x.demandeLe?" le "+garJour(x.demandeLe):"")+(x.relanceLe?" · prochaine relance le "+esc(savDate(x.relanceLe)):""):x.statut==="termine"?(x.issue==="piece_recue"?"Terminé : pièce reçue":x.issue==="rembourse_fournisseur"?"Terminé : remboursé par le fournisseur":x.issue==="refus"?"Terminé : refusé":"Terminé"):"Annulé";
  var h="<button class='sec' data-act='svBack' style='max-width:260px'>← Retour aux pièces garantie</button>"
    +"<div class='card'><div class='head'><div><b style='font-size:20px'>🛠 Garantie pièce · "+esc(x.libelle)+"</b><div class='muted'>"+(d.client?esc(d.client.name)+" · "+esc(d.client.phone||"pas de tél.")+" · "+esc(d.client.email||"pas d'email"):"Sans client")+(v?" · Facture "+esc(v.numero||"Ticket n° "+v.id):"")+"</div></div><span class='tag "+(x.statut==="termine"?"ok":"warn")+"'>"+esc(etat)+"</span></div>"
    +(d.client?"<div class='actions'><button class='sec' data-act='svClient' data-cid='"+d.client.id+"'>Voir le profil du client</button></div>":"")+"</div>";
  h+="<div style='display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start'>";
  h+="<div style='flex:0 1 360px;min-width:260px'>"+(v?recuHtml(v):"<div class='card muted'>Ticket introuvable.</div>")+"</div>";
  h+="<div style='flex:1 1 380px;min-width:300px'>";
  h+="<div class='card'><div class='step'>Dossier</div><div class='dl'><label class='muted'>Problème constaté</label><input id='sv-d-mot' value='"+esc(x.motif||"")+"'></div><div class='dl'><label class='muted'>Fournisseur</label><input id='sv-d-f' value='"+esc(x.fournisseur||"")+"' placeholder='Fournisseur'></div><div class='dl'><label class='muted'>N° RMA</label><input id='sv-d-r' value='"+esc(x.rma||"")+"' placeholder='N° de retour fournisseur'></div><div class='actions'><button class='sec' data-act='svInfos'>Enregistrer</button></div>";
  if(x.statut==="a_traiter")h+="<div class='actions'><button data-act='svAction' data-a='demande'>Demande faite au fournisseur</button><button class='sec' data-act='svAction' data-a='annule'>Annuler le dossier</button></div>";
  else if(x.statut==="demande_faite")h+="<div class='actions'><button class='sec' data-act='svAction' data-a='relance'>Relancé</button><button data-act='svAction' data-a='piece_recue'>✓ Pièce reçue</button><button data-act='svAction' data-a='rembourse_fournisseur'>✓ Remboursé</button><button class='sec' data-act='svAction' data-a='refus'>Refusé</button><button class='sec' data-act='svAction' data-a='annule'>Annuler</button></div>";
  h+="</div>";
  var cl=d.pdfs.filter(function(p){return p.type==="facture_client"}),fo=d.pdfs.filter(function(p){return p.type==="facture_fournisseur"}),au=d.pdfs.filter(function(p){return p.type!=="facture_client"&&p.type!=="facture_fournisseur"});
  h+="<div class='card'><div class='step'>Factures d'achat</div>"
    +"<div class='step' style='margin-top:6px'>Facture d'achat du client</div>"+(cl.length?cl.map(svPdfLigne).join(""):"<div class='muted'>Aucune.</div>")+"<div class='dl'><input type='file' id='sv-file-facture_client' accept='application/pdf'></div>"
    +"<div class='step' style='margin-top:10px'>Facture d'achat fournisseur</div>"+(fo.length?fo.map(svPdfLigne).join(""):"<div class='muted'>Aucune.</div>")+"<div class='dl'><input type='file' id='sv-file-facture_fournisseur' accept='application/pdf'></div>"
    +(au.length?"<div class='step' style='margin-top:10px'>Autres PDF</div>"+au.map(svPdfLigne).join(""):"")+(SVF.msg?"<div class='muted'>"+esc(SVF.msg)+"</div>":"")+"</div>";
  h+="<div class='card'><div class='step'>Historique du dossier</div><div class='dl'><input id='sv-note' placeholder='Ajouter une note (appel fournisseur, réponse...)'><button class='sec' data-act='svNote'>Ajouter</button></div>";
  if(!d.journal.length)h+="<div class='muted'>Rien pour l'instant.</div>";
  d.journal.slice().reverse().forEach(function(j){h+="<div class='hist'>"+esc(dateLongue(j.le))+(j.par?" · "+esc(j.par):"")+" · "+esc(j.texte)+"</div>"});
  h+="</div></div></div>";
  app.innerHTML=h}
ACTS.svOuvre=function(b){SVF={id:+b.dataset.id,d:null,msg:""};FICHE=null;TAB="enc";ATSUB="liste";render();svLoad(SVF.id);window.scrollTo(0,0)};
ACTS.svBack=function(){SVF=null;VUE="pieces";render()};
ACTS.svClient=function(b){api("/customer?id="+b.dataset.cid).then(function(c){SVF=null;CUR=c;TAB="accueil";FICHE=null;ADDT=false;RECEP=null;EDITCLI=false;FID=null;PTAB="rep";render();window.scrollTo(0,0)}).catch(function(e){alert(e.message)})};
ACTS.svInfos=function(){if(!SVF)return;api("/sav/dossier/infos",{id:SVF.id,motif:v("sv-d-mot"),fournisseur:v("sv-d-f"),rma:v("sv-d-r")}).then(function(){SVF.msg="";svMaj();savReload()}).catch(function(e){alert(e.message)})};
ACTS.svAction=function(b){if(!SVF)return;var a=b.dataset.a;var q={annule:"Annuler ce dossier ?",refus:"Marquer comme refusé par le fournisseur ?"};if(q[a]&&!confirm(q[a]))return;
  api("/sav/maj",{id:SVF.id,action:a,fournisseur:v("sv-d-f"),rma:v("sv-d-r")}).then(function(){svMaj();savReload()}).catch(function(e){alert(e.message)})};
ACTS.svNote=function(){if(!SVF)return;api("/sav/dossier/note",{id:SVF.id,texte:v("sv-note")}).then(function(){svMaj()}).catch(function(e){alert(e.message)})};
ACTS.svPdf=function(b){
  var w=window.open("","_blank");
  var h={};if(TOK)h["x-atelier-token"]=TOK;else h["x-atelier-password"]=PW;
  fetch("/api/sav/pdf/"+b.dataset.id+"/fichier",{headers:h}).then(function(r){if(!r.ok)throw new Error("PDF introuvable");return r.blob()}).then(function(bl){var u=URL.createObjectURL(bl);if(w)w.location=u;else window.location=u}).catch(function(e){if(w)w.close();alert(e.message)})};
ACTS.svPdfDel=function(b){if(!confirm("Supprimer ce PDF ?"))return;api("/sav/pdf/supprimer",{id:+b.dataset.id}).then(function(){svMaj()}).catch(function(e){alert(e.message)})};
document.addEventListener("change",function(e){
  var t=e.target;if(!t||String(t.id).indexOf("sv-file-")!==0||!t.files||!t.files[0]||!SVF)return;
  var fl=t.files[0];
  if(fl.size>8*1024*1024){alert("PDF trop lourd (8 Mo maximum).");t.value="";return}
  var rd=new FileReader();
  rd.onload=function(){var data=String(rd.result).split(",")[1]||"";SVF.msg="Envoi du PDF...";render();
    api("/sav/pdf",{dossierId:SVF.id,nom:fl.name,data:data,type:String(t.id).replace("sv-file-","")}).then(function(d){SVF.msg="";svMaj()}).catch(function(er){SVF.msg=er.message;render()})};
  rd.readAsDataURL(fl)});
`;