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

// ─────────────────────────────────────────────────────────────────────
// Datos personales / fiscales / bancarios
// ─────────────────────────────────────────────────────────────────────
export type DatosResult = { ok: true } | { ok: false; error: string };

export interface DatosPatch {
  rfc?: string | null;
  nss?: string | null;
  curp?: string | null;
  telefono?: string | null;
  email_personal?: string | null;
  direccion?: string | null;
  banco?: string | null;
  cuenta_bancaria?: string | null;
  clabe?: string | null;
}

export async function actualizarDatosEmpleadoAction(
  empleadoId: string,
  patch: DatosPatch,
): Promise<DatosResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión." };

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol, acceso_facturacion")
    .eq("id", user.id)
    .single<{ rol: string; acceso_facturacion: boolean }>();
  if (!perfil) return { ok: false, error: "Perfil no encontrado" };

  const esAdminLike = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol);
  const tieneAcceso = perfil.acceso_facturacion === true;
  if (!esAdminLike && !tieneAcceso) {
    return { ok: false, error: "Solo admin-like o acceso_facturacion." };
  }

  // Normalizar
  const update: Record<string, unknown> = {};
  const norm = (v: string | null | undefined): string | null => {
    if (v === undefined) return undefined as unknown as null; // no tocar
    if (v === null) return null;
    const t = String(v).trim();
    return t === "" ? null : t;
  };

  if (patch.rfc !== undefined) {
    const v = norm(patch.rfc);
    update.rfc = v ? v.toUpperCase().replace(/\s+/g, "") : null;
  }
  if (patch.nss !== undefined) {
    const v = norm(patch.nss);
    update.nss = v ? v.replace(/\D/g, "") : null;
  }
  if (patch.curp !== undefined) {
    const v = norm(patch.curp);
    update.curp = v ? v.toUpperCase().replace(/\s+/g, "") : null;
  }
  if (patch.telefono !== undefined) update.telefono = norm(patch.telefono);
  if (patch.email_personal !== undefined) {
    const v = norm(patch.email_personal);
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      return { ok: false, error: `Email "${v}" no tiene formato válido` };
    }
    update.email_personal = v ? v.toLowerCase() : null;
  }
  if (patch.direccion !== undefined) update.direccion = norm(patch.direccion);
  if (patch.banco !== undefined) update.banco = norm(patch.banco);
  if (patch.cuenta_bancaria !== undefined) {
    const v = norm(patch.cuenta_bancaria);
    update.cuenta_bancaria = v ? v.replace(/\s+/g, "") : null;
  }
  if (patch.clabe !== undefined) {
    const v = norm(patch.clabe);
    if (v && v.replace(/\D/g, "").length !== 18) {
      return { ok: false, error: "CLABE debe ser exactamente 18 dígitos" };
    }
    update.clabe = v ? v.replace(/\D/g, "") : null;
  }

  // Remover claves "undefined" para no enviarlas
  for (const k of Object.keys(update)) {
    if (update[k] === undefined) delete update[k];
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase.from("empleados").update(update).eq("id", empleadoId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/rh-pro/consulta/${empleadoId}`);
  return { ok: true };
}
