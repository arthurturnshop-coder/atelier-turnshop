export const BANQUE = `// ---------- Compta > Banque : relevé bancaire classé par mois, catégorie et magasin ----------
var BQ={pil:null,det:false,sens:"debit",syn:null,ops:null,mois:"",aClasser:false,msg:"",busy:false};
var COMPSUB="z";
function bqCharge(){
  if(!BQ.pil)api("/banque/pilotage").then(function(d){BQ.pil=d;if(TAB==="compta")render()}).catch(function(){BQ.pil={mois:[]}});
  api("/banque/synthese?sens="+BQ.sens).then(function(d){BQ.syn=d;if(TAB==="compta")render()}).catch(function(e){BQ.msg=e.message;BQ.syn={mois:[],aClasser:0};if(TAB==="compta")render()})}
function bqOps(){
  var q=BQ.aClasser?"a_classer=1":"mois="+BQ.mois;
  api("/banque/ops?"+q).then(function(d){BQ.ops=d;var y=window.scrollY;if(TAB==="compta"){render();window.scrollTo(0,y)}}).catch(function(e){BQ.msg=e.message;render()})}
function bqMoisLib(m){var n=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];return n[+m.slice(5,7)-1]+" "+m.slice(0,4)}
function bqTable(m){
  var t=[0,0,0],h="<div class='card'><div class='step'>"+esc(bqMoisLib(m.mois))+"</div><table class='devis' style='width:100%'><tr><th>Catégorie</th><th class='n'>Amiens</th><th class='n'>Rouen</th><th class='n'>Commun</th><th class='n'>Total</th></tr>";
  m.lignes.forEach(function(l){t[0]+=l.amiens;t[1]+=l.rouen;t[2]+=l.commun;
    h+="<tr><td>"+esc(l.categorie)+"</td><td class='n'>"+(l.amiens?eur(l.amiens):"")+"</td><td class='n'>"+(l.rouen?eur(l.rouen):"")+"</td><td class='n'>"+(l.commun?eur(l.commun):"")+"</td><td class='n'><b>"+eur(l.amiens+l.rouen+l.commun)+"</b></td></tr>"});
  h+="<tr><td><b>Total</b></td><td class='n'><b>"+eur(t[0])+"</b></td><td class='n'><b>"+eur(t[1])+"</b></td><td class='n'><b>"+eur(t[2])+"</b></td><td class='n'><b>"+eur(t[0]+t[1]+t[2])+"</b></td></tr></table>"
    +"<div class='actions'><button class='sec' data-act='bqVoir' data-m='"+esc(m.mois)+"'>Voir et classer les opérations</button></div></div>";
  return h}
function bqResume(m,deb){
  var h="<div class='card'><div class='step'>"+esc(bqMoisLib(m.mois))+"</div><div style='display:flex;gap:10px;flex-wrap:wrap;margin:6px 0'>"
    +"<div style='flex:1;min-width:140px;background:#f4f6f8;border-radius:10px;padding:10px'><div class='muted'>"+(deb?"Dépenses":"Encaissé")+"</div><b style='font-size:20px;white-space:nowrap'>"+eur(m.total)+"</b></div>"
    +"<div style='flex:1;min-width:140px;background:#eaf6ee;border-radius:10px;padding:10px'><div class='muted'>"+(deb?"TVA récupérable (estim.)":"TVA collectée (estim.)")+"</div><b style='font-size:20px;white-space:nowrap'>"+eur(m.tva)+"</b></div></div>";
  m.lignes.slice(0,8).forEach(function(l){var t=l.amiens+l.rouen+l.commun,p=m.total?Math.round(t*100/m.total):0;
    h+="<div style='margin:5px 0'><div style='display:flex;justify-content:space-between;font-size:13px'><span>"+esc(l.categorie)+"</span><b>"+eur(t)+" <span class='muted'>"+p+"%</span></b></div><div style='height:6px;background:#eee;border-radius:3px'><div style='height:6px;width:"+p+"%;background:#2f6fd0;border-radius:3px'></div></div></div>"});
  return h+"</div>"}
function bqPilote(){
  var p=BQ.pil;if(!p)return"<div class='card muted'>Pilotage : chargement…</div>";
  if(!p.mois.length)return"";
  function c(l,v,col){return"<tr><td>"+l+"</td><td class='n'><b style='color:"+(col||"inherit")+"'>"+v+"</b></td></tr>"}
  var h="<div class='card'><div class='step'>Pilotage (estimation)</div><div class='muted'>CA = ventes de la caisse (+ web) depuis qu'elle est utilisée, avant : encaissements de la banque. Marge = CA HT − achats marchandises HT. Résultat = marge − salaires − charges. Les achats sont comptés quand tu les paies, pas quand tu vends le stock : un mois de gros réassort donne une marge négative.</div>";
  p.mois.slice(0,6).forEach(function(m){
    if(!m.releve){h+="<div style='margin-top:12px;padding-top:8px;border-top:1px solid #eee'><b>"+esc(bqMoisLib(m.mois))+"</b><div class='muted'>CA caisse : "+eur(m.caTtc)+" TTC ("+m.nb+" ventes, panier moyen "+eur(m.panier)+"). Marge et résultat pas calculables : relevé bancaire de ce mois pas encore importé.</div></div>";return}
    h+="<div style='margin-top:12px;padding-top:8px;border-top:1px solid #eee'><b>"+esc(bqMoisLib(m.mois))+"</b><table class='devis' style='width:100%;margin-top:4px'>"
      +c(m.source==="caisse"?"CA TTC (caisse Amiens "+eur(m.amiens)+" · Rouen "+eur(m.rouen)+" · web "+eur(m.web)+")":"CA TTC (encaissements vus sur la banque : CB, web, espèces, chèques, virements)",eur(m.caTtc))
      +c("CA HT",eur(m.caHt))
      +c("Achats marchandises HT","-"+eur(m.achatsHt))
      +c("Marge brute estimée",eur(m.marge)+" ("+m.margePct+" %)","#1e8449")
      +c("Salaires et rémunérations","-"+eur(m.salaires))
      +c("Autres charges HT (abonnements, assurances, prêt, frais…)","-"+eur(m.charges))
      +c("Résultat estimé",eur(m.resultat),m.resultat<0?"#c0392b":"#1e8449")
      +c("TVA à payer estimée (collectée "+eur(m.tvaCollectee)+" − récupérable "+eur(m.tvaRecup)+")",eur(m.tvaAPayer))
      +"</table><div class='muted'>"+m.nb+" ventes en caisse · panier moyen "+eur(m.panier)+(m.retraits?" · retraits espèces non comptés : "+eur(m.retraits):"")+"</div></div>"});
  return h+"</div>"}
function bqOpsHtml(){
  if(!BQ.ops)return"";
  var o=BQ.ops,h="<div class='card'><div class='step'>"+(BQ.aClasser?"Opérations à classer":"Opérations de "+esc(bqMoisLib(BQ.mois)))+"</div>"
    +"<div class='muted'>Choisis la catégorie et le magasin, coche « Retenir » pour que les prochains relevés soient classés tout seuls.</div><datalist id='bq-cats'>"+o.categories.map(function(c){return"<option value='"+esc(c)+"'>"}).join("")+"</datalist>";
  if(!o.ops.length)return h+"<div class='muted'>Aucune opération.</div></div>";
  h+=o.ops.map(function(x){
    var montant=x.debitCents?"-"+eur(x.debitCents):"+"+eur(x.creditCents);
    return"<div style='padding:8px 0;border-bottom:1px solid #eee'><div style='display:flex;justify-content:space-between;gap:10px'><span style='font-size:13px'>"+esc(x.jour.slice(8,10)+"/"+x.jour.slice(5,7))+" · "+esc(x.libelle.slice(0,110))+"</span><b style='white-space:nowrap;color:"+(x.debitCents?"#c0392b":"#1e8449")+"'>"+montant+"</b></div>"
      +"<div class='dl' style='margin-top:4px;align-items:center'><input id='bq-c-"+x.id+"' list='bq-cats' value='"+esc(x.categorie)+"' style='flex:2'><select id='bq-m-"+x.id+"'>"+["Commun","Amiens","Rouen"].map(function(m){return"<option"+(x.magasin===m?" selected":"")+">"+m+"</option>"}).join("")+"</select>"
      +"<label style='font-size:12px'><input type='checkbox' id='bq-r-"+x.id+"'> Retenir</label><button class='sec' data-act='bqOk' data-id='"+x.id+"'>OK</button></div></div>"}).join("");
  return h+"</div>"}
function vBanque(){
  if(!BQ.syn){bqCharge();return"<div class='muted'>Chargement…</div>"}
  var s=BQ.syn,h="<div class='card'><div class='actions'><button class='"+(BQ.sens==="debit"?"":"sec")+"' data-act='bqSens' data-s='debit'>Dépenses (débits)</button><button class='"+(BQ.sens==="credit"?"":"sec")+"' data-act='bqSens' data-s='credit'>Recettes (crédits)</button></div>"
    +"<div class='dl' style='margin-top:8px;align-items:center'><label class='sec' style='cursor:pointer;padding:8px 12px;border:1px solid #1c5a34;border-radius:8px'>⬆ Importer un relevé (CSV)<input id='bq-file' type='file' accept='.csv,.txt' style='display:none'></label><button class='sec' data-act='bqExport'>⬇ Exporter les tableaux (CSV)</button></div>"
    +(BQ.msg?"<div class='muted' style='margin-top:6px'>"+esc(BQ.msg)+"</div>":"")
    +(s.aClasser>0?"<div style='margin-top:8px'><button class='sec' data-act='bqClasser'>⚠ "+s.aClasser+" opération(s) à classer</button></div>":"")+"</div>";
  if(!s.mois.length)h+="<div class='card muted'>Aucun relevé importé. Importe un CSV (date; libellé; débit; crédit).</div>";
  h+=bqPilote();
  s.mois.forEach(function(m){h+=bqResume(m,BQ.sens==="debit")});
  if(s.mois.length){h+="<div class='card'><div class='muted'>TVA estimée à 20 % sur "+(BQ.sens==="debit"?"achats, logiciels, télécom et fournitures":"les encaissements de ventes")+" (montants TTC ÷ 6). À confirmer avec le comptable.</div><button class='sec' data-act='bqDet' style='margin-top:6px'>"+(BQ.det?"Masquer":"Voir")+" le détail par magasin</button></div>";if(BQ.det)s.mois.forEach(function(m){h+=bqTable(m)})}
  return h+bqOpsHtml()}
ACTS.compSub=function(b){COMPSUB=b.dataset.v;render()};
ACTS.bqDet=function(){BQ.det=!BQ.det;render()};
ACTS.bqSens=function(b){BQ.sens=b.dataset.s;BQ.syn=null;render()};
ACTS.bqVoir=function(b){BQ.mois=b.dataset.m;BQ.aClasser=false;BQ.ops=null;bqOps()};
ACTS.bqClasser=function(){BQ.aClasser=true;BQ.ops=null;bqOps()};
ACTS.bqOk=function(b){
  var id=b.dataset.id,c=document.getElementById("bq-c-"+id),m=document.getElementById("bq-m-"+id),r=document.getElementById("bq-r-"+id);
  api("/banque/classer",{id:+id,categorie:c?c.value:"",magasin:m?m.value:"Commun",memoriser:!!(r&&r.checked)}).then(function(d){BQ.msg=d.message;BQ.syn=null;bqOps();bqCharge()}).catch(function(e){alert(e.message)})};
ACTS.bqExport=function(){
  api("/banque/export").then(function(d){var a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\\uFEFF"+d.csv],{type:"text/csv"}));a.download="banque-par-mois-et-magasin.csv";document.body.appendChild(a);a.click();a.remove()}).catch(function(e){alert(e.message)})};
document.addEventListener("change",function(e){
  var t=e.target;if(!t||t.id!=="bq-file"||!t.files||!t.files[0])return;
  var fr=new FileReader();BQ.msg="Import en cours…";render();
  fr.onload=function(){api("/banque/import",{texte:String(fr.result)}).then(function(d){BQ.msg=d.message;BQ.syn=null;BQ.pil=null;BQ.ops=null;render()}).catch(function(er){BQ.msg=er.message;render()})};
  fr.readAsText(t.files[0],"utf-8")});
`;
