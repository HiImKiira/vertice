"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { meridaToday } from "@/lib/quincena";

export type TipoMarca = "entrada" | "salida";

export type ScanResult =
  | {
      ok: true;
      estado: "entrada" | "salida" | "ya_entrada" | "ya_salida" | "prueba" | "baja" | "ya_baja";
      nombre: string;
      numero: string;
      jornada: string;
      sede: string;
      codigo: string;
      horaEntrada?: string | undefined;
      horaSalida?: string | undefined;
      /** Salida marcada sin que hubiera entrada registrada hoy (aviso). */
      sinEntrada?: boolean | undefined;
    }
  | { ok: false; error: string };

export interface GeoScan {
  lat: number;
  lng: number;
  /** Precisión reportada por el GPS, en metros. */
  acc?: number | undefined;
}

export interface MarcarOpts {
  tipo?: TipoMarca | undefined;
  geo?: GeoScan | null | undefined;
  prueba?: boolean | undefined;
  /** Foto del momento del escaneo como data URL (image/jpeg base64). */
  foto?: string | null | undefined;
}

/** Sube la foto del escaneo al bucket privado. Nunca bloquea la marca. */
async function subirFotoChecada(
  admin: ReturnType<typeof supabaseAdmin>,
  empleadoId: string,
  tipo: TipoMarca,
  fecha: string,
  dataUrl: string,
): Promise<string | null> {
  try {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
    if (!m) return null;
    const mime = m[1]!;
    const buffer = Buffer.from(m[2]!, "base64");
    if (buffer.length < 500 || buffer.length > 2_000_000) return null;
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const path = `${fecha}/${empleadoId}/${tipo}_${Date.now()}.${ext}`;
    const { error } = await admin.storage
      .from("asistencia-fotos")
      .upload(path, buffer, { contentType: mime, upsert: true });
    return error ? null : path;
  } catch {
    return null;
  }
}

function horaMerida(ts: string): string {
  return new Date(ts).toLocaleTimeString("es-MX", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Merida",
  });
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
 * Registra ENTRADA o SALIDA (opts.tipo) con su hora sobre la misma fila diaria,
 * y guarda la foto del momento (opts.foto) como evidencia anti-fraude.
 *
 * `prueba: true` (solo SUPERADMIN/SOPORTE): corre TODAS las validaciones,
 * geocerca incluida, pero NO inserta la asistencia — para probar el flujo
 * sin ensuciar el pase de lista.
 */
export async function marcarPorQRAction(token: string, opts?: MarcarOpts): Promise<ScanResult> {
  const geo = opts?.geo ?? null;
  const prueba = opts?.prueba ?? false;
  const tipo: TipoMarca = opts?.tipo === "salida" ? "salida" : "entrada";
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
  const base = { ok: true as const, nombre: emp.nombre, numero: emp.numero_empleado, jornada: emp.jornada, sede: sede.abrev, codigo: "A" };

  // Fila diaria existente (una por empleado×fecha)
  const { data: ya } = await admin
    .from("asistencias")
    .select("id, hora_entrada, hora_salida")
    .eq("empleado_id", emp.id)
    .eq("fecha", hoy)
    .maybeSingle<{ id: string; hora_entrada: string | null; hora_salida: string | null }>();

  // Modo prueba: todo validó — no escribe nada ni sube foto.
  if (prueba) {
    return {
      ...base, estado: "prueba",
      horaEntrada: ya?.hora_entrada ? horaMerida(ya.hora_entrada) : undefined,
      horaSalida: ya?.hora_salida ? horaMerida(ya.hora_salida) : undefined,
    };
  }

  // Doble marca del mismo tipo: se informa, no se pisa (ni se re-sube foto).
  if (tipo === "entrada" && ya?.hora_entrada) {
    return { ...base, estado: "ya_entrada", horaEntrada: horaMerida(ya.hora_entrada), horaSalida: ya.hora_salida ? horaMerida(ya.hora_salida) : undefined };
  }
  if (tipo === "salida" && ya?.hora_salida) {
    return { ...base, estado: "ya_salida", horaEntrada: ya.hora_entrada ? horaMerida(ya.hora_entrada) : undefined, horaSalida: horaMerida(ya.hora_salida) };
  }

  const ahora = new Date().toISOString();
  const fotoPath = opts?.foto ? await subirFotoChecada(admin, emp.id, tipo, hoy, opts.foto) : null;

  // Columnas a escribir según el tipo
  const campos = tipo === "entrada"
    ? { hora_entrada: ahora, ...(fotoPath ? { foto_entrada: fotoPath } : {}) }
    : { hora_salida: ahora, ...(fotoPath ? { foto_salida: fotoPath } : {}) };

  let err: { message: string } | null = null;
  if (ya) {
    ({ error: err } = await admin.from("asistencias").update(campos).eq("id", ya.id));
  } else {
    ({ error: err } = await admin.from("asistencias").insert({
      empleado_id: emp.id, fecha: hoy, codigo: "A", capturado_por: user.id, ...campos,
    }));
  }
  // Colchón: si la migración v37 aún no se aplicó (columnas nuevas inexistentes),
  // al menos marcamos la asistencia base para no romper la toma en vivo.
  if (err && /column|does not exist|hora_|foto_|schema cache/i.test(err.message)) {
    if (ya) {
      err = null; // la fila ya existe; sin columnas nuevas no hay nada más que escribir
    } else {
      ({ error: err } = await admin.from("asistencias").insert({
        empleado_id: emp.id, fecha: hoy, codigo: "A", capturado_por: user.id,
      }));
    }
  }
  if (err) {
    if (fotoPath) await admin.storage.from("asistencia-fotos").remove([fotoPath]).catch(() => {});
    return { ok: false, error: `No se pudo marcar ${tipo} (error del servidor): ${err.message}` };
  }

  revalidatePath("/pase-lista");
  revalidatePath("/mi-quincena");
  revalidatePath("/rh-pro/qr/checadas");
  if (tipo === "entrada") {
    return { ...base, estado: "entrada", horaEntrada: horaMerida(ahora), horaSalida: ya?.hora_salida ? horaMerida(ya.hora_salida) : undefined };
  }
  return {
    ...base, estado: "salida", horaSalida: horaMerida(ahora),
    horaEntrada: ya?.hora_entrada ? horaMerida(ya.hora_entrada) : undefined,
    sinEntrada: !ya?.hora_entrada,
  };
}

// ─────────────────────────────────────────────────────────────────────
// MODO BAJA POR QR — protegido con código de autorización.
// El código vive SOLO en la env var VORTEX_CODIGO_BAJA (el repo es público:
// nunca se escribe en el código fuente ni llega al cliente). Sin la env var,
// el modo queda deshabilitado.
// ─────────────────────────────────────────────────────────────────────
function codigoBajaConfigurado(): string | null {
  const v = (process.env.VORTEX_CODIGO_BAJA ?? "").replace(/[\r\n\s]+/g, "");
  return v.length >= 4 ? v : null;
}

/** Valida el código para activar el modo baja en el escáner. */
export async function validarCodigoBajaAction(codigo: string): Promise<{ ok: boolean; error?: string | undefined }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" };
  const esperado = codigoBajaConfigurado();
  if (!esperado) return { ok: false, error: "El modo baja no está configurado (falta VORTEX_CODIGO_BAJA)" };
  return (codigo ?? "").trim() === esperado ? { ok: true } : { ok: false, error: "Código incorrecto" };
}

/**
 * Da de baja al trabajador escaneando su gafete. Solo en sedes con QR
 * habilitado (eventos). Usa las mismas columnas/auditoría que /rh-pro/baja:
 * fecha_baja hoy, motivo, quién y cuándo. Su QR deja de marcar al instante.
 */
export async function bajaPorQRAction(token: string, codigo: string): Promise<ScanResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" };
  const esperado = codigoBajaConfigurado();
  if (!esperado || (codigo ?? "").trim() !== esperado) {
    return { ok: false, error: "Código de autorización incorrecto — desactiva y vuelve a activar el modo baja" };
  }

  const limpio = (token ?? "").trim();
  if (!/^VTX1\.[A-Za-z0-9_-]{8,64}$/.test(limpio)) {
    return { ok: false, error: "Ese QR no es una credencial Vortex" };
  }

  const admin = supabaseAdmin();
  const { data: emp } = await admin
    .from("empleados")
    .select("id, numero_empleado, nombre, jornada, fecha_baja, sedes(abrev, qr_habilitado)")
    .eq("qr_token", limpio)
    .maybeSingle<{
      id: string; numero_empleado: string; nombre: string; jornada: string; fecha_baja: string | null;
      sedes: { abrev: string; qr_habilitado: boolean } | { abrev: string; qr_habilitado: boolean }[] | null;
    }>();
  if (!emp) return { ok: false, error: "Credencial no reconocida (QR inválido o revocado)" };
  const sede = Array.isArray(emp.sedes) ? emp.sedes[0] : emp.sedes;
  if (!sede?.qr_habilitado) {
    return { ok: false, error: `La sede ${sede?.abrev ?? "—"} no es de eventos — da de baja desde RH Pro` };
  }
  if (emp.fecha_baja) {
    return {
      ok: true, estado: "ya_baja",
      nombre: emp.nombre, numero: emp.numero_empleado, jornada: emp.jornada, sede: sede.abrev,
      codigo: "BAJA",
    };
  }

  const hoy = meridaToday();
  const { error } = await admin
    .from("empleados")
    .update({
      fecha_baja: hoy,
      motivo_baja: "Baja por QR (evento)",
      baja_capturado_por: user.id,
      baja_ts: new Date().toISOString(),
      status: "BAJA",
    })
    .eq("id", emp.id)
    .is("fecha_baja", null);
  if (error) return { ok: false, error: `No se pudo dar de baja: ${error.message}` };

  await admin
    .from("contratos")
    .update({ observaciones: `Empleado dado de baja el ${hoy}. Motivo: Baja por QR (evento)` })
    .eq("empleado_id", emp.id);

  revalidatePath("/pase-lista");
  revalidatePath("/rh-pro");
  revalidatePath("/rh-pro/qr");
  return {
    ok: true, estado: "baja",
    nombre: emp.nombre, numero: emp.numero_empleado, jornada: emp.jornada, sede: sede.abrev,
    codigo: "BAJA",
  };
}
