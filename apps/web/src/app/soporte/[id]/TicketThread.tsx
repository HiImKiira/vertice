"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { enviarMensajeAction, cerrarTicketAction, liberarFechaDesdeTicketAction } from "../actions";

export interface TicketDetail {
  id: string;
  folio: string;
  tipo: string;
  prioridad: string;
  estado: string;
  fecha_solicitada: string | null;
  sede_id: string | null;
  jornada: string | null;
  ultimo_ts: string;
  apertura_ts: string;
  cierre_ts: string | null;
  supervisor_id: string;
  usuarios?: { nombre: string; username: string; rol: string } | { nombre: string; username: string; rol: string }[] | null;
  sedes?: { id: string; abrev: string; nombre: string } | { id: string; abrev: string; nombre: string }[] | null;
}

const HORAS_DEFAULT = 6;

export interface Mensaje {
  id: number;
  ticket_id: string;
  remitente_id: string | null;
  origen: "USUARIO" | "SOPORTE" | "SISTEMA";
  mensaje: string;
  creado_en: string;
  usuarios?: { nombre: string; username: string } | { nombre: string; username: string }[] | null;
}

export function TicketThread({
  ticket,
  mensajes,
  currentUserId,
  esSoporte,
}: {
  ticket: TicketDetail;
  mensajes: Mensaje[];
  currentUserId: string;
  esSoporte: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const cerrado = ticket.estado === "CERRADO";

  // Auto-scroll al fondo cuando llegan mensajes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes.length]);

  // Poll ligero cada 20s para refrescar el thread (sin realtime explícito)
  useEffect(() => {
    if (cerrado) return;
    const tick = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(tick);
  }, [cerrado, router]);

  function enviar() {
    setError(null);
    if (!draft.trim()) return;
    startTransition(async () => {
      const r = await enviarMensajeAction(ticket.id, draft);
      if (!r.ok) setError(r.error);
      else {
        setDraft("");
        router.refresh();
      }
    });
  }

  function cerrar() {
    if (!confirm("¿Cerrar este ticket? Ya no se pueden enviar más respuestas.")) return;
    startTransition(async () => {
      const r = await cerrarTicketAction(ticket.id);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  function liberarFecha() {
    if (!ticket.fecha_solicitada) return;
    if (!confirm(`¿Liberar ${ticket.fecha_solicitada} por ${HORAS_DEFAULT} horas? Pasado ese tiempo se bloquea de nuevo.`)) return;
    startTransition(async () => {
      const r = await liberarFechaDesdeTicketAction(ticket.id, HORAS_DEFAULT);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <>
      {/* Mensajes */}
      <div className="surface-card mb-4 max-h-[55vh] overflow-y-auto p-4 sm:p-5">
        {mensajes.length === 0 ? (
          <p className="text-center text-sm text-muted">Sin mensajes.</p>
        ) : (
          <ol className="space-y-3">
            {mensajes.map((m) => {
              const mio = m.remitente_id === currentUserId;
              const fromSoporte = m.origen === "SOPORTE";
              const fromSistema = m.origen === "SISTEMA";
              const author = Array.isArray(m.usuarios) ? m.usuarios[0] : m.usuarios;
              // Anonimizamos al equipo de soporte: siempre se ve "Recursos Humanos",
              // nunca el nombre real del agente. Si tú eres soporte y leíste tu propio
              // mensaje, sigue siendo "Recursos Humanos" para consistencia.
              const displayName = fromSoporte
                ? "Recursos Humanos"
                : fromSistema
                  ? "Sistema"
                  : author?.nombre ?? "Usuario";
              return (
                <li key={m.id} className={`flex ${
                  fromSistema ? "justify-center" : mio ? "justify-end" : "justify-start"
                }`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    fromSistema
                      ? "bg-[rgba(245,158,11,0.10)] border border-[rgba(245,158,11,0.35)] text-text"
                      : fromSoporte
                        ? "bg-[rgba(139,92,246,0.10)] border border-[rgba(139,92,246,0.35)] text-text"
                        : mio
                          ? "bg-[rgba(59,130,246,0.15)] border border-[rgba(59,130,246,0.4)] text-text"
                          : "bg-[color:var(--surface)] border border-[color:var(--border)] text-text"
                  }`}>
                    <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-tagline text-muted">
                      {fromSistema ? (
                        <><Icon name="settings" size={11} /> Sistema</>
                      ) : fromSoporte ? (
                        <><Icon name="life-buoy" size={11} /> Recursos Humanos</>
                      ) : (
                        <><Icon name="user" size={11} /> Usuario</>
                      )}
                      {!fromSoporte && !fromSistema && displayName && (
                        <span className="ml-1 normal-case">· {displayName}</span>
                      )}
                      <span className="ml-2 font-mono normal-case opacity-60">
                        {new Date(m.creado_en).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{m.mensaje}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose / Cerrar */}
      {cerrado ? (
        <div className="rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--card)] p-4 text-center text-sm text-muted">
          Este ticket está cerrado.
          {ticket.cierre_ts && (
            <span className="block text-[10px] text-muted-2 mt-1">
              Cerrado el {new Date(ticket.cierre_ts).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
            </span>
          )}
        </div>
      ) : (
        <div className="surface-glow p-4">
          <textarea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={esSoporte ? "Responde al supervisor..." : "Escribe un mensaje..."}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                enviar();
              }
            }}
            disabled={isPending}
            className="w-full"
          />
          {error && (
            <p className="mt-2 rounded-md border border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)] px-3 py-1.5 text-xs text-[#FCA5A5]">
              ⚠ {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-muted-2">
              {esSoporte ? "Ctrl/Cmd + Enter para enviar" : ""}
            </span>
            <div className="flex flex-wrap gap-2">
              {esSoporte && ticket.fecha_solicitada && (
                <button
                  type="button"
                  onClick={liberarFecha}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/25 disabled:opacity-40"
                  title={`Libera ${ticket.fecha_solicitada} por ${HORAS_DEFAULT} horas, después se bloquea automáticamente`}
                >
                  <Icon name="lock-open" size={14} />
                  Liberar fecha {HORAS_DEFAULT}h
                </button>
              )}
              {esSoporte && (
                <button type="button" onClick={cerrar} disabled={isPending} className="btn btn-danger btn-sm inline-flex items-center gap-1.5">
                  <Icon name="check" size={14} /> Cerrar ticket
                </button>
              )}
              <button
                type="button"
                onClick={enviar}
                disabled={isPending || !draft.trim()}
                className="btn btn-primary inline-flex items-center gap-1.5"
              >
                {isPending ? (<><span className="loader-vortex-sm" />Enviando...</>) : (<><Icon name="send" size={14} /> Enviar</>)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
