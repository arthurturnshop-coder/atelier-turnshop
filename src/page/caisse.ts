export const CAISSE = `// ---------- Caisse ----------
var PAN=[],CCLI=null,CFID=null,CUSE=false,CPAY={carte:"",especes:"",virement:""},CREP=null,CMSG="";
function panierTotal(){return PAN.reduce(function(s,l){return s+l.quantite*Math.round(Number(String(l.prix).replace(",","."))*100||0)},0)}
function remiseCents(){return CUSE&&CFID?Math.min(Math.round(CFID.disponibleEuros*100),panierTotal()):0}
function vCaisse(){
  var tot=panierTotal(),rem=remiseCents(),net=tot-rem;
  var h="<div class='card'><div class='step'>Client (scanne la carte ou tape un email, un téléphone)</div><div class='search'><input id='cq' placeholder='Scan carte, email ou téléphone' autofocus><button data-act='cScan'>Chercher</button></div>";
  if(CCLI)h+="<div style='margin-top:8px'><b>"+esc(CCLI.name)+"</b> <span class='muted'>"+esc(CCLI.phone||"")+"</span> <button class='link' data-act='cClient0'>Retirer</button></div>";
  else h+="<div class='muted' style='margin-top:6px'>Vente sans client.</div>";
  if(CCLI&&CFID){
    var gagne=Math.floor(net/100/CFID.regle.eurosPourPalier);
    h+="<div class='fidbox'><b>Fidélité</b><div>Déjà dépensé en caisse : "+CFID.depenseEuros.toFixed(2).replace(".",",")+" € · prochain palier dans "+CFID.prochainPalierIn.toFixed(2).replace(".",",")+" €</div>"
      +"<div>Cet achat rapporte "+gagne+" palier(s) ("+CFID.regle.remiseEuros+" € offerts tous les "+CFID.regle.eurosPourPalier+" € dépensés).</div>";
    if(CFID.disponibleEuros>0)h+="<div><b>"+CFID.disponibleEuros.toFixed(2).replace(".",",")+" € de bon d'achat disponible.</b> On l'utilise ?</div><div class='actions'><button class='"+(CUSE?"":"sec")+"' data-act='cUse' data-v='1'>Oui, utiliser</button><button class='"+(CUSE?"sec":"")+"' data-act='cUse' data-v='0'>Non</button></div>";
    else h+="<div class='muted'>Aucun bon d'achat disponible pour l'instant.</div>";
    h+="</div>";
  }
  h+="</div>";
  h+="<div class='card'><div class='step'>Panier</div>";
  if(!PAN.length)h+="<div class='muted'>Panier vide. Ajoute un article ci-dessous.</div>";
  else h+="<table class='panier' style='width:100%;border-collapse:collapse'><tr><th style='text-align:left'>Article</th><th>Qté</th><th>Prix €</th><th></th></tr>"+PAN.map(function(l,i){return"<tr><td>"+esc(l.libelle)+"</td><td><input type='number' min='1' value='"+l.quantite+"' data-act='cQte' data-i='"+i+"'></td><td><input value='"+esc(l.prix)+"' data-act='cPrix' data-i='"+i+"'></td><td><button class='link' data-act='cDel' data-i='"+i+"'>Retirer</button></td></tr>"}).join("")+"</table>";
  h+="<div class='dl' style='margin-top:8px'><input id='cl' class='lb' placeholder='Article (libellé) ou cherche dans le bandeau noir'><input id='cq2' class='q' type='number' min='1' value='1'><input id='cp' class='p' placeholder='Prix €'><button data-act='cAdd'>Ajouter</button></div></div>";
  h+="<div class='card'><div class='step'>Paiement</div><div>Sous-total : "+eur(tot)+(rem?" · remise fidélité : -"+eur(rem):"")+"</div><div class='big'>À payer : "+eur(net)+"</div>"
    +"<div class='pay'><span>Carte</span><input id='pc' placeholder='0,00' value='"+esc(CPAY.carte)+"'></div><div class='pay'><span>Espèces</span><input id='pe' placeholder='0,00' value='"+esc(CPAY.especes)+"'></div><div class='pay'><span>Virement</span><input id='pv' placeholder='0,00' value='"+esc(CPAY.virement)+"'></div>"
    +"<div class='muted'>Astuce : un seul moyen de paiement = clique sur « Tout en carte / espèces / virement ».</div>"
    +"<div class='actions'><button class='sec' data-act='cTout' data-m='carte'>Tout en carte</button><button class='sec' data-act='cTout' data-m='especes'>Tout en espèces</button><button class='sec' data-act='cTout' data-m='virement'>Tout en virement</button></div>"
    +"<button data-act='cEncaisser'>Encaisser</button><div class='muted'>"+esc(CMSG)+"</div></div>";
  app.innerHTML=h;
  var q=document.getElementById("cq");if(q)q.addEventListener("keydown",function(e){if(e.key==="Enter")ACTS.cScan()})}
function lirePay(){CPAY={carte:v("pc"),especes:v("pe"),virement:v("pv")}}
`;
