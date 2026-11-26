export const STOCK = `// ---------- Stock maison + inventaire par emplacement ----------
var CASI=null,STAS="",STK=null,STMSG="",STSUB="liste",STQ="",STLIEU="",STINV={lieu:"",cur:"",scans:[],noms:{},info:{},alerte:null,ok:""},STAP=null;
function stPanneau(){return/^[A-Z]+$/.test(STINV.lieu)}
function stSuiv(c,d){var m=String(c).match(/^([A-Z]+)([0-9]+)$/);if(!m)return c;var n=Math.max(1,Number(m[2])+d);return m[1]+n}
function stFocus(id){setTimeout(function(){var e=document.getElementById(id);if(e)e.focus({preventScroll:true})},30)}
function vStock(){
  var h="<div class='pmsg'>"+esc(STMSG)+"</div><div class='actions'><button class='"+(STSUB==="liste"?"":"sec")+"' data-act='stSub' data-s='liste'>Stock</button><button class='"+(STSUB==="inv"?"":"sec")+"' data-act='stSub' data-s='inv'>Inventaire d'un emplacement</button><button class='"+(STSUB==="cas"?"":"sec")+"' data-act='stSub' data-s='cas'>Mes casiers</button></div>";
  if(STSUB==="cas"){app.innerHTML=h+vCasiers();return}
  if(STSUB==="inv"){app.innerHTML=h+vInv();stFocus(STINV.lieu?"iscan":"ilieu");return}
  if(!STK){app.innerHTML=h+"<div class='card'>Chargement…</div>";api("/stock?magasin="+encodeURIComponent(MAG||"")).then(function(d){STK=d;render();if(STY){var yy=STY;STY=0;window.scrollTo(0,yy);setTimeout(function(){window.scrollTo(0,yy)},60)}}).catch(function(e){STMSG=e.message;STK={produits:[],lieux:[],nb:0,valeurAchatHtCents:0};render()});return}
  h+="<div class='card'><div class='step'>Ajout rapide</div><div class='muted'>Scanne les produits : chaque scan s'ajoute à la liste ci-dessous (même produit = quantité +1). Modifie ce que tu veux dans la liste, puis clique sur « Ajouter au stock ». Sans code : tape le nom et Entrée (un EAN interne est créé, à étiqueter).</div>"
    +"<div class='card' style='margin:8px 0;padding:10px;background:#f1f7f2'><b>📍 Emplacement en cours : <span style='font-size:22px'>"+esc(STLIEU||"—")+"</span></b><div class='muted'>Les produits scannés sont rangés ici. Change d'emplacement avec les boutons.</div><div class='actions'><button class='sec' data-act='lieuCase'>Case suivante (A11 → A12)</button><button class='sec' data-act='lieuEtage'>⬆ Étage suivant (A11 → A21)</button><button class='sec' data-act='lieuPanneau'>➡ Panneau suivant (A21 → B11)</button></div></div>"
    +"<div class='dl' style='margin-top:6px'><input id='sk' class='lb' placeholder='EAN-13 (scan) - vide = généré'><input id='sn' class='lb' placeholder='Nom du produit'><input id='sp' class='p' placeholder='Prix vente TTC'><input id='sa' class='p' placeholder='Achat HT'><input id='sq' class='q' type='number' min='1' value='1' title='Quantité'><input id='sm' class='q' type='number' min='0' placeholder='Min' title='Stock minimum : en dessous, une commande est suggérée'><input id='sl' class='q' placeholder='Empl.' value='"+esc(STLIEU)+"' title='Emplacement (A11…)'></div>"
    +""+stbHtml()+"<div class='actions'><button class='sec' data-act='stCodesFourn'>Récupérer les codes-barres fournisseurs (Ewheel)</button><button class='sec' data-act='stCodesShopify'>Créer des codes internes pour le reste</button></div></div>";
  h+="<div class='card'><div class='step'>Associer un code-barres fournisseur à un produit Shopify</div><div class='muted'>1) Scanne le code-barres du carton. 2) Cherche le produit (ex : pneu plein Xiaomi) et clique la bonne variante : le code est écrit dans Shopify.</div>"
    +"<div class='dl' style='margin-top:6px'><input id='asc' class='lb' placeholder='Scanne le code-barres du fournisseur' value='"+esc(STAS)+"'></div>"+prodBox("assoc")+"</div>";
  h+="<div class='card'><div class='head'><div class='step'>Stock "+esc(STK.magasin||"")+" : "+STK.nb+" produit"+(STK.nb>1?"s":"")+" en stock"+(STK.valeurAchatHtCents?" · valeur d'achat HT "+eur(STK.valeurAchatHtCents):"")+"</div><input id='stq' class='lb' placeholder='Chercher (nom, code, emplacement)' value='"+esc(STQ)+"'></div>"+(STK.produits.length&&/^[a-zA-Z]{1,2}[0-9]{0,3}$/.test(STQ.trim())&&STK.produits.every(function(p){return String(p.emplacement||"").toUpperCase().indexOf(STQ.trim().toUpperCase())===0})?"<div class='actions' style='margin:6px 0'><button data-act='stEtqTous'>🏷 Mettre les "+STK.produits.length+" produits de « "+esc(STQ.trim().toUpperCase())+" » dans le panier d'étiquettes</button></div>":"");
  if(!STK.produits.length)h+="<div class='muted'>Aucun produit.</div>";
  else h+="<table class='devis' style='width:100%'><tr><th>Produit</th><th>Empl.</th><th class='n'>Achat HT</th><th class='n'>Vente</th><th class='n'>Qté</th><th class='n'>Min</th><th></th></tr>"+STK.produits.map(function(p){
    if(p.id===STEDIT)return stEditRow(p);
    return"<tr><td>"+esc(p.nom)+"<div class='muted'>"+esc(p.code)+"</div>"+(p.codes||[]).map(function(x){return"<div class='muted'>"+esc(x.code)+(x.fournisseur?" ("+esc(x.fournisseur)+")":"")+(x.denomination?" - "+esc(x.denomination):"")+" <button class='link' data-act='stCodeRet' data-id='"+p.id+"' data-c='"+esc(x.code)+"'>retirer</button></div>"}).join("")+"</td><td>"+esc(p.emplacement||"-")+"</td><td class='n'>"+(p.achatHtCents==null?"-":eur(p.achatHtCents))+"</td><td class='n'>"+eur(p.prixCents)+"</td>"
      +"<td class='n'><button class='sec' data-act='stDelta' data-id='"+p.id+"' data-d='-1'>-</button> <b>"+p.qte+"</b> <button class='sec' data-act='stDelta' data-id='"+p.id+"' data-d='1'>+</button></td>"
      +"<td class='n'>"+(p.min?(p.qte<p.min?"<span class='tag warn'>"+p.min+"</span>":p.min):"-")+"</td><td class='n'><button class='link' data-act='stEtq' data-id='"+p.id+"'>Étiquette</button> <button class='link' data-act='stCodeAdd' data-id='"+p.id+"'>+ Code</button> <button class='link' data-act='stFus' data-id='"+p.id+"'>Fusionner</button> <button class='link' data-act='stEdit' data-id='"+p.id+"'>Modifier</button> <button class='link' data-act='stDel' data-id='"+p.id+"'>Retirer</button></td></tr>"}).join("")+"</table>";
  app.innerHTML=h+"</div>";
  if(STEDIT){stFocus("e_nom")}else if(!STQ)stFocus("sk")}
function stProd(id){return(STK&&STK.produits||[]).filter(function(p){return p.id===id})[0]}
var STY=0;
function stRun(p,msg){var y0=window.scrollY||0;return p.then(function(d){STMSG=(d&&d.message)||msg||"";STY=y0;STK=null;render()}).catch(function(e){STMSG=e.message;render()})}
ACTS.stSub=function(b){STSUB=b.dataset.s;CASI=null;STMSG="";STAP=null;render()};
var STB=[];try{STB=JSON.parse(localStorage.getItem("atelierStockLot")||"[]")||[]}catch(e){STB=[]}
function stbSave(){try{localStorage.setItem("atelierStockLot",JSON.stringify(STB))}catch(e){}}
function stbPush(o){
  var ex=o.code?STB.filter(function(l){return l.code===o.code})[0]:null;
  if(ex){ex.qte=(Number(ex.qte)||0)+(Number(o.qte)||1)}else STB.unshift(o);
  stbSave()}
function stbHtml(){
  if(!STB.length)return"<div class='muted' style='margin-top:8px'>Scanne un produit : il s'ajoute ici. Tu peux tout modifier dans la liste, puis clique sur « Ajouter au stock ».</div>";
  var nb=STB.reduce(function(s,l){return s+(Number(l.qte)||0)},0);
  var h="<div class='step' style='margin-top:10px'>À ajouter au stock : "+STB.length+" ligne"+(STB.length>1?"s":"")+" · "+nb+" pièce"+(nb>1?"s":"")+"</div><div class='scrollx'><table><tr><th>Produit</th><th>Prix TTC</th><th>Achat HT</th><th>Qté</th><th>Min</th><th>Empl.</th><th></th></tr>";
  STB.forEach(function(l,i){
    var f=function(k,c,w,t){return"<input class='stbf "+c+"' data-i='"+i+"' data-k='"+k+"' value='"+esc(l[k]==null?"":l[k])+"'"+(t?" type='number' min='0'":"")+" style='width:"+w+"'>"};
    h+="<tr><td>"+f("nom","lb","100%")+"<div class='muted'>"+(l.code?esc(l.code):"code interne généré")+(l.nouveau?" · nouveau":"")+"</div></td><td>"+f("prix","p","70px")+"</td><td>"+f("achat","p","70px")+"</td><td>"+f("qte","q","60px",1)+"</td><td>"+f("min","q","55px",1)+"</td><td>"+f("empl","q","60px")+"</td><td><button class='link' data-act='stbDel' data-i='"+i+"'>✕</button></td></tr>"});
  return h+"</table></div><div class='actions'><button data-act='stAdd'>Ajouter au stock ("+nb+")</button><button class='sec' data-act='stbVider'>Vider la liste</button></div>"}
document.addEventListener("input",function(e){var t=e.target;if(!t||!t.classList||!t.classList.contains("stbf"))return;var l=STB[+t.dataset.i];if(l){l[t.dataset.k]=t.value;stbSave()}});
function lieuDecoupe(l){var m=String(l||"").toUpperCase().replace(/\\s+/g,"").match(/^([A-Z]+)(\\d)(\\d+)$/);return m?{p:m[1],e:+m[2],c:+m[3]}:null}
function lieuPanneauSuiv(p){var a=p.split(""),i=a.length-1;while(i>=0){if(a[i]==="Z"){a[i]="A";i--}else{a[i]=String.fromCharCode(a[i].charCodeAt(0)+1);return a.join("")}}return"A"+a.join("")}
function lieuLibre(){var cur=String(STLIEU||"").toUpperCase().replace(/\\s+/g,"");if(!cur)return"";if(STB.some(function(l){return String(l.empl||"").toUpperCase()===cur})){var d=lieuDecoupe(cur);if(d){cur=d.p+d.e+(d.c+1);STLIEU=cur}}return cur}
function lieuGo(mode){
  var cur=(v("sl")||STLIEU||"").toUpperCase().replace(/\\s+/g,""),d=lieuDecoupe(cur);
  if(!d){STMSG="Tape d'abord un emplacement de départ (ex : A11) dans la case Empl.";render();return}
  var n=mode==="case"?d.p+d.e+(d.c+1):mode==="etage"?d.p+(d.e+1)+"1":lieuPanneauSuiv(d.p)+"11";
  STLIEU=n;STMSG="Emplacement : "+n;render();stFocus("sk")}
ACTS.lieuCase=function(){lieuGo("case")};
ACTS.lieuEtage=function(){lieuGo("etage")};
ACTS.lieuPanneau=function(){lieuGo("panneau")};
document.addEventListener("input",function(e){if(e.target&&e.target.id==="sl")STLIEU=e.target.value.toUpperCase().replace(/\\s+/g,"")});
ACTS.stbDel=function(b){STB.splice(+b.dataset.i,1);stbSave();render()};
ACTS.stbVider=function(){if(!confirm("Vider la liste ?"))return;STB=[];stbSave();render()};
ACTS.stLigne=function(){
  var nom=v("sn"),code=v("sk");
  if(!nom&&!code)return;
  if(code&&!nom){ACTS.stCode();return}
  stbPush({code:code,nom:nom,prix:v("sp"),achat:v("sa"),qte:v("sq")||1,min:v("sm"),empl:lieuLibre()});
  STLIEU=v("sl")||STLIEU;render();stFocus("sk")};
ACTS.stAdd=async function(){
  if(v("sn"))ACTS.stLigne();
  if(!STB.length)return;
  var ok=0,ko=[],rest=[];
  for(var i=0;i<STB.length;i++){var l=STB[i];
    try{await api("/stock/rapide",{magasin:MAG||"",code:l.code,nom:l.nom,prix:l.prix,achat:l.achat,qte:l.qte||1,min:l.min,emplacement:l.empl});ok++}
    catch(e){ko.push((l.nom||l.code)+" : "+e.message);rest.push(l)}}
  STB=rest;stbSave();
  STMSG=ok+" ligne"+(ok>1?"s":"")+" ajoutée"+(ok>1?"s":"")+" au stock."+(ko.length?" Non ajoutées : "+ko.join(" · "):"");
  STK=null;render()};
ACTS.stCode=function(){
  var c=v("sk");if(!c)return;
  var ex=STB.filter(function(l){return l.code===c})[0];
  if(ex){ex.qte=(Number(ex.qte)||0)+1;stbSave();bipOk();render();stFocus("sk");return}
  api("/stock/scan",{magasin:MAG||"",code:c}).then(function(d){var p=d.produit,sh=d.shopify;
    if(p){bipOk();stbPush({code:p.code,nom:p.nom,prix:p.prixCents?(p.prixCents/100).toFixed(2):"",achat:p.achatHtCents==null?"":(p.achatHtCents/100).toFixed(2),qte:1,min:p.min||"",empl:p.emplacement||lieuLibre()})}
    else if(sh){bipOk();stbPush({code:c,nom:sh.nom,prix:sh.prixCents?(sh.prixCents/100).toFixed(2):"",achat:sh.achatHtCents==null?"":(sh.achatHtCents/100).toFixed(2),qte:1,min:"",empl:lieuLibre()})}
    else{bipKo();stbPush({code:c,nom:"",prix:"",achat:"",qte:1,min:"",empl:lieuLibre(),nouveau:1});STMSG="Code inconnu : tape son nom dans la ligne."}
    render();stFocus("sk")}).catch(function(){})};
ACTS.stSearch=function(){STQ=v("stq");api("/stock?magasin="+encodeURIComponent(MAG||"")+"&q="+encodeURIComponent(STQ)).then(function(d){STK=d;var p=STQ;render();var e=document.getElementById("stq");if(e){e.focus();e.setSelectionRange(p.length,p.length)}}).catch(function(){})};
ACTS.stDelta=function(b){stRun(api("/stock/maj",{id:+b.dataset.id,delta:+b.dataset.d}),"")};
ACTS.stDel=function(b){var p=stProd(+b.dataset.id);if(p&&confirm("Retirer "+p.nom+" du stock ? (récupérable en le rescannant)"))stRun(api("/stock/archiver",{id:p.id}))};
ACTS.stEtq=function(b){var p=stProd(+b.dataset.id);if(!p)return;ETQ.push({empl:p.emplacement||"",titre:p.nom,prix:(p.prixCents/100).toFixed(2),barcode:p.code,sku:"",qte:Math.max(1,p.qte)});btnFlash(b,"✓ Ajoutée");toastOk("Étiquette ajoutée au panier d étiquettes ("+ETQ.length+")")};
ACTS.stEtqTous=function(){var n=0;(STK&&STK.produits||[]).forEach(function(p){ETQ.push({empl:p.emplacement||"",titre:p.nom,prix:(p.prixCents/100).toFixed(2),barcode:p.code,sku:"",qte:1});n++});toastOk(n+" produits ajoutés au panier d étiquettes ("+ETQ.length+" au total). Va dans l'onglet Étiquettes pour imprimer.")};
var STEDIT=0;
function stEditRow(p){
  return"<tr class='editrow'><td><input id='e_nom' class='lb' style='width:100%' value='"+esc(p.nom)+"' placeholder='Nom'><div class='muted'>"+esc(p.code)+"</div></td>"
    +"<td><input id='e_l' class='q' style='width:70px' value='"+esc(p.emplacement||"")+"' placeholder='Empl.'></td>"
    +"<td class='n'><input id='e_a' class='p' style='width:80px' value='"+(p.achatHtCents==null?"":(p.achatHtCents/100).toFixed(2))+"' placeholder='Achat HT'></td>"
    +"<td class='n'><input id='e_p' class='p' style='width:80px' value='"+(p.prixCents/100).toFixed(2)+"' placeholder='Vente'></td>"
    +"<td class='n'><b>"+p.qte+"</b></td>"
    +"<td class='n'><input id='e_m' class='q' type='number' min='0' style='width:60px' value='"+(p.min||0)+"' title='Stock minimum'></td>"
    +"<td class='n'><button data-act='stEditOk' data-id='"+p.id+"'>Valider</button> <button class='sec' data-act='stEditNo'>Annuler</button></td></tr>"}
ACTS.stEdit=function(b){STEDIT=+b.dataset.id;render()};
ACTS.stEditNo=function(){STEDIT=0;render()};
ACTS.stEditOk=function(b){var p=stProd(+b.dataset.id);if(!p)return;
  STEDIT=0;stRun(api("/stock/maj",{id:p.id,nom:v("e_nom"),prix:v("e_p"),achat:v("e_a"),emplacement:v("e_l"),min:v("e_m")||0}),"✓ Modifié")};
document.addEventListener("keydown",function(e){if(!STEDIT||!e.target||!e.target.id||e.target.id.indexOf("e_")!==0)return;if(e.key==="Enter"){e.preventDefault();var ok=document.querySelector("[data-act='stEditOk']");if(ok)ok.click()}else if(e.key==="Escape"){STEDIT=0;render()}});
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
  h+="<div class='dl' style='margin-top:6px'><button class='sec' data-act='iClavier' title='Afficher ou cacher le clavier de la tablette'>⌨ "+(STINV.clavier?"Clavier : oui":"Clavier : non")+"</button><input id='ilieu' class='q' inputmode='"+(STINV.clavier?"text":"none")+"' placeholder='A11 ou A' value='"+esc(STINV.lieu)+"'><input id='iscan' class='lb' inputmode='"+(STINV.clavier?"text":"none")+"' autocomplete='off' autocapitalize='off' placeholder='"+(stPanneau()?"Rayon (A11) ou produit":"Scanne un produit")+"'></div></div>";
  if(STINV.alerte){var al=STINV.alerte;h+="<div class='card' style='border:2px solid "+(al.kind==="inconnu"?"#b00":"#e0a200")+";background:#fff8e6'><b>"+esc(al.txt)+"</b>"+(al.kind==="autre"?"<div class='actions'><button data-act='iDeplace'>Déplacer ici</button><button class='sec' data-act='iRemet'>Remettre en "+esc(al.de)+"</button></div>":"")+"</div>"}
  else if(STINV.ok)h+="<div class='card' style='border:2px solid #1e8449;background:#eef8f1'><b>"+esc(STINV.ok)+"</b></div>";
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
function iRayon(){return stPanneau()?(STINV.cur||STINV.lieu+"1"):STINV.lieu}
function iFeed(c){
  var d=STINV.info[c],r=iRayon();STINV.alerte=null;STINV.ok="";
  if(!d||(!d.produit&&!d.shopify)){bipKo();STINV.alerte={kind:"inconnu",code:c,txt:"❓ Code inconnu : "+c+" (retiré de la liste si tu veux : − dans la liste)"};return}
  if(!d.produit){bipOk();STINV.ok="🆕 "+d.shopify.nom+" : nouvelle référence, ajoutée en "+r;return}
  var p=d.produit;
  if(!p.emplacement){bipOk();STINV.ok="🆕 "+p.nom+" : pas encore rangé, sera mis en "+r;return}
  if(p.emplacement===r){bipOk();STINV.ok="✓ "+p.nom+" : OK, déjà en "+r;return}
  bipKo();STINV.alerte={kind:"autre",code:c,txt:"⚠ "+p.nom+" : rangé en "+p.emplacement+", tu es en "+r+". Déplacer ici ou remettre en "+p.emplacement+" ?",de:p.emplacement,vers:r}}
ACTS.iScan=function(){
  var c=v("iscan").replace(/ /g,"");if(!c)return;
  if(!STINV.lieu){STINV.lieu=v("ilieu").toUpperCase().replace(/ /g,"");}
  if(!STINV.lieu&&/^[A-Za-z]{1,3}$/.test(c)){STINV.lieu=c.toUpperCase();STINV.cur=STINV.lieu+"1";STMSG="Panneau "+STINV.lieu+" : scanne le rayon (ex : "+STINV.lieu+"1) puis les produits.";STINV.alerte=null;STINV.ok="";render();return}
  if(!STINV.lieu){STMSG="Scanne ou tape d'abord l'emplacement (A pour un panneau, A11 pour un rayon).";render();return}
  if(stPanneau()&&/^[A-Za-z]{1,3}$/.test(c)&&c.toUpperCase()!==STINV.lieu){STINV.lieu=c.toUpperCase();STINV.cur=STINV.lieu+"1";STMSG="Panneau "+STINV.lieu+" : scanne le rayon puis les produits. Les scans déjà faits sont gardés.";STINV.alerte=null;STINV.ok="";render();return}
  if(stPanneau()&&/^[A-Za-z]{1,3}[0-9]{1,3}$/.test(c)&&c.toUpperCase().indexOf(STINV.lieu)===0){STINV.cur=c.toUpperCase();STMSG="";STINV.alerte=null;STINV.ok="Rayon "+STINV.cur+" : scanne les produits.";render();return}
  if(stPanneau()&&!STINV.cur)STINV.cur=STINV.lieu+"1";
  if(stPanneau())iCurLire();
  STINV.scans.push({code:c,qte:1,emplacement:stPanneau()?STINV.cur:STINV.lieu});
  STMSG="";
  if(STINV.info[c]!==undefined){iFeed(c);render();return}
  STINV.info[c]=null;STINV.noms[c]="";
  api("/stock/scan",{magasin:MAG||"",code:c}).then(function(d){STINV.info[c]=d;STINV.noms[c]=d.produit?d.produit.nom:(d.shopify?d.shopify.nom+" (Shopify)":"");iFeed(c);if(STSUB==="inv"&&!STAP)render()}).catch(function(){});
  render()};
ACTS.iClavier=function(){STINV.clavier=!STINV.clavier;render()};
ACTS.iRemet=function(){var a=STINV.alerte;if(!a)return;for(var i=STINV.scans.length-1;i>=0;i--)if(STINV.scans[i].code===a.code){STINV.scans.splice(i,1);break}STINV.alerte=null;STINV.ok="↩ Remets-le en "+(a.de||"son rayon")+" : scan retiré, il ne bouge pas.";render()};
ACTS.iDeplace=function(){var a=STINV.alerte;STINV.alerte=null;STINV.ok="➡ Déplacé en "+(a?a.vers:"ce rayon")+" à la validation.";render()};
ACTS.iMoins=function(b){var c=b.dataset.c;for(var i=STINV.scans.length-1;i>=0;i--)if(STINV.scans[i].code===c){STINV.scans.splice(i,1);break}render()};
ACTS.iReset=function(){STINV={clavier:STINV.clavier,lieu:STINV.lieu,cur:"",scans:[],noms:{},info:{},alerte:null,ok:""};STAP=null;render()};
ACTS.iBack=function(){STAP=null;render()};
ACTS.iFin=function(){STINV.lieu=v("ilieu").toUpperCase().replace(/ /g,"")||STINV.lieu;api("/stock/inventaire",{magasin:MAG||"",emplacement:STINV.lieu,scans:STINV.scans}).then(function(d){STAP=d.apercu;render()}).catch(function(e){STMSG=e.message;render()})};
ACTS.iOk=function(){api("/stock/inventaire",{magasin:MAG||"",emplacement:STINV.lieu,scans:STINV.scans,appliquer:true}).then(function(d){STMSG=d.message;STINV={lieu:"",cur:"",scans:[],noms:{}};STAP=null;STK=null;render()}).catch(function(e){STMSG=e.message;render()})};
// Entrée = valider le champ (scanner ou clavier)
document.addEventListener("keydown",function(e){
  if(e.key!=="Enter")return;var t=e.target;if(!t||TAB!=="stock")return;
  if(t.id==="iscan"){e.preventDefault();ACTS.iScan();return}
  if(t.id==="ilieu"){e.preventDefault();ACTS.iLieu();stFocus("iscan");return}
  if(t.id==="sk"){e.preventDefault();ACTS.stCode();return}
  if(t.id==="sn"||t.id==="sp"||t.id==="sa"||t.id==="sq"||t.id==="sm"||t.id==="sl"){e.preventDefault();ACTS.stLigne()}});
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

function vCasiers(){
  if(!CASI){api("/casiers").then(function(d){CASI=d.casiers;render()}).catch(function(e){STMSG=e.message;CASI=[];render()});return"<div class='card'>Chargement…</div>"}
  var occ=CASI.filter(function(x){return!x.libre}).length;
  var h="<div class='card'><div class='step'>Mes casiers</div><div class='muted'>"+occ+" occupé"+(occ>1?"s":"")+" sur "+CASI.length+" · clique une carte pour ouvrir la prise en charge</div><div class='actions'><button class='sec' data-act='casiRef'>Actualiser</button><button data-act='casiEtq'>Imprimer les étiquettes des casiers</button></div></div>";
  h+="<div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px'>";
  CASI.forEach(function(x){
    var b="<div class='card' style='margin:0"+(x.libre?";opacity:.55":"")+"'><div style='display:flex;justify-content:space-between;align-items:center'><b style='font-size:20px'>"+esc(x.nom)+"</b>"+(x.libre?"<span class='tag'>Libre</span>":"<span class='tag warn'>Occupé</span>")+"</div>";
    if(!x.libre){
      b+="<div style='margin-top:6px'><button class='link' data-act='casiOpen' data-id='"+x.repairId+"'><b>"+esc(x.numero)+"</b> · "+esc(x.client)+"</button></div>";
      if(x.materiel)b+="<div class='muted'>Matériel rangé"+(x.statut?" · "+esc(x.statut):"")+(x.magasin?" · "+esc(x.magasin):"")+"</div>"+(x.panne?"<div class='muted'>"+esc(x.panne).slice(0,90)+"</div>":"");
      if(x.pieces.length)b+="<div style='margin-top:6px'><div class='muted'>Pièces rattachées :</div>"+x.pieces.map(function(p){return"<div>• "+esc(p.libelle)+(p.quantite>1?" x"+p.quantite:"")+"</div>"}).join("")+"</div>";
    }
    b+="<div style='margin-top:8px'><button class='sec' data-act='casiPiece' data-nom='"+esc(x.nom)+"' data-id='"+(x.repairId||"")+"'>+ Pièce</button></div>";
    h+=b+"</div>"});
  return h+"</div>"}
ACTS.casiPiece=async function(b){var id=Number(b.dataset.id)||0,nom=b.dataset.nom;
  if(!id){var n=prompt("Casier "+nom+" libre. Numéro de la prise en charge du client (ex : 123 ou PC-0123) ?");if(!n)return;id=Number(String(n).replace(/\\D/g,""));if(!id){alert("Numéro invalide.");return}}
  var lib=prompt("Quelle pièce ranger dans "+nom+" ?");if(!lib||!lib.trim())return;
  var q=prompt("Quantité ?","1");if(q===null)return;
  try{var d=await api("/casiers/piece",{repairId:id,boite:nom,libelle:lib,quantite:Number(q)||1});CASI=null;PCR=null;STMSG=d.message;render()}catch(e){alert(e.message)}};
ACTS.casiEtq=function(){var L=(CASI||[]).map(function(x){return{big:String(x.nom),style:"papier"}});if(!L.length){alert("Aucun casier.");return}ETQSKIP=0;etqImprimer(L,"papier")};
ACTS.casiRef=function(){CASI=null;render()};
ACTS.casiOpen=function(b){ouvrirFiche(Number(b.dataset.id))};
ACTS.avisRec=async function(b){var id=+b.dataset.id;if(!confirm("Tu as vu l'avis Google posté par ce client ? La récompense sera notée comme offerte (une seule fois)."))return;try{await api("/clients/avis-recompense",{id:id});delete AVC[id];render()}catch(e){alert(e.message)}};
function sauvParam(){
  var d=SAUV||{email:"",derniere:null,dernierTelechargement:null};
  var h="<div class='card'><div class='step'>Sauvegarde de la base</div><div class='muted'>Le logiciel n'est pas sauvegardé par Railway sur cette offre : cette sauvegarde est ta protection. Elle contient tout (clients, prises en charge, ventes, stock, compta).</div>";
  h+="<div class='actions'><button data-act='sauvDl'>&#11015; Télécharger une sauvegarde maintenant</button></div>";
  h+="<div class='muted'>"+(d.dernierTelechargement?"Dernier téléchargement : "+esc(dayHour(d.dernierTelechargement.date))+" par "+esc(d.dernierTelechargement.par):"Jamais téléchargée à la main.")+"</div></div>";
  h+="<div class='card'><div class='step'>Sauvegarde automatique chaque nuit (3 h)</div><div class='muted'>Un email avec le fichier est envoyé à cette adresse. Garde ces emails : ils servent à tout restaurer.</div><div class='dl'><input id='sv-e' class='lb' placeholder='Email de réception' value='"+esc(d.email||"")+"'><button data-act='sauvSave'>Enregistrer</button><button class='sec' data-act='sauvEnv'>Envoyer maintenant</button></div>";
  h+="<div class='muted'>"+(d.derniere?"Dernière sauvegarde auto : "+esc(dayHour(d.derniere.date))+" · "+(d.derniere.statut==="ok"?"✅ ":"⚠ ")+esc(d.derniere.message):"Aucune sauvegarde automatique envoyée pour l'instant.")+"</div><div class='muted'>"+esc(SAUVMSG)+"</div></div>";
  h+="<div class='card'><div class='step'>Importer des clients (export Shifter, CSV)</div><div class='muted'>Les clients déjà connus (même téléphone ou email) sont ignorés. Rien n'est envoyé à Shopify.</div><div class='dl' style='align-items:center'><select id='im-m'><option>Amiens</option><option>Rouen</option></select><label class='sec' style='cursor:pointer;padding:8px 12px;border:1px solid #1c5a34;border-radius:8px'>⬆ Choisir le fichier clients<input id='im-file' type='file' accept='.csv,.txt' style='display:none'></label></div></div>";
  h+="<div class='card'><div class='step'>Mise en production : vider les données de test</div><div class='muted'>Supprime définitivement tous les clients, prises en charge, devis, ventes, bons d'achat, commandes, tâches et clôtures de caisse. Garde : utilisateurs et codes, réglages, fournisseurs, prestations, produits maîtres, stock, banque et compta. Il faut d'abord télécharger une sauvegarde (bouton plus haut), valable 30 minutes.</div><div class='actions'><button class='danger' data-act='viderTests'>Vider les données de test</button></div></div>";
  return h}
ACTS.viderTests=function(){
  if(!confirm("Supprimer DÉFINITIVEMENT tous les clients, prises en charge, devis, ventes, bons d'achat et commandes ? (La sauvegarde téléchargée juste avant permet de revenir en arrière.)"))return;
  var c=prompt("Pour confirmer, tape VIDER");if(c===null)return;
  api("/admin/vider-tests",{confirmation:c}).then(function(d){SAUVMSG=d.message;alert(d.message);location.reload()}).catch(function(e){SAUVMSG=e.message;alert(e.message);render()})};
ACTS.sauvDl=function(){
  var hd={};if(TOK)hd["x-atelier-token"]=TOK;else hd["x-atelier-password"]=PW;if(ACT&&ACT.code)hd["x-atelier-code"]=ACT.code;
  SAUVMSG="Préparation du fichier…";render();
  fetch("/api/sauvegarde",{headers:hd}).then(function(r){if(!r.ok)return r.json().then(function(j){throw new Error(j.error||"Erreur")});return r.blob()}).then(function(b){
    var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="sauvegarde-fs-"+today()+".json.gz";document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500);SAUVMSG="Sauvegarde téléchargée ("+Math.round(b.size/1024)+" Ko).";SAUV=null;render()}).catch(function(e){SAUVMSG=e.message;render()})};
ACTS.sauvSave=function(){api("/sauvegarde/reglage",{email:v("sv-e")}).then(function(d){SAUVMSG=d.message;SAUV=null;render()}).catch(function(e){SAUVMSG=e.message;render()})};
ACTS.sauvEnv=function(){SAUVMSG="Envoi…";render();api("/sauvegarde/envoyer",{}).then(function(d){SAUVMSG=d.message;SAUV=null;render()}).catch(function(e){SAUVMSG=e.message;SAUV=null;render()})};

document.addEventListener("change",function(e){var t=e.target;if(!t||t.id!=="im-file"||!t.files||!t.files[0])return;
  var m=v("im-m")||"Amiens";if(!confirm("Importer ce fichier de clients dans "+m+" ?"))return;
  var fr=new FileReader();fr.onload=function(){SAUVMSG="Import en cours…";render();api("/clients/import",{texte:String(fr.result),magasin:m}).then(function(d){SAUVMSG=d.message;alert(d.message);render()}).catch(function(er){SAUVMSG=er.message;alert(er.message);render()})};
  fr.readAsText(t.files[0],"utf-8")});
`;
