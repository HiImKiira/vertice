"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type NotaResult = { ok: true } | { ok: false; error: string };

export async function guardarNotaAction(empleadoId: string, notas: string): Promise<NotaResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión." };

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol)) {
    return { ok: false, error: "Solo ADMIN/SUPERADMIN/SOPORTE." };
  }

  const limpia = notas.trim();
  const { error } = await supabase
    .from("empleados")
    .update({
      notas: limpia || null,
      notas_actualizado_en: new Date().toISOString(),
      notas_actualizado_por: user.id,
    })
    .eq("id", empleadoId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/rh-pro/consulta/${empleadoId}`);
  revalidatePath("/rh-pro/consulta");
  return { ok: true };
}
