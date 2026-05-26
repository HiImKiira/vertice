"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { notificarSupervisorPendientesAction } from "./actions";

interface Detalle {
  sede_abrev: string;
  sede_nombre: string;
  jornada: string;
  empleados: number;
  capturadas: number;
  pct: number;
  ultima_captura: string | null;
}

interface Mensual {
  total_empleados: number;
  dias_mes: number;
  dias_transcurridos: number;
  registros_esperados_mes: number;
  registros_esperados_a_hoy: number;
  registros_capturados: number;
  pct_mes: number;
  pct_a_hoy: number;
  dias_con_100: number;
  dias_con_0: number;
}

interface Props {
  usuarioId: string;
  nombre: string;
  username: string;
  sedesN: number;
  jornadasN: number;
  empTotal: number;
  capturadas: number;
  pct: number;
  faltantes: number;
  ultimaCaptura: string | null;
  fecha: string; // YYYY-MM-DD
}

export function SupervisorRow({
  usuarioId,
  nombre,
  username,
  sedesN,
  jornadasN,
  empTotal,
  capturadas,
  pct,
  faltantes,
  ultimaCaptura,
  fecha,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [detalle, setDetalle] = useState<Detalle[] | null>(null);
  const [mensual, setMensual] = useState<Mensual | null>(null);
  const [loading, setLoading] = useState(false);
  const [notifyPending, startNotify] = useTransition();
  const [notifyMsg, setNotifyMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function notificarPendientes() {
    if (faltantes <= 0) return;
    if (!confirm(`Mandar push a ${nombre} con sus ${faltantes} pendiente${faltantes === 1 ? "" : "s"} del ${fecha}?`)) return;
    setNotifyMsg(null);
    startNotify(async () => {
      const r = await notificarSupervisorPendientesAction(usuarioId, fecha);
      if (!r.ok) {
        setNotifyMsg({ kind: "err", text: r.error });
        return;
      }
      setNotifyMsg({
        kind: "ok",
        text: `Push enviado a ${r.enviados} dispositivo${r.enviados === 1 ? "" : "s"} · ${r.resumen}${r.fallidos > 0 ? ` · ${r.fallidos} fallidos` : ""}`,
      });
    });
  }

  async function toggle() {
    if (!expanded && !detalle) {
      setLoading(true);
      try {
        const [d, m] = await Promise.all([
          fetch(`/api/cobertura/detalle?u=${usuarioId}&fecha=${fecha}`).then((r) => r.json()),
          fetch(`/api/cobertura/mensual?u=${usuarioId}&fecha=${fecha}`).then((r) => r.json()),
        ]);
        if (d?.ok) setDetalle(d.detalle ?? []);
        if (m?.ok) setMensual(m.mensual ?? null);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    setExpanded(!expanded);
  }

  const color = pct >= 95 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444";
  const ultima = ultimaCaptura
    ? new Date(ultimaCaptura).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <li className="rounded-xl border border-white/5 bg-[color:var(--card)] overflow-hidden">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={toggle}
          className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left transition hover:bg-white/[0.03]"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="truncate text-sm font-semibold text-text">{nombre}</p>
              <span className="font-mono text-[10px] text-muted-2">@{username}</span>
            </div>
            <p className="text-[10px] text-muted-2">
              {sedesN} sede{sedesN === 1 ? "" : "s"} · {jornadasN} jornada{jornadasN === 1 ? "" : "s"} · {empTotal} empleado{empTotal === 1 ? "" : "s"}
              {ultimaCaptura && <> · última {ultima}</>}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-display text-xl font-bold leading-none" style={{ color }}>
              {pct}%
            </p>
            <p className="font-mono text-[10px] text-muted">
              {capturadas}/{empTotal}
              {faltantes > 0 && <span className="text-red-300"> · {faltantes} falta{faltantes === 1 ? "" : "n"}</span>}
            </p>
          </div>
          <Icon name="arrow-right" size={12} className={`shrink-0 text-muted-2 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
        {faltantes > 0 && (
          <button
            type="button"
            onClick={notificarPendientes}
            disabled={notifyPending}
            className="shrink-0 border-l border-white/5 px-3 text-amber-200 transition hover:bg-amber-500/15 disabled:opacity-40"
            title={`Mandar push a ${nombre} con sus ${faltantes} pendientes`}
          >
            <Icon name="send" size={14} />
          </button>
        )}
      </div>

      {/* Mensaje de feedback del notify */}
      {notifyMsg && (
        <div className={`border-y px-3 py-1.5 text-[10px] ${
          notifyMsg.kind === "ok"
            ? "border-emerald-400/20 bg-emerald-500/[0.06] text-emerald-200"
            : "border-red-400/20 bg-red-500/[0.06] text-red-200"
        }`}>
          {notifyMsg.text}
        </div>
      )}

      {/* Progress bar */}
      <div className="h-1 bg-white/5">
        <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-white/5 bg-[color:var(--surface)]/40 p-3">
          {loading && <p className="text-xs text-muted">Cargando detalle…</p>}

          {/* CTA notificar — grande, visible cuando hay pendientes */}
          {faltantes > 0 && (
            <button
              type="button"
              onClick={notificarPendientes}
              disabled={notifyPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/30 disabled:opacity-40"
            >
              <Icon name="send" size={14} />
              {notifyPending
                ? "Enviando push..."
                : `Avisar a ${nombre.split(" ")[0]} que le faltan ${faltantes} captura${faltantes === 1 ? "" : "s"}`}
            </button>
          )}

          {/* Detalle por sede × jornada */}
          {detalle && detalle.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-tagline text-muted">
                Detalle por sede × jornada
              </p>
              <ul className="space-y-1">
                {detalle.map((d, i) => {
                  const c = d.pct >= 95 ? "#10B981" : d.pct >= 50 ? "#F59E0B" : "#EF4444";
                  return (
                    <li key={i} className="flex items-center gap-2 rounded-md border border-white/5 bg-[color:var(--bg)]/40 px-2 py-1.5 text-[11px]">
                      <span className="shrink-0 font-mono text-muted-2">{d.sede_abrev}</span>
                      <span className="shrink-0 rounded bg-white/5 px-1 font-mono text-[9px] font-bold text-muted">{d.jornada}</span>
                      <span className="min-w-0 flex-1 truncate text-muted">{d.sede_nombre}</span>
                      <span className="font-mono text-[10px] text-muted">{d.capturadas}/{d.empleados}</span>
                      <span className="shrink-0 font-display text-sm font-bold" style={{ color: c, minWidth: "3rem", textAlign: "right" }}>
                        {d.pct}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {detalle && detalle.length === 0 && (
            <p className="text-xs text-muted-2">Sin asignaciones activas.</p>
          )}

          {/* Cobertura mensual */}
          {mensual && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-tagline text-muted">
                Cobertura del mes (a la fecha consultada)
              </p>
              <div className="grid gap-1 sm:grid-cols-4">
                <MiniCard label="Esperados mes" value={mensual.registros_esperados_mes} sub={`${mensual.dias_mes}d × ${mensual.total_empleados}emp`} />
                <MiniCard label="A la fecha" value={mensual.registros_esperados_a_hoy} sub={`${mensual.dias_transcurridos}d transcurridos`} />
                <MiniCard label="Capturados" value={mensual.registros_capturados} sub={`${mensual.pct_a_hoy}% del esperado`} highlight={mensual.pct_a_hoy >= 95} />
                <MiniCard label="Días al 100%" value={mensual.dias_con_100} sub={`${mensual.dias_con_0} en cero`} />
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function MiniCard({ label, value, sub, highlight }: { label: string; value: number; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 ${highlight ? "border-emerald-400/30 bg-emerald-500/[0.06]" : "border-white/5 bg-[color:var(--card)]"}`}>
      <p className="font-display text-base font-bold">{value}</p>
      <p className="text-[9px] uppercase tracking-tagline text-muted">{label}</p>
      {sub && <p className="text-[9px] text-muted-2">{sub}</p>}
    </div>
  );
}
