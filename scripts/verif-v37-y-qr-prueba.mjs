// Verifica v37 (columnas + bucket) y crea un empleado de PRUEBA en XMK con
// token QR, para escanear y ver el flujo real sin tocar a nadie del padrón.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const env = Object.fromEntries(
  readFileSync("apps/web/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// 1) Columnas v37
const { error: colErr } = await sb.from("asistencias").select("hora_entrada, hora_salida, foto_entrada, foto_salida").limit(1);
console.log(colErr ? `✕ Columnas v37: ${colErr.message}` : "✓ Columnas v37 (hora_entrada/salida, foto_entrada/salida) OK");

// 2) Bucket
const { data: buckets } = await sb.storage.listBuckets();
const b = (buckets ?? []).find((x) => x.id === "asistencia-fotos");
console.log(b ? `✓ Bucket asistencia-fotos OK (público: ${b.public})` : "✕ Bucket asistencia-fotos NO existe");

// 3) Empleado de prueba en XMK con token
const { data: sede } = await sb.from("sedes").select("id, abrev").eq("abrev", "XMK").single();
let { data: emp } = await sb.from("empleados").select("id, numero_empleado, nombre, qr_token").eq("numero_empleado", "PRUEBA-QR").maybeSingle();
if (!emp) {
  const token = `VTX1.${randomBytes(16).toString("base64url")}`;
  const ins = await sb.from("empleados").insert({
    numero_empleado: "PRUEBA-QR", nombre: "PRUEBA QR (borrar al terminar)",
    sede_id: sede.id, jornada: "MATUTINO", dia_descanso: ["DOM"], qr_token: token,
  }).select("id, numero_empleado, nombre, qr_token").single();
  if (ins.error) { console.error("✕ Crear empleado prueba:", ins.error.message); process.exit(1); }
  emp = ins.data;
  console.log("✓ Empleado de prueba creado");
} else {
  if (!emp.qr_token) {
    const token = `VTX1.${randomBytes(16).toString("base64url")}`;
    await sb.from("empleados").update({ qr_token: token }).eq("id", emp.id);
    emp.qr_token = token;
  }
  console.log("✓ Empleado de prueba ya existía (reutilizado)");
}
console.log("\nTOKEN:", emp.qr_token);
