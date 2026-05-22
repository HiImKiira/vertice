"use client";

import { useState, useTransition } from "react";
import { VortexLoader } from "@/components/VortexLoader";
import { useRouter } from "next/navigation";
import { agregarAsignacionAction, eliminarAsignacionAction } from "./asignaciones-actions";

interface Sede { id: string; abrev: string; nombre: string }
interface Asign {
  id: string;
  jornada: string;
  sede: { id: string; abrev: string; nombre: string };
}
export interface SupervisorRow {
  usuario_id: string;
  username: string;
  nombre: string;
  rol: string;
  asignaciones: Asign[];
}

const JORNADAS = ["MATUTINO", "VESPERTINO", "NOCTURNO", "TURNO_ROTATIVO", "CUBRETURNOS", "DIURNO"] as const;
type Jornada = (typeof JORNADAS)[number];

export function AsignacionesEditor({ supervisores, sedes }: { supervisores: SupervisorRow[]; sedes: Sede[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Estados locales por supervisor: sede + jornada selección
  const [addState, setAddState] = useState<Record<string, { sede_id: string; jornada: Jornada }>>({});

  function getAddState(usuarioId: string) {
    return addState[usuarioId] ?? { sede_id: "", jornada: "MATUTINO" as Jornada };
  }

  function setAdd(usuarioId: string, patch: Partial<{ sede_id: string; jornada: Jornada }>) {
    setAddState((prev) => ({ ...prev, [usuarioId]: { ...getAddState(usuarioId), ...patch } }));
  }

  function eliminar(asignId: string) {
    if (!confirm("¿Eliminar esta asignación?")) return;
    setError(null);
    startTransition(async () => {
      const r = await eliminarAsignacionAction(asignId);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  function agregar(usuarioId: string) {
    const s = getAddState(usuarioId);
    if (!s.sede_id) {
      setError("Selecciona una sede primero.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await agregarAsignacionAction({ usuario_id: usuarioId, sede_id: s.sede_id, jornada: s.jornada });
      if (!r.ok) setError(r.error);
      else {
        setAdd(usuarioId, { sede_id: "", jornada: "MATUTINO" });
        router.refresh();
      }
    });
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded-xl border border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)] px-4 py-2.5 text-sm text-[#FCA5A5]">
          ⚠ {error}
        </div>
      )}

      <div className="space-y-3">
        {supervisores.map((s) => {
          const add = getAddState(s.usuario_id);
          // Sedes ya asignadas a este supervisor (para filtrar)
          const sedesAsignadas = new Set(s.asignaciones.map((a) => `${a.sede.id}|${a.jornada}`));
          return (
            <article key={s.usuario_id} className="surface-card p-4">
              {/* Cabecera supervisor */}
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-semibold text-text">{s.nombre}</p>
                  <p className="text-xs text-muted">
                    <span className="font-mono">@{s.username}</span>{" "}
                    <span className={`role-badge role-${s.rol} ml-1`}>{s.rol}</span>
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-tagline text-muted">
                  {s.asignaciones.length} asignacion{s.asignaciones.length === 1 ? "" : "es"}
                </span>
              </div>

              {/* Chips asignaciones */}
              <div className="mb-3 flex flex-wrap gap-1.5">
                {s.asignaciones.length === 0 && (
                  <span className="text-xs italic text-muted-2">Sin asignaciones</span>
                )}
                {s.asignaciones.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.12)] px-2.5 py-1 text-[11px] text-[#6EE7B7]"
                  >
                    <span className="font-bold uppercase tracking-tagline">{a.jornada}</span>
                    <span className="opacity-50">@</span>
                    <span className="font-mono">{a.sede.abrev}</span>
                    <button
                      type="button"
                      onClick={() => eliminar(a.id)}
                      disabled={isPending}
                      className="ml-1 rounded-full bg-[rgba(239,68,68,0.18)] px-1.5 py-0.5 text-[9px] text-[#FCA5A5] hover:bg-[rgba(239,68,68,0.4)] hover:text-white disabled:opacity-40"
                      title={`Quitar ${a.jornada} @ ${a.sede.nombre}`}
                      aria-label="Eliminar asignación"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              {/* Add row */}
              <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
                <div className="field">
                  <label className="sr-only">Sede</label>
                  <select
                    value={add.sede_id}
                    onChange={(e) => setAdd(s.usuario_id, { sede_id: e.target.value })}
                    disabled={isPending}
                  >
                    <option value="">— elegir sede —</option>
                    {sedes
                      .filter((sd) => !sedesAsignadas.has(`${sd.id}|${add.jornada}`))
                      .map((sd) => (
                        <option key={sd.id} value={sd.id}>{sd.abrev} · {sd.nombre}</option>
                      ))}
                  </select>
                </div>
                <div className="field">
                  <label className="sr-only">Jornada</label>
                  <select
                    value={add.jornada}
                    onChange={(e) => setAdd(s.usuario_id, { jornada: e.target.value as Jornada })}
                    disabled={isPending}
                  >
                    {JORNADAS.map((j) => (
                      <option key={j} value={j}>{j}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => agregar(s.usuario_id)}
                  disabled={isPending || !add.sede_id}
                  className="btn btn-success self-end"
                >
                  + Agregar
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {isPending && (
        <div className="overlay-loader">
          <VortexLoader size={64} />
          <p className="overlay-loader-text">Actualizando asignaciones...</p>
        </div>
      )}
    </>
  );
}
