export const SHELL = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atelier TURN</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,sans-serif;margin:0;background:#f5f5f5;color:#111;font-size:17px}
header{background:#111;color:#fff;padding:12px 16px;font-weight:700;font-size:19px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
header button{width:auto;min-height:0;margin:0;padding:6px 12px;font-size:14px;background:#fff;color:#111}
header #who{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:15px;font-weight:400}
nav{position:sticky;top:0;z-index:10;display:flex;flex-wrap:wrap;gap:6px;background:#fff;border-bottom:1px solid #ddd;padding:8px}
nav button{flex:1 1 120px;margin:0;background:#fff;color:#111;border:1px solid #111;border-radius:10px;font-size:16px;font-weight:600;padding:14px 8px;cursor:pointer}
nav button.on{background:#111;color:#fff}
main{padding:12px;max-width:1400px;margin:0 auto}
input,select,textarea,button{font-size:17px;padding:12px;width:100%;margin:4px 0;border-radius:8px;border:1px solid #ccc}
button{background:#111;color:#fff;border:0;cursor:pointer;min-height:48px}
button.sec{background:#fff;color:#111;border:1px solid #111}
button.danger{background:#fff;color:#b00020;border:1px solid #b00020}
button.link{background:none;color:#111;border:0;text-decoration:underline;min-height:0;width:auto;padding:6px 0}
.card{background:#fff;border:1px solid #ddd;border-radius:10px;padding:12px;margin:10px 0}
.muted{color:#666;font-size:14px}.big{font-size:24px;font-weight:700}
.tag{display:inline-block;background:#eee;border-radius:6px;padding:2px 8px;font-size:13px}
.tag.warn{background:#fff3cd;color:#7a5b00}
.tag.ok{background:#e2f5e3;color:#1d6b24}
.hist{font-size:14px;border-top:1px solid #eee;margin-top:8px;padding-top:8px}
.step{font-weight:700;margin:2px 0 6px}
.grid{display:block}
.cons{border-left:6px solid #111}
.cons .lab{font-weight:700;margin-top:8px}
.cons .txt{white-space:pre-wrap;margin:2px 0 6px}
.chiffres{display:flex;flex-wrap:wrap;gap:8px}
.chiffre{flex:1 1 140px;background:#f5f5f5;border-radius:10px;padding:10px;text-align:center}
.chiffre b{display:block;font-size:30px}
.chiffre span{font-size:13px;color:#555}
.avis{background:#f0f7ff;border:1px solid #b6d4f5;border-radius:10px;padding:10px;margin-top:10px}
.avis .row{display:flex;gap:8px;flex-wrap:wrap}
.avis .row button{flex:1 1 180px}
.search{display:flex;gap:8px;max-width:560px;margin:0 auto}
.search input{flex:1 1 auto;margin:0}
.search button{flex:0 0 auto;width:auto;margin:0;padding:12px 18px}
.profil{display:flex;gap:14px;align-items:center}
.avatar{flex:0 0 64px;height:64px;border-radius:50%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700}
.scoot{border-left:6px solid #111}
.scoot .head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center}
.rep{border-top:1px solid #eee;margin-top:10px;padding-top:10px}
.rep .st{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.actions{display:flex;gap:8px;margin-top:6px}
.actions button{flex:1 1 0;margin:0}
.newbtn{max-width:560px;margin:8px auto}
.mags{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mags button{font-size:22px;min-height:90px}
.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin:8px 0}
.pgrid button{min-height:70px;background:#fff;color:#111;border:1px solid #111}
.login{max-width:560px;margin:20px auto}
.rech{position:relative;flex:1 1 200px;max-width:420px;min-width:0}
.rech input{width:100%;margin:0;padding:8px 12px;font-size:15px;background:#fff;color:#111;border:0;border-radius:8px}
.rpanel{position:absolute;top:calc(100% + 6px);left:0;width:min(420px,calc(100vw - 32px));max-height:70vh;overflow-y:auto;background:#fff;color:#111;border:1px solid #ccc;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:20;padding:6px;font-size:15px;font-weight:400;text-align:left}
.rp-sec{font-size:12px;font-weight:700;text-transform:uppercase;color:#555;padding:6px 8px 2px}
.rp-item{display:block;width:100%;margin:0;padding:8px;min-height:0;background:#fff;color:#111;border:0;border-bottom:1px solid #eee;border-radius:0;text-align:left;font-size:15px;font-weight:400;cursor:pointer}
.rp-static{padding:8px;border-bottom:1px solid #eee}
.rp-muted{color:#666;font-size:13px;padding:2px 8px}
.sub{display:flex;gap:8px;margin:0 0 10px;flex-wrap:wrap}
.sub button{flex:1 1 90px;margin:0;min-height:48px}
.vues{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px}
.vues button{flex:1 1 120px;margin:0;background:#fff;color:#111;border:1px solid #111;font-size:15px;min-height:46px}
.vues button.on{background:#111;color:#fff}
.vues button b{margin-left:6px;background:#eee;color:#111;border-radius:10px;padding:0 8px}
.vues button.on b{background:#fff}
.tk{display:block;width:100%;text-align:left;background:#fff;color:#111;border:1px solid #ddd;border-left:6px solid #111;border-radius:10px;padding:10px 12px;margin:8px 0;min-height:0;cursor:pointer;font-size:16px;font-weight:400}
.tk .l1{display:flex;justify-content:space-between;gap:8px;align-items:center;font-weight:700}
.tk.abs{border-left-color:#d9a400}
.tk.pret{border-left-color:#1d6b24}
.tk.cmd{border-left-color:#2f6fd0}
.fiche{border-left:6px solid #111}
.fiche .head{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}
.fiche .head button{width:auto;margin:0}
.stbtns{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.stbtns button{flex:1 1 110px;margin:0;min-height:42px;font-size:14px;background:#fff;color:#111;border:1px solid #111}
.stbtns button.on{background:#111;color:#fff}
.devis table{width:100%;border-collapse:collapse;font-size:15px}
.devis td,.devis th{padding:6px 4px;border-bottom:1px solid #eee;text-align:left}
.devis td.n,.devis th.n{text-align:right;white-space:nowrap}
.devis .tot{font-weight:700;font-size:18px;text-align:right;margin-top:8px}
.dl{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.dl input,.dl select{margin:4px 0}
.dl .q{flex:0 0 70px;width:70px}.dl .p{flex:0 0 100px;width:100px}.dl .t{flex:0 0 150px;width:150px}.dl .lb{flex:1 1 180px}
.dl button{width:auto;flex:0 0 auto;margin:4px 0}
.panier td input{width:70px;padding:6px;margin:0}
.pay{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:4px 0}
.pay span{flex:0 0 90px}
.pay input{flex:1 1 100px;margin:0}
.fidbox{background:#f1fbf2;border:1px solid #b8e0bb;border-radius:10px;padding:10px;margin:8px 0}
.pctl{margin:0 0 8px}
.prow{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.prow>*{width:auto;margin:0;flex:0 0 auto}
.prow input[type=date]{flex:1 1 170px}
.prow button{min-height:44px}
.pmsg{font-size:14px;color:#666;min-height:20px;margin:4px 0}
.pwrap{max-height:72vh;overflow:auto;background:#fff;border:1px solid #ddd;border-radius:12px}
.pgin{display:flex;width:100%;min-width:max-content}
.ptc{flex:0 0 52px;border-right:1px solid #ddd;background:#fafafa}
.pcol{flex:1 1 110px;min-width:110px;border-right:1px solid #eee}
.pth{position:sticky;top:0;z-index:3;background:#111;color:#fff;height:34px;line-height:34px;text-align:center;font-weight:700;font-size:14px;padding:0 4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.ptc .pth{background:#fafafa;color:#555;font-weight:400;font-size:12px}
.pbody{position:relative;height:968px;background:repeating-linear-gradient(to bottom,#bbb 0,#bbb 1px,transparent 1px,transparent 88px),repeating-linear-gradient(to bottom,#eee 0,#eee 1px,transparent 1px,transparent 22px)}
.ptc .pbody{background:none}
.plab{position:absolute;left:4px;font-size:12px;color:#555}
.pcard{position:absolute;left:3px;right:3px;background:#e8f0fe;border:1px solid #7aa3e0;border-left:5px solid #2f6fd0;border-radius:6px;padding:2px 4px;font-size:12px;line-height:1.25;overflow:hidden;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;z-index:1;color:#111}
.pcard b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pcard .muted{font-size:11px}
.pcard.tc0{background:#e8f0fe;border-color:#7aa3e0;border-left-color:#2f6fd0}
.pcard.tc1{background:#e6f6ea;border-color:#86c696;border-left-color:#1d8a3a}
.pcard.tc2{background:#fff1e0;border-color:#e8b278;border-left-color:#e07b00}
.pcard.tc3{background:#f1e8fb;border-color:#bd9be0;border-left-color:#7b3fc4}
.pcard.tc4{background:#e0f5f5;border-color:#7cc7c8;border-left-color:#0f8b8d}
.pcard.tc5{background:#fde8f1;border-color:#e59ab9;border-left-color:#c2185b}
.pcard.sel{box-shadow:0 0 0 3px #111}
.pth.today{background:#2f6fd0}
.pnow{position:absolute;left:0;right:0;height:0;border-top:2px solid #d00;z-index:2;pointer-events:none}
.tchip{display:inline-block;background:#fff;border:1px solid #ddd;border-radius:6px;padding:2px 8px;font-size:13px}
.pcols{display:flex;flex-direction:column;gap:12px}
.pside{order:2}.pmain{order:1;min-width:0}
.pside.card{margin:0}
@media(min-width:1000px){.pcols{flex-direction:row;align-items:flex-start}.pside{order:0;flex:0 0 250px;position:sticky;top:76px;max-height:calc(100vh - 90px);overflow:auto}.pmain{order:1;flex:1 1 auto}}
.pcard.ovl{border:2px solid #d00;background:#fdecec}
.pcard.abs{border-style:dashed;background:#fff8e1;border-color:#d9a400;border-left-color:#d9a400}
.pcard.drag{z-index:50;box-shadow:0 6px 16px rgba(0,0,0,.3);opacity:.92}
.ucard{position:relative;left:auto;right:auto;display:block;margin:6px 0;padding:8px;font-size:15px;line-height:1.35;background:#fff;border:1px solid #bbb}
.ppanel{border-left:6px solid #111}
.ppanel .head{display:flex;justify-content:space-between;align-items:center;gap:8px}
.ppanel .head button{width:auto;margin:0}
.ppanel .step{margin-top:8px}
.psres{max-height:260px;overflow:auto}
.rp-var{border-top:1px solid #eee;padding:4px 0}.rp-btns{display:flex;gap:6px;margin-top:2px}.rp-btns button{padding:4px 8px;font-size:13px}
.caisse h3{margin:4px 0}
.hrow{display:block;width:100%;text-align:left;margin:4px 0}
.recu{background:#fff;border:1px dashed #888;padding:10px;font-family:monospace;font-size:13px;max-width:320px;margin:8px auto}
.recu .rc{text-align:center}.recu .rm{color:#555;font-size:12px}
.recu .rl{display:flex;justify-content:space-between;gap:8px}.recu .rt{font-weight:700;font-size:15px;border-top:1px solid #000;margin-top:4px;padding-top:4px}
.recu hr{border:0;border-top:1px dashed #999;margin:6px 0}
.avbox{background:#fff8e6;border:1px solid #f0d58a}
.avl{display:block;margin:6px 0}.avl input{width:auto;margin:0 6px 0 0}
.avrow{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;border-top:1px solid #eee;padding:8px 0}
.avform b{display:block;margin-bottom:4px}
.avform{border-top:2px solid #ddd;margin-top:10px;padding-top:8px}
/* ---- Design : carré, sobre, boutons à leur taille ---- */
*{border-radius:0!important}
body{background:#ececec;font-size:16px;letter-spacing:.005em}
header{padding:10px 18px;border-bottom:3px solid #fff200}
header #who button{background:transparent;color:#fff;border:1px solid #fff}
header .gear{font-size:20px;line-height:1;padding:6px 10px;background:transparent;color:#fff;border:1px solid #fff}
header .gear.on{background:#fff200;color:#111;border-color:#fff200}
nav{padding:0 12px;gap:0;background:#fff;border-bottom:1px solid #111}
nav button{flex:0 0 auto;border:0;border-bottom:4px solid transparent;padding:14px 26px;font-size:15px;text-transform:uppercase;letter-spacing:.06em}
nav button.on{background:#fff;color:#111;border-bottom-color:#111}
input,select,textarea{border:1px solid #bbb;background:#fff;padding:11px}
input:focus,select:focus,textarea:focus{outline:2px solid #111;outline-offset:0}
button{width:auto;min-width:0;min-height:42px;padding:10px 20px;font-size:15px;font-weight:600;letter-spacing:.03em}
button:hover{outline:1px solid #111;outline-offset:2px}
button.sec:hover{outline:1px solid #111;outline-offset:2px}
button.link{padding:4px 0}
.card{border:1px solid #cfcfcf;padding:16px;box-shadow:none}
.card .step{text-transform:uppercase;letter-spacing:.06em;font-size:13px}
.actions,.sub,.vues,.stbtns,.prow,.avis .row{gap:8px;flex-wrap:wrap}
.actions button,.sub button,.vues button,.stbtns button,.avis .row button{flex:0 0 auto}
.search{max-width:none;margin:0 0 10px}
.search button,.newbtn button{width:auto}
.newbtn{max-width:none;margin:8px 0}
.tag{border-radius:0}
.chiffre{background:#fff;border:1px solid #cfcfcf}
.tk{border:1px solid #cfcfcf;border-left:6px solid #111}
.mags button{width:100%}
.login button{width:auto;min-width:200px}
.hrow{width:100%;text-align:left}
a.btn{display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 20px;font-weight:600;font-size:15px}
.spacer{flex:1 1 auto}
.pay input{max-width:220px}
.avatar{border-radius:0}
@page{size:80mm auto;margin:3mm}
@media print{body *{visibility:hidden}.printme,.printme *{visibility:visible}.printme{position:absolute;left:0;top:0;width:74mm;max-width:none;border:0;margin:0;padding:0;font-size:12px}}
.qr svg{width:38mm;height:38mm;display:block;margin:6px auto}
@media(min-width:1000px){.dtop{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start}.dtop .cons{margin:0}}
@media(min-width:1000px){.dash{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start}.dright{position:sticky;top:8px;max-height:calc(100vh - 16px);overflow-y:auto}}
@media(min-width:800px){.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}.grid .card{margin:10px 0}}
.presta{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:6px 0}.presta button{text-align:left}
.tache{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #e3e3e3}.tache.top{border-left:4px solid #111;padding-left:8px;background:#fafafa}.tache.fait .tx{text-decoration:line-through;color:#888}.tache .tx{flex:1}.tache .tbtn{white-space:nowrap}.chk{min-height:26px;width:26px;min-width:26px;padding:0;background:#fff;color:#111;border:2px solid #111;font-size:15px}.rec-ok{border-left:4px solid #1a7f37;padding:8px 12px;background:#f0faf2}.rec-ko{border-left:4px solid #b42318;padding:8px 12px;background:#fdf1f0}
.ttabs{display:flex;gap:0}.ttabs button{min-height:36px}
</style></head><body><header><span>Atelier TURN</span><div id="rech" class="rech" style="display:none"><input id="rq" type="search" placeholder="Chercher : n° PC, client, modèle, produit..." autocomplete="off"><div id="rpanel" class="rpanel" style="display:none"></div></div><span id="who"></span></header><nav id="nav"></nav><main id="app">Chargement…</main>
<script>`;
