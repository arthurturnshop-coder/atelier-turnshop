export const MAITRES = `// ---------- Produits maîtres : une pièce, plusieurs codes-barres fournisseurs ----------
var MAIT=null,MAITBUSY=false,MAITMSG="",MAITOPEN="";
function maitLoad(){if(MAIT===null&&!MAITBUSY){MAITBUSY=true;api("/maitres").then(function(d){MAIT=d;MAITBUSY=false;render()}).catch(function(){MAIT={maitres:[],fournisseurs:[]};MAITBUSY=false;render()})}}
function maitRun(p){return p.then(function(d){MAITMSG=(d&&d.message)||"";MAIT=null;render()}).catch(function(e){MAITMSG=e.message;render()})}
function maitCard(){
  var h="<div class='card'><div class='step'>Produits maîtres</div><div class='muted'>Une même pièce (ex : chambre à air 8,5x2, diamètre int. 156) peut avoir un code-barres différent chez chaque fournisseur. Crée le produit maître, puis ajoute autant de codes-barres que tu veux avec une dénomination : scan, réception et stock passent tous par le même produit. Si l'un de ces codes était déjà en stock comme produit séparé, son stock est regroupé dans le produit maître.</div>";
  h+="<div class='muted'><b>"+esc(MAITMSG)+"</b></div>";
  if(!MAIT.maitres.length)h+="<div class='muted' style='margin:8px 0'>Aucun produit maître pour l'instant.</div>";
  MAIT.maitres.forEach(function(m){
    var o=MAITOPEN===m.code,st=Object.keys(m.stock).map(function(k){return esc(k)+" : "+m.stock[k]}).join(" · ")||"pas encore de stock";
    h+="<div class='avrow'><div><b>"+esc(m.nom)+"</b> <span class='tag"+(m.alias.length?" ok":"")+"'>"+m.alias.length+" référence"+(m.alias.length>1?"s":"")+"</span><div class='muted'>Code maître "+esc(m.code)+" · stock "+st+"</div></div>"
      +"<div class='actions'><button class='sec' data-act='maitOpen' data-c='"+esc(m.code)+"'>"+(o?"Fermer":"Références")+"</button><button class='danger' data-act='maitSuppr' data-c='"+esc(m.code)+"'>Supprimer</button></div></div>";
    if(o){
      h+="<div class='card'>"+(m.alias.length?m.alias.map(function(a){return"<div class='avrow'><div><b>"+esc(a.denomination||"Sans dénomination")+"</b> <span class='muted'>"+esc(a.ean)+"</span><div class='muted'>"+(a.fournisseur?esc(a.fournisseur):"Fournisseur non précisé")+(a.qteParUnite>1?" · lot de "+a.qteParUnite:"")+"</div></div><button class='link' data-act='aliasSuppr' data-e='"+esc(a.ean)+"'>Retirer</button></div>"}).join(""):"<div class='muted'>Aucun code-barres associé.</div>")
        +"<div class='step' style='margin-top:8px'>Ajouter un code-barres fournisseur</div>"
        +"<div class='dl'><input id='al-e-"+esc(m.code)+"' class='lb' placeholder='Code-barres (scan)'><input id='al-d-"+esc(m.code)+"' class='lb' placeholder='Dénomination (ex : Fournisseur A - CST 8,5x2)'></div>"
        +"<div class='dl'><select id='al-f-"+esc(m.code)+"'><option value=''>Fournisseur (facultatif)</option>"+MAIT.fournisseurs.map(function(f){return"<option value='"+f.id+"'>"+esc(f.nom)+"</option>"}).join("")+"</select><input id='al-q-"+esc(m.code)+"' class='q' type='number' min='1' value='1' title='Pièces par unité vendue (lot de 5 = 5)'><button class='sec' data-act='aliasAdd' data-c='"+esc(m.code)+"'>Associer</button></div></div>"}});
  h+="<div class='step' style='margin-top:10px'>Nouveau produit maître</div><div class='dl'><input id='mt-n' class='lb' placeholder='Nom (ex : Chambre à air 8,5x2 int. 156)'><input id='mt-c' class='lb' placeholder='Code (vide = code interne généré)'><button data-act='maitAdd'>Créer</button></div>";
  return h+"</div>"}
ACTS.maitOpen=function(b){MAITOPEN=MAITOPEN===b.dataset.c?"":b.dataset.c;render()};
ACTS.maitAdd=function(){maitRun(api("/maitres",{nom:v("mt-n"),code:v("mt-c")}))};
ACTS.maitSuppr=function(b){if(confirm("Supprimer ce produit maître et ses associations de codes-barres ? Le stock déjà regroupé reste en place."))maitRun(api("/maitres/supprimer",{code:b.dataset.c}))};
ACTS.aliasAdd=function(b){var c=b.dataset.c;maitRun(api("/maitres/alias",{codeMaitre:c,ean:v("al-e-"+c),denomination:v("al-d-"+c),fournisseurId:v("al-f-"+c),qteParUnite:v("al-q-"+c)||1}))};
ACTS.aliasSuppr=function(b){if(confirm("Retirer ce code-barres du produit maître ?"))maitRun(api("/maitres/alias/supprimer",{ean:b.dataset.e}))};
`;
