#!/usr/bin/env node
/**
 * Importa el historial completo de PASE_LISTA_V2 del xlsx legacy a la tabla
 * `asistencias` de Supabase. Hace upsert por (empleado_id, fecha).
 *
 * Headers esperados (del legacy): (empty) | QUINCENA | SEDE | ABREV | ID | NOMBRE | CODIGO | CAPTURADO_POR | TS_ISO | KEY
 * KEY tiene formato "YYYY-MM-DD|ABREV|ID" — la fecha se extrae de ahí.
 *
 * Uso:
 *   node scripts/import-pase-lista-historico.mjs [--dry-run]
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const XLSX_PATH = "C:/Users/edyme/Downloads/Asistencias V4.xlsx";
const dryRun = process.argv.includes("--dry-run");

const env = Object.fromEntries(
  readFileSync(join(ROOT, "apps/web/.env.local"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CODIGOS_VALIDOS = new Set([
  "A", "AF", "DS", "DT", "INH", "FER", "PCG", "PSG", "I", "F", "SN",
]);

function normCodigo(raw) {
  const v = String(raw || "").trim().toUpperCase();
  if (v === "S/N" || v === "" || v === "—" || v === "-") return null;
  if (CODIGOS_VALIDOS.has(v)) return v;
  return null;
}

function fechaFromRow(row) {
  // Strategy 1: extraer de KEY (formato fecha|abrev|id)
  const key = String(row.KEY || "").trim();
  if (key) {
    const m = key.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  // Strategy 2: si TS_ISO incluye fecha
  const ts = String(row.TS_ISO || "").trim();
  if (ts) {
    const m = ts.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  return null;
}

console.log(`📖 Leyendo PASE_LISTA_V2 de ${XLSX_PATH}...`);
const wb = XLSX.readFile(XLSX_PATH);
const ws = wb.Sheets["PASE_LISTA_V2"];
if (!ws) throw new Error("No existe la hoja PASE_LISTA_V2");
const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
console.log(`  · ${rows.length} filas`);

console.log("\n🔎 Mapeando empleados xlsx (ID) → empleados.id de Supabase...");
const { data: empleados, error: errE } = await sb
  .from("empleados")
  .select("id, numero_empleado");
if (errE) throw errE;
const empByNum = new Map((empleados ?? []).map((e) => [String(e.numero_empleado).trim(), e.id]));
console.log(`  · ${empByNum.size} empleados en DB`);

// Usuario de import (fallback capturado_por)
const { data: importUser } = await sb
  .from("usuarios")
  .select("id")
  .eq("rol", "SUPERADMIN")
  .eq("activo", true)
  .limit(1)
  .maybeSingle();
const importUserId = importUser?.id ?? null;

console.log("\n📊 Procesando filas...");
const marcas = new Map(); // key = `${empId}|${fecha}` → row
let sinFecha = 0, sinEmp = 0, codInvalid = 0, dups = 0;

for (const row of rows) {
  const rawId = String(row.ID ?? "").trim();
  if (!rawId) continue;
  const empId = empByNum.get(rawId);
  if (!empId) {
    sinEmp++;
    continue;
  }
  const fecha = fechaFromRow(row);
  if (!fecha) {
    sinFecha++;
    continue;
  }
  const cod = normCodigo(row.CODIGO);
  if (!cod || cod === "SN") {
    codInvalid++;
    continue;
  }
  const key = `${empId}|${fecha}`;
  // dedupe: si hay duplicados, queda la última fila (típicamente más reciente)
  if (marcas.has(key)) dups++;
  marcas.set(key, {
    empleado_id: empId,
    fecha,
    codigo: cod,
    capturado_por: importUserId,
    observacion: row.CAPTURADO_POR ? `import legacy · capturó ${row.CAPTURADO_POR}` : null,
  });
}

const toInsert = [...marcas.values()];

console.log(`  · ${toInsert.length} marcas únicas listas para upsert`);
console.log(`  · ${sinEmp} filas con ID no mapeado, ${sinFecha} sin fecha, ${codInvalid} con código inválido/SN, ${dups} duplicadas (kept last)`);

if (dryRun) {
  console.log("\n🚫 DRY RUN — nada se escribe.");
  console.log("Sample primeras 3:");
  toInsert.slice(0, 3).forEach((r) => console.log(" ", r));
  process.exit(0);
}

console.log("\n📤 Upsert en chunks de 500...");
const chunk = 500;
let ok = 0, fail = 0;
for (let i = 0; i < toInsert.length; i += chunk) {
  const slice = toInsert.slice(i, i + chunk);
  const { error } = await sb
    .from("asistencias")
    .upsert(slice, { onConflict: "empleado_id,fecha", ignoreDuplicates: false });
  if (error) {
    fail += slice.length;
    console.log(`  ❌ chunk ${i}–${i + slice.length}: ${error.message}`);
  } else {
    ok += slice.length;
    process.stdout.write(`\r  ${ok}/${toInsert.length}`);
  }
}
console.log(`\n  ✓ ${ok} insertadas / ${fail} fallidas`);

console.log("\n✅ HISTÓRICO IMPORTADO");
console.log(`Total en DB ahora: hacer SELECT count(*) FROM asistencias`);
