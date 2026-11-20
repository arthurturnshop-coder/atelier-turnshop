export const CLIENT = `// ---------- Onglet Client : recherche clients, factures / tickets de caisse (même sans compte), tickets Z ----------
var CLV={q:"",res:null,vq:"",vd:"",ventes:null,open:0,z:null,msg:""};
function vClient(){
  var h="<div class='card'><div class='step'>Chercher un client</div><div class='dl'><input id='cl-q' class='lb' placeholder='Nom, téléphone ou email' value='"+esc(CLV.q)+"'><button data-act='clChercher'>Chercher</button></div>";
  if(CLV.res)h+=CLV.res.length?CLV.res.map(function(c,i){return"<button class='sec hrow' data-act='clOuvre' data-i='"+i+"'><b>"+esc(c.name)+"</b> <span class='muted'>"+esc(c.telephone||"")+" "+esc(c.email||"")+" · "+(c.trottinettes||[]).length+" trottinette(s)</span></button>"}).join(""):"<div class='muted'>Aucun client trouvé.</div>";
  h+="</div><div class='card'><div class='step'>Factures et tickets de caisse (avec ou sans compte client)</div><div class='muted'>Cherche par nom, n° de vente, montant (ex : 44,90) ou produit. Laisse vide pour voir les dernières ventes.</div>"
    +"<div class='dl'><input id='cl-vq' class='lb' placeholder='Nom, n°, montant, produit' value='"+esc(CLV.vq)+"'><input id='cl-vd' type='date' class='p' value='"+esc(CLV.vd)+"'><button data-act='clVentes'>Chercher</button></div>";
  if(CLV.ventes===null)h+="<div class='muted'>Chargement…</div>";
  else if(!CLV.ventes.length)h+="<div class='muted'>Aucune vente trouvée.</div>";
  else CLV.ventes.forEach(function(r){
    var res=r.lignes.slice(0,2).map(function(l){return esc(l.libelle)}).join(", ")+(r.lignes.length>2?"…":"");
    h+="<button class='sec hrow' data-act='clRecu' data-id='"+r.id+"'><b>N° "+r.id+" · "+esc(dateLongue(r.date))+"</b> · "+eur(r.totalCents)+" · "+esc(r.client||"sans compte client")+" · "+esc(r.magasin||"")+"<br><span class='muted'>"+res+"</span></button>";
    if(CLV.open===r.id)h+=recuHtml(r)+"<div class='actions'><button class='sec' data-act='cPrint' data-id='"+r.id+"'>Imprimer</button></div>"});
  h+="</div>";
  if(estResp()){
    h+="<div class='card'><div class='step'>Tickets Z (12 derniers mois)</div>";
    if(CLV.z===null)h+="<div class='muted'>Chargement…</div>";
    else if(!CLV.z.length)h+="<div class='muted'>Aucun ticket Z enregistré.</div>";
    else CLV.z.forEach(function(z){h+="<div class='dl' style='align-items:center'><span style='flex:1'><b>"+esc(day(z.jour||z.fermeeLe))+"</b> · "+esc(z.magasin)+" · compté "+eur(z.compteCents)+" · écart "+cloEcartTxt(z.ecartCents)+"</span><button class='sec' data-act='clZ' data-id='"+z.id+"'>Imprimer le ticket Z</button></div>"});
    h+="</div>"}
  app.innerHTML=h}
function clCharge(){
  if(CLV.ventes===null)api("/ventes/recherche?q="+encodeURIComponent(CLV.vq)+"&du="+CLV.vd).then(function(d){CLV.ventes=d.ventes;if(TAB==="cli")render()}).catch(function(e){CLV.ventes=[];CLV.msg=e.message;if(TAB==="cli")render()});
  if(estResp()&&CLV.z===null)api("/caisse/tickets-z").then(function(d){CLV.z=d.sessions;if(TAB==="cli")render()}).catch(function(){CLV.z=[];if(TAB==="cli")render()})}
ACTS.clChercher=function(){CLV.q=v("cl-q");if(!CLV.q)return;api("/search?q="+encodeURIComponent(CLV.q)).then(function(r){CLV.res=r;render()}).catch(function(e){alert(e.message)})};
ACTS.clOuvre=function(b){CUR=CLV.res[+b.dataset.i];RES=[];SEARCHED=false;ADDT=false;RECEP=null;EDITCLI=false;FID=null;FICHE=null;TAB="accueil";render()};
ACTS.clVentes=function(){CLV.vq=v("cl-vq");CLV.vd=v("cl-vd");CLV.ventes=null;CLV.open=0;render();clCharge()};
ACTS.clRecu=function(b){var id=+b.dataset.id;CLV.open=CLV.open===id?0:id;render()};
ACTS.clZ=function(b){var id=+b.dataset.id,z=(CLV.z||[]).filter(function(x){return x.id===id})[0];if(z)cloImprimeZ(z)};
document.addEventListener("keydown",function(e){if(e.key!=="Enter"||!e.target||TAB!=="cli")return;if(e.target.id==="cl-q"){e.preventDefault();ACTS.clChercher()}if(e.target.id==="cl-vq"||e.target.id==="cl-vd"){e.preventDefault();ACTS.clVentes()}});
`;
