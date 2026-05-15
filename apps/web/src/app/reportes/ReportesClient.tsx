"use client";

import { useState } from "react";

interface Sede { id: string; codigo: string; abrev: string; nombre: string }

function currentYM(): string {
  const d = new Date();
  d.setHours(d.getHours() - 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentQ(): "Q1" | "Q2" {
  const d = new Date();
  d.setHours(d.getHours() - 6);
  return d.getDate() <= 15 ? "Q1" : "Q2";
}

export function ReportesClient({ sedes }: { sedes: Sede[] }) {
  const [tab, setTab] = useState<"nomina" | "asistencias">("nomina");

  return (
    <>
      <div className="mb-5 flex gap-2 border-b border-[color:var(--border)]">
        <button
          type="button"
          onClick={() => setTab("nomina")}
          className={`px-4 py-2 text-sm font-medium transition ${
            tab === "nomina" ? "border-b-2 border-[color:var(--gold)] text-text" : "text-muted hover:text-text"
          }`}
        >
          💰 Nómina quincenal
        </button>
        <button
          type="button"
          onClick={() => setTab("asistencias")}
          className={`px-4 py-2 text-sm font-medium transition ${
            tab === "asistencias" ? "border-b-2 border-[color:var(--gold)] text-text" : "text-muted hover:text-text"
          }`}
        >
          📋 Reporte de asistencias
        </button>
      </div>

      {tab === "nomina" ? <NominaPanel sedes={sedes} /> : <AsistenciasPanel sedes={sedes} />}
    </>
  );
}

function NominaPanel({ sedes }: { sedes: Sede[] }) {
  const [sedeId, setSedeId] = useState(sedes[0]?.id ?? "");
  const [mes, setMes] = useState(currentYM());
  const [q, setQ] = useState<"Q1" | "Q2">(currentQ());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sede = sedes.find((s) => s.id === sedeId);

  async function descargar() {
    if (!sedeId || !mes) return;
    setLoading(true);
    setError(null);
    try {
      const url = `/api/reportes/nomina?sede=${sedeId}&mes=${mes}&q=${q}`;
      const r = await fetch(url);
      if (!r.ok) {
        const e = await r.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error(e.error || `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Vertice_Nomina_${sede?.abrev ?? ""}_${mes}_${q}.pdf`;
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(link.href);
      link.remove();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="animate-fade-up">
      <div className="section-label">Centro de exportación quincenal</div>
      <div className="surface-glow p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[rgba(201,169,97,0.3)] bg-[rgba(201,169,97,0.12)] text-xl">📤</div>
          <div>
            <h2 className="font-display text-lg">Nómina estimada</h2>
            <p className="text-sm text-muted">
              Tabla con matriz de asistencias + cálculo de días laborados, turnos extra, prima dominical,
              descuento por faltas y <strong>pago estimado total</strong>. Una página por sede × quincena.
            </p>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="field">
            <label>Sede</label>
            <select value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>{s.abrev} · {s.nombre}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Mes / Año</label>
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </div>
          <div className="field">
            <label>Quincena</label>
            <select value={q} onChange={(e) => setQ(e.target.value as "Q1" | "Q2")}>
              <option value="Q1">Q1 · 1 al 15</option>
              <option value="Q2">Q2 · 16 al fin de mes</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" onClick={descargar} disabled={loading || !sedeId}>
            {loading ? (
              <>
                <span className="loader-gold loader-gold-sm" />
                Generando PDF...
              </>
            ) : (
              <>📊 Descargar PDF</>
            )}
          </button>
          <span className="pill pill-blue">ADMIN / SUPERADMIN / CEO</span>
        </div>

        {error && <p className="mt-3 rounded-md border border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)] px-3 py-2 text-xs text-[#FCA5A5]">{error}</p>}
      </div>
    </section>
  );
}

function AsistenciasPanel({ sedes }: { sedes: Sede[] }) {
  const [sedeId, setSedeId] = useState(sedes[0]?.id ?? "");
  const [rango, setRango] = useState<"Q1" | "Q2" | "MES" | "CUSTOM">("Q1");
  const [mes, setMes] = useState(currentYM());
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sede = sedes.find((s) => s.id === sedeId);

  async function descargar() {
    if (!sedeId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sede: sedeId, rango });
      if (rango === "CUSTOM") {
        if (!start || !end) throw new Error("Faltan fechas inicio/fin");
        params.set("start", start);
        params.set("end", end);
      } else {
        params.set("mes", mes);
      }
      const r = await fetch(`/api/reportes/asistencias?${params.toString()}`);
      if (!r.ok) {
        const e = await r.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error(e.error || `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Vertice_Asistencias_${sede?.abrev ?? ""}.pdf`;
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(link.href);
      link.remove();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="animate-fade-up">
      <div className="section-label">Reporte histórico por sede</div>
      <div className="surface-glow p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.12)] text-xl">📋</div>
          <div>
            <h2 className="font-display text-lg">Matriz de asistencias</h2>
            <p className="text-sm text-muted">
              Tabla diaria con los códigos capturados por empleado. Útil para revisión histórica, archivo o auditoría.
              Máximo 62 días por reporte.
            </p>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="field">
            <label>Sede</label>
            <select value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>{s.abrev} · {s.nombre}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Tipo de rango</label>
            <select value={rango} onChange={(e) => setRango(e.target.value as typeof rango)}>
              <option value="Q1">Q1 (1 al 15)</option>
              <option value="Q2">Q2 (16 al fin)</option>
              <option value="MES">Mes completo</option>
              <option value="CUSTOM">Personalizado</option>
            </select>
          </div>
          {rango === "CUSTOM" ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="field">
                <label>Desde</label>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="field">
                <label>Hasta</label>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="field">
              <label>Mes / Año</label>
              <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" onClick={descargar} disabled={loading || !sedeId}>
            {loading ? (
              <>
                <span className="loader-gold loader-gold-sm" />
                Generando PDF...
              </>
            ) : (
              <>📋 Descargar PDF</>
            )}
          </button>
          <span className="pill pill-blue">ADMIN / SUPERADMIN / CEO / SOPORTE</span>
        </div>

        {error && <p className="mt-3 rounded-md border border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)] px-3 py-2 text-xs text-[#FCA5A5]">{error}</p>}
      </div>
    </section>
  );
}
