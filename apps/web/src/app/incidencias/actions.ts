"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CODIGOS, type CodigoAsistencia } from "@vertice/shared/codes";

export type RegistrarResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

interface RegistrarInput {
  empleado_id: string;
  fecha: string;          // YYYY-MM-DD
  codigo: CodigoAsistencia;
  observacion?: string | null;
  cubre_id?: string | null;
  autoriza?: string | null;
  documento_url?: string | null;
}

export async function registrarIncidenciaAction(input: RegistrarInput): Promise<RegistrarResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión." };

  if (!CODIGOS.includes(input.codigo as CodigoAsistencia)) {
    return { ok: false, error: "Código inválido." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) {
    return { ok: false, error: "Fecha inválida." };
  }

  // Validar empleado existe y obtener sede para checar permiso
  const { data: emp, error: empErr } = await supabase
    .from("empleados")
    .select("id, sede_id, jornada")
    .eq("id", input.empleado_id)
    .single<{ id: string; sede_id: string; jornada: string }>();
  if (empErr || !emp) return { ok: false, error: "Empleado no encontrado." };

  // Validar permiso (admin o asignado a la sede)
  const { data: tieneAsign } = await supabase.rpc("usuario_tiene_asignacion", {
    p_sede: emp.sede_id,
    p_jornada: emp.jornada,
  });
  if (!tieneAsign) {
    const { data: perfil } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
    const rol = perfil?.rol;
    if (rol !== "ADMIN" && rol !== "SUPERADMIN" && rol !== "CEO") {
      return { ok: false, error: "No tienes asignada esa sede / jornada." };
    }
  }

  // Insert
  const { data: ins, error: insErr } = await supabase
    .from("incidencias")
    .insert({
      empleado_id: input.empleado_id,
      fecha: input.fecha,
      codigo: input.codigo,
      observacion: input.observacion?.trim() || null,
      cubre_id: input.cubre_id || null,
      autoriza: input.autoriza || null,
      documento_url: input.documento_url || null,
      capturado_por: user.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/incidencias");
  return { ok: true, id: ins!.id };
}

export async function eliminarIncidenciaAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión." };
  const { error } = await supabase.from("incidencias").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/incidencias");
  return { ok: true };
}
