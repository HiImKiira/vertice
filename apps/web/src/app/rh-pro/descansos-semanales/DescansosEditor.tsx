"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { setDescansoSemanalAction, type DiaSemana, DIAS_VALIDOS } from "./actions";

export interface EmpleadoRow {
  id: string;
  numero_empleado: string;
  nombre: string;
  jornada: string;
  sede_id: string;
  sede_abrev: string;
  sede_nombre: string;
  dia_descanso: string[];
}

const DIA_LABELS: Record<DiaSemana, string> = {
  LUN: "L", MAR: "M", MIE: "M", JUE: "J", VIE: "V", SAB: "S", DOM: "D",
};

const DIA_FULL: Record<DiaSemana, string> = {
  LUN: "Lunes", MAR: "Martes", MIE: "Miércoles", JUE: "Jueves", VIE: "Viernes", SAB: "Sábado", DOM: "Domingo",
};

export function DescansosEditor({ empleados, sedes }: { empleados: EmpleadoRow[]; sedes: { id: string; abrev: string; nombre: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sedeFiltro, setSedeFiltro] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return empleados.filter((e) => {
      if (sedeFiltro !== "all" && e.sede_id !== sedeFiltro) return false;
      if (!q) return true;
      return (
        e.nombre.toLowerCase().includes(q) ||
        e.numero_empleado.includes(q)
      );
    });
  }, [empleados, sedeFiltro, search]);

  // Conteo por día (cuántos descansan el día X)
  const conteoPorDia = useMemo(() => {
    const c: Record<DiaSemana, number> = { LUN: 0, MAR: 0, MIE: 0, JUE: 0, VIE: 0, SAB: 0, DOM: 0 };
    for (const e of filtered) {
      for (const d of e.dia_descanso) {
        if (d in c) c[d as DiaSemana]++;
      }
    }
    return c;
  }, [filtered]);

  function toggleDia(emp: EmpleadoRow, dia: DiaSemana) {
    const actual = new Set(emp.dia_descanso);
    if (actual.has(dia)) {
      actual.delete(dia);
    } else {
      actual.add(dia);
    }
    const nuevos = [...actual] as DiaSemana[];
    if (nuevos.length === 0) {
      setMsg(`${emp.nombre}: necesita al menos 1 día. Marca otro antes de quitar este.`);
      return;
    }
    if (nuevos.length > 2) {
      setMsg(`${emp.nombre}: máximo 2 días de descanso.`);
      return;
    }
    setSavingId(emp.id);
    start(async () => {
      const r = await setDescansoSemanalAction(emp.id, nuevos);
      setSavingId(null);
      if (r.ok) {
        setMsg(`✓ ${emp.nombre}: ${nuevos.map((d) => DIA_FULL[d]).join(" + ")}`);
        router.refresh();
      } else {
        setMsg(`Error: ${r.error}`);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Stats por día */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {DIAS_VALIDOS.map((d) => (
          <div key={d} className="rounded-lg border border-white/10 bg-[color:var(--card)] px-1.5 py-2 text-center">
            <div className="font-display text-base text-text sm:text-lg">{conteoPorDia[d]}</div>
            <div className="text-[9px] uppercase tracking-tagline text-muted-2">{DIA_FULL[d].slice(0, 3)}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar nombre o número..."
          className="min-w-0 flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-sm sm:flex-initial sm:w-64"
        />
        <select
          value={sedeFiltro}
          onChange={(e) => setSedeFiltro(e.target.value)}
          className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-sm"
        >
          <option value="all">Todas las sedes ({empleados.length})</option>
          {sedes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.abrev} · {s.nombre}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted">{filtered.length} mostrados</span>
      </div>

      {msg && (
        <p className="rounded-md border border-blue-400/30 bg-blue-500/[0.08] px-3 py-2 text-xs text-blue-200">
          {msg}
        </p>
      )}

      {/* Lista */}
      <ul className="space-y-1.5">
        {filtered.map((e) => {
          const dias = new Set(e.dia_descanso);
          const saving = pending && savingId === e.id;
          return (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-[color:var(--card)] px-3 py-2"
            >
              <span className="shrink-0 font-mono text-[10px] text-muted-2">#{e.numero_empleado}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.nombre}</p>
                <p className="truncate text-[10px] text-muted-2">
                  <span className="font-mono">{e.sede_abrev}</span> · {e.jornada}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {DIAS_VALIDOS.map((d) => {
                  const active = dias.has(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDia(e, d)}
                      disabled={saving}
                      className={`h-8 w-8 rounded-md font-mono text-xs font-bold transition disabled:opacity-40 ${
                        active
                          ? "bg-blue-500/80 text-white shadow-md"
                          : "border border-white/10 text-muted hover:border-white/30 hover:text-text"
                      }`}
                      title={`${active ? "Quitar" : "Marcar"} ${DIA_FULL[d]}`}
                    >
                      {DIA_LABELS[d]}
                    </button>
                  );
                })}
              </div>
              {saving && <span className="text-[10px] text-muted">guardando...</span>}
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/10 bg-[color:var(--card)] p-8 text-center text-sm text-muted">
          No hay empleados que coincidan con el filtro.
        </div>
      )}
    </div>
  );
}
