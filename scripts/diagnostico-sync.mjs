#!/usr/bin/env node
/**
 * Diagnóstico completo: compara CONTRATOS_2026 del sheet vs estado en DB.
 * Reporta diferencias para validar que el sync quedó coherente.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const XLSX_PATH = "C:/Users/edyme/Downloads/Asistencias_LATEST.xlsx";

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

const wb = XLSX.readFile(XLSX_PATH);
const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets["CONTRATOS_2026"], { defval: null, raw: false });

const sheetActivos = sheetRows.filter(r => r.ID && r.NOMBRE_TRABAJADOR && (r.STATUS_TRABAJADOR ?? "ACTIVO").toUpperCase() !== "BAJA" && !r.FECHA_BAJA);
const sheetBajas = sheetRows.filter(r => r.ID && r.NOMBRE_TRABAJADOR && ((r.STATUS_TRABAJADOR ?? "").toUpperCase() === "BAJA" || r.FECHA_BAJA));

console.log("═══════════════════════════════════════════════════");
console.log("  SHEET CONTRATOS_2026 vs DB empleados");
console.log("═══════════════════════════════════════════════════\n");

console.log(`Sheet:  ${sheetRows.length} filas`);
console.log(`  Activos (no baja):  ${sheetActivos.length}`);
console.log(`  Con baja:           ${sheetBajas.length}`);

const [{ count: dbTotal }, { count: dbActivos }, { count: dbBajas }] = await Promise.all([
  sb.from("empleados").select("id", { count: "exact", head: true }),
  sb.from("empleados").select("id", { count: "exact", head: true }).is("fecha_baja", null),
  sb.from("empleados").select("id", { count: "exact", head: true }).not("fecha_baja", "is", null),
]);

console.log(`\nDB:     ${dbTotal} empleados`);
console.log(`  Activos (sin fecha_baja):  ${dbActivos}`);
console.log(`  Con fecha_baja:            ${dbBajas}`);

const diff = sheetRows.length - dbTotal;
const diffActivos = sheetActivos.length - dbActivos;
const diffBajas = sheetBajas.length - dbBajas;
console.log("\n── Diferencias ──");
console.log(`  Total:   sheet - db = ${diff} ${diff === 0 ? "✓" : diff === 2 ? "✓ (2 filas vacías en sheet)" : "⚠"}`);
console.log(`  Activos: sheet - db = ${diffActivos} ${Math.abs(diffActivos) <= 2 ? "✓" : "⚠"}`);
console.log(`  Bajas:   sheet - db = ${diffBajas} ${Math.abs(diffBajas) <= 2 ? "✓" : "⚠"}`);

// Verificar coherencia por ID
console.log("\n── Verificación fila por fila ──");
const { data: empleadosDb } = await sb.from("empleados").select("numero_empleado, nombre, fecha_baja, motivo_baja, sede_id");
const dbByNum = new Map((empleadosDb ?? []).map(e => [e.numero_empleado, e]));

let mismatches = 0;
let mismatchSample = [];
for (const row of sheetRows) {
  if (!row.ID || !row.NOMBRE_TRABAJADOR) continue;
  const id = String(row.ID).trim();
  const dbEmp = dbByNum.get(id);
  if (!dbEmp) {
    mismatches++;
    if (mismatchSample.length < 5) mismatchSample.push({ id, error: "no existe en DB", nombre: row.NOMBRE_TRABAJADOR });
    continue;
  }

  const sheetEsBaja = (row.STATUS_TRABAJADOR ?? "").toUpperCase() === "BAJA" || !!row.FECHA_BAJA;
  const dbEsBaja = !!dbEmp.fecha_baja;

  if (sheetEsBaja !== dbEsBaja) {
    mismatches++;
    if (mismatchSample.length < 5) {
      mismatchSample.push({
        id,
        nombre: row.NOMBRE_TRABAJADOR,
        sheet: sheetEsBaja ? "BAJA" : "ACTIVO",
        db: dbEsBaja ? `BAJA (${dbEmp.fecha_baja})` : "ACTIVO",
      });
    }
  }
}

if (mismatches === 0) {
  console.log("  ✓ Todos los registros coinciden entre sheet y DB.\n");
} else {
  console.log(`  ⚠ ${mismatches} discrepancias encontradas. Muestra:`);
  for (const m of mismatchSample) console.log("   ", JSON.stringify(m));
}

// Bajas por sede (top 5)
console.log("\n── Bajas por sede ──");
const { data: bajasPorSede } = await sb
  .from("empleados")
  .select("sede_id, sedes(abrev, nombre)")
  .not("fecha_baja", "is", null);

const bajasGroup = new Map();
for (const b of bajasPorSede ?? []) {
  const sede = Array.isArray(b.sedes) ? b.sedes[0] : b.sedes;
  if (!sede) continue;
  const key = `${sede.abrev}|${sede.nombre}`;
  bajasGroup.set(key, (bajasGroup.get(key) ?? 0) + 1);
}
const sorted = [...bajasGroup.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
for (const [k, n] of sorted) {
  const [abrev, nombre] = k.split("|");
  console.log(`  ${abrev.padEnd(8)} ${n.toString().padStart(3)}  ${nombre}`);
}

// Top 5 activos por sede
console.log("\n── Activos por sede (top 5) ──");
const { data: activosRaw } = await sb
  .from("empleados")
  .select("sede_id, sedes(abrev, nombre)")
  .is("fecha_baja", null);

const activosGroup = new Map();
for (const e of activosRaw ?? []) {
  const sede = Array.isArray(e.sedes) ? e.sedes[0] : e.sedes;
  if (!sede) continue;
  const key = `${sede.abrev}|${sede.nombre}`;
  activosGroup.set(key, (activosGroup.get(key) ?? 0) + 1);
}
const sortedAct = [...activosGroup.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
for (const [k, n] of sortedAct) {
  const [abrev, nombre] = k.split("|");
  console.log(`  ${abrev.padEnd(8)} ${n.toString().padStart(3)}  ${nombre}`);
}

// Asistencias importadas
console.log("\n── Asistencias en DB ──");
const [{ count: totalAst }, { count: q1May }, { count: q2May }] = await Promise.all([
  sb.from("asistencias").select("id", { count: "exact", head: true }),
  sb.from("asistencias").select("id", { count: "exact", head: true }).gte("fecha", "2026-05-01").lte("fecha", "2026-05-15"),
  sb.from("asistencias").select("id", { count: "exact", head: true }).gte("fecha", "2026-05-16").lte("fecha", "2026-05-31"),
]);
console.log(`  Total:        ${totalAst}`);
console.log(`  Q1 mayo (1-15):  ${q1May}`);
console.log(`  Q2 mayo (16-31): ${q2May}`);

// Última fecha capturada
const { data: ultima } = await sb
  .from("asistencias")
  .select("fecha")
  .order("fecha", { ascending: false })
  .limit(1);
console.log(`  Última fecha:    ${ultima?.[0]?.fecha ?? "—"}`);

console.log("\n═══════════════════════════════════════════════════");
console.log("✓ Diagnóstico completo.");
