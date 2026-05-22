"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { crearLiberacionAction, revocarLiberacionAction, extenderLiberacionAction } from "./liberar-actions";

export interface LiberacionRow {
  id: string;
  fecha: string;
  motivo: string | null;
  activo: boolean;
  expira_en: string | null;
  creado_en: string;
  liberado_por_nombre: string | null;
  estado_calc: "activa" | "expirada" | "revocada";
}

function todayMerida(): string {
  const d = new Date();
  d.setHours(d.getHours() - 6);
  return d.toISOString().slice(0, 10);
}

export function LiberacionesEditor({ liberaciones }: { liberaciones: LiberacionRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [fecha, setFecha] = useState(todayMerida());
  const [horas, setHoras] = useState<string>("6");
  const [motivo, setMotivo] = useState("");
  const [tipo, setTipo] = useState<"6h" | "12h" | "24h" | "indef">("6h");
  const [result, setResult] = useState<string | null>(null);

  function horasFromTipo(t: typeof tipo): number | null {
    if (t === "indef") return null;
    if (t === "6h") return 6;
    if (t === "12h") return 12;
    if (t === "24h") return 24;
    const n = parseInt(horas, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  async function crear() {
    setResult(null);
    if (!fecha) { setResult("Fecha requerida."); return; }
    const h = horasFromTipo(tipo);
    start(async () => {
      const r = await crearLiberacionAction({ fecha, horas: h, motivo });
      if (r.ok) {
        setResult(`✓ ${fecha} liberada ${h ? `por ${h}h` : "indefinidamente"}.`);
        setMotivo("");
        router.refresh();
      } else {
        setResult(`Error: ${r.error}`);
      }
    });
  }

  async function revocar(id: string, fecha: string) {
    if (!confirm(`¿Revocar la liberación de ${fecha}? Los supervisores ya no podrán capturar esa fecha.`)) return;
    start(async () => {
      const r = await revocarLiberacionAction(id);
      if (r.ok) router.refresh();
      else setResult(`Error: ${r.error}`);
    });
  }

  async function extender(id: string, horasExtra: number) {
    start(async () => {
      const r = await extenderLiberacionAction(id, horasExtra);
      if (r.ok) router.refresh();
      else setResult(`Error: ${r.error}`);
    });
  }

  const activas = liberaciones.filter((l) => l.estado_calc === "activa");
  const inactivas = liberaciones.filter((l) => l.estado_calc !== "activa");

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/[0.08] px-4 py-3">
          <div className="font-display text-2xl text-emerald-200">{activas.length}</div>
          <div className="text-[10px] uppercase tracking-tagline text-muted">Liberaciones activas</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="font-display text-2xl text-muted">{inactivas.length}</div>
          <div className="text-[10px] uppercase tracking-tagline text-muted-2">Históricas (expiradas/revocadas)</div>
        </div>
      </div>

      {/* Form de liberación */}
      <div className="surface-card p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Icon name="lock-open" size={18} className="text-emerald-300" />
          <h3 className="font-display text-sm">Liberar una fecha</h3>
        </div>
        <p className="mb-3 text-[11px] text-muted">
          Permite a los supervisores capturar pase de lista para una fecha específica
          fuera de la ventana de gracia normal. Útil cuando alguien quedó pendiente.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="field">
            <label>Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="field">
            <label>Duración</label>
            <div className="flex gap-1.5">
              {(["6h", "12h", "24h", "indef"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  disabled={pending}
                  className={`flex-1 rounded-md px-2 py-2 text-xs font-mono font-semibold transition disabled:opacity-40 ${
                    tipo === t
                      ? "bg-emerald-500/30 text-emerald-100"
                      : "border border-white/10 text-muted hover:text-text"
                  }`}
                >
                  {t === "indef" ? "∞" : t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 field">
          <label>Motivo (opcional)</label>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: solicitado por supervisor MAT, falla de captura matutina, etc."
            maxLength={200}
            disabled={pending}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={crear}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/30 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/50 disabled:opacity-40"
          >
            <Icon name="lock-open" size={14} />
            {pending ? "Liberando..." : "Liberar fecha"}
          </button>
          {result && <span className="text-[11px] text-muted">{result}</span>}
        </div>
      </div>

      {/* Activas */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-tagline text-emerald-200">
          Liberaciones activas ({activas.length})
        </h3>
        {activas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[color:var(--card)] p-6 text-center text-xs text-muted">
            No hay fechas liberadas activamente. Usa el form de arriba para crear una.
          </div>
        ) : (
          <ul className="space-y-2">
            {activas.map((l) => {
              const expira = l.expira_en ? new Date(l.expira_en) : null;
              const expiraTxt = expira
                ? expira.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })
                : "indefinida";
              return (
                <li
                  key={l.id}
                  className="rounded-xl border border-emerald-400/25 bg-emerald-500/[0.05] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-emerald-100">
                        {l.fecha}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        Expira: <span className="font-mono text-emerald-200">{expiraTxt}</span>
                        {l.liberado_por_nombre && (
                          <> · por {l.liberado_por_nombre}</>
                        )}
                      </p>
                      {l.motivo && <p className="mt-1 text-[11px] italic text-muted-2">"{l.motivo}"</p>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => extender(l.id, 6)}
                        disabled={pending}
                        className="rounded-md border border-blue-400/30 bg-blue-500/15 px-2 py-1 text-[10px] font-mono font-semibold text-blue-200 hover:bg-blue-500/30 disabled:opacity-40"
                        title="Extender 6 horas más desde ahora"
                      >
                        +6h
                      </button>
                      <button
                        type="button"
                        onClick={() => extender(l.id, 24)}
                        disabled={pending}
                        className="rounded-md border border-blue-400/30 bg-blue-500/15 px-2 py-1 text-[10px] font-mono font-semibold text-blue-200 hover:bg-blue-500/30 disabled:opacity-40"
                        title="Extender 24 horas desde ahora"
                      >
                        +24h
                      </button>
                      <button
                        type="button"
                        onClick={() => revocar(l.id, l.fecha)}
                        disabled={pending}
                        className="inline-flex items-center gap-1 rounded-md border border-red-400/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-200 hover:bg-red-500/25 disabled:opacity-40"
                      >
                        <Icon name="lock" size={11} /> Bloquear
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Histórico colapsable */}
      {inactivas.length > 0 && (
        <details className="rounded-xl border border-white/5 bg-[color:var(--surface)]/40 p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-tagline text-muted hover:text-text">
            Histórico ({inactivas.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {inactivas.slice(0, 20).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11px]">
                <span className="font-mono text-muted">{l.fecha}</span>
                <span className={l.estado_calc === "expirada" ? "text-amber-300/70" : "text-red-300/70"}>
                  {l.estado_calc}
                </span>
                <span className="truncate text-muted-2">{l.motivo ?? "—"}</span>
                <span className="font-mono text-[10px] text-muted-2">
                  {l.liberado_por_nombre ?? "—"}
                </span>
              </li>
            ))}
            {inactivas.length > 20 && (
              <li className="text-center text-[10px] text-muted-2">
                +{inactivas.length - 20} más
              </li>
            )}
          </ul>
        </details>
      )}
    </div>
  );
}
