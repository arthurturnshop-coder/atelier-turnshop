export const ACTIONS = `var ACTS={
  chooseMag:function(b){loadProfils(b.dataset.mag)},
  choosePrenom:choosePrenom,
  loginBack:function(){LG={step:"mag"};MSG="";render()},
  loginBackProf:function(){loadProfils(LG.magasin)},
  secoursOpen:function(){LG={step:"secours",magasin:LG.magasin};MSG="";render()},
  connect:connect,secoursConnect:secoursConnect,logout:logout,
  tab:function(b){var PREV_TAB=TAB;TAB=b.dataset.tab;if(TAB==="cmd")CMD=null;if(TAB==="stock"){STK=null;STSUB="liste"}if(TAB==="param")PSEC="";if(TAB==="cli"){CLV.ventes=null;CLV.z=null;CLV.open=0}if(TAB==="stats"){STA.d=null}if(TAB==="retours"){RTR.d=null;RTR.msg="";RTR.ctx=PREV_TAB}FICHE=null;if(TAB==="accueil"){CUR=null;CONS=null;CHIF=null;EDITCONS=false;NEWCLI=false;RES=[];SEARCHED=false}render()},
  search:search,
  open:function(b){CUR=RES[+b.dataset.i];RES=[];SEARCHED=false;ADDT=false;RECEP=null;EDITCLI=false;FID=null;FICHE=null;TAB="accueil";render()},
  priseEnCharge:function(b){var c=RES[+b.dataset.i];CUR=c;RES=[];SEARCHED=false;TAB="accueil";ADDT=false;RECEP=null;EDITCLI=false;FID=null;FICHE=null;if(!c.trottinettes.length)ADDT=true;render()},
  back:function(){CUR=null;ADDT=false;RECEP=null;EDITCLI=false;FID=null;CONS=null;CHIF=null;render()},
  showNew:function(){NEWPRE="";NEWCLI=true;render()},showNewPre:function(b){NEWPRE=b.dataset.q||"";NEWCLI=true;CUR=null;TAB="accueil";render()},cancelNew:function(){NEWCLI=false;render()},
  editCons:function(){EDITCONS=true;render()},cancelCons:function(){EDITCONS=false;render()},
  saveCons:async function(){var body={};Object.keys(CLAB).forEach(function(k){body[k]=v("c-"+k)});try{var d=await api("/consignes",body);CONS=null;EDITCONS=false;alert(d.message);render()}catch(e){alert(e.message)}},
  addC:async function(){try{var d=await api("/clients",{prenom:v("pn"),nom:v("nm"),telephone:v("tel"),email:v("em")});alert(d.message);NEWCLI=false;CUR=await api("/customer?id="+d.id);EDITCLI=false;FID=null;ADDT=true;TAB="accueil";render()}catch(e){alert(e.message)}},
  cliSuppr:async function(){if(!CUR||!confirm("Supprimer la fiche de "+CUR.name+" ? (possible seulement si elle n'a ni réparation ni vente)"))return;
    try{var d=await api("/clients/supprimer",{id:CUR.id});alert(d.message);CUR=null;RES=[];SEARCHED=false;TAB="accueil";render()}catch(e){alert(e.message)}},
  cliFusion:async function(){if(!CUR)return;var q=prompt("Fusionner "+CUR.name+" dans quelle fiche ? Tape le nom, l'email ou le téléphone de la fiche à GARDER :");if(!q)return;
    try{var l=(await api("/search?q="+encodeURIComponent(q))).filter(function(x){return x.id!==CUR.id});
      if(!l.length){alert("Aucune autre fiche trouvée.");return}
      var n=prompt("Garder quelle fiche ? Tape le numéro :"+nlc()+l.map(function(x,i){return(i+1)+" = "+x.name+" · "+(x.phone||"")+" · "+(x.email||"")}).join(nlc()),"1");if(!n)return;
      var k=l[(+n)-1];if(!k){alert("Numéro inconnu.");return}
      if(!confirm("Tout déplacer de "+CUR.name+" vers "+k.name+" puis supprimer "+CUR.name+" ?"))return;
      var d=await api("/clients/fusionner",{id:CUR.id,versId:k.id});alert(d.message);CUR=await api("/customer?id="+d.id);RES=[];render()}catch(e){alert(e.message)}},
  editCli:function(){EDITCLI=true;render()},cancelCli:function(){EDITCLI=false;render()},
  saveCli:async function(){try{var d=await api("/clients/modifier",{id:CUR.id,prenom:v("ep"),nom:v("en"),telephone:v("et"),email:v("ee")});alert(d.message);EDITCLI=false;await refresh()}catch(e){alert(e.message)}},
  showAddT:function(){ADDT=true;render()},cancelAddT:function(){ADDT=false;render()},
  addT:async function(){try{var d=await api("/trottinettes",{customerId:CUR.id,marque:v("m"),modele:v("mo"),serie:v("s")});alert(d.message);ADDT=false;await refresh()}catch(e){alert(e.message)}},
  openRecep:function(b){RECEP=Number(b.dataset.t);render()},cancelRecep:function(){RECEP=null;render()},
  boiteSet:function(b){api("/reparations/maj",{repairId:+b.dataset.id,boite:b.dataset.b}).then(function(){BXOC=null;return recharger(+b.dataset.id)}).catch(function(e){alert(e.message)})},
  codeSave:function(b){api("/trottinettes/code",{trottinetteId:+b.dataset.t,code:v("fk")}).then(function(d){btnFlash(b,"✓ Enregistré");return recharger(+b.dataset.id)}).catch(function(e){alert(e.message)})},
  codeProfil:function(b){var c=prompt("Code / mot de passe de la trottinette (vide pour effacer) :",b.dataset.c||"");if(c===null)return;api("/trottinettes/code",{trottinetteId:+b.dataset.t,code:c}).then(function(){return refresh()}).catch(function(e){alert(e.message)})},
  addR:async function(b){var abs=document.getElementById("abs"),gar=document.getElementById("gar"),pec=document.getElementById("pec");try{var d=await api("/reparations",{customerId:CUR.id,trottinetteId:Number(b.dataset.t),panne:v("p"),etat:v("e"),remarques:v("r"),boite:v("b"),codeAcces:v("k"),dateDepot:v("d"),enMagasin:!(abs&&abs.checked),sousGarantie:!!(gar&&gar.checked)});alert(d.message);RECEP=null;var k=RACC;RACC="";if(k==="devis"&&d.id){await ouvrirFiche(d.id)}else await refresh();if(pec&&pec.checked&&!(abs&&abs.checked)&&d.id)await imprimerPEC(d.id)}catch(e){alert(e.message)}},
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
  rdvAct:async function(b){var a=b.dataset.a,body={repairId:+b.dataset.id,action:a};
    if(a==="proposer"){var dt=v("rdv-d");if(!dt){alert("Choisis une date.");return}body.date=dt;body.creneau=v("rdv-c")}
    if(a==="refuser"&&!confirm("Refuser cette demande ? Elle sera retirée de la liste."))return;
    try{var d=await api("/reparations/rdv",body);alert(d.message);if(d.supprime){FICHE=null;render()}else await recharger(+b.dataset.id)}catch(e){alert(e.message)}},
  supprFiche:async function(b){if(!confirm("Supprimer cette fiche de réparation ?"))return;try{var d=await api("/reparations/supprimer",{repairId:Number(b.dataset.id)});alert(d.message);FICHE=null;render()}catch(e){alert(e.message)}},
  facturer:async function(b){
    if(PAN.length&&!confirm("Le panier de la caisse n'est pas vide : le remplacer par ce devis ?"))return;
    try{var f=FICHE;var d=await api("/caisse/client?id="+f.customerId);
      PAN=f.devis.lignes.map(function(l){return{libelle:l.libelle,quantite:l.quantite,prix:String(l.prixCents/100).replace(".",","),type:l.type,variantId:l.variantId||"",sku:l.sku||""}});
      if(f.garde&&f.garde.fraisCents>0)PAN.push({libelle:"Gardiennage ("+f.garde.joursFrais+" jours x "+(f.garde.prixCents/100)+" EUR)",quantite:f.garde.joursFrais,prix:String(f.garde.prixCents/100).replace(".",","),type:"article",variantId:"",sku:""});
      CACO=f.acompte?f.acompte.resteCents:0;
      CCLI=d.client;CFID=d.fidelite;CUSE=false;CAVOFF=[];CREC=null;CHOPEN=0;CREP=f.id;CPAY={carte:"",especes:"",virement:"",bon_achat:""};CMSG="";
      FICHE=null;CUR=null;TAB="accueil";await chargeHisto()}catch(e){alert(e.message)}},
  acompte:async function(b){var m=pxCents(v("ac-m"));if(m<=0){alert("Indique le montant.");return}
    try{var mdpA=prompt("Mot de passe de celui qui encaisse :");if(!mdpA)return;var d=await api("/reparations/acompte",{mdpCaissier:mdpA,repairId:+b.dataset.id,paiements:[{moyen:v("ac-t"),montant:v("ac-m")}]});await recharger(+b.dataset.id);CREC=d.vente;alert(d.message)}catch(e){alert(e.message)}},
  rembourse:async function(b){var t=v("rb-t");if(!t){alert("Choisis comment rembourser.");return}
    if(!confirm("Rembourser "+eur(+b.dataset.c)+" au client ?"))return;
    try{var d=await api("/reparations/rembourser",{repairId:+b.dataset.id,moyen:t});alert(d.message);await recharger(+b.dataset.id)}catch(e){alert(e.message)}},
  cAnnuleRep:function(){CREP=null;CACO=0;PAN=[];lirePay();render()},
  cShopRetry:async function(b){try{var d=await api("/caisse/shopify",{venteId:+b.dataset.id});if(!d.ok)alert(d.erreur);await chargeHisto();if(CREC&&CREC.id===+b.dataset.id){var h=await api("/caisse/historique"+(CCLI?"?clientId="+CCLI.id:""));var m=h.ventes.filter(function(x){return x.id===CREC.id})[0];if(m){CREC=m;render()}}}catch(e){alert(e.message)}},
  tickSave:async function(){try{var d=await api("/reglages/ticket",{entete:v("tk-ent"),avisAmiens:v("tk-am"),avisRouen:v("tk-ro"),rdvUrl:v("tk-rdv"),siteUrl:v("tk-site"),coordAmiens:v("tk-ca"),coordRouen:v("tk-cr")});TICKMSG=d.message;TICK=null;render()}catch(e){TICKMSG=e.message;render()}},
  shopCmd:async function(b){try{await api("/reglages/commandes",{actif:b.dataset.v==="1"});SHOPCMD=null;render()}catch(e){alert(e.message)}},
  raccFin:function(){RACC="";render()},
  racc:function(b){RACC=b.dataset.k;CUR=null;RES=[];SEARCHED=false;NEWCLI=false;FICHE=null;TAB="accueil";render()},
  cScan:function(){return scanCode(v("cq"),"caisse")},
  cClient0:function(){CREP=null;CACO=0;CCLI=null;CFID=null;CUSE=false;CHIST=null;CHOPEN=0;CAVOFF=[];lirePay();render()},
  cUse:function(b){CUSE=b.dataset.v==="1";lirePay();var sy=window.scrollY;render();window.scrollTo(0,sy)},
  cAdd:function(){var l=v("cl");if(!l){alert("Donne un libellé.");return}PAN.push({libelle:l,quantite:Math.max(1,Number(v("cq2"))||1),prix:v("cp")||"0"});lirePay();render()},
  trfOpen:function(b){TRF={t:+b.dataset.t,q:"",res:null};render()},
  trfNon:function(){TRF=null;render()},
  trfCherche:async function(){var q=v("trf-q");TRF.q=q;try{TRF.res=await api("/search?q="+encodeURIComponent(q))}catch(e){TRF.res=[]}render()},
  trfOk:async function(b){var c=TRF&&TRF.res&&TRF.res[+b.dataset.i];if(!c)return;if(!confirm("Transférer cette trottinette à "+c.prenom+" "+c.nom+" ? Son historique reste sur l ancienne fiche."))return;
    try{var d=await api("/trottinettes/transferer",{trottinetteId:TRF.t,versClientId:c.id});TRF=null;alert(d.message);await refresh()}catch(e){alert(e.message)}},
  cVehOpen:function(){lirePay();CVEH=true;render()},
  cVehNon:function(){lirePay();CVEH=false;render()},
  cVehOk:function(){lirePay();var e=document.getElementById("cveh-l"),l=e?PAN[+e.value]:null;if(l){l.trott=true;l.series=l.series||[]}CVEH=false;render()},
  cDel:function(b){PAN.splice(+b.dataset.i,1);lirePay();render()},
  cTout:function(b){var brut=panierTotal(),net=brut-avRemTotal(brut)-remiseCents();net-=acoDeduit(net);CPAY={carte:"",especes:"",virement:"",bon_achat:""};CPAY[b.dataset.m]=(net/100).toFixed(2).replace(".",",");var sy=window.scrollY;render();window.scrollTo(0,sy)},
  cJour:function(){lirePay();chargeHisto()},
  cVjOuvre:function(){VJ=[];VJOPEN=0;vjSync();rdvInfos().then(function(){return api("/caisse/historique?jour=1")}).then(function(d){VJ=d.ventes;vjSync()}).catch(function(e){VJ=null;toastKo(e.message);vjSync()})},
  cVjClient:async function(b){var cid=+b.dataset.cid;VJ=null;VJOPEN=0;vjSync();try{var d=await api("/caisse/client?id="+cid);CUR=null;FICHE=null;TAB="accueil";CCLI=d.client;CFID=d.fidelite;CUSE=false;CMSG="";CAVOFF=[];CHOPEN=0;await chargeHisto()}catch(e){toastKo(e.message)}},
  cAvisMail:async function(b){btnFlash(b);try{var d=await api("/caisse/avis",{venteId:+b.dataset.id});toastOk(d.message)}catch(e){toastKo(e.message)}},
  svOpen:function(b){SAVF={mode:b.dataset.m,vid:+b.dataset.id};vjSync()},
  svNo:function(){SAVF=null;vjSync()},
  svOk:async function(b){var id=+b.dataset.id,f=SAVF;if(!f)return;btnFlash(b);var l=document.getElementById("sv-l"),mot=v("sv-mot");
    try{var d;
      if(f.mode==="remb")d=await api("/sav/rembourser",{venteId:id,montant:v("sv-m"),moyen:document.getElementById("sv-moy").value,motif:mot});
      else if(f.mode==="ech")d=await api("/sav/echange",{venteId:id,ligne:+l.value,motif:mot});
      else d=await api("/sav/garantie",{venteId:id,ligne:+l.value,motif:mot,fournisseur:v("sv-f")});
      SAVF=null;toastOk(d.message);vjSync();savReload()}catch(e){toastKo(e.message)}},
  savDemOpen:function(b){SAVED=+b.dataset.id;render()},
  savDemNo:function(){SAVED=0;render()},
  savDem:async function(b){try{await api("/sav/maj",{id:+b.dataset.id,action:"demande",fournisseur:v("sv-f"),rma:v("sv-r")});SAVED=0;await savReload()}catch(e){toastKo(e.message)}},
  savAct:async function(b){var a=b.dataset.a,q={piece_recue:"Confirmer : la pièce de remplacement est bien arrivée et contrôlée ?",rembourse_fournisseur:"Confirmer : le fournisseur a bien remboursé ?",refus:"Confirmer : garantie refusée, dossier clos ?",annule:"Annuler ce dossier ?"};
    if(q[a]&&!confirm(q[a]))return;try{await api("/sav/maj",{id:+b.dataset.id,action:a});await savReload()}catch(e){toastKo(e.message)}},
  cVjFerme:function(){VJ=null;VJOPEN=0;vjSync()},
  cVjRecu:function(b){var id=+b.dataset.id;VJOPEN=VJOPEN===id?0:id;vjSync()},
  cRecu:function(b){var id=+b.dataset.id;CHOPEN=CHOPEN===id?0:id;lirePay();render()},
  cFermeRecu:function(){CREC=null;lirePay();render()},
  cPrint:function(b){btnFlash(b);var r=document.querySelector("[data-recu='"+b.dataset.id+"']");if(!r)return;var c=r.cloneNode(true);c.className="printme";impImprimer(c.outerHTML,"","",true)},
  cCase:function(b){return cCaseFn(b)},
  cEncaisser:async function(){await rdvInfos();lirePay();var mdpE=document.getElementById("c-mdp"),mdpC=mdpE?mdpE.value:CMDP;CMDP=mdpC;if(!mdpC){CMSG="Tape ton mot de passe (celui qui encaisse) avant d'encaisser.";render();return}var pay=["carte","especes","virement","bon_achat"].map(function(m){return{moyen:m,montant:CPAY[m]}}).filter(function(p){return p.montant});
    var brut=panierTotal(),ids=avChoisis(brut).map(function(a){return a.id});
    if(!CREP){try{var need=await api("/caisse/series-requises",{lignes:PAN});need.indices.forEach(function(i){PAN[i].trott=true;PAN[i].series=PAN[i].series||[]})}catch(e){}}
    if(!CREP&&PAN.some(function(l){return l.trott})){
      if(!PAN.every(serieOk)){CMSG="Trottinette : saisis le numéro de série (un par trottinette) avant d encaisser.";render();return}
      if(!CCLI){CMSG="Trottinette : choisis le client (sa garantie est liée à son compte).";render();return}}
    try{var d=await api("/caisse/encaisser",{lignes:PAN,paiements:pay,clientId:CCLI?CCLI.id:null,utiliserFidelite:CUSE,avantageIds:ids,repairId:CREP,mdpCaissier:mdpC});CMDP="";CREP=null;CACO=0;PAN=[];CPAY={carte:"",especes:"",virement:"",bon_achat:""};CUSE=false;CAVOFF=[];CREC=d.vente;CMSG="";CHOPEN=0;CCLI=null;CFID=null;await chargeHisto()}catch(e){CMSG=e.message;render()}},
  shopTest:async function(){SHOPRES="<div class='muted'>Test en cours…</div>";render();try{var d=await api("/shopify/diagnostic");SHOPRES=d.etapes.map(function(e){return"<div>"+(e.ok?"✅ ":"❌ ")+"<b>"+esc(e.nom)+"</b><div class='muted'>"+esc(e.detail)+"</div></div>"}).join("")}catch(e){SHOPRES=esc(e.message)}render()},
  addPresta:async function(b){var x=(PRESTA?PRESTA.prestations:[]).filter(function(p){return p.id===+b.dataset.id})[0];if(!x||!FICHE)return;
    try{await api("/devis/ligne",{repairId:FICHE.id,type:"main_oeuvre",libelle:x.nom,quantite:1,prix:String(x.prixCents/100).replace(".",",")});
      DEVOPT=(x.options||[]).length?x.id:0;
      DEVHINT=x.avecPiece?"Choisis maintenant : "+(x.pieceAide||"la pièce")+" (cherche-la dans le catalogue ci-dessous).":"";
      await recharger(FICHE.id);
      if(x.avecPiece){setTimeout(function(){var i=document.querySelector("input[data-ps=devis]");if(i){i.focus();i.scrollIntoView({block:"center"})}},50)}}catch(e){alert(e.message)}},
  brvSave:async function(){try{var d=await api("/brevo",{avis:v("bv-avis"),rdv:v("bv-rdv"),piece:v("bv-piece"),pret:v("bv-pret"),garde:v("bv-garde")});BRVMSG=d.message;BRV=null;render()}catch(e){BRVMSG=e.message;render()}},
  brvTest:async function(){BRVMSG="Envoi…";render();try{var d=await api("/brevo/test",{email:v("bv-te")});BRVMSG=d.message}catch(e){BRVMSG=e.message}render()},
  tTab:function(b){TTAB=b.dataset.v;TACH=null;TREC=null;render()},
  rcSave:async function(){try{var f=v("rc-f"),b={id:RCEDIT,texte:v("rc-txt"),priorite:!!document.getElementById("rc-p").checked};
      if(f.charAt(0)==="j"){b.unite="jours";b.intervalle=+f.slice(1)}
      else if(f.charAt(0)==="s"){b.unite="semaines";b.intervalle=1;b.jourSemaine=+f.slice(1)}
      else if(f.charAt(0)==="m"){b.unite="mois";b.intervalle=1;b.jourMois=+f.slice(1)}
      else if(RCF.raw){b.unite=RCF.raw.unite;b.intervalle=RCF.raw.intervalle;b.jourSemaine=RCF.raw.jourSemaine;b.jourMois=RCF.raw.jourMois}
      var d=await api("/recurrentes",b);RCMSG=d.message;RCEDIT=0;RCF={txt:"",f:"s1",p:false,raw:null};TREC=null;TACH=null;render()}catch(e){RCMSG=e.message;render()}},
  rcEdit:function(b){var x=(TREC||[]).filter(function(r){return r.id===+b.dataset.id})[0];if(!x)return;RCEDIT=x.id;RCF={txt:x.texte,f:rcValeur(x),p:x.priorite,raw:x};RCMSG="";render()},
  rcEtat:async function(b){try{await api("/recurrentes/etat",{id:+b.dataset.id,actif:b.dataset.v==="1"});TREC=null;TACH=null;render()}catch(e){alert(e.message)}},
  rcSuppr:async function(b){if(!confirm("Supprimer cette tâche récurrente ?"))return;try{await api("/recurrentes/supprimer",{id:+b.dataset.id});TREC=null;TACH=null;render()}catch(e){alert(e.message)}},
  tAdd:async function(){var t=v("tt-txt");if(!t)return;try{await api("/taches",{texte:t,echeance:v("tt-date"),priorite:!!document.getElementById("tt-prio").checked,epingle:!!document.getElementById("tt-pin").checked});tacheRecharge()}catch(e){alert(e.message)}},
  tFait:async function(b){try{await api("/taches/maj",{id:+b.dataset.id,fait:b.dataset.v==="1"});tacheRecharge()}catch(e){alert(e.message)}},
  tPin:async function(b){try{await api("/taches/maj",{id:+b.dataset.id,epingle:b.dataset.v==="1"});tacheRecharge()}catch(e){alert(e.message)}},
  tPrio:async function(b){try{await api("/taches/maj",{id:+b.dataset.id,priorite:b.dataset.v==="1"});tacheRecharge()}catch(e){alert(e.message)}},
  tSuppr:async function(b){try{if(TACH)TACH=TACH.filter(function(t){return t.id!==+b.dataset.id});render();await api("/taches/supprimer",{id:+b.dataset.id});tacheRecharge()}catch(e){alert(e.message)}},
  copier:function(b){var t=b.dataset.t||"";if(navigator.clipboard)navigator.clipboard.writeText(t).then(function(){b.textContent="Copié";setTimeout(function(){b.textContent=b.dataset.l||"Copier"},1200)},function(){prompt("Copie :",t)});else prompt("Copie :",t)},
  psSave:async function(){try{var d=await api("/prestations",{id:PSEDIT,nom:v("ps-nom"),prix:v("ps-prix"),avecPiece:!!document.getElementById("ps-piece").checked,pieceAide:v("ps-aide"),qteSeuil:v("ps-qs"),qteRemise:v("ps-qr")});PSMSG=d.message;PSEDIT=0;PSF={nom:"",prix:"",avecPiece:false,aide:"",qs:"",qr:""};PRESTA=null;render()}catch(e){PSMSG=e.message;render()}},
  psEdit:function(b){var x=(PRESTA?PRESTA.prestations:[]).filter(function(p){return p.id===+b.dataset.id})[0];if(!x)return;PSEDIT=x.id;PSF={nom:x.nom,prix:String(x.prixCents/100).replace(".",","),avecPiece:x.avecPiece,aide:x.pieceAide,qs:x.qteSeuil?String(x.qteSeuil):"",qr:x.qteRemiseCents?String(x.qteRemiseCents/100).replace(".",","):""};PSMSG="";render()},
  psEtat:async function(b){try{await api("/prestations/etat",{id:+b.dataset.id,actif:b.dataset.v==="1"});PRESTA=null;render()}catch(e){alert(e.message)}},
  modFiltre:function(){render();var i=document.getElementById("mod-q");if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},
  modOpen:function(b){MODOPEN=MODOPEN===+b.dataset.id?0:+b.dataset.id;render()},
  modAdd:async function(){try{var d=await api("/modeles",{marque:v("mod-ma"),modele:v("mod-mo")});MODMSG=d.message;MODS=null;render()}catch(e){alert(e.message)}},
  modSuppr:async function(b){if(!confirm("Supprimer ce modèle et ses pièces ?"))return;try{await api("/modeles/supprimer",{id:+b.dataset.id});MODS=null;render()}catch(e){alert(e.message)}},
  modPieceSuppr:async function(b){try{await api("/modeles/piece/supprimer",{id:+b.dataset.id});MODS=null;render()}catch(e){alert(e.message)}},
  modImport:async function(){try{var d=await api("/modeles/import",{csv:v("mod-csv")});MODMSG=d.message;MODS=null;render()}catch(e){alert(e.message)}},
  poAdd:async function(b){var id=b.dataset.id;try{await api("/prestations/option",{prestationId:+id,nom:v("po-n-"+id),prix:v("po-p-"+id),type:v("po-t-"+id)});PRESTA=null;render()}catch(e){alert(e.message)}},
  poSuppr:async function(b){try{await api("/prestations/option/supprimer",{id:+b.dataset.id});PRESTA=null;render()}catch(e){alert(e.message)}},
  addOpt:async function(b){var x=(PRESTA?PRESTA.prestations:[]).filter(function(p){return p.id===+b.dataset.pid})[0],o=x&&(x.options||[]).filter(function(y){return y.id===+b.dataset.id})[0];if(!o||!FICHE)return;
    try{await api("/devis/ligne",{repairId:FICHE.id,type:o.type,libelle:o.nom,quantite:1,prix:String(o.prixCents/100).replace(".",",")});await recharger(FICHE.id)}catch(e){alert(e.message)}},
  psSuppr:async function(b){if(!confirm("Supprimer cette prestation ?"))return;try{await api("/prestations/supprimer",{id:+b.dataset.id});PRESTA=null;render()}catch(e){alert(e.message)}},
  multiSave:async function(){try{var d=await api("/reglages/multi",{seuil:v("mu-n"),remise:v("mu-e")});PSMSG=d.message;PRESTA=null;render()}catch(e){PSMSG=e.message;render()}},
  avSave:async function(){var dec=v("avd");try{var d=await api("/avantages",{libelle:v("avl"),declencheur:dec,seuil:v("avs"),dateDebut:v("avdd"),dateFin:v("avdf"),effet:v("ave"),valeur:v("avv")});AVL=null;AVMSG=d.message||"Avantage ajouté.";CAV=null;render()}catch(e){AVMSG=e.message;render()}},
  avEtat:async function(b){try{await api("/avantages/etat",{id:+b.dataset.id,actif:b.dataset.v==="1"});AVL=null;CAV=null;render()}catch(e){alert(e.message)}},
  avSuppr:async function(b){if(!confirm("Supprimer cet avantage ?"))return;try{await api("/avantages/supprimer",{id:+b.dataset.id});AVL=null;CAV=null;render()}catch(e){alert(e.message)}},
  avType:function(){AVDEC=v("avd");AVF={libelle:v("avl"),seuil:v("avs"),dd:v("avdd"),df:v("avdf"),effet:v("ave"),valeur:v("avv")};render()},
  saveGarP:async function(){try{var d=await api("/parametres/garantie",{jours:v("gj1")});GARP=null;alert(d.message);render()}catch(e){var m=document.getElementById("garmsg");if(m)m.textContent=e.message}},
  saveParam:async function(){try{var d=await api("/parametres",{eurosPourPalier:v("pe1"),remiseEuros:v("pr1")});PARAM=null;alert(d.message);render()}catch(e){var m=document.getElementById("parmsg");if(m)m.textContent=e.message}}
};
document.addEventListener("change",function(e){var t=e.target;if(t&&t.dataset&&t.dataset.act==="avType")ACTS.avType()});
document.addEventListener("input",function(e){var t=e.target;if(!t||!t.dataset)return;if(t.dataset.act==="cQte"){PAN[+t.dataset.i].quantite=Math.max(1,Number(t.value)||1)}if(t.dataset.act==="cPrix"){PAN[+t.dataset.i].prix=t.value}if(t.dataset.act==="cSerie"){var sl=PAN[+t.dataset.i];sl.series=sl.series||[];sl.series[+t.dataset.k]=t.value}});
`;
