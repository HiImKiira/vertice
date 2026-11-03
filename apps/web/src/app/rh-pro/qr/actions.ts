"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export interface CredencialRow {
  id: string;
  numero_empleado: string;
  nombre: string;
  jornada: string;
  token: string;
  /** true si el token se generó en ESTA corrida (trabajador recién dado de alta). */
  nuevo: boolean;
}

export type GenerarResult =
  | { ok: true; sede_abrev: string; credenciales: CredencialRow[]; nuevos: number }
  | { ok: false; error: string };

async function requireRH(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase
    .from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol)) return null;
  return user.id;
}

/** Regla de negocio: la geocerca SOLO la cambian SUPERADMIN y ADMIN. */
async function requireGeoAdmin(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase
    .from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN"].includes(perfil.rol)) return null;
  return user.id;
}

/**
 * Vincula la ubicación física de la sede (geocerca). Con geocerca activa, el
 * escáner QR solo marca asistencia si el teléfono está dentro del radio.
 * Solo SUPERADMIN y ADMIN.
 */
export async function vincularUbicacionAction(
  sedeId: string,
  lat: number,
  lng: number,
  radioM: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const quien = await requireGeoAdmin();
  if (!quien) return { ok: false, error: "La geocerca solo la cambian SUPERADMIN y ADMIN" };

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, error: "Coordenadas inválidas" };
  }
  const radio = Math.round(Number(radioM));
  if (!Number.isFinite(radio) || radio < 30 || radio > 2000) {
    return { ok: false, error: "El radio debe estar entre 30 y 2000 metros" };
  }

  const { error } = await supabaseAdmin()
    .from("sedes")
    .update({ geo_lat: lat, geo_lng: lng, geo_radio_m: radio })
    .eq("id", sedeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/rh-pro/qr");
  return { ok: true };
}

/** Quita la geocerca de la sede (el escáner vuelve a funcionar sin candado de ubicación). Solo SUPERADMIN y ADMIN. */
export async function desvincularUbicacionAction(sedeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const quien = await requireGeoAdmin();
  if (!quien) return { ok: false, error: "La geocerca solo la cambian SUPERADMIN y ADMIN" };
  const { error } = await supabaseAdmin()
    .from("sedes")
    .update({ geo_lat: null, geo_lng: null })
    .eq("id", sedeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/rh-pro/qr");
  return { ok: true };
}

/**
 * Designa la sede para asistencia por QR y genera el token de cada trabajador
 * activo que aún no tenga. Devuelve TODAS las credenciales para imprimir.
 * Idempotente: re-ejecutar no cambia los tokens existentes (las credenciales
 * ya impresas siguen sirviendo).
 */
export async function generarCredencialesSedeAction(sedeId: string): Promise<GenerarResult> {
  const rh = await requireRH();
  if (!rh) return { ok: false, error: "Solo RH (ADMIN/SUPERADMIN/SOPORTE)" };

  const admin = supabaseAdmin();
  const { data: sede } = await admin
    .from("sedes").select("id, abrev, qr_habilitado").eq("id", sedeId)
    .maybeSingle<{ id: string; abrev: string; qr_habilitado: boolean }>();
  if (!sede) return { ok: false, error: "Sede no encontrada" };

  // 1) Designar la sede (idempotente)
  if (!sede.qr_habilitado) {
    const { error } = await admin.from("sedes").update({ qr_habilitado: true }).eq("id", sedeId);
    if (error) return { ok: false, error: `Habilitar sede: ${error.message}` };
  }

  // 2) Trabajadores activos de la sede
  const { data: emps, error: eErr } = await admin
    .from("empleados")
    .select("id, numero_empleado, nombre, jornada, qr_token")
    .eq("sede_id", sedeId)
    .is("fecha_baja", null)
    .order("jornada")
    .order("nombre");
  if (eErr) return { ok: false, error: eErr.message };

  // 3) Token nuevo solo a quien no tiene
  let nuevos = 0;
  const generados = new Set<string>();
  const lista = (emps ?? []) as Array<{ id: string; numero_empleado: string; nombre: string; jornada: string; qr_token: string | null }>;
  for (const e of lista) {
    if (!e.qr_token) {
      const token = `VTX1.${randomBytes(16).toString("base64url")}`;
      const { error } = await admin.from("empleados").update({ qr_token: token }).eq("id", e.id);
      if (!error) { e.qr_token = token; nuevos++; generados.add(e.id); }
    }
  }

  revalidatePath("/rh-pro/qr");
  return {
    ok: true,
    sede_abrev: sede.abrev,
    nuevos,
    credenciales: lista
      .filter((e) => !!e.qr_token)
      .map((e) => ({
        id: e.id, numero_empleado: e.numero_empleado, nombre: e.nombre, jornada: e.jornada,
        token: e.qr_token!, nuevo: generados.has(e.id),
      })),
  };
}

/**
 * Revoca y regenera el token de UN trabajador (credencial perdida/robada).
 * La credencial anterior deja de servir al instante.
 */
export async function regenerarTokenAction(empleadoId: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const rh = await requireRH();
  if (!rh) return { ok: false, error: "Solo RH" };
  const token = `VTX1.${randomBytes(16).toString("base64url")}`;
  const { error } = await supabaseAdmin().from("empleados").update({ qr_token: token }).eq("id", empleadoId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/rh-pro/qr");
  return { ok: true, token };
}
