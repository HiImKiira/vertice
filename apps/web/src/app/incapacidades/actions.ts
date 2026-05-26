"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyAdminLike, sendPush } from "@/lib/push";
import {
  ESTADO_SPECS,
  TIPO_SPECS,
  type IncapacidadEstado,
  type IncapacidadTipo,
} from "@/lib/incapacidades";

export type IncapResult = { ok: true; id?: string } | { ok: false; error: string };

interface CrearInput {
  empleado_id: string;
  tipo: IncapacidadTipo;
  fecha_accidente?: string | null;
  hora_accidente?: string | null;
  lugar_accidente?: string | null;
  descripcion?: string | null;
  testigos?: string | null;
  fecha_inicio?: string | null;
  dias_autorizados?: number | null;
  unidad_medica?: string | null;
  observaciones?: string | null;
}

async function getProfile() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { sb: null, user: null, rol: null, nombre: null, error: "Sin sesión" };
  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol, nombre, username")
    .eq("id", user.id)
    .single<{ rol: string; nombre: string; username: string }>();
  return {
    sb: supabase,
    user,
    rol: perfil?.rol ?? null,
    nombre: perfil?.nombre ?? null,
    username: perfil?.username ?? null,
    error: null,
  };
}

/**
 * Crear nueva incapacidad. Cualquier rol (USER/ADMIN+) puede levantarla
 * para empleados de su sede. Notifica a admin-like vía push.
 */
export async function crearIncapacidadAction(input: CrearInput): Promise<IncapResult> {
  const auth = await getProfile();
  if (!auth.sb || !auth.user) return { ok: false, error: auth.error ?? "Sin sesión" };

  if (!input.empleado_id || !input.tipo) {
    return { ok: false, error: "Empleado y tipo de incapacidad son obligatorios" };
  }

  const { data: emp, error: empErr } = await auth.sb
    .from("empleados")
    .select("id, nombre, numero_empleado, sedes(abrev, nombre)")
    .eq("id", input.empleado_id)
    .maybeSingle();
  if (empErr || !emp) return { ok: false, error: "Empleado no encontrado o sin acceso" };
  const empData = emp as unknown as {
    id: string; nombre: string; numero_empleado: string;
    sedes?: { abrev: string; nombre: string } | { abrev: string; nombre: string }[] | null;
  };
  const sedeInfo = Array.isArray(empData.sedes) ? empData.sedes[0] : empData.sedes;

  const { data: inserted, error: insErr } = await auth.sb
    .from("incapacidades")
    .insert({
      empleado_id: input.empleado_id,
      tipo: input.tipo,
      estado: "REPORTADA",
      fecha_accidente: input.fecha_accidente || null,
      hora_accidente: input.hora_accidente || null,
      lugar_accidente: input.lugar_accidente || null,
      descripcion: input.descripcion?.trim() || null,
      testigos: input.testigos?.trim() || null,
      fecha_inicio: input.fecha_inicio || null,
      dias_autorizados: input.dias_autorizados ?? null,
      unidad_medica: input.unidad_medica?.trim() || null,
      observaciones: input.observaciones?.trim() || null,
      reportada_por: auth.user.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (insErr || !inserted) return { ok: false, error: insErr?.message ?? "No se pudo crear" };

  // Evento inicial
  await auth.sb.from("incapacidad_eventos").insert({
    incapacidad_id: inserted.id,
    tipo: "creada",
    estado_nuevo: "REPORTADA",
    detalle: `Reportada por ${auth.nombre ?? auth.user.id}`,
    usuario_id: auth.user.id,
  });

  // Push a admin-like
  const tipoLabel = TIPO_SPECS[input.tipo].label;
  void notifyAdminLike(
    {
      title: `Vortex · Nueva incapacidad: ${tipoLabel}`,
      body: `${auth.nombre ?? "Supervisor"} reportó incapacidad de ${empData.nombre} (${sedeInfo?.abrev ?? "—"}, #${empData.numero_empleado})`,
      url: `/incapacidades/${inserted.id}`,
      tag: `incap-${inserted.id}`,
      icon: "/icons/icon-192.png",
      data: { incapacidadId: inserted.id, tipo: input.tipo },
      requireInteraction: input.tipo === "RIESGO_BIOLOGICO",
    },
    "incapacidad_nueva",
    auth.user.id,
  ).catch((e) => console.error("[incap] notify fail:", e));

  revalidatePath("/incapacidades");
  return { ok: true, id: inserted.id };
}

/**
 * Avanzar/cambiar estado de la incapacidad. Solo admin-like.
 * Notifica a admin-like + al supervisor que la reportó.
 */
export async function cambiarEstadoIncapacidadAction(input: {
  incapacidad_id: string;
  nuevo_estado: IncapacidadEstado;
  nota?: string;
}): Promise<IncapResult> {
  const auth = await getProfile();
  if (!auth.sb || !auth.user) return { ok: false, error: auth.error ?? "Sin sesión" };
  if (!["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(auth.rol ?? "")) {
    return { ok: false, error: "Solo ADMIN/SUPERADMIN/SOPORTE pueden avanzar el estado" };
  }

  // Traer estado actual + datos para notificación
  const admin = supabaseAdmin();
  const { data: incap, error: incapErr } = await admin
    .from("incapacidades")
    .select("id, estado, tipo, reportada_por, empleado_id, empleados(nombre, numero_empleado)")
    .eq("id", input.incapacidad_id)
    .maybeSingle();
  if (incapErr || !incap) return { ok: false, error: "Incapacidad no encontrada" };
  const incapData = incap as unknown as {
    id: string; estado: IncapacidadEstado; tipo: IncapacidadTipo; reportada_por: string;
    empleados?: { nombre: string; numero_empleado: string } | { nombre: string; numero_empleado: string }[] | null;
  };
  const empI = Array.isArray(incapData.empleados) ? incapData.empleados[0] : incapData.empleados;

  const estadoAnterior = incapData.estado;
  const estadoNuevo = input.nuevo_estado;
  if (estadoAnterior === estadoNuevo) {
    return { ok: false, error: "Ya está en ese estado" };
  }

  // Update
  const patch: Record<string, unknown> = { estado: estadoNuevo };
  if (estadoNuevo === "CERRADA") patch.cerrada_en = new Date().toISOString();
  const { error: upErr } = await admin
    .from("incapacidades")
    .update(patch)
    .eq("id", input.incapacidad_id);
  if (upErr) return { ok: false, error: upErr.message };

  // Evento
  await admin.from("incapacidad_eventos").insert({
    incapacidad_id: input.incapacidad_id,
    tipo: "estado_cambio",
    estado_anterior: estadoAnterior,
    estado_nuevo: estadoNuevo,
    detalle: input.nota?.trim() || null,
    usuario_id: auth.user.id,
  });

  // Push: notifica al reporter + admin-like
  const tipoLabel = TIPO_SPECS[incapData.tipo].label;
  const estadoLabel = ESTADO_SPECS[estadoNuevo].label;
  const payload = {
    title: `Vortex · Incapacidad → ${estadoLabel}`,
    body: `${tipoLabel} de ${empI?.nombre ?? "empleado"} (#${empI?.numero_empleado ?? "—"}): ${ESTADO_SPECS[estadoNuevo].description}`,
    url: `/incapacidades/${input.incapacidad_id}`,
    tag: `incap-${input.incapacidad_id}`,
    icon: "/icons/icon-192.png",
    data: { incapacidadId: input.incapacidad_id, estado: estadoNuevo },
    requireInteraction: estadoNuevo === "ALTA_PENDIENTE" || estadoNuevo === "RH_VALIDA",
  };

  // Al supervisor que reportó
  if (incapData.reportada_por && incapData.reportada_por !== auth.user.id) {
    void sendPush(payload, [incapData.reportada_por], "incapacidad_estado")
      .catch((e) => console.error("[incap] push reporter fail:", e));
  }
  // A los demás admin-like (excluyendo al que hizo la acción)
  void notifyAdminLike(payload, "incapacidad_estado", auth.user.id)
    .catch((e) => console.error("[incap] notify admins fail:", e));

  revalidatePath("/incapacidades");
  revalidatePath(`/incapacidades/${input.incapacidad_id}`);
  return { ok: true };
}

/**
 * Comentario libre en el timeline.
 */
export async function agregarComentarioIncapacidadAction(input: {
  incapacidad_id: string;
  comentario: string;
}): Promise<IncapResult> {
  const auth = await getProfile();
  if (!auth.sb || !auth.user) return { ok: false, error: auth.error ?? "Sin sesión" };
  if (!input.comentario.trim()) return { ok: false, error: "Comentario vacío" };

  const { error } = await auth.sb.from("incapacidad_eventos").insert({
    incapacidad_id: input.incapacidad_id,
    tipo: "comentario",
    detalle: input.comentario.trim(),
    usuario_id: auth.user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/incapacidades/${input.incapacidad_id}`);
  return { ok: true };
}

/**
 * Dictamen IMSS — marca calificada true/false + fecha + notas.
 */
export async function dictaminarIncapacidadAction(input: {
  incapacidad_id: string;
  calificada: boolean;
  fecha: string;
  notas?: string;
  folio_st7?: string;
  diagnostico?: string;
}): Promise<IncapResult> {
  const auth = await getProfile();
  if (!auth.sb || !auth.user) return { ok: false, error: auth.error ?? "Sin sesión" };
  if (!["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(auth.rol ?? "")) {
    return { ok: false, error: "Solo ADMIN/SUPERADMIN/SOPORTE" };
  }

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("incapacidades")
    .update({
      calificada: input.calificada,
      dictamen_fecha: input.fecha,
      dictamen_notas: input.notas?.trim() || null,
      folio_st7: input.folio_st7?.trim() || undefined,
      diagnostico_nosologico: input.diagnostico?.trim() || undefined,
      estado: input.calificada ? "ALTA_PENDIENTE" : "RECHAZADA",
    })
    .eq("id", input.incapacidad_id);
  if (error) return { ok: false, error: error.message };

  await admin.from("incapacidad_eventos").insert({
    incapacidad_id: input.incapacidad_id,
    tipo: "estado_cambio",
    estado_anterior: "DICTAMEN",
    estado_nuevo: input.calificada ? "ALTA_PENDIENTE" : "RECHAZADA",
    detalle: `Dictamen IMSS: ${input.calificada ? "CALIFICADA como riesgo de trabajo" : "NO calificada"}${input.notas ? ` — ${input.notas}` : ""}`,
    usuario_id: auth.user.id,
  });

  revalidatePath(`/incapacidades/${input.incapacidad_id}`);
  return { ok: true };
}
