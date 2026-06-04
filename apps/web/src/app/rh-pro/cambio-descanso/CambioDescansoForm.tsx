"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { cambiarDescansoFijoAction, type DiaSemana } from "./actions";

export interface SedeRow { id: string; abrev: string; nombre: string }
export interface EmpleadoRow {
  id: string;
  numero_empleado: string;
  nombre: string;
  sede_id: string;
  jornada: string;
  sede_abrev: string;
  dia_descanso: string[];
}

const DIAS: { code: DiaSemana; corto: string; full: string }[] = [
  { code: "LUN", corto: "L", full: "Lunes" },
  { code: "MAR", corto: "M", full: "Martes" },
  { code: "MIE", corto: "M", full: "Miércoles" },
  { code: "JUE", corto: "J", full: "Jueves" },
  { code: "VIE", corto: "V", full: "Viernes" },
  { code: "SAB", corto: "S", full: "Sábado" },
  { code: "DOM", corto: "D", full: "Domingo" },
];

function diasTexto(dias: string[]): string {
  if (!dias.length) return "sin definir";
  return dias.map((d) => DIAS.find((x) => x.code === d)?.full ?? d).join(" y ");
}

export function CambioDescansoForm({ empleados, sedes }: { empleados: EmpleadoRow[]; sedes: SedeRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [sedeId, setSedeId] = useState("");
  const [empleadoId, setEmpleadoId] = useState("");
  const [seleccion, setSeleccion] = useState<Set<DiaSemana>>(new Set());
  const [motivo, setMotivo] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Trabajadores de la sede elegida
  const empleadosSede = useMemo(
    () => (sedeId ? empleados.filter((e) => e.sede_id === sedeId) : []),
    [sedeId, empleados],
  );

  const empleado = useMemo(
    () => empleados.find((e) => e.id === empleadoId) ?? null,
    [empleadoId, empleados],
  );

  function elegirSede(id: string) {
    setSedeId(id);
    setEmpleadoId("");
    setSeleccion(new Set());
    setFeedback(null);
  }

  function elegirEmpleado(id: string) {
    setEmpleadoId(id);
    setFeedback(null);
    // Pre-cargar el descanso actual como punto de partida
    const emp = empleados.find((e) => e.id === id);
    setSeleccion(new Set((emp?.dia_descanso ?? []) as DiaSemana[]));
  }

  function toggleDia(d: DiaSemana) {
    setFeedback(null);
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(d)) {
        next.delete(d);
      } else {
        if (next.size >= 2) {
          setFeedback({ ok: false, msg: "Máximo 2 días de descanso. Quita uno primero." });
          return prev;
        }
        next.add(d);
      }
      return next;
    });
  }

  function aplicar() {
    if (!empleadoId) { setFeedback({ ok: false, msg: "Selecciona un trabajador" }); return; }
    if (seleccion.size === 0) { setFeedback({ ok: false, msg: "Selecciona al menos 1 día de descanso" }); return; }
    if (!motivo.trim()) { setFeedback({ ok: false, msg: "El motivo es obligatorio (queda en auditoría)" }); return; }

    start(async () => {
      const r = await cambiarDescansoFijoAction({
        empleadoId,
        dias: [...seleccion],
        motivo: motivo.trim(),
      });
      setFeedback({ ok: r.ok, msg: r.ok ? r.mensaje : r.error });
      if (r.ok) {
        setMotivo("");
        setEmpleadoId("");
        setSeleccion(new Set());
        router.refresh();
      }
    });
  }

  // Hay cambio respecto a lo actual?
  const hayCambio = useMemo(() => {
    if (!empleado) return false;
    const prev = [...empleado.dia_descanso].sort().join(",");
    const next = [...seleccion].sort().join(",");
    return prev !== next && seleccion.size > 0;
  }, [empleado, seleccion]);

  return (
    <section className="surface-glow space-y-5 p-5 sm:p-6">
      {/* Paso 1: Sede */}
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-tagline text-muted-2">
          <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-500/30 text-[9px] font-bold text-blue-200">1</span>
          Sede
        </label>
        <select
          value={sedeId}
          onChange={(e) => elegirSede(e.target.value)}
          disabled={pending}
          className="w-full rounded-md border border-white/10 bg-[color:var(--bg)] px-3 py-2 text-sm"
        >
          <option value="">— selecciona una sede —</option>
          {sedes.map((s) => (
            <option key={s.id} value={s.id}>{s.abrev} · {s.nombre}</option>
          ))}
        </select>
      </div>

      {/* Paso 2: Trabajador */}
      {sedeId && (
        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-tagline text-muted-2">
            <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-500/30 text-[9px] font-bold text-blue-200">2</span>
            Trabajador ({empleadosSede.length} en esta sede)
          </label>
          {empleadosSede.length === 0 ? (
            <p className="rounded-md border border-dashed border-white/10 p-3 text-xs text-muted">
              Esta sede no tiene trabajadores activos.
            </p>
          ) : (
            <select
              value={empleadoId}
              onChange={(e) => elegirEmpleado(e.target.value)}
              disabled={pending}
              className="w-full rounded-md border border-white/10 bg-[color:var(--bg)] px-3 py-2 text-sm"
            >
              <option value="">— selecciona un trabajador —</option>
              {empleadosSede.map((e) => (
                <option key={e.id} value={e.id}>
                  #{e.numero_empleado} · {e.nombre} ({e.jornada}) · descansa {diasTexto(e.dia_descanso)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Paso 3: Día(s) de descanso */}
      {empleado && (
        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-tagline text-muted-2">
            <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-500/30 text-[9px] font-bold text-blue-200">3</span>
            Nuevo día de descanso (1 o 2)
          </label>
          <div className="mb-2 rounded-md border border-white/5 bg-[color:var(--bg)] px-3 py-2 text-[11px] text-muted">
            Descanso actual: <span className="font-semibold text-text">{diasTexto(empleado.dia_descanso)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {DIAS.map((d) => {
              const activo = seleccion.has(d.code);
              return (
                <button
                  key={d.code}
                  type="button"
                  onClick={() => toggleDia(d.code)}
                  disabled={pending}
                  title={d.full}
                  className={`flex h-12 w-12 flex-col items-center justify-center rounded-lg border text-xs font-bold transition disabled:opacity-40 ${
                    activo
                      ? "border-blue-400 bg-blue-500/30 text-blue-100"
                      : "border-white/10 bg-[color:var(--bg)] text-muted hover:border-white/30 hover:text-text"
                  }`}
                >
                  <span className="text-sm">{d.corto}</span>
                  <span className="text-[8px] opacity-70">{d.code}</span>
                </button>
              );
            })}
          </div>
          {seleccion.size > 0 && (
            <p className="mt-2 text-[11px] text-muted">
              Nuevo descanso: <span className="font-semibold text-emerald-200">{diasTexto([...seleccion])}</span>
            </p>
          )}
        </div>
      )}

      {/* Paso 4: Motivo */}
      {empleado && (
        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-tagline text-muted-2">
            <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-500/30 text-[9px] font-bold text-blue-200">4</span>
            Motivo del cambio
          </label>
          <textarea
            value={motivo}
            onChange={(e) => { setMotivo(e.target.value); setFeedback(null); }}
            disabled={pending}
            rows={2}
            placeholder="Ej: Solicitud del trabajador, reorganización de turnos, acuerdo con supervisor…"
            className="w-full rounded-md border border-white/10 bg-[color:var(--bg)] px-3 py-2 text-sm"
          />
        </div>
      )}

      {feedback && (
        <p className={`rounded-md border px-3 py-2 text-xs ${
          feedback.ok
            ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200"
            : "border-red-400/30 bg-red-500/[0.08] text-red-200"
        }`}>
          {feedback.msg}
        </p>
      )}

      {empleado && (
        <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-4">
          <button
            type="button"
            onClick={aplicar}
            disabled={pending || !hayCambio || !motivo.trim()}
            className="btn btn-primary"
          >
            {pending ? "Aplicando..." : "Aplicar cambio de descanso"}
          </button>
          {!hayCambio && seleccion.size > 0 && (
            <span className="text-[11px] text-muted-2">Selecciona un día distinto al actual.</span>
          )}
          <span className="ml-auto text-[10px] text-muted-2">
            El pase de lista usará el nuevo descanso · el supervisor recibe push
          </span>
        </div>
      )}
    </section>
  );
}
