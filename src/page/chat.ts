export const CHAT = `// ---------- Chat interne (équipe + messages privés) ----------
var CH={conv:"equipe",msgs:null,eq:null,par:{},total:0,busy:false,err:""};
function chatBadge(){var e=document.getElementById("chatb");if(!e)return;e.textContent=CH.total>0?String(CH.total):"";e.style.display=CH.total>0?"inline-block":"none"}
function chatNonLus(){if(!TOK&&!PW)return Promise.resolve();return api("/chat/non-lus").then(function(d){CH.par=d.par||{};CH.total=d.total||0;chatBadge();if(TAB==="chat")chatChips()}).catch(function(){})}
function chatHeure(t){try{var d=new Date(t),a=new Date();var h=d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Paris"});return d.toDateString()===a.toDateString()?h:d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",timeZone:"Europe/Paris"})+" "+h}catch(e){return""}}
function chatChips(){
  var el=document.getElementById("chat-chips");if(!el||!CH.eq)return;
  var n=function(k){return CH.par[k]>0&&CH.conv!==k?" <b style='background:#c0392b;color:#fff;border-radius:10px;padding:0 7px;font-size:12px'>"+CH.par[k]+"</b>":""};
  el.innerHTML="<button class='"+(CH.conv==="equipe"?"":"sec")+"' data-act='chatConv' data-c='equipe'>&#128101; Équipe"+n("equipe")+"</button>"+CH.eq.membres.map(function(m){return"<button class='"+(CH.conv===m.prenom?"":"sec")+"' data-act='chatConv' data-c='"+esc(m.prenom)+"'>"+esc(m.prenom)+n(m.prenom)+"</button>"}).join("")}
function chatThread(scroll){
  var el=document.getElementById("chat-thread");if(!el)return;
  var me=CH.eq?CH.eq.moi:PRENOM;
  if(!CH.msgs){el.innerHTML="<div class='muted'>Chargement…</div>";return}
  if(!CH.msgs.length){el.innerHTML="<div class='muted'>Aucun message. Écris le premier !</div>";return}
  var bas=el.scrollHeight-el.scrollTop-el.clientHeight<60;
  el.innerHTML=CH.msgs.map(function(m){var moi=m.de===me;
    return"<div style='display:flex;justify-content:"+(moi?"flex-end":"flex-start")+";margin:6px 0'><div style='max-width:78%;background:"+(moi?"#1c5a34":"#eef0ee")+";color:"+(moi?"#fff":"#111")+";border-radius:12px;padding:8px 12px'>"
      +(moi?"":"<div style='font-size:12px;font-weight:700;opacity:.75'>"+esc(m.de)+"</div>")+"<div style='white-space:pre-wrap;word-break:break-word'>"+esc(m.texte)+"</div><div style='font-size:11px;opacity:.6;text-align:right'>"+esc(chatHeure(m.le))+"</div></div></div>"}).join("");
  if(scroll||bas)el.scrollTop=el.scrollHeight}
function chatCharge(scroll){
  var conv=CH.conv;
  return api("/chat/messages?conv="+encodeURIComponent(conv)).then(function(d){if(CH.conv!==conv)return;var ancien=CH.msgs?CH.msgs.length:-1;CH.msgs=d.messages;chatThread(scroll||ancien!==d.messages.length);chatNonLus()}).catch(function(e){CH.err=e.message})}
function vChat(){
  if(!CH.eq){api("/chat/equipe").then(function(d){CH.eq=d;if(TAB==="chat")render()}).catch(function(e){CH.err=e.message;if(TAB==="chat")render()});app.innerHTML="<div class='caisse'><h3>&#128172; Chat</h3><div class='muted'>"+(CH.err?esc(CH.err):"Chargement…")+"</div></div>";return}
  var h="<div class='caisse'><h3>&#128172; Chat</h3><div class='card'><div class='actions' id='chat-chips'></div>"
    +"<div class='step' style='margin-top:8px'>"+(CH.conv==="equipe"?"Toute l'équipe":"Message privé avec "+esc(CH.conv))+"</div>"
    +"<div id='chat-thread' style='height:52vh;min-height:260px;overflow-y:auto;border:1px solid #e3e3e3;border-radius:10px;padding:8px;background:#fff'></div>"
    +"<div class='dl' style='margin-top:8px;align-items:flex-end'><textarea id='chat-txt' rows='2' style='flex:1' placeholder='Écris ton message… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)'></textarea><button data-act='chatEnvoi'>Envoyer</button></div>"
    +(CH.err?"<div class='muted'>"+esc(CH.err)+"</div>":"")+"</div></div>";
  app.innerHTML=h;chatChips();chatThread(true);chatCharge(true)}
ACTS.chatConv=function(b){CH.conv=b.dataset.c;CH.msgs=null;CH.err="";render()};
ACTS.chatEnvoi=function(){
  var t=document.getElementById("chat-txt"),txt=t?t.value.trim():"";if(!txt||CH.busy)return;CH.busy=true;
  api("/chat/envoyer",{conv:CH.conv,texte:txt}).then(function(){CH.busy=false;if(t)t.value="";CH.err="";return chatCharge(true)}).catch(function(e){CH.busy=false;CH.err=e.message;alert(e.message)})};
document.addEventListener("keydown",function(e){var t=e.target;if(t&&t.id==="chat-txt"&&e.key==="Enter"&&!e.shiftKey){e.preventDefault();ACTS.chatEnvoi()}});
setInterval(function(){if(!TOK&&!PW)return;if(TAB==="chat"&&CH.eq)chatCharge(false);else chatNonLus()},6000);
setTimeout(chatNonLus,1500);
`;
