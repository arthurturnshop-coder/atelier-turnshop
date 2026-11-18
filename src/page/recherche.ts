export const RECHERCHE = `// ---------- Recherche rapide (bandeau) ----------
var RT=null,RCTL=null,RSEQ=0;
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
  else d.produits.forEach(function(p){
    h+="<div class='rp-static'><b>"+esc(p.titre)+"</b> <span class='rp-muted'>"+esc(p.marque)+"</span>";
    (p.variantes||[]).forEach(function(x){h+="<div class='rp-muted'>sku "+esc(x.sku||"—")+" · "+esc(x.prix)+" € · stock "+esc(x.stock==null?"—":x.stock)+"</div>"});
    h+="</div>"});
  return h}
function rechOpen(id){
  rechHide();
  api("/customer?id="+id).then(function(c){CUR=c;TAB="accueil";FICHE=null;ADDT=false;RECEP=null;EDITCLI=false;FID=null;render()})
    .catch(function(e){rechShow("<div class='rp-muted'>"+esc(e.message)+"</div>")})}
document.getElementById("rq").addEventListener("input",rechInput);
document.getElementById("rq").addEventListener("keydown",function(e){if(e.key==="Escape")rechHide()});
document.getElementById("rpanel").addEventListener("click",function(e){var b=e.target.closest("[data-cid]");if(b)rechOpen(b.dataset.cid)});
document.addEventListener("click",function(e){if(!e.target.closest("#rech"))rechHide()});
document.addEventListener("click",function(e){var b=e.target.closest("[data-act]");if(!b||b.tagName==="INPUT"||b.tagName==="SELECT")return;var f=ACTS[b.dataset.act];if(f)f(b)});
`;
