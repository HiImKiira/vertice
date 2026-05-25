"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { activarLiberacionGlobalAction, desactivarLiberacionGlobalAction } from "./actions";

interface Props {
  activaActual: {
    id: string;
    activado_por: string;
    activado_en: string;
    expira_en: string | null;
    motivo: string | null;
    autor_nombre: string;
  } | null;
}

export function LiberacionGlobalClient({ activaActual }: Props) {
  const router = useRouter();
  const [horas, setHoras] = useState<number | null>(6);
  const [motivo, setMotivo] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function activar() {
    if (!confirm(
      horas
        ? `¿Liberar TODAS las fechas por ${horas} horas para que cualquier supervisor capture sin restricciones?`
        : "¿Liberar TODAS las fechas SIN límite de tiempo? Tendrás que desactivarlo manualmente.",
    )) return;

    start(async () => {
      const r = await activarLiberacionGlobalAction(horas, motivo);
      if (r.ok) {
        setMsg("✓ Liberación global activada.");
        setMotivo("");
        router.refresh();
      } else {
        setMsg(`Error: ${r.error}`);
      }
    });
  }

  function desactivar() {
    if (!confirm("¿Desactivar la liberación global ahora? Los supervisores volverán a las restricciones normales de gracia.")) return;
    start(async () => {
      const r = await desactivarLiberacionGlobalAction();
      if (r.ok) {
        setMsg("✓ Liberación desactivada.");
        router.refresh();
      } else {
        setMsg(`Error: ${r.error}`);
      }
    });
  }

  if (activaActual) {
    const expiraTexto = activaActual.expira_en
      ? new Date(activaActual.expira_en).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })
      : "sin límite (manual)";
    return (
      <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/[0.10] p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/30 text-emerald-200">
            <Icon name="lock-open" size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base text-emerald-100">Liberación global ACTIVA</h3>
            <p className="mt-1 text-xs text-emerald-200/80">
              Todos los supervisores pueden capturar cualquier fecha sin restricciones.
            </p>
            <dl className="mt-3 space-y-1 text-[11px] text-emerald-200/90">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 opacity-70">Activada por:</dt>
                <dd className="font-mono">{activaActual.autor_nombre}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 opacity-70">Activada el:</dt>
                <dd className="font-mono">
                  {new Date(activaActual.activado_en).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 opacity-70">Expira:</dt>
                <dd className="font-mono">{expiraTexto}</dd>
              </div>
              {activaActual.motivo && (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 opacity-70">Motivo:</dt>
                  <dd>{activaActual.motivo}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
        <button
          type="button"
          onClick={desactivar}
          disabled={pending}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/30 disabled:opacity-40"
        >
          <Icon name="lock" size={14} />
          {pending ? "Desactivando..." : "Desactivar liberación"}
        </button>
        {msg && <p className="mt-3 text-[11px] text-emerald-200">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[color:var(--card)] p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-200">
          <Icon name="lock-open" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base">Activar liberación global</h3>
          <p className="mt-1 text-xs text-muted">
            Permite a TODOS los supervisores capturar CUALQUIER fecha mientras esté activa.
            Útil para fin de quincena o recuperación masiva. Se desactiva sola al expirar
            o manualmente.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="field">
          <label className="mb-1.5 block text-[11px] uppercase tracking-tagline text-muted">Duración</label>
          <div className="flex flex-wrap gap-1.5">
            {[
              { v: 1, label: "1 hora" },
              { v: 6, label: "6 horas" },
              { v: 12, label: "12 horas" },
              { v: 24, label: "24 horas" },
              { v: null, label: "Sin límite" },
            ].map((opt) => {
              const active = horas === opt.v;
              return (
                <button
                  key={String(opt.v)}
                  type="button"
                  onClick={() => setHoras(opt.v)}
                  disabled={pending}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                    active
                      ? "bg-blue-500/80 text-white"
                      : "border border-white/10 text-muted hover:border-white/30 hover:text-text"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <label className="mb-1.5 block text-[11px] uppercase tracking-tagline text-muted">Motivo (opcional)</label>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: Cierre de quincena, supervisores con problema técnico..."
            maxLength={200}
            disabled={pending}
            className="w-full rounded-md border border-white/10 bg-[color:var(--surface)] px-3 py-2 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={activar}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/80 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-40"
        >
          <Icon name="lock-open" size={14} />
          {pending ? "Activando..." : "Activar liberación global"}
        </button>
      </div>

      {msg && <p className="mt-3 text-xs text-muted">{msg}</p>}
    </div>
  );
}
