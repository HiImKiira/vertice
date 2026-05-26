"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useOfflineSync } from "@/lib/offline-sync";
import { eliminarPendiente } from "@/lib/offline-store";

/**
 * Indicador global de estado offline + panel desplegable de pendientes.
 * Pensado para incrustar en PaseListaClient u otros componentes que usan
 * el modo offline. Devuelve también las funciones para integrarse.
 */
export function OfflineBadge() {
  const { status, syncNow, pendientesList, reloadList, limpiarSincronizados } = useOfflineSync();
  const [open, setOpen] = useState(false);

  const hayActividad = status.pendientes > 0 || status.errores > 0 || !status.online;
  if (!hayActividad && !open) return null;

  async function descartar(id: string) {
    if (!confirm("¿Descartar esta captura pendiente? Las marcas NO se guardarán.")) return;
    await eliminarPendiente(id);
    await reloadList();
  }

  return (
    <div className="fixed bottom-3 right-3 z-40 max-w-sm sm:bottom-5 sm:right-5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur transition ${
          !status.online
            ? "bg-red-500/80 text-white"
            : status.errores > 0
              ? "bg-red-500/30 text-red-200 border border-red-400/50"
              : status.pendientes > 0
                ? "bg-amber-500/30 text-amber-100 border border-amber-400/50"
                : "bg-emerald-500/30 text-emerald-100 border border-emerald-400/50"
        }`}
      >
        {status.syncing ? (
          <span className="loader-vortex-sm" />
        ) : !status.online ? (
          <Icon name="alert-triangle" size={14} />
        ) : status.errores > 0 ? (
          <Icon name="alert-triangle" size={14} />
        ) : status.pendientes > 0 ? (
          <Icon name="clock" size={14} />
        ) : (
          <Icon name="check" size={14} />
        )}
        <span>
          {!status.online && "Sin conexión"}
          {status.online && status.syncing && "Sincronizando..."}
          {status.online && !status.syncing && status.pendientes > 0 && `${status.pendientes} pendiente${status.pendientes === 1 ? "" : "s"}`}
          {status.online && !status.syncing && status.pendientes === 0 && status.errores > 0 && `${status.errores} con error`}
          {status.online && !status.syncing && status.pendientes === 0 && status.errores === 0 && "Todo sincronizado"}
        </span>
      </button>

      {open && (
        <div className="mt-2 max-h-[60vh] w-80 overflow-y-auto rounded-xl border border-white/10 bg-[color:var(--bg)]/95 p-3 shadow-2xl backdrop-blur sm:w-96">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <p className="font-display text-sm">Sincronización offline</p>
              <p className="text-[10px] text-muted">
                {status.online ? "Conectado" : "Sin internet — las capturas quedan locales"}
                {status.ultimaSync && status.online && (
                  <> · última sync {status.ultimaSync.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted hover:bg-white/5"
            >
              <Icon name="x" size={14} />
            </button>
          </div>

          {/* Acciones */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => syncNow()}
              disabled={status.syncing || !status.online}
              className="inline-flex items-center gap-1 rounded-md border border-blue-400/30 bg-blue-500/15 px-2.5 py-1 text-[10px] font-semibold text-blue-200 hover:bg-blue-500/30 disabled:opacity-40"
            >
              <Icon name="refresh" size={11} />
              {status.syncing ? "..." : "Sincronizar ahora"}
            </button>
            {pendientesList.some((p) => p.status === "synced") && (
              <button
                type="button"
                onClick={limpiarSincronizados}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-[10px] text-muted hover:text-text"
              >
                <Icon name="trash" size={10} />
                Limpiar sincronizados
              </button>
            )}
          </div>

          {/* Lista de pendientes */}
          {pendientesList.length === 0 ? (
            <p className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-3 text-center text-[11px] text-muted">
              No hay capturas pendientes.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {pendientesList.map((p) => {
                const fechaCap = new Date(p.createdAt).toLocaleString("es-MX", {
                  dateStyle: "short",
                  timeStyle: "short",
                });
                const color = p.status === "synced"
                  ? "border-emerald-400/30 bg-emerald-500/[0.06] text-emerald-200"
                  : p.status === "syncing"
                    ? "border-blue-400/30 bg-blue-500/[0.06] text-blue-200"
                    : p.status === "error"
                      ? "border-red-400/30 bg-red-500/[0.06] text-red-200"
                      : "border-amber-400/30 bg-amber-500/[0.06] text-amber-200";
                return (
                  <li key={p.id} className={`rounded-md border p-2 text-[11px] ${color}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-bold uppercase">
                        {p.status === "synced" ? "✓ Sincronizado"
                          : p.status === "syncing" ? "Enviando..."
                          : p.status === "error" ? "✗ Error"
                          : "⏳ Pendiente"}
                      </span>
                      <span className="font-mono text-[9px] opacity-70">{fechaCap}</span>
                    </div>
                    <p className="mt-1 truncate">
                      <span className="font-mono">{p.fecha}</span> · {p.jornada} · {p.marcas.length} marca{p.marcas.length === 1 ? "" : "s"}
                    </p>
                    {p.errorMsg && (
                      <p className="mt-1 break-words text-[10px] opacity-80">
                        {p.errorMsg}
                      </p>
                    )}
                    {p.attempts > 0 && (
                      <p className="mt-0.5 text-[9px] opacity-60">{p.attempts} intento{p.attempts === 1 ? "" : "s"}</p>
                    )}
                    {(p.status === "error" || p.status === "pending") && (
                      <button
                        type="button"
                        onClick={() => descartar(p.id)}
                        className="mt-1 text-[10px] underline opacity-70 hover:opacity-100"
                      >
                        Descartar
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
