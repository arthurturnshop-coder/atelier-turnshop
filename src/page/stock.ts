export const STOCK = `// ---------- Stock maison + inventaire par emplacement ----------
var STAS="",STK=null,STMSG="",STSUB="liste",STQ="",STLIEU="",STINV={lieu:"",cur:"",scans:[],noms:{}},STAP=null;
function stPanneau(){return/^[A-Z]+$/.test(STINV.lieu)}
function stSuiv(c,d){var m=String(c).match(/^([A-Z]+)([0-9]+)$/);if(!m)return c;var n=Math.max(1,Number(m[2])+d);return m[1]+n}
function stFocus(id){setTimeout(function(){var e=document.getElementById(id);if(e)e.focus()},30)}
function vStock(){
  var h="<div class='pmsg'>"+esc(STMSG)+"</div><div class='actions'><button class='"+(STSUB==="liste"?"":"sec")+"' data-act='stSub' data-s='liste'>Stock</button><button class='"+(STSUB==="inv"?"":"sec")+"' data-act='stSub' data-s='inv'>Inventaire d'un emplacement</button></div>";
  if(STSUB==="inv"){app.innerHTML=h+vInv();stFocus(STINV.lieu?"iscan":"ilieu");return}
  if(!STK){app.innerHTML=h+"<div class='card'>Chargement…</div>";api("/stock?magasin="+encodeURIComponent(MAG||"")).then(function(d){STK=d;render()}).catch(function(e){STMSG=e.message;STK={produits:[],lieux:[],nb:0,valeurAchatHtCents:0};render()});return}
  h+="<div class='card'><div class='step'>Ajout rapide</div><div class='muted'>Scanne l'EAN-13 (ou laisse vide : un EAN-13 interne commençant par 200 est créé, à étiqueter), tape le nom et le prix, Entrée. Si le code existe déjà, la quantité s'ajoute.</div>"
    +"<div class='dl' style='margin-top:6px'><input id='sk' class='lb' placeholder='EAN-13 (scan) - vide = généré'><input id='sn' class='lb' placeholder='Nom du produit'><input id='sp' class='p' placeholder='Prix vente TTC'><input id='sa' class='p' placeholder='Achat HT'><input id='sq' class='q' type='number' min='1' value='1' title='Quantité'><input id='sm' class='q' type='number' min='0' placeholder='Min' title='Stock minimum : en dessous, une commande est suggérée'><input id='sl' class='q' placeholder='Empl.' value='"+esc(STLIEU)+"' title='Emplacement (A11…)'></div>"
    +"<div class='actions'><button data-act='stAdd'>Ajouter au stock</button><button class='sec' data-act='stCodesFourn'>Récupérer les codes-barres fournisseurs (Ewheel)</button><button class='sec' data-act='stCodesShopify'>Créer des codes internes pour le reste</button></div></div>";
  h+="<div class='card'><div class='step'>Associer un code-barres fournisseur à un produit Shopify</div><div class='muted'>1) Scanne le code-barres du carton. 2) Cherche le produit (ex : pneu plein Xiaomi) et clique la bonne variante : le code est écrit dans Shopify.</div>"
    +"<div class='dl' style='margin-top:6px'><input id='asc' class='lb' placeholder='Scanne le code-barres du fournisseur' value='"+esc(STAS)+"'></div>"+prodBox("assoc")+"</div>";
  h+="<div class='card'><div class='head'><div class='step'>Stock "+esc(STK.magasin||"")+" : "+STK.nb+" produit"+(STK.nb>1?"s":"")+" en stock"+(STK.valeurAchatHtCents?" · valeur d'achat HT "+eur(STK.valeurAchatHtCents):"")+"</div><input id='stq' class='lb' placeholder='Chercher (nom, code, emplacement)' value='"+esc(STQ)+"'></div>";
  if(!STK.produits.length)h+="<div class='muted'>Aucun produit.</div>";
  else h+="<table class='devis' style='width:100%'><tr><th>Produit</th><th>Empl.</th><th class='n'>Achat HT</th><th class='n'>Vente</th><th class='n'>Qté</th><th class='n'>Min</th><th></th></tr>"+STK.produits.map(function(p){
    return"<tr><td>"+esc(p.nom)+"<div class='muted'>"+esc(p.code)+"</div>"+(p.codes||[]).map(function(x){return"<div class='muted'>"+esc(x.code)+(x.fournisseur?" ("+esc(x.fournisseur)+")":"")+(x.denomination?" - "+esc(x.denomination):"")+" <button class='link' data-act='stCodeRet' data-id='"+p.id+"' data-c='"+esc(x.code)+"'>retirer</button></div>"}).join("")+"</td><td>"+esc(p.emplacement||"-")+"</td><td class='n'>"+(p.achatHtCents==null?"-":eur(p.achatHtCents))+"</td><td class='n'>"+eur(p.prixCents)+"</td>"
      +"<td class='n'><button class='sec' data-act='stDelta' data-id='"+p.id+"' data-d='-1'>-</button> <b>"+p.qte+"</b> <button class='sec' data-act='stDelta' data-id='"+p.id+"' data-d='1'>+</button></td>"
      +"<td class='n'>"+(p.min?(p.qte<p.min?"<span class='tag warn'>"+p.min+"</span>":p.min):"-")+"</td><td class='n'><button class='link' data-act='stEtq' data-id='"+p.id+"'>Étiquette</button> <button class='link' data-act='stCodeAdd' data-id='"+p.id+"'>+ Code</button> <button class='link' data-act='stFus' data-id='"+p.id+"'>Fusionner</button> <button class='link' data-act='stEdit' data-id='"+p.id+"'>Modifier</button> <button class='link' data-act='stDel' data-id='"+p.id+"'>Retirer</button></td></tr>"}).join("")+"</table>";
  app.innerHTML=h+"</div>";
  if(!STQ)stFocus("sk")}
function stProd(id){return(STK&&STK.produits||[]).filter(function(p){return p.id===id})[0]}
function stRun(p,msg){return p.then(function(d){STMSG=(d&&d.message)||msg||"";STK=null;render()}).catch(function(e){STMSG=e.message;render()})}
ACTS.stSub=function(b){STSUB=b.dataset.s;STMSG="";STAP=null;render()};
ACTS.stAdd=function(){
  stRun(api("/stock/rapide",{magasin:MAG||"",code:v("sk"),nom:v("sn"),prix:v("sp"),achat:v("sa"),qte:v("sq")||1,min:v("sm"),emplacement:v("sl")}).then(function(d){STLIEU=v("sl")||STLIEU;return d}));
  };
ACTS.stCode=function(){
  var c=v("sk");if(!c)return;
  api("/stock/scan",{magasin:MAG||"",code:c}).then(function(d){var p=d.produit,sh=d.shopify;if(p||sh)bipOk();else bipKo();if(!p&&sh){document.getElementById("sn").value=sh.nom;document.getElementById("sp").value=sh.prixCents?(sh.prixCents/100).toFixed(2):"";document.getElementById("sa").value=sh.achatHtCents==null?"":(sh.achatHtCents/100).toFixed(2);STMSG="Trouvé dans le catalogue Shopify : "+sh.nom+". Indique la quantité et l'emplacement.";var m2=document.querySelector(".pmsg");if(m2)m2.textContent=STMSG;stFocus("sq");return}if(p){document.getElementById("sn").value=p.nom;document.getElementById("sp").value=p.prixCents?(p.prixCents/100).toFixed(2):"";document.getElementById("sa").value=p.achatHtCents==null?"":(p.achatHtCents/100).toFixed(2);if(p.emplacement)document.getElementById("sl").value=p.emplacement;if(p.min)document.getElementById("sm").value=p.min;STMSG="Déjà en stock : "+p.nom+" ("+p.qte+"). La quantité saisie s'ajoutera.";var m=document.querySelector(".pmsg");if(m)m.textContent=STMSG;stFocus("sq")}else stFocus("sn")}).catch(function(){})};
ACTS.stSearch=function(){STQ=v("stq");api("/stock?magasin="+encodeURIComponent(MAG||"")+"&q="+encodeURIComponent(STQ)).then(function(d){STK=d;var p=STQ;render();var e=document.getElementById("stq");if(e){e.focus();e.setSelectionRange(p.length,p.length)}}).catch(function(){})};
ACTS.stDelta=function(b){stRun(api("/stock/maj",{id:+b.dataset.id,delta:+b.dataset.d}),"")};
ACTS.stDel=function(b){var p=stProd(+b.dataset.id);if(p&&confirm("Retirer "+p.nom+" du stock ? (récupérable en le rescannant)"))stRun(api("/stock/archiver",{id:p.id}))};
ACTS.stEtq=function(b){var p=stProd(+b.dataset.id);if(!p)return;ETQ.push({empl:p.emplacement||"",titre:p.nom,prix:(p.prixCents/100).toFixed(2),barcode:p.code,sku:"",qte:Math.max(1,p.qte)});btnFlash(b,"✓ Ajoutée");toastOk("Étiquette ajoutée au panier d étiquettes ("+ETQ.length+")")};
ACTS.stEdit=function(b){var p=stProd(+b.dataset.id);if(!p)return;
  var n=prompt("Nom",p.nom);if(n===null)return;
  var pv=prompt("Prix de vente TTC",(p.prixCents/100).toFixed(2));if(pv===null)return;
  var a=prompt("Prix d'achat HT (vide = inconnu)",p.achatHtCents==null?"":(p.achatHtCents/100).toFixed(2));if(a===null)return;
  var l=prompt("Emplacement",p.emplacement);if(l===null)return;
  var mn=prompt("Stock minimum (0 = pas de suggestion de commande)",p.min||0);if(mn===null)return;
  stRun(api("/stock/maj",{id:p.id,nom:n,prix:pv,achat:a,emplacement:l,min:mn}))};
ACTS.stCodeAdd=function(b){var p=stProd(+b.dataset.id);if(!p)return;
  var c=prompt("Scanne le code-barres de l autre grossiste pour : "+p.nom);if(!c)return;
  var f=prompt("Grossiste (facultatif, ex : Ewheel)","");if(f===null)f="";
  var dn=prompt("Denomination de cette reference (facultatif, ex : CST 8,5x2 - sert dans les alertes de commande)","");if(dn===null)dn="";
  stRun(api("/stock/code-ajouter",{id:p.id,code:c.replace(/ /g,""),fournisseur:f,denomination:dn}))};
ACTS.stCodeRet=function(b){if(confirm("Retirer ce code de la fiche ?"))stRun(api("/stock/code-retirer",{id:+b.dataset.id,code:b.dataset.c}))};
ACTS.stFus=function(b){var p=stProd(+b.dataset.id);if(!p)return;
  var a=prompt("Fusionner dans : "+p.nom+" (la quantite s ajoute, les codes sont regroupes). Scanne le code ou tape le nom de l AUTRE fiche (le meme produit) :");if(!a)return;
  stRun(api("/stock/fusionner",{id:p.id,autre:a}))};
// ----- Inventaire -----
function vInv(){
  var h="<div class='card'><div class='step'>Inventaire partiel</div><div class='muted'>Un rayon (A11) ou tout un panneau (tape juste A : il couvre A11, A12, A22…). Dans un panneau, tape ou scanne d'abord le rayon (A11), puis les produits de ce rayon, puis le rayon suivant. Ce qui était rangé là mais n'est pas scanné sera retiré du stock.</div>";
  h+="<div class='dl' style='margin-top:6px'><input id='ilieu' class='q' placeholder='A11 ou A' value='"+esc(STINV.lieu)+"'><input id='iscan' class='lb' placeholder='"+(stPanneau()?"Rayon (A11) ou produit":"Scanne un produit")+"'></div></div>";
  if(STAP){
    var a=STAP;
    h+="<div class='card'><div class='step'>Contrôle avant validation : "+esc(a.emplacement)+"</div>"
      +"<div>"+a.scannes+" produit(s) reconnus."+(a.sansLieu?" <span class='tag warn'>"+a.sansLieu+" scan(s) sans rayon précis (rangés sous "+esc(a.emplacement)+")</span>":"")+"</div>"
      +(a.absents.length?"<div class='step' style='margin-top:8px'>Non retrouvés : seront retirés du stock ("+a.absents.length+")</div>"+a.absents.map(function(p){return"<div>"+esc(p.nom)+" <span class='muted'>"+esc(p.code)+" · "+p.qte+" en stock</span></div>"}).join(""):"<div class='muted'>Aucun produit manquant.</div>")
      +(a.deplaces.length?"<div class='step' style='margin-top:8px'>Déplacés ("+a.deplaces.length+")</div>"+a.deplaces.map(function(p){return"<div>"+esc(p.nom)+" <span class='muted'>"+esc(p.emplacement||"-")+" → "+esc(p.vers)+"</span></div>"}).join(""):"")
      +(a.ecarts.length?"<div class='step' style='margin-top:8px'>Quantités corrigées ("+a.ecarts.length+")</div>"+a.ecarts.map(function(p){return"<div>"+esc(p.nom)+" <span class='muted'>"+p.qte+" → "+p.compte+"</span></div>"}).join(""):"")
      +(a.revenus.length?"<div class='step' style='margin-top:8px'>Remis en stock ("+a.revenus.length+")</div>"+a.revenus.map(function(p){return"<div>"+esc(p.nom)+"</div>"}).join(""):"")
      +(a.inconnus.length?"<div class='step' style='margin-top:8px'>Nouveaux produits ("+a.inconnus.length+")</div>"+a.inconnus.map(function(p){return"<div>"+(p.shopify?esc(p.nom)+" <span class='muted'>"+esc(p.code)+" x"+p.qte+" · sera créé en "+esc(p.vers)+" depuis Shopify</span>":esc(p.code)+" x"+p.qte+" <span class='muted'>inconnu : à créer à la main dans Stock</span>")+"</div>"}).join(""):"")
      +"<div class='actions'><button data-act='iOk'>Valider l'inventaire</button><button class='sec' data-act='iBack'>Continuer à scanner</button></div></div>";
    return h}
  var codes=STINV.scans.reduce(function(m,s){m[s.code]=(m[s.code]||0)+1;return m},{}),ks=Object.keys(codes);
  if(stPanneau()){
    if(!STINV.cur)STINV.cur=STINV.lieu+"1";
    var nbc=STINV.scans.filter(function(x){return x.emplacement===STINV.cur}).length;
    h+="<div class='card'><div class='step'>Rayon en cours</div><div class='dl' style='align-items:center'><button class='sec' data-act='iPrec'>← Précédent</button><input id='icur' class='q' value='"+esc(STINV.cur)+"' style='font-weight:700;text-align:center'><button data-act='iSuiv'>Suivant →</button><span class='muted'>"+nbc+" pièce"+(nbc>1?"s":"")+" scannée"+(nbc>1?"s":"")+" ici</span></div><div class='muted'>Scanne les produits du rayon, puis clique Suivant : le rayon passe à "+esc(stSuiv(STINV.cur,1))+". Tu peux aussi taper un autre rayon dans la case.</div></div>"}
  h+="<div class='card'><div class='step'>Scannés ("+STINV.scans.length+" pièce"+(STINV.scans.length>1?"s":"")+", "+ks.length+" référence"+(ks.length>1?"s":"")+")</div>";
  if(!ks.length)h+="<div class='muted'>Rien de scanné pour l'instant.</div>";
  else h+=ks.map(function(k){return"<div>"+esc(STINV.noms[k]||"Code inconnu")+" <span class='muted'>"+esc(k)+"</span> <b>x"+codes[k]+"</b> <button class='link' data-act='iMoins' data-c='"+esc(k)+"'>-1</button></div>"}).join("");
  h+="<div class='actions'><button data-act='iFin'"+(STINV.scans.length&&STINV.lieu?"":" disabled")+">Terminer et contrôler</button><button class='sec' data-act='iReset'>Tout effacer</button></div></div>";
  return h}
ACTS.iLieu=function(){STINV.lieu=v("ilieu").toUpperCase().replace(/ /g,"");STINV.cur=stPanneau()?STINV.lieu+"1":"";render()};
function iCurLire(){var e=document.getElementById("icur");if(e&&e.value.trim())STINV.cur=e.value.toUpperCase().replace(/ /g,"")}
ACTS.iSuiv=function(){iCurLire();STINV.cur=stSuiv(STINV.cur,1);render()};
ACTS.iPrec=function(){iCurLire();STINV.cur=stSuiv(STINV.cur,-1);render()};
ACTS.iScan=function(){
  var c=v("iscan").replace(/ /g,"");if(!c)return;
  if(!STINV.lieu){STINV.lieu=v("ilieu").toUpperCase().replace(/ /g,"");if(!STINV.lieu){STMSG="Indique d'abord l'emplacement.";render();return}}
  if(stPanneau()&&/^[A-Za-z]{1,3}[0-9]{1,3}$/.test(c)&&c.toUpperCase().indexOf(STINV.lieu)===0){STINV.cur=c.toUpperCase();STMSG="";render();return}
  if(stPanneau()&&!STINV.cur)STINV.cur=STINV.lieu+"1";
  if(stPanneau())iCurLire();
  STINV.scans.push({code:c,qte:1,emplacement:stPanneau()?STINV.cur:STINV.lieu});
  if(STINV.noms[c]===undefined){STINV.noms[c]="";api("/stock/scan",{magasin:MAG||"",code:c}).then(function(d){STINV.noms[c]=d.produit?d.produit.nom:(d.shopify?d.shopify.nom+" (Shopify)":"");if(STINV.noms[c])bipOk();else bipKo();if(STSUB==="inv"&&!STAP)render()}).catch(function(){})}
  STMSG="";render()};
ACTS.iMoins=function(b){var c=b.dataset.c;for(var i=STINV.scans.length-1;i>=0;i--)if(STINV.scans[i].code===c){STINV.scans.splice(i,1);break}render()};
ACTS.iReset=function(){STINV={lieu:STINV.lieu,cur:"",scans:[],noms:{}};STAP=null;render()};
ACTS.iBack=function(){STAP=null;render()};
ACTS.iFin=function(){STINV.lieu=v("ilieu").toUpperCase().replace(/ /g,"")||STINV.lieu;api("/stock/inventaire",{magasin:MAG||"",emplacement:STINV.lieu,scans:STINV.scans}).then(function(d){STAP=d.apercu;render()}).catch(function(e){STMSG=e.message;render()})};
ACTS.iOk=function(){api("/stock/inventaire",{magasin:MAG||"",emplacement:STINV.lieu,scans:STINV.scans,appliquer:true}).then(function(d){STMSG=d.message;STINV={lieu:"",cur:"",scans:[],noms:{}};STAP=null;STK=null;render()}).catch(function(e){STMSG=e.message;render()})};
// Entrée = valider le champ (scanner ou clavier)
document.addEventListener("keydown",function(e){
  if(e.key!=="Enter")return;var t=e.target;if(!t||TAB!=="stock")return;
  if(t.id==="iscan"){e.preventDefault();ACTS.iScan();return}
  if(t.id==="ilieu"){e.preventDefault();ACTS.iLieu();stFocus("iscan");return}
  if(t.id==="sk"){e.preventDefault();ACTS.stCode();return}
  if(t.id==="sn"||t.id==="sp"||t.id==="sa"||t.id==="sq"||t.id==="sm"||t.id==="sl"){e.preventDefault();ACTS.stAdd()}});
document.addEventListener("input",function(e){var t=e.target;if(t&&t.id==="stq"&&TAB==="stock"){clearTimeout(window.__stt);window.__stt=setTimeout(ACTS.stSearch,250)}});
document.addEventListener("input",function(e){if(e.target&&e.target.id==="asc")STAS=e.target.value.trim()});
document.addEventListener("keydown",function(e){if(e.target&&e.target.id==="asc"&&e.key==="Enter"){e.preventDefault();var b=document.querySelector("[data-ps=assoc]");if(b)b.focus()}});
ACTS.stAssocie=async function(x,force){
  var code=STAS;if(!code){alert("Scanne d abord le code-barres du fournisseur.");return}
  try{var d=await api("/stock/associer-code",{code:code,variantId:x.id,force:!!force});
    if(d.conflit){if(confirm(d.message))return ACTS.stAssocie(x,true);return}
    STMSG=d.message;STAS="";render()}catch(err){alert(err.message)}};
ACTS.stCodesFourn=function(){
  if(!confirm("Copier les vrais codes-barres Ewheel dans Shopify pour tous les produits qui n en ont pas ? Ca tourne en arriere-plan : tu peux laisser la page ouverte."))return;
  function aff(d){STMSG=(d.enCours?"⏳ ":"")+d.phase+" · lus "+d.lus+" · a ecrire "+d.aFaire+" · ecrits "+d.faits+(d.erreurs?" · erreurs "+d.erreurs+(d.derniereErreur?" ("+d.derniereErreur+")":""):"")+(d.droits?" · DROITS ACTUELS DE L APP : "+d.droits:"")+(d.fini?" · doublons ignores "+d.doublons+" · sans code fournisseur "+d.sansCode:"");render()}
  function suite(){api("/stock/codes-fournisseurs").then(function(d){aff(d);if(d.enCours)setTimeout(suite,2500)}).catch(function(e){STMSG=e.message;render()})}
  api("/stock/codes-fournisseurs",{}).then(function(d){aff(d);if(d.enCours)setTimeout(suite,2500)}).catch(function(e){STMSG=e.message;render()})};
ACTS.stCodesShopify=function(){
  if(!confirm("Donner un code-barres EAN-13 a tous les produits Shopify qui n en ont pas ? (ecrit dans Shopify, 100 produits a la fois)"))return;
  STMSG="Creation des codes-barres Shopify...";render();
  api("/stock/codes-shopify",{}).then(function(d){STMSG=d.faits+" produit(s) Shopify codes. "+(d.restant?"Il en reste "+d.restant+" : clique encore.":"Tout est fait.");render()}).catch(function(e){STMSG=e.message;render()})};
`;
