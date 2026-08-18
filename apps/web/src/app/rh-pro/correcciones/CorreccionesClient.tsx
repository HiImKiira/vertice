"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { CODIGOS, CODIGO_SPEC, type CodigoAsistencia } from "@vertice/shared/codes";
import {
  eliminarIncapacidadCorreccionAction,
  marcasDeEmpleadoAction,
  corregirMarcaAction,
  type MarcaRow,
} from "./actions";

export interface IncapMini {
  id: string;
  tipo_label: string;
  estado_label: string;
  creado_en: string;
  empleado: string;
  sede: string;
  reporter: string;
  docs: number;
}
export interface EmpMini { id: string; numero_empleado: string; nombre: string; sede_abrev: string }

export function CorreccionesClient({ incapacidades, empleados, rangoDefault }: {
  incapacidades: IncapMini[];
  empleados: EmpMini[];
  rangoDefault: { inicio: string; fin: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Incapacidades ──
  const [delId, setDelId] = useState<string | null>(null);
  const [motivoIncap, setMotivoIncap] = useState("");

  function eliminarIncap(id: string) {
    if (!motivoIncap.trim()) { setMsg({ ok: false, text: "Escribe el motivo de la corrección." }); return; }
    if (!confirm("¿Eliminar este registro de incapacidad? Se borra también su expediente (documentos y timeline).")) return;
    setMsg(null);
    start(async () => {
      const r = await eliminarIncapacidadCorreccionAction({ incapacidadId: id, motivo: motivoIncap });
      setMsg({ ok: r.ok, text: r.ok ? r.mensaje : r.error });
      if (r.ok) { setDelId(null); setMotivoIncap(""); router.refresh(); }
    });
  }

  // ── Marcas ──
  const [q, setQ] = useState("");
  const [empId, setEmpId] = useState<string | null>(null);
  const [inicio, setInicio] = useState(rangoDefault.inicio);
  const [fin, setFin] = useState(rangoDefault.fin);
  const [marcas, setMarcas] = useState<MarcaRow[] | null>(null);
  const [selFecha, setSelFecha] = useState<string | null>(null);
  const [nuevoCodigo, setNuevoCodigo] = useState<CodigoAsistencia | "ELIMINAR">("A");
  const [motivoMarca, setMotivoMarca] = useState("");

  const coincidencias = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (ql.length < 2) return [];
    return empleados.filter((e) => e.nombre.toLowerCase().includes(ql) || e.numero_empleado.toLowerCase() === ql).slice(0, 8);
  }, [q, empleados]);
  const empSel = empleados.find((e) => e.id === empId) ?? null;

  function buscarMarcas(id?: string) {
    const target = id ?? empId;
    if (!target) return;
    setMsg(null); setSelFecha(null);
    start(async () => {
      const r = await marcasDeEmpleadoAction({ empleadoId: target, inicio, fin });
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setMarcas(r.marcas);
    });
  }

  function aplicarMarca() {
    if (!empId || !selFecha) return;
    if (!motivoMarca.trim()) { setMsg({ ok: false, text: "Escribe el motivo de la corrección." }); return; }
    const txt = nuevoCodigo === "ELIMINAR" ? "eliminar la marca" : `cambiarla a ${nuevoCodigo}`;
    if (!confirm(`¿Confirmas ${txt} del ${selFecha}?`)) return;
    setMsg(null);
    start(async () => {
      const r = await corregirMarcaAction({ empleadoId: empId, fecha: selFecha, nuevoCodigo, motivo: motivoMarca });
      setMsg({ ok: r.ok, text: r.ok ? r.mensaje : r.error });
      if (r.ok) { setSelFecha(null); setMotivoMarca(""); buscarMarcas(); }
    });
  }

  return (
    <div className="space-y-6">
      {msg && (
        <p className={`rounded-md border px-3 py-2 text-xs ${
          msg.ok ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200" : "border-red-400/30 bg-red-500/[0.08] text-red-200"
        }`}>{msg.text}</p>
      )}

      {/* ── 1) Incapacidades mal registradas ── */}
      <section className="surface-glow p-5">
        <div className="section-label mb-1">Incapacidades — eliminar registros mal capturados</div>
        <p className="mb-3 text-[11px] text-muted">
          Borra el registro completo (expediente incluido). Queda asentado en la bitácora de actividad con tu nombre y el motivo.
        </p>
        <ul className="space-y-1.5">
          {incapacidades.map((i) => (
            <li key={i.id} className="rounded-md border border-white/5 bg-[color:var(--card)] px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-[10px] text-muted-2">{new Date(i.creado_en).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{i.empleado}</span>
                <span className="font-mono text-[10px] text-blue-200">{i.sede}</span>
                <span className="text-[10px] text-muted">{i.tipo_label} · {i.estado_label} · 📎{i.docs} · por @{i.reporter}</span>
                <button
                  type="button"
                  onClick={() => { setDelId(delId === i.id ? null : i.id); setMotivoIncap(""); setMsg(null); }}
                  disabled={pending}
                  className="rounded-md border border-red-400/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-300 hover:bg-red-500/25 disabled:opacity-40"
                >
                  {delId === i.id ? "Cancelar" : "Eliminar"}
                </button>
              </div>
              {delId === i.id && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/5 pt-2">
                  <input
                    type="text"
                    value={motivoIncap}
                    onChange={(e) => setMotivoIncap(e.target.value)}
                    placeholder="Motivo de la corrección (obligatorio) — ej. registro duplicado"
                    className="min-w-0 flex-1 rounded-md border border-white/10 bg-[color:var(--surface)] px-2 py-1.5 text-xs"
                    disabled={pending}
                  />
                  <button
                    type="button"
                    onClick={() => eliminarIncap(i.id)}
                    disabled={pending || !motivoIncap.trim()}
                    className="rounded-md bg-red-500/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-40"
                  >
                    {pending ? "Eliminando…" : "Confirmar eliminación"}
                  </button>
                </div>
              )}
            </li>
          ))}
          {incapacidades.length === 0 && (
            <li className="rounded-md border border-dashed border-white/10 p-4 text-center text-xs text-muted">Sin incapacidades registradas.</li>
          )}
        </ul>
      </section>

      {/* ── 2) Marcas de asistencia ── */}
      <section className="surface-glow p-5">
        <div className="section-label mb-1">Marcas de asistencia — corregir o eliminar una marca</div>
        <p className="mb-3 text-[11px] text-muted">
          Busca al trabajador, elige el rango y corrige la marca equivocada. También queda en bitácora.
        </p>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <div className="field relative">
            <label>Trabajador</label>
            <input
              type="text"
              value={empSel ? `#${empSel.numero_empleado} ${empSel.nombre}` : q}
              onChange={(e) => { setEmpId(null); setMarcas(null); setQ(e.target.value); }}
              placeholder="Nombre o número…"
              disabled={pending}
            />
            {!empSel && coincidencias.length > 0 && (
              <ul className="absolute top-full z-20 mt-1 w-full overflow-hidden rounded-md border border-white/10 bg-[color:var(--bg)] shadow-xl">
                {coincidencias.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-white/10"
                      onClick={() => { setEmpId(e.id); setQ(""); buscarMarcas(e.id); }}
                    >
                      <span className="font-mono text-[10px] text-muted-2">#{e.numero_empleado}</span>
                      <span className="min-w-0 flex-1 truncate">{e.nombre}</span>
                      <span className="font-mono text-[9px] text-blue-200">{e.sede_abrev}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="field"><label>Desde</label><input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} disabled={pending} /></div>
          <div className="field"><label>Hasta</label><input type="date" value={fin} onChange={(e) => setFin(e.target.value)} disabled={pending} /></div>
          <div className="flex items-end">
            <button type="button" onClick={() => buscarMarcas()} disabled={pending || !empId} className="btn btn-primary btn-sm">
              <Icon name="search" size={12} /> Ver marcas
            </button>
          </div>
        </div>

        {marcas && (
          <div className="mt-4">
            {marcas.length === 0 ? (
              <p className="rounded-md border border-dashed border-white/10 p-4 text-center text-xs text-muted">Sin marcas en ese rango.</p>
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {marcas.map((m) => {
                  const spec = CODIGO_SPEC[m.codigo as CodigoAsistencia];
                  const sel = selFecha === m.fecha;
                  return (
                    <li key={m.fecha}>
                      <button
                        type="button"
                        onClick={() => { setSelFecha(sel ? null : m.fecha); setMsg(null); }}
                        className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition ${
                          sel ? "border-blue-400/60 bg-blue-500/10" : "border-white/5 bg-[color:var(--card)] hover:border-white/20"
                        }`}
                      >
                        <span className="font-mono text-[11px]">{m.fecha}</span>
                        <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold text-white" style={{ background: spec?.color ?? "#555" }}>
                          {m.codigo}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-left text-[10px] text-muted-2">
                          {spec?.nombre ?? ""} {m.capturado_por_username && `· por @${m.capturado_por_username}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {selFecha && (
              <div className="mt-3 rounded-xl border border-blue-400/30 bg-blue-500/[0.05] p-3">
                <p className="mb-2 text-xs font-semibold text-blue-200">Corregir marca del {selFecha}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={nuevoCodigo}
                    onChange={(e) => setNuevoCodigo(e.target.value as CodigoAsistencia | "ELIMINAR")}
                    disabled={pending}
                    className="rounded-md border border-white/10 bg-[color:var(--surface)] px-2 py-1.5 text-xs"
                  >
                    {CODIGOS.map((c) => (
                      <option key={c} value={c}>{c} · {CODIGO_SPEC[c].nombre}</option>
                    ))}
                    <option value="ELIMINAR">🗑 Eliminar la marca</option>
                  </select>
                  <input
                    type="text"
                    value={motivoMarca}
                    onChange={(e) => setMotivoMarca(e.target.value)}
                    placeholder="Motivo (obligatorio)"
                    className="min-w-0 flex-1 rounded-md border border-white/10 bg-[color:var(--surface)] px-2 py-1.5 text-xs"
                    disabled={pending}
                  />
                  <button type="button" onClick={aplicarMarca} disabled={pending || !motivoMarca.trim()} className="btn btn-primary btn-sm">
                    {pending ? "Aplicando…" : "Aplicar corrección"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
