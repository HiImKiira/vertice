"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Apaga el aviso "define tu nueva contraseña" después de que el usuario
 * guardó la suya en /cuenta. Tolera que la columna v34 no exista aún.
 */
export async function confirmarPasswordCambiadaAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  try {
    await supabaseAdmin()
      .from("usuarios")
      .update({ password_reset_pendiente: false })
      .eq("id", user.id);
  } catch {
    // columna v34 ausente — no pasa nada, el cambio de contraseña ya se hizo
  }
  revalidatePath("/dashboard");
  revalidatePath("/cuenta");
}
