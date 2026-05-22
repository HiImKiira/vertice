#!/usr/bin/env node
/**
 * Full sync desde el xlsx legacy (Asistencias_LATEST.xlsx):
 *   1. sedes (upsert por codigo, preserva abrev autogenerado y ultimo_folio)
 *   2. empleados (upsert por numero_empleado, actualiza activo/sede/jornada)
 *   3. asignaciones_supervisor (upsert por unique)
 *
 * Idempotente: corre las veces que quieras. Reporta diagnóstico al final
 * incluyendo el estado de cada supervisor (cuántas asignaciones, cuántos
 * empleados en sus sedes, etc.).
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
  MATUTINO: "MATUTINO", VESPERTINO: "VESPERTINO", VESPERTNO: "VESPERTINO",
  NOCTURNO: "NOCTURNO", "TURNO ROTATIVO": "TURNO_ROTATIVO",
  CUBRETURNOS: "CUBRETURNOS", DIURNO: "DIURNO",
};
const DIA_MAP = { LUNES: "LUN", MARTES: "MAR", MIERCOLES: "MIE", "MIÉRCOLES": "MIE", JUEVES: "JUE", VIERNES: "VIE", SABADO: "SAB", "SÁBADO": "SAB", DOMINGO: "DOM" };
function parseDiaDescanso(raw) {
  if (!raw) return ["DOM"];
  const txt = String(raw).toUpperCase().trim();
  const parts = txt.split(/\s*(?:Y|,|\+|\/)\s*/).map((s) => s.trim()).filter(Boolean);
  const dias = [];
  for (const p of parts) if (DIA_MAP[p]) dias.push(DIA_MAP[p]);
  return dias.length ? dias : ["DOM"];
}

console.log(`📖 Leyendo ${XLSX_PATH}...`);
const wb = XLSX.readFile(XLSX_PATH);

// ─── 1) Sedes — leer únicas de CONTRATOS_2026 y dejar las existentes ───
console.log("\n📍 SEDES");
const contratos = XLSX.utils.sheet_to_json(wb.Sheets.CONTRATOS_2026, { defval: null });
const sedesUnicas = new Set();
for (const c of contratos) {
  if (c.SEDE) sedesUnicas.add(String(c.SEDE).trim());
}
console.log(`  · ${sedesUnicas.size} sedes únicas en xlsx`);

const { data: sedesActuales } = await sb.from("sedes").select("id, codigo, nombre, abrev");
const sedesByCodigo = new Map(sedesActuales.map((s) => [s.codigo, s]));
const sedesByNombre = new Map(sedesActuales.map((s) => [s.nombre.toUpperCase().trim(), s]));
console.log(`  · ${sedesActuales.length} sedes ya en DB`);

let nuevasSedes = 0;
for (const nombre of sedesUnicas) {
  const codigo = nombre.toUpperCase();
  if (sedesByCodigo.has(codigo) || sedesByNombre.has(codigo)) continue;
  // Generar abrev sencillo
  const abrev = nombre.split(/\s+/).filter((w) => !["DE","LA","EL","DEL","Y"].includes(w)).slice(0, 3).map((w) => w[0]).join("").toUpperCase() || "SED";
  await sb.from("sedes").insert({ codigo, abrev, nombre });
  nuevasSedes++;
}
console.log(`  ✓ ${nuevasSedes} sedes nuevas creadas`);

// ─── 2) Empleados — upsert ───
console.log("\n👥 EMPLEADOS");
const { data: sedesAhora } = await sb.from("sedes").select("id, codigo, nombre");
const sedeNameToId = new Map(sedesAhora.map((s) => [s.nombre.toUpperCase().trim(), s.id]));

const empleadosRows = contratos
  .filter((c) => c.ID && c.NOMBRE_TRABAJADOR && c.SEDE)
  .map((c) => {
    const sedeId = sedeNameToId.get(String(c.SEDE).toUpperCase().trim());
    if (!sedeId) return null;
    const jornadaRaw = String(c.JORNADA || "").toUpperCase().trim();
    const jornada = JORNADA_MAP[jornadaRaw] || "MATUTINO";
    const status = String(c.STATUS_TRABAJADOR || "ACTIVO").trim().toUpperCase();
    return {
      numero_empleado: String(c.ID).trim(),
      nombre: String(c.NOMBRE_TRABAJADOR).trim(),
      sede_id: sedeId,
      jornada,
      dia_descanso: parseDiaDescanso(c.DIA_DESCANSO),
      status: ["ACTIVO", "BAJA", "SUSPENDIDO", "PERIODO_PRUEBA"].includes(status) ? status : "ACTIVO",
      fecha_baja: status === "BAJA" ? (c.FECHA_BAJA ? null : null) : null, // no tocar
      segmento_original: c.SEGMENTO_ORIGINAL ? String(c.SEGMENTO_ORIGINAL).trim() : null,
    };
  })
  .filter(Boolean);

console.log(`  · ${empleadosRows.length} empleados en xlsx`);

const chunk = 100;
let upserted = 0;
for (let i = 0; i < empleadosRows.length; i += chunk) {
  const slice = empleadosRows.slice(i, i + chunk);
  const { error } = await sb.from("empleados").upsert(slice, { onConflict: "numero_empleado" });
  if (error) {
    console.log(`  ❌ chunk ${i}: ${error.message}`);
  } else {
    upserted += slice.length;
    process.stdout.write(`\r  ${upserted}/${empleadosRows.length}`);
  }
}
console.log(`\n  ✓ ${upserted} empleados upserted`);

// ─── 3) Asignaciones ───
console.log("\n🎯 ASIGNACIONES_SUP");
const asignaciones = XLSX.utils.sheet_to_json(wb.Sheets.ASIGNACIONES_SUP, { defval: null });
const activas = asignaciones.filter((r) => String(r.ACTIVO || "").toUpperCase() === "SI");
console.log(`  · ${activas.length} asignaciones activas en xlsx`);

const { data: usuariosDb } = await sb.from("usuarios").select("id, username, email");
const userIndex = new Map();
for (const u of usuariosDb) {
  userIndex.set(u.username.toLowerCase().trim(), u.id);
  if (u.email) userIndex.set(u.email.toLowerCase().trim(), u.id);
}

const toUpsert = [];
const skipped = [];
for (const r of activas) {
  const usernameRaw = String(r.USERNAME || "").toLowerCase().trim();
  const sedeRaw = String(r.SEDE || "").toUpperCase().trim();
  const jornadaRaw = String(r.JORNADA || "").toUpperCase().trim();
  const usuario_id = userIndex.get(usernameRaw);
  const sede_id = sedeNameToId.get(sedeRaw);
  const jornada = JORNADA_MAP[jornadaRaw];
  if (!usuario_id || !sede_id || !jornada) {
    skipped.push({ user: r.USERNAME, sede: r.SEDE, jornada: r.JORNADA, why: !usuario_id ? "no user" : !sede_id ? "no sede" : "no jornada" });
    continue;
  }
  toUpsert.push({ usuario_id, sede_id, jornada, activo: true });
}
console.log(`  · ${toUpsert.length} listas para upsert, ${skipped.length} skipped`);
if (skipped.length) {
  console.log("    skipped detail:");
  for (const s of skipped) console.log(`      ${s.why}: ${s.user} → ${s.sede} (${s.jornada})`);
}

for (let i = 0; i < toUpsert.length; i += chunk) {
  const slice = toUpsert.slice(i, i + chunk);
  await sb.from("asignaciones_supervisor").upsert(slice, { onConflict: "usuario_id,sede_id,jornada" });
}
console.log(`  ✓ ${toUpsert.length} asignaciones upserted`);

// ─── 4) Diagnóstico ───
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("DIAGNÓSTICO FINAL");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const { data: postUsuarios } = await sb
  .from("usuarios")
  .select("id, username, nombre, rol, activo")
  .eq("activo", true);

for (const u of postUsuarios) {
  // Sus asignaciones
  const { data: misAsign } = await sb
    .from("asignaciones_supervisor")
    .select("sede_id, jornada, sedes(abrev, nombre)")
    .eq("usuario_id", u.id)
    .eq("activo", true);
  const sedeIds = new Set((misAsign ?? []).map((a) => a.sede_id));
  // Empleados de sus sedes
  let empCount = 0;
  for (const sid of sedeIds) {
    const { count } = await sb
      .from("empleados")
      .select("id", { count: "exact", head: true })
      .eq("sede_id", sid)
      .is("fecha_baja", null);
    empCount += count || 0;
  }
  console.log(`\n${u.username.padEnd(28)} (${u.rol.padEnd(11)}) — ${u.nombre}`);
  console.log(`  ${(misAsign?.length ?? 0)} asignaciones · ${sedeIds.size} sedes · ${empCount} empleados activos visibles`);
  for (const a of (misAsign ?? [])) {
    const sede = Array.isArray(a.sedes) ? a.sedes[0] : a.sedes;
    console.log(`    · ${a.jornada.padEnd(15)} @ ${sede?.nombre}`);
  }
}
