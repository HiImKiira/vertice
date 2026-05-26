"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarEstadoCotizacionAction, eliminarCotizacionAction } from "../../actions";

type Estado = "BORRADOR" | "ENVIADA" | "ACEPTADA" | "RECHAZADA" | "FACTURADA" | "CANCELADA";

export function EstadoButtons({ id, estadoActual }: { id: string; estadoActual: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showRechazo, setShowRechazo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function cambiar(nuevo: Estado, motivoRechazo?: string) {
    if (!confirm(`Cambiar estado a ${nuevo}?`)) return;
    setMsg(null);
    start(async () => {
      const r = await cambiarEstadoCotizacionAction(id, nuevo, motivoRechazo);
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      setMsg({ kind: "ok", text: `✓ Estado cambiado a ${nuevo}` });
      router.refresh();
    });
  }

  function rechazar() {
    if (!motivo.trim()) { setMsg({ kind: "err", text: "Motivo requerido" }); return; }
    cambiar("RECHAZADA", motivo);
    setShowRechazo(false);
    setMotivo("");
  }

  function eliminar() {
    if (!confirm("¿Eliminar esta cotización? Solo se puede si está en BORRADOR.")) return;
    start(async () => {
      const r = await eliminarCotizacionAction(id);
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      router.push("/facturacion/cotizaciones");
    });
  }

  return (
    <div className="surface-card p-4">
      <div className="section-label mb-3">Acciones</div>
      <div className="flex flex-col gap-2">
        {estadoActual === "BORRADOR" && (
          <>
            <button onClick={() => cambiar("ENVIADA")} disabled={pending} className="btn btn-primary btn-sm">Marcar como ENVIADA</button>
            <button onClick={eliminar} disabled={pending} className="btn btn-ghost btn-sm text-red-300">Eliminar (BORRADOR)</button>
          </>
        )}
        {estadoActual === "ENVIADA" && (
          <>
            <button onClick={() => cambiar("ACEPTADA")} disabled={pending} className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40">
              ✓ Marcar ACEPTADA
            </button>
            <button onClick={() => setShowRechazo(true)} disabled={pending} className="rounded-md border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/30 disabled:opacity-40">
              ✗ RECHAZADA
            </button>
            <button onClick={() => cambiar("BORRADOR")} disabled={pending} className="btn btn-ghost btn-sm">Regresar a borrador</button>
          </>
        )}
        {estadoActual === "ACEPTADA" && (
          <button onClick={() => cambiar("FACTURADA")} disabled={pending} className="btn btn-primary btn-sm">Marcar FACTURADA</button>
        )}
        {!["BORRADOR", "CANCELADA"].includes(estadoActual) && (
          <button onClick={() => cambiar("CANCELADA")} disabled={pending} className="btn btn-ghost btn-sm text-red-300">Cancelar cotización</button>
        )}
      </div>

      {showRechazo && (
        <div className="mt-3 space-y-2 rounded-lg border border-red-400/20 bg-red-500/5 p-3">
          <label className="text-[10px] text-red-200">Motivo del rechazo</label>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className="w-full rounded-md border border-white/10 bg-[color:var(--bg)] px-2 py-1 text-xs" />
          <div className="flex gap-2">
            <button onClick={rechazar} disabled={pending} className="btn btn-primary btn-sm">Rechazar</button>
            <button onClick={() => setShowRechazo(false)} disabled={pending} className="btn btn-ghost btn-sm">Cancelar</button>
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
