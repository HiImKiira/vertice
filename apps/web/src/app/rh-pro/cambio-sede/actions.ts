"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendPush } from "@/lib/push";

export type CambioResult =
  | { ok: true; afectados: number; mensaje: string }
  | { ok: false; error: string };

const JORNADAS_VALIDAS = new Set([
  "MATUTINO",
  "VESPERTINO",
  "NOCTURNO",
  "TURNO_ROTATIVO",
  "CUBRETURNOS",
  "DIURNO",
]);

export async function cambiarSedeEmpleadosAction(input: {
  empleadoIds: string[];
  nuevaSedeId: string;
  nuevaJornada?: string | undefined;
  motivo: string;
}): Promise<CambioResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" };
  const { data: perfil } = await supabase
    .from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["SUPERADMIN", "SOPORTE"].includes(perfil.rol)) {
    return { ok: false, error: "Solo SUPERADMIN o SOPORTE puede mover empleados entre sedes" };
  }

  if (!input.empleadoIds?.length) return { ok: false, error: "Selecciona al menos un empleado" };
  if (!input.nuevaSedeId) return { ok: false, error: "Falta sede destino" };
  if (!input.motivo?.trim()) return { ok: false, error: "El motivo es obligatorio (queda en auditoría)" };
  if (input.nuevaJornada && !JORNADAS_VALIDAS.has(input.nuevaJornada)) {
    return { ok: false, error: "Jornada inválida" };
  }

  const admin = supabaseAdmin();

  // Validar sede destino
  const { data: sedeDest } = await admin
    .from("sedes")
    .select("id, abrev, nombre")
    .eq("id", input.nuevaSedeId)
    .maybeSingle<{ id: string; abrev: string; nombre: string }>();
  if (!sedeDest) return { ok: false, error: "Sede destino no encontrada" };

  // Cargar empleados actuales (para log con valores anteriores)
  const { data: empsActuales } = await admin
    .from("empleados")
    .select("id, nombre, numero_empleado, sede_id, jornada, sedes(abrev, nombre)")
    .in("id", input.empleadoIds);

  if (!empsActuales || empsActuales.length === 0) {
    return { ok: false, error: "Empleados no encontrados" };
  }

  const motivo = input.motivo.trim().slice(0, 500);

  // Update masivo
  const patch: Record<string, unknown> = { sede_id: input.nuevaSedeId };
  if (input.nuevaJornada) patch.jornada = input.nuevaJornada;

  const { error: upErr, count } = await admin
    .from("empleados")
    .update(patch, { count: "exact" })
    .in("id", input.empleadoIds);
  if (upErr) return { ok: false, error: `Update: ${upErr.message}` };

  // Log de cada movimiento
  const movsToInsert = (empsActuales as Array<{
    id: string;
    sede_id: string;
    jornada: string;
    nombre: string;
  }>).map((e) => {
    const cambioSede = e.sede_id !== input.nuevaSedeId;
    const cambioJor = input.nuevaJornada && e.jornada !== input.nuevaJornada;
    const tipo = cambioSede && cambioJor ? "multi"
      : cambioSede ? "cambio_sede"
      : cambioJor ? "cambio_jornada"
      : "sin_cambio";
    return {
      empleado_id: e.id,
      tipo,
      sede_anterior: e.sede_id,
      sede_nueva: input.nuevaSedeId,
      jornada_anterior: e.jornada,
      jornada_nueva: input.nuevaJornada ?? e.jornada,
      motivo,
      efectuado_por: user.id,
    };
  }).filter((m) => m.tipo !== "sin_cambio");

  if (movsToInsert.length > 0) {
    const { error: logErr } = await admin.from("empleado_movimientos").insert(movsToInsert);
    if (logErr) console.error("[cambio-sede] log fail:", logErr.message);
  }

  // Notificar al supervisor receptor (los que tienen asignación a la sede+jornada destino)
  const jornadasParaNotificar = input.nuevaJornada
    ? [input.nuevaJornada]
    : [...new Set((empsActuales as Array<{ jornada: string }>).map((e) => e.jornada))];

  const { data: supersDest } = await admin
    .from("asignaciones_supervisor")
    .select("usuario_id, jornada, usuarios:usuario_id(nombre)")
    .eq("sede_id", input.nuevaSedeId)
    .eq("activo", true)
    .in("jornada", jornadasParaNotificar);

  const userIdsAfectados = [...new Set(
    (supersDest ?? []).map((s) => (s as { usuario_id: string }).usuario_id),
  )];

  if (userIdsAfectados.length > 0) {
    void sendPush(
      {
        title: `Vortex · ${count ?? 0} empleado(s) reasignado(s) a ${sedeDest.abrev}`,
        body: `RH movió empleados a ${sedeDest.nombre}. Motivo: ${motivo.slice(0, 80)}`,
        url: "/pase-lista",
        tag: `reasignacion-${input.nuevaSedeId}-${Date.now()}`,
        icon: "/icons/icon-192.png",
      },
      userIdsAfectados,
      "reasignacion_sede",
    ).catch((e) => console.error("[cambio-sede] push fail:", e));
  }

  revalidatePath("/rh-pro/cambio-sede");
  revalidatePath("/rh-pro/supervisores");
  revalidatePath("/rh-pro/consulta");

  return {
    ok: true,
    afectados: count ?? 0,
    mensaje: `${count ?? 0} empleado(s) reasignados a ${sedeDest.abrev}${input.nuevaJornada ? ` (jornada ${input.nuevaJornada})` : ""}. ${userIdsAfectados.length} supervisor(es) notificado(s).`,
  };
}
