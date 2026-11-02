import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const QRCode = require("../apps/web/node_modules/qrcode");
const puppeteer = require("C:/Users/edyme/AppData/Local/Temp/pptr/node_modules/puppeteer-core");
const OUT = "C:/Users/edyme/AppData/Local/Temp/claude/C--Users-edyme/4efeaf2f-9b2d-4f1f-8cff-cc09edfbe85b/scratchpad";

const trabajadores = [
  ["466", "ALEJANDRO RODRIGUEZ CARLOS JAVIER", "MATUTINO"],
  ["467", "ALEJO NOTARIO IRENE", "MATUTINO"],
  ["468", "ALVAREZ SANCHEZ LILIA MARIA", "MATUTINO"],
  ["526", "ACOSTA ORTIZ VIRGINIA JESUS", "VESPERTINO"],
  ["527", "ARROYO TUN JHOANA RUBI", "VESPERTINO"],
  ["585", "AVALOS CHAN JOSE GUALBERTO DE JESUS", "EVENTUAL"],
];
const qrs = [];
for (const t of trabajadores) qrs.push(await QRCode.toDataURL("VTX1.ejemplo_" + t[0] + "_demo", { width: 220, margin: 1 }));
const qrGrande = await QRCode.toDataURL("VTX1.ejemplo_466_demo", { width: 300, margin: 1 });

const base = `<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',system-ui,sans-serif}
body{background:#0A1428;color:#E8F0FF;padding:28px}
.serif{font-family:Georgia,serif;font-style:italic}
.grad{background:linear-gradient(90deg,#60A5FA,#67E8F9);-webkit-background-clip:text;background-clip:text;color:transparent}
.muted{color:#6B8AB5}.card{background:#0D1A30;border:1px solid rgba(255,255,255,.08);border-radius:14px}
.pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.08em}
.badge{display:inline-block;padding:3px 10px;border-radius:6px;border:1px solid rgba(139,92,246,.4);background:rgba(139,92,246,.15);color:#C4B5FD;font-size:10px;font-weight:800;letter-spacing:.1em}
</style>`;

// FOTO 1: Credenciales QR
const cards = trabajadores.map((t, i) => `
  <div style="background:#fff;color:#000;border-radius:14px;padding:14px;text-align:center;border:1.5px solid rgba(255,255,255,.2)">
    <div style="font-size:9px;font-weight:800;letter-spacing:.2em;color:#777">VORTEX &middot; MHS</div>
    <img src="${qrs[i]}" style="width:132px;height:132px;margin:6px 0">
    <div style="font-size:11px;font-weight:800;line-height:1.2">${t[1]}</div>
    <div style="font-family:monospace;font-size:11px;color:#444;margin-top:2px">#${t[0]}</div>
    <div style="font-size:9px;font-weight:700;color:#888;margin-top:2px">XMK &middot; ${t[2]}</div>
  </div>`).join("");
writeFileSync(`${OUT}/f1.html`, `${base}
<div class="badge">ASISTENCIA POR QR &middot; ADMIN+</div>
<h1 style="font-size:34px;margin:10px 0 4px">Credenciales <span class="serif grad">QR</span></h1>
<p class="muted" style="font-size:13px;max-width:640px">Designa la sede, genera las credenciales de sus trabajadores (separadas por turno) e impr&iacute;melas.</p>
<div class="card" style="padding:18px;margin:18px 0">
  <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
    <div style="flex:1;min-width:300px"><div class="muted" style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:5px">Sede designada para asistencia por QR</div>
    <div style="background:#0A1428;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:10px 12px;font-size:14px">XMK &middot; Xmatkuil (138 activos) &middot; QR ya habilitado &#9662;</div></div>
    <div style="background:#3B82F6;border-radius:8px;padding:11px 18px;font-weight:700;font-size:13px">Generar credenciales</div>
  </div>
  <div style="color:#6EE7B7;font-size:12px;margin-top:10px">&check; Sede XMK designada &middot; 138 credenciales</div>
  <div style="display:flex;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06);align-items:center;flex-wrap:wrap">
    <span class="pill" style="border:1px solid rgba(96,165,250,.6);background:rgba(59,130,246,.2);color:#BFDBFE">Todas (138)</span>
    <span class="pill" style="border:1px solid rgba(255,255,255,.12);color:#6B8AB5">MATUTINO (60)</span>
    <span class="pill" style="border:1px solid rgba(255,255,255,.12);color:#6B8AB5">VESPERTINO (59)</span>
    <span class="pill" style="border:1px solid rgba(255,255,255,.12);color:#6B8AB5">EVENTUAL (19)</span>
    <span style="margin-left:auto;background:rgba(16,185,129,.85);color:#fff;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:800">&#128424; Imprimir 138 credencial(es)</span>
  </div>
</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:760px">${cards}</div>`);

// FOTO 2: Escaner (movil)
writeFileSync(`${OUT}/f2.html`, `${base}
<body style="padding:18px;max-width:420px">
<h1 style="font-size:26px;margin:2px 0 2px">Esc&aacute;ner <span class="serif grad">QR</span></h1>
<p class="muted" style="font-size:11px">Escanea la credencial del trabajador y su asistencia de hoy queda marcada (A) al instante.</p>
<div style="position:relative;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.12);margin-top:12px;height:360px;background:radial-gradient(circle at 60% 30%, #2a3a52 0%, #16202f 60%, #0b1220 100%)">
  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
    <div style="width:208px;height:208px;border:4px solid rgba(52,211,153,.75);border-radius:18px;box-shadow:0 0 0 999px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;background:#fff">
      <img src="${qrGrande}" style="width:170px;height:170px">
    </div>
  </div>
  <div style="position:absolute;top:12px;right:12px;background:rgba(16,185,129,.92);color:#000;font-family:monospace;font-weight:800;border-radius:999px;padding:5px 13px;font-size:14px">&check; 37</div>
</div>
<div style="border:1px solid rgba(52,211,153,.55);background:rgba(16,185,129,.13);border-radius:14px;padding:14px;margin-top:12px">
  <div style="color:#6EE7B7;font-weight:800;font-size:15px">&check; Asistencia registrada</div>
  <div style="font-size:13px;margin-top:4px">#466 &middot; ALEJANDRO RODRIGUEZ CARLOS JAVIER</div>
  <div class="muted" style="font-size:11px;margin-top:2px">XMK &middot; MATUTINO &middot; c&oacute;digo <b style="color:#86EFAC;font-family:monospace">A</b></div>
</div>
<div style="margin-top:10px">
  <div class="muted" style="font-size:10px;text-transform:uppercase;letter-spacing:.12em;margin-bottom:6px">&#9679; Escaneados ahora (3)</div>
  <div class="card" style="padding:7px 10px;font-size:11px;margin-bottom:5px">&#9989; #467 ALEJO NOTARIO IRENE <span class="muted" style="float:right;font-family:monospace">06:58</span></div>
  <div class="card" style="padding:7px 10px;font-size:11px;margin-bottom:5px">&#9888;&#65039; #468 ALVAREZ SANCHEZ LILIA — ya estaba marcado <span class="muted" style="float:right;font-family:monospace">06:57</span></div>
  <div class="card" style="padding:7px 10px;font-size:11px">&#9989; #470 CANTO PEREZ MAYTE DE JESUS <span class="muted" style="float:right;font-family:monospace">06:55</span></div>
</div></body>`);

// FOTO 3: Reporte semanal
writeFileSync(`${OUT}/f3.html`, `${base}
<div style="max-width:720px">
<h1 style="font-size:30px;margin:0 0 4px">Reportes <span class="serif grad">PDF</span></h1>
<div class="card" style="padding:20px;margin-top:14px">
  <div style="display:flex;gap:12px;align-items:start">
    <div style="width:44px;height:44px;border-radius:12px;border:1px solid rgba(59,130,246,.3);background:rgba(59,130,246,.12);display:flex;align-items:center;justify-content:center;font-size:20px">&#128203;</div>
    <div><div style="font-size:17px;font-weight:700">Matriz de asistencias</div>
    <div class="muted" style="font-size:12px">Tabla diaria con los c&oacute;digos capturados por empleado. Para la semana de pagos de Xmatkuil.</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:16px">
    <div><div class="muted" style="font-size:10px;text-transform:uppercase;margin-bottom:5px">Sede</div>
    <div style="background:#0A1428;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:9px 12px;font-size:13px">XMK &middot; Xmatkuil &#9662;</div></div>
    <div><div class="muted" style="font-size:10px;text-transform:uppercase;margin-bottom:5px">Tipo de rango</div>
    <div style="background:#0A1428;border:1px solid rgba(96,165,250,.5);border-radius:8px;padding:9px 12px;font-size:13px;color:#BFDBFE">Semana (pagos) &middot; lunes a domingo &#9662;</div></div>
    <div><div class="muted" style="font-size:10px;text-transform:uppercase;margin-bottom:5px">Cualquier d&iacute;a de la semana a pagar</div>
    <div style="background:#0A1428;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:9px 12px;font-size:13px">02/11/2026 &#128197;</div>
    <div style="margin-top:6px;display:flex;gap:6px;align-items:center">
      <span style="border:1px solid rgba(255,255,255,.15);border-radius:5px;padding:2px 8px;font-size:9px" class="muted">Esta semana</span>
      <span style="border:1px solid rgba(255,255,255,.15);border-radius:5px;padding:2px 8px;font-size:9px" class="muted">Semana pasada</span>
      <span style="font-family:monospace;font-size:10px;color:#6EE7B7">2026-10-26 &rarr; 2026-11-01</span>
    </div></div>
  </div>
  <div style="display:flex;gap:12px;margin-top:18px">
    <div style="background:#3B82F6;border-radius:8px;padding:10px 18px;font-weight:700;font-size:13px">&#128203; Descargar PDF</div>
    <div style="border:1px solid rgba(16,185,129,.5);color:#6EE7B7;border-radius:8px;padding:10px 18px;font-weight:700;font-size:13px">&#128202; Descargar Excel</div>
  </div>
</div></div>`);

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
const shots = [["f1", 1100, "vortex-credenciales"], ["f2", 430, "vortex-escaner"], ["f3", 780, "vortex-reporte-semanal"]];
for (const [n, w, out] of shots) {
  const p = await browser.newPage();
  await p.setViewport({ width: w, height: 600, deviceScaleFactor: 2 });
  await p.goto("file:///" + OUT + "/" + n + ".html");
  await new Promise((r) => setTimeout(r, 400));
  await p.screenshot({ path: `${OUT}/${out}.png`, fullPage: true });
  await p.close();
}
await browser.close();
console.log("3 capturas listas");
