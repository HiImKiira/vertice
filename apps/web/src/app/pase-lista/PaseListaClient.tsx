"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CODIGO_SPEC, CODIGOS, type CodigoAsistencia } from "@vertice/shared/codes";
import { guardarPaseListaAction, type GuardarResult } from "./actions";

interface SedeShape {
  id: string;
  codigo: string;
  abrev: string;
  nombre: string;
}

interface Opcion {
  jornada: string;
  sede: SedeShape;
}

interface Empleado {
  id: string;
  numero_empleado: string;
  nombre: string;
}

interface Props {
  fecha: string;
  sedeId: string;
  jornada: string;
  opciones: Opcion[];
  empleados: Empleado[];
  marcasExistentes: Record<string, string>;
  canEdit: boolean;
}

export function PaseListaClient(props: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pendientes, setPendientes] = useState<Record<string, CodigoAsistencia>>({});
  const [resultado, setResultado] = useState<GuardarResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateUrl(next: { sede?: string; jornada?: string; fecha?: string }) {
    const usp = new URLSearchParams(params.toString());
    if (next.sede) usp.set("sede", next.sede);
    if (next.jornada) usp.set("jornada", next.jornada);
    if (next.fecha) usp.set("fecha", next.fecha);
    router.push(`/pase-lista?${usp.toString()}`);
  }

  const sedesUnicas = useMemo(() => {
    const map = new Map<string, SedeShape>();
    for (const o of props.opciones) map.set(o.sede.id, o.sede);
    return [...map.values()];
  }, [props.opciones]);

  const jornadasDeSede = useMemo(() => {
    return [...new Set(props.opciones.filter((o) => o.sede.id === props.sedeId).map((o) => o.jornada))];
  }, [props.opciones, props.sedeId]);

  function setCodigo(empleadoId: string, codigo: CodigoAsistencia) {
    setPendientes((prev) => ({ ...prev, [empleadoId]: codigo }));
    setResultado(null);
  }

  function getCurrent(empleadoId: string): string | null {
    return pendientes[empleadoId] ?? props.marcasExistentes[empleadoId] ?? null;
  }

  const cambiosCount = Object.keys(pendientes).length;
  const capturados = props.empleados.filter((e) => getCurrent(e.id)).length;
  const pendientesEmps = props.empleados.length - capturados;

  function guardar() {
    if (!cambiosCount) return;
    const marcas = Object.entries(pendientes).map(([empleado_id, codigo]) => ({ empleado_id, codigo }));
    startTransition(async () => {
      const r = await guardarPaseListaAction({
        fecha: props.fecha,
        sede_id: props.sedeId,
        jornada: props.jornada,
        marcas,
      });
      setResultado(r);
      if (r.ok) {
        setPendientes({});
        router.refresh();
      }
    });
  }

  return (
    <>
      {/* Selectores */}
      <div className="mb-6 grid gap-3 rounded-xl border border-onyx/10 bg-cream-50 p-4 sm:grid-cols-3 sm:gap-4 sm:p-5">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-tagline text-onyx/55">Sede</span>
          <select
            value={props.sedeId}
            onChange={(e) => updateUrl({ sede: e.target.value, jornada: "" })}
            className="w-full rounded-md border border-onyx/15 bg-white px-3 py-2 font-mono text-sm text-onyx focus:border-gold-500 focus:outline-none"
          >
            {sedesUnicas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.abrev} · {s.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-tagline text-onyx/55">Jornada</span>
          <select
            value={props.jornada}
            onChange={(e) => updateUrl({ jornada: e.target.value })}
            className="w-full rounded-md border border-onyx/15 bg-white px-3 py-2 font-mono text-sm text-onyx focus:border-gold-500 focus:outline-none"
          >
            {jornadasDeSede.length ? (
              jornadasDeSede.map((j) => <option key={j} value={j}>{j}</option>)
            ) : (
              ["MATUTINO", "VESPERTINO", "NOCTURNO"].map((j) => <option key={j} value={j}>{j}</option>)
            )}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-tagline text-onyx/55">Fecha</span>
          <input
            type="date"
            value={props.fecha}
            onChange={(e) => updateUrl({ fecha: e.target.value })}
            className="w-full rounded-md border border-onyx/15 bg-white px-3 py-2 font-mono text-sm text-onyx focus:border-gold-500 focus:outline-none"
          />
        </label>
      </div>

      {/* Contador */}
      <div className="mb-4 flex items-center justify-between text-xs">
        <p className="text-onyx/60">
          <span className="font-bold text-onyx">{capturados}</span>/{props.empleados.length} capturados ·{" "}
          <span className="font-bold text-onyx">{pendientesEmps}</span> pendientes
          {cambiosCount > 0 && (
            <>
              {" · "}
              <span className="font-bold text-gold-700">{cambiosCount}</span> sin guardar
            </>
          )}
        </p>
      </div>

      {/* Lista */}
      {!props.empleados.length ? (
        <div className="rounded-xl border border-dashed border-onyx/15 bg-cream-50 p-10 text-center text-sm text-onyx/55">
          No hay empleados activos para esta combinación sede × jornada.
        </div>
      ) : (
        <ul className="space-y-2">
          {props.empleados.map((emp) => {
            const current = getCurrent(emp.id);
            const isPending = !!pendientes[emp.id];
            return (
              <li
                key={emp.id}
                className={`rounded-xl border bg-cream-50 p-3 transition sm:p-4 ${
                  isPending ? "border-gold-300 ring-1 ring-gold-100" : "border-onyx/10"
                }`}
              >
                <div className="mb-2 flex items-baseline gap-3">
                  <span className="font-mono text-[10px] text-onyx/40 sm:text-xs">#{emp.numero_empleado}</span>
                  <p className="flex-1 text-sm font-medium text-onyx sm:text-base">{emp.nombre}</p>
                  {current && (
                    <span
                      className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold text-white"
                      style={{ backgroundColor: CODIGO_SPEC[current as CodigoAsistencia]?.color || "#888780" }}
                    >
                      {current}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CODIGOS.filter((c) => c !== "SN").map((cod) => {
                    const spec = CODIGO_SPEC[cod];
                    const active = current === cod;
                    return (
                      <button
                        key={cod}
                        type="button"
                        disabled={!props.canEdit}
                        onClick={() => setCodigo(emp.id, cod)}
                        title={spec.nombre}
                        className={`min-w-[44px] rounded-md px-2.5 py-2 font-mono text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          active
                            ? "text-white shadow-sm"
                            : "border border-onyx/15 bg-white text-onyx/70 hover:border-onyx/30 hover:bg-cream-100"
                        }`}
                        style={active ? { backgroundColor: spec.color } : undefined}
                      >
                        {cod}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Save bar */}
      {props.empleados.length > 0 && (
        <div className="sticky bottom-0 mt-6 -mx-4 border-t border-onyx/15 bg-cream/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="text-xs">
              {resultado && resultado.ok && (
                <span className="text-emerald-700">
                  ✓ {resultado.saved} marca{resultado.saved === 1 ? "" : "s"} guardada{resultado.saved === 1 ? "" : "s"}
                </span>
              )}
              {resultado && !resultado.ok && <span className="text-red-700">⚠ {resultado.error}</span>}
              {!resultado && cambiosCount > 0 && (
                <span className="text-onyx/60">
                  {cambiosCount} cambio{cambiosCount === 1 ? "" : "s"} pendiente{cambiosCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={guardar}
              disabled={!props.canEdit || !cambiosCount || isPending}
              className="rounded-lg bg-onyx px-6 py-2.5 text-xs font-semibold uppercase tracking-tagline text-cream transition hover:bg-onyx-900 disabled:opacity-40"
            >
              {isPending ? "Guardando..." : `Guardar ${cambiosCount || ""}`.trim()}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
