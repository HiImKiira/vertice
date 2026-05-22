"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BajaResult = { ok: true; empleadoId: string } | { ok: false; error: string };

export interface BajaInput {
  empleado_id: string;
  fecha_baja: string;        // YYYY-MM-DD
  motivo: string;
  observaciones?: string | undefined;
}

export async function darDeBajaEmpleadoAction(input: BajaInput): Promise<BajaResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión." };

  const { data: perfil } = await supabase.from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN"].includes(perfil.rol)) {
    return { ok: false, error: "Solo ADMIN o SUPERADMIN pueden dar de baja." };
  }

  if (!input.empleado_id || !input.fecha_baja || !input.motivo.trim()) {
    return { ok: false, error: "Faltan campos obligatorios (empleado, fecha, motivo)." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha_baja)) {
    return { ok: false, error: "Fecha de baja inválida." };
  }

  const { data: emp, error: empErr } = await supabase
    .from("empleados")
    .update({
      fecha_baja: input.fecha_baja,
      motivo_baja: input.motivo.trim(),
      baja_capturado_por: user.id,
      baja_ts: new Date().toISOString(),
      status: "BAJA",
    })
    .eq("id", input.empleado_id)
    .is("fecha_baja", null)            // solo si está activo
    .select("id, nombre")
    .single<{ id: string; nombre: string }>();

  if (empErr) return { ok: false, error: `Empleado: ${empErr.message}` };
  if (!emp) return { ok: false, error: "Empleado no encontrado o ya está dado de baja." };

  // Si tiene contrato activo, agregar nota en observaciones
  await supabase
    .from("contratos")
    .update({ observaciones: `Empleado dado de baja el ${input.fecha_baja}. Motivo: ${input.motivo.trim()}${input.observaciones ? " · " + input.observaciones : ""}` })
    .eq("empleado_id", input.empleado_id);

  revalidatePath("/rh-pro/baja");
  revalidatePath("/rh-pro");
  return { ok: true, empleadoId: emp.id };
}
