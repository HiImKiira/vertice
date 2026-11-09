// Reset de pruebas QR: borra TODAS las asistencias de la sede XMK (única con
// QR habilitado — todas sus marcas son de pruebas del escáner) para empezar
// de cero. Reporta también las bajas hechas por QR. Uso:
//   node scripts/reset-asistencias-qr.mjs            → solo muestra (dry run)
//   node scripts/reset-asistencias-qr.mjs --borrar   → borra de verdad
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync("apps/web/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const borrar = process.argv.includes("--borrar");

const { data: sede } = await sb.from("sedes").select("id, abrev").eq("abrev", "XMK").single();
const { data: emps } = await sb.from("empleados").select("id, numero_empleado, nombre, fecha_baja, motivo_baja").eq("sede_id", sede.id);
const ids = (emps ?? []).map((e) => e.id);

const { data: marcas } = await sb.from("asistencias")
  .select("id, empleado_id, fecha, codigo, capturado_por")
  .in("empleado_id", ids);

const porFecha = new Map();
for (const m of marcas ?? []) porFecha.set(m.fecha, (porFecha.get(m.fecha) ?? 0) + 1);
console.log(`Asistencias en XMK: ${marcas?.length ?? 0}`);
for (const [f, n] of [...porFecha.entries()].sort()) console.log(`  · ${f}: ${n}`);

const bajasQR = (emps ?? []).filter((e) => e.motivo_baja === "Baja por QR (evento)");
console.log(`\nBajas hechas por QR: ${bajasQR.length}`);
for (const b of bajasQR) console.log(`  · #${b.numero_empleado} ${b.nombre} (baja ${b.fecha_baja})`);

if (!borrar) { console.log("\n(dry run — nada borrado; corre con --borrar para ejecutar)"); process.exit(0); }

if (marcas?.length) {
  const { error, count } = await sb.from("asistencias")
    .delete({ count: "exact" })
    .in("empleado_id", ids);
  if (error) { console.error("✕ Error al borrar:", error.message); process.exit(1); }
  console.log(`\n✓ BORRADAS ${count} asistencias de XMK — pase en ceros, listo para probar`);
} else {
  console.log("\nNo había asistencias que borrar.");
}
