#!/usr/bin/env node
/**
 * Import enriquecido de RFC, CURP, CLABE y banco desde un xlsx legacy
 * estilo "CLABE INTERBANCARIA 1A Q MAYO26-final.xlsx".
 *
 * Hace match por NOMBRE normalizado (no por número de empleado, porque
 * las CLAVE del xlsx no coinciden con los numero_empleado de Vortex).
 *
 * Uso:
 *   node scripts/import-clabe-rfc.mjs <ruta-xlsx> [--dry-run]
 *
 * Ejemplo:
 *   node scripts/import-clabe-rfc.mjs "C:/Users/edyme/Downloads/CLABE INTERBANCARIA 1A Q MAYO26-final.xlsx"
 *   node scripts/import-clabe-rfc.mjs "..." --dry-run
 *
 * Estrategia:
 *   1) Carga todos los empleados activos de Vortex.
 *   2) Lee el xlsx (hoja "Plantilla" o la primera).
 *   3) Por cada fila, construye nombre = PATERNO + MATERNO + NOMBRES.
 *   4) Normaliza ambos lados: uppercase, sin acentos, sin caracteres
 *      raros, tokens ordenados — así "JUAN PEREZ GARCIA" matchea con
 *      "PEREZ GARCIA JUAN".
 *   5) Para cada empleado Vortex busca match en xlsx:
 *      · 1 match exacto único → actualiza rfc/curp/clabe/banco.
 *      · 0 matches → reporta como "no encontrado".
 *      · 2+ matches → marca como "ambiguo" y NO toca (manual).
 *   6) NO actualiza campos que el xlsx no trae o son vacíos.
 *   7) Si --dry-run, solo simula y reporta cambios sin escribir.
 *
 * Banco se deduce del prefijo de 3 dígitos de la CLABE (mapeo CNBV).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const requireFromHere = createRequire(import.meta.url);
// Reusamos exceljs ya instalado en apps/web (no queremos duplicar dep en root)
const ExcelJS = requireFromHere("../apps/web/node_modules/exceljs");

// ───── ENV ─────
const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", "apps/web/.env.local"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("✗ Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local");
  process.exit(1);
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ───── ARGS ─────
const [xlsxPath, ...rest] = process.argv.slice(2);
const dryRun = rest.includes("--dry-run");
if (!xlsxPath) {
  console.error("Uso: node scripts/import-clabe-rfc.mjs <ruta-xlsx> [--dry-run]");
  process.exit(1);
}

// ───── MAPA BANCOS ─────
const BANCOS_PREFIX = {
  "002": "Banamex",
  "006": "Bancomext",
  "009": "Banobras",
  "012": "BBVA",
  "014": "Santander",
  "019": "Banjército",
  "021": "HSBC",
  "030": "BanBajío",
  "032": "IXE",
  "036": "Inbursa",
  "037": "Interacciones",
  "042": "Mifel",
  "044": "Scotiabank",
  "058": "Banregio",
  "059": "Invex",
  "060": "Bansi",
  "062": "Afirme",
  "072": "Banorte",
  "103": "American Express",
  "127": "Banco Azteca",
  "128": "Autofin",
  "130": "Compartamos",
  "132": "BMultiva",
  "133": "Actinver",
  "137": "BanCoppel",
  "138": "ABC Capital",
  "140": "Consubanco",
  "143": "CIBanco",
  "145": "Bbase",
  "147": "Bankaool",
  "148": "PagaTodo",
  "150": "Inmobiliario Mexicano",
  "152": "Bancrea",
  "154": "Banco Finterra",
  "156": "Sabadell",
  "166": "BIM",
  "646": "STP",
};

function bancoDeClabe(clabe) {
  if (!clabe || clabe.length !== 18) return null;
  const prefix = clabe.slice(0, 3);
  return BANCOS_PREFIX[prefix] ?? null;
}

// ───── NORMALIZACIÓN DE NOMBRES ─────
function normalize(s) {
  if (!s) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // quita acentos
    .toUpperCase()
    .replace(/[^A-ZÑ\s]/g, " ")         // solo letras y espacios
    .replace(/\s+/g, " ")
    .trim();
}

function tokenKey(name) {
  return normalize(name).split(" ").filter(Boolean).sort().join(" ");
}

// ───── MAIN ─────
console.log(`📖 Leyendo ${xlsxPath}…`);
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(xlsxPath);
const ws = wb.getWorksheet("Plantilla") ?? wb.worksheets[0];
if (!ws) {
  console.error("✗ Hoja no encontrada");
  process.exit(1);
}

// Cargar empleados activos
console.log(`📡 Cargando empleados activos de Vortex…`);
const { data: empleadosRaw, error: empErr } = await sb
  .from("empleados")
  .select("id, numero_empleado, nombre, rfc, curp, clabe, banco, sede_id")
  .is("fecha_baja", null);
if (empErr) {
  console.error("✗", empErr.message);
  process.exit(1);
}
console.log(`  · ${empleadosRaw.length} empleados activos`);

// Indexar por tokenKey
const empleadosByKey = new Map();
for (const e of empleadosRaw) {
  const k = tokenKey(e.nombre);
  if (!empleadosByKey.has(k)) empleadosByKey.set(k, []);
  empleadosByKey.get(k).push(e);
}

// Parsear xlsx
const filas = [];
ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  if (rowNumber === 1) return; // header
  const clave = row.getCell(1).value;
  const paterno = row.getCell(2).value;
  const materno = row.getCell(3).value;
  const nombres = row.getCell(4).value;
  const rfc = row.getCell(5).value;
  const curp = row.getCell(6).value;
  const depto = row.getCell(7).value;
  const cuenta = row.getCell(8).value;
  if (!nombres && !paterno) return;
  const nombreCompleto = [paterno, materno, nombres].filter(Boolean).map((s) => String(s).trim()).join(" ");
  filas.push({
    rowNumber,
    clave: clave ? String(clave).trim() : null,
    nombreCompleto,
    nombreKey: tokenKey(nombreCompleto),
    rfc: rfc ? String(rfc).trim().toUpperCase().replace(/\s+/g, "") : null,
    curp: curp ? String(curp).trim().toUpperCase().replace(/\s+/g, "") : null,
    depto: depto ? String(depto).trim() : null,
    clabe: cuenta ? String(cuenta).trim().replace(/\D/g, "") : null,
  });
});
console.log(`  · ${filas.length} filas en xlsx`);

// Matching
let actualizados = 0, sinCambio = 0, ambiguos = 0, sinMatch = 0, errores = 0;
const sinMatchList = [];
const ambiguosList = [];
const erroresList = [];

for (const fila of filas) {
  if (!fila.nombreKey) continue;

  const matches = empleadosByKey.get(fila.nombreKey) ?? [];

  if (matches.length === 0) {
    sinMatch++;
    sinMatchList.push(`  ✗ ${fila.nombreCompleto} (xlsx CLAVE=${fila.clave ?? "?"}, DEPTO=${fila.depto ?? "?"})`);
    continue;
  }
  if (matches.length > 1) {
    ambiguos++;
    ambiguosList.push(`  ⚠ "${fila.nombreCompleto}" matchea con ${matches.length} empleados: ${matches.map((e) => `#${e.numero_empleado}`).join(", ")}`);
    continue;
  }

  // Match único — construir patch solo con campos que el xlsx trae y que difieran o estén vacíos
  const emp = matches[0];
  const banco = bancoDeClabe(fila.clabe);
  const patch = {};

  if (fila.rfc && fila.rfc !== emp.rfc) patch.rfc = fila.rfc;
  if (fila.curp && fila.curp !== emp.curp) patch.curp = fila.curp;
  if (fila.clabe && fila.clabe.length === 18 && fila.clabe !== emp.clabe) {
    patch.clabe = fila.clabe;
    patch.cuenta_bancaria = fila.clabe.slice(7, 18); // últimos 11 dígitos suelen ser la cuenta interna (aprox)
  }
  if (banco && banco !== emp.banco) patch.banco = banco;

  if (Object.keys(patch).length === 0) {
    sinCambio++;
    continue;
  }

  if (dryRun) {
    actualizados++;
    console.log(`  ✓ [DRY] #${emp.numero_empleado} ${emp.nombre} ← ${Object.keys(patch).join(", ")}`);
    continue;
  }

  const { error: updErr } = await sb.from("empleados").update(patch).eq("id", emp.id);
  if (updErr) {
    errores++;
    erroresList.push(`  ✗ #${emp.numero_empleado} ${emp.nombre}: ${updErr.message}`);
    continue;
  }
  actualizados++;
  console.log(`  ✓ #${emp.numero_empleado} ${emp.nombre} ← ${Object.keys(patch).join(", ")}`);
}

// ───── REPORTE FINAL ─────
console.log("\n═══════════════════════════════════════════════");
console.log(dryRun ? "  DRY RUN — no se escribió a la BD" : "  IMPORT REAL ejecutado");
console.log("═══════════════════════════════════════════════");
console.log(`  ✓ Actualizados:        ${actualizados}`);
console.log(`  · Sin cambios:         ${sinCambio} (ya estaban iguales)`);
console.log(`  ⚠ Ambiguos:            ${ambiguos} (mismo nombre, varios empleados)`);
console.log(`  ✗ Sin match en Vortex: ${sinMatch} (xlsx tiene gente que no está en empleados activos)`);
console.log(`  ✗ Errores:             ${errores}`);
console.log(`  Total filas xlsx:      ${filas.length}`);

if (ambiguos > 0) {
  console.log("\n⚠ AMBIGUOS (revisa a mano):");
  ambiguosList.slice(0, 30).forEach((l) => console.log(l));
  if (ambiguosList.length > 30) console.log(`  … y ${ambiguosList.length - 30} más`);
}

if (sinMatch > 0 && sinMatch < 50) {
  console.log("\n✗ SIN MATCH (no están activos en Vortex):");
  sinMatchList.slice(0, 30).forEach((l) => console.log(l));
  if (sinMatchList.length > 30) console.log(`  … y ${sinMatchList.length - 30} más`);
}

if (errores > 0) {
  console.log("\n✗ ERRORES:");
  erroresList.forEach((l) => console.log(l));
}

console.log("\nListo.");
