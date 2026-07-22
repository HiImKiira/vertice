"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifyAdminLike } from "@/lib/push";
import { coberturaQuincena, seEsperaEseDia } from "@/lib/quincena";
import { CODIGOS, type CodigoAsistencia } from "@vertice/shared/codes";

export interface FaltanteRow {
  id: string;
  numero_empleado: string;
  nombre: string;
  jornada: string;
  sede_abrev: string;
}

export type DetalleDiaResult =
  | {
      ok: true;
      fecha: string;
      faltantes: FaltanteRow[];
      esperados: number;
      capturados: number;
      abierta: boolean;      // ¿se puede capturar hoy esa fecha?
      motivoCierre: string;  // texto para el usuario si está cerrada
    }
  | { ok: false; error: string };

/** Sedes×jornadas activas del supervisor. */
async function combosDe(sb: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  const { data } = await sb
    .from("asignaciones_supervisor")
    .select("sede_id, jornada")
    .eq("usuario_id", userId)
    .eq("activo", true);
  return (data ?? []) as Array<{ sede_id: string; jornada: string }>;
}

/**
 * Detalle de un día de la quincena: quiénes faltan por marcar y si la fecha
 * sigue abierta para capturar. Permite completar el día sin salir del módulo.
 */
export async function detalleDiaAction(fecha: string): Promise<DetalleDiaResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha inválida" };

  const pares = await combosDe(supabase, user.id);
  if (pares.length === 0) return { ok: false, error: "No tienes sedes asignadas" };
  const comboOk = new Set(pares.map((a) => `${a.sede_id}|${a.jornada}`));

  const { data: empsRaw } = await supabase
    .from("empleados")
    .select("id, numero_empleado, nombre, sede_id, jornada, fecha_alta, fecha_baja, sedes(abrev)")
    .in("sede_id", [...new Set(pares.map((a) => a.sede_id))])
    .in("jornada", [...new Set(pares.map((a) => a.jornada))])
    .order("nombre");

  const delSupervisor = ((empsRaw ?? []) as Array<{
    id: string; numero_empleado: string; nombre: string; sede_id: string; jornada: string;
    fecha_alta: string | null; fecha_baja: string | null;
    sedes: { abrev: string } | { abrev: string }[] | null;
  }>).filter((e) => comboOk.has(`${e.sede_id}|${e.jornada}`));

  const { data: marcas } = await supabase
    .from("asistencias")
    .select("empleado_id")
    .eq("fecha", fecha)
    .in("empleado_id", delSupervisor.map((e) => e.id));
  const yaMarcados = new Set(((marcas ?? []) as Array<{ empleado_id: string }>).map((m) => m.empleado_id));

  // Misma regla que la rejilla: no se exige marca el día del alta (RH la
  // captura un día antes de que entren), ni a quien ya estaba de baja.
  const empleados = delSupervisor.filter((e) => seEsperaEseDia(e, fecha, yaMarcados));

  const faltantes: FaltanteRow[] = empleados
    .filter((e) => !yaMarcados.has(e.id))
    .map((e) => {
      const s = Array.isArray(e.sedes) ? e.sedes[0] : e.sedes;
      return {
        id: e.id,
        numero_empleado: e.numero_empleado,
        nombre: e.nombre,
        jornada: e.jornada,
        sede_abrev: s?.abrev ?? "—",
      };
    });

  // ¿La fecha sigue abierta?
  const { data: ventana } = await supabase.rpc("evaluar_ventana_gracia", { p_fecha: fecha });
  const row = (ventana as Array<{ resultado: string }> | null)?.[0];
  const res = row?.resultado ?? "";
  const abierta = ["OK", "LIBERADA", "SUPER"].includes(res);
  const motivoCierre = res === "FUTURO"
    ? "Esa fecha todavía no llega."
    : res === "GRACIA_VENCIDA"
      ? "El plazo para capturar esta fecha ya venció."
      : "Esta fecha está cerrada.";

  return {
    ok: true,
    fecha,
    faltantes,
    esperados: empleados.length,
    capturados: empleados.filter((e) => yaMarcados.has(e.id)).length,
    abierta,
    motivoCierre,
  };
}

export type GuardarDiaResult = { ok: true; guardadas: number } | { ok: false; error: string };

/**
 * Guarda marcas de un día desde "Mi quincena". Solo crea marcas NUEVAS —
 * igual que el pase de lista, un supervisor no sobrescribe lo ya capturado.
 * Valida que cada trabajador sea de sus sedes×jornadas.
 */
export async function guardarMarcasDiaAction(input: {
  fecha: string;
  marcas: Array<{ empleado_id: string; codigo: CodigoAsistencia }>;
}): Promise<GuardarDiaResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" };
  if (!input.marcas?.length) return { ok: false, error: "No seleccionaste ninguna marca" };

  // Ventana de gracia
  const { data: ventana } = await supabase.rpc("evaluar_ventana_gracia", { p_fecha: input.fecha });
  const res = (ventana as Array<{ resultado: string }> | null)?.[0]?.resultado ?? "";
  if (!["OK", "LIBERADA", "SUPER"].includes(res)) {
    return { ok: false, error: "Esa fecha está cerrada. Solicita habilitarla a Soporte." };
  }

  const pares = await combosDe(supabase, user.id);
  if (pares.length === 0) return { ok: false, error: "No tienes sedes asignadas" };
  const comboOk = new Set(pares.map((a) => `${a.sede_id}|${a.jornada}`));

  const validos = new Set<string>(CODIGOS);
  const ids = input.marcas.map((m) => m.empleado_id);
  const { data: empsRaw } = await supabase
    .from("empleados")
    .select("id, sede_id, jornada")
    .in("id", ids);
  const permitidos = new Set(
    ((empsRaw ?? []) as Array<{ id: string; sede_id: string; jornada: string }>)
      .filter((e) => comboOk.has(`${e.sede_id}|${e.jornada}`))
      .map((e) => e.id),
  );

  // Excluir los que ya tienen marca (no se sobrescribe)
  const { data: yaRaw } = await supabase
    .from("asistencias").select("empleado_id").eq("fecha", input.fecha).in("empleado_id", ids);
  const ya = new Set(((yaRaw ?? []) as Array<{ empleado_id: string }>).map((r) => r.empleado_id));

  const rows = input.marcas
    .filter((m) => validos.has(m.codigo) && permitidos.has(m.empleado_id) && !ya.has(m.empleado_id))
    .map((m) => ({ empleado_id: m.empleado_id, fecha: input.fecha, codigo: m.codigo, capturado_por: user.id }));

  if (rows.length === 0) return { ok: false, error: "Nada que guardar (ya estaban capturados)" };

  const { error } = await supabase.from("asistencias").insert(rows);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/mi-quincena");
  revalidatePath("/pase-lista");
  return { ok: true, guardadas: rows.length };
}

export type LiberacionResult = { ok: true; mensaje: string } | { ok: false; error: string };

/**
 * Pide a Soporte/SuperAdmin habilitar una fecha cerrada. Crea un ticket
 * DESBLOQUEO con la fecha, que ellos liberan con un clic desde /soporte.
 */
export async function solicitarHabilitarFechaAction(fecha: string, motivo: string): Promise<LiberacionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha inválida" };

  const { data: perfil } = await supabase
    .from("usuarios").select("nombre, username").eq("id", user.id)
    .single<{ nombre: string; username: string }>();
  const quien = perfil?.nombre ?? perfil?.username ?? "Supervisor";

  const { data: ticket, error } = await supabase
    .from("tickets_soporte")
    .insert({
      supervisor_id: user.id,
      tipo: "DESBLOQUEO",
      asunto: `Habilitar ${fecha} para capturar pase de lista`,
      mensaje: motivo.trim() || `${quien} solicita habilitar la fecha ${fecha} para completar su pase de lista de la quincena.`,
      urgencia: "URGENTE",
      fecha_solicitada: fecha,
    })
    .select("folio")
    .single<{ folio: string }>();
  if (error) return { ok: false, error: error.message };

  void notifyAdminLike(
    {
      title: "Vortex · Solicitud de desbloqueo",
      body: `${quien} pide habilitar el ${fecha} para completar su pase de lista.`,
      url: "/soporte",
      tag: `desbloqueo-${fecha}-${user.id}`,
      icon: "/icons/icon-192.png",
      data: { tipo: "desbloqueo", fecha },
      requireInteraction: true,
    },
    "ticket_desbloqueo",
    user.id,
  ).catch((e) => console.error("[mi-quincena] push desbloqueo:", e));

  revalidatePath("/mi-quincena");
  return { ok: true, mensaje: `Solicitud enviada${ticket?.folio ? ` (${ticket.folio})` : ""}. Soporte recibió la notificación.` };
}

export type AvisoResult = { ok: true; mensaje: string } | { ok: false; error: string };

/**
 * El supervisor avisa a RH el estado de su quincena (días completos / faltantes).
 * Manda push a admin-like con el resumen — la "conectividad" hacia RH.
 */
export async function avisarRHQuincenaAction(): Promise<AvisoResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" };

  const { data: perfil } = await supabase
    .from("usuarios").select("nombre, username").eq("id", user.id)
    .single<{ nombre: string; username: string }>();

  const cob = await coberturaQuincena(supabase, user.id);
  if (cob.sinAsignaciones) return { ok: false, error: "No tienes sedes asignadas" };

  const quien = perfil?.nombre ?? perfil?.username ?? "Supervisor";
  const faltan = cob.diasIncompletos.length;
  const cuerpo = faltan === 0
    ? `${quien}: quincena ${cob.quincena.label} COMPLETA (${cob.diasCompletos}/${cob.diasTranscurridos} días al 100%).`
    : `${quien}: ${cob.diasCompletos}/${cob.diasTranscurridos} días al 100% (${cob.pctGlobal}%). Le faltan ${faltan} día(s): ${cob.diasIncompletos.slice(0, 6).join(", ")}${faltan > 6 ? "…" : ""}`;

  await notifyAdminLike(
    {
      title: `Vortex · Quincena de ${quien}`,
      body: cuerpo,
      url: "/rh-pro/supervisores",
      tag: `quincena-${user.id}`,
      icon: "/icons/icon-192.png",
      data: { tipo: "quincena_supervisor", usuarioId: user.id },
    },
    "quincena_supervisor",
    user.id,
  ).catch((e) => console.error("[mi-quincena] push fail:", e));

  return { ok: true, mensaje: faltan === 0 ? "RH fue notificado: tu quincena está completa ✓" : `RH fue notificado (${faltan} día(s) pendientes).` };
}
