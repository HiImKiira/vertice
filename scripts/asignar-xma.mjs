// Asigna al usuario "xma" la sede XMK en MATUTINO/VESPERTINO/EVENTUAL
// (designación Captura XMA) — mismo efecto que el toggle del centro de
// supervisores. Idempotente.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync("apps/web/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: user } = await sb.from("usuarios").select("id, nombre").eq("username", "xma").single();
const { data: sede } = await sb.from("sedes").select("id, abrev").eq("abrev", "XMK").single();
for (const jornada of ["MATUTINO", "VESPERTINO", "EVENTUAL"]) {
  const { data: ya } = await sb.from("asignaciones_supervisor")
    .select("id, activo").eq("usuario_id", user.id).eq("sede_id", sede.id).eq("jornada", jornada).maybeSingle();
  if (ya) {
    if (!ya.activo) await sb.from("asignaciones_supervisor").update({ activo: true }).eq("id", ya.id);
    console.log(`✓ ${jornada}: ya existía${ya.activo ? "" : " (reactivada)"}`);
  } else {
    const { error } = await sb.from("asignaciones_supervisor").insert({ usuario_id: user.id, sede_id: sede.id, jornada, activo: true });
    console.log(error ? `✕ ${jornada}: ${error.message}` : `✓ ${jornada}: asignada`);
  }
}
const { data: check } = await sb.from("asignaciones_supervisor")
  .select("jornada").eq("usuario_id", user.id).eq("sede_id", sede.id).eq("activo", true);
console.log(`\nXma queda con XMK: ${(check ?? []).map((a) => a.jornada).join(", ")}`);
