export const PARAMETRES = `// ---------- Paramètres (admins) ----------
var SHOPRES="",PARAM=null,AVL=null,AVMSG="",AVDEC="achat",AVF={libelle:"",seuil:"",dd:"",df:"",effet:"cadeau",valeur:""};
function avDesc(a){return esc(avLabel(a))+" · "+esc(avCondition(a))}
function avForm(){
  var f=AVF,d=AVDEC,sel=function(val,cur,txt){return"<option value='"+val+"'"+(val===cur?" selected":"")+">"+txt+"</option>"};
  var h="<div class='avform'><b>Ajouter un cadeau ou une offre</b>"
    +"<label class='muted'>Nom (ex : Gant offert, -10 % week-end)</label><input id='avl' value='"+esc(f.libelle)+"'>"
    +"<label class='muted'>Quand ?</label><select id='avd' data-act='avType'>"+sel("achat",d,"Quand l'achat atteint un montant")+sel("cumul",d,"Quand le client a dépensé un total en caisse")+sel("date",d,"À une date ou sur une période")+"</select>";
  if(d==="date")h+="<label class='muted'>Du</label><input id='avdd' type='date' value='"+esc(f.dd)+"'><label class='muted'>Au</label><input id='avdf' type='date' value='"+esc(f.df)+"'>";
  h+="<label class='muted'>"+(d==="date"?"Achat minimum (€, facultatif)":d==="cumul"?"Total dépensé à atteindre (€)":"Montant d'achat à atteindre (€)")+"</label><input id='avs' value='"+esc(f.seuil)+"' placeholder='ex : 100'>"
    +"<label class='muted'>Récompense</label><select id='ave' data-act='avType'>"+sel("cadeau",f.effet,"Un cadeau (à remettre au client)")+sel("euros",f.effet,"Une remise en euros")+sel("pourcent",f.effet,"Une remise en pourcentage")+"</select>";
  if(f.effet!=="cadeau")h+="<label class='muted'>"+(f.effet==="euros"?"Montant de la remise (€)":"Pourcentage de remise (%)")+"</label><input id='avv' value='"+esc(f.valeur)+"'>";
  return h+"<button data-act='avSave'>Ajouter</button><div class='muted'>"+esc(AVMSG)+"</div></div>"}
function vParam(){
  if(ROLE!=="admin"){app.innerHTML="<div class='card'>Réservé aux administrateurs.</div>";return}
  if(!PARAM||!AVL){
    app.innerHTML="<div class='card'>Chargement…</div>";
    Promise.all([api("/parametres"),api("/avantages")]).then(function(r){PARAM=r[0];AVL=r[1];render()}).catch(function(e){app.innerHTML="<div class='card'>"+esc(e.message)+"</div>"});return}
  var h="<div class='card'><div class='step'>Programme de fidélité</div><div class='muted'>Règle de départ : 100 € dépensés = 5 € offerts. Tu peux la changer quand tu veux.</div>"
    +"<label class='muted'>Euros à dépenser pour gagner un palier</label><input id='pe1' value='"+esc(PARAM.eurosPourPalier)+"'>"
    +"<label class='muted'>Remise offerte à chaque palier (€)</label><input id='pr1' value='"+esc(PARAM.remiseEuros)+"'>"
    +"<button data-act='saveParam'>Enregistrer</button><div class='muted' id='parmsg'></div></div>";
  h+="<div class='card'><div class='step'>Cadeaux et offres</div><div class='muted'>Ils apparaissent automatiquement en caisse quand les conditions sont remplies (le vendeur peut les décocher).</div>";
  if(!AVL.length)h+="<div class='muted' style='margin:8px 0'>Aucun cadeau ni offre pour l'instant.</div>";
  AVL.forEach(function(a){h+="<div class='avrow'><div><b>"+esc(a.libelle)+"</b>"+(a.actif?"":" <span class='tag'>désactivé</span>")+"<div class='muted'>"+avDesc(a)+"</div></div><div class='actions'><button class='sec' data-act='avEtat' data-id='"+a.id+"' data-v='"+(a.actif?0:1)+"'>"+(a.actif?"Désactiver":"Réactiver")+"</button><button class='sec' data-act='avSuppr' data-id='"+a.id+"'>Supprimer</button></div></div>"});
  h+=avForm()+"</div>";
  h+="<div class='card'><div class='step'>Connexion Shopify</div><div class='muted'>Teste la connexion au catalogue turnshop.fr.</div><button data-act='shopTest'>Tester la connexion</button><div id='shopres'>"+(SHOPRES||"")+"</div></div>";
  app.innerHTML=h}
`;
