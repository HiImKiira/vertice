"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import {
  agregarAsignacionSupervisorAction,
  eliminarAsignacionSupervisorAction,
} from "../actions";

type Jornada = "MATUTINO" | "VESPERTINO" | "NOCTURNO" | "TURNO_ROTATIVO" | "CUBRETURNOS" | "DIURNO";

const JORNADAS: Jornada[] = ["MATUTINO", "VESPERTINO", "NOCTURNO", "TURNO_ROTATIVO", "CUBRETURNOS", "DIURNO"];

interface SedeOpt { id: string; abrev: string; nombre: string }
interface AsignRow { id: string; sede_id: string; sede_abrev: string; sede_nombre: string; jornada: string }

interface Props {
  supervisorId: string;
  callerRol: string;
  asignaciones: AsignRow[];
  sedes: SedeOpt[];
}

function jornadaColor(j: string): string {
  switch (j) {
    case "MATUTINO": return "bg-amber-500/20 text-amber-200 border-amber-400/30";
    case "VESPERTINO": return "bg-orange-500/20 text-orange-200 border-orange-400/30";
    case "NOCTURNO": return "bg-violet-500/20 text-violet-200 border-violet-400/30";
    case "DIURNO": return "bg-blue-500/20 text-blue-200 border-blue-400/30";
    case "TURNO_ROTATIVO": return "bg-emerald-500/20 text-emerald-200 border-emerald-400/30";
    case "CUBRETURNOS": return "bg-pink-500/20 text-pink-200 border-pink-400/30";
    default: return "bg-white/10 text-text border-white/20";
  }
}

export function AsignacionesEditorInline({ supervisorId, callerRol, asignaciones, sedes }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sedeId, setSedeId] = useState<string>("");
  const [jornada, setJornada] = useState<Jornada>("MATUTINO");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const esAdminLike = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(callerRol);

  function agregar() {
    setMsg(null);
    if (!sedeId) { setMsg({ kind: "err", text: "Selecciona una sede" }); return; }
    // Validar duplicado en el cliente
    if (asignaciones.some((a) => a.sede_id === sedeId && a.jornada === jornada)) {
      setMsg({ kind: "err", text: "Ya tiene esta asignación" });
      return;
    }
    start(async () => {
      const r = await agregarAsignacionSupervisorAction({ supervisorId, sedeId, jornada });
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      setMsg({ kind: "ok", text: "✓ Asignación agregada" });
      setSedeId("");
      router.refresh();
    });
  }

  function quitar(asignId: string, label: string) {
    if (!confirm(`¿Quitar la asignación ${label}? El supervisor dejará de ver esos empleados.`)) return;
    setMsg(null);
    start(async () => {
      const r = await eliminarAsignacionSupervisorAction({ supervisorId, asignacionId: asignId });
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      router.refresh();
    });
  }

  // Agrupar por sede para mostrar mejor
  const porSede = new Map<string, { sede: { id: string; abrev: string; nombre: string }; items: AsignRow[] }>();
  for (const a of asignaciones) {
    if (!porSede.has(a.sede_id)) {
      porSede.set(a.sede_id, {
        sede: { id: a.sede_id, abrev: a.sede_abrev, nombre: a.sede_nombre },
        items: [],
      });
    }
    porSede.get(a.sede_id)!.items.push(a);
  }
  const sedesAgrupadas = [...porSede.values()].sort((a, b) => a.sede.abrev.localeCompare(b.sede.abrev));

  return (
    <div className="surface-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="section-label flex items-center gap-2">
          <Icon name="building" size={12} className="text-muted" />
          Asignaciones (sede × jornada)
        </div>
        <span className="text-[10px] text-muted-2">
          {asignaciones.length} activa{asignaciones.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Lista agrupada por sede */}
      {sedesAgrupadas.length === 0 ? (
        <p className="rounded-md border border-dashed border-red-400/20 bg-red-500/[0.04] p-3 text-center text-[11px] text-red-200">
          ⚠ Sin asignaciones. Este supervisor no podrá capturar nada.
        </p>
      ) : (
        <ul className="space-y-2">
          {sedesAgrupadas.map((g) => (
            <li key={g.sede.id} className="rounded-md border border-white/5 bg-[color:var(--bg)] p-2">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-[#93C5FD]">{g.sede.abrev}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{g.sede.nombre}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((a) => (
                  <span
                    key={a.id}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-mono font-bold ${jornadaColor(a.jornada)}`}
                  >
                    {a.jornada}
                    {esAdminLike && (
                      <button
                        onClick={() => quitar(a.id, `${a.sede_abrev} · ${a.jornada}`)}
                        disabled={pending}
                        className="-mr-0.5 ml-0.5 rounded p-0.5 hover:bg-white/20 disabled:opacity-40"
                        title="Quitar asignación"
                      >
                        <Icon name="x" size={9} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Formulario agregar */}
      {esAdminLike && (
        <div className="mt-3 border-t border-white/5 pt-3">
          <p className="mb-2 text-[10px] uppercase tracking-tagline text-muted-2">Agregar asignación</p>
          <div className="flex flex-wrap gap-2">
            <select
              value={sedeId}
              onChange={(e) => setSedeId(e.target.value)}
              disabled={pending}
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-[color:var(--bg)] px-2 py-1.5 text-xs"
            >
              <option value="">— sede —</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.abrev} · {s.nombre}
                </option>
              ))}
            </select>
            <select
              value={jornada}
              onChange={(e) => setJornada(e.target.value as Jornada)}
              disabled={pending}
              className="rounded-md border border-white/10 bg-[color:var(--bg)] px-2 py-1.5 text-xs"
            >
              {JORNADAS.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
            <button
              onClick={agregar}
              disabled={pending || !sedeId}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40"
            >
              <Icon name="plus" size={11} />
              Agregar
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={`mt-3 rounded-md border px-3 py-2 text-[11px] ${
          msg.kind === "ok"
            ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200"
            : "border-red-400/30 bg-red-500/[0.08] text-red-200"
        }`}>{msg.text}</p>
      )}
    </div>
  );
}
