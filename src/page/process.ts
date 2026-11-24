export const PROCESS = `// ---------- Espace process et bonnes pratiques ----------
var PRC={pages:null,sel:0,q:"",ed:null,msg:""};
function prcCharge(){api("/process").then(function(d){PRC.pages=d;if(TAB==="process")render()}).catch(function(e){PRC.pages=[];PRC.msg=e.message;if(TAB==="process")render()})}
function prcPeut(){return ROLE==="admin"||ROLE==="responsable"||!ROLE}
function prcTexte(t){
  var nl=String.fromCharCode(10),out="",lst=false;
  String(t||"").split(nl).forEach(function(l){
    var li=/^- (.*)$/.exec(l),ch=/^- \\[ \\] (.*)$/.exec(l),h=/^# (.*)$/.exec(l);
    if(ch){if(!lst){out+="<div style='margin:4px 0'>";lst=true}out+="<label style='display:flex;gap:8px;align-items:flex-start;padding:3px 0'><input type='checkbox' style='width:auto;margin:3px 0 0'><span>"+esc(ch[1])+"</span></label>";return}
    if(li){if(!lst){out+="<div style='margin:4px 0'>";lst=true}out+="<div style='padding:2px 0 2px 14px;text-indent:-14px'>• "+esc(li[1])+"</div>";return}
    if(lst){out+="</div>";lst=false}
    if(h){out+="<div class='step' style='margin:14px 0 4px'>"+esc(h[1])+"</div>";return}
    if(l.trim())out+="<div style='padding:3px 0'>"+esc(l)+"</div>"});
  if(lst)out+="</div>";return out}
function vProcess(){
  if(!PRC.pages){prcCharge();app.innerHTML="<div class='caisse'><h3>📘 Process et bonnes pratiques</h3><div class='muted'>Chargement…</div></div>";return}
  var h="<div class='caisse'><h3>📘 Process et bonnes pratiques</h3>";
  if(PRC.ed){
    var e=PRC.ed;
    h+="<div class='card'><div class='step'>"+(e.id?"Modifier la page":"Nouvelle page")+"</div><input id='pr-t' placeholder='Titre' value='"+esc(e.titre)+"'><input id='pr-c' list='pr-cats' placeholder='Catégorie (ex : Atelier, Caisse et ventes)' value='"+esc(e.categorie)+"'><datalist id='pr-cats'>"+prcCats().map(function(c){return"<option value='"+esc(c)+"'>"}).join("")+"</datalist>"
      +"<textarea id='pr-x' rows='16' placeholder='Écris la procédure...'>"+esc(e.contenu)+"</textarea>"
      +"<div class='muted'>Astuces : une ligne qui commence par « # » est un titre, « - » une puce, « - [ ] » une case à cocher, « 1. » une étape numérotée.</div>"
      +"<div class='actions'><button data-act='prcSave'>Enregistrer</button><button class='sec' data-act='prcCancel'>Annuler</button>"+(e.id?"<button class='sec' data-act='prcDel' data-id='"+e.id+"' style='color:#c0392b'>Supprimer</button>":"")+"</div><div class='muted'>"+esc(PRC.msg)+"</div></div>";
    return app.innerHTML=h+"</div>"}
  var sel=PRC.pages.filter(function(p){return p.id===PRC.sel})[0];
  if(sel){
    h+="<button class='sec' data-act='prcBack' style='max-width:260px'>← Tous les process</button><div class='card' style='margin-top:8px'><div class='muted'>"+esc(sel.categorie)+"</div><h3 style='margin:2px 0 6px'>"+esc(sel.titre)+"</h3>"+prcTexte(sel.contenu)
      +"<div class='muted' style='margin-top:12px'>Dernière mise à jour : "+esc(dateLongue(sel.majLe))+(sel.majPar&&sel.majPar!=="Départ"?" par "+esc(sel.majPar):"")+"</div>"
      +(prcPeut()?"<div class='actions'><button class='sec' data-act='prcEdit' data-id='"+sel.id+"'>✏️ Modifier</button></div>":"")+"</div>";
    return app.innerHTML=h+"</div>"}
  var q=PRC.q.toLowerCase(),L=PRC.pages.filter(function(p){return!q||(p.titre+" "+p.categorie+" "+p.contenu).toLowerCase().indexOf(q)>=0});
  h+="<div class='card'><div class='dl'><input id='pr-q' class='lb' placeholder='Chercher un process (ex : garantie, clôture, devis)' value='"+esc(PRC.q)+"'>"+(prcPeut()?"<button data-act='prcNew'>+ Nouvelle page</button>":"")+"</div><div class='muted'>"+esc(PRC.msg)+"</div></div>";
  var cats=[];L.forEach(function(p){if(cats.indexOf(p.categorie)<0)cats.push(p.categorie)});
  if(!L.length)h+="<div class='card muted'>Aucun process trouvé.</div>";
  cats.forEach(function(c){h+="<div class='card'><div class='step'>"+esc(c)+"</div>"+L.filter(function(p){return p.categorie===c}).map(function(p){return"<button class='sec hrow' data-act='prcOpen' data-id='"+p.id+"'><b>"+esc(p.titre)+"</b></button>"}).join("")+"</div>"});
  app.innerHTML=h+"</div>"}
function prcCats(){var c=[];(PRC.pages||[]).forEach(function(p){if(c.indexOf(p.categorie)<0)c.push(p.categorie)});return c}
document.addEventListener("input",function(e){if(e.target&&e.target.id==="pr-q"){PRC.q=e.target.value;var p=e.target.selectionStart;vProcess();var n=document.getElementById("pr-q");if(n){n.focus();try{n.setSelectionRange(p,p)}catch(x){}}}});
ACTS.prcOpen=function(b){PRC.sel=+b.dataset.id;PRC.msg="";render();window.scrollTo(0,0)};
ACTS.prcBack=function(){PRC.sel=0;PRC.ed=null;render()};
ACTS.prcNew=function(){PRC.ed={id:0,titre:"",categorie:"",contenu:""};PRC.msg="";render()};
ACTS.prcEdit=function(b){var p=PRC.pages.filter(function(x){return x.id===+b.dataset.id})[0];if(p){PRC.ed={id:p.id,titre:p.titre,categorie:p.categorie,contenu:p.contenu};PRC.msg="";render()}};
ACTS.prcCancel=function(){PRC.ed=null;PRC.msg="";render()};
ACTS.prcSave=function(){api("/process/enregistrer",{id:PRC.ed.id,titre:v("pr-t"),categorie:v("pr-c"),contenu:document.getElementById("pr-x").value}).then(function(d){PRC.ed=null;PRC.sel=d.id;PRC.pages=null;PRC.msg="";render()}).catch(function(e){PRC.msg=e.message;render()})};
ACTS.prcDel=function(b){if(!confirm("Supprimer cette page ?"))return;api("/process/supprimer",{id:+b.dataset.id}).then(function(){PRC.ed=null;PRC.sel=0;PRC.pages=null;render()}).catch(function(e){PRC.msg=e.message;render()})};
`;
