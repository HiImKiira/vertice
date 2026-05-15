#!/usr/bin/env node
/**
 * Vértice — import del Excel legacy "Asistencias V4.xlsx" a Supabase.
 *
 * Lee del workbook:
 *   - CONTRATOS_2026 → empleados + sedes (deducidas de los SEDE únicos)
 *   - USUARIOS       → auth.users + usuarios
 *   - ASIGNACIONES_SUP → asignaciones_supervisor
 *
 * Salida:
 *   - rows insertados en Supabase
 *   - `legacy-data/imported-credentials.csv` (gitignored) con las contraseñas
 *     temporales generadas para los 13 usuarios. Compártelas con tu equipo
 *     y diles que cambien la suya en el primer login.
 *
 * Variables de entorno requeridas (lee `apps/web/.env.local`):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso:
 *   node scripts/import-legacy.mjs [--dry-run]
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const XLSX_PATH = "C:/Users/edyme/Downloads/Asistencias V4.xlsx";

// ------------------------------------------------------------
// Env loading
// ------------------------------------------------------------
function loadEnv() {
  const envPath = join(ROOT, "apps/web/.env.local");
  if (!existsSync(envPath)) {
    throw new Error("Falta apps/web/.env.local — copia .env.example y pon credenciales.");
  }
  const txt = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const dryRun = process.argv.includes("--dry-run");

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local");
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ------------------------------------------------------------
// Lectura del Excel
// ------------------------------------------------------------
console.log(`📖 Leyendo ${XLSX_PATH} ...`);
const wb = XLSX.readFile(XLSX_PATH, { cellDates: false });

function readSheet(name) {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`No existe la hoja "${name}"`);
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

const contratos = readSheet("CONTRATOS_2026");
const usuariosRaw = readSheet("USUARIOS");
const asignacionesRaw = readSheet("ASIGNACIONES_SUP");

console.log(`  · ${contratos.length} contratos`);
console.log(`  · ${usuariosRaw.length} usuarios`);
console.log(`  · ${asignacionesRaw.length} asignaciones`);

// ------------------------------------------------------------
// Mapeos / normalizaciones
// ------------------------------------------------------------

// Map JORNADA del xlsx → enum jornada de Postgres
const JORNADA_MAP = {
  MATUTINO: "MATUTINO",
  VESPERTINO: "VESPERTINO",
  VESPERTNO: "VESPERTINO", // typo en xlsx
  NOCTURNO: "NOCTURNO",
  "TURNO ROTATIVO": "TURNO_ROTATIVO",
  CUBRETURNOS: "CUBRETURNOS",
  DIURNO: "DIURNO",
};

// Map de día único → enum dia_semana (siempre MAYÚSCULAS)
const DIA_MAP = {
  LUNES: "LUN",
  MARTES: "MAR",
  MIERCOLES: "MIE",
  "MIÉRCOLES": "MIE",
  JUEVES: "JUE",
  VIERNES: "VIE",
  SABADO: "SAB",
  "SÁBADO": "SAB",
  DOMINGO: "DOM",
};

function parseDiaDescanso(raw) {
  if (!raw) return ["DOM"];
  const txt = String(raw).toUpperCase().trim();
  // "SABADO Y DOMINGO" / "SABADO,DOMINGO" / "SAB Y DOM"
  const parts = txt.split(/\s*(?:Y|,|\+|\/)\s*/).map((s) => s.trim()).filter(Boolean);
  const dias = [];
  for (const p of parts) {
    if (DIA_MAP[p]) dias.push(DIA_MAP[p]);
  }
  return dias.length ? dias : ["DOM"];
}

function generateAbrev(sedeName, existing) {
  // Excluye palabras de relleno
  const stop = new Set(["DE", "LA", "EL", "LOS", "LAS", "DEL", "Y", "EN", "POR"]);
  const words = String(sedeName)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/\s+/)
    .filter((w) => w && !stop.has(w));
  // Toma 1ª letra de cada palabra significativa, máximo 5
  let abrev = words.slice(0, 5).map((w) => w[0]).join("");
  // Si quedó muy cortita, rellena con letras de la primera palabra
  if (abrev.length < 3 && words[0]) {
    abrev = (abrev + words[0].slice(1)).slice(0, 4);
  }
  // Resolver colisiones agregando primera letra de la siguiente palabra significativa
  let candidate = abrev;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${abrev}${suffix}`;
    suffix++;
  }
  return candidate;
}

function randomPassword(len = 12) {
  // Mix mayúsculas, minúsculas y dígitos. Sin chars ambiguos (0/O/1/l).
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function emailFor(username) {
  const trimmed = String(username).trim();
  if (/@/.test(trimmed)) return trimmed.toLowerCase();
  const sanitized = trimmed.toLowerCase().replace(/[^a-z0-9_.-]/g, ".");
  return `${sanitized}@vertice.mhs.local`;
}

// ------------------------------------------------------------
// 1) Sedes — deduplicar de CONTRATOS_2026
// ------------------------------------------------------------
console.log("\n🏢 Procesando sedes...");
const sedesUnicas = new Map(); // nombre → { codigo, nombre }
for (const c of contratos) {
  const nombre = String(c.SEDE || "").trim();
  if (!nombre) continue;
  if (!sedesUnicas.has(nombre)) {
    sedesUnicas.set(nombre, { nombre });
  }
}

const sedesRows = [];
const abrevs = new Set(["CEN", "NOR", "SUR"]); // ya existentes
for (const [nombre, _] of sedesUnicas) {
  const codigo = nombre.toUpperCase();
  const abrev = generateAbrev(nombre, abrevs);
  abrevs.add(abrev);
  sedesRows.push({ codigo, abrev, nombre });
}
console.log(`  · ${sedesRows.length} sedes únicas detectadas. Ejemplos:`);
sedesRows.slice(0, 5).forEach((s) => console.log(`    - ${s.abrev.padEnd(6)} ${s.nombre}`));

// ------------------------------------------------------------
// 2) Empleados
// ------------------------------------------------------------
console.log("\n👥 Procesando empleados...");
function parseExcelDate(v) {
  if (v == null || v === "") return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (typeof v === "number") {
    // Excel serial → JS date
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

const empleadosRows = contratos
  .filter((c) => c.ID && c.NOMBRE_TRABAJADOR && c.SEDE)
  .map((c) => {
    const jornadaRaw = String(c.JORNADA || "").trim().toUpperCase();
    const jornada = JORNADA_MAP[jornadaRaw] || "MATUTINO";
    const dia_descanso = parseDiaDescanso(c.DIA_DESCANSO);
    const status_raw = String(c.STATUS_TRABAJADOR || "ACTIVO").trim().toUpperCase();
    const status = ["ACTIVO", "BAJA", "SUSPENDIDO", "PERIODO_PRUEBA"].includes(status_raw) ? status_raw : "ACTIVO";
    return {
      numero_empleado: String(c.ID).trim(),
      nombre: String(c.NOMBRE_TRABAJADOR).trim(),
      _sede_nombre: String(c.SEDE).trim(), // resolveremos a sede_id después
      jornada,
      dia_descanso,
      salario_diario: 315.04,
      segmento_original: c.SEGMENTO_ORIGINAL ? String(c.SEGMENTO_ORIGINAL).trim() : null,
      status,
      fecha_baja: parseExcelDate(c.FECHA_BAJA),
      motivo_baja: c.MOTIVO_BAJA ? String(c.MOTIVO_BAJA).trim() : null,
    };
  });
console.log(`  · ${empleadosRows.length} empleados a importar`);

// ------------------------------------------------------------
// 3) Usuarios + asignaciones
// ------------------------------------------------------------
console.log("\n🔐 Procesando usuarios...");
const ROLE_MAP = { USER: "USER", ADMIN: "ADMIN", SUPERADMIN: "SUPERADMIN", SOPORTE: "SOPORTE", CEO: "CEO" };

const usuariosRows = usuariosRaw
  .filter((u) => u.USERNAME && u.ACTIVE !== false)
  .map((u) => {
    const username = String(u.USERNAME).trim();
    const email = emailFor(username);
    const role = ROLE_MAP[String(u.ROLE).trim().toUpperCase()] || "USER";
    return {
      username,
      email,
      nombre: String(u.FULL_NAME || username).trim(),
      rol: role,
      tempPassword: randomPassword(12),
    };
  });
console.log(`  · ${usuariosRows.length} usuarios activos`);

const asignacionesRows = asignacionesRaw
  .filter((a) => a.USERNAME && a.SEDE && String(a.ACTIVO || "").toUpperCase() === "SI")
  .map((a) => ({
    _username: String(a.USERNAME).trim(),
    _sede_nombre: String(a.SEDE).trim(),
    jornada: JORNADA_MAP[String(a.JORNADA || "").trim().toUpperCase()] || "MATUTINO",
  }));
console.log(`  · ${asignacionesRows.length} asignaciones activas`);

// ------------------------------------------------------------
// Dry run: imprimir resumen y salir
// ------------------------------------------------------------
if (dryRun) {
  console.log("\n--- DRY RUN — nada se escribe en Supabase ---");
  console.log("Sedes a crear:", sedesRows.length);
  console.log("Empleados a crear:", empleadosRows.length);
  console.log("Usuarios a crear:", usuariosRows.length);
  console.log("Asignaciones a crear:", asignacionesRows.length);
  process.exit(0);
}

// ------------------------------------------------------------
// EJECUTAR EL IMPORT
// ------------------------------------------------------------
async function upsertSedes() {
  console.log("\n📤 Upserting sedes...");
  const { data, error } = await sb
    .from("sedes")
    .upsert(sedesRows, { onConflict: "codigo" })
    .select("id, codigo, abrev");
  if (error) throw error;
  const map = new Map();
  for (const s of data) map.set(s.codigo, s.id);
  // También las 3 seed iniciales si no están
  const { data: extra } = await sb.from("sedes").select("id, codigo");
  for (const s of extra || []) map.set(s.codigo, s.id);
  console.log(`  ✓ ${data.length} sedes upserted (${map.size} total en DB)`);
  return map;
}

async function insertEmpleados(sedesMap) {
  console.log("\n📤 Insertando empleados...");
  // Resolver sede_id usando codigo (que es el SEDE en mayúsculas)
  const toInsert = empleadosRows.map((e) => {
    const sede_id = sedesMap.get(e._sede_nombre.toUpperCase());
    if (!sede_id) throw new Error(`No mapeé sede: ${e._sede_nombre}`);
    const { _sede_nombre, ...rest } = e;
    return { ...rest, sede_id };
  });
  // Insert en chunks de 100 para no exceder limit
  const chunkSize = 100;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    const { error } = await sb.from("empleados").upsert(chunk, { onConflict: "numero_empleado" });
    if (error) throw error;
    inserted += chunk.length;
    process.stdout.write(`\r  ${inserted}/${toInsert.length}`);
  }
  console.log(`\n  ✓ ${inserted} empleados`);
}

async function createUsersAndProfiles(sedesMap) {
  console.log("\n📤 Creando usuarios (auth + perfil)...");
  const usernameToUid = new Map();
  for (const u of usuariosRows) {
    const { data, error } = await sb.auth.admin.createUser({
      email: u.email,
      password: u.tempPassword,
      email_confirm: true,
      user_metadata: { full_name: u.nombre, username: u.username, legacy_import: true },
    });
    if (error) {
      // si ya existe, intentar leerlo
      if (String(error.message).toLowerCase().includes("already")) {
        const { data: list } = await sb.auth.admin.listUsers();
        const found = (list?.users || []).find((x) => x.email === u.email);
        if (found) {
          usernameToUid.set(u.username, found.id);
          continue;
        }
      }
      throw new Error(`createUser ${u.email}: ${error.message}`);
    }
    usernameToUid.set(u.username, data.user.id);
  }
  // Insertar perfiles en `usuarios`
  const profiles = usuariosRows.map((u) => ({
    id: usernameToUid.get(u.username),
    email: u.email,
    username: u.username,
    nombre: u.nombre,
    rol: u.rol,
    activo: true,
  }));
  const { error: pErr } = await sb.from("usuarios").upsert(profiles, { onConflict: "id" });
  if (pErr) throw pErr;
  console.log(`  ✓ ${profiles.length} usuarios creados`);
  return usernameToUid;
}

async function insertAsignaciones(sedesMap, usernameToUid) {
  console.log("\n📤 Insertando asignaciones supervisor...");
  const toInsert = [];
  let skipped = 0;
  for (const a of asignacionesRows) {
    const usuario_id = usernameToUid.get(a._username);
    const sede_id = sedesMap.get(a._sede_nombre.toUpperCase());
    if (!usuario_id || !sede_id) {
      skipped++;
      continue;
    }
    toInsert.push({ usuario_id, sede_id, jornada: a.jornada, activo: true });
  }
  const { error } = await sb.from("asignaciones_supervisor").upsert(toInsert, {
    onConflict: "usuario_id,sede_id,jornada",
  });
  if (error) throw error;
  console.log(`  ✓ ${toInsert.length} asignaciones, ${skipped} skipped (usuario/sede no encontrado)`);
}

function writeCredentialsCSV() {
  const dir = join(ROOT, "legacy-data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const csv = [
    "username,email,full_name,role,temp_password",
    ...usuariosRows.map((u) =>
      [u.username, u.email, u.nombre, u.rol, u.tempPassword].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
    ),
  ].join("\n");
  const path = join(dir, "imported-credentials.csv");
  writeFileSync(path, csv, "utf8");
  console.log(`\n📋 Credenciales guardadas: ${path}`);
  console.log("    ⚠️  ESTE ARCHIVO ESTÁ GITIGNORED. Compártelo solo por canal seguro.");
}

// MAIN
try {
  const sedesMap = await upsertSedes();
  await insertEmpleados(sedesMap);
  const usernameToUid = await createUsersAndProfiles(sedesMap);
  await insertAsignaciones(sedesMap, usernameToUid);
  writeCredentialsCSV();
  console.log("\n✅ IMPORT COMPLETO");
} catch (e) {
  console.error("\n❌ ERROR:", e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
}
