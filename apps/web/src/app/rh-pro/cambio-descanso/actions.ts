"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendPush } from "@/lib/push";
import { DIAS_VALIDOS, DIA_FULL, type DiaSemana } from "./constants";

export type CambioDescansoResult =
  | { ok: true; mensaje: string; supervisoresNotificados: number }
  | { ok: false; error: string };

/**
 * Cambia el día de descanso FIJO (permanente) de un trabajador individual.
 * - Actualiza empleados.dia_descanso (array de 1-2 días).
 * - Registra en empleado_movimientos con tipo='cambio_descanso' (auditoría).
 * - Notifica por push al / a los supervisor(es) de la sede+jornada del empleado.
 *
 * Distinto del módulo /descansos (CDTs) que es temporal y NO toca dia_descanso.
 */
export async function cambiarDescansoFijoAction(input: {
  empleadoId: string;
  dias: DiaSemana[];
  motivo: string;
}): Promise<CambioDescansoResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" };

  const { data: perfil } = await supabase
    .from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  const rol = perfil?.rol;
  const adminLike = !!rol && ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(rol);
  // ADMIN-like cambia a cualquier trabajador. USER (supervisor) también puede,
  // pero acotado a los trabajadores de las sedes que tiene asignadas (validado
  // más abajo, una vez que conocemos la sede del empleado).
  if (!rol || (!adminLike && rol !== "USER")) {
    return { ok: false, error: "No tienes permiso para cambiar descansos" };
  }

  // Validaciones
  if (!input.empleadoId) return { ok: false, error: "Selecciona un trabajador" };
  const limpios = [...new Set(input.dias.filter((d) => DIAS_VALIDOS.includes(d)))];
  if (limpios.length === 0) return { ok: false, error: "Selecciona al menos 1 día de descanso" };
  if (limpios.length > 2) return { ok: false, error: "Máximo 2 días de descanso por trabajador" };
  if (!input.motivo?.trim()) return { ok: false, error: "El motivo del cambio es obligatorio (queda en auditoría)" };

  const motivo = input.motivo.trim().slice(0, 500);
  const admin = supabaseAdmin();

  // Cargar empleado actual (para log + datos de notificación)
  const { data: emp } = await admin
    .from("empleados")
    .select("id, nombre, numero_empleado, sede_id, jornada, dia_descanso, fecha_baja, sedes(abrev, nombre)")
    .eq("id", input.empleadoId)
    .maybeSingle<{
      id: string; nombre: string; numero_empleado: string;
      sede_id: string; jornada: string; dia_descanso: string[] | null; fecha_baja: string | null;
      sedes: { abrev: string; nombre: string } | { abrev: string; nombre: string }[] | null;
    }>();
  if (!emp) return { ok: false, error: "Trabajador no encontrado" };
  if (emp.fecha_baja) return { ok: false, error: "El trabajador está dado de baja" };

  // Scope de supervisor: un USER solo puede cambiar el descanso de trabajadores
  // que pertenecen a una de las sedes que tiene asignadas (activas).
  if (!adminLike) {
    const { data: asign } = await admin
      .from("asignaciones_supervisor")
      .select("sede_id")
      .eq("usuario_id", user.id)
      .eq("sede_id", emp.sede_id)
      .eq("activo", true)
      .limit(1);
    if (!asign || asign.length === 0) {
      return { ok: false, error: "Ese trabajador no está en tus sedes asignadas" };
    }
  }

  const sede = Array.isArray(emp.sedes) ? emp.sedes[0] : emp.sedes;
  const previo = (emp.dia_descanso ?? []) as DiaSemana[];

  // ¿Hubo cambio real?
  const sonIguales =
    previo.length === limpios.length &&
    [...previo].sort().join(",") === [...limpios].sort().join(",");
  if (sonIguales) {
    return { ok: false, error: `Ya descansa ${limpios.map((d) => DIA_FULL[d]).join(" y ")}. Sin cambios.` };
  }

  // 1) Update dia_descanso
  const { error: upErr } = await admin
    .from("empleados")
    .update({ dia_descanso: limpios })
    .eq("id", input.empleadoId);
  if (upErr) return { ok: false, error: `Update: ${upErr.message}` };

  // 2) Log en empleado_movimientos
  const { error: logErr } = await admin.from("empleado_movimientos").insert({
    empleado_id: emp.id,
    tipo: "cambio_descanso",
    dia_descanso_anterior: previo,
    dia_descanso_nuevo: limpios,
    motivo,
    efectuado_por: user.id,
  });
  if (logErr) console.error("[cambio-descanso] log fail:", logErr.message);

  // 3) Notificar supervisor(es) de la sede + jornada del empleado
  let supervisoresNotificados = 0;
  const { data: supers } = await admin
    .from("asignaciones_supervisor")
    .select("usuario_id")
    .eq("sede_id", emp.sede_id)
    .eq("jornada", emp.jornada)
    .eq("activo", true);

  const userIds = [...new Set((supers ?? []).map((s) => (s as { usuario_id: string }).usuario_id))]
    .filter((id) => id !== user.id);

  if (userIds.length > 0) {
    const nuevoTexto = limpios.map((d) => DIA_FULL[d]).join(" y ");
    void sendPush(
      {
        title: `Vortex · Cambio de descanso`,
        body: `${emp.nombre} (${sede?.abrev ?? ""}) ahora descansa ${nuevoTexto}. Motivo: ${motivo.slice(0, 80)}`,
        url: "/pase-lista",
        tag: `cambio-descanso-${emp.id}-${Date.now()}`,
        icon: "/icons/icon-192.png",
      },
      userIds,
      "cambio_descanso_fijo",
    ).catch((e) => console.error("[cambio-descanso] push fail:", e));
    supervisoresNotificados = userIds.length;
  }

  revalidatePath("/rh-pro/cambio-descanso");
  revalidatePath("/rh-pro/descansos-semanales");
  revalidatePath("/rh-pro/consulta");
  revalidatePath("/descansos/fijo");
  revalidatePath("/pase-lista");

  const nuevoTexto = limpios.map((d) => DIA_FULL[d]).join(" y ");
  const previoTexto = previo.length ? previo.map((d) => DIA_FULL[d as DiaSemana]).join(" y ") : "sin definir";
  return {
    ok: true,
    mensaje: `${emp.nombre}: descanso cambiado de ${previoTexto} → ${nuevoTexto}.${supervisoresNotificados > 0 ? ` ${supervisoresNotificados} supervisor(es) notificado(s).` : ""}`,
    supervisoresNotificados,
  };
}
