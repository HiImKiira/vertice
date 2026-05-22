"use client";

import { useMemo, useState, useTransition } from "react";
import { VortexLoader } from "@/components/VortexLoader";
import { useRouter, useSearchParams } from "next/navigation";
import { crearTurnoEventualAction, eliminarTurnoEventualAction } from "./actions";

export interface Sede { id: string; codigo: string; abrev: string; nombre: string }
export interface Empleado { id: string; numero_empleado: string; nombre: string; jornada: string }
export interface Usuario { id: string; nombre: string; rol: string }

export interface EventualRow {
  id: string;
  fecha: string;
  jornada: string;
  empleado_id: string | null;
  nombre_externo: string | null;
  cubre_id: string | null;
  observaciones: string | null;
  es_externo: boolean;
  creado_en: string;
  empleados?: { numero_empleado: string; nombre: string } | { numero_empleado: string; nombre: string }[] | null;
  cubre?: { numero_empleado: string; nombre: string } | { numero_empleado: string; nombre: string }[] | null;
}

interface Props {
  mes: string;
  sedeId: string;
  sedes: Sede[];
  empleados: Empleado[];
  eventuales: EventualRow[];
  autorizadores: Usuario[];
}

const DIAS = ["L", "M", "X", "J", "V", "S", "D"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function ymToNumbers(ym: string): { y: number; m: number } {
  const p = ym.split("-");
  return { y: Number(p[0]!), m: Number(p[1]!) };
}

interface CalCell {
  date: string;
  day: number;
  dow: number;
  isOtherMonth: boolean;
  isSunday: boolean;
  isToday: boolean;
  eventuales: EventualRow[];
}

function buildCalendar(mes: string, eventuales: EventualRow[]): CalCell[] {
  const { y, m } = ymToNumbers(mes);
  const first = new Date(y, m - 1, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const lastDay = new Date(y, m, 0).getDate();
  const today = new Date(); today.setHours(today.getHours() - 6);
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const cells: CalCell[] = [];
  const prevLast = new Date(y, m - 1, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = prevLast - i;
    const month = m === 1 ? 12 : m - 1;
    const year = m === 1 ? y - 1 : y;
    cells.push({
      date: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      day: d, dow: 0, isOtherMonth: true, isSunday: false, isToday: false, eventuales: [],
    });
  }
  for (let d = 1; d <= lastDay; d++) {
    const dt = new Date(y, m - 1, d);
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({
      date: iso,
      day: d,
      dow: dt.getDay(),
      isOtherMonth: false,
      isSunday: dt.getDay() === 0,
      isToday: iso === todayISO,
      eventuales: eventuales.filter((e) => e.fecha === iso),
    });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]!;
    const parts = last.date.split("-");
    const next = new Date(Number(parts[0]!), Number(parts[1]!) - 1, Number(parts[2]!) + 1);
    cells.push({
      date: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`,
      day: next.getDate(), dow: 0, isOtherMonth: true, isSunday: false, isToday: false, eventuales: [],
    });
  }
  return cells;
}

function shiftMonth(mes: string, delta: number): string {
  const { y, m } = ymToNumbers(mes);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nameOf(r: EventualRow): string {
  if (r.es_externo) return r.nombre_externo ?? "Externo";
  const emp = Array.isArray(r.empleados) ? r.empleados[0] : r.empleados;
  return emp?.nombre ?? "—";
}

export function EventualesClient(props: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [esExterno, setEsExterno] = useState(false);
  const [empleadoId, setEmpleadoId] = useState("");
  const [nombreExterno, setNombreExterno] = useState("");
  const [jornada, setJornada] = useState("MATUTINO");
  const [cubreId, setCubreId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [autoriza, setAutoriza] = useState("");

  const cells = useMemo(() => buildCalendar(props.mes, props.eventuales), [props.mes, props.eventuales]);
  const { y, m } = ymToNumbers(props.mes);
  const tituloMes = `${MESES[m - 1]} ${y}`;

  function updateUrl(next: { sede?: string; mes?: string }) {
    const usp = new URLSearchParams(params.toString());
    if (next.sede !== undefined) usp.set("sede", next.sede);
    if (next.mes !== undefined) usp.set("mes", next.mes);
    router.push(`/eventuales?${usp.toString()}`);
  }

  function openDay(date: string) {
    setSelectedDate(date);
    setShowForm(false);
    setError(null);
  }

  function abrirNuevo(date: string) {
    setSelectedDate(date);
    setShowForm(true);
    setError(null);
  }

  function submit() {
    setError(null);
    if (!selectedDate) return;
    startTransition(async () => {
      const r = await crearTurnoEventualAction({
        fecha: selectedDate,
        sede_id: props.sedeId,
        jornada: jornada as "MATUTINO",
        es_externo: esExterno,
        empleado_id: esExterno ? null : empleadoId,
        nombre_externo: esExterno ? nombreExterno : null,
        cubre_id: cubreId || null,
        observaciones: observaciones || null,
        autoriza: autoriza || null,
      });
      if (!r.ok) {
        setError(r.error);
      } else {
        setShowForm(false);
        setEmpleadoId("");
        setNombreExterno("");
        setCubreId("");
        setObservaciones("");
        router.refresh();
      }
    });
  }

  function eliminar(id: string) {
    if (!confirm("¿Eliminar este turno eventual?")) return;
    startTransition(async () => {
      await eliminarTurnoEventualAction(id);
      router.refresh();
    });
  }

  const eventualesDelDia = selectedDate
    ? props.eventuales.filter((e) => e.fecha === selectedDate)
    : [];

  return (
    <>
      {/* Controles */}
      <div className="mb-5 grid gap-3 surface-glow p-4 sm:grid-cols-[2fr_1fr_auto]">
        <label className="block min-w-0">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-tagline text-muted">Sede</span>
          <select value={props.sedeId} onChange={(e) => updateUrl({ sede: e.target.value })}>
            {props.sedes.map((s) => (
              <option key={s.id} value={s.id}>{s.abrev} · {s.nombre}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => updateUrl({ mes: shiftMonth(props.mes, -1) })} aria-label="Mes anterior">←</button>
          <input type="month" value={props.mes} onChange={(e) => updateUrl({ mes: e.target.value })} className="flex-1" />
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => updateUrl({ mes: shiftMonth(props.mes, 1) })} aria-label="Mes siguiente">→</button>
        </div>
        <div className="text-right text-xs text-muted sm:self-end">
          <span className="font-mono text-text">{props.eventuales.length}</span> turnos en {tituloMes}
        </div>
      </div>

      {/* Calendario */}
      <div className="overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]">
        <div className="grid grid-cols-7 border-b border-[color:var(--border)] bg-[color:var(--surface)]">
          {DIAS.map((d, i) => (
            <div
              key={d}
              className={`px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-tagline ${i === 6 ? "text-[#FCD34D]" : "text-muted"}`}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => (
            <button
              key={cell.date + cell.day}
              type="button"
              onClick={() => openDay(cell.date)}
              className={`min-h-[72px] border-b border-r border-[color:var(--border)] p-1.5 text-left transition hover:bg-blue-500/[0.06] sm:min-h-[110px] sm:p-2 ${
                cell.isOtherMonth ? "bg-[color:var(--bg)]/40 text-muted-2" : "bg-[color:var(--card)]"
              } ${cell.isSunday && !cell.isOtherMonth ? "bg-[rgba(245,158,11,0.04)]" : ""}`}
            >
              <div className={`mb-1 flex items-center justify-between text-xs ${cell.isToday ? "font-bold text-[#93C5FD]" : ""}`}>
                <span>{cell.day}</span>
                {cell.isToday && <span className="rounded-full bg-[color:var(--blue)] px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">hoy</span>}
              </div>
              <div className="flex flex-col gap-0.5">
                {cell.eventuales.slice(0, 3).map((e) => (
                  <span
                    key={e.id}
                    className={`truncate rounded px-1 py-0.5 text-[9px] font-medium ${
                      e.es_externo
                        ? "bg-[rgba(139,92,246,0.18)] text-[#C4B5FD]"
                        : "bg-[rgba(59,130,246,0.18)] text-[#93C5FD]"
                    }`}
                    title={nameOf(e)}
                  >
                    {e.es_externo ? "🌐 " : ""}{nameOf(e).split(" ").slice(0, 2).join(" ")}
                  </span>
                ))}
                {cell.eventuales.length > 3 && (
                  <span className="text-[9px] text-muted">+{cell.eventuales.length - 3}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Drawer del día */}
      {selectedDate && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-[color:var(--bg)]/70 backdrop-blur-sm sm:items-center sm:justify-center"
          onClick={() => { setSelectedDate(null); setShowForm(false); }}
        >
          <div
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-[color:var(--surface)] p-5 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mb-4 flex items-start justify-between">
              <div className="min-w-0">
                <p className="pill pill-blue mb-2 inline-flex">{selectedDate}</p>
                <h2 className="font-serif text-2xl">Turnos eventuales del día</h2>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedDate(null); setShowForm(false); }}
                className="shrink-0 rounded-md p-1.5 text-muted-2 hover:bg-white/5"
              >
                ✕
              </button>
            </header>

            {eventualesDelDia.length > 0 && (
              <ul className="mb-4 space-y-2">
                {eventualesDelDia.map((e) => {
                  const cubre = Array.isArray(e.cubre) ? e.cubre[0] : e.cubre;
                  return (
                    <li key={e.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] text-muted-2">{e.jornada}</span>
                            <span className={`pill ${e.es_externo ? "pill-violet" : "pill-blue"}`} style={{ padding: "1px 6px", fontSize: 9 }}>
                              {e.es_externo ? "EXTERNO" : "INTERNO"}
                            </span>
                            <span className="truncate font-medium">{nameOf(e)}</span>
                          </p>
                          {cubre && (
                            <p className="mt-1 text-xs text-muted">
                              Cubre a: <span className="text-text">{cubre.nombre}</span>
                            </p>
                          )}
                          {e.observaciones && (
                            <p className="mt-1 text-xs italic text-muted-2">"{e.observaciones}"</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => eliminar(e.id)}
                          className="shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold text-red-400 hover:bg-red-500/10"
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
              <button type="button" onClick={() => setShowForm(true)} className="btn btn-primary w-full">
                + Registrar turno eventual
              </button>
            ) : (
              <div className="space-y-3 rounded-lg border border-blue-400/30 bg-blue-500/[0.06] p-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEsExterno(false)}
                    className={`btn flex-1 ${!esExterno ? "btn-primary" : "btn-ghost"}`}
                  >
                    👤 Empleado interno
                  </button>
                  <button
                    type="button"
                    onClick={() => setEsExterno(true)}
                    className={`btn flex-1 ${esExterno ? "btn-violet" : "btn-ghost"}`}
                  >
                    🌐 Externo
                  </button>
                </div>

                {!esExterno ? (
                  <div className="field">
                    <label>Empleado *</label>
                    <select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}>
                      <option value="">— elegir —</option>
                      {props.empleados.map((e) => (
                        <option key={e.id} value={e.id}>#{e.numero_empleado} · {e.nombre}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="field">
                    <label>Nombre del externo *</label>
                    <input
                      type="text"
                      value={nombreExterno}
                      onChange={(e) => setNombreExterno(e.target.value.toUpperCase())}
                      placeholder="NOMBRE COMPLETO"
                    />
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="field">
                    <label>Jornada</label>
                    <select value={jornada} onChange={(e) => setJornada(e.target.value)}>
                      {["MATUTINO", "VESPERTINO", "NOCTURNO"].map((j) => <option key={j}>{j}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Cubre a (opcional)</label>
                    <select value={cubreId} onChange={(e) => setCubreId(e.target.value)}>
                      <option value="">—</option>
                      {props.empleados.map((e) => (
                        <option key={e.id} value={e.id}>{e.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label>Observaciones</label>
                  <textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
                </div>

                <div className="field">
                  <label>Autoriza</label>
                  <select value={autoriza} onChange={(e) => setAutoriza(e.target.value)}>
                    <option value="">—</option>
                    {props.autorizadores.map((u) => (
                      <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>
                    ))}
                  </select>
                </div>

                {error && (
                  <p className="rounded border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">{error}</p>
                )}

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost">Cancelar</button>
                  <button type="button" onClick={submit} disabled={isPending} className="btn btn-primary">
                    {isPending ? (<><span className="loader-vortex-sm" />Guardando...</>) : "Registrar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isPending && (
        <div className="overlay-loader">
          <VortexLoader size={64} />
          <p className="overlay-loader-text">Procesando turno eventual...</p>
        </div>
      )}
    </>
  );
}
