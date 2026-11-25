export const BANQUE = `// ---------- Compta > Banque : relevé bancaire classé par mois, catégorie et magasin ----------
var BQ={pil:null,sel:"",det:false,sens:"debit",syn:null,ops:null,mois:"",aClasser:false,msg:"",busy:false};
var COMPSUB="synth";
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
var SY={d:null,mois:"",msg:"",busy:false};
function syCharge(){if(SY.busy)return;SY.busy=true;api("/compta/synthese"+(SY.mois?"?mois="+SY.mois:"")).then(function(d){SY.d=d;SY.mois=d.mois;SY.busy=false;if(TAB==="compta")render()}).catch(function(e){SY.msg=e.message;SY.d={liste:[],mois:""};SY.busy=false;if(TAB==="compta")render()})}
function syN(v,cls){return"<td class='n'"+(cls?" style='"+cls+"'":"")+">"+eur(v)+"</td>"}
function syEcart(e){var a=Math.abs(e);var col=a<100?"#1c7a3f":a<5000?"#b9770e":"#c0392b";return"<td class='n' style='color:"+col+";font-weight:700'>"+(e>0?"+":"")+eur(e)+"</td>"}
function vSynthese(){
  if(!SY.d){syCharge();return"<div class='card muted'>Chargement…</div>"}
  var d=SY.d;if(!d.mois)return"<div class='card muted'>"+esc(SY.msg||"Aucune donnée pour l'instant : importe un relevé ou fais des ventes.")+"</div>";
  var h="<div class='card'><div class='step'>Mois</div><div class='actions' style='flex-wrap:wrap'>"+d.liste.slice(0,12).map(function(m){return"<button class='"+(m===d.mois?"":"sec")+"' data-act='syMois' data-m='"+m+"'>"+esc(bqMoisLib(m))+"</button>"}).join("")+"</div>"
    +"<div class='muted' style='margin-top:6px'>CA retenu pour la marge : "+(d.source==="logiciel"?"<b>ventes du logiciel</b> ("+d.nbVentes+" ventes ce mois-ci)":"<b>encaissements de la banque</b> (aucune vente dans le logiciel ce mois-ci)")+"."+(d.releve?"":" ⚠ Relevé bancaire de ce mois pas importé : achats, charges et rapprochement sont à 0.")+"</div></div>";
  var L=d.caLogiciel,tot=function(k){return L.amiens[k]+L.rouen[k]+L.commun[k]};
  h+="<div class='card'><div class='step'>1 · CA par magasin d'après le logiciel</div><table class='devis' style='width:100%'><tr><th></th><th class='n'>Amiens</th><th class='n'>Rouen</th><th class='n'>En ligne / sans magasin</th><th class='n'>Total</th></tr>"
    +"<tr><td>CA TTC (ventes)</td>"+syN(L.amiens.ttc)+syN(L.rouen.ttc)+syN(L.commun.ttc)+syN(tot("ttc"),"font-weight:700")+"</tr>"
    +"<tr><td>Remboursements</td>"+syN(-L.amiens.remb)+syN(-L.rouen.remb)+syN(-L.commun.remb)+syN(-tot("remb"))+"</tr>"
    +"<tr><td><b>CA net TTC</b></td>"+syN(L.amiens.ttc-L.amiens.remb)+syN(L.rouen.ttc-L.rouen.remb)+syN(L.commun.ttc-L.commun.remb)+syN(tot("ttc")-tot("remb"),"font-weight:700")+"</tr>"
    +"<tr><td class='muted'>Nombre de ventes</td><td class='n muted'>"+L.amiens.nb+"</td><td class='n muted'>"+L.rouen.nb+"</td><td class='n muted'>"+L.commun.nb+"</td><td class='n muted'>"+tot("nb")+"</td></tr></table></div>";
  var B=d.caBanque;
  h+="<div class='card'><div class='step'>2 · CA par encaissement banque</div><table class='devis' style='width:100%'><tr><th></th><th class='n'>Amiens</th><th class='n'>Rouen</th><th class='n'>Commun (non attribué)</th><th class='n'>Total</th></tr>"
    +"<tr><td>Encaissements (CB, espèces déposées, chèques, virements, en ligne)</td>"+syN(B.amiens)+syN(B.rouen)+syN(B.commun)+syN(B.amiens+B.rouen+B.commun,"font-weight:700")+"</tr></table>"
    +"<div class='muted'>Les encaissements du relevé ne disent pas toujours de quelle boutique ils viennent : ce qui n'est pas attribué reste dans « Commun ». Retraits d'espèces du mois (non comptés) : "+eur(B.retraitsEspeces)+".</div></div>";
  h+="<div class='card'><div class='step'>3 · Rapprochement logiciel ↔ banque</div><div class='muted'>Écart = banque − logiciel. Vert : concordant. Orange/rouge : à vérifier (remises décalées de quelques jours, espèces pas encore déposées, encaissement non attribué à une boutique). Le bloc « Les deux ensemble » est le plus fiable.</div>";
  [["Amiens","amiens"],["Rouen","rouen"],["Les deux ensemble","ensemble"]].forEach(function(b){
    h+="<div class='step' style='margin-top:10px'>"+b[0]+"</div><table class='devis' style='width:100%'><tr><th></th><th class='n'>Logiciel</th><th class='n'>Banque</th><th class='n'>Écart</th></tr>";
    d.rapprochement.forEach(function(r){var x=r[b[1]];h+="<tr><td>"+esc(r.nom)+"</td>"+syN(x.log)+syN(x.ban)+syEcart(x.ban-x.log)+"</tr>"});
    var tl=0,tb=0;d.rapprochement.forEach(function(r){tl+=r[b[1]].log;tb+=r[b[1]].ban});
    h+="<tr><td><b>Total</b></td>"+syN(tl,"font-weight:700")+syN(tb,"font-weight:700")+syEcart(tb-tl)+"</tr></table>"});
  h+="</div>";
  var T=d.tva;
  h+="<div class='card'><div class='step'>4 · TVA estimée (20 %)</div><table class='devis' style='width:100%'>"
    +"<tr><td>TVA collectée (sur le CA TTC retenu)</td>"+syN(T.collectee)+"</tr>"
    +"<tr><td><b>TVA à payer SANS les achats</b></td>"+syN(T.sansAchats,"font-weight:700")+"</tr>"
    +"<tr><td>− TVA déductible estimée (achats, logiciels, télécom, fournitures du relevé)</td>"+syN(-T.deductibleEstimee)+"</tr>"
    +"<tr><td><b>TVA à payer AVEC TVA déductible estimée</b></td>"+syN(T.avecEstimee,"font-weight:700")+"</tr>"
    +"<tr><td>− TVA déductible réelle (saisie)</td><td class='n'>"+(T.deductibleSaisie==null?"<span class='muted'>pas saisie</span>":eur(-T.deductibleSaisie))+"</td></tr>"
    +"<tr><td><b>TVA à payer AVEC TVA déductible réelle</b></td><td class='n'><b>"+(T.avecSaisie==null?"—":eur(T.avecSaisie))+"</b></td></tr></table>"
    +"<div class='dl' style='margin-top:8px'><input id='sy-tva' class='p' placeholder='TVA déductible réelle du mois (€)' value='"+(T.deductibleSaisie==null?"":esc(String(T.deductibleSaisie/100).replace(".",",")))+"'><button data-act='syTva'>Enregistrer</button></div>"
    +"<div class='muted'>Laisse vide puis Enregistrer pour revenir à l'estimation. Estimation à confirmer avec le comptable.</div></div>";
  var M=d.marges,P=d.poles;
  var row=function(nom,o,gras,pc){return"<tr"+(gras?" style='background:#f4f6f8'":"")+"><td>"+(gras?"<b>"+nom+"</b>":nom)+"</td>"+syN(o.amiens,gras?"font-weight:700":"")+syN(o.rouen,gras?"font-weight:700":"")+syN(o.commun,gras?"font-weight:700":"")+syN(o.total,"font-weight:700")+"<td class='n muted'>"+(pc!=null?pc+" %":(M.caHt.total>0?Math.round(o.total*1000/M.caHt.total)/10+" %":""))+"</td></tr>"};
  h+="<div class='card'><div class='step'>5 · Dépenses par pôle et marge (HT)</div><table class='devis' style='width:100%'><tr><th></th><th class='n'>Amiens</th><th class='n'>Rouen</th><th class='n'>TURN SHOP (commun)</th><th class='n'>Total</th><th class='n'>% du CA</th></tr>"
    +row("Chiffre d'affaires HT",M.caHt,true,100);
  var pieces=P.filter(function(p){return p.cle==="pieces"})[0];
  h+=row("− "+esc(pieces.nom),{amiens:-pieces.amiens,rouen:-pieces.rouen,commun:-pieces.commun,total:-pieces.total})+row("Marge brute",M.margeBrute,true,M.margeBrute.pct);
  P.filter(function(p){return p.cle!=="pieces"}).forEach(function(p){h+=row("− "+esc(p.nom),{amiens:-p.amiens,rouen:-p.rouen,commun:-p.commun,total:-p.total})});
  h+=row("Marge nette (résultat)",M.net,true,M.net.pct)+"</table><div class='muted'>Les dépenses sont celles du relevé classé par pôle (achats, logiciels, télécom et fournitures passés de TTC en HT). Une dépense « À classer » se range dans « Voir et classer » de l'onglet Banque. Les retraits d'espèces et remboursements ne sont pas comptés.</div></div>";
  return h}
ACTS.syMois=function(b){SY.mois=b.dataset.m;SY.d=null;SY.busy=false;render()};
ACTS.syTva=function(){api("/compta/tva-deductible",{mois:SY.mois,montant:v("sy-tva")}).then(function(r){SY.msg=r.message;SY.d=null;SY.busy=false;render()}).catch(function(e){alert(e.message)})};
`;
