"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { darDeBajaEmpleadoAction } from "./actions";

interface EmpleadoRow {
  id: string;
  numero_empleado: string;
  nombre: string;
  jornada: string;
  sede_id: string;
  fecha_alta: string;
}
interface SedeRow { id: string; abrev: string; nombre: string }

const MOTIVOS_COMUNES = [
  "Renuncia voluntaria",
  "Término de contrato",
  "Abandono de empleo",
  "Rescisión justificada",
  "Mutuo acuerdo",
  "Otro",
];

function todayISOMerida(): string {
  const d = new Date();
  d.setHours(d.getHours() - 6);
  return d.toISOString().slice(0, 10);
}

export function BajaForm({ empleados, sedes }: { empleados: EmpleadoRow[]; sedes: SedeRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filterSede, setFilterSede] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [fechaBaja, setFechaBaja] = useState(todayISOMerida());
  const [motivo, setMotivo] = useState(MOTIVOS_COMUNES[0] ?? "");
  const [motivoCustom, setMotivoCustom] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sedeMap = useMemo(() => new Map(sedes.map((s) => [s.id, s])), [sedes]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return empleados.filter((e) => {
      if (filterSede && e.sede_id !== filterSede) return false;
      if (!q) return true;
      return e.nombre.toLowerCase().includes(q) || e.numero_empleado.includes(q);
    });
  }, [empleados, query, filterSede]);

  const seleccionado = empleados.find((e) => e.id === selectedId);

  function submit() {
    setError(null);
    setSuccess(null);
    if (!selectedId) {
      setError("Selecciona un empleado.");
      return;
    }
    const motivoFinal = motivo === "Otro" ? motivoCustom.trim() : motivo;
    if (!motivoFinal) {
      setError("Debes capturar un motivo.");
      return;
    }
    if (!confirm(`¿Confirmas la baja de ${seleccionado?.nombre} con fecha ${fechaBaja}?`)) return;

    startTransition(async () => {
      const r = await darDeBajaEmpleadoAction({
        empleado_id: selectedId,
        fecha_baja: fechaBaja,
        motivo: motivoFinal,
        observaciones: observaciones.trim() || undefined,
      });
      if (!r.ok) {
        setError(r.error);
      } else {
        setSuccess(`Empleado ${seleccionado?.nombre} dado de baja.`);
        setSelectedId("");
        setMotivoCustom("");
        setObservaciones("");
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[2fr_3fr] animate-fade-up delay-100">
      {/* Búsqueda + lista */}
      <section className="surface-glow p-5">
        <div className="section-label">Buscar empleado activo</div>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div className="field">
            <label>Filtrar por sede</label>
            <select value={filterSede} onChange={(e) => setFilterSede(e.target.value)}>
              <option value="">Todas las sedes</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>{s.abrev} · {s.nombre}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Buscar (nombre o ID)</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="AKE CANUL... o 123"
              autoFocus
            />
          </div>
        </div>
        <p className="mb-2 text-[10px] uppercase tracking-tagline text-muted">
          {filtered.length} activo{filtered.length === 1 ? "" : "s"} de {empleados.length}
        </p>
        <ul className="max-h-[400px] overflow-y-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--card)]">
          {filtered.slice(0, 80).map((e) => {
            const sede = sedeMap.get(e.sede_id);
            const active = selectedId === e.id;
            return (
              <li
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                className={`cursor-pointer border-b border-[color:var(--border)] px-3 py-2 text-sm transition ${
                  active ? "bg-[rgba(59,130,246,0.15)] border-l-2 border-l-[color:var(--blue)]" : "hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-2">#{e.numero_empleado}</span>
                  <span className="flex-1 truncate font-medium">{e.nombre}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted">
                  <span className="pill pill-blue" style={{ padding: "1px 6px", fontSize: 9 }}>{sede?.abrev ?? "—"}</span>
                  <span className="pill pill-amber" style={{ padding: "1px 6px", fontSize: 9 }}>{e.jornada}</span>
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">Sin resultados.</li>
          )}
        </ul>
      </section>

      {/* Form de baja */}
      <section className="surface-glow p-5">
        <div className="section-label">Detalles de la baja</div>
        {!seleccionado ? (
          <div className="rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--card)] p-10 text-center text-sm text-muted">
            ← Selecciona un empleado de la lista
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.06)] p-4">
              <p className="text-[10px] uppercase tracking-tagline text-[#FCA5A5]">Va a darse de baja</p>
              <p className="mt-1 font-display text-xl text-text">{seleccionado.nombre}</p>
              <p className="mt-1 text-xs text-muted">
                #{seleccionado.numero_empleado} ·{" "}
                <span className="pill pill-blue" style={{ padding: "1px 6px", fontSize: 9 }}>{sedeMap.get(seleccionado.sede_id)?.abrev}</span>{" "}
                · {seleccionado.jornada} · alta {seleccionado.fecha_alta}
              </p>
            </div>

            <div className="field">
              <label>Fecha de baja *</label>
              <input
                type="date"
                value={fechaBaja}
                onChange={(e) => setFechaBaja(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Motivo *</label>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                {MOTIVOS_COMUNES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {motivo === "Otro" && (
              <div className="field">
                <label>Especifica motivo</label>
                <input
                  type="text"
                  value={motivoCustom}
                  onChange={(e) => setMotivoCustom(e.target.value)}
                  placeholder="Describe el motivo..."
                />
              </div>
            )}

            <div className="field">
              <label>Observaciones (opcional)</label>
              <textarea
                rows={3}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Notas adicionales para el archivo de RH"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)] px-4 py-3 text-sm text-[#FCA5A5]">
                ⚠ {error}
              </div>
            )}
            {success && (
              <div className="rounded-xl border border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.1)] px-4 py-3 text-sm text-[#6EE7B7]">
                ✓ {success}
              </div>
            )}

            <button type="button" onClick={submit} disabled={isPending} className="btn btn-danger w-full">
              {isPending ? (
                <>
                  <span className="loader-vortex-sm" />
                  Procesando...
                </>
              ) : (
                <>🔴 Confirmar baja de {seleccionado.nombre.split(" ").slice(0, 2).join(" ")}</>
              )}
            </button>
          </div>
        )}
      </section>

      {isPending && (
        <div className="overlay-loader">
          <div className="loader-vortex-lg" />
          <p className="overlay-loader-text">Procesando baja...</p>
        </div>
      )}
    </div>
  );
}
