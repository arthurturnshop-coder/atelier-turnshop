export const BANQUE = `// ---------- Compta > Banque : relevé bancaire classé par mois, catégorie et magasin ----------
var BQ={pil:null,sel:"",det:false,sens:"debit",syn:null,ops:null,mois:"",aClasser:false,msg:"",busy:false};
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
  var p=BQ.pil;if(!p)return"<div class='card muted'>Chargement…</div>";
  if(!p.mois.length)return"";
  var m=p.mois.filter(function(x){return x.mois===BQ.sel})[0]||p.mois.filter(function(x){return x.releve})[0]||p.mois[0];BQ.sel=m.mois;
  var h="<div class='card'><div class='step'>Pilotage</div><div class='actions' style='flex-wrap:wrap'>"+p.mois.slice(0,12).map(function(x){return"<button class='"+(x.mois===m.mois?"":"sec")+"' data-act='bqMois' data-m='"+x.mois+"'>"+esc(bqMoisLib(x.mois))+"</button>"}).join("")+"</div>";
  if(!m.releve)h+="<div class='muted' style='margin-top:8px'>⚠ Relevé bancaire de ce mois pas importé : seules les ventes de la caisse sont comptées, achats et charges sont à 0.</div>";
  function cel(v,col,pct){return"<td class='n'>"+(v===null?"":"<b style='color:"+(col||"inherit")+"'>"+eur(v)+"</b>")+(pct!==undefined&&pct!==null?" <span class='muted'>"+pct+" %</span>":"")+"</td>"}
  function lig(l,k,neg,gras,col){var cs=["turn","amiens","rouen","total"];return"<tr"+(gras?" style='background:#f4f6f8'":"")+"><td>"+(gras?"<b>"+l+"</b>":l)+"</td>"+cs.map(function(c){var v=m[c][k];return cel(neg&&v?-v:v,col&&v<0?"#c0392b":(gras?"#1e8449":""),k==="marge"?m[c].margePct:undefined)}).join("")+"</tr>"}
  h+="<div style='overflow-x:auto'><table class='devis' style='width:100%;margin-top:8px'><tr><th></th><th class='n'>TURN SHOP<br><span class='muted'>site + frais communs</span></th><th class='n'>AMIENS</th><th class='n'>ROUEN</th><th class='n'>TOTAL</th></tr>"
    +lig("Chiffre d'affaires TTC","caTtc")+lig("Chiffre d'affaires HT","caHt")+lig("Achats marchandises HT","achats",true)
    +lig("Marge brute","marge",false,true,true)+lig("Salaires","salaires",true)+lig("Autres charges HT","charges",true)
    +lig("Résultat estimé","resultat",false,true,true)+lig("TVA à payer (estim.)","tva")+"</table></div>"
    +"<div class='muted' style='margin-top:6px'>"+(m.source==="caisse"?"CA = ventes de la caisse (+ ventes en ligne de la banque). ":"CA = encaissements de la banque (CB, web, espèces, chèques, virements). ")+(m.total.nb?m.total.nb+" ventes en caisse. ":"")+(m.total.retraits?"Retraits d'espèces non comptés : "+eur(m.total.retraits)+". ":"")+"</div>"
    +"<div class='muted'>Les achats sont comptés quand tu les paies, pas quand tu vends : un gros réassort donne une marge basse ce mois-là. TVA à 20 % estimée, à confirmer avec le comptable. Une dépense sans magasin va dans TURN SHOP : classe-la dans « Voir et classer » pour la mettre sur Amiens ou Rouen.</div></div>";
  return h+bqPoles(m.mois)}
function bqPoles(mois){
  if(!BQ.syn)return"";var m=BQ.syn.mois.filter(function(x){return x.mois===mois})[0];if(!m)return"";
  var h="<div class='card'><div class='step'>Où part l'argent · "+esc(bqMoisLib(mois))+"</div>";
  m.lignes.slice(0,10).forEach(function(l){var t=l.amiens+l.rouen+l.commun,pc=m.total?Math.round(t*100/m.total):0;
    h+="<div style='margin:6px 0'><div style='display:flex;justify-content:space-between;font-size:13px'><span>"+esc(l.categorie)+"</span><b>"+eur(t)+" <span class='muted'>"+pc+" %</span></b></div><div style='height:6px;background:#eee;border-radius:3px'><div style='height:6px;width:"+pc+"%;background:#2f6fd0;border-radius:3px'></div></div></div>"});
  return h+"<div class='actions'><button class='sec' data-act='bqVoir' data-m='"+esc(mois)+"'>Voir et classer les opérations</button></div></div>"}
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
  var s=BQ.syn,h="<div class='card'><div class='dl' style='align-items:center'><label class='sec' style='cursor:pointer;padding:8px 12px;border:1px solid #1c5a34;border-radius:8px'>⬆ Importer un relevé (CSV)<input id='bq-file' type='file' accept='.csv,.txt' style='display:none'></label><button class='sec' data-act='bqExport'>⬇ Exporter (CSV)</button></div>"
    +(BQ.msg?"<div class='muted' style='margin-top:6px'>"+esc(BQ.msg)+"</div>":"")
    +(s.aClasser>0?"<div style='margin-top:8px'><button class='sec' data-act='bqClasser'>⚠ "+s.aClasser+" opération(s) à classer</button></div>":"")+"</div>";
  if(!s.mois.length)h+="<div class='card muted'>Aucun relevé importé. Importe un CSV (date; libellé; débit; crédit).</div>";
  h+=bqPilote();
  return h+bqOpsHtml()}
ACTS.compSub=function(b){COMPSUB=b.dataset.v;render()};
ACTS.bqMois=function(b){BQ.sel=b.dataset.m;render()};
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
