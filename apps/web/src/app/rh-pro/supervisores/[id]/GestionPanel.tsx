"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import {
  marcarAusenciaAction,
  quitarAusenciaAction,
  resetPasswordSupervisorAction,
} from "../actions";

interface Props {
  supervisorId: string;
  supervisorNombre: string;
  callerRol: string;
  ausenteDesde: string | null;
  ausenteHasta: string | null;
  ausenteMotivo: string | null;
}

export function GestionPanel({
  supervisorId,
  supervisorNombre,
  callerRol,
  ausenteDesde,
  ausenteHasta,
  ausenteMotivo,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Ausencia form
  const [showForm, setShowForm] = useState(false);
  const [desde, setDesde] = useState(ausenteDesde ?? "");
  const [hasta, setHasta] = useState(ausenteHasta ?? "");
  const [motivo, setMotivo] = useState(ausenteMotivo ?? "");

  // Reset password
  const [showReset, setShowReset] = useState(false);
  const [nuevaPwd, setNuevaPwd] = useState<string | null>(null);

  const puede = callerRol === "SUPERADMIN" || callerRol === "SOPORTE";
  const tieneAusencia = !!ausenteDesde && !!ausenteHasta;
  const hoy = new Date().toISOString().slice(0, 10);
  const ausenciaActiva = tieneAusencia && hoy >= (ausenteDesde ?? "") && hoy <= (ausenteHasta ?? "");

  if (!puede) {
    return (
      <div className="rounded-md border border-red-400/25 bg-red-500/[0.04] p-3 text-xs text-red-200">
        Solo SUPERADMIN o SOPORTE pueden gestionar ausencias y reset de contraseña.
      </div>
    );
  }

  async function guardarAusencia() {
    if (!desde || !hasta) { setMsg({ kind: "err", text: "Fechas requeridas" }); return; }
    setMsg(null);
    start(async () => {
      const r = await marcarAusenciaAction({ supervisorId, desde, hasta, motivo });
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      setMsg({ kind: "ok", text: "✓ Ausencia registrada" });
      setShowForm(false);
      router.refresh();
    });
  }

  async function quitarAusencia() {
    if (!confirm(`Quitar ausencia de ${supervisorNombre}?`)) return;
    setMsg(null);
    start(async () => {
      const r = await quitarAusenciaAction(supervisorId);
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      setMsg({ kind: "ok", text: "✓ Ausencia removida" });
      router.refresh();
    });
  }

  async function resetPassword() {
    if (!confirm(`Resetear contraseña de ${supervisorNombre}? Se generará una temporal. Entrégasela personalmente.`)) return;
    setMsg(null);
    setNuevaPwd(null);
    start(async () => {
      const r = await resetPasswordSupervisorAction(supervisorId);
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      setNuevaPwd(r.password);
      setShowReset(true);
      setMsg({ kind: "ok", text: "✓ Password generado. Cópialo ahora — no se guarda en ningún lado." });
    });
  }

  function copyPassword() {
    if (!nuevaPwd) return;
    navigator.clipboard?.writeText(nuevaPwd).catch(() => {});
  }

  return (
    <div className="space-y-4">
      {/* Ausencia */}
      <div className={`rounded-xl border p-3 ${
        ausenciaActiva
          ? "border-amber-400/40 bg-amber-500/[0.08]"
          : tieneAusencia
            ? "border-violet-400/30 bg-violet-500/[0.05]"
            : "border-white/10 bg-[color:var(--card)]"
      }`}>
        <div className="mb-2 flex items-center gap-2">
          <Icon name="bed" size={14} className={ausenciaActiva ? "text-amber-300" : "text-muted"} />
          <p className="text-xs font-semibold">
            {ausenciaActiva ? "Ausente actualmente" : tieneAusencia ? "Ausencia programada" : "Vacaciones / Ausencia"}
          </p>
        </div>

        {tieneAusencia ? (
          <div className="space-y-2">
            <p className="text-[11px] text-muted">
              <span className="font-mono">{ausenteDesde}</span> → <span className="font-mono">{ausenteHasta}</span>
              {ausenteMotivo && <> · {ausenteMotivo}</>}
            </p>
            <p className="text-[10px] text-muted-2">
              Mientras esté ausente, NO recibe recordatorios push automáticos del cron de captura ni de incapacidades.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowForm(!showForm)}
                className="rounded-md border border-white/10 px-2.5 py-1 text-[10px] text-muted hover:text-text"
              >
                {showForm ? "Cancelar" : "Editar"}
              </button>
              <button
                type="button"
                onClick={quitarAusencia}
                disabled={pending}
                className="rounded-md border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-[10px] text-red-200 hover:bg-red-500/25 disabled:opacity-40"
              >
                Quitar ausencia
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-2 text-[11px] text-muted">
              Marca al supervisor como ausente (vacaciones, incapacidad prolongada, etc.) para que el sistema
              NO le mande recordatorios push en esas fechas.
            </p>
            {!showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="rounded-md bg-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/50"
              >
                Registrar ausencia
              </button>
            )}
          </div>
        )}

        {showForm && (
          <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="field">
                <label>Desde</label>
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} disabled={pending} />
              </div>
              <div className="field">
                <label>Hasta</label>
                <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} min={desde} disabled={pending} />
              </div>
            </div>
            <div className="field">
              <label>Motivo (opcional)</label>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="ej: Vacaciones, incapacidad prolongada, permiso..."
                disabled={pending}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={guardarAusencia} disabled={pending} className="btn btn-primary btn-sm">
                {pending ? "Guardando..." : "Guardar ausencia"}
              </button>
              <button onClick={() => setShowForm(false)} disabled={pending} className="btn btn-ghost btn-sm">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reset password */}
      <div className="rounded-xl border border-red-400/25 bg-red-500/[0.04] p-3">
        <div className="mb-2 flex items-center gap-2">
          <Icon name="lock" size={14} className="text-red-300" />
          <p className="text-xs font-semibold text-red-200">Reset de contraseña</p>
        </div>
        <p className="mb-2 text-[11px] text-muted">
          Genera una contraseña temporal alfanumérica de 10 caracteres. El supervisor debe usarla
          en su próximo login. <strong>Solo se muestra una vez</strong> — guárdala o cópiala al instante.
        </p>
        <button
          type="button"
          onClick={resetPassword}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-500/30 disabled:opacity-40"
        >
          <Icon name="refresh" size={12} />
          {pending ? "Generando..." : "Generar password temporal"}
        </button>

        {showReset && nuevaPwd && (
          <div className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-500/[0.08] p-3">
            <p className="mb-1 text-[10px] uppercase tracking-tagline text-emerald-300">Password temporal (copia ahora)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all break-all rounded-md bg-[color:var(--bg)] px-3 py-2 font-mono text-sm font-bold text-emerald-200">
                {nuevaPwd}
              </code>
              <button
                type="button"
                onClick={copyPassword}
                className="shrink-0 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-2 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/30"
              >
                Copiar
              </button>
              <button
                type="button"
                onClick={() => { setNuevaPwd(null); setShowReset(false); }}
                className="shrink-0 rounded-md border border-white/10 px-2 py-2 text-[10px] text-muted hover:text-text"
              >
                Cerrar
              </button>
            </div>
            <p className="mt-2 text-[10px] text-amber-300">
              ⚠ Esta password NO se guarda en ningún lado. Si pierdes esta pantalla, deberás generar otra.
            </p>
          </div>
        )}
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
