"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CODIGOS, type CodigoAsistencia } from "@vertice/shared/codes";

export type GuardarResult =
  | { ok: true; saved: number; skipped: number }
  | { ok: false; error: string };

interface MarcaInput {
  empleado_id: string;
  codigo: CodigoAsistencia;
}

/**
 * Guarda un batch de marcas. Valida:
 *   1) Sesión activa
 *   2) Usuario tiene la asignación (sede × jornada) — vía RPC
 *   3) Fecha dentro de ventana de gracia — vía RPC `evaluar_ventana_gracia`
 *   4) Códigos válidos
 *
 * Hace UPSERT por (empleado_id, fecha). El RLS de la tabla `asistencias`
 * vuelve a validar al insertar.
 */
export async function guardarPaseListaAction(input: {
  fecha: string;
  sede_id: string;
  jornada: string;
  marcas: MarcaInput[];
}): Promise<GuardarResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión." };

  // Validar asignación
  const { data: tieneAsign, error: errAsign } = await supabase.rpc("usuario_tiene_asignacion", {
    p_sede: input.sede_id,
    p_jornada: input.jornada,
  });
  if (errAsign) return { ok: false, error: `RPC asignación: ${errAsign.message}` };
  if (!tieneAsign) {
    // los admins igual pueden capturar; revisamos rol
    const { data: perfil } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
    const rol = perfil?.rol;
    if (rol !== "ADMIN" && rol !== "SUPERADMIN" && rol !== "CEO") {
      return { ok: false, error: "No tienes asignada esta sede / jornada." };
    }
  }

  // Validar ventana de gracia
  const { data: ventana, error: errVent } = await supabase.rpc("evaluar_ventana_gracia", {
    p_fecha: input.fecha,
  });
  if (errVent) return { ok: false, error: `RPC ventana: ${errVent.message}` };
  const row = (ventana as Array<{ resultado: string }>)?.[0];
  if (row && !["OK", "LIBERADA", "SUPER"].includes(row.resultado)) {
    return {
      ok: false,
      error:
        row.resultado === "FUTURO"
          ? "No puedes capturar fechas futuras."
          : "La fecha está fuera de la ventana de gracia. Solicita liberación al Superadmin.",
    };
  }

  // Validar códigos
  const validos = new Set<string>(CODIGOS);
  const valid = input.marcas.filter((m) => validos.has(m.codigo));
  const skipped = input.marcas.length - valid.length;
  if (!valid.length) return { ok: true, saved: 0, skipped };

  // Upsert por (empleado_id, fecha). RLS validará otra vez.
  const rows = valid.map((m) => ({
    empleado_id: m.empleado_id,
    fecha: input.fecha,
    codigo: m.codigo,
    capturado_por: user.id,
  }));

  const { error: errIns } = await supabase
    .from("asistencias")
    .upsert(rows, { onConflict: "empleado_id,fecha" });
  if (errIns) return { ok: false, error: `Upsert: ${errIns.message}` };

  revalidatePath("/pase-lista");
  return { ok: true, saved: valid.length, skipped };
}
