#!/usr/bin/env node
/**
 * Sincroniza asignaciones_supervisor con la versión LIVE del Sheet legacy.
 * Lee ASIGNACIONES_SUP del xlsx descargado (Asistencias_LATEST.xlsx),
 * mapea USERNAME → usuario_id de Supabase, SEDE (nombre) → sede_id,
 * y hace:
 *   1. UPSERT de cada (usuario_id, sede_id, jornada) con activo=true
 *   2. Reporta cuáles no se pudieron mapear
 *
 * No borra asignaciones existentes que no estén en el xlsx (preserva edits manuales).
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

console.log(`📖 Leyendo ${XLSX_PATH}...`);
const wb = XLSX.readFile(XLSX_PATH);
const ws = wb.Sheets["ASIGNACIONES_SUP"];
if (!ws) throw new Error("Sheet ASIGNACIONES_SUP no encontrada");
const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
const activos = rows.filter((r) => String(r.ACTIVO || "").toUpperCase() === "SI");
console.log(`  · ${rows.length} filas totales, ${activos.length} activas`);

console.log("\n🔎 Cargando catálogos de Supabase...");
const [{ data: usuarios }, { data: sedes }] = await Promise.all([
  sb.from("usuarios").select("id, username, email"),
  sb.from("sedes").select("id, nombre, codigo, abrev"),
]);

// Index usuarios por múltiples claves (username + email)
const userIndex = new Map();
for (const u of usuarios) {
  userIndex.set(u.username.toLowerCase().trim(), u.id);
  userIndex.set(u.username.trim(), u.id);
  if (u.email) userIndex.set(u.email.toLowerCase().trim(), u.id);
}
console.log(`  · ${usuarios.length} usuarios, ${userIndex.size} aliases`);

// Index sedes por nombre completo (que es lo que viene en el xlsx)
const sedeIndex = new Map();
for (const s of sedes) {
  sedeIndex.set(s.nombre.toUpperCase().trim(), s.id);
  sedeIndex.set(s.codigo.toUpperCase().trim(), s.id);
}
console.log(`  · ${sedes.length} sedes`);

// Procesar filas
const toUpsert = [];
const skipped = { usuario: [], sede: [], jornada: [] };
for (const r of activos) {
  const usernameRaw = String(r.USERNAME || "").trim();
  const sedeRaw = String(r.SEDE || "").toUpperCase().trim();
  const jornadaRaw = String(r.JORNADA || "").toUpperCase().trim();

  const usuario_id =
    userIndex.get(usernameRaw.toLowerCase()) ??
    userIndex.get(usernameRaw) ??
    null;
  const sede_id = sedeIndex.get(sedeRaw) ?? null;
  const jornada = JORNADA_MAP[jornadaRaw] ?? null;

  if (!usuario_id) { skipped.usuario.push(usernameRaw); continue; }
  if (!sede_id)    { skipped.sede.push(sedeRaw); continue; }
  if (!jornada)    { skipped.jornada.push(jornadaRaw); continue; }

  toUpsert.push({ usuario_id, sede_id, jornada, activo: true });
}

console.log(`\n📊 Listas para upsert: ${toUpsert.length}`);
if (skipped.usuario.length) console.log(`  ⚠ ${skipped.usuario.length} usuarios no mapeados:`, [...new Set(skipped.usuario)].join(", "));
if (skipped.sede.length)    console.log(`  ⚠ ${skipped.sede.length} sedes no mapeadas:`,    [...new Set(skipped.sede)].join(", "));
if (skipped.jornada.length) console.log(`  ⚠ ${skipped.jornada.length} jornadas raras:`,    [...new Set(skipped.jornada)].join(", "));

if (process.argv.includes("--dry-run")) {
  console.log("\n🚫 DRY RUN — nada se escribe.");
  process.exit(0);
}

console.log("\n📤 Upsert en chunks de 100...");
const chunk = 100;
let ok = 0, fail = 0;
for (let i = 0; i < toUpsert.length; i += chunk) {
  const slice = toUpsert.slice(i, i + chunk);
  const { error } = await sb
    .from("asignaciones_supervisor")
    .upsert(slice, { onConflict: "usuario_id,sede_id,jornada" });
  if (error) {
    fail += slice.length;
    console.log(`  ❌ ${error.message}`);
  } else {
    ok += slice.length;
  }
}
console.log(`\n✓ ${ok} upserted / ${fail} failed`);

// Resumen final por supervisor
console.log("\n=== Resumen post-sync ===");
const { data: post } = await sb
  .from("asignaciones_supervisor")
  .select("usuario_id, usuarios(username, nombre)")
  .eq("activo", true);
const porUsuario = new Map();
for (const a of post) {
  const u = Array.isArray(a.usuarios) ? a.usuarios[0] : a.usuarios;
  if (!u) continue;
  porUsuario.set(u.username, (porUsuario.get(u.username) || 0) + 1);
}
const sorted = [...porUsuario.entries()].sort((a, b) => b[1] - a[1]);
for (const [user, n] of sorted) console.log(`  ${n.toString().padStart(3)} × ${user}`);
console.log(`\nTotal: ${post.length} asignaciones activas, ${porUsuario.size} supervisores con asignaciones.`);
