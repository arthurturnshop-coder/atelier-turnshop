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
`;
