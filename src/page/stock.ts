export const STOCK = `// ---------- Stock maison + inventaire par emplacement ----------
var STK=null,STMSG="",STSUB="liste",STQ="",STLIEU="",STINV={lieu:"",scans:[],noms:{}},STAP=null;
function stFocus(id){setTimeout(function(){var e=document.getElementById(id);if(e)e.focus()},30)}
function vStock(){
  var h="<div class='pmsg'>"+esc(STMSG)+"</div><div class='actions'><button class='"+(STSUB==="liste"?"":"sec")+"' data-act='stSub' data-s='liste'>Stock</button><button class='"+(STSUB==="inv"?"":"sec")+"' data-act='stSub' data-s='inv'>Inventaire d'un emplacement</button></div>";
  if(STSUB==="inv"){app.innerHTML=h+vInv();stFocus(STINV.lieu?"iscan":"ilieu");return}
  if(!STK){app.innerHTML=h+"<div class='card'>Chargement…</div>";api("/stock").then(function(d){STK=d;render()}).catch(function(e){STMSG=e.message;STK={produits:[],lieux:[],nb:0,valeurAchatHtCents:0};render()});return}
  h+="<div class='card'><div class='step'>Ajout rapide</div><div class='muted'>Scanne le code-barres (ou laisse vide : un code interne est créé), tape le nom et le prix, Entrée. Si le code existe déjà, la quantité s'ajoute.</div>"
    +"<div class='dl' style='margin-top:6px'><input id='sk' class='lb' placeholder='Code-barres (scan)'><input id='sn' class='lb' placeholder='Nom du produit'><input id='sp' class='p' placeholder='Prix vente TTC'><input id='sa' class='p' placeholder='Achat HT'><input id='sq' class='q' type='number' min='1' value='1' title='Quantité'><input id='sl' class='q' placeholder='Empl.' value='"+esc(STLIEU)+"' title='Emplacement (A11…)'></div>"
    +"<div class='actions'><button data-act='stAdd'>Ajouter au stock</button></div></div>";
  h+="<div class='card'><div class='head'><div class='step'>"+STK.nb+" produit"+(STK.nb>1?"s":"")+" en stock"+(STK.valeurAchatHtCents?" · valeur d'achat HT "+eur(STK.valeurAchatHtCents):"")+"</div><input id='stq' class='lb' placeholder='Chercher (nom, code, emplacement)' value='"+esc(STQ)+"'></div>";
  if(!STK.produits.length)h+="<div class='muted'>Aucun produit.</div>";
  else h+="<table class='devis' style='width:100%'><tr><th>Produit</th><th>Empl.</th><th class='n'>Achat HT</th><th class='n'>Vente</th><th class='n'>Qté</th><th></th></tr>"+STK.produits.map(function(p){
    return"<tr><td>"+esc(p.nom)+"<div class='muted'>"+esc(p.code)+"</div></td><td>"+esc(p.emplacement||"-")+"</td><td class='n'>"+(p.achatHtCents==null?"-":eur(p.achatHtCents))+"</td><td class='n'>"+eur(p.prixCents)+"</td>"
      +"<td class='n'><button class='sec' data-act='stDelta' data-id='"+p.id+"' data-d='-1'>-</button> <b>"+p.qte+"</b> <button class='sec' data-act='stDelta' data-id='"+p.id+"' data-d='1'>+</button></td>"
      +"<td class='n'><button class='link' data-act='stEtq' data-id='"+p.id+"'>Étiquette</button> <button class='link' data-act='stEdit' data-id='"+p.id+"'>Modifier</button> <button class='link' data-act='stDel' data-id='"+p.id+"'>Retirer</button></td></tr>"}).join("")+"</table>";
  app.innerHTML=h+"</div>";
  if(!STQ)stFocus("sk")}
function stProd(id){return(STK&&STK.produits||[]).filter(function(p){return p.id===id})[0]}
function stRun(p,msg){return p.then(function(d){STMSG=(d&&d.message)||msg||"";STK=null;render()}).catch(function(e){STMSG=e.message;render()})}
ACTS.stSub=function(b){STSUB=b.dataset.s;STMSG="";STAP=null;render()};
ACTS.stAdd=function(){
  stRun(api("/stock/rapide",{code:v("sk"),nom:v("sn"),prix:v("sp"),achat:v("sa"),qte:v("sq")||1,emplacement:v("sl")}).then(function(d){STLIEU=v("sl")||STLIEU;return d}));
  };
ACTS.stCode=function(){
  var c=v("sk");if(!c)return;
  api("/stock/scan",{code:c}).then(function(d){var p=d.produit;if(p){document.getElementById("sn").value=p.nom;document.getElementById("sp").value=p.prixCents?(p.prixCents/100).toFixed(2):"";document.getElementById("sa").value=p.achatHtCents==null?"":(p.achatHtCents/100).toFixed(2);if(p.emplacement)document.getElementById("sl").value=p.emplacement;STMSG="Déjà en stock : "+p.nom+" ("+p.qte+"). La quantité saisie s'ajoutera.";var m=document.querySelector(".pmsg");if(m)m.textContent=STMSG;stFocus("sq")}else stFocus("sn")}).catch(function(){})};
ACTS.stSearch=function(){STQ=v("stq");api("/stock?q="+encodeURIComponent(STQ)).then(function(d){STK=d;var p=STQ;render();var e=document.getElementById("stq");if(e){e.focus();e.setSelectionRange(p.length,p.length)}}).catch(function(){})};
ACTS.stDelta=function(b){stRun(api("/stock/maj",{id:+b.dataset.id,delta:+b.dataset.d}),"")};
ACTS.stDel=function(b){var p=stProd(+b.dataset.id);if(p&&confirm("Retirer "+p.nom+" du stock ? (récupérable en le rescannant)"))stRun(api("/stock/archiver",{id:p.id}))};
ACTS.stEtq=function(b){var p=stProd(+b.dataset.id);if(!p)return;ETQ.push({titre:p.nom,prix:(p.prixCents/100).toFixed(2),barcode:p.code,sku:"",qte:Math.max(1,p.qte)});TAB="etq";render()};
ACTS.stEdit=function(b){var p=stProd(+b.dataset.id);if(!p)return;
  var n=prompt("Nom",p.nom);if(n===null)return;
  var pv=prompt("Prix de vente TTC",(p.prixCents/100).toFixed(2));if(pv===null)return;
  var a=prompt("Prix d'achat HT (vide = inconnu)",p.achatHtCents==null?"":(p.achatHtCents/100).toFixed(2));if(a===null)return;
  var l=prompt("Emplacement",p.emplacement);if(l===null)return;
  stRun(api("/stock/maj",{id:p.id,nom:n,prix:pv,achat:a,emplacement:l}))};
// ----- Inventaire -----
function vInv(){
  var h="<div class='card'><div class='step'>Inventaire partiel</div><div class='muted'>Choisis l'emplacement, puis scanne tout ce qui s'y trouve (un scan par pièce). Ce qui était rangé là mais n'est pas scanné sera retiré du stock.</div>";
  h+="<div class='dl' style='margin-top:6px'><input id='ilieu' class='q' placeholder='A11' value='"+esc(STINV.lieu)+"'><input id='iscan' class='lb' placeholder='Scanne un produit'></div></div>";
  if(STAP){
    var a=STAP;
    h+="<div class='card'><div class='step'>Contrôle avant validation : "+esc(a.emplacement)+"</div>"
      +"<div>"+a.scannes+" produit(s) reconnus.</div>"
      +(a.absents.length?"<div class='step' style='margin-top:8px'>Non retrouvés : seront retirés du stock ("+a.absents.length+")</div>"+a.absents.map(function(p){return"<div>"+esc(p.nom)+" <span class='muted'>"+esc(p.code)+" · "+p.qte+" en stock</span></div>"}).join(""):"<div class='muted'>Aucun produit manquant.</div>")
      +(a.deplaces.length?"<div class='step' style='margin-top:8px'>Déplacés vers "+esc(a.emplacement)+" ("+a.deplaces.length+")</div>"+a.deplaces.map(function(p){return"<div>"+esc(p.nom)+" <span class='muted'>(était en "+esc(p.emplacement||"-")+")</span></div>"}).join(""):"")
      +(a.ecarts.length?"<div class='step' style='margin-top:8px'>Quantités corrigées ("+a.ecarts.length+")</div>"+a.ecarts.map(function(p){return"<div>"+esc(p.nom)+" <span class='muted'>"+p.qte+" → "+p.compte+"</span></div>"}).join(""):"")
      +(a.revenus.length?"<div class='step' style='margin-top:8px'>Remis en stock ("+a.revenus.length+")</div>"+a.revenus.map(function(p){return"<div>"+esc(p.nom)+"</div>"}).join(""):"")
      +(a.inconnus.length?"<div class='step' style='margin-top:8px'>Codes inconnus ("+a.inconnus.length+") : à créer dans Stock après</div>"+a.inconnus.map(function(p){return"<div>"+esc(p.code)+" x"+p.qte+"</div>"}).join(""):"")
      +"<div class='actions'><button data-act='iOk'>Valider l'inventaire</button><button class='sec' data-act='iBack'>Continuer à scanner</button></div></div>";
    return h}
  var codes=STINV.scans.reduce(function(m,s){m[s.code]=(m[s.code]||0)+1;return m},{}),ks=Object.keys(codes);
  h+="<div class='card'><div class='step'>Scannés ("+STINV.scans.length+" pièce"+(STINV.scans.length>1?"s":"")+", "+ks.length+" référence"+(ks.length>1?"s":"")+")</div>";
  if(!ks.length)h+="<div class='muted'>Rien de scanné pour l'instant.</div>";
  else h+=ks.map(function(k){return"<div>"+esc(STINV.noms[k]||"Code inconnu")+" <span class='muted'>"+esc(k)+"</span> <b>x"+codes[k]+"</b> <button class='link' data-act='iMoins' data-c='"+esc(k)+"'>-1</button></div>"}).join("");
  h+="<div class='actions'><button data-act='iFin'"+(STINV.scans.length&&STINV.lieu?"":" disabled")+">Terminer et contrôler</button><button class='sec' data-act='iReset'>Tout effacer</button></div></div>";
  return h}
ACTS.iLieu=function(){STINV.lieu=v("ilieu").toUpperCase().replace(/ /g,"");STINV.scans=STINV.scans||[]};
ACTS.iScan=function(){
  var c=v("iscan").replace(/ /g,"");if(!c)return;
  if(!STINV.lieu){STINV.lieu=v("ilieu").toUpperCase().replace(/ /g,"");if(!STINV.lieu){STMSG="Indique d'abord l'emplacement.";render();return}}
  STINV.scans.push({code:c,qte:1});
  if(STINV.noms[c]===undefined){STINV.noms[c]="";api("/stock/scan",{code:c}).then(function(d){STINV.noms[c]=d.produit?d.produit.nom:"";if(STSUB==="inv"&&!STAP)render()}).catch(function(){})}
  STMSG="";render()};
ACTS.iMoins=function(b){var c=b.dataset.c;for(var i=STINV.scans.length-1;i>=0;i--)if(STINV.scans[i].code===c){STINV.scans.splice(i,1);break}render()};
ACTS.iReset=function(){STINV={lieu:STINV.lieu,scans:[],noms:{}};STAP=null;render()};
ACTS.iBack=function(){STAP=null;render()};
ACTS.iFin=function(){STINV.lieu=v("ilieu").toUpperCase().replace(/ /g,"")||STINV.lieu;api("/stock/inventaire",{emplacement:STINV.lieu,scans:STINV.scans}).then(function(d){STAP=d.apercu;render()}).catch(function(e){STMSG=e.message;render()})};
ACTS.iOk=function(){api("/stock/inventaire",{emplacement:STINV.lieu,scans:STINV.scans,appliquer:true}).then(function(d){STMSG=d.message;STINV={lieu:"",scans:[],noms:{}};STAP=null;STK=null;render()}).catch(function(e){STMSG=e.message;render()})};
// Entrée = valider le champ (scanner ou clavier)
document.addEventListener("keydown",function(e){
  if(e.key!=="Enter")return;var t=e.target;if(!t||TAB!=="stock")return;
  if(t.id==="iscan"){e.preventDefault();ACTS.iScan();return}
  if(t.id==="ilieu"){e.preventDefault();ACTS.iLieu();stFocus("iscan");return}
  if(t.id==="sk"){e.preventDefault();ACTS.stCode();return}
  if(t.id==="sn"||t.id==="sp"||t.id==="sa"||t.id==="sq"||t.id==="sl"){e.preventDefault();ACTS.stAdd()}});
document.addEventListener("input",function(e){var t=e.target;if(t&&t.id==="stq"&&TAB==="stock"){clearTimeout(window.__stt);window.__stt=setTimeout(ACTS.stSearch,250)}});
`;
