#!/usr/bin/env node
/**
 * Import idempotente de CONTRATOS_2026 del sheet legacy:
 *   1. Upsert de empleados por numero_empleado (ID global del sheet)
 *      - Llena nombre, sede, jornada, status, dia_descanso
 *      - Si STATUS=BAJA: setea fecha_baja (usa FECHA_BAJA del sheet o today)
 *      - Si STATUS=ACTIVO: limpia fecha_baja a null
 *   2. Recalcula sedes.ultimo_folio = count(empleados) por sede
 *      para que el siguiente contrato continúe la secuencia correcta
 *
 * Source: el archivo Asistencias_LATEST.xlsx (descargado del Google Sheet).
 * Si el sheet tiene una fila de empleado vacía (sin nombre o sede), se salta.
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

const JORNADA_MAP = {
  MATUTINO: "MATUTINO",
  VESPERTINO: "VESPERTINO",
  VESPERTNO: "VESPERTINO",
  NOCTURNO: "NOCTURNO",
  "TURNO ROTATIVO": "TURNO_ROTATIVO",
  "TURNO_ROTATIVO": "TURNO_ROTATIVO",
  CUBRETURNOS: "CUBRETURNOS",
  DIURNO: "DIURNO",
};

const DIA_MAP = {
  LUNES: "LUN", MARTES: "MAR", MIERCOLES: "MIE", "MIÉRCOLES": "MIE",
  JUEVES: "JUE", VIERNES: "VIE", SABADO: "SAB", "SÁBADO": "SAB", DOMINGO: "DOM",
};

function parseDiaDescanso(raw) {
  // dia_descanso es NOT NULL en la DB, así que damos default ["DOM"]
  if (!raw) return ["DOM"];
  const txt = String(raw).toUpperCase().trim();
  const parts = txt.split(/\s*(?:Y|,|\+|\/)\s*/).map((s) => s.trim()).filter(Boolean);
  const dias = [];
  for (const p of parts) if (DIA_MAP[p]) dias.push(DIA_MAP[p]);
  return dias.length ? dias : ["DOM"];
}

function parseFecha(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // YYYY-MM-DD
  const m1 = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m1) {
    return `${m1[1]}-${String(m1[2]).padStart(2,"0")}-${String(m1[3]).padStart(2,"0")}`;
  }
  // DD/MM/YYYY
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) {
    return `${m2[3]}-${String(m2[2]).padStart(2,"0")}-${String(m2[1]).padStart(2,"0")}`;
  }
  return null;
}

console.log(`→ Leyendo ${XLSX_PATH} [CONTRATOS_2026]…`);
const wb = XLSX.readFile(XLSX_PATH);
const sheet = wb.Sheets["CONTRATOS_2026"];
if (!sheet) {
  console.error("✗ Pestaña CONTRATOS_2026 no encontrada.");
  process.exit(1);
}
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
console.log(`  ${rows.length} filas`);

// Cargar catálogo de sedes
console.log("→ Cargando sedes…");
const { data: sedesData, error: sedesErr } = await sb.from("sedes").select("id, codigo, nombre, abrev");
if (sedesErr) { console.error(`✗ Sedes query: ${sedesErr.message}`); process.exit(1); }
const sedeByNombre = new Map(
  (sedesData ?? []).map((s) => [s.nombre.toUpperCase().trim(), s.id]),
);
console.log(`  ${sedesData?.length ?? 0} sedes en DB`);

// Cargar empleados existentes para detectar bajas (status cambia ACTIVO→BAJA)
const { data: empExistentes } = await sb.from("empleados").select("numero_empleado, fecha_baja");
const empPrev = new Map((empExistentes ?? []).map((e) => [e.numero_empleado, e.fecha_baja]));

// Procesar filas
const upserts = [];
let skipNoSede = 0, skipIncompleto = 0;
const sedesFaltantes = new Map();

for (const r of rows) {
  const id = r.ID ? String(r.ID).trim() : null;
  const nombre = r.NOMBRE_TRABAJADOR ? String(r.NOMBRE_TRABAJADOR).trim() : null;
  const sedeNombre = r.SEDE ? String(r.SEDE).toUpperCase().trim() : null;

  if (!id || !nombre || !sedeNombre) {
    skipIncompleto++;
    continue;
  }

  const sedeId = sedeByNombre.get(sedeNombre);
  if (!sedeId) {
    skipNoSede++;
    sedesFaltantes.set(sedeNombre, (sedesFaltantes.get(sedeNombre) ?? 0) + 1);
    continue;
  }

  const jornadaRaw = (r.JORNADA ?? "").toString().toUpperCase().trim();
  const jornada = JORNADA_MAP[jornadaRaw] ?? "MATUTINO";

  const status = (r.STATUS_TRABAJADOR ?? "ACTIVO").toString().toUpperCase().trim();
  const esBaja = status === "BAJA" || !!r.FECHA_BAJA;

  let fechaBaja = null;
  if (esBaja) {
    fechaBaja = parseFecha(r.FECHA_BAJA) ?? empPrev.get(id) ?? new Date().toISOString().slice(0,10);
  }

  const diaDescanso = parseDiaDescanso(r.DIA_DESCANSO);

  upserts.push({
    numero_empleado: id,
    nombre,
    sede_id: sedeId,
    jornada,
    dia_descanso: diaDescanso,
    fecha_baja: fechaBaja,
    motivo_baja: esBaja ? (r.MOTIVO_BAJA ? String(r.MOTIVO_BAJA).trim() : null) : null,
    segmento_original: r.SEGMENTO_ORIGINAL ? String(r.SEGMENTO_ORIGINAL).trim() : null,
  });
}

console.log(`→ A upsertear: ${upserts.length}`);
console.log(`  Skip: incompleto=${skipIncompleto}, noSede=${skipNoSede}`);

if (sedesFaltantes.size) {
  console.log("\n⚠ Sedes faltantes en DB (top 10):");
  const sorted = [...sedesFaltantes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [k, n] of sorted) console.log(`    ${k}: ${n} filas`);
}

// Batch upsert
const BATCH = 100;
let done = 0, errCount = 0;
for (let i = 0; i < upserts.length; i += BATCH) {
  const chunk = upserts.slice(i, i + BATCH);
  const { error } = await sb.from("empleados").upsert(chunk, { onConflict: "numero_empleado" });
  if (error) {
    errCount++;
    console.error(`  ✗ Batch ${i}: ${error.message}`);
  } else {
    done += chunk.length;
    process.stdout.write(`\r  ${done}/${upserts.length}`);
  }
}
console.log(`\n  ✓ ${done} empleados upserted, ${errCount} batches con error`);

// Recalcular ultimo_folio por sede
console.log("\n→ Recalculando ultimo_folio por sede…");
const { data: porSede } = await sb
  .from("empleados")
  .select("sede_id");

const conteoPorSede = new Map();
for (const e of porSede ?? []) {
  conteoPorSede.set(e.sede_id, (conteoPorSede.get(e.sede_id) ?? 0) + 1);
}

let sedesActualizadas = 0;
for (const [sedeId, count] of conteoPorSede) {
  const { error } = await sb.from("sedes").update({ ultimo_folio: count }).eq("id", sedeId);
  if (!error) sedesActualizadas++;
}
console.log(`  ✓ ${sedesActualizadas} sedes con ultimo_folio actualizado`);

// Diagnóstico final
console.log("\n→ Diagnóstico final:");
const [{ count: totalEmp }, { count: empActivos }, { count: empBaja }] = await Promise.all([
  sb.from("empleados").select("id", { count: "exact", head: true }),
  sb.from("empleados").select("id", { count: "exact", head: true }).is("fecha_baja", null),
  sb.from("empleados").select("id", { count: "exact", head: true }).not("fecha_baja", "is", null),
]);
console.log(`  Total empleados: ${totalEmp}`);
console.log(`  Activos: ${empActivos}`);
console.log(`  Dados de baja: ${empBaja}`);

// Top 5 sedes por ultimo_folio
const { data: topSedes } = await sb
  .from("sedes")
  .select("abrev, nombre, ultimo_folio")
  .order("ultimo_folio", { ascending: false })
  .limit(5);
console.log("\n  Top 5 sedes por ultimo_folio (próximo contrato MHS/<abrev><NNN+1>/2026):");
for (const s of topSedes ?? []) {
  console.log(`    ${s.abrev.padEnd(8)} ${s.ultimo_folio.toString().padStart(3, " ")}  ${s.nombre}`);
}

console.log("\n✓ Import CONTRATOS_2026 completo.");
