"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { aplicarDiasIncapacidadAction } from "../actions";

interface Props {
  incapacidadId: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  diasAutorizados: number | null;
  isAdmin: boolean;
}

/**
 * Días pactados de la incapacidad. RH captura el rango (de la ST7 o de la
 * enfermedad general) y lo marca como "I" en el pase de lista de todo el rango.
 * El supervisor solo ve la pauta (rango + que fue marcado por RH).
 */
export function DiasIncapacidadPanel({ incapacidadId, fechaInicio, fechaFin, diasAutorizados, isAdmin }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ini, setIni] = useState(fechaInicio ?? "");
  const [fin, setFin] = useState(fechaFin ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function aplicar() {
    if (!ini || !fin) { setMsg({ ok: false, text: "Indica fecha de inicio y fin." }); return; }
    if (!confirm(`Marcar del ${ini} al ${fin} como Incapacidad (I) en el pase de lista?`)) return;
    setMsg(null);
    start(async () => {
      const r = await aplicarDiasIncapacidadAction({ incapacidad_id: incapacidadId, fecha_inicio: ini, fecha_fin: fin });
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setMsg({ ok: true, text: `✓ ${r.marcados} día(s) marcados como Incapacidad (${r.rango}). Ya aparece en pase de lista y exports.` });
      router.refresh();
    });
  }

  // Vista de supervisor: solo lectura
  if (!isAdmin) {
    if (!fechaInicio && !fechaFin) return null;
    return (
      <section className="surface-card p-4">
        <h2 className="mb-2 flex items-center gap-1.5 font-display text-sm">
          <Icon name="calendar" size={14} className="text-amber-300" /> Días de incapacidad
        </h2>
        <p className="text-xs text-muted">
          <span className="font-semibold text-amber-200">Incapacidad marcada por RH</span> del{" "}
          <span className="font-mono">{fechaInicio ?? "—"}</span> al <span className="font-mono">{fechaFin ?? "—"}</span>
          {diasAutorizados ? <> · {diasAutorizados} días</> : null}.
        </p>
        <p className="mt-1 text-[10px] text-muted-2">
          Estos días aparecen como <span className="font-mono font-bold text-amber-300">I</span> en tu pase de lista (no los cambies).
        </p>
      </section>
    );
  }

  // Vista RH: editable
  return (
    <section className="surface-card p-4">
      <h2 className="mb-2 flex items-center gap-1.5 font-display text-sm">
        <Icon name="calendar" size={14} className="text-amber-300" /> Días pactados de incapacidad
      </h2>
      <p className="mb-3 text-[11px] text-muted">
        Captura el rango de la ST-7 / enfermedad general. Al aplicar, se marcan como{" "}
        <span className="font-mono font-bold text-amber-300">I</span> (Incapacidad) en el pase de lista de todos esos
        días. Sale como marcada por RH y aparece en los exports.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="field">
          <span>Inicio</span>
          <input type="date" value={ini} onChange={(e) => setIni(e.target.value)} disabled={pending} />
        </label>
        <label className="field">
          <span>Fin</span>
          <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} disabled={pending} />
        </label>
      </div>
      <button
        type="button"
        onClick={aplicar}
        disabled={pending || !ini || !fin}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-500/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-40"
      >
        <Icon name="check" size={12} />
        {pending ? "Marcando..." : "Marcar días como Incapacidad (I)"}
      </button>
      {diasAutorizados ? (
        <p className="mt-2 text-[10px] text-muted-2">Actualmente registrado: {diasAutorizados} días autorizados.</p>
      ) : null}
      {msg && (
        <p className={`mt-2 rounded-md border px-3 py-2 text-[11px] ${
          msg.ok ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200" : "border-red-400/30 bg-red-500/[0.08] text-red-200"
        }`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
