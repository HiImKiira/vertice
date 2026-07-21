"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import {
  estadoInfo,
  siguientesEstados,
  type IncapacidadEstado,
  type IncapacidadTipo,
} from "@/lib/incapacidades";
import {
  cambiarEstadoIncapacidadAction,
  agregarComentarioIncapacidadAction,
  dictaminarIncapacidadAction,
} from "../actions";

interface Props {
  incapacidadId: string;
  estadoActual: IncapacidadEstado;
  tipo: IncapacidadTipo;
  isAdmin: boolean;
}

export function EstadoActions({ incapacidadId, estadoActual, tipo, isAdmin }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [comentario, setComentario] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [showDictamen, setShowDictamen] = useState(false);
  const [calificada, setCalificada] = useState<"si" | "no">("si");
  const [dictFecha, setDictFecha] = useState(new Date().toISOString().slice(0, 10));
  const [dictNotas, setDictNotas] = useState("");
  const [folioSt7, setFolioSt7] = useState("");
  const [diagnostico, setDiagnostico] = useState("");

  const siguientes = siguientesEstados(estadoActual, tipo);

  function avanzarA(nuevo: IncapacidadEstado) {
    if (!confirm(`Cambiar a "${estadoInfo(tipo, nuevo).label}"?`)) return;
    setMsg(null);
    start(async () => {
      const r = await cambiarEstadoIncapacidadAction({ incapacidad_id: incapacidadId, nuevo_estado: nuevo });
      if (!r.ok) setMsg(`Error: ${r.error}`);
      else router.refresh();
    });
  }

  function enviarComentario() {
    if (!comentario.trim()) return;
    setMsg(null);
    start(async () => {
      const r = await agregarComentarioIncapacidadAction({ incapacidad_id: incapacidadId, comentario });
      if (!r.ok) setMsg(`Error: ${r.error}`);
      else { setComentario(""); router.refresh(); }
    });
  }

  function dictaminar() {
    if (!dictFecha) { setMsg("Fecha del dictamen requerida"); return; }
    setMsg(null);
    start(async () => {
      const r = await dictaminarIncapacidadAction({
        incapacidad_id: incapacidadId,
        calificada: calificada === "si",
        fecha: dictFecha,
        notas: dictNotas,
        folio_st7: folioSt7,
        diagnostico,
      });
      if (!r.ok) setMsg(`Error: ${r.error}`);
      else { setShowDictamen(false); router.refresh(); }
    });
  }

  return (
    <div className="space-y-3">
      {isAdmin && estadoActual === "DICTAMEN" && (
        <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/[0.05] p-3">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="file-text" size={14} className="text-cyan-300" />
            <p className="text-xs font-semibold text-cyan-200">Capturar dictamen IMSS</p>
          </div>
          {!showDictamen ? (
            <button
              type="button"
              onClick={() => setShowDictamen(true)}
              disabled={pending}
              className="rounded-md bg-cyan-500/30 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/50 disabled:opacity-40"
            >
              Registrar dictamen
            </button>
          ) : (
            <div className="space-y-2">
              <div className="field">
                <label>¿IMSS calificó como riesgo de trabajo?</label>
                <select value={calificada} onChange={(e) => setCalificada(e.target.value as "si" | "no")}>
                  <option value="si">SÍ — pasa a Alta pendiente (ST-2)</option>
                  <option value="no">NO — pasa a Rechazada</option>
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="field">
                  <label>Fecha dictamen</label>
                  <input type="date" value={dictFecha} onChange={(e) => setDictFecha(e.target.value)} />
                </div>
                <div className="field">
                  <label>Folio ST-7 (opcional)</label>
                  <input type="text" value={folioSt7} onChange={(e) => setFolioSt7(e.target.value)} placeholder="ej. 332025046/596" />
                </div>
              </div>
              <div className="field">
                <label>Diagnóstico nosológico (opcional)</label>
                <input type="text" value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} placeholder="ej. S709 - Traumatismo superficial..." />
              </div>
              <div className="field">
                <label>Notas del dictamen</label>
                <textarea rows={2} value={dictNotas} onChange={(e) => setDictNotas(e.target.value)} placeholder="Observaciones del IMSS..." />
              </div>
              <div className="flex gap-2">
                <button onClick={dictaminar} disabled={pending} className="btn btn-primary btn-sm">
                  {pending ? "Guardando..." : "Confirmar dictamen"}
                </button>
                <button onClick={() => setShowDictamen(false)} disabled={pending} className="btn btn-ghost btn-sm">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transiciones de estado */}
      {isAdmin && siguientes.length > 0 && (
        <div className="rounded-xl border border-blue-400/25 bg-blue-500/[0.04] p-3">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="arrow-right" size={14} className="text-blue-300" />
            <p className="text-xs font-semibold text-blue-200">Avanzar etapa</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {siguientes.map((s) => {
              const spec = estadoInfo(tipo, s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => avanzarA(s)}
                  disabled={pending}
                  className="rounded-md border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40"
                  style={{
                    borderColor: `${spec.color}55`,
                    background: `${spec.color}1A`,
                    color: spec.color,
                  }}
                  title={spec.description}
                >
                  → {spec.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Comentario */}
      <div className="rounded-xl border border-white/10 bg-[color:var(--card)] p-3">
        <div className="mb-2 flex items-center gap-2">
          <Icon name="message-circle" size={14} className="text-muted" />
          <p className="text-xs font-semibold">Agregar comentario al timeline</p>
        </div>
        <textarea
          rows={2}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Notas, actualizaciones, recordatorios..."
          className="w-full rounded-md border border-white/10 bg-[color:var(--surface)] p-2 text-sm"
          disabled={pending}
        />
        <button
          type="button"
          onClick={enviarComentario}
          disabled={pending || !comentario.trim()}
          className="mt-2 rounded-md bg-blue-500/30 px-3 py-1.5 text-xs font-semibold text-blue-100 hover:bg-blue-500/50 disabled:opacity-40"
        >
          {pending ? "..." : "Agregar"}
        </button>
      </div>

      {msg && (
        <p className="rounded-md border border-red-400/30 bg-red-500/[0.06] px-3 py-2 text-xs text-red-300">
          {msg}
        </p>
      )}
    </div>
  );
}
