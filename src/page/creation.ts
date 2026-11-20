export const CREATION = `// ---------- Création directe : prise en charge / rendez-vous / devis (dans l'Atelier) ----------
var CRE={mode:"prise",q:"",res:null,cli:null,msg:"",busy:false};
function creTitre(){return CRE.mode==="devis"?"Nouveau devis":(CRE.mode==="rdv"?"Nouveau rendez-vous":"Nouvelle prise en charge")}
function vCreer(){
  var m=CRE.mode,h=subHtml()+"<div class='card'><div class='step'>"+creTitre()+(m==="devis"?" (un numéro PC est attribué, les lignes se saisissent ensuite)":"")+"</div>";
  if(CRE.msg)h+="<div class='pmsg'>"+esc(CRE.msg)+"</div>";
  h+="<div class='lab'>1. Client</div>";
  if(CRE.cli){
    h+="<div class='tk' style='border-left-color:var(--vert)'><b>"+esc(CRE.cli.name)+"</b> <span class='muted'>"+esc(CRE.cli.telephone||"")+" "+esc(CRE.cli.email||"")+"</span> <button class='link' data-act='creAutreCli'>Changer</button></div>"}
  else{
    h+="<div class='dl'><input id='cre-q' class='lb' placeholder='Chercher un client (nom, téléphone, email)' value='"+esc(CRE.q)+"'><button data-act='creChercher'>Chercher</button></div>";
    if(CRE.res)h+=(CRE.res.length?CRE.res.map(function(c,i){return"<button class='sec hrow' data-act='creChoisir' data-i='"+i+"'><b>"+esc(c.name)+"</b> <span class='muted'>"+esc(c.telephone||"")+" "+esc(c.email||"")+"</span></button>"}).join(""):"<div class='muted'>Aucun client trouvé : remplis le nouveau client ci-dessous.</div>");
    h+="<div class='muted' style='margin-top:8px'>Ou nouveau client :</div><div class='dl'><input id='cn-pn' placeholder='Prénom'><input id='cn-nm' placeholder='Nom'><input id='cn-tel' placeholder='Téléphone'><input id='cn-em' placeholder='Email'></div>"}
  h+="<div class='lab'>2. Trottinette</div>";
  var ts=(CRE.cli&&CRE.cli.trottinettes)||[];
  if(ts.length)h+="<select id='ct-sel'>"+ts.map(function(t){return"<option value='"+t.id+"'>"+esc(t.marque+" "+t.modele)+(t.serie?" · "+esc(t.serie):"")+"</option>"}).join("")+"<option value='new'>Autre trottinette…</option></select>";
  h+="<div class='dl' id='ct-new'"+(ts.length?" style='display:none'":"")+"><input id='ct-m' placeholder='Marque'><input id='ct-mo' placeholder='Modèle'><input id='ct-s' placeholder='N° de série (vide = inconnu)'></div>";
  h+="<div class='lab'>3. "+(m==="devis"?"Objet du devis":"Panne décrite par le client")+"</div><textarea id='cr-p' rows='3' placeholder='"+(m==="devis"?"Ex : devis changement de batterie":"Panne décrite par le client")+"'></textarea>"
    +"<input id='cr-e' placeholder='État à l arrivée'><textarea id='cr-r' rows='2' placeholder='Remarques'></textarea><input id='cr-d' type='date' value='"+today()+"'>"
    +"<label class='muted' style='display:flex;gap:8px;align-items:center'><input id='cr-abs' type='checkbox' style='width:auto;margin:0'"+(m!=="prise"?" checked":"")+"> La trottinette n'est pas encore en magasin</label>"
    +"<label class='muted' style='display:flex;gap:8px;align-items:center'><input id='cr-gar' type='checkbox' style='width:auto;margin:0'> Sous garantie</label>"
    +(m==="prise"?"<label class='muted' style='display:flex;gap:8px;align-items:center'><input id='cr-pec' type='checkbox' checked style='width:auto;margin:0'> Imprimer le ticket de prise en charge</label>":"")
    +"<div class='actions'><button data-act='creOk'"+(CRE.busy?" disabled":"")+">"+(m==="devis"?"Créer le devis":(m==="rdv"?"Créer le rendez-vous":"Créer la prise en charge"))+"</button><button class='sec' data-act='creAnnule'>Annuler</button></div></div>";
  app.innerHTML=h}
ACTS.creer=function(b){CRE={mode:b.dataset.k,q:"",res:null,cli:null,msg:"",busy:false};FICHE=null;TAB="enc";ATSUB="creer";render();setTimeout(function(){var e=document.getElementById("cre-q");if(e)e.focus()},50)};
ACTS.creAnnule=function(){ATSUB="liste";render()};
ACTS.creAutreCli=function(){CRE.cli=null;CRE.res=null;render()};
ACTS.creChercher=function(){CRE.q=v("cre-q");if(!CRE.q)return;api("/search?q="+encodeURIComponent(CRE.q)).then(function(r){CRE.res=r;render()}).catch(function(e){CRE.msg=e.message;render()})};
ACTS.creChoisir=function(b){CRE.cli=CRE.res[+b.dataset.i];CRE.res=null;render()};
document.addEventListener("keydown",function(e){if(e.key==="Enter"&&e.target&&e.target.id==="cre-q"){e.preventDefault();ACTS.creChercher()}});
document.addEventListener("change",function(e){if(e.target&&e.target.id==="ct-sel"){var n=document.getElementById("ct-new");if(n)n.style.display=e.target.value==="new"?"":"none"}});
ACTS.creOk=async function(){
  if(CRE.busy)return;
  var m=CRE.mode,pn=v("cr-p");
  if(!pn){alert(m==="devis"?"Indique l objet du devis.":"La panne est obligatoire.");return}
  var abs=document.getElementById("cr-abs"),gar=document.getElementById("cr-gar"),pec=document.getElementById("cr-pec"),sel=document.getElementById("ct-sel");
  CRE.busy=true;
  try{
    var cid;
    if(CRE.cli)cid=CRE.cli.id;
    else{if(!v("cn-nm")){throw new Error("Choisis un client ou renseigne au moins le nom du nouveau client.")}
      var dc=await api("/clients",{prenom:v("cn-pn"),nom:v("cn-nm"),telephone:v("cn-tel"),email:v("cn-em")});cid=dc.id}
    var tid;
    if(sel&&sel.value!=="new")tid=Number(sel.value);
    else{if(!v("ct-m")||!v("ct-mo"))throw new Error("Indique la marque et le modèle de la trottinette.");
      var dt=await api("/trottinettes",{customerId:cid,marque:v("ct-m"),modele:v("ct-mo"),serie:v("ct-s")||("NC-"+Date.now())});tid=dt.id}
    var d=await api("/reparations",{customerId:cid,trottinetteId:tid,panne:(m==="devis"?"Devis : ":"")+pn,etat:v("cr-e"),remarques:v("cr-r"),dateDepot:v("cr-d"),enMagasin:!(abs&&abs.checked),sousGarantie:!!(gar&&gar.checked)});
    CRE.busy=false;ATSUB="liste";
    await ouvrirFiche(d.id);
    if(m==="prise"&&pec&&pec.checked&&!(abs&&abs.checked))await imprimerPEC(d.id)
  }catch(e){CRE.busy=false;CRE.msg=e.message;render()}};
`;
