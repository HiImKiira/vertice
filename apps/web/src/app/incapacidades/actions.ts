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
 * Marca los días pactados de la incapacidad como código "I" (Incapacidad) en el
 * pase de lista, para todo el rango [fecha_inicio, fecha_fin]. Solo RH.
 *
 * - Persiste fecha_inicio / fecha_fin / dias_autorizados en la incapacidad
 *   (los "días pactados" de la ST7 o de la enfermedad general).
 * - Inserta/actualiza asistencias con codigo="I" para cada día del rango.
 *   capturado_por = RH → en pase de lista sale "por @rh" (la pauta para el
 *   supervisor de que es Incapacidad marcada por RH) y aparece en los exports.
 */
export async function aplicarDiasIncapacidadAction(input: {
  incapacidad_id: string;
  fecha_inicio: string;
  fecha_fin: string;
}): Promise<{ ok: true; marcados: number; dias: number; rango: string } | { ok: false; error: string }> {
  const auth = await getProfile();
  if (!auth.sb || !auth.user) return { ok: false, error: auth.error ?? "Sin sesión" };
  if (!["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(auth.rol ?? "")) {
    return { ok: false, error: "Solo RH (ADMIN/SUPERADMIN/SOPORTE) puede marcar días de incapacidad" };
  }
  const start = (input.fecha_inicio ?? "").slice(0, 10);
  const end = (input.fecha_fin ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return { ok: false, error: "Indica fecha de inicio y fin válidas (YYYY-MM-DD)" };
  }
  if (end < start) return { ok: false, error: "La fecha fin no puede ser anterior al inicio" };

  const admin = supabaseAdmin();
  const { data: incap } = await admin
    .from("incapacidades")
    .select("id, empleado_id, empleados(nombre, numero_empleado)")
    .eq("id", input.incapacidad_id)
    .maybeSingle();
  if (!incap) return { ok: false, error: "Incapacidad no encontrada" };
  const empId = (incap as unknown as { empleado_id: string }).empleado_id;

  // Construir lista de fechas del rango (UTC, un día a la vez)
  const fechas: string[] = [];
  let cursor = new Date(`${start}T00:00:00Z`);
  const endD = new Date(`${end}T00:00:00Z`);
  let guard = 0;
  while (cursor <= endD && guard < 400) {
    fechas.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
    guard++;
  }
  if (fechas.length === 0) return { ok: false, error: "Rango vacío" };
  if (fechas.length > 180) return { ok: false, error: "Rango demasiado largo (máx 180 días)" };

  // Persistir los días pactados en la incapacidad
  await admin
    .from("incapacidades")
    .update({ fecha_inicio: start, fecha_fin: end, dias_autorizados: fechas.length })
    .eq("id", input.incapacidad_id);

  // Marcas ya existentes en esas fechas (para no duplicar)
  const { data: existentes } = await admin
    .from("asistencias")
    .select("fecha, codigo")
    .eq("empleado_id", empId)
    .in("fecha", fechas);
  const exMap = new Map(((existentes ?? []) as Array<{ fecha: string; codigo: string }>).map((r) => [r.fecha, r.codigo]));

  const aInsertar = fechas
    .filter((f) => !exMap.has(f))
    .map((f) => ({ empleado_id: empId, fecha: f, codigo: "I", capturado_por: auth.user!.id }));
  const aActualizar = fechas.filter((f) => exMap.has(f) && exMap.get(f) !== "I");

  let marcados = 0;
  if (aInsertar.length) {
    const { error } = await admin.from("asistencias").insert(aInsertar);
    if (error) return { ok: false, error: `Insert asistencias: ${error.message}` };
    marcados += aInsertar.length;
  }
  for (const f of aActualizar) {
    const { error } = await admin
      .from("asistencias")
      .update({ codigo: "I", capturado_por: auth.user.id })
      .eq("empleado_id", empId)
      .eq("fecha", f);
    if (!error) marcados++;
  }

  await admin.from("incapacidad_eventos").insert({
    incapacidad_id: input.incapacidad_id,
    tipo: "comentario",
    detalle: `RH marcó ${marcados} día(s) como Incapacidad (I) en pase de lista · rango ${start} → ${end} (${fechas.length} días pactados)`,
    usuario_id: auth.user.id,
  });

  revalidatePath("/pase-lista");
  revalidatePath(`/incapacidades/${input.incapacidad_id}`);
  return { ok: true, marcados, dias: fechas.length, rango: `${start} → ${end}` };
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
