export const RETOURS = `// ---------- Bugs et suggestions ----------
var RTR={d:null,msg:"",type:"bug",ctx:""};
function rtLoad(){api("/retours").then(function(d){RTR.d=d;if(TAB==="retours")render()}).catch(function(e){RTR.msg=e.message;if(TAB==="retours")render()})}
function vRetours(){
  if(!RTR.d)rtLoad();
  var d=RTR.d,h="<div class='caisse'><h3>Un bug ou une idée ?</h3><div class='card'>"
    +"<div class='actions'><button id='rt-bug' class='"+(RTR.type==="bug"?"":"sec")+"' data-act='rtType' data-t='bug'>&#128027; Un bug</button><button id='rt-sug' class='"+(RTR.type==="suggestion"?"":"sec")+"' data-act='rtType' data-t='suggestion'>&#128161; Une idée d amélioration</button></div>"
    +"<div class='dl'><textarea id='rt-texte' rows='5' style='width:100%' placeholder='Explique ce qui ne marche pas, ou ce que tu aimerais avoir (où, quand, sur quelle fiche...)'></textarea></div>"
    +"<div class='actions'><button data-act='rtEnvoi'>Envoyer</button></div>"
    +(RTR.msg?"<div class='muted'>"+esc(RTR.msg)+"</div>":"")+"</div>";
  if(d&&d.retours.length){
    h+="<div class='card'><div class='step'>Déjà remontés</div>"+d.retours.map(function(r){
      return"<div style='padding:6px 0;border-bottom:1px solid #eee"+(r.traite?";opacity:.55":"")+"'><span class='tag"+(r.type==="bug"?" warn":"")+"'>"+(r.type==="bug"?"Bug":"Idée")+"</span> "+esc(r.texte)
        +"<div class='muted' style='font-size:12px'>"+esc(r.par)+(r.magasin?" · "+esc(r.magasin):"")+" · "+new Date(r.le).toLocaleDateString("fr-FR")+(r.contexte?" · "+esc(r.contexte):"")+(r.traite?" · traité":"")+"</div>"
        +(d.peutTraiter?"<button class='sec' data-act='rtTraite' data-id='"+r.id+"' data-v='"+(r.traite?"0":"1")+"'>"+(r.traite?"Rouvrir":"Marquer traité")+"</button>":"")+"</div>"}).join("")+"</div>"}
  app.innerHTML=h+"</div>"}
ACTS.rtType=function(b){RTR.type=b.dataset.t;var t=document.getElementById("rt-texte"),v=t?t.value:"";RTR.msg="";render();var n=document.getElementById("rt-texte");if(n)n.value=v};
ACTS.rtEnvoi=function(){
  var t=document.getElementById("rt-texte"),txt=t?t.value:"";
  api("/retours",{type:RTR.type,texte:txt,contexte:RTR.ctx}).then(function(d){RTR.msg=d.message;RTR.d=null;render()}).catch(function(e){RTR.msg=e.message;render();var n=document.getElementById("rt-texte");if(n)n.value=txt})};
ACTS.rtTraite=function(b){api("/retours/traite",{id:Number(b.dataset.id),traite:b.dataset.v==="1"}).then(function(){RTR.d=null;render()}).catch(function(e){alert(e.message)})};
`;
