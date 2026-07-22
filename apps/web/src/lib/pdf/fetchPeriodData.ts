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
  /** True si el empleado cambió de sede dentro del periodo del reporte */
  cambio_durante_periodo?: boolean | undefined;
  /** Días que efectivamente estuvo en la sede del reporte (post-snapshot) */
  dias_en_sede?: number | undefined;
  /** Fecha de ingreso — para marcar NUEVO INGRESO en el periodo */
  fecha_alta?: string | undefined;
  /** Fecha de baja — para marcar BAJA en el periodo */
  fecha_baja?: string | null | undefined;
}

/** DD/MM para las notas del reporte. */
export function ddmm(iso: string): string {
  const p = iso.split("-");
  return `${p[2]}/${p[1]}`;
}

/** ¿El trabajador ingresó DENTRO del periodo del reporte? */
export function esNuevoIngreso(e: Empleado, start: string, end: string): boolean {
  return !!e.fecha_alta && e.fecha_alta >= start && e.fecha_alta <= end;
}

/** ¿El trabajador fue dado de baja DENTRO del periodo del reporte? */
export function esBajaEnPeriodo(e: Empleado, start: string, end: string): boolean {
  return !!e.fecha_baja && e.fecha_baja >= start && e.fecha_baja <= end;
}

/**
 * Completa fecha_alta / fecha_baja de los empleados del reporte. El RPC de
 * periodo ya trae fecha_baja, pero no fecha_alta; aquí se resuelven ambas de
 * una sola consulta para poder marcar altas y bajas en PDF y Excel.
 */
export async function enriquecerConAltaBaja(
  sb: SupabaseClient,
  empleados: Empleado[],
): Promise<Empleado[]> {
  if (!empleados.length) return empleados;
  const { data } = await sb
    .from("empleados")
    .select("id, fecha_alta, fecha_baja")
    .in("id", empleados.map((e) => e.id));
  const map = new Map(
    ((data ?? []) as Array<{ id: string; fecha_alta: string | null; fecha_baja: string | null }>)
      .map((r) => [r.id, r]),
  );
  return empleados.map((e) => {
    const d = map.get(e.id);
    return {
      ...e,
      fecha_alta: d?.fecha_alta ?? undefined,
      fecha_baja: d?.fecha_baja ?? e.fecha_baja ?? null,
    };
  });
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

/**
 * Empleados activos por sede actual — vista sin snapshot histórico.
 * Útil para listados de hoy / pase de lista.
 */
export async function fetchEmpleadosActivos(sb: SupabaseClient, sedeId: string): Promise<Empleado[]> {
  const { data } = await sb
    .from("empleados")
    .select("id, numero_empleado, nombre, jornada, salario_diario")
    .eq("sede_id", sedeId)
    .is("fecha_baja", null)
    .order("numero_empleado");
  return (data ?? []) as Empleado[];
}

/**
 * Empleados que ESTUVIERON en la sede durante el periodo (snapshot histórico).
 * Si Juanita se cambió de O'Horán a UNEME el día 10, en el reporte de O'Horán
 * 1-15 aparecerá Juanita con flag cambio_durante_periodo=true y dias_en_sede=9
 * (días 1-9). En el reporte de UNEME 1-15 también aparece, con dias_en_sede=6.
 *
 * Requiere v21 SQL (sede_efectiva + empleados_por_sede_periodo). Si la RPC
 * falla por estar ausente, cae al método clásico (sede actual).
 */
export async function fetchEmpleadosPorSedePeriodo(
  sb: SupabaseClient,
  sedeId: string,
  start: string,
  end: string,
): Promise<Empleado[]> {
  const { data, error } = await sb.rpc("empleados_por_sede_periodo", {
    p_sede: sedeId,
    p_inicio: start,
    p_fin: end,
  });
  if (error) {
    console.error("[fetchEmpleadosPorSedePeriodo] fallback:", error.message);
    return fetchEmpleadosActivos(sb, sedeId);
  }
  return ((data ?? []) as Array<{
    empleado_id: string;
    numero_empleado: string;
    nombre: string;
    jornada: string;
    salario_diario: number;
    fecha_baja: string | null;
    cambio_durante_periodo: boolean;
    dias_en_sede: number;
  }>).map((r) => ({
    id: r.empleado_id,
    numero_empleado: r.numero_empleado,
    nombre: r.nombre,
    jornada: r.jornada,
    salario_diario: r.salario_diario,
    fecha_baja: r.fecha_baja,
    cambio_durante_periodo: r.cambio_durante_periodo,
    dias_en_sede: r.dias_en_sede,
  }));
}

/**
 * Marcas de asistencia básicas (sin filtro por sede).
 */
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

/**
 * Marcas FILTRADAS por sede vigente cada día. Si Juanita estaba en O'Horán
 * del 1 al 9 y luego se cambió a UNEME, este fetch:
 *   - Para sedeId=O'Horán → devuelve sólo sus marcas del 1 al 9
 *   - Para sedeId=UNEME → devuelve sólo sus marcas del 10 al 15
 */
export async function fetchMarcasConSnapshot(
  sb: SupabaseClient,
  empleadoIds: string[],
  sedeId: string,
  start: string,
  end: string,
): Promise<Record<string, Record<string, CodigoAsistencia>>> {
  if (!empleadoIds.length) return {};
  const map: Record<string, Record<string, CodigoAsistencia>> = {};
  await Promise.all(
    empleadoIds.map(async (empId) => {
      const { data, error } = await sb.rpc("asistencias_empleado_en_sede", {
        p_empleado: empId,
        p_sede: sedeId,
        p_inicio: start,
        p_fin: end,
      });
      if (error) {
        console.error("[fetchMarcasConSnapshot] empId=" + empId, error.message);
        return;
      }
      const rows = (data ?? []) as Array<{ fecha: string; codigo: CodigoAsistencia }>;
      if (rows.length === 0) return;
      map[empId] = {};
      for (const r of rows) map[empId]![r.fecha] = r.codigo;
    }),
  );
  return map;
}
