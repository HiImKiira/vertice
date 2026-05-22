#!/usr/bin/env node
/**
 * Import histórico de PASE_LISTA_V2 → asistencias.
 *
 * Shape de la sheet:
 *   FECHA(" "), QUINCENA, SEDE, ABREV, ID, NOMBRE, CODIGO, CAPTURADO_POR, TS_ISO, KEY
 *
 * Upsert idempotente por (empleado_id, fecha). Si ya existe se actualiza el
 * código. capturado_por se resuelve por username (CAPTURADO_POR) o fallback
 * al usuario SUPERADMIN.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const XLSX_PATH = "C:/Users/edyme/Downloads/Asistencias V4 (1).xlsx";
const SHEET = "PASE_LISTA_V2";

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

const VALID_CODES = new Set(["A", "AF", "DS", "DT", "INH", "FER", "PCG", "PSG", "I", "F", "SN"]);

console.log(`→ Leyendo ${XLSX_PATH} [${SHEET}]…`);
const wb = XLSX.readFile(XLSX_PATH);
const sheet = wb.Sheets[SHEET];
if (!sheet) throw new Error(`Sheet ${SHEET} no encontrada`);
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
console.log(`  ${rows.length} filas`);

// Catálogos
console.log("→ Cargando catálogos…");
const [{ data: sedes }, { data: empleados }, { data: usuarios }] = await Promise.all([
  sb.from("sedes").select("id, abrev"),
  sb.from("empleados").select("id, numero_empleado, sede_id"),
  sb.from("usuarios").select("id, username"),
]);

const sedeByAbrev = new Map((sedes ?? []).map((s) => [s.abrev.toUpperCase(), s.id]));
const empBySedeAndNum = new Map(
  (empleados ?? []).map((e) => [`${e.sede_id}|${e.numero_empleado}`, e.id]),
);
const userByUsername = new Map(
  (usuarios ?? []).map((u) => [u.username.toLowerCase(), u.id]),
);
const fallbackUserId = userByUsername.get("super") ?? [...userByUsername.values()][0];
console.log(`  sedes=${sedeByAbrev.size}, empleados=${empBySedeAndNum.size}, usuarios=${userByUsername.size}`);

// Diag de abrevs faltantes
const missingAbrevs = new Map();

// Procesar filas (last-write-wins por empleado_id|fecha)
const byKey = new Map();
let skipNoSede = 0, skipNoEmp = 0, skipBadCode = 0, skipNoDate = 0;
for (const r of rows) {
  const fecha = String(r[" "] ?? r.FECHA ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { skipNoDate++; continue; }
  const abrev = String(r.ABREV ?? "").toUpperCase().trim();
  const sedeId = sedeByAbrev.get(abrev);
  if (!sedeId) {
    skipNoSede++;
    missingAbrevs.set(abrev, (missingAbrevs.get(abrev) ?? 0) + 1);
    continue;
  }
  const num = String(r.ID ?? "").trim();
  if (!num) { skipNoEmp++; continue; }
  const empId = empBySedeAndNum.get(`${sedeId}|${num}`);
  if (!empId) { skipNoEmp++; continue; }
  const codigo = String(r.CODIGO ?? "").trim().toUpperCase();
  if (!VALID_CODES.has(codigo)) { skipBadCode++; continue; }
  const captName = String(r.CAPTURADO_POR ?? "").toLowerCase().trim();
  const capturadoPor = userByUsername.get(captName) ?? fallbackUserId;

  // dedupe last-write-wins
  byKey.set(`${empId}|${fecha}`, {
    empleado_id: empId,
    fecha,
    codigo,
    capturado_por: capturadoPor,
  });
}
const toUpsert = [...byKey.values()];

if (missingAbrevs.size) {
  console.log("\n⚠ ABREVS faltantes en DB (top 10):");
  const sorted = [...missingAbrevs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [k, n] of sorted) console.log(`  ${k}: ${n} filas`);
}

console.log(`→ A insertar: ${toUpsert.length}`);
console.log(`  Skip: noDate=${skipNoDate}, noSede=${skipNoSede}, noEmp=${skipNoEmp}, badCode=${skipBadCode}`);

// Batches de 1000
const BATCH = 500;
let done = 0, errCount = 0;
for (let i = 0; i < toUpsert.length; i += BATCH) {
  const chunk = toUpsert.slice(i, i + BATCH);
  const { error } = await sb.from("asistencias").upsert(chunk, { onConflict: "empleado_id,fecha" });
  if (error) {
    errCount++;
    console.error(`  ✗ Batch ${i}: ${error.message}`);
  } else {
    done += chunk.length;
    if (i % 2000 === 0) console.log(`  ✓ ${done}/${toUpsert.length}`);
  }
}

// Conteo final
const { count: total } = await sb.from("asistencias").select("id", { count: "exact", head: true });
const { count: q2may } = await sb
  .from("asistencias")
  .select("id", { count: "exact", head: true })
  .gte("fecha", "2026-05-16")
  .lte("fecha", "2026-05-31");

console.log(`\n✓ Import completo.`);
console.log(`  Subidas: ${done}`);
console.log(`  Errores de batch: ${errCount}`);
console.log(`  Total asistencias en DB: ${total}`);
console.log(`  Asistencias Q2 mayo (16-31): ${q2may}`);
