"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CODIGO_SPEC, type CodigoAsistencia } from "@vertice/shared/codes";
import { guardarMarcasBulkAction, type BulkResult } from "./actions";

export interface SedeShape {
  id: string;
  codigo: string;
  abrev: string;
  nombre: string;
  n?: number;
}

export interface Empleado {
  id: string;
  numero_empleado: string;
  nombre: string;
  jornada: string;
  dia_descanso: string[] | string | null;
}

export type MarcasMap = Record<string, Record<string, string>>;

interface Props {
  mes: string;
  sedeId: string;
  sedes: SedeShape[];
  empleados: Empleado[];
  marcasIniciales: MarcasMap;
}

const DIAS_NOMBRE = ["D", "L", "M", "X", "J", "V", "S"];
const MESES_NOMBRE = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const CYCLE: CodigoAsistencia[] = ["A", "F", "DS", "A"]; // cycle al hacer click simple

function ymToNumbers(ym: string): { y: number; m: number } {
  const p = ym.split("-");
  return { y: Number(p[0]!), m: Number(p[1]!) };
}

function buildDays(mes: string): { iso: string; day: number; dow: number; isSunday: boolean }[] {
  const { y, m } = ymToNumbers(mes);
  const lastDay = new Date(y, m, 0).getDate();
  const out: { iso: string; day: number; dow: number; isSunday: boolean }[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const dt = new Date(y, m - 1, d);
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    out.push({ iso, day: d, dow: dt.getDay(), isSunday: dt.getDay() === 0 });
  }
  return out;
}

function shiftMonth(mes: string, delta: number): string {
  const { y, m } = ymToNumbers(mes);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextCode(current: string | undefined): CodigoAsistencia {
  if (!current || current === "SN") return "A";
  const i = CYCLE.indexOf(current as CodigoAsistencia);
  if (i === -1) return "A";
  return CYCLE[i + 1] ?? "A";
}

function normalizeDescanso(d: Empleado["dia_descanso"]): Set<number> {
  // dia_descanso en DB es array dia_semana[]: LUN/MAR/.../DOM
  const map: Record<string, number> = { DOM: 0, LUN: 1, MAR: 2, MIE: 3, JUE: 4, VIE: 5, SAB: 6 };
  const set = new Set<number>();
  if (!d) return set;
  const arr = Array.isArray(d) ? d : [d];
  for (const v of arr) {
    if (typeof v === "string" && map[v] !== undefined) set.add(map[v]!);
  }
  return set;
}

export function CalendarioQuickMark(props: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pendientes, setPendientes] = useState<Record<string, Record<string, CodigoAsistencia>>>({});
  const [resultado, setResultado] = useState<BulkResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [paintCode, setPaintCode] = useState<CodigoAsistencia>("A");
  const [paintMode, setPaintMode] = useState(false);

  const dias = useMemo(() => buildDays(props.mes), [props.mes]);
  const { y, m } = ymToNumbers(props.mes);
  const titulo = `${MESES_NOMBRE[m - 1]} ${y}`;

  function updateUrl(next: { sede?: string; mes?: string }) {
    const usp = new URLSearchParams(params.toString());
    if (next.sede !== undefined) usp.set("sede", next.sede);
    if (next.mes !== undefined) usp.set("mes", next.mes);
    router.push(`/rh-pro/empleados?${usp.toString()}`);
  }

  function getCell(empId: string, iso: string): string | undefined {
    return pendientes[empId]?.[iso] ?? props.marcasIniciales[empId]?.[iso];
  }

  function setCell(empId: string, iso: string, codigo: CodigoAsistencia) {
    setPendientes((prev) => {
      const empMap = { ...(prev[empId] ?? {}) };
      empMap[iso] = codigo;
      return { ...prev, [empId]: empMap };
    });
    setResultado(null);
  }

  function clickCell(empId: string, iso: string) {
    if (paintMode) {
      setCell(empId, iso, paintCode);
      return;
    }
    const current = getCell(empId, iso);
    setCell(empId, iso, nextCode(current));
  }

  function fillRow(empId: string, codigo: CodigoAsistencia, soloPendientes: boolean) {
    setPendientes((prev) => {
      const empMap = { ...(prev[empId] ?? {}) };
      for (const d of dias) {
        if (soloPendientes && (empMap[d.iso] || props.marcasIniciales[empId]?.[d.iso])) continue;
        empMap[d.iso] = codigo;
      }
      return { ...prev, [empId]: empMap };
    });
    setResultado(null);
  }

  function fillColumn(iso: string, codigo: CodigoAsistencia, soloPendientes: boolean) {
    setPendientes((prev) => {
      const next = { ...prev };
      for (const emp of props.empleados) {
        const existing = next[emp.id]?.[iso] ?? props.marcasIniciales[emp.id]?.[iso];
        if (soloPendientes && existing) continue;
        next[emp.id] = { ...(next[emp.id] ?? {}), [iso]: codigo };
      }
      return next;
    });
    setResultado(null);
  }

  function fillRowDescansos(emp: Empleado) {
    const dows = normalizeDescanso(emp.dia_descanso);
    if (!dows.size) return;
    setPendientes((prev) => {
      const empMap = { ...(prev[emp.id] ?? {}) };
      for (const d of dias) {
        if (dows.has(d.dow)) empMap[d.iso] = "DS";
      }
      return { ...prev, [emp.id]: empMap };
    });
    setResultado(null);
  }

  function reset() {
    setPendientes({});
    setResultado(null);
  }

  const cambiosCount = useMemo(() => {
    let n = 0;
    for (const empId in pendientes) n += Object.keys(pendientes[empId] ?? {}).length;
    return n;
  }, [pendientes]);

  function guardar() {
    if (!cambiosCount) return;
    const marcas: { empleado_id: string; fecha: string; codigo: CodigoAsistencia }[] = [];
    for (const empId in pendientes) {
      for (const iso in pendientes[empId]) {
        marcas.push({ empleado_id: empId, fecha: iso, codigo: pendientes[empId]![iso]! });
      }
    }
    startTransition(async () => {
      const r = await guardarMarcasBulkAction(marcas);
      setResultado(r);
      if (r.ok) {
        setPendientes({});
        router.refresh();
      }
    });
  }

  return (
    <>
      {/* Toolbar de control */}
      <div className="mb-5 grid gap-3 surface-glow p-4 sm:grid-cols-[2fr_1fr_auto]">
        <div className="field">
          <label>Sede</label>
          <select value={props.sedeId} onChange={(e) => updateUrl({ sede: e.target.value })}>
            {props.sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.abrev} · {s.nombre} {s.n !== undefined ? `(${s.n})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Mes</label>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => updateUrl({ mes: shiftMonth(props.mes, -1) })}>←</button>
            <input type="month" value={props.mes} onChange={(e) => updateUrl({ mes: e.target.value })} />
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => updateUrl({ mes: shiftMonth(props.mes, 1) })}>→</button>
          </div>
        </div>
        <div className="flex flex-col gap-1 sm:items-end">
          <span className="text-[10px] uppercase tracking-tagline text-muted">Empleados</span>
          <span className="font-display text-2xl text-text">{props.empleados.length}</span>
        </div>
      </div>

      {/* Modo pintar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-tagline text-muted">Modo</span>
          <button
            type="button"
            onClick={() => setPaintMode((v) => !v)}
            className={`btn btn-sm ${paintMode ? "btn-primary" : "btn-ghost"}`}
            title="Cuando activo, cada click pinta con el código seleccionado en lugar de ciclar A→F→DS"
          >
            {paintMode ? "🎨 Pintando con" : "🖱 Click cycle A→F→DS"}
          </button>
          {paintMode && (
            <div className="flex flex-wrap gap-1">
              {(["A", "F", "DS", "AF", "DT", "PCG", "PSG", "I", "FER", "INH"] as CodigoAsistencia[]).map((cod) => {
                const active = paintCode === cod;
                const spec = CODIGO_SPEC[cod];
                return (
                  <button
                    key={cod}
                    type="button"
                    onClick={() => setPaintCode(cod)}
                    className={`chip-code ${active ? "chip-code-active" : ""}`}
                    style={active ? { background: spec.color } : undefined}
                  >
                    {cod}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {Object.keys(pendientes).length > 0 && (
            <button type="button" onClick={reset} className="btn btn-sm btn-ghost">↺ Deshacer todo</button>
          )}
          <span>{cambiosCount} cambio{cambiosCount === 1 ? "" : "s"} pendiente{cambiosCount === 1 ? "" : "s"}</span>
        </div>
      </div>

      {/* Calendario */}
      {!props.empleados.length ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--card)] p-10 text-center text-sm text-muted">
          No hay empleados activos en esta sede.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-[color:var(--surface)]">
              <tr>
                <th className="sticky left-0 z-10 min-w-[200px] border-r border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-left text-[10px] uppercase tracking-tagline text-muted">
                  Empleado <span className="opacity-50">{titulo}</span>
                </th>
                {dias.map((d) => (
                  <th
                    key={d.iso}
                    className={`border-l border-[color:var(--border)] px-1 py-2 text-center text-[10px] font-bold ${
                      d.isSunday ? "bg-[rgba(245,158,11,0.06)] text-[#FCD34D]" : "text-muted"
                    }`}
                  >
                    <div>{DIAS_NOMBRE[d.dow]}</div>
                    <div className="text-text">{d.day}</div>
                    <div className="mt-1 flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => fillColumn(d.iso, "A", true)}
                        className="rounded bg-[rgba(16,185,129,0.18)] px-1 py-0.5 text-[8px] font-bold text-[#6EE7B7] hover:bg-[rgba(16,185,129,0.35)]"
                        title={`Marcar todos pendientes del día ${d.day} como A`}
                      >
                        Todos A
                      </button>
                    </div>
                  </th>
                ))}
                <th className="sticky right-0 z-10 min-w-[140px] border-l border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-2 text-center text-[10px] uppercase tracking-tagline text-muted">
                  Acciones fila
                </th>
              </tr>
            </thead>
            <tbody>
              {props.empleados.map((emp, idx) => {
                const dows = normalizeDescanso(emp.dia_descanso);
                return (
                  <tr key={emp.id} className={idx % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]"}>
                    <td className="sticky left-0 z-10 border-r border-[color:var(--border)] bg-[color:var(--card)] px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[9px] text-muted-2">#{emp.numero_empleado}</span>
                        <span className="truncate font-medium text-text">{emp.nombre}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-muted">
                        <span className="pill pill-amber" style={{ padding: "1px 6px", fontSize: 9 }}>{emp.jornada}</span>
                        {dows.size > 0 && (
                          <span className="text-muted-2">
                            descanso: {[...dows].map((d) => DIAS_NOMBRE[d]).join(",")}
                          </span>
                        )}
                      </div>
                    </td>
                    {dias.map((d) => {
                      const cod = getCell(emp.id, d.iso);
                      const isPending = !!pendientes[emp.id]?.[d.iso];
                      const spec = cod ? CODIGO_SPEC[cod as CodigoAsistencia] : null;
                      const esDescansoDia = dows.has(d.dow);
                      return (
                        <td
                          key={d.iso}
                          className={`border-l border-[color:var(--border)] p-0.5 text-center ${d.isSunday ? "bg-[rgba(245,158,11,0.04)]" : ""}`}
                        >
                          <button
                            type="button"
                            onClick={() => clickCell(emp.id, d.iso)}
                            className={`block h-7 w-full min-w-[28px] rounded font-mono text-[10px] font-bold transition ${
                              isPending ? "ring-1 ring-[color:var(--blue)]" : ""
                            } ${esDescansoDia && !cod ? "border border-dashed border-[color:var(--border2)] text-muted-2" : ""}`}
                            style={spec ? { background: spec.color, color: "white" } : undefined}
                            title={cod ? `${spec?.nombre} (${cod})` : esDescansoDia ? "Día de descanso programado" : "Sin marcar"}
                          >
                            {cod ?? (esDescansoDia ? "·" : "")}
                          </button>
                        </td>
                      );
                    })}
                    <td className="sticky right-0 z-10 border-l border-[color:var(--border)] bg-[color:var(--card)] px-1 py-1.5">
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => fillRow(emp.id, "A", true)}
                            className="flex-1 rounded bg-[rgba(16,185,129,0.18)] px-1 py-1 text-[9px] font-bold text-[#6EE7B7] hover:bg-[rgba(16,185,129,0.35)]"
                            title="Todos los días sin marcar → A"
                          >
                            Todos A
                          </button>
                          {dows.size > 0 && (
                            <button
                              type="button"
                              onClick={() => fillRowDescansos(emp)}
                              className="rounded bg-[rgba(6,182,212,0.18)] px-1 py-1 text-[9px] font-bold text-[#67E8F9] hover:bg-[rgba(6,182,212,0.35)]"
                              title={`Marcar como DS sus días de descanso (${[...dows].map((d) => DIAS_NOMBRE[d]).join(",")})`}
                            >
                              DS
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Save bar */}
      {props.empleados.length > 0 && (
        <div className="sticky bottom-0 mt-6 -mx-4 border-t border-[color:var(--border)] bg-[color:var(--bg)]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3">
            <div className="text-xs text-muted">
              {resultado?.ok && <span className="text-[#6EE7B7]">✓ {resultado.saved} marcas guardadas</span>}
              {resultado && !resultado.ok && <span className="text-[#FCA5A5]">⚠ {resultado.error}</span>}
              {!resultado && cambiosCount > 0 && <span className="text-[#FCD34D]">{cambiosCount} sin guardar</span>}
              {!resultado && !cambiosCount && <span>Sin cambios</span>}
            </div>
            <button type="button" onClick={guardar} disabled={!cambiosCount || isPending} className="btn btn-primary">
              {isPending ? "Guardando..." : `💾 Guardar ${cambiosCount || ""}`.trim()}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
