"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type LibResult = { ok: true } | { ok: false; error: string };

async function requireAdminLike() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" } as const;
  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol)) {
    return { ok: false, error: "Solo soporte/admin" } as const;
  }
  return { ok: true, userId: user.id } as const;
}

export async function activarLiberacionGlobalAction(
  horas: number | null,
  motivo: string | null,
): Promise<LibResult> {
  const auth = await requireAdminLike();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = supabaseAdmin();

  // Desactivar todas las anteriores activas (solo una a la vez)
  await admin
    .from("liberaciones_globales")
    .update({ activo: false, desactivado_por: auth.userId, desactivado_en: new Date().toISOString() })
    .eq("activo", true);

  const expira_en = horas ? new Date(Date.now() + horas * 3600 * 1000).toISOString() : null;

  const { error } = await admin
    .from("liberaciones_globales")
    .insert({
      activado_por: auth.userId,
      expira_en,
      motivo: motivo?.trim() || null,
      activo: true,
    });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/rh-pro/liberacion-global");
  revalidatePath("/rh-pro");
  revalidatePath("/pase-lista");
  return { ok: true };
}

export async function desactivarLiberacionGlobalAction(): Promise<LibResult> {
  const auth = await requireAdminLike();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("liberaciones_globales")
    .update({ activo: false, desactivado_por: auth.userId, desactivado_en: new Date().toISOString() })
    .eq("activo", true);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/rh-pro/liberacion-global");
  revalidatePath("/rh-pro");
  revalidatePath("/pase-lista");
  return { ok: true };
}
