"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DescansoResult = { ok: true } | { ok: false; error: string };

export type DiaSemana = "LUN" | "MAR" | "MIE" | "JUE" | "VIE" | "SAB" | "DOM";
export const DIAS_VALIDOS: DiaSemana[] = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"];

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { sb: null, error: "Sin sesión.", userId: null };
  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol)) {
    return { sb: null, error: "Solo ADMIN/SUPERADMIN/SOPORTE.", userId: null };
  }
  return { sb: supabase, userId: user.id, error: null };
}

export async function setDescansoSemanalAction(
  empleadoId: string,
  dias: DiaSemana[],
): Promise<DescansoResult> {
  const auth = await requireAdmin();
  if (!auth.sb) return { ok: false, error: auth.error! };

  // Validar
  if (!empleadoId) return { ok: false, error: "Empleado requerido." };
  const limpios = [...new Set(dias.filter((d) => DIAS_VALIDOS.includes(d)))];
  if (limpios.length === 0) {
    return { ok: false, error: "Al menos 1 día de descanso es obligatorio (la columna es NOT NULL)." };
  }
  if (limpios.length > 2) {
    return { ok: false, error: "Máximo 2 días de descanso por empleado (caso administrativo)." };
  }

  const { error } = await auth.sb
    .from("empleados")
    .update({ dia_descanso: limpios })
    .eq("id", empleadoId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/rh-pro/descansos-semanales");
  revalidatePath("/pase-lista");
  return { ok: true };
}
