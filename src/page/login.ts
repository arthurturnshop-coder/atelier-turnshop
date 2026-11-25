export const LOGIN = `function vLogin(){
  var l=LG,h="<div class='card login'>";
  if(l.step==="mag"){
    h+="<div class='step'>Quel magasin ?</div><div class='mags'><button data-act='chooseMag' data-mag='Amiens'>Amiens</button><button data-act='chooseMag' data-mag='Rouen'>Rouen</button></div>";
  }else if(l.step==="prof"){
    h+="<div class='step'>Qui es-tu ? · "+esc(l.magasin)+"</div>";
    if(!l.profils)h+="<div class='muted'>Chargement…</div>";
    else h+="<div class='pgrid'>"+l.profils.map(function(p){return"<button class='sec' data-act='choosePrenom' data-prenom='"+esc(p.prenom)+"'>"+esc(p.prenom)+"<br><span class='muted'>"+esc(p.role)+"</span></button>"}).join("")+"</div>";
    h+="<button class='sec' data-act='loginBack'>Retour</button><div style='text-align:center;margin-top:10px'><button class='link' data-act='secoursOpen'>Accès de secours</button></div>";
  }else if(l.step==="mdp"){
    h+="<div class='step'>"+esc(l.prenom)+" · "+esc(l.magasin)+"</div>";
    if(l.aDefini===false)h+="<div class='muted'>Premier accès : choisis ton mot de passe (6 caractères minimum).</div><input id='pw' type='password' placeholder='Nouveau mot de passe' autocomplete='new-password'><input id='pw2' type='password' placeholder='Confirme le mot de passe' autocomplete='new-password'>";
    else h+="<input id='pw' type='password' placeholder='Mot de passe' autocomplete='current-password'>";
    h+="<button data-act='connect'>Entrer</button><button class='sec' data-act='loginBackProf'>Retour</button>";
  }else if(l.step==="secours"){
    h+="<div class='step'>Accès de secours · "+esc(l.magasin)+"</div><input id='ps' type='password' placeholder='Mot de passe équipe' autocomplete='current-password'><button data-act='secoursConnect'>Entrer</button><button class='sec' data-act='loginBackProf'>Retour</button>";
  }
  h+="<div class='muted'>"+esc(MSG)+"</div></div>";
  app.innerHTML=h;nav.innerHTML=""}
async function loadProfils(mag){
  LG={step:"prof",magasin:mag,profils:null};MSG="";render();
  try{
    var r=await fetch("/auth/profils?magasin="+encodeURIComponent(mag));var d=await r.json().catch(function(){return{}});
    if(!r.ok)throw new Error(d.error||"Chargement impossible.");
    if(LG.step==="prof"&&LG.magasin===mag){LG.profils=d;render()}
  }catch(e){MSG=e.message;render()}}
function choosePrenom(b){
  var p=(LG.profils||[]).filter(function(x){return x.prenom===b.dataset.prenom})[0];if(!p)return;
  LG={step:"mdp",magasin:LG.magasin,prenom:p.prenom,role:p.role,aDefini:p.aDefini};MSG="";render()}
async function connect(){
  var l=LG,pw=document.getElementById("pw").value,pw2=document.getElementById("pw2");
  if(l.aDefini===false){
    if(pw.length<6){MSG="Le mot de passe doit faire au moins 6 caractères.";render();return}
    if(pw!==pw2.value){MSG="Les deux mots de passe ne correspondent pas.";render();return}
  }
  MSG="";
  try{
    var r=await fetch("/auth/connexion",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prenom:l.prenom,magasin:l.magasin,motdepasse:pw})});
    var d=await r.json().catch(function(){return{}});
    if(!r.ok)throw new Error(d.error||"Connexion impossible.");
    TOK=d.token;PRENOM=d.prenom;ROLE=d.role;MAG=d.magasin;PW="";LG={step:"mag"};saveSession();setActeur({code:"",prenom:d.prenom,role:d.role});render()
  }catch(e){MSG=e.message;render()}}
async function secoursConnect(){
  var p=document.getElementById("ps").value;MSG="";
  try{
    var r=await fetch("/api/consignes",{headers:{"x-atelier-password":p}});
    if(!r.ok)throw new Error(r.status===401?"Mot de passe incorrect.":"Erreur, réessayer.");
    TOK="";PW=p;PRENOM="Secours";ROLE="admin";MAG="";LG={step:"mag"};saveSession();setActeur({code:"",prenom:"Secours",role:"admin"});render()
  }catch(e){MSG=e.message;render()}}
async function logout(){
  if(TOK){try{await fetch("/auth/deconnexion",{method:"POST",headers:{"x-atelier-token":TOK}})}catch(e){}}
  clearSession();LG={step:"mag"};MSG="";render()}
`;
