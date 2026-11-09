// Reactiva a los trabajadores dados de baja EN PRUEBAS por el modo baja del
// escáner: solo los que tienen motivo_baja = 'Baja por QR (evento)' y la baja
// es de HOY. Limpia fecha/motivo/auditoría de baja y restaura su status al de
// los activos. Dry run por default; --revertir para ejecutar.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync("apps/web/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ejecutar = process.argv.includes("--revertir");
const d = new Date(); d.setHours(d.getHours() - 6);
const hoy = d.toISOString().slice(0, 10);

// Status que usan los activos (para restaurarlo igual)
const { data: activos } = await sb.from("empleados").select("status").is("fecha_baja", null).limit(5);
const statusActivo = activos?.[0]?.status ?? "ACTIVO";

const { data: bajas } = await sb.from("empleados")
  .select("id, numero_empleado, nombre, fecha_baja")
  .eq("motivo_baja", "Baja por QR (evento)")
  .eq("fecha_baja", hoy);
console.log(`Bajas de prueba por QR (de hoy ${hoy}): ${bajas?.length ?? 0} · status a restaurar: ${JSON.stringify(statusActivo)}`);
for (const b of bajas ?? []) console.log(`  · #${b.numero_empleado} ${b.nombre}`);

if (!ejecutar) { console.log("\n(dry run — corre con --revertir para reactivarlos)"); process.exit(0); }

let ok = 0;
for (const b of bajas ?? []) {
  const { error } = await sb.from("empleados").update({
    fecha_baja: null, motivo_baja: null, baja_capturado_por: null, baja_ts: null, status: statusActivo,
  }).eq("id", b.id);
  if (error) console.error(`✕ #${b.numero_empleado}: ${error.message}`);
  else ok++;
  // Quitar la nota de baja del contrato (era de prueba)
  await sb.from("contratos")
    .update({ observaciones: null })
    .eq("empleado_id", b.id)
    .like("observaciones", "%Baja por QR (evento)%");
}
console.log(`\n✓ Reactivados ${ok}/${bajas?.length ?? 0} — vuelven al padrón activo de XMK`);
