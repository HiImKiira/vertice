#!/usr/bin/env node
/**
 * Restaura las contraseñas originales del xlsx USUARIOS.
 * Para las de <6 chars (Supabase rechaza) las padea con sufijo "vrt".
 *
 * Output: legacy-data/credenciales-originales.csv (gitignored).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const XLSX_PATH = "C:/Users/edyme/Downloads/Asistencias V4.xlsx";
const MIN_LEN = 6;
const PAD = "vrt";

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
const usuarios = XLSX.utils.sheet_to_json(wb.Sheets.USUARIOS, { defval: null });

console.log(`Procesando ${usuarios.length} usuarios del xlsx...\n`);

const csvRows = ["username,email,full_name,role,password,padded"];

for (const u of usuarios) {
  const username = String(u.USERNAME || "").trim();
  if (!username) continue;
  const originalPwd = String(u.PASSWORD || "").trim();
  const padded = originalPwd.length < MIN_LEN;
  const finalPwd = padded ? originalPwd + PAD : originalPwd;

  // Buscar usuario en Supabase por username
  const { data: prof, error: pErr } = await sb
    .from("usuarios")
    .select("id, email, nombre, rol")
    .ilike("username", username)
    .single();
  if (pErr || !prof) {
    console.log(`  ❌ ${username.padEnd(28)} → no existe en DB`);
    continue;
  }

  const { error: uErr } = await sb.auth.admin.updateUserById(prof.id, { password: finalPwd });
  if (uErr) {
    console.log(`  ❌ ${username.padEnd(28)} → ${uErr.message}`);
    continue;
  }

  const padNote = padded ? ` (padded de "${originalPwd}")` : "";
  console.log(`  ✅ ${username.padEnd(28)} ${prof.rol.padEnd(11)} pwd: ${finalPwd}${padNote}`);

  csvRows.push(`"${username}","${prof.email}","${prof.nombre}","${prof.rol}","${finalPwd}","${padded ? "yes" : "no"}"`);
}

const dir = join(ROOT, "legacy-data");
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const outPath = join(dir, "credenciales-originales.csv");
writeFileSync(outPath, csvRows.join("\n"), "utf8");

console.log(`\n📋 Guardado en: ${outPath}`);
console.log(`\nRegla del padding: <${MIN_LEN} chars → original + "${PAD}".`);
console.log(`Para usar las pwds originales sin padding, baja en Supabase Dashboard:`);
console.log(`  Authentication > Policies > Password requirements > Min length: 4`);
console.log(`Luego corre este script otra vez.`);
