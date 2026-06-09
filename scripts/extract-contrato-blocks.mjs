#!/usr/bin/env node
/**
 * Extrae los párrafos de las plantillas DOCX de contrato y genera archivos
 * de "bloques tipados" para que ContratoDoc (react-pdf) renderice el contrato
 * con el MISMO acomodo y orden que el Word oficial.
 *
 * Clasifica cada párrafo: intro | seccion | subseccion | inciso | clausula |
 * parrafo | firma-* . Conserva las llaves {{LLAVE}}.
 *
 * Uso: node scripts/extract-contrato-blocks.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PizZip = require("../apps/web/node_modules/pizzip");

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(__dirname, "..", "apps/web/src/lib/contratos/templates");
const OUT_DIR = join(__dirname, "..", "apps/web/src/lib/pdf/templates");

function parrafosDeDocx(path) {
  const buf = readFileSync(path);
  const zip = new PizZip(buf);
  const xml = zip.file("word/document.xml").asText();
  const paras = [...xml.matchAll(/<w:p[ >].*?<\/w:p>/gs)].map((m) => m[0]);
  const out = [];
  for (const p of paras) {
    const txt = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
    const clean = txt
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    out.push(clean);
  }
  return out;
}

function clasificar(paras) {
  const blocks = [];
  let enFirmas = false;
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (p === "") continue;

    // Inicio de la zona de firmas
    if (/^POR "?(EL )?(PATR[ÓO]N|TRABAJADOR)"?$/i.test(p)) {
      enFirmas = true;
      continue; // las firmas se renderizan con un componente fijo
    }
    if (enFirmas) continue; // resto de líneas de firma (líneas, nombres) → fijas en el doc

    // Párrafo 0: "CONTRATO {{CONTRATO_ID}}" → ya va en el header, se omite
    if (/^CONTRATO \{\{CONTRATO_ID\}\}$/.test(p)) continue;
    // Título del contrato → se omite (ContratoDoc lo pone como <titulo>)
    if (/^CONTRATO INDIVIDUAL DE TRABAJO POR TIEMPO DETERMINADO QUE CELEBRAN/i.test(p)) {
      blocks.push({ t: "intro", x: p });
      continue;
    }
    // Secciones centradas
    if (/^DECLARACIONES$/i.test(p) || /^C\s*L\s*[ÁA]\s*U\s*S\s*U\s*L\s*A\s*S$/i.test(p)) {
      blocks.push({ t: "seccion", x: p.replace(/\s+/g, " ") });
      continue;
    }
    // Subsecciones I.- II.- III.-
    if (/^(I{1,3})\.-\s*(DE|DECLARAN)/i.test(p)) {
      blocks.push({ t: "subseccion", x: p });
      continue;
    }
    // Incisos a).- b).- etc (o "a) ")
    if (/^[a-z]\)\.?-?\s/i.test(p)) {
      blocks.push({ t: "inciso", x: p });
      continue;
    }
    // Cláusulas: PRIMERA.- ... DÉCIMA CUARTA.-
    const mCl = p.match(/^((?:D[ÉE]CIMA\s+)?(?:PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|S[ÉE]PTIMA|OCTAVA|NOVENA|D[ÉE]CIMA))\.-\s*(.*)$/i);
    if (mCl) {
      blocks.push({ t: "clausula", b: mCl[1] + ".-", x: mCl[2] || "" });
      continue;
    }
    // Resto: párrafo normal justificado
    blocks.push({ t: "parrafo", x: p });
  }
  return blocks;
}

function genArchivo(sexo, blocks) {
  const varName = `CONTRATO_${sexo}_BLOCKS`;
  const body = blocks
    .map((b) => {
      const parts = [`t: ${JSON.stringify(b.t)}`];
      if (b.b) parts.push(`b: ${JSON.stringify(b.b)}`);
      parts.push(`x: ${JSON.stringify(b.x ?? "")}`);
      return `  { ${parts.join(", ")} },`;
    })
    .join("\n");
  return `// AUTO-GENERADO por scripts/extract-contrato-blocks.mjs desde la plantilla
// DOCX oficial (contrato-${sexo.toLowerCase()}.docx). NO editar a mano: re-genera el script.
// Bloques tipados que ContratoDoc renderiza con el MISMO orden y acomodo que el Word.

import type { ContratoBlock } from "./blocks-types";

export const ${varName}: ContratoBlock[] = [
${body}
];
`;
}

const tipos = `// Tipo de bloque de contrato (compartido por las plantillas auto-generadas).
export interface ContratoBlock {
  /** intro | seccion (centrada) | subseccion (I.- II.-) | inciso (a).-) | clausula (PRIMERA.-) | parrafo */
  t: "intro" | "seccion" | "subseccion" | "inciso" | "clausula" | "parrafo";
  /** Texto en bold al inicio (solo en clausula, ej. "PRIMERA.-") */
  b?: string;
  /** Texto del bloque (puede contener {{LLAVE}}) */
  x: string;
}
`;

writeFileSync(join(OUT_DIR, "blocks-types.ts"), tipos);

for (const sexo of ["HOMBRE", "MUJER"]) {
  const paras = parrafosDeDocx(join(TPL_DIR, `contrato-${sexo.toLowerCase()}.docx`));
  const blocks = clasificar(paras);
  writeFileSync(join(OUT_DIR, `contrato-${sexo.toLowerCase()}-blocks.ts`), genArchivo(sexo, blocks));
  const cuenta = blocks.reduce((a, b) => { a[b.t] = (a[b.t] || 0) + 1; return a; }, {});
  console.log(`${sexo}: ${blocks.length} bloques →`, JSON.stringify(cuenta));
}
console.log("Listo. Archivos en apps/web/src/lib/pdf/templates/");
