export const STATS = `// ---------- Statistiques ----------
var ST={periode:"mois",magasin:"",d:null,msg:"",busy:false};
var STPER=[["jour","Aujourd hui"],["7j","7 jours"],["mois","Ce mois"],["mois-1","Mois dernier"],["annee","Cette année"]];
var STMOY={carte:"Carte",especes:"Espèces",virement:"Virement",en_ligne:"En ligne"};
var STTYPE={piece:"Pièces",main_oeuvre:"Main-d oeuvre",article:"Articles"};
function stLoad(){
  ST.busy=true;
  api("/stats?periode="+ST.periode+"&magasin="+encodeURIComponent(ST.magasin)).then(function(d){ST.d=d;ST.busy=false;ST.msg="";if(TAB==="stats")render()}).catch(function(e){ST.busy=false;ST.msg=e.message;if(TAB==="stats")render()})}
function stBars(rows,fmt,color){
  var max=0;rows.forEach(function(r){if(r.v>max)max=r.v});
  if(!rows.length)return"<div class='muted'>Rien sur cette période.</div>";
  return rows.map(function(r){var w=max?Math.max(2,Math.round(r.v/max*100)):0;
    return"<div style='display:flex;align-items:center;gap:8px;margin:4px 0'><div style='width:150px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' title='"+esc(r.l)+"'>"+esc(r.l)+"</div><div style='flex:1;background:#eee;border-radius:4px;height:18px'><div style='width:"+w+"%;height:18px;border-radius:4px;background:"+(color||"#285a38")+"'></div></div><div style='width:90px;text-align:right;font-size:13px'><b>"+fmt(r.v)+"</b></div></div>"}).join("")}
function stKpi(titre,valeur,sous){return"<div style='flex:1;min-width:160px;background:#fff;border:1px solid #ddd;border-radius:10px;padding:12px'><div class='muted' style='font-size:12px;text-transform:uppercase'>"+titre+"</div><div style='font-size:26px;font-weight:800'>"+valeur+"</div><div class='muted' style='font-size:12px'>"+(sous||"&nbsp;")+"</div></div>"}
function stJours(rows){
  if(!rows.length)return"<div class='muted'>Aucun encaissement sur cette période.</div>";
  var max=0;rows.forEach(function(r){if(r.cents>max)max=r.cents});
  return"<div style='display:flex;align-items:flex-end;gap:3px;height:140px;border-bottom:1px solid #ccc;overflow-x:auto'>"+rows.map(function(r){
    var h=max?Math.max(3,Math.round(r.cents/max*130)):0,j=r.jour.split("-");
    return"<div style='flex:1;min-width:14px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center' title='"+j[2]+"/"+j[1]+" : "+eur(r.cents)+"'><div style='width:100%;height:"+h+"px;background:#285a38;border-radius:3px 3px 0 0'></div></div>"}).join("")+"</div>"
    +"<div style='display:flex;justify-content:space-between;font-size:11px;color:#666'><span>"+rows[0].jour.split("-").reverse().slice(0,2).join("/")+"</span><span>"+rows[rows.length-1].jour.split("-").reverse().slice(0,2).join("/")+"</span></div>"}
function vStats(){
  if(!ST.d&&!ST.busy)stLoad();
  var d=ST.d,h="<div class='caisse'><h3>Statistiques</h3><div class='actions'>"
    +STPER.map(function(p){return"<button class='"+(ST.periode===p[0]?"":"sec")+"' data-act='stPer' data-p='"+p[0]+"'>"+p[1]+"</button>"}).join("")+"</div>";
  if(d&&d.peutChoisirMagasin)h+="<div class='actions'>"+[["","Toutes les boutiques"],["Amiens","Amiens"],["Rouen","Rouen"]].map(function(m){return"<button class='"+(ST.magasin===m[0]?"":"sec")+"' data-act='stMag' data-m='"+m[0]+"'>"+m[1]+"</button>"}).join("")+"</div>";
  if(ST.msg)h+="<div class='card'>"+esc(ST.msg)+"</div>";
  if(!d){app.innerHTML=h+(ST.busy?"<div class='muted'>Chargement...</div>":"")+"</div>";return}
  var de=d.du.split("-").reverse().join("/"),a=d.au.split("-").reverse().join("/");
  var delta=d.ca.precedentCents>0?Math.round((d.ca.cents-d.ca.precedentCents)/d.ca.precedentCents*100):null;
  h+="<div class='muted'>Du "+de+" au "+a+(d.magasin?" · "+esc(d.magasin):" · toutes les boutiques")+"</div>";
  h+="<div style='display:flex;flex-wrap:wrap;gap:10px;margin:10px 0'>"
    +stKpi("Encaissé",eur(d.ca.cents),delta===null?"":(delta>=0?"+":"")+delta+" % vs période précédente")
    +stKpi("Ventes",d.ventes.nb,"Panier moyen "+eur(d.ventes.panierMoyenCents))
    +stKpi("Réparations déposées",d.reparations.deposees,d.reparations.pretes+" prêtes · "+d.reparations.enCours+" en cours")
    +stKpi("Délai moyen",d.reparations.delaiJours+" j","dépôt → prête")+"</div>";
  h+="<div class='card'><div class='step'>Encaissements par jour</div>"+stJours(d.ca.parJour)+"</div>";
  h+="<div class='card'><div class='step'>Encaissé par moyen de paiement</div>"+stBars(d.ca.parMoyen.map(function(x){return{l:STMOY[x.moyen]||x.moyen,v:x.cents}}),eur)+"</div>";
  h+="<div class='card'><div class='step'>Chiffre d affaires des ventes par type</div>"+stBars(d.ventes.parType.map(function(x){return{l:STTYPE[x.type]||x.type,v:x.cents}}),eur,"#2f6fd0")+"</div>";
  h+="<div class='card'><div class='step'>Meilleures ventes</div>"+stBars(d.ventes.topArticles.map(function(x){return{l:x.qte+" × "+x.libelle,v:x.cents}}),eur,"#c98a00")+"</div>";
  h+="<div class='card'><div class='step'>Trottinettes réparées (déposées sur la période)</div>"+stBars(d.reparations.parModele.map(function(x){return{l:x.nom,v:x.nb}}),function(v){return v},"#7a3fb5")+"</div>";
  h+="<div class='card'><div class='step'>Réparations prêtes par technicien</div>"+stBars(d.reparations.parTechnicien.map(function(x){return{l:x.nom,v:x.nb}}),function(v){return v},"#b5403f")+"</div>";
  var tx=d.devis.envoyes?Math.round(d.devis.acceptes/d.devis.envoyes*100):0;
  h+="<div class='card'><div class='step'>Devis envoyés au client</div><div>"+d.devis.envoyes+" envoyé(s) · <b>"+d.devis.acceptes+" accepté(s)</b> · "+d.devis.refuses+" refusé(s)"+(d.devis.envoyes?" · taux d acceptation "+tx+" %":"")+"</div></div>";
  h+="<div class='card'><div class='step'>Stock atelier"+(d.magasin?" · "+esc(d.magasin):"")+"</div><div>"+d.stock.references+" références · valeur d achat HT <b>"+eur(d.stock.valeurCents)+"</b> · <b>"+d.stock.aRecommander+"</b> à recommander</div></div>";
  app.innerHTML=h+"</div>"}
ACTS.stPer=function(b){ST.periode=b.dataset.p;ST.d=null;render()};
ACTS.stMag=function(b){ST.magasin=b.dataset.m;ST.d=null;render()};
`;
