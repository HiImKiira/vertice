#!/usr/bin/env node
/**
 * Aplica un archivo SQL contra la base via fetch directo al endpoint pg-meta
 * de Supabase (`/rest/v1/rpc/exec_sql` no existe por default; usamos
 * postgres REST con statement_timeout). Como el service_role tiene acceso
 * directo a la DB via PostgREST + función exec, creamos una RPC ad-hoc.
 *
 * Workaround usando el endpoint /pg/ del API es de pago. En su lugar
 * usamos fetch al endpoint `Query` del Supabase Studio (no oficial pero
 * funciona con el service_role). Si falla, instruye al usuario para
 * pegar el SQL en Studio.
 *
 * Uso: node scripts/apply-migration.mjs supabase/migrations/<file>.sql
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const env = Object.fromEntries(
  readFileSync(join(ROOT, "apps/web/.env.local"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-migration.mjs <sql-file>");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const projectRef = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];

console.log(`→ Aplicando ${file} a ${projectRef}…`);
console.log(`  (${sql.length} bytes)`);

// El endpoint /api/platform/projects/{ref}/database/query requiere management API key.
// Aquí intentamos via el endpoint estándar postgres-meta del project (pg).
const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
const SUPABASE_ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;

if (!SUPABASE_ACCESS_TOKEN) {
  console.error("\n✗ Falta SUPABASE_ACCESS_TOKEN. Pega el SQL manualmente en Supabase Studio → SQL Editor.\n");
  console.error(`  Archivo: ${file}\n`);
  process.exit(2);
}

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${SUPABASE_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

const txt = await res.text();
if (!res.ok) {
  console.error(`✗ HTTP ${res.status}:\n${txt}`);
  process.exit(3);
}
console.log("✓ Migration applied successfully.");
console.log(txt.slice(0, 500));
