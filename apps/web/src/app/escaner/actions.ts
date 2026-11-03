"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { meridaToday } from "@/lib/quincena";

export type ScanResult =
  | {
      ok: true;
      estado: "marcado" | "ya_marcado" | "prueba";
      nombre: string;
      numero: string;
      jornada: string;
      sede: string;
      codigo: string;      // el código que quedó (A, o el que ya tenía)
      hora?: string | undefined; // si ya estaba marcado, a qué hora
    }
  | { ok: false; error: string };

export interface GeoScan {
  lat: number;
  lng: number;
  /** Precisión reportada por el GPS, en metros. */
  acc?: number | undefined;
}

/** Distancia en metros entre dos coordenadas (haversine). */
function distanciaM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Marca la asistencia del día (A) a partir del token del QR escaneado.
 *
 * Validaciones:
 *  1. Token con formato VTX1.* y existente.
 *  2. Trabajador activo y su sede con QR habilitado (sede designada).
 *  3. Geocerca: si la sede tiene ubicación vinculada, quien escanea debe
 *     estar físicamente dentro del radio (nadie marca desde su casa con
 *     fotos de credenciales).
 *  4. Quien escanea es supervisor con esa sede×jornada asignada (admin-like
 *     pasa sin asignación). COORDINACION marca solo sus sedes asignadas.
 *  5. Sin doble marca: si ya tiene asistencia hoy, se informa, no se pisa.
 *
 * `prueba: true` (solo SUPERADMIN/SOPORTE): corre TODAS las validaciones,
 * geocerca incluida, pero NO inserta la asistencia — para probar el flujo
 * sin ensuciar el pase de lista.
 */
export async function marcarPorQRAction(token: string, geo?: GeoScan | null, prueba?: boolean): Promise<ScanResult> {
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
    .select("id, numero_empleado, nombre, jornada, sede_id, fecha_baja, sedes(abrev, nombre, qr_habilitado, geo_lat, geo_lng, geo_radio_m)")
    .eq("qr_token", limpio)
    .maybeSingle<{
      id: string; numero_empleado: string; nombre: string; jornada: string;
      sede_id: string; fecha_baja: string | null;
      sedes:
        | { abrev: string; nombre: string; qr_habilitado: boolean; geo_lat: number | null; geo_lng: number | null; geo_radio_m: number | null }
        | { abrev: string; nombre: string; qr_habilitado: boolean; geo_lat: number | null; geo_lng: number | null; geo_radio_m: number | null }[]
        | null;
    }>();
  if (!emp) return { ok: false, error: "Credencial no reconocida (QR inválido o revocado)" };
  if (emp.fecha_baja) return { ok: false, error: `${emp.nombre} está dado de baja` };
  const sede = Array.isArray(emp.sedes) ? emp.sedes[0] : emp.sedes;
  if (!sede?.qr_habilitado) {
    return { ok: false, error: `La sede ${sede?.abrev ?? "—"} no tiene asistencia por QR habilitada` };
  }

  // Geocerca: si la sede tiene ubicación vinculada, el escaneo debe venir de ahí.
  // La migración puede no estar aplicada aún (geo_lat llega undefined) → sin candado.
  if (typeof sede.geo_lat === "number" && typeof sede.geo_lng === "number") {
    const coordsValidas =
      geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng) &&
      Math.abs(geo.lat) <= 90 && Math.abs(geo.lng) <= 180;
    if (!coordsValidas) {
      return {
        ok: false,
        error: `${sede.abrev} exige ubicación para marcar. Activa el GPS y dale permiso de ubicación a Vortex, luego vuelve a escanear.`,
      };
    }
    const dist = distanciaM(geo.lat, geo.lng, sede.geo_lat, sede.geo_lng);
    const radio = sede.geo_radio_m ?? 150;
    // Tolerancia extra por imprecisión del GPS (tope 60 m para que no se abuse)
    const tolerancia = radio + Math.min(Math.max(geo.acc ?? 0, 0), 60);
    if (dist > tolerancia) {
      const distTxt = dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
      return {
        ok: false,
        error: `Estás a ~${distTxt} de ${sede.abrev} (límite ${radio} m). Hay que estar en la sede para marcar asistencia.`,
      };
    }
  }

  // ¿Quién escanea puede marcar a este trabajador?
  const { data: perfil } = await supabase
    .from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  const esAdmin = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil?.rol ?? "");
  if (prueba && !["SUPERADMIN", "SOPORTE"].includes(perfil?.rol ?? "")) {
    return { ok: false, error: "El modo prueba es solo para SUPERADMIN y SOPORTE" };
  }
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

  // Modo prueba: todo validó (credencial, sede, geocerca, permisos) — no se marca.
  if (prueba) {
    return {
      ok: true, estado: "prueba",
      nombre: emp.nombre, numero: emp.numero_empleado, jornada: emp.jornada, sede: sede.abrev,
      codigo: "A",
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
