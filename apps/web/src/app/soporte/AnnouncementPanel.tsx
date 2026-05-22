"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { PushControls } from "@/components/PushControls";

export function AnnouncementPanel() {
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [urlDestino, setUrlDestino] = useState("/dashboard");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      const txt = await res.text().catch(() => "");
      return { error: `Respuesta no-JSON (HTTP ${res.status}): ${txt.slice(0, 200)}` };
    }
    try {
      return await res.json();
    } catch (e) {
      return { error: e instanceof Error ? e.message : "JSON inválido" };
    }
  }

  async function enviarRecordatorio() {
    if (!confirm("¿Disparar recordatorio de captura ahora a todos los supervisores pendientes?")) return;
    start(async () => {
      try {
        // El endpoint del cron requiere CRON_SECRET. Desde el cliente no lo
        // tenemos, así que mandamos el recordatorio vía /announce (que sí
        // valida sesión + rol admin).
        const res = await fetch("/api/push/announce", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo: "Vortex · Recordatorio de captura",
            cuerpo: "Recuerda capturar tu pase de lista de hoy. Tap para abrir.",
            urlDestino: "/pase-lista",
          }),
        });
        const j = await parseJsonSafe(res);
        if (res.ok) {
          setResult(`Recordatorio enviado a ${j.enviados ?? 0} dispositivos, ${j.fallidos ?? 0} fallidos`);
        } else {
          setResult(`Error: ${j.error ?? `HTTP ${res.status}`}`);
        }
      } catch (e) {
        setResult(`Error de red: ${e instanceof Error ? e.message : "desconocido"}`);
      }
    });
  }

  async function enviarAnuncio() {
    if (!titulo.trim() || !cuerpo.trim()) {
      setResult("Título y cuerpo requeridos.");
      return;
    }
    start(async () => {
      try {
        const res = await fetch("/api/push/announce", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo: titulo.trim(),
            cuerpo: cuerpo.trim(),
            urlDestino: urlDestino.trim() || "/dashboard",
          }),
        });
        const j = await parseJsonSafe(res);
        if (res.ok) {
          setResult(`✓ Enviado a ${j.enviados ?? 0} dispositivos, ${j.fallidos ?? 0} fallidos`);
          setTitulo("");
          setCuerpo("");
        } else {
          setResult(`Error: ${j.error ?? `HTTP ${res.status}`}`);
        }
      } catch (e) {
        setResult(`Error de red: ${e instanceof Error ? e.message : "desconocido"}`);
      }
    });
  }

  return (
    <section className="mb-6 surface-glow p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/15 text-violet-200">
          <Icon name="life-buoy" size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base">Notificaciones push</h2>
          <p className="text-xs text-muted">
            Manda anuncios a supervisores o dispara un recordatorio inmediato de captura.
            El cron automático se ejecuta cada 3h entre 9am y 5pm.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="shrink-0 rounded-md border border-white/10 px-3 py-1.5 text-xs text-muted hover:text-text"
        >
          {open ? "Ocultar" : "Abrir"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Estado de suscripciones */}
          <PushControls />

          {/* Botón recordatorio rápido */}
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.05] p-3">
            <div className="mb-2 flex items-center gap-2">
              <Icon name="clock" size={14} className="text-amber-300" />
              <p className="text-xs font-semibold text-amber-200">Recordatorio de captura ahora</p>
            </div>
            <p className="mb-2 text-[11px] text-muted">
              Notifica a todos los supervisores que aún no han capturado hoy.
              Útil si quieres adelantarte al cron de las próximas horas.
            </p>
            <button
              type="button"
              onClick={enviarRecordatorio}
              disabled={pending}
              className="rounded-md bg-amber-500/25 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/40 disabled:opacity-40"
            >
              {pending ? "Enviando..." : "Disparar recordatorio"}
            </button>
          </div>

          {/* Anuncio libre */}
          <div className="rounded-xl border border-blue-400/25 bg-blue-500/[0.05] p-3">
            <div className="mb-2 flex items-center gap-2">
              <Icon name="message-circle" size={14} className="text-blue-300" />
              <p className="text-xs font-semibold text-blue-200">Anuncio a todos</p>
            </div>
            <div className="space-y-2">
              <div className="field">
                <label>Título</label>
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ej: Captura urgente sede MAT"
                  maxLength={64}
                  disabled={pending}
                />
              </div>
              <div className="field">
                <label>Cuerpo</label>
                <textarea
                  rows={2}
                  value={cuerpo}
                  onChange={(e) => setCuerpo(e.target.value)}
                  placeholder="Mensaje claro. Máximo ~200 caracteres."
                  maxLength={240}
                  disabled={pending}
                />
              </div>
              <div className="field">
                <label>URL destino (opcional)</label>
                <input
                  type="text"
                  value={urlDestino}
                  onChange={(e) => setUrlDestino(e.target.value)}
                  placeholder="/pase-lista"
                  disabled={pending}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={enviarAnuncio}
              disabled={pending || !titulo.trim() || !cuerpo.trim()}
              className="mt-3 rounded-md bg-blue-500/30 px-3 py-1.5 text-xs font-semibold text-blue-100 transition hover:bg-blue-500/50 disabled:opacity-40"
            >
              {pending ? "Enviando..." : "Mandar anuncio"}
            </button>
          </div>

          {result && (
            <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted">
              {result}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
