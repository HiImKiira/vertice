"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

export interface SedeRow { id: string; abrev: string; nombre: string }
export interface EmpleadoBancarioRow {
  id: string;
  numero_empleado: string;
  nombre: string;
  sede_id: string;
  sede_abrev: string;
  sede_nombre: string;
  jornada: string;
  rfc: string | null;
  nss: string | null;
  curp: string | null;
  telefono: string | null;
  email_personal: string | null;
  banco: string | null;
  cuenta_bancaria: string | null;
  clabe: string | null;
  salario_diario: number;
  activo: boolean;
  fecha_alta: string;
  fecha_baja: string | null;
  completo_bancario: boolean;
  faltantes: string | null;
}

interface Props {
  sedes: SedeRow[];
  empleados: EmpleadoBancarioRow[];
  sedeIdInicial: string;
}

export function EmpleadosBancariosClient({ sedes, empleados, sedeIdInicial }: Props) {
  const router = useRouter();
  const [sedeId, setSedeId] = useState(sedeIdInicial);
  const [q, setQ] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"all" | "completos" | "incompletos">("all");
  const [exportLoading, setExportLoading] = useState(false);

  // Aplicar filtro de sede sin recargar la página (server ya envió todo)
  function cambiarSede(nuevaSede: string) {
    setSedeId(nuevaSede);
    const params = new URLSearchParams();
    if (nuevaSede) params.set("sede", nuevaSede);
    router.replace(`/facturacion/empleados-bancarios${params.toString() ? "?" + params.toString() : ""}`);
  }

  const filtrados = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return empleados.filter((e) => {
      if (filtroEstado === "completos" && !e.completo_bancario) return false;
      if (filtroEstado === "incompletos" && e.completo_bancario) return false;
      if (ql) {
        const match = e.nombre.toLowerCase().includes(ql)
          || e.numero_empleado.toLowerCase().includes(ql)
          || (e.rfc ?? "").toLowerCase().includes(ql)
          || (e.clabe ?? "").toLowerCase().includes(ql);
        if (!match) return false;
      }
      return true;
    });
  }, [empleados, q, filtroEstado]);

  const stats = useMemo(() => {
    const total = empleados.length;
    const completos = empleados.filter((e) => e.completo_bancario).length;
    const conClabe = empleados.filter((e) => e.clabe).length;
    const sinNada = empleados.filter((e) => !e.banco && !e.cuenta_bancaria && !e.clabe && !e.rfc && !e.nss).length;
    return { total, completos, conClabe, sinNada, incompletos: total - completos };
  }, [empleados]);

  async function descargar(soloConDatos: boolean) {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      if (sedeId) params.set("sede", sedeId);
      if (soloConDatos) params.set("solo_con_datos", "1");
      const r = await fetch(`/api/facturacion/empleados-bancarios/xlsx?${params.toString()}`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Error" }));
        alert(`Error: ${err.error || "no se pudo generar"}`);
        return;
      }
      const blob = await r.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      const sedeLabel = sedeId ? (sedes.find((s) => s.id === sedeId)?.abrev ?? "SEDE") : "TODAS";
      const fecha = new Date().toISOString().slice(0, 10);
      link.download = `Vortex_Empleados_Bancarios_${sedeLabel}_${fecha}.xlsx`;
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(link.href);
      link.remove();
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl sm:text-3xl">Datos bancarios de empleados</h1>
        <p className="mt-1 text-xs text-muted">
          Vista privada para Facturación · información sensible para emisión de depósitos de nómina.
        </p>
      </header>

      {/* Stats */}
      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Empleados activos" value={stats.total} color="blue" />
        <Stat label="Listos para depósito" value={stats.completos} color="emerald" sub="banco + cuenta + CLABE" />
        <Stat label="Incompletos" value={stats.incompletos} color="amber" sub="falta algún dato bancario" />
        <Stat label="Sin datos en absoluto" value={stats.sinNada} color="red" sub="ni RFC, NSS ni cuenta" />
      </section>

      {/* Filtros + descarga */}
      <section className="rounded-xl border border-white/5 bg-[color:var(--card)] p-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={sedeId}
            onChange={(e) => cambiarSede(e.target.value)}
            className="rounded-md border border-white/10 bg-[color:var(--bg)] px-2 py-1.5 text-xs"
          >
            <option value="">Todas las sedes</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>{s.abrev} · {s.nombre}</option>
            ))}
          </select>

          <div className="flex gap-1 text-xs">
            {(["all", "completos", "incompletos"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltroEstado(f)}
                className={`rounded px-2.5 py-1 transition ${
                  filtroEstado === f ? "bg-blue-500/30 text-blue-100" : "bg-white/5 text-muted hover:text-text"
                }`}
              >
                {f === "all" ? "Todos" : f === "completos" ? "✓ Completos" : "⚠ Incompletos"}
              </button>
            ))}
          </div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nombre / #ID / RFC / CLABE..."
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-[color:var(--bg)] px-3 py-1.5 text-xs sm:max-w-xs"
          />

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => descargar(false)}
              disabled={exportLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40"
              title="Exporta todos (con o sin datos completos)"
            >
              {exportLoading ? "Generando..." : "📗 Descargar Excel"}
            </button>
            <button
              onClick={() => descargar(true)}
              disabled={exportLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-400/40 bg-blue-500/15 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-500/30 disabled:opacity-40"
              title="Solo empleados con al menos un dato bancario llenado"
            >
              📗 Solo con datos
            </button>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted-2">
          El Excel incluye 3 hojas: <strong>Depósitos</strong> (vista completa con faltantes), <strong>Layout SPEI</strong> (formato típico para importar al banco), e <strong>Incompletos</strong> (para perseguir captura de datos).
        </p>
      </section>

      {/* Tabla */}
      <section className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-xs">
          <thead className="bg-white/[0.03] text-left">
            <tr>
              <th className="px-2 py-2 font-mono text-[10px] uppercase">Sede</th>
              <th className="px-2 py-2 font-mono text-[10px] uppercase">#</th>
              <th className="px-2 py-2 font-mono text-[10px] uppercase">Empleado</th>
              <th className="px-2 py-2 font-mono text-[10px] uppercase">Banco</th>
              <th className="px-2 py-2 font-mono text-[10px] uppercase">CLABE</th>
              <th className="px-2 py-2 font-mono text-[10px] uppercase">RFC</th>
              <th className="px-2 py-2 font-mono text-[10px] uppercase">NSS</th>
              <th className="px-2 py-2 font-mono text-[10px] uppercase">Estado</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted">Sin empleados con este filtro.</td></tr>
            ) : filtrados.map((e) => (
              <tr key={e.id} className={`border-t border-white/5 ${!e.completo_bancario ? "bg-amber-500/[0.03]" : ""}`}>
                <td className="px-2 py-1.5 font-mono text-[11px] text-blue-200">{e.sede_abrev}</td>
                <td className="px-2 py-1.5 font-mono text-amber-200">{e.numero_empleado}</td>
                <td className="px-2 py-1.5">{e.nombre}</td>
                <td className="px-2 py-1.5">{e.banco ?? <span className="text-muted-2 italic">—</span>}</td>
                <td className="px-2 py-1.5 font-mono text-[10px]">
                  {e.clabe ?? <span className="text-muted-2 italic">—</span>}
                </td>
                <td className="px-2 py-1.5 font-mono text-[10px]">
                  {e.rfc ?? <span className="text-muted-2 italic">—</span>}
                </td>
                <td className="px-2 py-1.5 font-mono text-[10px]">
                  {e.nss ?? <span className="text-muted-2 italic">—</span>}
                </td>
                <td className="px-2 py-1.5">
                  {e.completo_bancario ? (
                    <span className="pill pill-green">LISTO</span>
                  ) : (
                    <span className="pill pill-amber" title={e.faltantes ?? ""}>FALTA {e.faltantes ? e.faltantes.split(",").length : "?"}</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Link href={`/rh-pro/consulta/${e.id}`} className="text-[10px] text-blue-300 hover:underline">
                    Llenar →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-[10px] text-muted-2">
        💡 Para llenar datos masivamente: ve a <Link href="/rh-pro/empleados/importar" className="text-blue-300 underline">RH Pro → Empleados → Import masivo</Link> y sube un xlsx con las columnas <code className="font-mono">banco, cuenta_bancaria, clabe, rfc, nss, curp</code>. El sistema actualiza por <code className="font-mono">numero_empleado</code> sin pisar otros campos.
      </p>
    </div>
  );
}

function Stat({ label, value, color, sub }: { label: string; value: number; color: "blue" | "emerald" | "amber" | "red"; sub?: string }) {
  const cls = {
    blue: "border-blue-400/30 bg-blue-500/[0.06] text-blue-200",
    emerald: "border-emerald-400/30 bg-emerald-500/[0.06] text-emerald-200",
    amber: "border-amber-400/30 bg-amber-500/[0.06] text-amber-200",
    red: "border-red-400/30 bg-red-500/[0.06] text-red-200",
  }[color];
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${cls}`}>
      <div className="font-display text-2xl leading-none">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-tagline opacity-80">{label}</div>
      {sub && <div className="mt-0.5 text-[9px] opacity-60">{sub}</div>}
    </div>
  );
}
