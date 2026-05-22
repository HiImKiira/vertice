"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AsignResult = { ok: true } | { ok: false; error: string };

interface AgregarInput {
  usuario_id: string;
  sede_id: string;
  jornada: "MATUTINO" | "VESPERTINO" | "NOCTURNO" | "TURNO_ROTATIVO" | "CUBRETURNOS" | "DIURNO";
}

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { sb: null, error: "Sin sesión." };
  const { data: perfil } = await supabase.from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN"].includes(perfil.rol)) {
    return { sb: null, error: "Solo ADMIN/SUPERADMIN." };
  }
  return { sb: supabase, userId: user.id };
}

export async function agregarAsignacionAction(input: AgregarInput): Promise<AsignResult> {
  const auth = await requireAdmin();
  if (!auth.sb) return { ok: false, error: auth.error! };

  if (!input.usuario_id || !input.sede_id || !input.jornada) {
    return { ok: false, error: "Faltan campos." };
  }

  // Upsert: si existe inactivo, lo reactiva; si existe activo, no-op (constraint unique)
  const { error: upErr } = await auth.sb
    .from("asignaciones_supervisor")
    .upsert({
      usuario_id: input.usuario_id,
      sede_id: input.sede_id,
      jornada: input.jornada,
      activo: true,
      creado_por: auth.userId,
    }, { onConflict: "usuario_id,sede_id,jornada" });

  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath("/rh-pro");
  return { ok: true };
}

export async function eliminarAsignacionAction(asignacionId: string): Promise<AsignResult> {
  const auth = await requireAdmin();
  if (!auth.sb) return { ok: false, error: auth.error! };

  // Soft delete: marca inactivo. Preserva historial.
  const { error } = await auth.sb
    .from("asignaciones_supervisor")
    .update({ activo: false })
    .eq("id", asignacionId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/rh-pro");
  return { ok: true };
}
