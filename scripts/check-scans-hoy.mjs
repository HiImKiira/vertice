// Lectura: ¿cuántas asistencias de HOY tiene XMK y quién las capturó?
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync("apps/web/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const d = new Date(); d.setHours(d.getHours() - 6);
const hoy = d.toISOString().slice(0, 10);

const { data: sede } = await sb.from("sedes").select("id, abrev, geo_lat, geo_lng, geo_radio_m, qr_habilitado").eq("abrev", "XMK").single();
console.log("Sede XMK:", JSON.stringify({ qr: sede.qr_habilitado, geo: sede.geo_lat != null ? `${sede.geo_lat},${sede.geo_lng} r=${sede.geo_radio_m}m` : "sin geocerca" }));

const { data: emps } = await sb.from("empleados").select("id, numero_empleado, nombre").eq("sede_id", sede.id);
const ids = (emps ?? []).map((e) => e.id);
const { data: marcas } = await sb.from("asistencias")
  .select("empleado_id, codigo, creado_en, capturado_por")
  .eq("fecha", hoy).in("empleado_id", ids);
console.log(`Asistencias de HOY (${hoy}) en XMK: ${marcas?.length ?? 0}`);
if (marcas?.length) {
  const porCaptor = new Map();
  for (const m of marcas) porCaptor.set(m.capturado_por, (porCaptor.get(m.capturado_por) ?? 0) + 1);
  const { data: users } = await sb.from("usuarios").select("id, nombre, rol").in("id", [...porCaptor.keys()]);
  for (const [uid, n] of porCaptor) {
    const u = (users ?? []).find((x) => x.id === uid);
    console.log(`  · ${u?.nombre ?? uid} (${u?.rol ?? "?"}): ${n} marca(s)`);
  }
  const empMap = new Map((emps ?? []).map((e) => [e.id, e]));
  for (const m of marcas.slice(0, 8)) {
    const e = empMap.get(m.empleado_id);
    console.log(`    #${e?.numero_empleado} ${e?.nombre} → ${m.codigo} @ ${m.creado_en}`);
  }
}
