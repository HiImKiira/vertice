"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearCDTAction, cancelarCDTAction } from "./actions";

export interface EmpleadoMini {
  id: string;
  numero_empleado: string;
  nombre: string;
  sede_id: string;
  dia_descanso: string[] | null;
}
export interface SedeMini { id: string; abrev: string; nombre: string }
export interface UsuarioMini { id: string; nombre: string; rol: string }

export interface CDTRow {
  id: string;
  empleado_id: string;
  sede_id: string;
  fecha_original: string;
  fecha_fin: string | null;
  fecha_temporal: string | null;
  dia_descanso_orig: string | null;
  dia_descanso_temp: string | null;
  motivo: string | null;
  cancelado_en: string | null;
  creado_en: string;
  empleados: { numero_empleado: string; nombre: string } | { numero_empleado: string; nombre: string }[] | null;
  sedes: { abrev: string; nombre: string } | { abrev: string; nombre: string }[] | null;
}

const DIAS = [
  { v: "LUN", l: "Lunes" },
  { v: "MAR", l: "Martes" },
  { v: "MIE", l: "Miércoles" },
  { v: "JUE", l: "Jueves" },
  { v: "VIE", l: "Viernes" },
  { v: "SAB", l: "Sábado" },
  { v: "DOM", l: "Domingo" },
] as const;
type DiaSemana = (typeof DIAS)[number]["v"];

function todayISOMerida(): string {
  const d = new Date();
  d.setHours(d.getHours() - 6);
  return d.toISOString().slice(0, 10);
}

export function DescansosClient({
  cdts,
  empleados,
  sedes,
  autorizadores,
  canCancel,
}: {
  cdts: CDTRow[];
  empleados: EmpleadoMini[];
  sedes: SedeMini[];
  autorizadores: UsuarioMini[];
  canCancel: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<"ACTIVOS" | "TODOS" | "CANCELADOS">("ACTIVOS");
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  // Form
  const [empleadoId, setEmpleadoId] = useState("");
  const [fechaInicio, setFechaInicio] = useState(todayISOMerida());
  const [fechaFin, setFechaFin] = useState(todayISOMerida());
  const [diaOrig, setDiaOrig] = useState<DiaSemana>("DOM");
  const [diaTemp, setDiaTemp] = useState<DiaSemana>("MAR");
  const [motivo, setMotivo] = useState("");
  const [autoriza, setAutoriza] = useState("");

  const empleadosMap = useMemo(() => new Map(empleados.map((e) => [e.id, e])), [empleados]);
  const sedesMap = useMemo(() => new Map(sedes.map((s) => [s.id, s])), [sedes]);
  const autorizadoresMap = useMemo(() => new Map(autorizadores.map((u) => [u.id, u])), [autorizadores]);

  // Pre-llenar diaOrig cuando se selecciona empleado
  function selectEmpleado(id: string) {
    setEmpleadoId(id);
    const emp = empleadosMap.get(id);
    if (emp?.dia_descanso?.length) {
      setDiaOrig(emp.dia_descanso[0] as DiaSemana);
    }
  }

  const filtered = useMemo(() => {
    if (filter === "ACTIVOS") return cdts.filter((c) => !c.cancelado_en);
    if (filter === "CANCELADOS") return cdts.filter((c) => c.cancelado_en);
    return cdts;
  }, [cdts, filter]);

  function crear() {
    setFeedback(null);
    if (!empleadoId || !motivo.trim()) {
      setFeedback({ kind: "err", msg: "Selecciona empleado y captura el motivo." });
      return;
    }
    startTransition(async () => {
      const r = await crearCDTAction({
        empleado_id: empleadoId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        dia_descanso_orig: diaOrig,
        dia_descanso_temp: diaTemp,
        motivo: motivo.trim(),
        autoriza: autoriza || null,
      });
      if (!r.ok) {
        setFeedback({ kind: "err", msg: r.error });
      } else {
        setFeedback({ kind: "ok", msg: "Cambio temporal registrado." });
        setEmpleadoId("");
        setMotivo("");
        setShowForm(false);
        router.refresh();
      }
    });
  }

  function cancelar(id: string) {
    if (!confirm("¿Cancelar este cambio temporal? Quedará en el historial pero ya no aplica.")) return;
    startTransition(async () => {
      const r = await cancelarCDTAction(id);
      if (!r.ok) setFeedback({ kind: "err", msg: r.error });
      else {
        setFeedback({ kind: "ok", msg: "CDT cancelado." });
        router.refresh();
      }
    });
  }

  function sedeOf(c: CDTRow) {
    return Array.isArray(c.sedes) ? c.sedes[0] : c.sedes;
  }
  function empOf(c: CDTRow) {
    return Array.isArray(c.empleados) ? c.empleados[0] : c.empleados;
  }

  return (
    <>
      {/* Controles + form toggle */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(["ACTIVOS", "TODOS", "CANCELADOS"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`btn btn-sm ${filter === k ? "btn-primary" : "btn-ghost"}`}
            >
              {k}
            </button>
          ))}
          <span className="ml-3 self-center text-xs text-muted-2">
            {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm((v) => !v); setFeedback(null); }}
          className={showForm ? "btn btn-ghost" : "btn btn-primary"}
        >
          {showForm ? "× Cerrar form" : "+ Nuevo CDT"}
        </button>
      </div>

      {/* Form (toggle) */}
      {showForm && (
        <section className="mb-6 surface-glow p-5 animate-fade-up">
          <div className="section-label">Registrar cambio temporal</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field sm:col-span-2">
              <label>Empleado *</label>
              <select value={empleadoId} onChange={(e) => selectEmpleado(e.target.value)}>
                <option value="">— elegir empleado —</option>
                {empleados.map((e) => {
                  const sede = sedesMap.get(e.sede_id);
                  return (
                    <option key={e.id} value={e.id}>
                      #{e.numero_empleado} · {e.nombre} {sede ? `(${sede.abrev})` : ""}
                    </option>
                  );
                })}
              </select>
              {empleados.length === 0 && (
                <p className="text-[10px] text-muted-2">
                  No tienes sedes asignadas. Pide a un admin que te asigne.
                </p>
              )}
            </div>

            <div className="field">
              <label>Fecha inicio del cambio *</label>
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            </div>
            <div className="field">
              <label>Fecha fin del cambio *</label>
              <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
            </div>

            <div className="field">
              <label>Día de descanso original</label>
              <select value={diaOrig} onChange={(e) => setDiaOrig(e.target.value as DiaSemana)}>
                {DIAS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Día de descanso temporal (nuevo)</label>
              <select value={diaTemp} onChange={(e) => setDiaTemp(e.target.value as DiaSemana)}>
                {DIAS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
              </select>
            </div>

            <div className="field sm:col-span-2">
              <label>Motivo *</label>
              <textarea
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Cita médica, evento familiar, etc."
              />
            </div>

            <div className="field sm:col-span-2">
              <label>Autoriza (opcional)</label>
              <select value={autoriza} onChange={(e) => setAutoriza(e.target.value)}>
                <option value="">—</option>
                {autorizadores.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>
                ))}
              </select>
            </div>
          </div>

          {feedback && (
            <p className={`mt-3 rounded-md border px-3 py-2 text-xs ${
              feedback.kind === "ok"
                ? "border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.1)] text-[#6EE7B7]"
                : "border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)] text-[#FCA5A5]"
            }`}>
              {feedback.kind === "ok" ? "✓ " : "⚠ "}{feedback.msg}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost">Cancelar</button>
            <button type="button" onClick={crear} disabled={isPending} className="btn btn-primary">
              {isPending ? (<><span className="loader-vortex-sm" />Creando...</>) : "💾 Registrar CDT"}
            </button>
          </div>
        </section>
      )}

      {/* Lista de CDTs */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--card)] p-10 text-center text-sm text-muted">
          Sin cambios temporales en este filtro.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const emp = empOf(c);
            const sede = sedeOf(c);
            const inicio = c.fecha_original;
            const fin = c.fecha_fin ?? c.fecha_temporal;
            const cancelado = !!c.cancelado_en;
            return (
              <article
                key={c.id}
                className={`surface-card flex flex-wrap items-start justify-between gap-3 p-4 ${cancelado ? "opacity-55" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="font-semibold text-text">{emp?.nombre ?? "—"}</p>
                    <span className="font-mono text-[10px] text-muted-2">#{emp?.numero_empleado ?? "—"}</span>
                    <span className="pill pill-blue">{sede?.abrev ?? "—"}</span>
                    {cancelado && <span className="pill pill-red">CANCELADO</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    <span className="text-text">{inicio}</span> → <span className="text-text">{fin}</span>
                    {c.dia_descanso_orig && c.dia_descanso_temp && (
                      <span className="ml-3">
                        Descanso: <span className="font-mono text-[#FCA5A5] line-through">{c.dia_descanso_orig}</span>
                        {" → "}
                        <span className="font-mono text-[#6EE7B7]">{c.dia_descanso_temp}</span>
                      </span>
                    )}
                  </p>
                  {c.motivo && (
                    <p className="mt-1 text-xs italic text-muted-2">"{c.motivo}"</p>
                  )}
                </div>
                {canCancel && !cancelado && (
                  <button
                    type="button"
                    onClick={() => cancelar(c.id)}
                    className="btn btn-danger btn-sm"
                  >
                    Cancelar
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {isPending && (
        <div className="overlay-loader">
          <div className="loader-vortex-lg" />
          <p className="overlay-loader-text">Procesando...</p>
        </div>
      )}
    </>
  );
}
