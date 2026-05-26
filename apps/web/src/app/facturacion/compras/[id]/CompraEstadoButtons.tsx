"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarEstadoSolicitudAction, cancelarSolicitudPropiaAction } from "../../actions";

type Estado = "SOLICITADA" | "APROBADA" | "RECHAZADA" | "COMPRADA" | "ENTREGADA" | "CANCELADA";

interface Props {
  id: string;
  estadoActual: string;
  puedeCambiarEstado: boolean;
  puedeCancelarPropia: boolean;
}

export function CompraEstadoButtons({ id, estadoActual, puedeCambiarEstado, puedeCancelarPropia }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notas, setNotas] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function cambiar(nuevo: Estado) {
    if (!confirm(`Cambiar estado a ${nuevo}?`)) return;
    setMsg(null);
    start(async () => {
      const r = await cambiarEstadoSolicitudAction(id, nuevo, notas || undefined);
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      setMsg({ kind: "ok", text: `✓ Estado: ${nuevo}` });
      setNotas("");
      router.refresh();
    });
  }

  function cancelarPropia() {
    if (!confirm("¿Cancelar tu solicitud?")) return;
    start(async () => {
      const r = await cancelarSolicitudPropiaAction(id);
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      router.refresh();
    });
  }

  return (
    <div className="surface-card p-4">
      <div className="section-label mb-3">Acciones</div>

      {puedeCambiarEstado && (
        <>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas opcionales (visibles para el solicitante en el push)"
            rows={2}
            className="mb-3 w-full rounded-md border border-white/10 bg-[color:var(--bg)] px-2 py-1.5 text-xs"
          />
          <div className="flex flex-col gap-2">
            {estadoActual === "SOLICITADA" && (
              <>
                <button onClick={() => cambiar("APROBADA")} disabled={pending} className="rounded-md border border-blue-400/40 bg-blue-500/15 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-500/30 disabled:opacity-40">
                  ✓ APROBAR
                </button>
                <button onClick={() => cambiar("RECHAZADA")} disabled={pending} className="rounded-md border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/30 disabled:opacity-40">
                  ✗ Rechazar
                </button>
              </>
            )}
            {estadoActual === "APROBADA" && (
              <button onClick={() => cambiar("COMPRADA")} disabled={pending} className="btn btn-primary btn-sm">
                Marcar como COMPRADA
              </button>
            )}
            {estadoActual === "COMPRADA" && (
              <button onClick={() => cambiar("ENTREGADA")} disabled={pending} className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40">
                Marcar ENTREGADA al solicitante
              </button>
            )}
            {!["CANCELADA", "ENTREGADA", "RECHAZADA"].includes(estadoActual) && (
              <button onClick={() => cambiar("CANCELADA")} disabled={pending} className="btn btn-ghost btn-sm text-red-300">
                Cancelar solicitud
              </button>
            )}
          </div>
        </>
      )}

      {puedeCancelarPropia && !puedeCambiarEstado && (
        <button onClick={cancelarPropia} disabled={pending} className="btn btn-ghost btn-sm w-full text-red-300">
          Cancelar mi solicitud
        </button>
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
