"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CDTResult = { ok: true; id: string } | { ok: false; error: string };

export interface CDTInput {
  empleado_id: string;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin: string;
  dia_descanso_orig: "LUN" | "MAR" | "MIE" | "JUE" | "VIE" | "SAB" | "DOM";
  dia_descanso_temp: "LUN" | "MAR" | "MIE" | "JUE" | "VIE" | "SAB" | "DOM";
  motivo: string;
  autoriza?: string | null;
}

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { sb: null, error: "Sin sesión.", userId: null };
  const { data: perfil } = await supabase.from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "USER"].includes(perfil.rol)) {
    return { sb: null, error: "Acceso restringido.", userId: null };
  }
  return { sb: supabase, userId: user.id, rol: perfil.rol };
}

export async function crearCDTAction(input: CDTInput): Promise<CDTResult> {
  const auth = await requireAdmin();
  if (!auth.sb) return { ok: false, error: auth.error! };

  if (!input.empleado_id || !input.fecha_inicio || !input.fecha_fin || !input.motivo.trim()) {
    return { ok: false, error: "Faltan campos obligatorios." };
  }
  if (input.fecha_inicio > input.fecha_fin) {
    return { ok: false, error: "La fecha de inicio debe ser anterior o igual a la fin." };
  }

  // Necesitamos sede_id del empleado
  const { data: emp } = await auth.sb
    .from("empleados")
    .select("sede_id")
    .eq("id", input.empleado_id)
    .single<{ sede_id: string }>();
  if (!emp) return { ok: false, error: "Empleado no encontrado." };

  // Insert
  const { data: cdt, error } = await auth.sb
    .from("cdts")
    .insert({
      empleado_id: input.empleado_id,
      sede_id: emp.sede_id,
      fecha_original: input.fecha_inicio,    // legacy compat
      fecha_temporal: input.fecha_fin,
      fecha_fin: input.fecha_fin,
      dia_descanso_orig: input.dia_descanso_orig,
      dia_descanso_temp: input.dia_descanso_temp,
      motivo: input.motivo.trim(),
      autoriza: input.autoriza || null,
      creado_por: auth.userId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !cdt) return { ok: false, error: error?.message ?? "no creado" };

  revalidatePath("/descansos");
  return { ok: true, id: cdt.id };
}

export async function cancelarCDTAction(id: string): Promise<CDTResult> {
  const auth = await requireAdmin();
  if (!auth.sb) return { ok: false, error: auth.error! };
  if (auth.rol === "USER") return { ok: false, error: "Solo ADMIN/SUPERADMIN puede cancelar." };

  const { error } = await auth.sb
    .from("cdts")
    .update({ cancelado_en: new Date().toISOString(), cancelado_por: auth.userId })
    .eq("id", id)
    .is("cancelado_en", null);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/descansos");
  return { ok: true, id };
}
