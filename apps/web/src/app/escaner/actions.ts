"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { meridaToday } from "@/lib/quincena";

export type ScanResult =
  | {
      ok: true;
      estado: "marcado" | "ya_marcado";
      nombre: string;
      numero: string;
      jornada: string;
      sede: string;
      codigo: string;      // el código que quedó (A, o el que ya tenía)
      hora?: string | undefined; // si ya estaba marcado, a qué hora
    }
  | { ok: false; error: string };

/**
 * Marca la asistencia del día (A) a partir del token del QR escaneado.
 *
 * Validaciones:
 *  1. Token con formato VTX1.* y existente.
 *  2. Trabajador activo y su sede con QR habilitado (sede designada).
 *  3. Quien escanea es supervisor con esa sede×jornada asignada (admin-like
 *     pasa sin asignación). COORDINACION marca solo sus sedes asignadas.
 *  4. Sin doble marca: si ya tiene asistencia hoy, se informa, no se pisa.
 */
export async function marcarPorQRAction(token: string): Promise<ScanResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" };

  const limpio = (token ?? "").trim();
  if (!/^VTX1\.[A-Za-z0-9_-]{8,64}$/.test(limpio)) {
    return { ok: false, error: "Ese QR no es una credencial Vortex" };
  }

  const admin = supabaseAdmin();

  // Trabajador por token + su sede
  const { data: emp } = await admin
    .from("empleados")
    .select("id, numero_empleado, nombre, jornada, sede_id, fecha_baja, sedes(abrev, nombre, qr_habilitado)")
    .eq("qr_token", limpio)
    .maybeSingle<{
      id: string; numero_empleado: string; nombre: string; jornada: string;
      sede_id: string; fecha_baja: string | null;
      sedes: { abrev: string; nombre: string; qr_habilitado: boolean } | { abrev: string; nombre: string; qr_habilitado: boolean }[] | null;
    }>();
  if (!emp) return { ok: false, error: "Credencial no reconocida (QR inválido o revocado)" };
  if (emp.fecha_baja) return { ok: false, error: `${emp.nombre} está dado de baja` };
  const sede = Array.isArray(emp.sedes) ? emp.sedes[0] : emp.sedes;
  if (!sede?.qr_habilitado) {
    return { ok: false, error: `La sede ${sede?.abrev ?? "—"} no tiene asistencia por QR habilitada` };
  }

  // ¿Quién escanea puede marcar a este trabajador?
  const { data: perfil } = await supabase
    .from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  const esAdmin = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil?.rol ?? "");
  if (!esAdmin) {
    const { data: asig } = await supabase
      .from("asignaciones_supervisor")
      .select("id")
      .eq("usuario_id", user.id)
      .eq("sede_id", emp.sede_id)
      .eq("jornada", emp.jornada)
      .eq("activo", true)
      .limit(1);
    if (!asig?.length) {
      return { ok: false, error: `${emp.nombre} es de ${sede.abrev} · ${emp.jornada} — no tienes ese turno asignado` };
    }
  }

  const hoy = meridaToday();

  // ¿Ya está marcado hoy?
  const { data: ya } = await admin
    .from("asistencias")
    .select("codigo, actualizado_en")
    .eq("empleado_id", emp.id)
    .eq("fecha", hoy)
    .maybeSingle<{ codigo: string; actualizado_en: string | null }>();
  if (ya) {
    return {
      ok: true, estado: "ya_marcado",
      nombre: emp.nombre, numero: emp.numero_empleado, jornada: emp.jornada, sede: sede.abrev,
      codigo: ya.codigo,
      hora: ya.actualizado_en
        ? new Date(ya.actualizado_en).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
        : undefined,
    };
  }

  // Marcar A — con el cliente del USUARIO, para que el RLS vuelva a validar
  // (capturado_por propio + sede asignada + fecha reciente).
  const { error } = await supabase.from("asistencias").insert({
    empleado_id: emp.id,
    fecha: hoy,
    codigo: "A",
    capturado_por: user.id,
  });
  if (error) return { ok: false, error: `No se pudo marcar: ${error.message}` };

  revalidatePath("/pase-lista");
  revalidatePath("/mi-quincena");
  return {
    ok: true, estado: "marcado",
    nombre: emp.nombre, numero: emp.numero_empleado, jornada: emp.jornada, sede: sede.abrev,
    codigo: "A",
  };
}
