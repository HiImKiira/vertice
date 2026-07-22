"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { CODIGO_SPEC, type CodigoAsistencia } from "@vertice/shared/codes";
import {
  detalleDiaAction,
  guardarMarcasDiaAction,
  solicitarHabilitarFechaAction,
  type DetalleDiaResult,
  type FaltanteRow,
} from "./actions";

export interface DiaProp {
  fecha: string;
  esperados: number;
  capturados: number;
  pct: number;
  completo: boolean;
  futuro: boolean;
}

const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const RAPIDOS: CodigoAsistencia[] = ["A", "F", "DS"];
const OTROS: CodigoAsistencia[] = ["AF", "DT", "DL", "I", "INH", "FER", "PCG", "PSG"];

function partes(iso: string) {
  const p = iso.split("-");
  const dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return { d: dt.getDate(), dow: dt.getDay() };
}

export function DiasQuincena({ dias }: { dias: DiaProp[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DetalleDiaResult | null>(null);
  const [marcas, setMarcas] = useState<Record<string, CodigoAsistencia>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [motivo, setMotivo] = useState("");

  function abrirDia(fecha: string) {
    if (abierto === fecha) { setAbierto(null); return; }
    setAbierto(fecha);
    setDetalle(null);
    setMarcas({});
    setMsg(null);
    setMotivo("");
    start(async () => setDetalle(await detalleDiaAction(fecha)));
  }

  function guardar() {
    if (!abierto) return;
    const lista = Object.entries(marcas).map(([empleado_id, codigo]) => ({ empleado_id, codigo }));
    if (!lista.length) { setMsg({ ok: false, text: "Marca al menos a una persona." }); return; }
    setMsg(null);
    start(async () => {
      const r = await guardarMarcasDiaAction({ fecha: abierto, marcas: lista });
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setMsg({ ok: true, text: `✓ ${r.guardadas} marca(s) guardadas.` });
      setMarcas({});
      setDetalle(await detalleDiaAction(abierto));
      router.refresh();
    });
  }

  function pedirHabilitar() {
    if (!abierto) return;
    setMsg(null);
    start(async () => {
      const r = await solicitarHabilitarFechaAction(abierto, motivo);
      setMsg({ ok: r.ok, text: r.ok ? r.mensaje : r.error });
      if (r.ok) setMotivo("");
    });
  }

  const marcadas = Object.keys(marcas).length;

  return (
    <div>
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {dias.map((d) => {
          const { d: num, dow } = partes(d.fecha);
          const sel = abierto === d.fecha;
          const estilo = d.futuro
            ? "border-white/5 bg-white/[0.02] text-muted-2"
            : d.completo
              ? "border-emerald-400/40 bg-emerald-500/[0.12] text-emerald-200"
              : d.capturados === 0
                ? "border-red-400/40 bg-red-500/[0.10] text-red-200"
                : "border-amber-400/40 bg-amber-500/[0.10] text-amber-200";
          return (
            <li key={d.fecha}>
              <button
                type="button"
                onClick={() => abrirDia(d.fecha)}
                disabled={d.futuro}
                className={`w-full rounded-lg border p-2 text-center transition ${estilo} ${
                  sel ? "ring-2 ring-blue-400/60" : ""
                } ${d.futuro ? "cursor-default" : "hover:brightness-125"}`}
                title={d.futuro ? "Aún no llega" : `${d.capturados}/${d.esperados} · toca para ver quién falta`}
              >
                <div className="text-[9px] uppercase opacity-70">{DIAS_CORTO[dow]}</div>
                <div className="font-display text-lg leading-tight">{num}</div>
                <div className="font-mono text-[9px]">{d.futuro ? "—" : d.completo ? "100%" : `${d.pct}%`}</div>
                {!d.futuro && !d.completo && (
                  <div className="text-[8px] opacity-80">{d.capturados}/{d.esperados}</div>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {abierto && (
        <section className="mt-3 rounded-xl border border-blue-400/30 bg-blue-500/[0.04] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-display text-sm">Día {abierto}</h3>
            <button type="button" onClick={() => setAbierto(null)} className="rounded p-1 text-muted hover:bg-white/10">
              <Icon name="x" size={13} />
            </button>
          </div>

          {!detalle && <p className="text-xs text-muted">Cargando…</p>}

          {detalle && !detalle.ok && (
            <p className="rounded-md border border-red-400/30 bg-red-500/[0.08] px-3 py-2 text-xs text-red-200">{detalle.error}</p>
          )}

          {detalle?.ok && (
            <>
              <p className="mb-3 text-[11px] text-muted">
                {detalle.capturados}/{detalle.esperados} capturados ·{" "}
                <strong className={detalle.faltantes.length ? "text-amber-200" : "text-emerald-300"}>
                  {detalle.faltantes.length} por marcar
                </strong>
              </p>

              {/* Fecha cerrada → pedir habilitación */}
              {!detalle.abierta && detalle.faltantes.length > 0 && (
                <div className="mb-3 rounded-lg border border-amber-400/30 bg-amber-500/[0.07] p-3">
                  <p className="mb-1.5 text-xs font-semibold text-amber-200">
                    <Icon name="alert-triangle" size={12} /> {detalle.motivoCierre}
                  </p>
                  <p className="mb-2 text-[11px] text-amber-100/90">
                    Pide a Soporte que la habilite para poder capturarla.
                  </p>
                  <textarea
                    rows={2}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="¿Por qué no se capturó a tiempo? (opcional)"
                    className="mb-2 w-full rounded-md border border-white/10 bg-[color:var(--surface)] p-2 text-xs"
                    disabled={pending}
                  />
                  <button
                    type="button"
                    onClick={pedirHabilitar}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/50 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/40 disabled:opacity-40"
                  >
                    <Icon name="send" size={12} /> {pending ? "Enviando…" : "Solicitar habilitar esta fecha"}
                  </button>
                </div>
              )}

              {detalle.faltantes.length === 0 ? (
                <p className="rounded-md border border-emerald-400/30 bg-emerald-500/[0.08] px-3 py-2 text-xs text-emerald-200">
                  ✓ Este día está completo.
                </p>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {detalle.faltantes.map((f: FaltanteRow) => {
                      const sel = marcas[f.id];
                      return (
                        <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-md border border-white/5 bg-[color:var(--surface)]/50 px-2 py-1.5">
                          <span className="font-mono text-[10px] text-muted-2">#{f.numero_empleado}</span>
                          <span className="min-w-0 flex-1 truncate text-xs">{f.nombre}</span>
                          <span className="font-mono text-[9px] text-blue-200">{f.sede_abrev}</span>
                          {detalle.abierta && (
                            <>
                              <div className="flex gap-1">
                                {RAPIDOS.map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => setMarcas((p) => ({ ...p, [f.id]: c }))}
                                    disabled={pending}
                                    className={`h-7 w-8 rounded border text-[11px] font-bold transition disabled:opacity-40 ${
                                      sel === c ? "border-white/60 text-white" : "border-white/10 text-muted hover:border-white/40"
                                    }`}
                                    style={sel === c ? { background: CODIGO_SPEC[c].color } : undefined}
                                    title={CODIGO_SPEC[c].nombre}
                                  >
                                    {c}
                                  </button>
                                ))}
                              </div>
                              <select
                                value={OTROS.includes(sel as CodigoAsistencia) ? sel : ""}
                                onChange={(e) => e.target.value && setMarcas((p) => ({ ...p, [f.id]: e.target.value as CodigoAsistencia }))}
                                disabled={pending}
                                className="rounded border border-white/10 bg-[color:var(--bg)] px-1 py-1 text-[10px]"
                                title="Otros códigos"
                              >
                                <option value="">···</option>
                                {OTROS.map((c) => (
                                  <option key={c} value={c}>{c} · {CODIGO_SPEC[c].nombre}</option>
                                ))}
                              </select>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {detalle.abierta && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/5 pt-3">
                      <button
                        type="button"
                        onClick={guardar}
                        disabled={pending || marcadas === 0}
                        className="btn btn-primary btn-sm"
                      >
                        {pending ? "Guardando…" : `Guardar ${marcadas || ""} marca${marcadas === 1 ? "" : "s"}`}
                      </button>
                      <span className="text-[10px] text-muted-2">
                        Se guardan aquí mismo, sin salir de Mi quincena.
                      </span>
                    </div>
                  )}
                </>
              )}

              {msg && (
                <p className={`mt-2 rounded-md border px-3 py-2 text-[11px] ${
                  msg.ok ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200" : "border-red-400/30 bg-red-500/[0.08] text-red-200"
                }`}>
                  {msg.text}
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
