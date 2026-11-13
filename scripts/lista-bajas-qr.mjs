// Lista las bajas hechas por QR (modo baja del escáner) en XMK, con hora y quién.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync("apps/web/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: bajas } = await sb.from("empleados")
  .select("numero_empleado, nombre, jornada, fecha_baja, baja_ts, baja_capturado_por")
  .eq("motivo_baja", "Baja por QR (evento)")
  .order("baja_ts");
if (!bajas?.length) { console.log("Sin bajas por QR."); process.exit(0); }

const uids = [...new Set(bajas.map((b) => b.baja_capturado_por).filter(Boolean))];
const { data: users } = await sb.from("usuarios").select("id, nombre").in("id", uids);
const quien = (id) => (users ?? []).find((u) => u.id === id)?.nombre ?? "?";

console.log(`BAJAS POR QR: ${bajas.length}\n`);
for (const b of bajas) {
  const hora = b.baja_ts
    ? new Date(b.baja_ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Merida" })
    : "—";
  console.log(`  #${b.numero_empleado}  ${b.nombre}  · ${b.jornada} · ${b.fecha_baja} ${hora} · por ${quien(b.baja_capturado_por)}`);
}
