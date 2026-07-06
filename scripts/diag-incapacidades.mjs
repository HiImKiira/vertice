#!/usr/bin/env node
/**
 * Diagnóstico del Supabase de Vortex vía service role:
 *  - ¿Existe el bucket "incapacidades"?
 *  - ¿Existen las tablas del flujo?
 *  - Prueba de upload real (para ver el error exacto).
 *  - Estado de migraciones clave (DL en enum, columnas de descanso).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", "apps/web/.env.local"), "utf8")
    .split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
console.log("Proyecto:", url);
const sb = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  // 1) Buckets
  const { data: buckets, error: bErr } = await sb.storage.listBuckets();
  if (bErr) console.log("listBuckets ERROR:", bErr.message);
  else console.log("Buckets:", buckets.map((b) => `${b.id}(public=${b.public})`).join(", ") || "(ninguno)");
  const tieneBucket = (buckets ?? []).some((b) => b.id === "incapacidades");
  console.log("¿bucket incapacidades?:", tieneBucket);

  // 2) Tablas
  for (const t of ["incapacidades", "incapacidad_documentos", "incapacidad_eventos"]) {
    const { error } = await sb.from(t).select("id", { count: "exact", head: true });
    console.log(`tabla ${t}:`, error ? `FALTA/err (${error.message})` : "OK");
  }

  // 3) Prueba de upload real
  if (tieneBucket) {
    const testPath = `__diag/test_${Date.now()}.txt`;
    const { error: upErr } = await sb.storage.from("incapacidades").upload(testPath, Buffer.from("diag"), { contentType: "text/plain", upsert: true });
    console.log("upload test:", upErr ? `FALLA (${upErr.message})` : "OK");
    if (!upErr) await sb.storage.from("incapacidades").remove([testPath]).catch(() => {});
  }

  // 4) Migraciones clave
  const { error: dlErr } = await sb.from("asistencias").select("id", { head: true, count: "exact" }).eq("codigo", "DL").limit(1);
  console.log("enum DL disponible:", dlErr ? `NO (${dlErr.message})` : "SÍ");

  const { error: movErr } = await sb.from("empleado_movimientos").select("dia_descanso_nuevo", { head: true }).limit(1);
  console.log("columna dia_descanso_nuevo (v27):", movErr ? `NO (${movErr.message})` : "SÍ");

  const { error: rpcErr } = await sb.rpc("bitacora_cambios_descanso", { p_limite: 1 });
  console.log("RPC bitacora_cambios_descanso (v27):", rpcErr ? `NO (${rpcErr.message})` : "SÍ");
}
main().catch((e) => console.error("FATAL:", e.message));
