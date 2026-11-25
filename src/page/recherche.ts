export const RECHERCHE = `// ---------- Recherche rapide (bandeau) ----------
function emplTxt(x){return x.emplacement?" · <b>Empl. "+esc(x.emplacement)+"</b>":""}
function stockTxt(x){
  var l=x.lieux||[];
  if(!l.length)return"stock "+(x.stock==null?"—":x.stock)+emplTxt(x);
  var ordre={Amiens:0,Rouen:1,Fournisseur:2};
  l=l.slice().sort(function(a,b){return(ordre[a.lieu]==null?9:ordre[a.lieu])-(ordre[b.lieu]==null?9:ordre[b.lieu])});
  var ab={Amiens:"A",Rouen:"R",Fournisseur:"F"};return l.map(function(e){return esc(ab[e.lieu]||e.lieu)+" "+e.qte}).join(" · ")+emplTxt(x)}
function stockLocalHtml(d){
  var sl=d.stockLocal||[];if(!sl.length)return"";
  return"<div class='rp-sec'>Stock atelier (rayon)</div>"+sl.map(function(p){return"<div class='rp-line'><span class='rp-t'><b>"+esc(p.nom)+"</b> · "+esc(p.code)+" · "+eur(p.prixCents)+" · "+p.qte+" en stock · <b>Empl. "+esc(p.emplacement||"non rangé")+"</b></span></div>"}).join("")}
var RT=null,RCTL=null,RSEQ=0,RPROD=[];
function rechHide(){RSEQ++;if(RCTL){RCTL.abort();RCTL=null}var p=document.getElementById("rpanel");if(p)p.style.display="none"}
function rechShow(html){var p=document.getElementById("rpanel");p.innerHTML=html;p.style.display="block"}
function rechInput(){clearTimeout(RT);RT=setTimeout(function(){rechRun(v("rq"))},300)}
function rechRun(q){
  var seq=++RSEQ;
  if(RCTL){RCTL.abort();RCTL=null}
  if(q.length<2&&!/^[0-9]+$/.test(q)){rechHide();return}
  var ctl=new AbortController();RCTL=ctl;
  rechShow("<div class='rp-muted'>Recherche…</div>");
  var h={};if(TOK)h["x-atelier-token"]=TOK;else h["x-atelier-password"]=PW;
  fetch("/api/recherche?q="+encodeURIComponent(q),{headers:h,signal:ctl.signal})
    .then(function(r){if(!r.ok)throw new Error("http "+r.status);return r.json()})
    .then(function(d){if(seq!==RSEQ)return;RCTL=null;rechShow(rechHtml(d))})
    .catch(function(){if(seq!==RSEQ)return;RCTL=null;rechShow("<div class='rp-muted'>Recherche indisponible, réessayer.</div>")})}
function pcn(id){return"PC-"+("0000"+id).slice(-4)}
function rechHtml(d){
  var h="",rp=d.reparations||[];
  if(rp.length){h+="<div class='rp-sec'>Prises en charge</div>";rp.forEach(function(r){h+="<button class='rp-item rp-line' data-rid='"+esc(r.id)+"'><span class='rp-t'><b>"+pcn(r.id)+"</b> · "+esc(r.client||"Sans nom")+" · <span class='rp-m'>"+esc(r.trottinette)+" · "+esc(r.panne)+"</span></span><span class='tag'>"+esc(r.statut)+"</span></button>"})}
  var tr=d.trottinettes||[];
  if(tr.length){h+="<div class='rp-sec'>Trottinettes (n° de série)</div>";tr.forEach(function(t){h+="<button class='rp-item rp-line' data-cid='"+esc(t.clientId)+"'><span class='rp-t'><b>"+esc(t.serie)+"</b> · "+esc(t.modele)+" · appartient à <b>"+esc(t.client||"Sans nom")+"</b>"+(t.facture?" <span class='rp-m'>· vendue "+esc(t.facture)+(t.venduLe?" le "+esc(new Date(t.venduLe).toLocaleDateString("fr-FR")):"")+"</span>":"")+"</span></button>"})}
  h+="<div class='rp-sec'>Clients</div>";var cl=d.clients||[];
  if(!cl.length)h+="<div class='rp-muted'>Aucun client.</div>";
  else cl.forEach(function(c){h+="<button class='rp-item rp-line' data-cid='"+esc(c.id)+"'><span class='rp-t'><b>"+esc(c.name||"Sans nom")+"</b> <span class='rp-m'>"+esc([c.phone,c.email].filter(Boolean).join(" · "))+"</span></span></button>"});
  h+=stockLocalHtml(d);
  h+="<div class='rp-sec'>Produits</div>";
  if(d.produitsIndisponibles)h+="<div class='rp-muted'>Produits : indisponible pour le moment</div>";
  else if(!(d.produits||[]).length)h+="<div class='rp-muted'>Aucun produit.</div>";
  else{RPROD=d.produits;d.produits.forEach(function(p,pi){
    (p.variantes||[]).forEach(function(x,vi){
      var vt=x.titre&&x.titre!=="Default Title"?" - "+esc(x.titre):"";
      h+="<div class='rp-line'><span class='rp-t'><b>"+esc(p.titre)+vt+"</b> <span class='rp-m'>code-barres "+esc(x.barcode||"—")+" · sku "+esc(x.sku||"—")+" · </span><b>"+esc(x.prix)+" €</b> <span class='rp-m'>· "+stockTxt(x)+"</span></span>"
        +"<span class='rp-btns'>"+(FICHE?"<button data-act='rAddDevis' data-pi='"+pi+"' data-vi='"+vi+"'>+ Devis</button>":"")+"<button class='sec' data-act='rAddPanier' data-pi='"+pi+"' data-vi='"+vi+"'>+ Caisse</button></span></div>"})})}
  return h}
function rechOpen(id){
  rechHide();
  api("/customer?id="+id).then(function(c){CUR=c;TAB="accueil";FICHE=null;ADDT=false;RECEP=null;EDITCLI=false;FID=null;render()})
    .catch(function(e){rechShow("<div class='rp-muted'>"+esc(e.message)+"</div>")})}
function rechLigne(b){var p=RPROD[+b.dataset.pi],x=p&&p.variantes[+b.dataset.vi];if(!x)return null;
  var vt=x.titre&&x.titre!=="Default Title"?" - "+x.titre:"";
  return{libelle:(p.titre+vt).slice(0,200),prix:String(x.prix||"0").replace(".",","),variantId:x.id,sku:x.sku||"",barcode:x.barcode||"",marque:p.marque||""}}
ACTS.rAddDevis=async function(b){var l=rechLigne(b);if(!l||!FICHE)return;
  try{await api("/devis/ligne",{repairId:FICHE.id,type:"piece",libelle:l.libelle,quantite:1,prix:l.prix,variantId:l.variantId,sku:l.sku,barcode:l.barcode,marque:l.marque});rechHide();var q=document.getElementById("rq");if(q)q.value="";await recharger(FICHE.id)}catch(e){alert(e.message)}};
ACTS.rAddPanier=function(b){var l=rechLigne(b);if(!l)return;
  PAN.push({libelle:l.libelle,quantite:1,prix:l.prix,type:"piece",variantId:l.variantId,sku:l.sku,barcode:l.barcode,marque:l.marque});rechHide();var q=document.getElementById("rq");if(q)q.value="";
  CUR=null;FICHE=null;TAB="accueil";CREC=null;render()};
var PSRES={},PST={},PSLOC={};
function prodBox(ctx){return"<input data-ps='"+ctx+"' placeholder='Chercher un produit Shopify (nom, référence, code-barres)...' autocomplete='off'><div class='psres' id='pr-"+ctx+"'></div>"}
function psHtml(ctx,d){
  var ps=d.produits||[];PSRES[ctx]=ps;
  PSLOC[ctx]=d.stockLocal||[];
  var sl=PSLOC[ctx].map(function(p,i){var t="Stock atelier : <b>"+esc(p.nom)+"</b> · "+eur(p.prixCents)+" · "+p.qte+" en stock · <b>Empl. "+esc(p.emplacement||"non rangé")+"</b>";return ctx==="etq"?"<button class='sec hrow' data-act='psLoc' data-ctx='"+ctx+"' data-i='"+i+"'>"+t+"</button>":"<div class='muted'>"+t+"</div>"}).join("");
  if(d.produitsIndisponibles)return sl+"<div class='muted'>Catalogue indisponible pour le moment.</div>";
  if(!ps.length)return sl+"<div class='muted'>Aucun produit trouvé.</div>";
  var h=sl;
  ps.forEach(function(p,pi){(p.variantes||[]).forEach(function(x,vi){
    var vt=x.titre&&x.titre!=="Default Title"?" - "+esc(x.titre):"";
    h+="<button class='sec hrow' data-act='psAdd' data-ctx='"+ctx+"' data-pi='"+pi+"' data-vi='"+vi+"'><b>"+esc(p.titre)+vt+"</b><br><span class='muted'>"+"code-barres "+esc(x.barcode||"—")+" · sku "+esc(x.sku||"—")+" · "+esc(x.prix)+" € · "+stockTxt(x)+"</span></button>"})});
  return h}
document.addEventListener("keydown",function(e){
  var t=e.target;if(e.key!=="Enter"||!t||!t.dataset||!t.dataset.ps)return;
  var q=t.value.trim();if(q.length<4||q.indexOf(" ")>=0)return;
  scanCode(q,t.dataset.ps,true)});
document.addEventListener("input",function(e){
  var t=e.target;if(!t||!t.dataset||!t.dataset.ps)return;
  var ctx=t.dataset.ps,box=document.getElementById("pr-"+ctx);if(!box)return;
  clearTimeout(PST[ctx]);var q=t.value.trim();
  if(q.length<2){box.innerHTML="";return}
  PST[ctx]=setTimeout(function(){
    box.innerHTML="<div class='muted'>Recherche…</div>";
    api("/recherche?q="+encodeURIComponent(q)).then(function(d){if(t.value.trim()!==q)return;box.innerHTML=psHtml(ctx,d)}).catch(function(err){box.innerHTML="<div class='muted'>"+esc(err.message)+"</div>"})},300)});
ACTS.psLoc=function(b){var p=(PSLOC[b.dataset.ctx]||[])[+b.dataset.i];if(!p)return;ETQ.push({empl:p.emplacement||"",titre:p.nom,prix:(p.prixCents/100).toFixed(2),barcode:p.code,sku:"",qte:Math.max(1,p.qte)});render()};
ACTS.psAdd=async function(b){
  var ctx=b.dataset.ctx,p=(PSRES[ctx]||[])[+b.dataset.pi],x=p&&p.variantes[+b.dataset.vi];if(!x)return;
  var vt=x.titre&&x.titre!=="Default Title"?" - "+x.titre:"";
  var l={libelle:(p.titre+vt).slice(0,200),prix:String(x.prix||"0").replace(".",","),variantId:x.id,sku:x.sku||"",barcode:x.barcode||"",marque:p.marque||""};
  if(ctx==="assoc"){ACTS.stAssocie(x);return}
  if(ctx.indexOf("mait")===0){maitLier(ctx,l);return}
  if(ctx.indexOf("jum")===0){jumLier(ctx,l);return}
  if(ctx==="dvs"){try{await dvAjoutProduit(l)}catch(err){alert(err.message)}return}
  if(ctx==="etq"){ETQ.push({titre:l.libelle,prix:String(x.prix||"0"),barcode:l.barcode,sku:l.sku,qte:1});render();return}
  if(ctx.indexOf("mod")===0){try{await api("/modeles/piece",{modeleId:+ctx.slice(3),libelle:l.libelle,sku:l.sku,variantId:l.variantId,categorie:"pneu"});MODS=null;render()}catch(err){alert(err.message)}return}
  if(ctx==="caisse"){lirePay();PAN.push({libelle:l.libelle,quantite:1,prix:l.prix,type:"piece",variantId:l.variantId,sku:l.sku,barcode:l.barcode});CREC=null;render();return}
  if(ctx.indexOf("cmd")===0){try{var d=await api("/achats/ligne",{fournisseurId:+ctx.slice(3),libelle:l.libelle,sku:l.sku,barcode:l.barcode,variantId:l.variantId,quantite:1});await cmdAjoutRapide(ctx,d.message)}catch(err){alert(err.message)}return}
  if(!FICHE)return;
  try{var rd=await api("/devis/ligne",{repairId:FICHE.id,type:"piece",libelle:l.libelle,quantite:1,prix:l.prix,variantId:l.variantId,sku:l.sku,barcode:l.barcode,marque:l.marque});DEVHINT=rd.maitre?"Produit maître mis sur le devis : "+rd.maitre.nom+" (produit choisi : "+rd.maitre.origine+")":"";await recharger(FICHE.id)}catch(err){alert(err.message)}};
document.getElementById("rq").addEventListener("input",rechInput);
document.getElementById("rq").addEventListener("keydown",function(e){if(e.key==="Escape")rechHide();if(e.key==="Enter"){var q=v("rq");var mpc=q.match(/^(?:pc|#)[ -]*0*([0-9]+)$/i);if(mpc){rechHide();document.getElementById("rq").value="";ouvrirFiche(Number(mpc[1]));return}if(q.length>=4&&q.indexOf(" ")<0){scanCode(q,"caisse",true).then(function(){})}}});
document.getElementById("rpanel").addEventListener("click",function(e){var r=e.target.closest("[data-rid]");if(r){rechHide();var q=document.getElementById("rq");if(q)q.value="";ouvrirFiche(Number(r.dataset.rid));return}var b=e.target.closest("[data-cid]");if(b)rechOpen(b.dataset.cid)});
document.addEventListener("click",function(e){if(!e.target.closest("#rech"))rechHide()});
document.addEventListener("click",function(e){var b=e.target.closest("[data-act]");if(!b||b.tagName==="INPUT"||b.tagName==="SELECT")return;var f=ACTS[b.dataset.act];if(f)f(b)});
`;
