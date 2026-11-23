export const IMPRESSION = `
// ---------- Impression : ticket de prise en charge + étiquettes produits ----------
var C128="11011001100,11001101100,11001100110,10010011000,10010001100,10001001100,10011001000,10011000100,10001100100,11001001000,11001000100,11000100100,10110011100,10011011100,10011001110,10111001100,10011101100,10011100110,11001110010,11001011100,11001001110,11011100100,11001110100,11101101110,11101001100,11100101100,11100100110,11101100100,11100110100,11100110010,11011011000,11011000110,11000110110,10100011000,10001011000,10001000110,10110001000,10001101000,10001100010,11010001000,11000101000,11000100010,10110111000,10110001110,10001101110,10111011000,10111000110,10001110110,11101110110,11010001110,11000101110,11011101000,11011100010,11011101110,11101011000,11101000110,11100010110,11101101000,11101100010,11100011010,11101111010,11001000010,11110001010,10100110000,10100001100,10010110000,10010000110,10000101100,10000100110,10110010000,10110000100,10011010000,10011000010,10000110100,10000110010,11000010010,11001010000,11110111010,11000010100,10001111010,10100111100,10010111100,10010011110,10111100100,10011110100,10011110010,11110100100,11110010100,11110010010,11011011110,11011110110,11110110110,10101111000,10100011110,10001011110,10111101000,10111100010,11110101000,11110100010,10111011110,10111101110,11101011110,11110101110,11010000100,11010010000,11010011100,1100011101011".split(",");
function c128bits(text){
  var t=String(text==null?"":text);
  try{t=t.normalize("NFD").replace(/[̀-ͯ]/g,"")}catch(e){}
  var s="";for(var i=0;i<t.length;i++){var k=t.charCodeAt(i);s+=(k>=32&&k<=126)?t.charAt(i):"-"}
  if(!s)return"";
  var codes=[],i2=0;
  if(/^[0-9]+$/.test(s)&&s.length>=4){
    codes.push(105);var n=s.length-(s.length%2);
    for(;i2<n;i2+=2)codes.push(parseInt(s.substr(i2,2),10));
    if(i2<s.length){codes.push(100);codes.push(s.charCodeAt(i2)-32)}
  }else{
    codes.push(104);for(;i2<s.length;i2++)codes.push(s.charCodeAt(i2)-32)}
  var sum=codes[0];for(var j=1;j<codes.length;j++)sum+=j*codes[j];
  codes.push(sum%103);codes.push(106);
  return codes.map(function(c){return C128[c]}).join("")}
function code128Svg(text,hMm){
  var bits=c128bits(text);if(!bits)return"";
  var q=10,p="",run=0;
  for(var i=0;i<=bits.length;i++){
    if(bits.charAt(i)==="1"){run++}else if(run){p+="M"+(q+i-run)+" 0h"+run+"v10h-"+run+"z";run=0}}
  return"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 "+(bits.length+2*q)+" 10' preserveAspectRatio='none' style='width:100%;height:"+hMm+"mm;display:block'><path d='"+p+"' fill='#000'/></svg>"}

function entSplit(txt){
  var nl=String.fromCharCode(10),haut=[],bas=[];
  (txt||"TURN SOCIETY").split(nl).forEach(function(x){if(/merci|bient[oô]t/i.test(x))bas.push(x);else if(x.trim())haut.push(x)});
  if(!haut.length)haut=["TURN SOCIETY"];
  return{haut:haut.map(function(x,i){return i===0?"<b>"+esc(x)+"</b>":esc(x)}).join("<br>"),bas:bas.map(esc).join(" ")}}
function entBas(es,defaut){return"<div class='rc rm' style='margin-top:6px'>"+(es.bas||defaut)+"</div>"}
function btnFlash(b,txt){
  if(!b||!b.tagName)return;
  var old=b.textContent;b.textContent=txt||"✓ Impression envoyée";b.disabled=true;b.style.background="#1f8f4e";b.style.color="#fff";
  setTimeout(function(){b.textContent=old;b.disabled=false;b.style.background="";b.style.color=""},2000)}
var IMPSTYLE=null;
function impStyle(css){
  if(!IMPSTYLE){IMPSTYLE=document.createElement("style");IMPSTYLE.id="impstyle";document.head.appendChild(IMPSTYLE)}
  IMPSTYLE.textContent=css}
var AGENT_URL="http://127.0.0.1:9101",AGENT_OK=null;
function agentPing(){
  if(AGENT_OK!==null)return Promise.resolve(AGENT_OK);
  var c=new AbortController();setTimeout(function(){c.abort()},700);
  return fetch(AGENT_URL+"/ping",{signal:c.signal}).then(function(r){return r.json()}).then(function(d){AGENT_OK=!!(d&&d.ok&&d.navigateur);setTimeout(function(){AGENT_OK=null},30000);return AGENT_OK}).catch(function(){AGENT_OK=false;setTimeout(function(){AGENT_OK=null},15000);return false})}
function impAgent(html,cls,css){
  var st=Array.prototype.map.call(document.querySelectorAll("style"),function(x){return x.id==="impstyle"?"":x.textContent}).join(" ");
  return fetch(AGENT_URL+"/print",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({html:html,cls:cls,css:css,styles:st})}).then(function(r){return r.json()}).then(function(d){return !!(d&&d.ok)}).catch(function(){return false})}
function impNavigateur(html,cls,css){
  var old=document.getElementById("impzone");if(old)old.remove();
  var z=document.createElement("div");z.id="impzone";z.className=cls;z.innerHTML=html;document.body.appendChild(z);
  impStyle(css);
  window.print();
  setTimeout(function(){z.remove();impStyle("")},800)}
function impImprimer(html,cls,css,silencieux,copies){
  var n=copies||1;
  function repli(){
    var h=html,i;for(i=1;i<n;i++)h+="<div style='break-after:page;page-break-after:always;height:0'></div>"+html;
    impNavigateur(h,cls,css)}
  if(!silencieux&&cls!=="recu"){repli();return}
  agentPing().then(function(ok){
    if(!ok){repli();return}
    var i,p=Promise.resolve(true);
    for(i=0;i<n;i++)p=p.then(function(prev){if(!prev)return false;return impAgent(html,cls,css)}).then(function(r){return new Promise(function(res){setTimeout(function(){res(r)},400)})});
    p.then(function(done){if(!done)repli()})})}
impStyle("");

// ----- Ticket de prise en charge (80 mm, comme le ticket de caisse) -----
function pecHtml(f){
  var nl=String.fromCharCode(10);
  var es=entSplit(f.ticketEntete),ent=es.haut;
  var g=f.gardeInfo||{};
  var h="<div class='rc'>"+ent+(MAG?"<br>Boutique "+esc(MAG):"")+"</div><hr>"
    +"<div class='rc'><b>TICKET DE PRISE EN CHARGE</b></div>"
    +"<div class='rc' style='font-size:20px'><b>"+pcn(f.id)+"</b></div>"
    +"<div class='rl'><span>Dépôt</span><span>"+esc(day(f.dateDepot))+"</span></div><hr>"
    +"<div class='rm'>Client</div><div><b>"+esc(f.client||"")+"</b></div>"+(f.phone?"<div>"+esc(f.phone)+"</div>":"")
    +"<div class='rm' style='margin-top:4px'>Trottinette</div><div><b>"+esc(f.trottinette||"")+"</b></div>"
    +"<div class='rm' style='margin-top:4px'>Panne signalée</div><div>"+esc(f.panne||"")+"</div>";
  if(f.etat)h+="<div class='rm' style='margin-top:4px'>État à l'arrivée</div><div>"+esc(f.etat)+"</div>";
  if(f.remarques)h+="<div class='rm' style='margin-top:4px'>Remarques</div><div>"+esc(f.remarques)+"</div>";
  if(f.sousGarantie)h+="<div style='margin-top:4px'><b>Sous garantie</b></div>";
  var d=f.devis||{lignes:[],netCents:0};
  if(d.lignes&&d.lignes.length){
    h+="<hr><div class='rm'>Devis</div>";
    d.lignes.forEach(function(l){h+="<div class='rl'><span>"+l.quantite+" × "+esc(l.libelle)+"</span><span>"+(l.prixCents>0?eur(l.quantite*l.prixCents):"à définir")+"</span></div>"});
    if(d.netCents>0)h+="<div class='rl rt'><span>TOTAL TTC</span><span>"+eur(d.netCents)+"</span></div>"}
  var a=f.acompte||{};
  if(a.verseCents>0)h+="<div class='rl'><span>Acompte versé</span><span>"+eur(a.verseCents)+"</span></div>";
  h+="<hr><div class='rm'>Gardiennage : gratuit "+(g.franchiseJours||5)+" jours après l'appel ou le mail indiquant que la trottinette est prête, puis "+((g.prixCents||500)/100).toString().replace(".",",")+" € par jour. Sans récupération au bout de "+(g.abandonJour||30)+" jours, la trottinette est considérée comme abandonnée.</div>"
    +"<div class='rm' style='margin-top:4px'>Nos CGV (conditions générales de vente) et CGR (conditions générales de réparation) sont disponibles sur turnshop.fr</div>"
    +"<div style='margin-top:10px;border:1px solid #000;height:16mm;padding:2px'><span class='rm'>Signature du client</span></div>"
    +"<div style='margin-top:8px'>"+code128Svg(pcn(f.id),12)+"</div><div class='rc rm'>"+pcn(f.id)+"</div>"
    +entBas(es,"Merci de votre confiance !");
  return h}
function pecCss(){return"@page{size:80mm auto;margin:0}@media print{body>*:not(#impzone){display:none!important}#impzone{position:static;width:80mm;box-sizing:border-box;font-size:12px;padding:0 3mm;margin:0}}"}
async function imprimerPEC(id){
  // Deux exemplaires d'un coup (un pour le client, un pour l'atelier), séparés par un saut de page.
  try{var f=await api("/reparation?id="+id);var t=pecHtml(f);impImprimer(t,"recu",pecCss(),false,2)}catch(e){alert(e.message)}}
ACTS.pecPrint=function(b){btnFlash(b);imprimerPEC(+b.dataset.id)};

// ----- Devis / facture en ticket 80 mm -----
var RDVI=null;
async function rdvInfos(){if(!RDVI){try{RDVI=await api("/ticket/rdv")}catch(e){RDVI={}}}return RDVI}
function devisCoord(r){
  var c=(MAG==="Rouen"?r.coordRouen:r.coordAmiens)||"";if(!c)return"";
  return"<div class='rc rm'>"+c.split(String.fromCharCode(10)).map(esc).join("<br>")+"</div>"}
function devisQr(r){
  if(!r.qrSvg)return"";
  return"<hr><div class='rc'><b>Prendre rendez-vous</b><br>en scannant ce QR code</div><div class='qr'>"+r.qrSvg+"</div>"}
function factureQr(r){
  var av=MAG==="Rouen"?r.avisQrRouen:r.avisQrAmiens,c1="",c2="";
  if(av)c1="<div class='qc'><b>Un avis ?</b><br>et une récompense !<div class='qr'>"+av+"</div></div>";
  if(r.siteQrSvg)c2="<div class='qc'><b>Notre site</b><br>et carte de fidélité<div class='qr'>"+r.siteQrSvg+"</div></div>";
  return(c1||c2)?"<hr><div class='qrow'>"+c1+c2+"</div>":""}
function docTicketHtml(f,mode,r){
  r=r||{};
  var nl=String.fromCharCode(10),fac=mode==="facture";
  var es=entSplit(f.ticketEntete),ent=es.haut;
  var d=f.devis||{lignes:[]},a=f.acompte||{},net=d.netCents==null?d.totalCents:d.netCents;
  var ttc=net,ht=Math.round(ttc/1.2),tva=ttc-ht,ver=a.verseCents||0;
  var h="<div class='rc'>"+ent+(MAG?"<br>Boutique "+esc(MAG):"")+"</div>"+devisCoord(r)+"<hr>"
    +"<div class='rc'><b>"+(fac?"FACTURE":"DEVIS")+"</b></div>"
    +"<div class='rc' style='font-size:18px'><b>"+pcn(f.id)+"</b></div>"
    +"<div class='rl'><span>Date</span><span>"+new Date().toLocaleDateString("fr-FR")+"</span></div><hr>"
    +"<div class='rm'>Client</div><div><b>"+esc(f.client||"")+"</b></div>"+(f.phone?"<div>"+esc(f.phone)+"</div>":"")
    +"<div class='rm' style='margin-top:4px'>Trottinette</div><div><b>"+esc(f.trottinette||"")+"</b></div><hr>";
  d.lignes.forEach(function(l){h+="<div class='rl'><span>"+l.quantite+" × "+esc(l.libelle)+"</span><span>"+(l.prixCents>0?eur(l.quantite*l.prixCents):"à définir")+"</span></div>"});
  if(d.remiseMultiCents)h+="<div class='rl'><span>Remise</span><span>-"+eur(d.remiseMultiCents)+"</span></div>";
  h+="<hr><div class='rl rt'><span>TOTAL TTC</span><span>"+eur(ttc)+"</span></div>"
    +"<div class='rl rm'><span>Total HT</span><span>"+eur(ht)+"</span></div><div class='rl rm'><span>TVA 20 %</span><span>"+eur(tva)+"</span></div>";
  if(ver>0)h+="<hr><div class='rl'><span>Acompte versé</span><span>-"+eur(ver)+"</span></div><div class='rl rt'><span>Reste à payer</span><span>"+eur(Math.max(0,ttc-ver))+"</span></div>";
  if(!fac)h+="<hr><div class='rc rm'>Devis valable 30 jours. Document non contractuel tant qu'il n'est pas validé par le client.</div>";
  if(!fac)h+=devisQr(r);else h+=factureQr(r);
  return h+entBas(es,"Merci de votre confiance !")}
async function imprimerDoc(id,mode){
  try{var f=await api("/reparation?id="+id);var r=await rdvInfos();impImprimer(docTicketHtml(f,mode,r),"recu",pecCss())}catch(e){alert(e.message)}}
function recuTexte(el){
  var nl=String.fromCharCode(10),out=[];
  for(var i=0;i<el.children.length;i++){var n=el.children[i];
    if(n.tagName==="HR"){out.push("------------------------------");continue}
    if(n.classList.contains("qr"))continue;
    if(n.classList.contains("rl")){var sp=n.querySelectorAll("span");out.push(sp.length>1?sp[0].textContent+" : "+sp[sp.length-1].textContent:n.textContent);continue}
    var t=(n.innerText||n.textContent||"").split(nl).join(" ").split("  ").join(" ").trim();if(t)out.push(t)}
  return out.join(nl)}
ACTS.cEmail=function(b){
  var id=+b.dataset.id,el=document.querySelector("[data-recu='"+id+"']");if(!el)return;
  var texte=recuTexte(el);
  function go(a){api("/caisse/email",{venteId:id,texte:texte,a:a||""}).then(function(d){alert(d.message)}).catch(function(e){
    if(!a&&/^Pas d/.test(e.message)){var x=prompt("Email du client :");if(x)go(x)}else alert(e.message)})}
  go("")};
ACTS.docPrint=function(b){btnFlash(b);imprimerDoc(+b.dataset.id,b.dataset.mode)};


// ----- Caisse : ouverture / fermeture (ticket Z) -----
var CLO={open:false,d:null,h:null,per:"30j",msg:""};
function cloLigne(l,v){return"<tr><td>"+l+"</td><td class='n'>"+eur(v)+"</td></tr>"}
function cloHeure(x){var t=new Date(x);return t.toLocaleDateString("fr-FR")+" "+t.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}
function cloTotaux(t){
  var e=t.encaisse,r=t.rembourse||{},h="<table class='devis' style='width:100%'>"+cloLigne("Carte",e.carte)+cloLigne("Espèces encaissées",e.especes)+cloLigne("Virement",e.virement)+cloLigne("En ligne (Shopify)",e.en_ligne);
  Object.keys(r).forEach(function(k){h+=cloLigne("Remboursé ("+esc(k)+")",-r[k])});
  return h+"</table><div class='muted'>"+t.nbVentes+" vente(s) · "+t.nbAcomptes+" acompte(s) · CA ventes "+eur(t.caCents)+"</div>"}
function cloEcartTxt(c){return(c>0?"+":"")+eur(c)}
function cloOuvreForm(d){
  var sug=d.fondConseilleCents?(d.fondConseilleCents/100).toFixed(2).split(".").join(","):"";
  return"<div class='step' style='margin-top:10px'>Ouvrir la caisse</div><div class='dl'><label class='muted'>Montant présent dans le tiroir (€)</label><input id='clo-fond' placeholder='Compte le tiroir' value='"+sug+"'></div>"
    +"<div class='actions'><button data-act='cloOuvrir'>Ouvrir la caisse</button></div>"}
function cloHist(){
  var h=CLO.h;if(!h)return"<div class='muted'>Chargement...</div>";
  var PER=[["30j","30 derniers jours"],["mois","Ce mois"],["mois-1","Mois dernier"]];
  var o="<div class='step' style='margin-top:14px'>Encaissements · "+esc(h.magasin)+" · du "+esc(h.du.split("-").reverse().join("/"))+" au "+esc(h.au.split("-").reverse().join("/"))+"</div><div class='actions'>"
    +PER.map(function(x){return"<button class='"+(CLO.per===x[0]?"":"sec")+"' data-act='cloPer' data-v='"+x[0]+"'>"+x[1]+"</button>"}).join("")+"</div>";
  var T={carte:0,especes:0,virement:0,en_ligne:0,rembourse:0};
  o+="<table class='devis' style='width:100%'><tr><th>Jour</th><th class='n'>Carte</th><th class='n'>Espèces</th><th class='n'>Virement</th><th class='n'>En ligne</th><th class='n'>Remb.</th><th class='n'>Total</th></tr>";
  h.jours.forEach(function(j){
    var tot=j.carte+j.especes+j.virement+j.en_ligne-j.rembourse;Object.keys(T).forEach(function(k){T[k]+=j[k]});
    o+="<tr><td>"+esc(j.jour.slice(8,10)+"/"+j.jour.slice(5,7))+"</td><td class='n'>"+eur(j.carte)+"</td><td class='n'>"+eur(j.especes)+"</td><td class='n'>"+eur(j.virement)+"</td><td class='n'>"+eur(j.en_ligne)+"</td><td class='n'>"+eur(j.rembourse)+"</td><td class='n'><b>"+eur(tot)+"</b></td></tr>"});
  o+="<tr><td><b>Total</b></td><td class='n'><b>"+eur(T.carte)+"</b></td><td class='n'><b>"+eur(T.especes)+"</b></td><td class='n'><b>"+eur(T.virement)+"</b></td><td class='n'><b>"+eur(T.en_ligne)+"</b></td><td class='n'><b>"+eur(T.rembourse)+"</b></td><td class='n'><b>"+eur(T.carte+T.especes+T.virement+T.en_ligne-T.rembourse)+"</b></td></tr></table>";
  if(!h.jours.length)o+="<div class='muted'>Aucun encaissement sur la période.</div>";
  o+="<div class='step' style='margin-top:14px'>Tickets Z et écarts de caisse</div>";
  var fermees=h.sessions.filter(function(x){return x.fermeeLe});
  if(!fermees.length)o+="<div class='muted'>Aucune fermeture de caisse sur la période.</div>";
  else{o+="<table class='devis' style='width:100%'><tr><th>Fermée le</th><th class='n'>Fond</th><th class='n'>Attendu</th><th class='n'>Compté</th><th class='n'>Écart</th><th></th></tr>";
    var ec=0;fermees.forEach(function(x){ec+=x.ecartCents;
      o+="<tr><td>"+esc(cloHeure(x.fermeeLe))+"<div class='muted'>"+esc(x.fermePar||"")+"</div></td><td class='n'>"+eur(x.fondCents)+"</td><td class='n'>"+eur(x.attenduCents)+"</td><td class='n'>"+eur(x.compteCents)+"</td><td class='n'><b"+(x.ecartCents?" style='color:#b00'":"")+">"+cloEcartTxt(x.ecartCents)+"</b></td><td><button class='sec' data-act='cloZ' data-id='"+x.id+"'>Ticket Z</button></td></tr>"});
    o+="<tr><td colspan='4'><b>Cumul des écarts</b></td><td class='n'><b>"+cloEcartTxt(ec)+"</b></td><td></td></tr></table>"}
  return o}
function cloHtml(){
  if(!CLO.open)return"<div class='actions' style='margin-top:12px'><button class='sec' data-act='cloOuvre'>Caisse : ouvrir / clôturer</button></div>";
  var d=CLO.d;if(!d)return"<div class='card'>Chargement...</div>";
  var h="<div class='card'><div class='step'>Caisse · "+esc(d.magasin)+"</div>";
  if(d.ouverte){
    var o=d.ouverte,att=o.fondCents+d.live.especesNettes;
    h+="<div><span class='tag ok'>Caisse ouverte</span> depuis "+esc(cloHeure(o.ouverteLe))+" par "+esc(o.ouvertPar)+" · tiroir à l ouverture "+eur(o.fondCents)+"</div>"+cloTotaux(d.live)
      +"<div class='muted'>Espèces attendues dans le tiroir : <b id='clo-att'>"+eur(att)+"</b></div>"
      +"<div class='dl'><label class='muted'>Espèces comptées (€)</label><input id='clo-compte' placeholder='Compte le tiroir'></div>"
      +"<div class='muted'>Écart : <b id='clo-ecart'>-</b></div><div class='dl'><input id='clo-note' placeholder='Note (facultatif)'></div>"
      +"<div class='actions'><button data-act='cloFermer'>Fermer la caisse (ticket Z)</button></div>"}
  else{
    h+="<div><span class='tag'>Caisse fermée</span></div>";
    if(d.dernier){var z=d.dernier;h+="<div class='muted' style='margin-top:6px'>Dernier ticket Z : fermée le "+esc(cloHeure(z.fermeeLe))+" par "+esc(z.fermePar||"")+" · compté "+eur(z.compteCents)+" · <b>écart "+cloEcartTxt(z.ecartCents)+"</b></div>"
      +"<div class='actions'><button class='sec' data-act='cloZ' data-id='"+z.id+"'>Imprimer le ticket Z</button></div>"}
    h+=cloOuvreForm(d)}
  if(CLO.msg)h+="<div class='muted'>"+esc(CLO.msg)+"</div>";
  if(estResp())h+=cloHist();
  h+="<div class='actions'><button class='sec' data-act='cloFerme'>Fermer ce panneau</button></div>";
  return h+"</div>"}
function cloCharge(){return api("/caisse/session").then(function(d){CLO.d=d;render()}).catch(function(e){CLO.msg=e.message;render()})}
function cloHistCharge(){if(!estResp())return;api("/caisse/cloture-historique?periode="+CLO.per).then(function(h){CLO.h=h;render()}).catch(function(e){CLO.msg=e.message;render()})}
ACTS.cloOuvre=function(){CLO={open:true,d:null,h:null,per:CLO.per||"30j",msg:""};render();cloCharge();cloHistCharge()};
ACTS.cloFerme=function(){CLO={open:false,d:null,h:null,per:CLO.per,msg:""};render()};
ACTS.cloPer=function(b){CLO.per=b.dataset.v;CLO.h=null;render();cloHistCharge()};
ACTS.cloOuvrir=function(){
  var f=document.getElementById("clo-fond");if(!f||!f.value.trim()){CLO.msg="Saisis le montant présent dans le tiroir.";render();return}
  api("/caisse/ouvrir",{fond:f.value}).then(function(){CLO.msg="Caisse ouverte.";return cloCharge()}).catch(function(e){CLO.msg=e.message;render()})};
ACTS.cloFermer=function(){
  var cp=document.getElementById("clo-compte");if(!cp||!cp.value.trim()){CLO.msg="Saisis les espèces comptées.";render();return}
  var att=CLO.d.ouverte.fondCents+CLO.d.live.especesNettes,cpt=Math.round((Number(cp.value.split(",").join("."))||0)*100);
  if(!confirm("Fermer la caisse ? Attendu "+eur(att)+", compté "+eur(cpt)+", écart "+eur(cpt-att)+"."))return;
  var n=document.getElementById("clo-note");
  api("/caisse/fermer",{compte:cp.value,note:n?n.value:""}).then(function(){CLO.msg="Caisse fermée. Ticket Z enregistré.";return cloCharge()}).then(function(){cloHistCharge();var z=CLO.d&&CLO.d.dernier;if(z)cloImprimeZ(z)}).catch(function(e){CLO.msg=e.message;render()})};
function cloImprimeZ(z){
  var t=z.totaux||{encaisse:{carte:0,especes:0,virement:0,en_ligne:0},rembourse:{},nbVentes:0,caCents:0},e=t.encaisse;
  var h="<div class='rc'><b>TICKET Z - CLÔTURE DE CAISSE</b><br>TURN SOCIETY · "+esc(z.magasin)+"<br>Ouverte "+esc(cloHeure(z.ouverteLe))+"<br>Fermée "+esc(cloHeure(z.fermeeLe))+"</div><hr>"
    +"<div class='rl'><span>Carte</span><span>"+eur(e.carte)+"</span></div><div class='rl'><span>Espèces</span><span>"+eur(e.especes)+"</span></div><div class='rl'><span>Virement</span><span>"+eur(e.virement)+"</span></div><div class='rl'><span>En ligne</span><span>"+eur(e.en_ligne)+"</span></div>";
  Object.keys(t.rembourse||{}).forEach(function(k){h+="<div class='rl'><span>Remboursé "+esc(k)+"</span><span>-"+eur(t.rembourse[k])+"</span></div>"});
  h+="<hr><div class='rl'><span>Ventes</span><span>"+t.nbVentes+"</span></div><div class='rl'><span>CA ventes</span><span>"+eur(t.caCents)+"</span></div><hr>"
    +"<div class='rl'><span>Tiroir à l ouverture</span><span>"+eur(z.fondCents)+"</span></div><div class='rl'><span>Espèces attendues</span><span>"+eur(z.attenduCents)+"</span></div><div class='rl'><span>Espèces comptées</span><span>"+eur(z.compteCents)+"</span></div><div class='rl rt'><span>ÉCART</span><span>"+cloEcartTxt(z.ecartCents)+"</span></div>"
    +(z.note?"<div class='rm'>"+esc(z.note)+"</div>":"")+"<div class='rc rm'>Ouverte par "+esc(z.ouvertPar||"")+" · fermée par "+esc(z.fermePar||"")+"</div>";
  impImprimer(h,"recu",pecCss())}
ACTS.cloZ=function(b){
  var id=+b.dataset.id,z=null;
  if(CLO.d&&CLO.d.dernier&&CLO.d.dernier.id===id)z=CLO.d.dernier;
  if(!z&&CLO.h)z=CLO.h.sessions.filter(function(x){return x.id===id})[0];
  if(z)cloImprimeZ(z)};
document.addEventListener("input",function(e){
  var t=e.target;if(!t||t.id!=="clo-compte"||!CLO.d||!CLO.d.ouverte)return;
  var a=CLO.d.ouverte.fondCents+CLO.d.live.especesNettes,ec=document.getElementById("clo-ecart");
  if(ec)ec.textContent=t.value.trim()?cloEcartTxt(Math.round((Number(t.value.split(",").join("."))||0)*100)-a):"-"});

// ----- Étiquettes produits : nom, prix, code-barres -----
var ETQ=[],ETQF=null,ETQSKIP=0;
var ETQFORMATS={"50x30":{l:"Rouleau 50 × 30 mm",w:50,h:30},"40x25":{l:"Rouleau 40 × 25 mm",w:40,h:25},"62x29":{l:"Ruban Brother 62 × 40 mm",w:62,h:40},"a4":{l:"Planche A4 3 × 8 (70 × 37 mm)",w:70,h:37,page:"A4",cols:3,rows:8}};
function etqFormat(){
  if(!ETQF){try{ETQF=localStorage.getItem("etqf")||""}catch(e){ETQF=""}}
  if(!ETQFORMATS[ETQF])ETQF="62x29";return ETQF}
function etqLabel(it,F){
  var code=it.barcode||it.sku||"";
  var L=F.h-(F.h>=36?5:3),A=F.w-4-9-1.5;
  var pr=String(it.prix).replace(".",",")+" €",em=it.empl||"";
  var tf=Math.round(F.h*0.4*10)/10,pf=Math.round(Math.min(F.h*0.85,(A-(em?11:0))/(0.2*pr.length))*10)/10,ef=Math.round(F.h*0.36*10)/10;
  return"<div class='etq' style='width:"+F.w+"mm;height:"+F.h+"mm;box-sizing:border-box;padding:"+(F.h>=36?3.5:1.5)+"mm 2mm 1.5mm;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;display:flex;gap:1.5mm'>"
    +"<div style='flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between'>"
    +"<div style='font-size:"+tf+"pt;font-weight:800;line-height:1.1;max-height:"+(tf*0.353*(F.h>=36?3.4:2.25))+"mm;overflow:hidden'>"+esc(it.titre)+"</div>"
    +"<div style='display:flex;align-items:flex-end;justify-content:space-between;gap:1mm'><div style='font-size:"+pf+"pt;font-weight:900;line-height:1;white-space:nowrap'>"+esc(pr)+"</div>"
    +(em?"<div style='font-size:"+ef+"pt;font-weight:800;line-height:1;border:0.4mm solid #000;padding:0.6mm 1mm;white-space:nowrap'>"+esc(em)+"</div>":"")+"</div></div>"
    +"<div style='width:9mm;flex:none;position:relative'>"
    +(code?"<div style='position:absolute;left:0;top:0;width:"+L+"mm;height:8mm;transform-origin:0 0;transform:translate(0,"+L+"mm) rotate(-90deg)'>"+code128Svg(code,6)+"<div style='font-size:5pt;text-align:center;line-height:1.1'>"+esc(code)+"</div></div>":"")
    +"</div></div>"}
function etqToutes(){var out=[];ETQ.forEach(function(it){for(var i=0;i<(it.qte||1);i++)out.push(it)});return out}
function etqCss(F){
  if(F.page)return"@page{size:A4;margin:0}@media print{body>*:not(#impzone){display:none!important}#impzone{position:absolute;left:0;top:0;width:210mm}.etqgrid{display:grid;grid-template-columns:repeat("+F.cols+","+F.w+"mm);grid-auto-rows:"+F.h+"mm;margin-left:0;margin-top:5mm}.etqempty{width:"+F.w+"mm;height:"+F.h+"mm}}";
  return"@page{size:"+F.w+"mm "+F.h+"mm;margin:0}@media print{body>*:not(#impzone){display:none!important}#impzone{position:absolute;left:0;top:0;width:"+F.w+"mm}.etq{break-after:page;page-break-after:always}.etq:last-child{break-after:auto;page-break-after:auto}}"}
function etqImprimer(){
  var F=ETQFORMATS[etqFormat()],L=etqToutes();
  if(!L.length){alert("Ajoute au moins un produit.");return}
  var h="";
  if(F.page){h="<div class='etqgrid'>";for(var s=0;s<ETQSKIP;s++)h+="<div class='etqempty'></div>";L.forEach(function(it){h+=etqLabel(it,F)});h+="</div>"}
  else L.forEach(function(it){h+=etqLabel(it,F)});
  if(!F.page&&etqFormat()==="62x29"){
    var hs=L.map(function(it){return etqLabel(it,F)}).join("<!--etq-->");
    agentPing().then(function(ok){
      if(!ok){impImprimer(h,"",etqCss(F));return}
      fetch(AGENT_URL+"/print-label",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({html:hs,w:F.w,h:F.h,n:L.length})}).then(function(r){return r.json()}).then(function(d){if(!d.ok)impImprimer(h,"",etqCss(F))}).catch(function(){impImprimer(h,"",etqCss(F))})});
    return}
  impImprimer(h,"",etqCss(F))}
function etqEmpl(){
  var todo=ETQ.filter(function(it){return it.empl===undefined&&(it.barcode||it.sku)});
  if(!todo.length)return;
  todo.forEach(function(it){it.empl=""});
  Promise.all(todo.map(function(it){return api("/stock/scan",{magasin:MAG||"",code:it.barcode||it.sku,local:true}).then(function(r){if(r.produit&&r.produit.emplacement)it.empl=r.produit.emplacement}).catch(function(){})})).then(function(){if(TAB==="etq")render()})}
function vEtq(){etqEmpl();
  var F=ETQFORMATS[etqFormat()],nb=etqToutes().length;
  var h=subHtml()+"<div class='card'><div class='step'>Étiquettes produits</div><div class='muted'>Cherche un produit, ajoute-le, choisis le nombre d'étiquettes puis imprime. Chaque étiquette : nom, prix et code-barres.</div>"+prodBox("etq")+"</div>";
  h+="<div class='card'><div class='step'>Imprimer sur</div><div class='actions'><button class='"+(F.page?"":"sec")+"' data-act='etqMode' data-f='a4'>🖨 Imprimante A4 (feuille à découper)</button><button class='"+(F.page?"sec":"")+"' data-act='etqMode' data-f='62x29'>🏷 Brother (rouleau)</button></div><div class='muted' style='margin-top:6px'>Autres formats :</div><select id='etqf' data-act='etqFormat'>"+Object.keys(ETQFORMATS).map(function(k){return"<option value='"+k+"'"+(k===etqFormat()?" selected":"")+">"+esc(ETQFORMATS[k].l)+"</option>"}).join("")+"</select>"
    +(F.page?"<div class='muted' style='margin-top:6px'>Étiquettes déjà utilisées sur la planche (à sauter)</div><input id='etqskip' type='number' min='0' max='"+(F.cols*F.rows-1)+"' value='"+ETQSKIP+"' data-act='etqSkip'>":"")
    +"<div class='muted' style='margin-top:6px'>Dans la fenêtre d'impression : choisis ton imprimante d'étiquettes, mets les marges sur « Aucune » et l'échelle à 100 %.</div></div>";
  h+="<div class='card'><div class='step'>À imprimer ("+nb+" étiquette"+(nb>1?"s":"")+")</div>";
  if(!ETQ.length)h+="<div class='muted'>Aucun produit pour l'instant.</div>";
  ETQ.forEach(function(it,i){
    h+="<div class='hrow' style='display:flex;gap:8px;align-items:center;justify-content:space-between;margin:6px 0'><div><b>"+esc(it.titre)+"</b><div class='muted'>"+esc(it.prix)+" € · "+(it.barcode?"code-barres "+esc(it.barcode):it.sku?"sku "+esc(it.sku):"pas de code-barres")+"</div></div>"
      +"<div style='display:flex;gap:6px;align-items:center'><input type='number' min='1' max='200' value='"+it.qte+"' style='width:70px' data-act='etqQte' data-i='"+i+"'><button class='danger' data-act='etqSuppr' data-i='"+i+"'>×</button></div></div>"});
  if(ETQ.length)h+="<div class='actions'><button data-act='etqPrint'>Imprimer</button><button class='sec' data-act='etqVider'>Tout vider</button></div>"
    +"<div class='step' style='margin-top:10px'>Aperçu</div><div style='overflow:auto;background:#eee;padding:8px'>"+etqLabel(ETQ[0],F)+"</div>";
  app.innerHTML=h+"</div>"}
ACTS.etqMode=function(b){ETQF=b.dataset.f;try{localStorage.setItem("etqf",ETQF)}catch(e){}render()};
ACTS.etqFormat=function(b){ETQF=b.value;try{localStorage.setItem("etqf",ETQF)}catch(e){}render()};
ACTS.etqSkip=function(b){ETQSKIP=Math.max(0,Number(b.value)||0)};
ACTS.etqQte=function(b){var it=ETQ[+b.dataset.i];if(it){it.qte=Math.max(1,Math.min(200,Number(b.value)||1))}};
ACTS.etqSuppr=function(b){ETQ.splice(+b.dataset.i,1);render()};
ACTS.etqVider=function(){ETQ=[];render()};
ACTS.etqPrint=function(){etqImprimer()};
document.addEventListener("change",function(e){var t=e.target;if(!t||!t.dataset||!t.dataset.act)return;if(t.tagName==="SELECT"||t.tagName==="INPUT"){var f=ACTS[t.dataset.act];if(f&&t.dataset.act.indexOf("etq")===0)f(t)}});
`;
