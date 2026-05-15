"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CODIGO_SPEC, CODIGOS, type CodigoAsistencia } from "@vertice/shared/codes";
import { registrarIncidenciaAction, eliminarIncidenciaAction } from "./actions";

export interface SedeShape {
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
}

export interface Incidencia {
  id: string;
  empleado_id: string;
  fecha: string;
  codigo: CodigoAsistencia;
  observacion: string | null;
  cubre_id: string | null;
  autoriza: string | null;
  capturado_por: string | null;
  creado_en: string;
}

export interface UsuarioShape {
  id: string;
  nombre: string;
  rol: string;
}

interface Props {
  mes: string;
  sedeId: string;
  sedes: SedeShape[];
  empleados: Empleado[];
  incidencias: Incidencia[];
  usuariosAutoriza: UsuarioShape[];
}

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES_NOMBRE = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface CalendarCell {
  date: string;       // YYYY-MM-DD
  dayNum: number;
  isOtherMonth: boolean;
  isSunday: boolean;
  incidencias: Incidencia[];
}

function ymToNumbers(ym: string): { y: number; m: number } {
  const p = ym.split("-");
  return { y: Number(p[0]!), m: Number(p[1]!) };
}

function buildCalendar(mes: string, incidencias: Incidencia[]): CalendarCell[] {
  const { y, m } = ymToNumbers(mes);
  const first = new Date(y, m - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // lunes = 0
  const lastDay = new Date(y, m, 0).getDate();
  const cells: CalendarCell[] = [];

  // Pad antes
  const prevLastDay = new Date(y, m - 1, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = prevLastDay - i;
    const month = m === 1 ? 12 : m - 1;
    const year = m === 1 ? y - 1 : y;
    cells.push({
      date: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      dayNum: d,
      isOtherMonth: true,
      isSunday: false,
      incidencias: [],
    });
  }

  for (let d = 1; d <= lastDay; d++) {
    const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(y, m - 1, d).getDay();
    cells.push({
      date,
      dayNum: d,
      isOtherMonth: false,
      isSunday: dow === 0,
      incidencias: incidencias.filter((i) => i.fecha === date),
    });
  }

  // Pad después hasta completar la última fila
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]!;
    const parts = last.date.split("-");
    const next = new Date(Number(parts[0]!), Number(parts[1]!) - 1, Number(parts[2]!) + 1);
    cells.push({
      date: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`,
      dayNum: next.getDate(),
      isOtherMonth: true,
      isSunday: false,
      incidencias: [],
    });
  }

  return cells;
}

function shiftMonth(mes: string, delta: number): string {
  const { y, m } = ymToNumbers(mes);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function IncidenciasClient(props: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [formState, setFormState] = useState({
    empleado_id: "",
    codigo: "" as CodigoAsistencia | "",
    observacion: "",
    cubre_id: "",
    autoriza: "",
  });

  const cells = useMemo(() => buildCalendar(props.mes, props.incidencias), [props.mes, props.incidencias]);
  const empleadosMap = useMemo(() => new Map(props.empleados.map((e) => [e.id, e])), [props.empleados]);

  const { y, m } = ymToNumbers(props.mes);
  const tituloMes = `${MESES_NOMBRE[m - 1]} ${y}`;

  function updateUrl(next: { sede?: string; mes?: string }) {
    const usp = new URLSearchParams(params.toString());
    if (next.sede !== undefined) usp.set("sede", next.sede);
    if (next.mes !== undefined) usp.set("mes", next.mes);
    router.push(`/incidencias?${usp.toString()}`);
  }

  function openFormFor(date: string) {
    setDiaSeleccionado(date);
    setShowForm(true);
    setFormError(null);
  }

  function submitForm() {
    if (!formState.empleado_id || !formState.codigo || !diaSeleccionado) {
      setFormError("Faltan empleado y código.");
      return;
    }
    setFormError(null);
    startTransition(async () => {
      const r = await registrarIncidenciaAction({
        empleado_id: formState.empleado_id,
        codigo: formState.codigo as CodigoAsistencia,
        fecha: diaSeleccionado,
        observacion: formState.observacion || null,
        cubre_id: formState.cubre_id || null,
        autoriza: formState.autoriza || null,
      });
      if (!r.ok) {
        setFormError(r.error);
      } else {
        setShowForm(false);
        setFormState({ empleado_id: "", codigo: "" as never, observacion: "", cubre_id: "", autoriza: "" });
        router.refresh();
      }
    });
  }

  function eliminar(id: string) {
    if (!confirm("¿Eliminar esta incidencia?")) return;
    startTransition(async () => {
      await eliminarIncidenciaAction(id);
      router.refresh();
    });
  }

  const incidenciasDelDia = diaSeleccionado
    ? props.incidencias.filter((i) => i.fecha === diaSeleccionado)
    : [];

  return (
    <>
      {/* Controles */}
      <div className="mb-6 grid gap-3 rounded-xl border border-white/10 bg-[color:var(--surface)] p-4 sm:grid-cols-3 sm:items-end sm:p-5">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-tagline text-muted">Sede</span>
          <select
            value={props.sedeId}
            onChange={(e) => updateUrl({ sede: e.target.value })}
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none"
          >
            {props.sedes.map((s) => (
              <option key={s.id} value={s.id}>{s.abrev} · {s.nombre}</option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => updateUrl({ mes: shiftMonth(props.mes, -1) })}
            className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm hover:bg-white/[0.08]"
            aria-label="Mes anterior"
          >
            ←
          </button>
          <input
            type="month"
            value={props.mes}
            onChange={(e) => updateUrl({ mes: e.target.value })}
            className="flex-1 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => updateUrl({ mes: shiftMonth(props.mes, 1) })}
            className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm hover:bg-white/[0.08]"
            aria-label="Mes siguiente"
          >
            →
          </button>
        </div>

        <div className="text-right text-xs text-muted sm:text-sm">
          <span className="font-mono text-text">{props.incidencias.length}</span> incidencias en {tituloMes}
        </div>
      </div>

      {/* Calendario */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[color:var(--surface)]">
        <div className="grid grid-cols-7 border-b border-white/10 bg-white/[0.03]">
          {DIAS_SEMANA.map((d, i) => (
            <div
              key={d}
              className={`px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-tagline ${i === 6 ? "text-blue-300" : "text-muted"}`}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const today = new Date().toISOString().slice(0, 10) === cell.date;
            return (
              <button
                key={cell.date}
                type="button"
                onClick={() => openFormFor(cell.date)}
                className={`min-h-[80px] border-b border-r border-white/5 p-1.5 text-left transition hover:bg-blue-500/[0.06] sm:min-h-[110px] sm:p-2 ${
                  cell.isOtherMonth ? "bg-[color:var(--bg)]/40 text-muted-2" : "bg-[color:var(--surface)]"
                } ${cell.isSunday && !cell.isOtherMonth ? "bg-orange-500/[0.06]" : ""}`}
              >
                <div className={`mb-1 flex items-center justify-between text-xs ${today ? "font-bold text-blue-300" : ""}`}>
                  <span>{cell.dayNum}</span>
                  {today && (
                    <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">
                      hoy
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {cell.incidencias.slice(0, 4).map((inc) => (
                    <span
                      key={inc.id}
                      className="rounded px-1 py-0.5 font-mono text-[9px] font-bold text-white"
                      style={{ backgroundColor: CODIGO_SPEC[inc.codigo]?.color || "#888780" }}
                      title={`${empleadosMap.get(inc.empleado_id)?.nombre ?? ""} — ${inc.codigo}`}
                    >
                      {inc.codigo}
                    </span>
                  ))}
                  {cell.incidencias.length > 4 && (
                    <span className="text-[9px] text-muted">+{cell.incidencias.length - 4}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Drawer / Modal del día seleccionado */}
      {diaSeleccionado && (
        <div className="fixed inset-0 z-50 flex items-end bg-[color:var(--bg)]/70 backdrop-blur-sm sm:items-center sm:justify-center" onClick={() => { setDiaSeleccionado(null); setShowForm(false); }}>
          <div
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-[color:var(--surface)] p-5 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="pill pill-blue mb-2 inline-flex">{diaSeleccionado}</p>
                <h2 className="font-serif text-2xl">Incidencias del día</h2>
              </div>
              <button
                type="button"
                onClick={() => { setDiaSeleccionado(null); setShowForm(false); }}
                className="rounded-md p-1.5 text-muted-2 hover:bg-white/5"
              >
                ✕
              </button>
            </div>

            {incidenciasDelDia.length > 0 && (
              <ul className="mb-4 space-y-2">
                {incidenciasDelDia.map((inc) => {
                  const emp = empleadosMap.get(inc.empleado_id);
                  return (
                    <li key={inc.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold text-white"
                              style={{ backgroundColor: CODIGO_SPEC[inc.codigo]?.color || "#888780" }}
                            >
                              {inc.codigo}
                            </span>
                            <span className="truncate font-medium">{emp?.nombre ?? "Empleado desconocido"}</span>
                          </div>
                          {inc.observacion && (
                            <p className="mt-1 text-xs text-muted">{inc.observacion}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => eliminar(inc.id)}
                          className="rounded px-2 py-0.5 text-[10px] font-semibold text-red-400 hover:bg-red-500/10"
                        >
                          Eliminar
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {!showForm ? (
              <button type="button" onClick={() => setShowForm(true)} className="btn-primary w-full">
                + Registrar nueva incidencia
              </button>
            ) : (
              <div className="space-y-3 rounded-lg border border-blue-400/30 bg-blue-500/[0.06] p-3">
                <p className="pill pill-blue inline-flex">Nueva incidencia</p>

                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-tagline text-muted">Empleado *</span>
                  <select
                    value={formState.empleado_id}
                    onChange={(e) => setFormState({ ...formState, empleado_id: e.target.value })}
                    className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                  >
                    <option value="">— elegir —</option>
                    {props.empleados.map((e) => (
                      <option key={e.id} value={e.id}>#{e.numero_empleado} · {e.nombre} ({e.jornada})</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-tagline text-muted">Código *</span>
                  <div className="flex flex-wrap gap-1.5">
                    {CODIGOS.filter((c) => c !== "SN").map((cod) => {
                      const spec = CODIGO_SPEC[cod];
                      const active = formState.codigo === cod;
                      return (
                        <button
                          key={cod}
                          type="button"
                          onClick={() => setFormState({ ...formState, codigo: cod })}
                          title={spec.nombre}
                          className={`rounded-md px-2.5 py-1.5 font-mono text-[11px] font-bold transition ${
                            active ? "text-white" : "border border-white/10 bg-white/[0.04] text-muted hover:bg-white/[0.08]"
                          }`}
                          style={active ? { backgroundColor: spec.color } : undefined}
                        >
                          {cod}
                        </button>
                      );
                    })}
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-tagline text-muted">Observación</span>
                  <textarea
                    value={formState.observacion}
                    onChange={(e) => setFormState({ ...formState, observacion: e.target.value })}
                    rows={2}
                    placeholder="Notas, justificación, etc."
                    className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-tagline text-muted">Cubre a (opcional)</span>
                    <select
                      value={formState.cubre_id}
                      onChange={(e) => setFormState({ ...formState, cubre_id: e.target.value })}
                      className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    >
                      <option value="">—</option>
                      {props.empleados.map((e) => (
                        <option key={e.id} value={e.id}>{e.nombre}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-tagline text-muted">Autoriza (opcional)</span>
                    <select
                      value={formState.autoriza}
                      onChange={(e) => setFormState({ ...formState, autoriza: e.target.value })}
                      className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    >
                      <option value="">—</option>
                      {props.usuariosAutoriza.map((u) => (
                        <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>
                      ))}
                    </select>
                  </label>
                </div>

                {formError && (
                  <p className="rounded border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">{formError}</p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">
                    Cancelar
                  </button>
                  <button type="button" onClick={submitForm} disabled={isPending} className="btn-primary">
                    {isPending ? "Guardando..." : "Registrar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
