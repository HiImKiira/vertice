"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearTicketAction } from "../actions";

const TIPOS = [
  { v: "DESBLOQUEO", l: "Desbloqueo de fecha", icon: "🔓" },
  { v: "URGENCIA",   l: "Urgencia operativa",  icon: "🚨" },
  { v: "DUDA",       l: "Duda o consulta",     icon: "❓" },
  { v: "SUGERENCIA", l: "Sugerencia",          icon: "💡" },
] as const;

type Tipo = (typeof TIPOS)[number]["v"];

export function NuevoTicketForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tipo, setTipo] = useState<Tipo>("DUDA");
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [urgencia, setUrgencia] = useState<"NORMAL" | "URGENTE">("NORMAL");
  const [fechaSolicitada, setFechaSolicitada] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!asunto.trim() || !mensaje.trim()) {
      setError("Asunto y mensaje son obligatorios.");
      return;
    }
    startTransition(async () => {
      const r = await crearTicketAction({
        tipo,
        asunto,
        mensaje,
        urgencia,
        fecha_solicitada: tipo === "DESBLOQUEO" ? (fechaSolicitada || null) : null,
      });
      if (!r.ok) setError(r.error);
      else {
        router.push(r.ticketId ? `/soporte/${r.ticketId}` : "/soporte");
        router.refresh();
      }
    });
  }

  return (
    <div className="surface-glow space-y-4 p-5 animate-fade-up">
      <div className="field">
        <label>Tipo de ticket</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIPOS.map((t) => (
            <button
              key={t.v}
              type="button"
              onClick={() => setTipo(t.v)}
              className={`btn ${tipo === t.v ? "btn-primary" : "btn-ghost"} text-xs`}
            >
              <span className="text-base">{t.icon}</span>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {tipo === "DESBLOQUEO" && (
        <div className="field">
          <label>Fecha que necesitas desbloquear</label>
          <input
            type="date"
            value={fechaSolicitada}
            onChange={(e) => setFechaSolicitada(e.target.value)}
          />
        </div>
      )}

      <div className="field">
        <label>Prioridad</label>
        <div className="flex gap-2">
          {(["NORMAL", "URGENTE"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUrgencia(u)}
              className={`btn flex-1 ${urgencia === u ? (u === "URGENTE" ? "btn-danger" : "btn-primary") : "btn-ghost"}`}
            >
              {u === "URGENTE" ? "🚨 Urgente" : "Normal"}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Asunto *</label>
        <input
          type="text"
          value={asunto}
          onChange={(e) => setAsunto(e.target.value)}
          placeholder="Resumen breve"
          maxLength={120}
        />
      </div>

      <div className="field">
        <label>Mensaje *</label>
        <textarea
          rows={5}
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          placeholder="Describe la situación con el detalle que necesites..."
        />
      </div>

      {error && (
        <p className="rounded-md border border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)] px-3 py-2 text-xs text-[#FCA5A5]">
          ⚠ {error}
        </p>
      )}

      <button type="button" onClick={submit} disabled={isPending} className="btn btn-primary w-full">
        {isPending ? (<><span className="loader-vortex-sm" />Enviando...</>) : "📨 Enviar ticket"}
      </button>
    </div>
  );
}
