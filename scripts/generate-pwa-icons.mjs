#!/usr/bin/env node
/**
 * Genera todos los íconos PWA desde apps/web/public/favicon.svg.
 *
 * Outputs en apps/web/public/icons/ y apps/web/public/:
 *   - icon-192.png        (Android home)
 *   - icon-512.png        (Android splash)
 *   - icon-192-maskable.png  (con padding para área segura Android adaptive)
 *   - icon-512-maskable.png
 *   - apple-touch-icon.png   (180x180, iOS home)
 *   - favicon-32.png         (legacy browsers)
 *   - favicon-16.png
 */
import sharp from "sharp";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC_SVG = join(ROOT, "apps/web/public/favicon.svg");
const OUT_DIR = join(ROOT, "apps/web/public/icons");
mkdirSync(OUT_DIR, { recursive: true });

const svgRaw = readFileSync(SRC_SVG);

// Para maskable: la SVG tiene la V centrada con fondo, pero el "safe area" de
// maskable necesita que el contenido viva en el 80% central. Generamos una
// variante con padding extra (la V más pequeña dentro del rectángulo).
const maskableSvg = svgRaw.toString().replace(
  /<rect width="200" height="200" rx="36" fill="#050B18"\/>/,
  '<rect width="200" height="200" fill="#050B18"/>',
).replace(
  // Reducimos la V al 70% y la centramos: trasformamos polígonos
  /<polygon points="40,50 70,50 100,115 100,165" fill="url\(#vL\)"\/>\s*<polygon points="100,115 130,50 160,50 100,165" fill="url\(#vR\)"\/>\s*<line x1="100" y1="115" x2="100" y2="165" stroke="#E0F2FE" stroke-opacity="0\.55" stroke-width="1\.2"\/>/,
  '<g transform="translate(100,100) scale(0.7) translate(-100,-100)">'
  + '<polygon points="40,50 70,50 100,115 100,165" fill="url(#vL)"/>'
  + '<polygon points="100,115 130,50 160,50 100,165" fill="url(#vR)"/>'
  + '<line x1="100" y1="115" x2="100" y2="165" stroke="#E0F2FE" stroke-opacity="0.55" stroke-width="1.2"/>'
  + '</g>',
);

async function png(svgBuf, size, outPath) {
  await sharp(svgBuf, { density: 300 })
    .resize(size, size, { fit: "contain", background: { r: 5, g: 11, b: 24, alpha: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`  ✓ ${outPath} (${size}×${size})`);
}

console.log("→ Generando íconos PWA desde favicon.svg…\n");

// Standard icons (con esquinas redondeadas)
await png(svgRaw, 192, join(OUT_DIR, "icon-192.png"));
await png(svgRaw, 512, join(OUT_DIR, "icon-512.png"));

// Maskable (con padding extra)
await png(Buffer.from(maskableSvg), 192, join(OUT_DIR, "icon-192-maskable.png"));
await png(Buffer.from(maskableSvg), 512, join(OUT_DIR, "icon-512-maskable.png"));

// Apple touch icon — iOS no respeta esquinas redondeadas del SVG, se las pone
// el SO. Mejor usar la versión con padding suave (no maskable, no full bleed)
await png(svgRaw, 180, join(ROOT, "apps/web/public/apple-touch-icon.png"));

// Favicons clásicos para que se vea en pestañas de navegador viejo
await png(svgRaw, 32, join(ROOT, "apps/web/public/favicon-32.png"));
await png(svgRaw, 16, join(ROOT, "apps/web/public/favicon-16.png"));

// ICO multi-resolución (compat con Edge/IE pero no crítico)
// Si quisieras: sharp no genera .ico directamente, usaríamos to-ico.

// Manifest webmanifest
const manifest = {
  name: "Vortex - Asistencias",
  short_name: "Vortex",
  description: "Vortex — Centro de operación de asistencia, incidencias, nómina y datos para RH multi-sede.",
  start_url: "/dashboard",
  scope: "/",
  display: "standalone",
  orientation: "portrait-primary",
  background_color: "#050B18",
  theme_color: "#050B18",
  categories: ["business", "productivity", "utilities"],
  lang: "es-MX",
  dir: "ltr",
  icons: [
    { src: "/icons/icon-192.png",          sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png",          sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "/favicon.svg",                  sizes: "any",     type: "image/svg+xml", purpose: "any" },
  ],
};
const manifestPath = join(ROOT, "apps/web/public/manifest.webmanifest");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`  ✓ ${manifestPath}`);

console.log("\n✓ Listo.");
