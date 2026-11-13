import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const QRCode = require("../apps/web/node_modules/qrcode");
const OUT = "C:/Users/edyme/AppData/Local/Temp/claude/146e4e8c19d63a6e/4efeaf2f-9b2d-4f1f-8cff-cc09edfbe85b/scratchpad";
const TOKEN = "VTX1.jCrN_4CENTI5fsxI_YeQhA";

// 1) QR real grande para escanear desde pantalla
await QRCode.toFile(`${OUT}/qr-prueba-xma.png`, TOKEN, { width: 600, margin: 2, errorCorrectionLevel: "M" });
console.log("✓ QR real:", `${OUT}/qr-prueba-xma.png`);

// 2) Ejemplo visual del escáner al marcar ENTRADA (mockup con el gafete dentro)
const qrChico = await QRCode.toDataURL(TOKEN, { width: 300, margin: 1 });
let puppeteer;
try { puppeteer = require("C:/Users/edyme/AppData/Local/Temp/pptr/node_modules/puppeteer-core"); } catch { puppeteer = null; }
if (!puppeteer) { console.log("(sin puppeteer: solo el QR)"); process.exit(0); }

const html = `<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',system-ui,sans-serif}
body{background:#050B18;padding:16px;width:430px}
</style>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
  <div style="border:2px solid #34d399;background:rgba(16,185,129,.25);border-radius:12px;padding:16px;text-align:center;color:#d1fae5;font-weight:800;font-size:17px;letter-spacing:.04em">⬇ TOMAR ENTRADA</div>
  <div style="border:2px solid rgba(255,255,255,.1);background:#0D1A30;border-radius:12px;padding:16px;text-align:center;color:#6B8AB5;font-weight:800;font-size:17px;letter-spacing:.04em">⬆ TOMAR SALIDA</div>
</div>
<div style="position:relative;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.12);height:360px;background:radial-gradient(circle at 55% 35%,#2a3a52,#141f30 70%)">
  <div style="position:absolute;top:12px;left:12px;background:rgba(16,185,129,.2);color:#a7f3d0;border:1px solid rgba(52,211,153,.4);border-radius:999px;padding:5px 11px;font-size:11px;font-weight:700">📍 Ubicación activa ±12 m</div>
  <div style="position:absolute;top:12px;right:12px;background:rgba(16,185,129,.92);color:#000;font-family:monospace;font-weight:800;border-radius:999px;padding:6px 16px;font-size:20px">✓ 23</div>
  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
    <div style="width:210px;height:210px;border:4px solid rgba(52,211,153,.75);border-radius:18px;box-shadow:0 0 0 9999px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;background:#fff">
      <img src="${qrChico}" style="width:168px;height:168px">
    </div>
  </div>
  <div style="position:absolute;left:8px;right:8px;bottom:8px">
    <div style="background:rgba(16,185,129,.95);border-radius:14px;padding:14px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.4)">
      <div style="color:#042f1a;font-weight:900;font-size:26px;line-height:1.1">⬇ ENTRADA REGISTRADA</div>
      <div style="color:#063a21;font-weight:700;font-size:15px;margin-top:3px">#PRUEBA-QR · PRUEBA QR</div>
      <div style="color:#063a21;font-weight:800;font-size:14px;margin-top:2px">Entrada 10:15</div>
    </div>
  </div>
</div>
<p style="color:#6B8AB5;font-size:11px;margin-top:10px;text-align:center">Al escanear suena un “ding-ding”, vibra y la foto se guarda en silencio.</p>`;

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
const p = await browser.newPage();
await p.setViewport({ width: 462, height: 520, deviceScaleFactor: 2 });
await p.setContent(html, { waitUntil: "load" });
await new Promise((r) => setTimeout(r, 300));
await p.screenshot({ path: `${OUT}/ejemplo-escaner-entrada.png`, fullPage: true });
await browser.close();
console.log("✓ Mockup:", `${OUT}/ejemplo-escaner-entrada.png`);
