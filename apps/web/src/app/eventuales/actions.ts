"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EventualResult = { ok: true; id: string } | { ok: false; error: string };

export interface EventualInput {
  fecha: string;
  sede_id: string;
  jornada: "MATUTINO" | "VESPERTINO" | "NOCTURNO" | "TURNO_ROTATIVO" | "CUBRETURNOS" | "DIURNO";
  es_externo: boolean;
  empleado_id?: string | null;     // requerido si no es externo
  nombre_externo?: string | null;  // requerido si es externo
  cubre_id?: string | null;
  observaciones?: string | null;
  autoriza?: string | null;
}

async function getAuth() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { sb: null, error: "Sin sesión." };
  const { data: perfil } = await supabase.from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  return { sb: supabase, userId: user.id, rol: perfil?.rol ?? null };
}

export async function crearTurnoEventualAction(input: EventualInput): Promise<EventualResult> {
  const auth = await getAuth();
  if (!auth.sb) return { ok: false, error: auth.error! };

  if (!input.fecha || !input.sede_id) {
    return { ok: false, error: "Faltan fecha y sede." };
  }
  if (input.es_externo) {
    if (!input.nombre_externo?.trim()) return { ok: false, error: "Para externos, captura el nombre." };
  } else {
    if (!input.empleado_id) return { ok: false, error: "Selecciona el empleado." };
  }

  const { data, error } = await auth.sb
    .from("turnos_eventuales")
    .insert({
      fecha: input.fecha,
      sede_id: input.sede_id,
      jornada: input.jornada,
      empleado_id: input.es_externo ? null : input.empleado_id,
      nombre_externo: input.es_externo ? input.nombre_externo!.trim() : null,
      cubre_id: input.cubre_id || null,
      observaciones: input.observaciones?.trim() || null,
      autoriza: input.autoriza || null,
      es_externo: input.es_externo,
      capturado_por: auth.userId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) return { ok: false, error: error?.message ?? "no creado" };

  revalidatePath("/eventuales");
  return { ok: true, id: data.id };
}

export async function eliminarTurnoEventualAction(id: string): Promise<EventualResult> {
  const auth = await getAuth();
  if (!auth.sb) return { ok: false, error: auth.error! };
  if (!["ADMIN", "SUPERADMIN"].includes(auth.rol ?? "")) {
    return { ok: false, error: "Solo ADMIN/SUPERADMIN puede eliminar." };
  }
  const { error } = await auth.sb.from("turnos_eventuales").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/eventuales");
  return { ok: true, id };
}
