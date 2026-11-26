export const CREATION = `// ---------- Création directe : prise en charge / rendez-vous / devis (dans l'Atelier) ----------
var CREF={};
function creRestore(){Object.keys(CREF).forEach(function(k){var e=document.getElementById(k);if(!e)return;if(e.type==="checkbox")e.checked=CREF[k];else if(e.tagName==="SELECT"){for(var i=0;i<e.options.length;i++){if(e.options[i].value===CREF[k]&&!e.options[i].disabled){e.value=CREF[k];break}}}else e.value=CREF[k]});var n=document.getElementById("ct-new"),sl=document.getElementById("ct-sel");if(n&&sl)n.style.display=sl.value==="new"?"":"none"}
function creSave(e){var t=e.target;if(!t||!t.id||!/^(cr|ct|cn)-/.test(t.id)||ATSUB!=="creer")return;CREF[t.id]=t.type==="checkbox"?t.checked:t.value}
document.addEventListener("input",creSave);document.addEventListener("change",creSave);
var LISTES=null;
function listesCharge(){if(LISTES===null){LISTES=undefined;api("/parametres/listes").then(function(d){LISTES=d;render()}).catch(function(){LISTES={pannes:[],etats:[]};render()})}}
var CRE={mode:"prise",q:"",res:null,cli:null,msg:"",busy:false};
function creTitre(){return CRE.mode==="devis"?"Nouveau devis":(CRE.mode==="rdv"?"Nouveau rendez-vous":"Nouvelle prise en charge")}
function vCreer(){
  listesCharge();var LP=(LISTES&&LISTES.pannes)||[],LE=(LISTES&&LISTES.etats)||[];
  var m=CRE.mode,h=subHtml()+"<div style='margin-top:12px'><div class='step' style='font-size:20px'>"+creTitre()+"</div>"+(m==="devis"?"<div class='cre-hint'>Un numéro PC est attribué, les lignes se saisissent ensuite.</div>":"")+"</div>";
  if(CRE.msg)h+="<div class='pmsg'>"+esc(CRE.msg)+"</div>";
  h+="<div class='cre'>";
  // 1. Client
  h+="<div class='cre-sec'><div class='cre-h'><span class='cre-n'>1</span>Client</div>";
  if(CRE.cli){
    h+="<div class='tk' style='border-left-color:var(--vert);margin:0'><b>"+esc(CRE.cli.name)+"</b><br><span class='muted'>"+esc((CRE.cli.phone||CRE.cli.telephone||""))+" "+esc(CRE.cli.email||"")+"</span><br><button class='link' data-act='creAutreCli'>Changer de client</button></div>"}
  else{
    h+="<div class='dl'><input id='cre-q' class='lb' placeholder='Chercher un client (nom, téléphone, email)' value='"+esc(CRE.q)+"'><button data-act='creChercher'>Chercher</button></div>";
    if(CRE.res)h+=(CRE.res.length?CRE.res.map(function(c,i){return"<button class='sec hrow' data-act='creChoisir' data-i='"+i+"'><b>"+esc(c.name)+"</b> <span class='muted'>"+esc((c.phone||c.telephone||""))+" "+esc(c.email||"")+"</span></button>"}).join(""):"<div class='muted' style='margin-bottom:8px'>Aucun client trouvé : remplis le nouveau client ci-dessous.</div>");
    h+="<div class='cre-hint' style='margin:8px 0'>Ou nouveau client :</div><div class='cre-2'><input id='cn-pn' placeholder='Prénom'><input id='cn-nm' placeholder='Nom'><input id='cn-tel' placeholder='Téléphone'><input id='cn-em' placeholder='Email'></div>"}
  h+="</div>";
  // 2. Trottinette
  h+="<div class='cre-sec'><div class='cre-h'><span class='cre-n'>2</span>Trottinette</div>"+(m==="devis"?"<div class='cre-chips'><label><input id='cr-sv' type='checkbox'> Pas de trottinette (achat de pièces ou d accessoires)</label></div>":"");
  var ts=(CRE.cli&&CRE.cli.trottinettes)||[];
  if(ts.length)h+="<select id='ct-sel'>"+ts.map(function(t){return"<option value='"+t.id+"'>"+esc(t.marque+" "+t.modele)+(t.serie?" · "+esc(t.serie):"")+"</option>"}).join("")+"<option value='new'>Autre trottinette…</option></select>";
  h+="<div id='ct-new'"+(ts.length?" style='display:none'":"")+"><div class='cre-2'><input id='ct-m' placeholder='Marque' list='dl-marques' autocomplete='off'>"+marqDL()+"<input id='ct-mo' placeholder='Modèle'></div><input id='ct-s' placeholder='N° de série (vide = inconnu)' style='margin-top:10px'></div>";
  h+="</div>";
  // 3. Panne
  h+="<div class='cre-sec cre-full'><div class='cre-h'><span class='cre-n'>3</span>"+(m==="devis"?"Objet du devis":"Panne décrite par le client")+"</div>"
    +(m==="devis"?"":"<div class='cre-chips cre-pn'>"+LP.map(function(t){return"<button type='button' class='cre-pb' data-act='crePanne' data-t='"+esc(t)+"'>+ "+esc(t)+"</button>"}).join("")+"</div>")
    +"<textarea id='cr-p' rows='3' placeholder='"+(m==="devis"?"Ex : devis changement de batterie":"Panne décrite par le client")+"'></textarea>"
    +"<div class='cre-2'><select id='cr-e'><option value=''>État à l arrivée…</option>"+LE.map(function(t){return"<option>"+t+"</option>"}).join("")+"</select><textarea id='cr-r' rows='1' placeholder='Remarques' style='min-height:46px'></textarea></div></div>";
  // 4. Rangement et affaires
  h+="<div class='cre-sec'><div class='cre-h'><span class='cre-n'>4</span>Rangement et affaires</div>"+boiteSelect("cr-b")+affairesBox("cr")+"<div class='cre-2' style='margin-top:10px'><input id='cr-k' placeholder='🔑 Code / mot de passe (facultatif)'><input id='cr-d' type='date' value='"+today()+"'></div></div>";
  // 5. Options
  h+="<div class='cre-sec'><div class='cre-h'><span class='cre-n'>5</span>Options</div><div class='cre-chips'>"
    +"<label><input id='cr-abs' type='checkbox'"+(m!=="prise"?" checked":"")+"> Pas encore en magasin (rendez-vous)</label>"
    +"<label><input id='cr-gar' type='checkbox'> Sous garantie</label>"
    +(m==="prise"?"<label><input id='cr-pec' type='checkbox' checked> Imprimer le ticket</label>":"")+"</div>"
    +(m==="prise"?"<div style='display:flex;align-items:center;gap:10px'><span class='muted'>Nombre de tickets</span>"+pecNbSelect("cr")+"</div>":"")+"</div>";
  h+="</div>";
  h+="<div class='cre-bar'><button data-act='creOk'"+(CRE.busy?" disabled":"")+" style='min-width:260px'>"+(m==="devis"?"Créer le devis":(m==="rdv"?"Créer le rendez-vous":"Créer la prise en charge"))+"</button><button class='sec' data-act='creAnnule'>Annuler</button></div>";
  app.innerHTML=h;creRestore()}
ACTS.creer=function(b){CREF={};CRE={mode:b.dataset.k,q:"",res:null,cli:null,msg:"",busy:false};FICHE=null;TAB="enc";ATSUB="creer";render();setTimeout(function(){var e=document.getElementById("cre-q");if(e)e.focus()},50)};
ACTS.crePanne=function(b){var e=document.getElementById("cr-p");if(!e)return;var t=b.dataset.t,x=e.value.trim();if((", "+x+", ").toLowerCase().indexOf(", "+t.toLowerCase()+", ")>=0||x.toLowerCase()===t.toLowerCase())return;e.value=x?x+", "+t:t;CREF["cr-p"]=e.value;e.focus()};
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
  var nbp=pecNb("cr"),abs=document.getElementById("cr-abs"),gar=document.getElementById("cr-gar"),pec=document.getElementById("cr-pec"),sel=document.getElementById("ct-sel");
  CRE.busy=true;
  try{
    var cid;
    if(CRE.cli)cid=CRE.cli.id;
    else{if(!v("cn-nm")){throw new Error("Choisis un client ou renseigne au moins le nom du nouveau client.")}
      var dc=await api("/clients",{prenom:v("cn-pn"),nom:v("cn-nm"),telephone:v("cn-tel"),email:v("cn-em")});cid=dc.id}
    var tid,sv=document.getElementById("cr-sv");
    if(sv&&sv.checked){var dsv=await api("/trottinettes",{customerId:cid,marque:"Sans véhicule",modele:"Achat de pièces / accessoires",serie:"NC-"+Date.now()});tid=dsv.id}
    else if(sel&&sel.value!=="new")tid=Number(sel.value);
    else{if(!v("ct-m")||!v("ct-mo"))throw new Error("Indique la marque et le modèle de la trottinette.");
      var dt=await api("/trottinettes",{customerId:cid,marque:v("ct-m"),modele:v("ct-mo"),serie:v("ct-s")||("NC-"+Date.now())});tid=dt.id}
    var d=await api("/reparations",{customerId:cid,trottinetteId:tid,panne:(m==="devis"?"Devis : ":"")+pn,etat:v("cr-e"),remarques:v("cr-r"),boite:v("cr-b"),affaires:affairesLire("cr"),codeAcces:v("cr-k"),dateDepot:v("cr-d"),enMagasin:!(abs&&abs.checked),sousGarantie:!!(gar&&gar.checked)});
    CRE.busy=false;CREF={};ATSUB="liste";
    await ouvrirFiche(d.id);
    if(m==="prise"&&pec&&pec.checked&&!(abs&&abs.checked))await imprimerPEC(d.id,nbp)
  }catch(e){CRE.busy=false;CRE.msg=e.message;render()}};
var MARQ_BASE=["Xiaomi","Ninebot","Segway","Dualtron","Minimotors","Kaabo","Inokim","Zero","Vsett","Kuickwheel","Joyor","Cecotec","Navee","Hiboy","Apollo","Emove","Urbanglide","Wattiz","Teverun","Speedway","Aprilia","Pure","Decathlon","Oxelo","Nami","Yadea","Mercane","Ewheel","Eskuta","Bird","Lime","Dott","Autre"];
var MARQ=null,MARQBUSY=false;
function marqLoad(){if(MARQ===null&&!MARQBUSY){MARQBUSY=true;api("/modeles").then(function(d){var l=(d.modeles||d||[]).map(function(m){return m.marque});MARQ=l;MARQBUSY=false;var e=document.getElementById("dl-marques");if(e)e.innerHTML=marqOpts()}).catch(function(){MARQ=[];MARQBUSY=false})}}
function marqOpts(){var seen={},out=[];(MARQ||[]).concat(MARQ_BASE).forEach(function(m){var k=String(m||"").trim().toLowerCase();if(k&&!seen[k]){seen[k]=1;out.push(String(m).trim())}});out.sort(function(a,b){return a.localeCompare(b)});return out.map(function(m){return"<option value='"+esc(m)+"'>"}).join("")}
function marqDL(){marqLoad();return"<datalist id='dl-marques'>"+marqOpts()+"</datalist>"}
`;
