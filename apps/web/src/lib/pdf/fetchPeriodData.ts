import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CodigoAsistencia } from "@vertice/shared/codes";

export interface Sede {
  id: string;
  codigo: string;
  abrev: string;
  nombre: string;
}
export interface Empleado {
  id: string;
  numero_empleado: string;
  nombre: string;
  jornada: string;
  salario_diario: number;
}

/** Genera el array de fechas YYYY-MM-DD entre start y end (inclusive). */
export function rangeDates(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

/** Q1 = día 1..15 del mes (YYYY-MM). Q2 = día 16..fin de mes. */
export function quincenaRange(ym: string, q: "Q1" | "Q2"): { start: string; end: string } {
  const parts = ym.split("-");
  const y = Number(parts[0]!);
  const m = Number(parts[1]!);
  if (q === "Q1") {
    return { start: `${y}-${String(m).padStart(2, "0")}-01`, end: `${y}-${String(m).padStart(2, "0")}-15` };
  }
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${y}-${String(m).padStart(2, "0")}-16`, end: `${y}-${String(m).padStart(2, "0")}-${lastDay}` };
}

export async function fetchSede(sb: SupabaseClient, sedeId: string): Promise<Sede | null> {
  const { data } = await sb.from("sedes").select("id, codigo, abrev, nombre").eq("id", sedeId).maybeSingle<Sede>();
  return data ?? null;
}

export async function fetchEmpleadosActivos(sb: SupabaseClient, sedeId: string): Promise<Empleado[]> {
  const { data } = await sb
    .from("empleados")
    .select("id, numero_empleado, nombre, jornada, salario_diario")
    .eq("sede_id", sedeId)
    .is("fecha_baja", null)
    .order("numero_empleado");
  return (data ?? []) as Empleado[];
}

export async function fetchMarcas(
  sb: SupabaseClient,
  empleadoIds: string[],
  start: string,
  end: string,
): Promise<Record<string, Record<string, CodigoAsistencia>>> {
  if (!empleadoIds.length) return {};
  const { data } = await sb
    .from("asistencias")
    .select("empleado_id, fecha, codigo")
    .in("empleado_id", empleadoIds)
    .gte("fecha", start)
    .lte("fecha", end);
  const map: Record<string, Record<string, CodigoAsistencia>> = {};
  for (const m of (data ?? []) as { empleado_id: string; fecha: string; codigo: CodigoAsistencia }[]) {
    if (!map[m.empleado_id]) map[m.empleado_id] = {};
    map[m.empleado_id]![m.fecha] = m.codigo;
  }
  return map;
}
