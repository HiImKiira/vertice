"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type LibResult = { ok: true } | { ok: false; error: string };

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

interface LiberarInput {
  fecha: string;
  horas: number | null; // null = indefinido
  motivo: string;
}

export async function crearLiberacionAction(input: LiberarInput): Promise<LibResult> {
  const auth = await requireAdmin();
  if (!auth.sb) return { ok: false, error: auth.error! };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) {
    return { ok: false, error: "Fecha inválida (YYYY-MM-DD)." };
  }

  const expira_en = input.horas && input.horas > 0
    ? new Date(Date.now() + input.horas * 3600 * 1000).toISOString()
    : null;

  const basePayload = {
    fecha: input.fecha,
    liberado_por: auth.userId!,
    motivo: input.motivo.trim() || `Liberación manual (${input.horas ? `${input.horas}h` : "indefinida"})`,
    activo: true,
  };

  const admin = supabaseAdmin();
  let error = (await admin.from("fechas_liberadas").upsert(
    { ...basePayload, expira_en },
    { onConflict: "fecha" },
  )).error;

  if (error && /expira_en/i.test(error.message)) {
    error = (await admin.from("fechas_liberadas").upsert(basePayload, { onConflict: "fecha" })).error;
  }

  if (error) return { ok: false, error: error.message };

  revalidatePath("/rh-pro/liberaciones");
  revalidatePath("/rh-pro");
  revalidatePath("/pase-lista");
  return { ok: true };
}

export async function revocarLiberacionAction(id: string): Promise<LibResult> {
  const auth = await requireAdmin();
  if (!auth.sb) return { ok: false, error: auth.error! };

  const admin = supabaseAdmin();
  const { error } = await admin.from("fechas_liberadas").update({ activo: false }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/rh-pro/liberaciones");
  return { ok: true };
}

export async function extenderLiberacionAction(id: string, horas: number): Promise<LibResult> {
  const auth = await requireAdmin();
  if (!auth.sb) return { ok: false, error: auth.error! };

  const admin = supabaseAdmin();
  const nuevoExpira = new Date(Date.now() + horas * 3600 * 1000).toISOString();

  const { error } = await admin
    .from("fechas_liberadas")
    .update({ expira_en: nuevoExpira, activo: true })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/rh-pro/liberaciones");
  return { ok: true };
}
