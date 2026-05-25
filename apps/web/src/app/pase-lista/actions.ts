"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CODIGOS, type CodigoAsistencia } from "@vertice/shared/codes";

export type GuardarResult =
  | { ok: true; saved: number; skipped: number; protegidas?: number | undefined; mensaje?: string | undefined }
  | { ok: false; error: string };

interface MarcaInput {
  empleado_id: string;
  codigo: CodigoAsistencia;
}

/**
 * Guarda un batch de marcas con política de inmutabilidad:
 *   - Marcas NUEVAS (no existían): cualquier supervisor con asignación puede crearlas.
 *   - Marcas EXISTENTES: solo SOPORTE/ADMIN/SUPERADMIN/CEO pueden sobrescribir.
 *     Los supervisores normales NO pueden modificar lo ya capturado — se les
 *     reporta como "protegidas" en el resultado.
 *
 * Se divide en INSERT (rows nuevos) y UPDATE (rows existentes con mismo
 * código) para que cada operación pegue a su propia policy de RLS sin
 * confundirse en el path de upsert.
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

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .single<{ rol: string }>();
  const rol = perfil?.rol;
  const esAdminLike = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(rol ?? "");

  // Validar asignación
  const { data: tieneAsign, error: errAsign } = await supabase.rpc("usuario_tiene_asignacion", {
    p_sede: input.sede_id,
    p_jornada: input.jornada,
  });
  if (errAsign) return { ok: false, error: `RPC asignación: ${errAsign.message}` };
  if (!tieneAsign && !esAdminLike) {
    return { ok: false, error: "No tienes asignada esta sede / jornada." };
  }

  // Validar ventana de gracia
  const { data: ventana, error: errVent } = await supabase.rpc("evaluar_ventana_gracia", {
    p_fecha: input.fecha,
  });
  if (errVent) return { ok: false, error: `RPC ventana: ${errVent.message}` };
  const ventanaRow = (ventana as Array<{ resultado: string }>)?.[0];
  if (ventanaRow && !["OK", "LIBERADA", "SUPER"].includes(ventanaRow.resultado)) {
    return {
      ok: false,
      error:
        ventanaRow.resultado === "FUTURO"
          ? "No puedes capturar fechas futuras."
          : "La fecha está fuera de la ventana de gracia. Solicita liberación al Superadmin.",
    };
  }

  // Validar códigos
  const validos = new Set<string>(CODIGOS);
  const valid = input.marcas.filter((m) => validos.has(m.codigo));
  const skipped = input.marcas.length - valid.length;
  if (!valid.length) return { ok: true, saved: 0, skipped };

  // Consultar cuáles ya existen para esa fecha
  const empleadoIds = valid.map((m) => m.empleado_id);
  const { data: existentes, error: errEx } = await supabase
    .from("asistencias")
    .select("empleado_id, codigo, capturado_por")
    .eq("fecha", input.fecha)
    .in("empleado_id", empleadoIds);
  if (errEx) return { ok: false, error: `Consulta previa: ${errEx.message}` };

  const existeMap = new Map(
    ((existentes ?? []) as Array<{ empleado_id: string; codigo: string; capturado_por: string }>)
      .map((r) => [r.empleado_id, r]),
  );

  // Partir en inserts (no existían) y updates (existían — solo si admin-like)
  const aInsertar: typeof valid = [];
  const aActualizar: typeof valid = [];
  let protegidas = 0;

  for (const m of valid) {
    const prev = existeMap.get(m.empleado_id);
    if (!prev) {
      aInsertar.push(m);
    } else {
      // Si el código es el mismo, no hay cambio real — saltamos
      if (prev.codigo === m.codigo) continue;
      if (esAdminLike) {
        aActualizar.push(m);
      } else {
        // Supervisor intenta sobrescribir marca existente — bloqueado
        protegidas++;
      }
    }
  }

  let saved = 0;

  // INSERT de nuevas
  if (aInsertar.length > 0) {
    const insertRows = aInsertar.map((m) => ({
      empleado_id: m.empleado_id,
      fecha: input.fecha,
      codigo: m.codigo,
      capturado_por: user.id,
    }));
    const { error: errIns } = await supabase.from("asistencias").insert(insertRows);
    if (errIns) {
      // Si pasa RLS aún, devolver mensaje claro
      return { ok: false, error: `Insert: ${errIns.message}` };
    }
    saved += insertRows.length;
  }

  // UPDATE individual de existentes (solo admin-like llegan aquí)
  for (const m of aActualizar) {
    const { error: errUpd } = await supabase
      .from("asistencias")
      .update({ codigo: m.codigo, capturado_por: user.id })
      .eq("empleado_id", m.empleado_id)
      .eq("fecha", input.fecha);
    if (errUpd) return { ok: false, error: `Update ${m.empleado_id}: ${errUpd.message}` };
    saved++;
  }

  revalidatePath("/pase-lista");

  let mensaje: string | undefined;
  if (protegidas > 0) {
    mensaje = `${protegidas} marca(s) protegida(s) — ya estaban capturadas y solo RH puede modificarlas.`;
  }
  return { ok: true, saved, skipped, protegidas, mensaje };
}
