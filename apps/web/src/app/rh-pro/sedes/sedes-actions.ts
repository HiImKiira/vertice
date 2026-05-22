"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SedeResult = { ok: true } | { ok: false; error: string };

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

function slugAbrev(nombre: string): string {
  const clean = nombre
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9 ]/g, "")
    .trim();
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 6);
  return parts.map((p) => p[0]).join("").slice(0, 6);
}

interface CrearSedeInput {
  codigo: string;
  nombre: string;
  abrev?: string | undefined;
  notas?: string | undefined;
}

export async function crearSedeAction(input: CrearSedeInput): Promise<SedeResult> {
  const auth = await requireAdmin();
  if (!auth.sb) return { ok: false, error: auth.error! };

  const codigo = input.codigo.trim().toUpperCase();
  const nombre = input.nombre.trim();
  if (!codigo || !nombre) return { ok: false, error: "Código y nombre requeridos." };

  const abrev = (input.abrev?.trim() || slugAbrev(nombre)).toUpperCase().slice(0, 8);

  const { error } = await auth.sb
    .from("sedes")
    .insert({
      codigo,
      nombre,
      abrev,
      notas: input.notas?.trim() || null,
      activa: true,
      ultimo_folio: 0,
    });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/rh-pro/sedes");
  revalidatePath("/rh-pro");
  return { ok: true };
}

interface EditarSedeInput {
  id: string;
  nombre: string;
  abrev: string;
  notas?: string | undefined;
}

export async function editarSedeAction(input: EditarSedeInput): Promise<SedeResult> {
  const auth = await requireAdmin();
  if (!auth.sb) return { ok: false, error: auth.error! };

  const { error } = await auth.sb
    .from("sedes")
    .update({
      nombre: input.nombre.trim(),
      abrev: input.abrev.trim().toUpperCase().slice(0, 8),
      notas: input.notas?.trim() || null,
    })
    .eq("id", input.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/rh-pro/sedes");
  revalidatePath("/rh-pro");
  return { ok: true };
}

export async function toggleSedeActivaAction(id: string, activa: boolean): Promise<SedeResult> {
  const auth = await requireAdmin();
  if (!auth.sb) return { ok: false, error: auth.error! };

  const { error } = await auth.sb.from("sedes").update({ activa }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/rh-pro/sedes");
  revalidatePath("/rh-pro");
  return { ok: true };
}

export async function eliminarSedeAction(id: string): Promise<SedeResult> {
  const auth = await requireAdmin();
  if (!auth.sb) return { ok: false, error: auth.error! };

  // Solo permite eliminar si la sede no tiene empleados activos.
  const { count } = await auth.sb
    .from("empleados")
    .select("id", { count: "exact", head: true })
    .eq("sede_id", id)
    .is("fecha_baja", null);

  if ((count ?? 0) > 0) {
    return { ok: false, error: `No se puede eliminar: ${count} empleados activos. Da de baja primero o desactiva la sede.` };
  }

  const { error } = await auth.sb.from("sedes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/rh-pro/sedes");
  revalidatePath("/rh-pro");
  return { ok: true };
}
