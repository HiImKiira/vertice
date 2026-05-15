"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CODIGOS, type CodigoAsistencia } from "@vertice/shared/codes";

export type BulkResult = { ok: true; saved: number } | { ok: false; error: string };

interface Marca {
  empleado_id: string;
  fecha: string;
  codigo: CodigoAsistencia;
}

/**
 * Guarda múltiples marcas para múltiples empleados/fechas en un solo batch.
 * Usado por la pantalla de captura rápida (rh-pro/empleados).
 * Solo ADMIN+ pueden invocar (admin tiene bypass de ventana de gracia).
 */
export async function guardarMarcasBulkAction(marcas: Marca[]): Promise<BulkResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión." };

  const { data: perfil } = await supabase.from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  const rol = perfil?.rol;
  if (!["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(rol ?? "")) {
    return { ok: false, error: "Solo ADMIN/SUPERADMIN pueden usar la captura rápida." };
  }

  const valid = marcas.filter(
    (m) =>
      CODIGOS.includes(m.codigo) &&
      /^\d{4}-\d{2}-\d{2}$/.test(m.fecha) &&
      m.empleado_id,
  );
  if (!valid.length) return { ok: true, saved: 0 };

  const rows = valid.map((m) => ({
    empleado_id: m.empleado_id,
    fecha: m.fecha,
    codigo: m.codigo,
    capturado_por: user.id,
  }));

  const { error } = await supabase
    .from("asistencias")
    .upsert(rows, { onConflict: "empleado_id,fecha" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/rh-pro/empleados");
  return { ok: true, saved: valid.length };
}
