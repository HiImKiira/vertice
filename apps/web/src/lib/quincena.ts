import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Fecha de hoy en Mérida (UTC-6) como YYYY-MM-DD. */
export function meridaToday(): string {
  const d = new Date();
  d.setHours(d.getHours() - 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface QuincenaInfo {
  ym: string;      // YYYY-MM
  q: "Q1" | "Q2";
  start: string;   // YYYY-MM-DD
  end: string;     // YYYY-MM-DD
  label: string;   // "1–15 de julio 2026"
}

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

/** Quincena a la que pertenece una fecha (Q1 = 1..15, Q2 = 16..fin de mes). */
export function quincenaDe(fecha: string): QuincenaInfo {
  const [ys, ms, ds] = fecha.split("-");
  const y = Number(ys), m = Number(ms), d = Number(ds);
  const mm = String(m).padStart(2, "0");
  if (d <= 15) {
    return { ym: `${y}-${mm}`, q: "Q1", start: `${y}-${mm}-01`, end: `${y}-${mm}-15`, label: `1–15 de ${MESES[m - 1]} ${y}` };
  }
  const ultimo = new Date(y, m, 0).getDate();
  return { ym: `${y}-${mm}`, q: "Q2", start: `${y}-${mm}-16`, end: `${y}-${mm}-${ultimo}`, label: `16–${ultimo} de ${MESES[m - 1]} ${y}` };
}

/** Lista de fechas YYYY-MM-DD entre start y end inclusive. */
export function diasEntre(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  for (let d = new Date(s); d <= e; d = new Date(d.getTime() + 86_400_000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * ¿Se le debe exigir marca a este trabajador ESE día?
 *
 * Regla operativa (provisional, acordada con RH): el alta se captura **un día
 * antes** de que la persona entre a laborar, así que se le empieza a contar a
 * partir del día SIGUIENTE a su fecha_alta. Excepción: si ya tiene marca ese
 * día, sí se cuenta (entonces sí trabajó y no debe romper el porcentaje).
 *
 * También quedan fuera quienes ya estaban dados de baja ese día.
 */
export function seEsperaEseDia(
  e: { id: string; fecha_alta: string | null; fecha_baja: string | null },
  fecha: string,
  marcadosEseDia: Set<string>,
): boolean {
  if (e.fecha_baja && e.fecha_baja < fecha) return false;
  if (!e.fecha_alta) return true;
  if (e.fecha_alta < fecha) return true;   // ya llevaba al menos un día de alta
  return marcadosEseDia.has(e.id);          // es su día de alta: solo si ya se marcó
}

export interface DiaCobertura {
  fecha: string;
  esperados: number;
  capturados: number;
  pct: number;
  completo: boolean;   // 100%
  futuro: boolean;     // aún no llega
}

export interface CoberturaQuincena {
  quincena: QuincenaInfo;
  dias: DiaCobertura[];
  diasTranscurridos: number;
  diasCompletos: number;
  diasIncompletos: string[];  // fechas pasadas que NO están al 100%
  pctGlobal: number;          // capturados / esperados a hoy
  totalEsperados: number;
  totalCapturados: number;
  sinAsignaciones: boolean;
}

/**
 * Cobertura día por día de la quincena para un supervisor: cuántos de sus
 * trabajadores tiene capturados cada día y qué días están al 100%.
 *
 * "Esperados" de un día = trabajadores de sus sedes×jornadas asignadas que ya
 * estaban dados de alta y aún no dados de baja ESE día.
 */
export async function coberturaQuincena(
  sb: SupabaseClient,
  usuarioId: string,
  hoy: string = meridaToday(),
): Promise<CoberturaQuincena> {
  const quincena = quincenaDe(hoy);
  const fechas = diasEntre(quincena.start, quincena.end);
  const vacia: CoberturaQuincena = {
    quincena, dias: [], diasTranscurridos: 0, diasCompletos: 0, diasIncompletos: [],
    pctGlobal: 0, totalEsperados: 0, totalCapturados: 0, sinAsignaciones: true,
  };

  // 1) Asignaciones activas del supervisor (sede × jornada)
  const { data: asig } = await sb
    .from("asignaciones_supervisor")
    .select("sede_id, jornada")
    .eq("usuario_id", usuarioId)
    .eq("activo", true);
  const pares = (asig ?? []) as Array<{ sede_id: string; jornada: string }>;
  if (pares.length === 0) return vacia;

  const sedeIds = [...new Set(pares.map((a) => a.sede_id))];
  const jornadas = [...new Set(pares.map((a) => a.jornada))];
  const comboOk = new Set(pares.map((a) => `${a.sede_id}|${a.jornada}`));

  // 2) Trabajadores de esas sedes/jornadas (filtramos combo exacto en JS)
  const { data: empsRaw } = await sb
    .from("empleados")
    .select("id, sede_id, jornada, fecha_alta, fecha_baja")
    .in("sede_id", sedeIds)
    .in("jornada", jornadas);
  const empleados = ((empsRaw ?? []) as Array<{
    id: string; sede_id: string; jornada: string; fecha_alta: string | null; fecha_baja: string | null;
  }>).filter((e) => comboOk.has(`${e.sede_id}|${e.jornada}`));
  if (empleados.length === 0) return { ...vacia, sinAsignaciones: false };

  // 3) Marcas de la quincena
  const { data: asisRaw } = await sb
    .from("asistencias")
    .select("empleado_id, fecha")
    .in("empleado_id", empleados.map((e) => e.id))
    .gte("fecha", quincena.start)
    .lte("fecha", quincena.end);
  const porDia = new Map<string, Set<string>>();
  for (const a of (asisRaw ?? []) as Array<{ empleado_id: string; fecha: string }>) {
    if (!porDia.has(a.fecha)) porDia.set(a.fecha, new Set());
    porDia.get(a.fecha)!.add(a.empleado_id);
  }

  // 4) Cálculo por día
  const dias: DiaCobertura[] = fechas.map((f) => {
    const futuro = f > hoy;
    const marcados = porDia.get(f) ?? new Set<string>();
    // Quiénes DEBEN estar marcados ese día (ver seEsperaEse Día).
    const esperadosArr = empleados.filter((e) => seEsperaEseDia(e, f, marcados));
    const esperados = esperadosArr.length;
    // Solo cuentan como capturados los que además eran esperados, para que
    // el porcentaje nunca pase de 100%.
    const capturados = futuro ? 0 : esperadosArr.filter((e) => marcados.has(e.id)).length;
    const pct = esperados > 0 && !futuro ? Math.round((capturados / esperados) * 100) : 0;
    return { fecha: f, esperados, capturados, pct, completo: !futuro && esperados > 0 && capturados >= esperados, futuro };
  });

  const pasados = dias.filter((d) => !d.futuro);
  const totalEsperados = pasados.reduce((a, d) => a + d.esperados, 0);
  const totalCapturados = pasados.reduce((a, d) => a + d.capturados, 0);

  return {
    quincena,
    dias,
    diasTranscurridos: pasados.length,
    diasCompletos: pasados.filter((d) => d.completo).length,
    diasIncompletos: pasados.filter((d) => !d.completo).map((d) => d.fecha),
    pctGlobal: totalEsperados > 0 ? Math.round((totalCapturados / totalEsperados) * 100) : 0,
    totalEsperados,
    totalCapturados,
    sinAsignaciones: false,
  };
}
