export const RECHERCHE = `// ---------- Recherche rapide (bandeau) ----------
var RT=null,RCTL=null,RSEQ=0,RPROD=[];
function rechHide(){RSEQ++;if(RCTL){RCTL.abort();RCTL=null}var p=document.getElementById("rpanel");if(p)p.style.display="none"}
function rechShow(html){var p=document.getElementById("rpanel");p.innerHTML=html;p.style.display="block"}
function rechInput(){clearTimeout(RT);RT=setTimeout(function(){rechRun(v("rq"))},300)}
function rechRun(q){
  var seq=++RSEQ;
  if(RCTL){RCTL.abort();RCTL=null}
  if(q.length<2){rechHide();return}
  var ctl=new AbortController();RCTL=ctl;
  rechShow("<div class='rp-muted'>Recherche…</div>");
  var h={};if(TOK)h["x-atelier-token"]=TOK;else h["x-atelier-password"]=PW;
  fetch("/api/recherche?q="+encodeURIComponent(q),{headers:h,signal:ctl.signal})
    .then(function(r){if(!r.ok)throw new Error("http "+r.status);return r.json()})
    .then(function(d){if(seq!==RSEQ)return;RCTL=null;rechShow(rechHtml(d))})
    .catch(function(){if(seq!==RSEQ)return;RCTL=null;rechShow("<div class='rp-muted'>Recherche indisponible, réessayer.</div>")})}
function rechHtml(d){
  var h="<div class='rp-sec'>Clients</div>",cl=d.clients||[];
  if(!cl.length)h+="<div class='rp-muted'>Aucun client.</div>";
  else cl.forEach(function(c){h+="<button class='rp-item' data-cid='"+esc(c.id)+"'><b>"+esc(c.name||"Sans nom")+"</b><div class='rp-muted'>"+esc([c.phone,c.email].filter(Boolean).join(" · "))+"</div></button>"});
  h+="<div class='rp-sec'>Produits</div>";
  if(d.produitsIndisponibles)h+="<div class='rp-muted'>Produits : indisponible pour le moment</div>";
  else if(!(d.produits||[]).length)h+="<div class='rp-muted'>Aucun produit.</div>";
  else{RPROD=d.produits;d.produits.forEach(function(p,pi){
    h+="<div class='rp-static'><b>"+esc(p.titre)+"</b> <span class='rp-muted'>"+esc(p.marque)+"</span>";
    (p.variantes||[]).forEach(function(x,vi){
      var vt=x.titre&&x.titre!=="Default Title"?" · "+esc(x.titre):"";
      h+="<div class='rp-var'><div class='rp-muted'>"+vt.replace(/^ · /,"")+(vt?" · ":"")+"sku "+esc(x.sku||"—")+" · <b>"+esc(x.prix)+" €</b> · stock "+esc(x.stock==null?"—":x.stock)+"</div>"
        +"<div class='rp-btns'>"+(FICHE?"<button data-act='rAddDevis' data-pi='"+pi+"' data-vi='"+vi+"'>+ Devis</button>":"")+"<button class='sec' data-act='rAddPanier' data-pi='"+pi+"' data-vi='"+vi+"'>+ Panier caisse</button></div></div>"});
    h+="</div>"})}
  return h}
function rechOpen(id){
  rechHide();
  api("/customer?id="+id).then(function(c){CUR=c;TAB="accueil";FICHE=null;ADDT=false;RECEP=null;EDITCLI=false;FID=null;render()})
    .catch(function(e){rechShow("<div class='rp-muted'>"+esc(e.message)+"</div>")})}
function rechLigne(b){var p=RPROD[+b.dataset.pi],x=p&&p.variantes[+b.dataset.vi];if(!x)return null;
  var vt=x.titre&&x.titre!=="Default Title"?" - "+x.titre:"";
  return{libelle:(p.titre+vt).slice(0,200),prix:String(x.prix||"0").replace(".",","),variantId:x.id,sku:x.sku||""}}
ACTS.rAddDevis=async function(b){var l=rechLigne(b);if(!l||!FICHE)return;
  try{await api("/devis/ligne",{repairId:FICHE.id,type:"piece",libelle:l.libelle,quantite:1,prix:l.prix,variantId:l.variantId,sku:l.sku});rechHide();var q=document.getElementById("rq");if(q)q.value="";await recharger(FICHE.id)}catch(e){alert(e.message)}};
ACTS.rAddPanier=function(b){var l=rechLigne(b);if(!l)return;
  PAN.push({libelle:l.libelle,quantite:1,prix:l.prix});rechHide();var q=document.getElementById("rq");if(q)q.value="";
  CUR=null;FICHE=null;TAB="accueil";CREC=null;render()};
document.getElementById("rq").addEventListener("input",rechInput);
document.getElementById("rq").addEventListener("keydown",function(e){if(e.key==="Escape")rechHide()});
document.getElementById("rpanel").addEventListener("click",function(e){var b=e.target.closest("[data-cid]");if(b)rechOpen(b.dataset.cid)});
document.addEventListener("click",function(e){if(!e.target.closest("#rech"))rechHide()});
document.addEventListener("click",function(e){var b=e.target.closest("[data-act]");if(!b||b.tagName==="INPUT"||b.tagName==="SELECT")return;var f=ACTS[b.dataset.act];if(f)f(b)});
`;
