// Prueba de impresión de credenciales: replica el markup + print CSS del
// QRAdminClient y genera un PDF carta para verificar que nada se corta.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const QRCode = require("../apps/web/node_modules/qrcode");
const puppeteer = require("C:/Users/edyme/AppData/Local/Temp/pptr/node_modules/puppeteer-core");
const OUT = "C:/Users/edyme/AppData/Local/Temp/claude/C--Users-edyme/4efeaf2f-9b2d-4f1f-8cff-cc09edfbe85b/scratchpad";

const qr = await QRCode.toDataURL("VTX1.ejemplo_demo_no_valido", { width: 220, margin: 1 });
const nombres = [
  "ALEJANDRO RODRIGUEZ CARLOS JAVIER", "ALEJO NOTARIO IRENE", "ALVAREZ SANCHEZ LILIA MARIA",
  "ACOSTA ORTIZ VIRGINIA JESUS", "ARROYO TUN JHOANA RUBI", "AVALOS CHAN JOSE GUALBERTO DE JESUS",
  "BALAM COUOH MARIA FERNANDA", "CANCHE POOL JOSE EDUARDO", "CANTO PEREZ MAYTE DE JESUS",
  "CHAN DZUL ROSA ISELA", "COUOH UC MARTIN ALEJANDRO", "DZIB CHALE WENDY NOEMI",
];
function card(n, i, j) {
  return `<div class="credencial">
    <p class="cred-marca">VORTEX &middot; MHS</p>
    <img src="${qr}">
    <p class="cred-nombre">${n}</p>
    <p class="cred-numero">#${466 + i}</p>
    <p class="cred-sede">XMK &middot; ${j}</p>
  </div>`;
}
function grupo(j, cuantas) {
  const cards = Array.from({ length: cuantas }, (_, i) => card(nombres[i % nombres.length], i, j)).join("");
  return `<div class="grupo-credenciales"><p class="grupo-titulo">XMK &middot; ${j} &middot; ${cuantas} credencial(es)</p><div class="grid-credenciales">${cards}</div></div>`;
}

// Mismo CSS de impresión que QRAdminClient (sin el truco de visibility,
// que aquí no aplica porque la página solo tiene la hoja)
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; font-family: system-ui, sans-serif; }
  .credencial { text-align: center; background: #fff; color: #000; }
  .credencial p { line-height: 1.25; }
  .cred-nombre { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
  .cred-numero { font-family: monospace; color: #444; }
  .cred-marca, .cred-sede { color: #777; font-weight: 700; letter-spacing: .12em; }
  @page { size: letter portrait; margin: 7mm; }
  .grupo-credenciales + .grupo-credenciales { break-before: page; page-break-before: always; }
  .grupo-titulo { color: #000; margin: 0 0 2mm 0; font-size: 9pt; font-weight: 700; letter-spacing: .1em; }
  .grid-credenciales { display: block; }
  .credencial {
    display: inline-flex; vertical-align: top; flex-direction: column;
    align-items: center; justify-content: center;
    width: 63mm; height: 82mm; margin: 0 2.5mm 3mm 0; padding: 3mm;
    border: 1.2px solid #000; border-radius: 3mm;
    break-inside: avoid; page-break-inside: avoid; overflow: hidden;
  }
  .credencial img { width: 44mm; height: 44mm; margin: 1.5mm 0; }
  .cred-marca { font-size: 7pt; } .cred-nombre { font-size: 8.5pt; max-width: 56mm; }
  .cred-numero { font-size: 9pt; } .cred-sede { font-size: 7.5pt; }
</style></head><body>${grupo("MATUTINO", 14)}${grupo("VESPERTINO", 5)}</body></html>`;

writeFileSync(`${OUT}/test-print.html`, html);
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
const p = await browser.newPage();
await p.goto("file:///" + OUT + "/test-print.html");
await new Promise((r) => setTimeout(r, 300));
await p.pdf({ path: `${OUT}/test-credenciales.pdf`, format: "letter", printBackground: true, margin: { top: "7mm", bottom: "7mm", left: "7mm", right: "7mm" } });
await browser.close();
console.log("PDF listo:", `${OUT}/test-credenciales.pdf`);
