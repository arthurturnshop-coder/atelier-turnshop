// FS Impression : petit programme local qui imprime les tickets sans fenetre d'impression.
// Il ecoute sur 127.0.0.1:9101, recoit le ticket depuis FS by TURN Shop et l'imprime
// sur l'imprimante par defaut de Windows via un navigateur lance en impression silencieuse.
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.FS_PRINT_PORT || 9101);
const VERSION = "1.0";
const jobs = new Map<string, { page: string; proc?: ReturnType<typeof spawn>; timer?: any }>();

const CHEMINS = [
  process.env["ProgramFiles(x86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
  process.env["ProgramFiles"] + "\\Google\\Chrome\\Application\\chrome.exe",
  process.env["LocalAppData"] + "\\Google\\Chrome\\Application\\chrome.exe",
  process.env["ProgramFiles(x86)"] + "\\Microsoft\\Edge\\Application\\msedge.exe",
  process.env["ProgramFiles"] + "\\Microsoft\\Edge\\Application\\msedge.exe",
  process.env["FS_PRINT_BROWSER"] || "",
  "/usr/bin/google-chrome",
];
function navigateur(): string | null {
  for (const c of CHEMINS) if (c && !c.startsWith("undefined") && existsSync(c)) return c;
  return null;
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-allow-private-network": "true",
  "access-control-max-age": "600",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

function esc(s: string) {
  return s.replace(/<\/script/gi, "<\\/script");
}

function pageTicket(id: string, d: { html: string; css?: string; cls?: string; styles?: string }) {
  // Chrome ne gere pas "size:80mm auto" : on mesure le ticket et on fixe la hauteur exacte de la page,
  // ce qui fait que le papier est coupe juste apres le ticket.
  const script =
    "window.addEventListener('load',function(){setTimeout(function(){" +
    "try{var z=document.getElementById('impzone');var h=Math.ceil(z.getBoundingClientRect().height*25.4/96)+3;" +
    "var st=document.createElement('style');st.textContent='@page{size:80mm '+h+'mm;margin:0}html,body{margin:0;padding:0}';document.head.appendChild(st)}catch(e){}" +
    "setTimeout(function(){try{window.print()}catch(e){}" +
    "setTimeout(function(){fetch('/done/" + id + "').catch(function(){});setTimeout(function(){window.close()},300)},2000)},200)},400)})";
  return (
    "<!doctype html><html><head><meta charset='utf-8'><title>Ticket</title><style>" +
    esc(d.styles || "") + esc(d.css || "") +
    "#impzone{display:block!important;position:static!important;width:80mm;box-sizing:border-box;padding:0 3mm;margin:0;font-size:12px}html,body{margin:0;padding:0}" +
    "</style></head><body><div id='impzone' class='" + (d.cls || "").replace(/[^\w -]/g, "") + "'>" + d.html + "</div>" +
    "<script>" + script + "</script></body></html>"
  );
}

function fin(id: string) {
  const j = jobs.get(id);
  if (!j) return;
  clearTimeout(j.timer);
  try { j.proc?.kill(); } catch {}
  if (process.platform === "win32" && j.proc?.pid) {
    try { spawn("taskkill", ["/pid", String(j.proc.pid), "/t", "/f"], { stdio: "ignore" }); } catch {}
  }
  setTimeout(() => {
    jobs.delete(id);
    try { rmSync(join(tmpdir(), "fsprint-" + id), { recursive: true, force: true }); } catch {}
  }, 3000);
}

function lancer(id: string): string | null {
  const nav = navigateur();
  if (!nav) return "Aucun navigateur trouve (Chrome ou Edge)";
  const profil = join(tmpdir(), "fsprint-" + id);
  mkdirSync(profil, { recursive: true });
  const args = [
    "--kiosk-printing", "--user-data-dir=" + profil, "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-sync", "--window-size=320,240", "--window-position=-3000,-3000",
    "--app=http://127.0.0.1:" + PORT + "/job/" + id,
  ];
  if (process.env.FS_PRINT_DRY) return null;
  const proc = spawn(nav, args, { stdio: "ignore", detached: false });
  proc.on("error", () => {});
  const j = jobs.get(id)!;
  j.proc = proc;
  j.timer = setTimeout(() => fin(id), 25000);
  return null;
}

Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/ping") return json({ ok: true, version: VERSION, navigateur: !!navigateur() });
    if (url.pathname === "/print" && req.method === "POST") {
      let d: any;
      try { d = await req.json(); } catch { return json({ ok: false, error: "json invalide" }, 400); }
      if (!d || typeof d.html !== "string" || !d.html) return json({ ok: false, error: "ticket vide" }, 400);
      const id = crypto.randomUUID().slice(0, 8);
      jobs.set(id, { page: pageTicket(id, d) });
      const err = lancer(id);
      if (err) { jobs.delete(id); return json({ ok: false, error: err }, 500); }
      return json({ ok: true, id });
    }
    let m = url.pathname.match(/^\/job\/(\w+)$/);
    if (m) {
      const j = jobs.get(m[1]);
      if (!j) return new Response("introuvable", { status: 404 });
      return new Response(j.page, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    m = url.pathname.match(/^\/done\/(\w+)$/);
    if (m) { fin(m[1]); return json({ ok: true }); }
    return new Response("FS Impression " + VERSION, { headers: CORS });
  },
});
console.log("FS Impression " + VERSION + " : en ecoute sur 127.0.0.1:" + PORT);
