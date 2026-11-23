// FS Impression : petit programme local qui imprime les tickets sans fenetre d'impression.
// Il ecoute sur 127.0.0.1:9101, recoit le ticket depuis FS by TURN Shop et l'imprime
// sur l'imprimante par defaut de Windows via un navigateur lance en impression silencieuse.
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, readFileSync } from "node:fs";
import { PNG } from "pngjs";

const PORT = Number(process.env.FS_PRINT_PORT || 9101);
const VERSION = "2.1";
const LOGS: string[] = [];
function log(m: string) { LOGS.push(new Date().toLocaleTimeString("fr-FR") + " " + m); if (LOGS.length > 60) LOGS.shift(); console.log(m); }
const jobs = new Map<string, { page: string; proc?: ReturnType<typeof spawn>; timer?: any; data?: any }>();

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

function pageTicket(id: string, d: { html: string; css?: string; cls?: string; styles?: string }, raster = false) {
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
    (raster
      ? "#impzone{display:block!important;position:static!important;width:72mm;box-sizing:border-box;padding:0 1mm;margin:0;font-size:12px;background:#fff}html,body{margin:0;padding:0;background:#fff!important;color:#000}"
      : "#impzone{display:block!important;position:static!important;width:80mm;box-sizing:border-box;padding:0 3mm;margin:0;font-size:12px}html,body{margin:0;padding:0}") +
    "</style></head><body><div id='impzone' class='" + (d.cls || "").replace(/[^\w -]/g, "") + "'>" + d.html + "</div>" +
    (raster ? "" : "<script>" + script + "</script>") + "</body></html>"
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


// ---------- Impression directe : capture du ticket en image puis envoi ESC/POS brut ----------
const DOTS = 576; // 80 mm, zone imprimable 72 mm a 203 dpi
let file: Promise<void> = Promise.resolve();

const PS = `param([string]$Printer,[string]$File)
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class RawPrn {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DOCINFOW { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
 [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
 [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, IntPtr p, int c, out int w);
 public static bool Send(string printer, byte[] data){
  IntPtr h; if(!OpenPrinter(printer, out h, IntPtr.Zero)) return false;
  DOCINFOW di = new DOCINFOW(); di.pDocName = "FS Ticket"; di.pDataType = "RAW";
  bool ok = false;
  if(StartDocPrinter(h, 1, di)){
   if(StartPagePrinter(h)){
    IntPtr p = Marshal.AllocCoTaskMem(data.Length); Marshal.Copy(data, 0, p, data.Length);
    int w; ok = WritePrinter(h, p, data.Length, out w); Marshal.FreeCoTaskMem(p); EndPagePrinter(h);
   }
   EndDocPrinter(h);
  }
  ClosePrinter(h); return ok;
 }
}
'@
if([string]::IsNullOrEmpty($Printer)){ $Printer = (Get-CimInstance Win32_Printer | Where-Object { $_.Default }).Name }
$bytes = [System.IO.File]::ReadAllBytes($File)
if([RawPrn]::Send($Printer, $bytes)){ Write-Output "OK" } else { Write-Output "FAIL"; exit 1 }
`;

function run(cmd: string, args: string[], ms: number): Promise<number> {
  return new Promise((res) => {
    const p = spawn(cmd, args, { stdio: "ignore" });
    const t = setTimeout(() => { try { p.kill(); } catch {} res(-1); }, ms);
    p.on("error", () => { clearTimeout(t); res(-2); });
    p.on("exit", (c) => { clearTimeout(t); res(c ?? -3); });
  });
}

// PNG (576 px de large) -> octets ESC/POS (image raster + coupe)
export function escposDepuisPng(buf: Buffer): Buffer {
  const png = PNG.sync.read(buf);
  const w = png.width, h = png.height;
  const noir = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const a = png.data[i + 3] / 255;
    const g = (0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2]) * a + 255 * (1 - a);
    return g < 170;
  };
  const blancLigne = (y: number) => { for (let x = 0; x < w; x++) if (noir(x, y)) return false; return true; };
  let top = 0, bot = h - 1;
  while (top < h && blancLigne(top)) top++;
  while (bot > top && blancLigne(bot)) bot--;
  top = Math.max(0, top - 6); bot = Math.min(h - 1, bot + 10);
  const hh = bot - top + 1;
  const bw = Math.ceil(DOTS / 8);
  const out: number[] = [0x1b, 0x40];
  for (let y0 = 0; y0 < hh; y0 += 128) {
    const n = Math.min(128, hh - y0);
    out.push(0x1d, 0x76, 0x30, 0x00, bw & 255, bw >> 8, n & 255, n >> 8);
    for (let y = 0; y < n; y++) {
      for (let bx = 0; bx < bw; bx++) {
        let b = 0;
        for (let k = 0; k < 8; k++) {
          const x = bx * 8 + k;
          if (x < w && noir(x, top + y0 + y)) b |= 0x80 >> k;
        }
        out.push(b);
      }
    }
  }
  out.push(0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00); // avance puis coupe
  return Buffer.from(out);
}

async function imprimer(id: string) {
  const dir = join(tmpdir(), "fsprint-" + id);
  mkdirSync(dir, { recursive: true });
  try {
    const nav = navigateur()!;
    const png = join(dir, "t.png");
    const scale = DOTS / 272;
    await run(nav, [
      "--headless=new", "--disable-gpu", ...(process.platform === "win32" ? [] : ["--no-sandbox"]), "--hide-scrollbars", "--no-first-run", "--user-data-dir=" + join(dir, "p"),
      "--screenshot=" + png, "--window-size=272,5000", "--force-device-scale-factor=" + scale,
      "--virtual-time-budget=2000", "http://127.0.0.1:" + PORT + "/job/" + id + "?raster=1",
    ], 20000);
    if (!existsSync(png)) throw new Error("capture impossible");
    let bin = escposDepuisPng(readFileSync(png));
    const bf = join(dir, "t.bin"); writeFileSync(bf, bin);
    log("capture ok, octets=" + bin.length);
    if (process.env.FS_PRINT_DRY) return;
    const ps = join(dir, "p.ps1"); writeFileSync(ps, "\ufeff" + PS);
    const code = await run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps, "-Printer", process.env.FS_PRINT_PRINTER || "", "-File", bf], 30000);
    log("powershell code " + code);
    if (code !== 0) throw new Error("envoi imprimante impossible (" + code + ")");
  } catch (e) {
    log("ECHEC envoi direct, repli Chrome (page A4) : " + e);
    lancer(id);
    await new Promise((r) => setTimeout(r, 4000));
    return;
  }
  setTimeout(() => { jobs.delete(id); try { rmSync(dir, { recursive: true, force: true }); } catch {} }, 5000);
}

Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/log") return new Response(LOGS.join("\n") || "(vide)", { headers: { ...CORS, "content-type": "text/plain; charset=utf-8" } });
    if (url.pathname === "/ping") return json({ ok: true, version: VERSION, navigateur: !!navigateur() });
    if (url.pathname === "/print" && req.method === "POST") {
      let d: any;
      try { d = await req.json(); } catch { return json({ ok: false, error: "json invalide" }, 400); }
      if (!d || typeof d.html !== "string" || !d.html) return json({ ok: false, error: "ticket vide" }, 400);
      const id = crypto.randomUUID().slice(0, 8);
      jobs.set(id, { page: pageTicket(id, d), data: d });
      if (!navigateur()) { jobs.delete(id); return json({ ok: false, error: "Aucun navigateur trouve (Chrome ou Edge)" }, 500); }
      file = file.then(() => imprimer(id)).catch(() => {});
      return json({ ok: true, id });
    }
    let m = url.pathname.match(/^\/job\/(\w+)$/);
    if (m) {
      const j = jobs.get(m[1]);
      if (!j) return new Response("introuvable", { status: 404 });
      return new Response(url.searchParams.get("raster") ? pageTicket(m[1], j.data, true) : j.page, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    m = url.pathname.match(/^\/done\/(\w+)$/);
    if (m) { fin(m[1]); return json({ ok: true }); }
    return new Response("FS Impression " + VERSION, { headers: CORS });
  },
});
console.log("FS Impression " + VERSION + " : en ecoute sur 127.0.0.1:" + PORT);
