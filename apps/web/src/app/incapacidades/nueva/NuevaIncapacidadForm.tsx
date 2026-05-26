"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { TIPO_SPECS, type IncapacidadTipo } from "@/lib/incapacidades";
import { crearIncapacidadAction } from "../actions";

interface Empleado {
  id: string;
  numero_empleado: string;
  nombre: string;
  sede_abrev: string;
}

export function NuevaIncapacidadForm({ empleados }: { empleados: Empleado[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tipo, setTipo] = useState<IncapacidadTipo | null>(null);
  const [empleadoQ, setEmpleadoQ] = useState("");
  const [empleadoId, setEmpleadoId] = useState("");
  const [fechaAcc, setFechaAcc] = useState("");
  const [horaAcc, setHoraAcc] = useState("");
  const [lugar, setLugar] = useState("TRABAJO");
  const [descripcion, setDescripcion] = useState("");
  const [testigos, setTestigos] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [diasAut, setDiasAut] = useState("");
  const [umf, setUmf] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sugerencias = empleadoQ.length >= 2
    ? empleados.filter((e) =>
        e.nombre.toLowerCase().includes(empleadoQ.toLowerCase())
        || e.numero_empleado.includes(empleadoQ),
      ).slice(0, 8)
    : [];
  const empleadoSel = empleados.find((e) => e.id === empleadoId);

  function submit() {
    setError(null);
    if (!tipo) { setError("Selecciona un tipo de incapacidad"); return; }
    if (!empleadoId) { setError("Selecciona un empleado"); return; }

    start(async () => {
      const res = await crearIncapacidadAction({
        empleado_id: empleadoId,
        tipo,
        fecha_accidente: fechaAcc || null,
        hora_accidente: horaAcc || null,
        lugar_accidente: lugar || null,
        descripcion: descripcion || null,
        testigos: testigos || null,
        fecha_inicio: fechaInicio || null,
        dias_autorizados: diasAut ? parseInt(diasAut, 10) : null,
        unidad_medica: umf || null,
        observaciones: obs || null,
      });
      if (!res.ok) { setError(res.error); return; }
      router.push(res.id ? `/incapacidades/${res.id}` : "/incapacidades");
      router.refresh();
    });
  }

  const requiereAccidente = tipo && tipo !== "ENFERMEDAD_GENERAL";
  const spec = tipo ? TIPO_SPECS[tipo] : null;

  return (
    <div className="space-y-6">
      {/* Paso 1: tipo */}
      <section className="surface-card p-4 sm:p-5">
        <h2 className="font-display text-sm">1. Tipo de incapacidad</h2>
        <p className="mt-1 text-[11px] text-muted-2">Elige el tipo para que aparezca el flujo correcto y los documentos requeridos.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(Object.keys(TIPO_SPECS) as IncapacidadTipo[]).map((t) => {
            const s = TIPO_SPECS[t];
            const active = tipo === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-blue-400 bg-blue-500/10 ring-2 ring-blue-400/40"
                    : "border-white/10 bg-[color:var(--surface)]/40 hover:border-white/30"
                }`}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold text-white" style={{ background: s.color }}>
                    {s.short}
                  </span>
                  <p className="text-sm font-semibold">{s.label}</p>
                </div>
                <p className="text-[11px] text-muted-2">{s.description}</p>
              </button>
            );
          })}
        </div>

        {spec && (
          <div className="mt-3 rounded-lg border border-blue-400/25 bg-blue-500/[0.04] p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-tagline text-blue-300">Flujo esperado · {spec.flujoEstados.length} etapas</p>
            <ul className="space-y-1.5 text-[11px] text-muted">
              {spec.notas.map((n, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-blue-400">▸</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Paso 2: empleado */}
      {tipo && (
        <section className="surface-card p-4 sm:p-5">
          <h2 className="font-display text-sm">2. Empleado afectado</h2>
          <p className="mt-1 text-[11px] text-muted-2">Busca por nombre o número de empleado.</p>
          {empleadoSel ? (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/[0.06] px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{empleadoSel.nombre}</p>
                <p className="text-[10px] text-muted-2">
                  #{empleadoSel.numero_empleado} · <span className="font-mono">{empleadoSel.sede_abrev}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setEmpleadoId(""); setEmpleadoQ(""); }}
                className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-muted hover:text-text"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={empleadoQ}
                onChange={(e) => setEmpleadoQ(e.target.value)}
                placeholder="Nombre o número..."
                className="mt-3 w-full rounded-md border border-white/10 bg-[color:var(--surface)] px-3 py-2 text-sm"
              />
              {sugerencias.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {sugerencias.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => { setEmpleadoId(e.id); setEmpleadoQ(e.nombre); }}
                        className="w-full rounded-md border border-white/5 bg-[color:var(--card)] px-3 py-2 text-left hover:border-blue-400/30"
                      >
                        <p className="text-sm">{e.nombre}</p>
                        <p className="text-[10px] text-muted-2">
                          #{e.numero_empleado} · <span className="font-mono">{e.sede_abrev}</span>
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      {/* Paso 3: datos */}
      {tipo && empleadoId && (
        <section className="surface-card p-4 sm:p-5 space-y-3">
          <h2 className="font-display text-sm">3. Detalles del caso</h2>

          {requiereAccidente && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="field">
                  <label>Fecha del accidente</label>
                  <input type="date" value={fechaAcc} onChange={(e) => setFechaAcc(e.target.value)} />
                </div>
                <div className="field">
                  <label>Hora del accidente</label>
                  <input type="time" value={horaAcc} onChange={(e) => setHoraAcc(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>Lugar del accidente</label>
                <select value={lugar} onChange={(e) => setLugar(e.target.value)}>
                  <option value="TRABAJO">En el centro de trabajo</option>
                  <option value="TRAYECTO">En trayecto al/del trabajo</option>
                  <option value="DOMICILIO_TRAYECTO">En domicilio (regresando del trabajo)</option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>
              <div className="field">
                <label>Descripción del incidente</label>
                <textarea
                  rows={3}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Relato breve, mecanismo de lesión, etc."
                />
              </div>
              <div className="field">
                <label>Testigos</label>
                <input
                  type="text"
                  value={testigos}
                  onChange={(e) => setTestigos(e.target.value)}
                  placeholder="Nombres, o 'sin testigos'"
                />
              </div>
            </>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="field">
              <label>Inicio de incapacidad</label>
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            </div>
            <div className="field">
              <label>Días autorizados</label>
              <input
                type="number"
                value={diasAut}
                onChange={(e) => setDiasAut(e.target.value)}
                min={0}
                placeholder="ej. 2"
              />
            </div>
            <div className="field">
              <label>UMF / Unidad médica</label>
              <input
                type="text"
                value={umf}
                onChange={(e) => setUmf(e.target.value)}
                placeholder="ej. HGSMF NO 46 UMAN"
              />
            </div>
          </div>

          <div className="field">
            <label>Observaciones internas (opcional)</label>
            <textarea
              rows={2}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Notas para RH. Solo visible internamente."
            />
          </div>

          {error && (
            <p className="rounded-md border border-red-400/30 bg-red-500/[0.08] px-3 py-2 text-xs text-red-300">
              ⚠ {error}
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="btn btn-primary inline-flex w-full items-center justify-center gap-1.5 sm:w-auto"
          >
            <Icon name="check" size={14} />
            {pending ? "Creando..." : "Reportar incapacidad"}
          </button>
        </section>
      )}
    </div>
  );
}
