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

var IMPSTYLE=null;
function impStyle(css){
  if(!IMPSTYLE){IMPSTYLE=document.createElement("style");document.head.appendChild(IMPSTYLE)}
  IMPSTYLE.textContent=css}
function impImprimer(html,cls,css){
  var old=document.getElementById("impzone");if(old)old.remove();
  var z=document.createElement("div");z.id="impzone";z.className=cls;z.innerHTML=html;document.body.appendChild(z);
  impStyle(css);
  window.print();
  setTimeout(function(){z.remove();impStyle("")},800)}
impStyle("");

// ----- Ticket de prise en charge (80 mm, comme le ticket de caisse) -----
function pecHtml(f){
  var nl=String.fromCharCode(10);
  var ent=(f.ticketEntete||"TURN SOCIETY").split(nl).map(function(x,i){return i===0?"<b>"+esc(x)+"</b>":esc(x)}).join("<br>");
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
    +"<div style='margin-top:10px;border:1px solid #000;height:16mm;padding:2px'><span class='rm'>Signature du client</span></div>"
    +"<div style='margin-top:8px'>"+code128Svg(pcn(f.id),12)+"</div><div class='rc rm'>"+pcn(f.id)+"</div>"
    +"<div class='rc rm'>Merci de votre confiance !</div>";
  return h}
function pecCss(){return"@page{size:80mm auto;margin:0}@media print{body *{visibility:hidden}#impzone,#impzone *{visibility:visible}#impzone{position:absolute;left:0;top:0;width:74mm;font-size:12px;padding:0}}"}
async function imprimerPEC(id){
  try{var f=await api("/reparation?id="+id);impImprimer(pecHtml(f),"recu",pecCss())}catch(e){alert(e.message)}}
ACTS.pecPrint=function(b){imprimerPEC(+b.dataset.id)};

// ----- Devis / facture en ticket 80 mm -----
function docTicketHtml(f,mode){
  var nl=String.fromCharCode(10),fac=mode==="facture";
  var ent=(f.ticketEntete||"TURN SOCIETY").split(nl).map(function(x,i){return i===0?"<b>"+esc(x)+"</b>":esc(x)}).join("<br>");
  var d=f.devis||{lignes:[]},a=f.acompte||{},net=d.netCents==null?d.totalCents:d.netCents;
  var ttc=net,ht=Math.round(ttc/1.2),tva=ttc-ht,ver=a.verseCents||0;
  var h="<div class='rc'>"+ent+(MAG?"<br>Boutique "+esc(MAG):"")+"</div><hr>"
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
  return h+"<div class='rc rm' style='margin-top:6px'>Merci de votre confiance !</div>"}
async function imprimerDoc(id,mode){
  try{var f=await api("/reparation?id="+id);impImprimer(docTicketHtml(f,mode),"recu",pecCss())}catch(e){alert(e.message)}}
ACTS.docPrint=function(b){imprimerDoc(+b.dataset.id,b.dataset.mode)};

// ----- Étiquettes produits : nom, prix, code-barres -----
var ETQ=[],ETQF=null,ETQSKIP=0;
var ETQFORMATS={"50x30":{l:"Rouleau 50 × 30 mm",w:50,h:30},"40x25":{l:"Rouleau 40 × 25 mm",w:40,h:25},"62x29":{l:"Rouleau 62 × 29 mm (Brother)",w:62,h:29},"a4":{l:"Planche A4 3 × 8 (70 × 37 mm)",w:70,h:37,page:"A4",cols:3,rows:8}};
function etqFormat(){
  if(!ETQF){try{ETQF=localStorage.getItem("etqf")||""}catch(e){ETQF=""}}
  if(!ETQFORMATS[ETQF])ETQF="62x29";return ETQF}
function etqLabel(it,F){
  var code=it.barcode||it.sku||"";
  var L=F.h-3,A=F.w-4-9-1.5;
  var pr=String(it.prix).replace(".",",")+" €";
  var tf=Math.round(F.h*0.4*10)/10,pf=Math.round(Math.min(F.h*0.85,A/(0.2*pr.length))*10)/10;
  return"<div class='etq' style='width:"+F.w+"mm;height:"+F.h+"mm;box-sizing:border-box;padding:1.5mm 2mm;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;display:flex;gap:1.5mm'>"
    +"<div style='flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between'>"
    +"<div style='font-size:"+tf+"pt;font-weight:800;line-height:1.1;max-height:"+(tf*0.353*2.25)+"mm;overflow:hidden'>"+esc(it.titre)+"</div>"
    +"<div style='font-size:"+pf+"pt;font-weight:900;line-height:1;white-space:nowrap'>"+esc(pr)+"</div></div>"
    +"<div style='width:9mm;flex:none;position:relative'>"
    +(code?"<div style='position:absolute;left:0;top:0;width:"+L+"mm;height:8mm;transform-origin:0 0;transform:translate(0,"+L+"mm) rotate(-90deg)'>"+code128Svg(code,6)+"<div style='font-size:5pt;text-align:center;line-height:1.1'>"+esc(code)+"</div></div>":"")
    +"</div></div>"}
function etqToutes(){var out=[];ETQ.forEach(function(it){for(var i=0;i<(it.qte||1);i++)out.push(it)});return out}
function etqCss(F){
  if(F.page)return"@page{size:A4;margin:0}@media print{body *{visibility:hidden}#impzone,#impzone *{visibility:visible}#impzone{position:absolute;left:0;top:0;width:210mm}.etqgrid{display:grid;grid-template-columns:repeat("+F.cols+","+F.w+"mm);grid-auto-rows:"+F.h+"mm;margin-left:0;margin-top:5mm}.etqempty{width:"+F.w+"mm;height:"+F.h+"mm}}";
  return"@page{size:"+F.w+"mm "+F.h+"mm;margin:0}@media print{body *{visibility:hidden}#impzone,#impzone *{visibility:visible}#impzone{position:absolute;left:0;top:0;width:"+F.w+"mm}.etq{break-after:page;page-break-after:always}.etq:last-child{break-after:auto;page-break-after:auto}}"}
function etqImprimer(){
  var F=ETQFORMATS[etqFormat()],L=etqToutes();
  if(!L.length){alert("Ajoute au moins un produit.");return}
  var h="";
  if(F.page){h="<div class='etqgrid'>";for(var s=0;s<ETQSKIP;s++)h+="<div class='etqempty'></div>";L.forEach(function(it){h+=etqLabel(it,F)});h+="</div>"}
  else L.forEach(function(it){h+=etqLabel(it,F)});
  impImprimer(h,"",etqCss(F))}
function vEtq(){
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
