"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyAdminLike } from "@/lib/push";
import { CODIGOS, type CodigoAsistencia } from "@vertice/shared/codes";
import { TIPO_SPECS, type IncapacidadTipo } from "@/lib/incapacidades";

export type CorreccionResult = { ok: true; mensaje: string } | { ok: false; error: string };

/** Solo RH (admin-like) corrige registros. Devuelve el perfil o null. */
async function requireRH(): Promise<{ userId: string; nombre: string } | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase
    .from("usuarios").select("rol, nombre").eq("id", user.id)
    .single<{ rol: string; nombre: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol)) return null;
  return { userId: user.id, nombre: perfil.nombre };
}

/** Deja rastro de la corrección en empleado_movimientos (tipo='correccion'). */
async function logCorreccion(empleadoId: string, motivo: string, userId: string): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin.from("empleado_movimientos").insert({
    empleado_id: empleadoId,
    tipo: "correccion",
    motivo: motivo.slice(0, 500),
    efectuado_por: userId,
  });
  if (error) console.error("[correcciones] log fail:", error.message);
}

/**
 * Elimina una incapacidad mal registrada: archivos de storage + registro
 * (eventos y documentos caen en cascada). Queda asentado en la bitácora.
 */
export async function eliminarIncapacidadCorreccionAction(input: {
  incapacidadId: string;
  motivo: string;
}): Promise<CorreccionResult> {
  const rh = await requireRH();
  if (!rh) return { ok: false, error: "Solo RH (ADMIN/SUPERADMIN/SOPORTE) puede corregir registros" };
  if (!input.motivo?.trim()) return { ok: false, error: "El motivo es obligatorio (queda en la bitácora)" };

  const admin = supabaseAdmin();
  const { data: incap } = await admin
    .from("incapacidades")
    .select("id, tipo, empleado_id, empleados(nombre, numero_empleado)")
    .eq("id", input.incapacidadId)
    .maybeSingle<{
      id: string; tipo: IncapacidadTipo; empleado_id: string;
      empleados: { nombre: string; numero_empleado: string } | { nombre: string; numero_empleado: string }[] | null;
    }>();
  if (!incap) return { ok: false, error: "Incapacidad no encontrada (¿ya fue eliminada?)" };
  const emp = Array.isArray(incap.empleados) ? incap.empleados[0] : incap.empleados;

  // 1) Archivos en storage
  const { data: docs } = await admin
    .from("incapacidad_documentos").select("archivo_path").eq("incapacidad_id", incap.id);
  const paths = ((docs ?? []) as Array<{ archivo_path: string | null }>)
    .map((d) => d.archivo_path).filter((p): p is string => !!p);
  if (paths.length) await admin.storage.from("incapacidades").remove(paths).catch(() => {});

  // 2) Registro (cascade: eventos + documentos)
  const { error } = await admin.from("incapacidades").delete().eq("id", incap.id);
  if (error) return { ok: false, error: error.message };

  // 3) Bitácora + aviso a RH
  const tipoLabel = TIPO_SPECS[incap.tipo]?.label ?? incap.tipo;
  const detalle = `Corrección: incapacidad (${tipoLabel}) de ${emp?.nombre ?? "—"} eliminada. Motivo: ${input.motivo.trim()}`;
  await logCorreccion(incap.empleado_id, detalle, rh.userId);
  void notifyAdminLike(
    {
      title: "Vortex · Corrección aplicada",
      body: `${rh.nombre} eliminó la incapacidad de ${emp?.nombre ?? "—"} (#${emp?.numero_empleado ?? "—"}). Motivo: ${input.motivo.trim().slice(0, 80)}`,
      url: "/rh-pro/actividad",
      tag: `correccion-${incap.id}`,
      icon: "/icons/icon-192.png",
      data: { tipo: "correccion" },
    },
    "correccion_registro",
    rh.userId,
  ).catch(() => {});

  revalidatePath("/incapacidades");
  revalidatePath("/rh-pro/correcciones");
  revalidatePath("/live");
  return { ok: true, mensaje: `Incapacidad de ${emp?.nombre ?? "—"} eliminada y asentada en bitácora.` };
}

export interface MarcaRow { fecha: string; codigo: string; capturado_por_username: string | null }

/** Marcas de asistencia de un empleado en un rango (para corregirlas). */
export async function marcasDeEmpleadoAction(input: {
  empleadoId: string; inicio: string; fin: string;
}): Promise<{ ok: true; marcas: MarcaRow[] } | { ok: false; error: string }> {
  const rh = await requireRH();
  if (!rh) return { ok: false, error: "Solo RH puede consultar aquí" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(input.fin)) {
    return { ok: false, error: "Rango de fechas inválido" };
  }
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("asistencias")
    .select("fecha, codigo, usuarios:capturado_por(username)")
    .eq("empleado_id", input.empleadoId)
    .gte("fecha", input.inicio).lte("fecha", input.fin)
    .order("fecha");
  if (error) return { ok: false, error: error.message };
  const marcas = ((data ?? []) as Array<{ fecha: string; codigo: string; usuarios: { username: string } | { username: string }[] | null }>)
    .map((m) => {
      const u = Array.isArray(m.usuarios) ? m.usuarios[0] : m.usuarios;
      return { fecha: m.fecha, codigo: m.codigo, capturado_por_username: u?.username ?? null };
    });
  return { ok: true, marcas };
}

/**
 * Corrige una marca puntual: cambia el código o la elimina. Con motivo
 * obligatorio y rastro en bitácora.
 */
export async function corregirMarcaAction(input: {
  empleadoId: string;
  fecha: string;
  nuevoCodigo: CodigoAsistencia | "ELIMINAR";
  motivo: string;
}): Promise<CorreccionResult> {
  const rh = await requireRH();
  if (!rh) return { ok: false, error: "Solo RH puede corregir marcas" };
  if (!input.motivo?.trim()) return { ok: false, error: "El motivo es obligatorio" };
  if (input.nuevoCodigo !== "ELIMINAR" && !CODIGOS.includes(input.nuevoCodigo)) {
    return { ok: false, error: "Código inválido" };
  }

  const admin = supabaseAdmin();
  const { data: actual } = await admin
    .from("asistencias").select("codigo").eq("empleado_id", input.empleadoId).eq("fecha", input.fecha)
    .maybeSingle<{ codigo: string }>();
  if (!actual) return { ok: false, error: "No hay marca en esa fecha" };

  if (input.nuevoCodigo === "ELIMINAR") {
    const { error } = await admin.from("asistencias").delete()
      .eq("empleado_id", input.empleadoId).eq("fecha", input.fecha);
    if (error) return { ok: false, error: error.message };
  } else {
    if (actual.codigo === input.nuevoCodigo) return { ok: false, error: `Ya está marcado ${actual.codigo}` };
    const { error } = await admin.from("asistencias")
      .update({ codigo: input.nuevoCodigo, capturado_por: rh.userId })
      .eq("empleado_id", input.empleadoId).eq("fecha", input.fecha);
    if (error) return { ok: false, error: error.message };
  }

  const cambio = input.nuevoCodigo === "ELIMINAR"
    ? `marca del ${input.fecha} (${actual.codigo}) eliminada`
    : `marca del ${input.fecha}: ${actual.codigo} → ${input.nuevoCodigo}`;
  await logCorreccion(input.empleadoId, `Corrección: ${cambio}. Motivo: ${input.motivo.trim()}`, rh.userId);

  revalidatePath("/pase-lista");
  revalidatePath("/rh-pro/correcciones");
  return { ok: true, mensaje: `Listo: ${cambio}.` };
}
