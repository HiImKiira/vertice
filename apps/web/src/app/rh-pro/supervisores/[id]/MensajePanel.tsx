"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { mandarMensajeSupervisorAction, notificarSupervisorPendientesAction } from "./actions-client-bridge";

interface Props {
  supervisorId: string;
  supervisorNombre: string;
  push_dispositivos: number;
  pct_hoy: number;
  faltantes: number;
  fechaHoy: string;
}

export function MensajePanel({ supervisorId, supervisorNombre, push_dispositivos, pct_hoy, faltantes, fechaHoy }: Props) {
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [url, setUrl] = useState("/dashboard");
  const [urgente, setUrgente] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function enviar() {
    if (!titulo.trim() || !cuerpo.trim()) { setMsg({ kind: "err", text: "Título y cuerpo son obligatorios" }); return; }
    setMsg(null);
    start(async () => {
      const r = await mandarMensajeSupervisorAction({
        supervisorId,
        titulo,
        cuerpo,
        urlDestino: url,
        urgente,
      });
      if (r.ok) {
        setMsg({ kind: "ok", text: "✓ Mensaje enviado" });
        setTitulo("");
        setCuerpo("");
      } else {
        setMsg({ kind: "err", text: r.error });
      }
    });
  }

  function notificarPendientes() {
    if (faltantes <= 0) return;
    if (!confirm(`Mandar push a ${supervisorNombre} con sus ${faltantes} pendientes de hoy?`)) return;
    setMsg(null);
    start(async () => {
      const r = await notificarSupervisorPendientesAction(supervisorId, fechaHoy);
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      setMsg({ kind: "ok", text: `Push enviado a ${r.enviados} dispositivo${r.enviados === 1 ? "" : "s"} · ${r.resumen}` });
    });
  }

  const sinPush = push_dispositivos === 0;

  return (
    <div className="space-y-4">
      {/* Acción rápida: notificar pendientes */}
      {faltantes > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.05] p-3">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="alert-triangle" size={14} className="text-amber-300" />
            <p className="text-xs font-semibold text-amber-200">
              {supervisorNombre} tiene {faltantes} pendiente{faltantes === 1 ? "" : "s"} ({pct_hoy}% cobertura hoy)
            </p>
          </div>
          <button
            type="button"
            onClick={notificarPendientes}
            disabled={pending || sinPush}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/50 disabled:opacity-40"
          >
            <Icon name="send" size={12} />
            {pending ? "..." : "Recordar pendientes"}
          </button>
          {sinPush && <p className="mt-1.5 text-[10px] text-red-300">⚠ Este supervisor no tiene dispositivos push activos</p>}
        </div>
      )}

      {/* Mensaje custom */}
      <div className="rounded-xl border border-blue-400/25 bg-blue-500/[0.04] p-3">
        <div className="mb-2 flex items-center gap-2">
          <Icon name="message-circle" size={14} className="text-blue-300" />
          <p className="text-xs font-semibold text-blue-200">Mandar mensaje custom</p>
          {sinPush && (
            <span className="ml-auto rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-red-300">
              SIN DISPOSITIVOS
            </span>
          )}
        </div>
        <div className="space-y-2">
          <div className="field">
            <label>Título</label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="ej: Cambio de horario MAT"
              maxLength={64}
              disabled={pending}
            />
          </div>
          <div className="field">
            <label>Cuerpo</label>
            <textarea
              rows={3}
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              placeholder="Mensaje específico para este supervisor..."
              maxLength={240}
              disabled={pending}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="field">
              <label>URL destino (opcional)</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="/pase-lista"
                disabled={pending}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-xs">
              <input
                type="checkbox"
                checked={urgente}
                onChange={(e) => setUrgente(e.target.checked)}
                className="h-3.5 w-3.5 accent-amber-500"
                disabled={pending}
              />
              <span>Notificación persistente (urgente)</span>
            </label>
          </div>
        </div>
        <button
          type="button"
          onClick={enviar}
          disabled={pending || !titulo.trim() || !cuerpo.trim() || sinPush}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-500/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
        >
          <Icon name="send" size={12} />
          {pending ? "Enviando..." : `Mandar a ${push_dispositivos} dispositivo${push_dispositivos === 1 ? "" : "s"}`}
        </button>
      </div>

      {msg && (
        <p className={`rounded-md border px-3 py-2 text-xs ${
          msg.kind === "ok"
            ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200"
            : "border-red-400/30 bg-red-500/[0.08] text-red-200"
        }`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
