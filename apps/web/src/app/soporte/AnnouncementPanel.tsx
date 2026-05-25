"use client";

import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { PushControls } from "@/components/PushControls";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface LogEntry {
  id: number;
  tipo: string;
  titulo: string | null;
  cuerpo: string | null;
  resultado: string | null;
  creado_en: string;
  usuarios: { nombre: string; username: string } | { nombre: string; username: string }[] | null;
}

export function AnnouncementPanel() {
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [urlDestino, setUrlDestino] = useState("/dashboard");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);

  async function cargarLog() {
    const res = await fetch("/api/push/log").catch(() => null);
    if (!res?.ok) return;
    const j = await res.json().catch(() => null);
    if (j?.ok) setLog(j.log ?? []);
  }

  useEffect(() => {
    if (open) cargarLog();
  }, [open]);

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

  async function testBroadcast() {
    if (!confirm("Mandar push de prueba a TODOS los dispositivos suscritos. ¿Continuar?")) return;
    start(async () => {
      try {
        const res = await fetch("/api/push/test?broadcast=true", { method: "POST" });
        const j = await parseJsonSafe(res);
        if (res.ok) {
          setResult(`Test broadcast: ${j.enviados ?? 0} entregados, ${j.fallidos ?? 0} fallidos`);
          cargarLog();
        } else {
          setResult(`Error: ${j.error ?? `HTTP ${res.status}`}`);
        }
      } catch (e) {
        setResult(`Error de red: ${e instanceof Error ? e.message : "desconocido"}`);
      }
    });
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
          {/* Test broadcast quick action */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-400/25 bg-blue-500/[0.04] p-3 text-xs">
            <Icon name="send" size={14} className="text-blue-300" />
            <span className="text-muted">
              Diagnóstico: manda un push de prueba a <strong>todos los dispositivos suscritos</strong> para verificar entrega.
            </span>
            <button
              type="button"
              onClick={testBroadcast}
              disabled={pending}
              className="ml-auto rounded-md bg-blue-500/30 px-3 py-1.5 text-[11px] font-semibold text-blue-100 hover:bg-blue-500/50 disabled:opacity-40"
            >
              {pending ? "Enviando..." : "Test broadcast"}
            </button>
          </div>

          {/* Estado de suscripciones */}
          <ErrorBoundary label="PushControls">
            <PushControls />
          </ErrorBoundary>

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

          {/* Actividad reciente */}
          <div className="rounded-xl border border-white/5 bg-[color:var(--card)] p-3">
            <button
              type="button"
              onClick={() => { setShowLog(!showLog); if (!showLog) cargarLog(); }}
              className="flex w-full items-center justify-between text-xs"
            >
              <span className="flex items-center gap-2 font-semibold text-text">
                <Icon name="clock" size={12} /> Actividad reciente
                <span className="text-[10px] font-mono text-muted-2">({log.length} eventos)</span>
              </span>
              <span className="text-muted">{showLog ? "ocultar" : "ver"}</span>
            </button>

            {showLog && (
              <div className="mt-3 space-y-1">
                {log.length === 0 ? (
                  <p className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-3 text-center text-[11px] text-muted-2">
                    Sin actividad reciente. Manda un push de prueba arriba.
                  </p>
                ) : (
                  <ul className="max-h-72 space-y-1 overflow-y-auto">
                    {log.map((e) => {
                      const u = Array.isArray(e.usuarios) ? e.usuarios[0] : e.usuarios;
                      const ok = e.resultado === "enviado";
                      const color = ok ? "text-emerald-300" : e.resultado?.startsWith("fallido") ? "text-red-300" : "text-amber-300";
                      return (
                        <li key={e.id} className="rounded-md border border-white/5 bg-[color:var(--surface)]/40 px-2 py-1.5 text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className={`shrink-0 font-mono text-[10px] font-bold uppercase ${color}`}>
                              {ok ? "✓" : "✗"} {e.resultado ?? "—"}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-text">
                              {e.titulo ?? "(sin título)"}
                            </span>
                            <span className="shrink-0 font-mono text-[9px] text-muted-2">
                              {new Date(e.creado_en).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[10px] text-muted-2">
                            {u ? `@${u.username} (${u.nombre})` : "—"} · tipo: {e.tipo}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
