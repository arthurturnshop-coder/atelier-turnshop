export const RECHERCHE = `// ---------- Recherche rapide (bandeau) ----------
function stockTxt(x){
  var l=x.lieux||[];
  if(!l.length)return"stock "+(x.stock==null?"—":x.stock);
  var ordre={Amiens:0,Rouen:1,Fournisseur:2};
  l=l.slice().sort(function(a,b){return(ordre[a.lieu]==null?9:ordre[a.lieu])-(ordre[b.lieu]==null?9:ordre[b.lieu])});
  return l.map(function(e){return esc(e.lieu)+" "+e.qte}).join(" · ")}
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
  if(rp.length){h+="<div class='rp-sec'>Prises en charge</div>";rp.forEach(function(r){h+="<button class='rp-item' data-rid='"+esc(r.id)+"'><b>"+pcn(r.id)+" · "+esc(r.client||"Sans nom")+"</b> <span class='tag'>"+esc(r.statut)+"</span><div class='rp-muted'>"+esc(r.trottinette)+" · "+esc(r.panne)+"</div></button>"})}
  h+="<div class='rp-sec'>Clients</div>";var cl=d.clients||[];
  if(!cl.length)h+="<div class='rp-muted'>Aucun client.</div>";
  else cl.forEach(function(c){h+="<button class='rp-item' data-cid='"+esc(c.id)+"'><b>"+esc(c.name||"Sans nom")+"</b><div class='rp-muted'>"+esc([c.phone,c.email].filter(Boolean).join(" · "))+"</div></button>"});
  h+="<div class='rp-sec'>Produits</div>";
  if(d.produitsIndisponibles)h+="<div class='rp-muted'>Produits : indisponible pour le moment</div>";
  else if(!(d.produits||[]).length)h+="<div class='rp-muted'>Aucun produit.</div>";
  else{RPROD=d.produits;d.produits.forEach(function(p,pi){
    h+="<div class='rp-static'><b>"+esc(p.titre)+"</b> <span class='rp-muted'>"+esc(p.marque)+"</span>";
    (p.variantes||[]).forEach(function(x,vi){
      var vt=x.titre&&x.titre!=="Default Title"?" · "+esc(x.titre):"";
      h+="<div class='rp-var'><div class='rp-muted'>"+vt.replace(/^ · /,"")+(vt?" · ":"")+"sku "+esc(x.sku||"—")+" · <b>"+esc(x.prix)+" €</b> · "+stockTxt(x)+"</div>"
        +"<div class='rp-btns'>"+(FICHE?"<button data-act='rAddDevis' data-pi='"+pi+"' data-vi='"+vi+"'>+ Devis</button>":"")+"<button class='sec' data-act='rAddPanier' data-pi='"+pi+"' data-vi='"+vi+"'>+ Panier caisse</button></div></div>"});
    h+="</div>"})}
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
var PSRES={},PST={};
function prodBox(ctx){return"<input data-ps='"+ctx+"' placeholder='Chercher un produit Shopify (nom, référence, code-barres)...' autocomplete='off'><div class='psres' id='pr-"+ctx+"'></div>"}
function psHtml(ctx,d){
  var ps=d.produits||[];PSRES[ctx]=ps;
  if(d.produitsIndisponibles)return"<div class='muted'>Catalogue indisponible pour le moment.</div>";
  if(!ps.length)return"<div class='muted'>Aucun produit trouvé.</div>";
  var h="";
  ps.forEach(function(p,pi){(p.variantes||[]).forEach(function(x,vi){
    var vt=x.titre&&x.titre!=="Default Title"?" - "+esc(x.titre):"";
    h+="<button class='sec hrow' data-act='psAdd' data-ctx='"+ctx+"' data-pi='"+pi+"' data-vi='"+vi+"'><b>"+esc(p.titre)+vt+"</b><br><span class='muted'>"+esc(x.prix)+" € · "+stockTxt(x)+" · sku "+esc(x.sku||"—")+"</span></button>"})});
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
ACTS.psAdd=async function(b){
  var ctx=b.dataset.ctx,p=(PSRES[ctx]||[])[+b.dataset.pi],x=p&&p.variantes[+b.dataset.vi];if(!x)return;
  var vt=x.titre&&x.titre!=="Default Title"?" - "+x.titre:"";
  var l={libelle:(p.titre+vt).slice(0,200),prix:String(x.prix||"0").replace(".",","),variantId:x.id,sku:x.sku||"",barcode:x.barcode||"",marque:p.marque||""};
  if(ctx==="caisse"){lirePay();PAN.push({libelle:l.libelle,quantite:1,prix:l.prix,type:"piece",variantId:l.variantId,sku:l.sku});CREC=null;render();return}
  if(ctx.indexOf("cmd")===0){try{var d=await api("/achats/ligne",{fournisseurId:+ctx.slice(3),libelle:l.libelle,sku:l.sku,barcode:l.barcode,variantId:l.variantId,quantite:1});CMDMSG=d.message;CMD=null;render()}catch(err){alert(err.message)}return}
  if(!FICHE)return;
  try{await api("/devis/ligne",{repairId:FICHE.id,type:"piece",libelle:l.libelle,quantite:1,prix:l.prix,variantId:l.variantId,sku:l.sku,barcode:l.barcode,marque:l.marque});await recharger(FICHE.id)}catch(err){alert(err.message)}};
document.getElementById("rq").addEventListener("input",rechInput);
document.getElementById("rq").addEventListener("keydown",function(e){if(e.key==="Escape")rechHide();if(e.key==="Enter"){var q=v("rq");var mpc=q.match(/^(?:pc|#)[ -]*0*([0-9]+)$/i);if(mpc){rechHide();document.getElementById("rq").value="";ouvrirFiche(Number(mpc[1]));return}if(q.length>=4&&q.indexOf(" ")<0){scanCode(q,"caisse",true).then(function(){})}}});
document.getElementById("rpanel").addEventListener("click",function(e){var r=e.target.closest("[data-rid]");if(r){rechHide();var q=document.getElementById("rq");if(q)q.value="";ouvrirFiche(Number(r.dataset.rid));return}var b=e.target.closest("[data-cid]");if(b)rechOpen(b.dataset.cid)});
document.addEventListener("click",function(e){if(!e.target.closest("#rech"))rechHide()});
document.addEventListener("click",function(e){var b=e.target.closest("[data-act]");if(!b||b.tagName==="INPUT"||b.tagName==="SELECT")return;var f=ACTS[b.dataset.act];if(f)f(b)});
`;
