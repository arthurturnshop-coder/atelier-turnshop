export const ACTIONS = `var ACTS={
  chooseMag:function(b){loadProfils(b.dataset.mag)},
  choosePrenom:choosePrenom,
  loginBack:function(){LG={step:"mag"};MSG="";render()},
  loginBackProf:function(){loadProfils(LG.magasin)},
  secoursOpen:function(){LG={step:"secours",magasin:LG.magasin};MSG="";render()},
  connect:connect,secoursConnect:secoursConnect,logout:logout,
  tab:function(b){TAB=b.dataset.tab;FICHE=null;if(TAB==="accueil"){CUR=null;CONS=null;CHIF=null;EDITCONS=false;NEWCLI=false;RES=[];SEARCHED=false}render()},
  search:search,
  open:function(b){CUR=RES[+b.dataset.i];RES=[];SEARCHED=false;ADDT=false;RECEP=null;EDITCLI=false;FID=null;FICHE=null;TAB="accueil";render()},
  priseEnCharge:function(b){var c=RES[+b.dataset.i];CUR=c;RES=[];SEARCHED=false;TAB="accueil";ADDT=false;RECEP=null;EDITCLI=false;FID=null;FICHE=null;if(!c.trottinettes.length)ADDT=true;render()},
  back:function(){CUR=null;ADDT=false;RECEP=null;EDITCLI=false;FID=null;CONS=null;CHIF=null;render()},
  showNew:function(){NEWCLI=true;render()},cancelNew:function(){NEWCLI=false;render()},
  editCons:function(){EDITCONS=true;render()},cancelCons:function(){EDITCONS=false;render()},
  saveCons:async function(){var body={};Object.keys(CLAB).forEach(function(k){body[k]=v("c-"+k)});try{var d=await api("/consignes",body);CONS=null;EDITCONS=false;alert(d.message);render()}catch(e){alert(e.message)}},
  addC:async function(){try{var d=await api("/clients",{prenom:v("pn"),nom:v("nm"),telephone:v("tel"),email:v("em")});alert(d.message);NEWCLI=false;CUR=await api("/customer?id="+d.id);EDITCLI=false;FID=null;ADDT=true;TAB="accueil";render()}catch(e){alert(e.message)}},
  editCli:function(){EDITCLI=true;render()},cancelCli:function(){EDITCLI=false;render()},
  saveCli:async function(){try{var d=await api("/clients/modifier",{id:CUR.id,prenom:v("ep"),nom:v("en"),telephone:v("et"),email:v("ee")});alert(d.message);EDITCLI=false;await refresh()}catch(e){alert(e.message)}},
  showAddT:function(){ADDT=true;render()},cancelAddT:function(){ADDT=false;render()},
  addT:async function(){try{var d=await api("/trottinettes",{customerId:CUR.id,marque:v("m"),modele:v("mo"),serie:v("s")});alert(d.message);ADDT=false;await refresh()}catch(e){alert(e.message)}},
  openRecep:function(b){RECEP=Number(b.dataset.t);render()},cancelRecep:function(){RECEP=null;render()},
  addR:async function(b){var abs=document.getElementById("abs"),gar=document.getElementById("gar");try{var d=await api("/reparations",{customerId:CUR.id,trottinetteId:Number(b.dataset.t),panne:v("p"),etat:v("e"),remarques:v("r"),dateDepot:v("d"),enMagasin:!(abs&&abs.checked),sousGarantie:!!(gar&&gar.checked)});alert(d.message);RECEP=null;await refresh()}catch(e){alert(e.message)}},
  arrivee:async function(b){try{var d=await api("/reparations/arrivee",{repairId:Number(b.dataset.id)});if(b.dataset.fiche)await recharger(Number(b.dataset.id));else if(TAB==="enc")loadEnc();else await refresh();alert(d.message)}catch(e){alert(e.message)}},
  avisOui:async function(b){try{var d=await api("/reparations/avis",{repairId:Number(b.dataset.id),choix:"programme"});alert(d.message);await refresh()}catch(e){alert(e.message)}},
  avisNon:async function(b){try{var d=await api("/reparations/avis",{repairId:Number(b.dataset.id),choix:"refuse"});alert(d.message);await refresh()}catch(e){alert(e.message)}},
  vue:function(b){VUE=b.dataset.vue;loadEnc()},
  ouvrirFiche:function(b){ouvrirFiche(Number(b.dataset.id))},
  fermerFiche:function(){FICHE=null;render()},
  setStatut:async function(b){try{await api("/reparations/maj",{repairId:Number(b.dataset.id),statut:b.dataset.s});await recharger(Number(b.dataset.id))}catch(e){alert(e.message)}},
  setGarantie:async function(b){try{await api("/reparations/maj",{repairId:Number(b.dataset.id),sousGarantie:b.checked});await recharger(Number(b.dataset.id))}catch(e){alert(e.message)}},
  saveFiche:async function(b){try{await api("/reparations/maj",{repairId:Number(b.dataset.id),panne:v("fp"),commentaireInterne:v("fc")});await recharger(Number(b.dataset.id))}catch(e){alert(e.message)}},
  addNote:async function(b){var n=v("fn");if(!n)return;try{await api("/reparations/maj",{repairId:Number(b.dataset.id),note:n});await recharger(Number(b.dataset.id))}catch(e){alert(e.message)}},
  addLigne:async function(b){try{await api("/devis/ligne",{repairId:Number(b.dataset.id),type:v("lt"),libelle:v("ll"),quantite:v("lq"),prix:v("lp")});await recharger(Number(b.dataset.id))}catch(e){alert(e.message)}},
  delLigne:async function(b){try{await api("/devis/ligne/supprimer",{id:Number(b.dataset.id)});await recharger(FICHE.id)}catch(e){alert(e.message)}},
  supprFiche:async function(b){if(!confirm("Supprimer cette fiche de réparation ?"))return;try{var d=await api("/reparations/supprimer",{repairId:Number(b.dataset.id)});alert(d.message);FICHE=null;render()}catch(e){alert(e.message)}},
  facturer:async function(b){
    if(PAN.length&&!confirm("Le panier de la caisse n'est pas vide : le remplacer par ce devis ?"))return;
    try{var f=FICHE;var d=await api("/caisse/client?id="+f.customerId);
      PAN=f.devis.lignes.map(function(l){return{libelle:l.libelle,quantite:l.quantite,prix:String(l.prixCents/100).replace(".",","),type:l.type,variantId:l.variantId||"",sku:l.sku||""}});
      CCLI=d.client;CFID=d.fidelite;CUSE=false;CAVOFF=[];CREC=null;CHOPEN=0;CREP=f.id;CPAY={carte:"",especes:"",virement:""};CMSG="";
      FICHE=null;CUR=null;TAB="accueil";await chargeHisto()}catch(e){alert(e.message)}},
  cAnnuleRep:function(){CREP=null;PAN=[];lirePay();render()},
  cShopRetry:async function(b){try{var d=await api("/caisse/shopify",{venteId:+b.dataset.id});if(!d.ok)alert(d.erreur);await chargeHisto();if(CREC&&CREC.id===+b.dataset.id){var h=await api("/caisse/historique"+(CCLI?"?clientId="+CCLI.id:""));var m=h.ventes.filter(function(x){return x.id===CREC.id})[0];if(m){CREC=m;render()}}}catch(e){alert(e.message)}},
  shopCmd:async function(b){try{await api("/reglages/commandes",{actif:b.dataset.v==="1"});SHOPCMD=null;render()}catch(e){alert(e.message)}},
  cScan:async function(){var q=v("cq");if(!q)return;try{var s=await api("/caisse/scan?q="+encodeURIComponent(q));if(!s.clientId){CMSG="Aucun client trouvé pour ce scan.";lirePay();render();return}var d=await api("/caisse/client?id="+s.clientId);CCLI=d.client;CFID=d.fidelite;CUSE=false;CMSG="";CAVOFF=[];CHOPEN=0;lirePay();await chargeHisto()}catch(e){alert(e.message)}},
  cClient0:function(){CREP=null;CCLI=null;CFID=null;CUSE=false;CHIST=null;CHOPEN=0;CAVOFF=[];lirePay();render()},
  cUse:function(b){CUSE=b.dataset.v==="1";lirePay();render()},
  cAdd:function(){var l=v("cl");if(!l){alert("Donne un libellé.");return}PAN.push({libelle:l,quantite:Math.max(1,Number(v("cq2"))||1),prix:v("cp")||"0"});lirePay();render()},
  cDel:function(b){PAN.splice(+b.dataset.i,1);lirePay();render()},
  cTout:function(b){var brut=panierTotal(),net=brut-avRemTotal(brut)-remiseCents();CPAY={carte:"",especes:"",virement:""};CPAY[b.dataset.m]=(net/100).toFixed(2).replace(".",",");render()},
  cJour:function(){lirePay();chargeHisto()},
  cRecu:function(b){var id=+b.dataset.id;CHOPEN=CHOPEN===id?0:id;lirePay();render()},
  cFermeRecu:function(){CREC=null;lirePay();render()},
  cPrint:function(b){var old=document.querySelectorAll(".printme");for(var i=0;i<old.length;i++)old[i].classList.remove("printme");var r=document.querySelector("[data-recu='"+b.dataset.id+"']");if(!r)return;r.classList.add("printme");window.print();setTimeout(function(){r.classList.remove("printme")},500)},
  cEncaisser:async function(){lirePay();var pay=["carte","especes","virement"].map(function(m){return{moyen:m,montant:CPAY[m]}}).filter(function(p){return p.montant});
    var brut=panierTotal(),ids=avChoisis(brut).map(function(a){return a.id});
    try{var d=await api("/caisse/encaisser",{lignes:PAN,paiements:pay,clientId:CCLI?CCLI.id:null,utiliserFidelite:CUSE,avantageIds:ids,repairId:CREP});CREP=null;PAN=[];CPAY={carte:"",especes:"",virement:""};CUSE=false;CAVOFF=[];CREC=d.vente;CMSG="";CHOPEN=0;if(CCLI){var x=await api("/caisse/client?id="+CCLI.id);CFID=x.fidelite}await chargeHisto()}catch(e){CMSG=e.message;render()}},
  shopTest:async function(){SHOPRES="<div class='muted'>Test en cours…</div>";render();try{var d=await api("/shopify/diagnostic");SHOPRES=d.etapes.map(function(e){return"<div>"+(e.ok?"✅ ":"❌ ")+"<b>"+esc(e.nom)+"</b><div class='muted'>"+esc(e.detail)+"</div></div>"}).join("")}catch(e){SHOPRES=esc(e.message)}render()},
  avSave:async function(){var dec=v("avd");try{var d=await api("/avantages",{libelle:v("avl"),declencheur:dec,seuil:v("avs"),dateDebut:v("avdd"),dateFin:v("avdf"),effet:v("ave"),valeur:v("avv")});AVL=null;AVMSG=d.message||"Avantage ajouté.";CAV=null;render()}catch(e){AVMSG=e.message;render()}},
  avEtat:async function(b){try{await api("/avantages/etat",{id:+b.dataset.id,actif:b.dataset.v==="1"});AVL=null;CAV=null;render()}catch(e){alert(e.message)}},
  avSuppr:async function(b){if(!confirm("Supprimer cet avantage ?"))return;try{await api("/avantages/supprimer",{id:+b.dataset.id});AVL=null;CAV=null;render()}catch(e){alert(e.message)}},
  avType:function(){AVDEC=v("avd");AVF={libelle:v("avl"),seuil:v("avs"),dd:v("avdd"),df:v("avdf"),effet:v("ave"),valeur:v("avv")};render()},
  saveParam:async function(){try{var d=await api("/parametres",{eurosPourPalier:v("pe1"),remiseEuros:v("pr1")});PARAM=null;alert(d.message);render()}catch(e){var m=document.getElementById("parmsg");if(m)m.textContent=e.message}}
};
document.addEventListener("change",function(e){var t=e.target;if(t&&t.dataset&&t.dataset.act==="avType")ACTS.avType()});
document.addEventListener("input",function(e){var t=e.target;if(!t||!t.dataset)return;if(t.dataset.act==="cQte"){PAN[+t.dataset.i].quantite=Math.max(1,Number(t.value)||1)}if(t.dataset.act==="cPrix"){PAN[+t.dataset.i].prix=t.value}});
`;
