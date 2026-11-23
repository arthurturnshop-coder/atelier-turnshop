export const MAITRES = `// ---------- Paramètres > Produit maître ----------
var JUM=0;
var MAIT=null,MAITBUSY=false,MAITMSG="",MAITOPEN=0;
function maitLoad(){if(MAIT===null&&!MAITBUSY){MAITBUSY=true;api("/maitres").then(function(d){MAIT=d;MAITBUSY=false;render()}).catch(function(){MAIT={maitres:[]};MAITBUSY=false;render()})}}
function maitRun(p){return p.then(function(d){MAITMSG=(d&&d.message)||"";MAIT=null;render()}).catch(function(e){MAITMSG=e.message;render()})}
function maitCard(){
  var h="<div class='card'><div class='step'>Produit maître</div><div class='muted'>Donne un nom au produit maître (ex : Chambre à air 8,5x2 int. 156), puis associe-lui les produits du catalogue : celui de chaque fournisseur. Quand tu choisis ou scannes l'un de ces produits dans un devis, c'est le produit maître qui se met sur la ligne (avec son prix s'il en a un, sinon le prix du produit choisi). La variante réelle est gardée derrière pour savoir quoi commander.</div>";
  h+="<div class='muted'><b>"+esc(MAITMSG)+"</b></div>";
  if(!MAIT.maitres.length)h+="<div class='muted' style='margin:8px 0'>Aucun produit maître pour l'instant.</div>";
  MAIT.maitres.forEach(function(m){
    var o=MAITOPEN===m.id;
    h+="<div class='avrow'><div><b>"+esc(m.nom)+"</b> <span class='tag"+(m.produits.length?" ok":"")+"'>"+m.produits.length+" produit"+(m.produits.length>1?"s":"")+"</span><div class='muted'>"+(m.prixCents==null?"Prix : celui du produit choisi":"Prix : "+eur(m.prixCents))+"</div></div>"
      +"<div class='actions'><button class='sec' data-act='maitOpen' data-id='"+m.id+"'>"+(o?"Fermer":"Produits")+"</button><button class='sec' data-act='maitEdit' data-id='"+m.id+"'>Modifier</button><button class='danger' data-act='maitSuppr' data-id='"+m.id+"'>Supprimer</button></div></div>";
    if(o){
      h+="<div class='card'>"+(m.produits.length?m.produits.map(function(p){return"<div class='avrow'><div>"+esc(p.libelle||"Produit")+"<div class='muted'>code-barres "+esc(p.barcode||"—")+" · sku "+esc(p.sku||"—")+"</div></div><button class='link' data-act='maitLienSuppr' data-id='"+p.id+"'>Retirer</button></div>"}).join(""):"<div class='muted'>Aucun produit associé.</div>")
        +"<div class='step' style='margin-top:8px'>Associer un produit</div><div class='muted'>Cherche-le par son nom, ou scanne son code-barres ici puis appuie sur Entrée.</div>"+prodBox("mait"+m.id)+"</div>"}});
  h+="<div class='step' style='margin-top:10px'>Nouveau produit maître</div><div class='dl'><input id='mt-n' class='lb' placeholder='Nom (ex : Chambre à air 8,5x2 int. 156)'><input id='mt-p' class='p' placeholder='Prix TTC € (facultatif)'><button data-act='maitAdd'>Créer</button></div>";
  return h+"</div>"}
async function maitLier(ctx,x){
  try{var d=await api("/maitres/lien",{maitreId:+ctx.slice(4),libelle:x.libelle,sku:x.sku||"",barcode:x.barcode||"",variantId:x.variantId||""});MAITMSG=d.message;MAIT=null;render()}catch(e){alert(e.message)}}
ACTS.maitOpen=function(b){MAITOPEN=MAITOPEN===+b.dataset.id?0:+b.dataset.id;render()};
ACTS.maitAdd=function(){maitRun(api("/maitres",{nom:v("mt-n"),prix:v("mt-p")}).then(function(d){MAITOPEN=d.id;return d}))};
ACTS.maitEdit=function(b){var m=MAIT.maitres.filter(function(x){return x.id===+b.dataset.id})[0];if(!m)return;
  var n=prompt("Nom du produit maître",m.nom);if(n===null)return;
  var p=prompt("Prix TTC en euros (vide = prix du produit choisi)",m.prixCents==null?"":(m.prixCents/100).toFixed(2));if(p===null)return;
  maitRun(api("/maitres/modifier",{id:m.id,nom:n,prix:p}))};
ACTS.maitSuppr=function(b){if(confirm("Supprimer ce produit maître et ses associations ? Les devis déjà faits ne changent pas."))maitRun(api("/maitres/supprimer",{id:+b.dataset.id}))};
ACTS.maitLienSuppr=function(b){if(confirm("Retirer ce produit du produit maître ?"))maitRun(api("/maitres/lien/supprimer",{id:+b.dataset.id}))};
ACTS.jumOpen=function(b){JUM=JUM===+b.dataset.id?0:+b.dataset.id;render()};
async function jumLier(ctx,x){try{var d=await api("/maitres/jumeau",{ligneId:+ctx.slice(3),libelle:x.libelle,sku:x.sku||"",barcode:x.barcode||"",variantId:x.variantId||""});JUM=0;DEVHINT=d.message;MAIT=null;await recharger(FICHE.id)}catch(e){alert(e.message)}}
`;
