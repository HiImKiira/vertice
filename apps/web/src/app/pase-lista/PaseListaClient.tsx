"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CODIGO_SPEC, CODIGOS, type CodigoAsistencia } from "@vertice/shared/codes";
import { guardarPaseListaAction, type GuardarResult } from "./actions";

export interface SedeShape {
  id: string;
  codigo: string;
  abrev: string;
  nombre: string;
}

export interface Asignacion {
  sede: SedeShape;
  jornadas: string[];
}

export interface Empleado {
  id: string;
  numero_empleado: string;
  nombre: string;
  jornada: string;
}

interface Props {
  fecha: string;
  sedeId: string;
  jornada: string;
  asignaciones: Asignacion[];
  empleados: Empleado[];
  marcasExistentes: Record<string, string>;
  marcasAnteriores: Record<string, string>;
  canEdit: boolean;
  graceMsg: string;
  isAdmin: boolean;
}

const MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function formatLongDate(iso: string): { dia: number; nombreDia: string; mesAnio: string } {
  const parts = iso.split("-");
  const d = new Date(Number(parts[0]!), Number(parts[1]!) - 1, Number(parts[2]!));
  return {
    dia: d.getDate(),
    nombreDia: DIAS_ES[d.getDay()]!,
    mesAnio: `${MESES_ES[d.getMonth()]} ${d.getFullYear()}`,
  };
}

function classifyCode(cod: string | null | undefined): "asist" | "falta" | "incid" | "pend" {
  if (!cod) return "pend";
  if (cod === "A" || cod === "AF" || cod === "DT") return "asist";
  if (cod === "F") return "falta";
  if (cod === "SN") return "pend";
  return "incid";
}

export function PaseListaClient(props: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pendientes, setPendientes] = useState<Record<string, CodigoAsistencia>>({});
  const [resultado, setResultado] = useState<GuardarResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [bulkCode, setBulkCode] = useState<CodigoAsistencia>("A");
  const [bulkIDs, setBulkIDs] = useState<string>("");
  const [showReview, setShowReview] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  const fechaInfo = formatLongDate(props.fecha);

  function updateUrl(next: { sede?: string; jornada?: string; fecha?: string }) {
    const usp = new URLSearchParams(params.toString());
    if (next.sede !== undefined) usp.set("sede", next.sede);
    if (next.jornada !== undefined) usp.set("jornada", next.jornada);
    if (next.fecha !== undefined) usp.set("fecha", next.fecha);
    router.push(`/pase-lista?${usp.toString()}`);
  }

  function getCurrent(id: string): CodigoAsistencia | null {
    return (pendientes[id] ?? (props.marcasExistentes[id] as CodigoAsistencia | undefined) ?? null);
  }

  function setOne(id: string, codigo: CodigoAsistencia) {
    setPendientes((p) => ({ ...p, [id]: codigo }));
    setResultado(null);
  }

  // === Quick actions ===
  function todosComo(codigo: CodigoAsistencia) {
    const newPendientes: Record<string, CodigoAsistencia> = { ...pendientes };
    for (const emp of props.empleados) {
      newPendientes[emp.id] = codigo;
    }
    setPendientes(newPendientes);
    setResultado(null);
  }

  function pendientesComoA() {
    const newPendientes: Record<string, CodigoAsistencia> = { ...pendientes };
    let n = 0;
    for (const emp of props.empleados) {
      const current = newPendientes[emp.id] ?? props.marcasExistentes[emp.id];
      if (!current) {
        newPendientes[emp.id] = "A";
        n++;
      }
    }
    setPendientes(newPendientes);
    setResultado(null);
    setBulkFeedback(`${n} empleado${n === 1 ? "" : "s"} pendiente${n === 1 ? "" : "s"} marcados como A.`);
  }

  function copiarPaseAnterior() {
    const newPendientes: Record<string, CodigoAsistencia> = { ...pendientes };
    let n = 0;
    for (const emp of props.empleados) {
      const ayer = props.marcasAnteriores[emp.id];
      if (ayer && CODIGOS.includes(ayer as CodigoAsistencia)) {
        newPendientes[emp.id] = ayer as CodigoAsistencia;
        n++;
      }
    }
    setPendientes(newPendientes);
    setResultado(null);
    setBulkFeedback(`${n} marca${n === 1 ? "" : "s"} copiada${n === 1 ? "" : "s"} del día anterior.`);
  }

  function aplicarBulkIDs() {
    const tokens = bulkIDs.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!tokens.length) {
      setBulkFeedback("Escribe IDs separados por coma o espacio.");
      return;
    }
    const byNum = new Map(props.empleados.map((e) => [e.numero_empleado, e]));
    const newPendientes: Record<string, CodigoAsistencia> = { ...pendientes };
    let aplicados = 0;
    const noEncontrados: string[] = [];
    for (const t of tokens) {
      const emp = byNum.get(t);
      if (emp) {
        newPendientes[emp.id] = bulkCode;
        aplicados++;
      } else {
        noEncontrados.push(t);
      }
    }
    setPendientes(newPendientes);
    setBulkIDs("");
    setResultado(null);
    const msg = `${aplicados} aplicado${aplicados === 1 ? "" : "s"} como ${bulkCode}`;
    setBulkFeedback(noEncontrados.length ? `${msg}. No encontrados: ${noEncontrados.join(", ")}` : msg);
  }

  // === Stats ===
  const stats = useMemo(() => {
    let asist = 0, falta = 0, incid = 0, pend = 0;
    for (const emp of props.empleados) {
      const cls = classifyCode(getCurrent(emp.id));
      if (cls === "asist") asist++;
      else if (cls === "falta") falta++;
      else if (cls === "incid") incid++;
      else pend++;
    }
    return { asist, falta, incid, pend, total: props.empleados.length };
  }, [props.empleados, pendientes, props.marcasExistentes]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiosCount = Object.keys(pendientes).length;

  function commitGuardar() {
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
        setShowReview(false);
        router.refresh();
      }
    });
  }

  const sedeActual = props.asignaciones.find((a) => a.sede.id === props.sedeId)?.sede;
  const jornadasDeSede = props.asignaciones.find((a) => a.sede.id === props.sedeId)?.jornadas ?? [];

  return (
    <>
      {/* ============ HERO HEADER ============ */}
      <section className="mb-6 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-6xl text-gradient-gold sm:text-7xl">{fechaInfo.dia}</span>
          <div>
            <p className="font-serif text-xl capitalize sm:text-2xl">{fechaInfo.nombreDia}</p>
            <p className="text-xs uppercase tracking-tagline text-muted">{fechaInfo.mesAnio}</p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <p className="text-[10px] font-semibold uppercase tracking-ultra text-gold-200">
            Supervisor Pro · Pase de lista
          </p>
          <h1 className="font-serif text-3xl leading-none sm:text-4xl">
            {sedeActual?.abrev ?? "—"} <span className="text-gradient-gold serif-italic">·</span>{" "}
            <span className="text-gradient-gold">{props.jornada}</span>
          </h1>
          <p className="max-w-md text-xs text-muted sm:text-right">
            {sedeActual?.nombre ?? "Sin sede seleccionada"} · {stats.total} empleado{stats.total === 1 ? "" : "s"}
          </p>
        </div>
      </section>

      {/* ============ Ventana de gracia banner ============ */}
      {props.graceMsg && (
        <div className={`mb-5 flex items-center gap-3 rounded-xl border px-4 py-2.5 text-xs ${
          props.canEdit
            ? "border-amber-400/30 bg-amber-400/[0.06] text-amber-200"
            : "border-red-400/40 bg-red-500/[0.08] text-red-300"
        }`}>
          <span className="text-lg">{props.canEdit ? "⏳" : "⚠"}</span>
          <p>
            {props.canEdit ? "Período de gracia hasta " : ""}
            <span className="font-mono">{props.graceMsg}</span>
          </p>
        </div>
      )}

      {/* ============ STATS RINGS ============ */}
      <section className="mb-6 grid grid-cols-4 gap-2 sm:gap-3">
        <StatRing label="Asist." value={stats.asist} total={stats.total} color="#22c55e" />
        <StatRing label="Faltas" value={stats.falta} total={stats.total} color="#ef4444" />
        <StatRing label="Incid." value={stats.incid} total={stats.total} color="#f59e0b" />
        <StatRing label="Pend." value={stats.pend} total={stats.total} color="#60a5fa" />
      </section>

      {/* ============ Selectores ============ */}
      <section className="mb-6 grid gap-3 surface-glow rounded-2xl p-4 sm:grid-cols-3 sm:p-5">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-tagline text-muted">Sede</span>
          <select
            value={props.sedeId}
            onChange={(e) => updateUrl({ sede: e.target.value, jornada: "" })}
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-text focus:border-blue-400 focus:outline-none"
          >
            {props.asignaciones.map((a) => (
              <option key={a.sede.id} value={a.sede.id} className="bg-[color:var(--surface)]">
                {a.sede.abrev} · {a.sede.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-tagline text-muted">Jornada</span>
          <select
            value={props.jornada}
            onChange={(e) => updateUrl({ jornada: e.target.value })}
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-text focus:border-blue-400 focus:outline-none"
          >
            {(jornadasDeSede.length ? jornadasDeSede : ["MATUTINO", "VESPERTINO", "NOCTURNO"]).map((j) => (
              <option key={j} value={j} className="bg-[color:var(--surface)]">{j}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-tagline text-muted">Fecha</span>
          <input
            type="date"
            value={props.fecha}
            onChange={(e) => updateUrl({ fecha: e.target.value })}
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-text focus:border-blue-400 focus:outline-none"
          />
        </label>
      </section>

      {/* ============ CAPTURA POR ID + QUICK ACTIONS ============ */}
      {props.empleados.length > 0 && (
        <section className="mb-6 surface-glow rounded-2xl p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-lg italic">
              <span className="text-gradient-gold">Captura por ID</span>
            </h2>
            <span className="font-mono text-[10px] text-muted-2">Bulk-mode estilo legacy</span>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {CODIGOS.filter((c) => c !== "SN").map((cod) => {
              const active = bulkCode === cod;
              const spec = CODIGO_SPEC[cod];
              return (
                <button
                  key={cod}
                  type="button"
                  onClick={() => setBulkCode(cod)}
                  className={`chip-code ${active ? "chip-code-active" : ""}`}
                  style={active ? { background: spec.color } : undefined}
                  title={spec.nombre}
                >
                  {cod}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <input
              type="text"
              value={bulkIDs}
              onChange={(e) => setBulkIDs(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  aplicarBulkIDs();
                }
              }}
              placeholder="Ej: 92, 45, 21 o uno por uno..."
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 font-mono text-sm text-text placeholder:text-muted-2 focus:border-blue-400 focus:outline-none"
              disabled={!props.canEdit}
            />
            <button
              type="button"
              onClick={aplicarBulkIDs}
              disabled={!props.canEdit || !bulkIDs.trim()}
              className="rounded-lg bg-emerald-500/20 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-40"
            >
              ✓ Aplicar
            </button>
            <button
              type="button"
              onClick={() => setBulkIDs("")}
              className="rounded-lg bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
            >
              ✕
            </button>
          </div>
          {bulkFeedback && (
            <p className="mt-2 rounded-md border border-blue-400/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-200">
              {bulkFeedback}
            </p>
          )}

          {/* Quick actions */}
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <QuickAction
              icon="↺"
              title="Copiar pase anterior"
              hint="Rellena desde la última jornada"
              onClick={copiarPaseAnterior}
              disabled={!props.canEdit}
            />
            <QuickAction
              icon="✓"
              title="Pendientes como A"
              hint="Solo los no marcados"
              onClick={pendientesComoA}
              disabled={!props.canEdit}
            />
            <QuickAction
              icon="•"
              title="Todos A"
              hint="Marca a todos como Asistencia"
              onClick={() => todosComo("A")}
              disabled={!props.canEdit}
            />
          </div>
        </section>
      )}

      {/* ============ LISTA DE EMPLEADOS ============ */}
      {!props.empleados.length ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[color:var(--surface)]/40 p-10 text-center text-sm text-muted">
          No hay empleados activos para esta combinación sede × jornada.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {props.empleados.map((emp) => {
            const current = getCurrent(emp.id);
            const isPendingChange = !!pendientes[emp.id];
            const spec = current ? CODIGO_SPEC[current] : null;
            return (
              <li
                key={emp.id}
                className={`flex items-center gap-3 rounded-xl border bg-[color:var(--surface)]/60 px-3 py-2.5 transition sm:px-4 sm:py-3 ${
                  isPendingChange ? "border-blue-400/40 ring-1 ring-blue-400/20" : "border-white/5"
                }`}
              >
                <span className="font-mono text-[10px] text-muted-2 sm:text-xs">#{emp.numero_empleado}</span>
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-text sm:text-base">{emp.nombre}</p>
                {current ? (
                  <span
                    className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-white"
                    style={{ background: spec?.color }}
                    title={spec?.nombre}
                  >
                    {current}
                  </span>
                ) : (
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] uppercase text-muted-2">
                    Sin marcar
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ============ Save bar sticky ============ */}
      {props.empleados.length > 0 && (
        <div className="sticky bottom-0 mt-8 -mx-4 border-t border-white/10 bg-[color:var(--bg)]/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="text-xs text-muted">
              {resultado?.ok && (
                <span className="text-emerald-300">
                  ✓ {resultado.saved} marca{resultado.saved === 1 ? "" : "s"} guardada{resultado.saved === 1 ? "" : "s"}
                </span>
              )}
              {resultado && !resultado.ok && <span className="text-red-300">⚠ {resultado.error}</span>}
              {!resultado && cambiosCount > 0 && <span>{cambiosCount} cambio{cambiosCount === 1 ? "" : "s"} sin guardar</span>}
              {!resultado && !cambiosCount && <span>{stats.asist}/{stats.total} capturados</span>}
            </div>
            <button
              type="button"
              onClick={() => setShowReview(true)}
              disabled={!props.canEdit || !cambiosCount || isPending}
              className="btn-primary"
            >
              Revisar y guardar →
            </button>
          </div>
        </div>
      )}

      {/* ============ MODAL DE REVISIÓN FINAL ============ */}
      {showReview && (
        <div className="fixed inset-0 z-50 flex items-end bg-[color:var(--bg)]/70 backdrop-blur-sm sm:items-center sm:justify-center"
             onClick={() => setShowReview(false)}>
          <div
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-[color:var(--surface)] p-5 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mb-4 flex items-start justify-between">
              <div>
                <p className="pill pill-blue mb-2">Revisión final</p>
                <h2 className="font-serif text-2xl">
                  Revisar <span className="text-gradient-gold serif-italic">pase</span>
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {sedeActual?.nombre} · {props.jornada} · {props.fecha} · {cambiosCount} cambio{cambiosCount === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReview(false)}
                className="rounded-md p-1.5 text-muted-2 hover:bg-white/5"
              >
                ✕
              </button>
            </header>

            <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-2.5 text-xs text-amber-200">
              <span className="font-semibold">Una vez guardado no se puede modificar</span> (excepto SUPERADMIN). Revisa bien.
            </div>

            <ul className="mb-5 max-h-[40vh] space-y-1 overflow-y-auto rounded-xl border border-white/5 bg-[color:var(--bg)]/40 p-2 text-xs sm:text-sm">
              {Object.entries(pendientes).map(([id, cod]) => {
                const emp = props.empleados.find((e) => e.id === id);
                const spec = CODIGO_SPEC[cod];
                if (!emp) return null;
                return (
                  <li key={id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                    <span className="font-mono text-[10px] text-muted-2">#{emp.numero_empleado}</span>
                    <span className="flex-1 truncate">{emp.nombre}</span>
                    <span
                      className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold text-white"
                      style={{ background: spec.color }}
                    >
                      {cod}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReview(false)}
                className="btn-ghost"
              >
                ← Corregir
              </button>
              <button
                type="button"
                onClick={commitGuardar}
                disabled={isPending}
                className="btn-primary"
              >
                {isPending ? "Guardando..." : "💾 Guardar definitivo"}
              </button>
            </div>
            {resultado && !resultado.ok && (
              <p className="mt-3 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {resultado.error}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function StatRing({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  const circumference = 2 * Math.PI * 22;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-[color:var(--surface)]/60 p-3 sm:p-4">
      <div className="relative h-14 w-14 sm:h-16 sm:w-16">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 50 50">
          <circle cx="25" cy="25" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
          <circle
            cx="25" cy="25" r="22"
            fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-text sm:text-lg">
          {value}
        </span>
      </div>
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-tagline text-muted">{label}</p>
    </div>
  );
}

function QuickAction({ icon, title, hint, onClick, disabled }: {
  icon: string;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left transition hover:border-blue-400/30 hover:bg-blue-500/[0.06] disabled:opacity-40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-base text-blue-300">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">{title}</p>
        <p className="truncate text-[11px] text-muted">{hint}</p>
      </div>
    </button>
  );
}
