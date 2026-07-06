"use client";

import { useMemo, useState, useTransition } from "react";
import { VortexLoader } from "@/components/VortexLoader";
import { useRouter, useSearchParams } from "next/navigation";
import { CODIGO_SPEC, CODIGOS, type CodigoAsistencia } from "@vertice/shared/codes";
import { Icon } from "@/components/Icon";
import { type GuardarResult } from "./actions";
import { useOfflineSync } from "@/lib/offline-sync";
import { liberarFechaQuickAction } from "../soporte/actions";

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
  dia_descanso?: string[];
}

export interface MarcaMeta {
  nombre: string;
  username: string;
  rol: string;
  ts: string | null;
}

interface Props {
  fecha: string;
  sedeId: string;
  jornada: string;
  asignaciones: Asignacion[];
  empleados: Empleado[];
  marcasExistentes: Record<string, string>;
  marcasAnteriores: Record<string, string>;
  marcasMeta: Record<string, MarcaMeta>;
  canEdit: boolean;
  graceMsg: string;
  isAdmin: boolean;
  puedeLiberar: boolean;
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
  if (cod === "A" || cod === "AF") return "asist";
  if (cod === "F") return "falta";
  if (cod === "SN") return "pend";
  // DT (doble turno), I (incapacidad), INH, FER, PCG, PSG, DS → I (incidencia)
  return "incid";
}

const CLS_BADGE: Record<"asist" | "falta" | "incid" | "pend", { letter: string; bg: string; ring: string; text: string }> = {
  asist: { letter: "A", bg: "rgba(34,197,94,0.18)",  ring: "rgba(34,197,94,0.45)",  text: "#86EFAC" },
  falta: { letter: "F", bg: "rgba(239,68,68,0.18)",  ring: "rgba(239,68,68,0.5)",   text: "#FCA5A5" },
  incid: { letter: "I", bg: "rgba(245,158,11,0.18)", ring: "rgba(245,158,11,0.45)", text: "#FCD34D" },
  pend:  { letter: "·", bg: "rgba(255,255,255,0.03)", ring: "rgba(255,255,255,0.08)", text: "#71717a" },
};

// Colores por jornada — chip visible en cada renglón para que el supervisor
// identifique de un vistazo a qué turno pertenece cada empleado.
const JORNADA_STYLE: Record<string, { label: string; bg: string; text: string; border: string }> = {
  MATUTINO:        { label: "MAT", bg: "rgba(245,158,11,0.15)", text: "#FCD34D", border: "rgba(245,158,11,0.35)" },
  VESPERTINO:      { label: "VES", bg: "rgba(249,115,22,0.15)", text: "#FDBA74", border: "rgba(249,115,22,0.35)" },
  NOCTURNO:        { label: "NOC", bg: "rgba(139,92,246,0.18)", text: "#C4B5FD", border: "rgba(139,92,246,0.4)"  },
  TURNO_ROTATIVO:  { label: "ROT", bg: "rgba(6,182,212,0.15)",  text: "#67E8F9", border: "rgba(6,182,212,0.35)"  },
  CUBRETURNOS:     { label: "CUB", bg: "rgba(20,184,166,0.15)", text: "#5EEAD4", border: "rgba(20,184,166,0.35)" },
  DIURNO:          { label: "DIA", bg: "rgba(34,197,94,0.15)",  text: "#86EFAC", border: "rgba(34,197,94,0.35)"  },
};
function jornadaChip(j: string) {
  return JORNADA_STYLE[j] ?? { label: j.slice(0, 3), bg: "rgba(255,255,255,0.06)", text: "#94a3b8", border: "rgba(255,255,255,0.15)" };
}

export function PaseListaClient(props: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pendientes, setPendientes] = useState<Record<string, CodigoAsistencia>>({});
  const [resultado, setResultado] = useState<GuardarResult | null>(null);
  const [isPending, startTransition] = useTransition();
  // Estados granulares de pending para feedback por acción
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [bulkCode, setBulkCode] = useState<CodigoAsistencia>("A");
  const [bulkIDs, setBulkIDs] = useState<string>("");
  const [showReview, setShowReview] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  // Hook offline: maneja sin red guardando en IndexedDB y syncing automático
  const offline = useOfflineSync();

  function setMarca(empId: string, codigo: CodigoAsistencia) {
    if (!props.canEdit) return;
    setPendientes((p) => ({ ...p, [empId]: codigo }));
    setResultado(null);
  }

  const fechaInfo = formatLongDate(props.fecha);

  // Día de la semana de la fecha actual → código LUN/MAR/MIE/... para
  // matchear contra empleado.dia_descanso. La fecha viene como YYYY-MM-DD
  // (Mérida), construimos Date local sin TZ shift.
  const DOW_CODES = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"];
  const fechaDOW = (() => {
    const parts = props.fecha.split("-");
    const d = new Date(Number(parts[0]!), Number(parts[1]!) - 1, Number(parts[2]!));
    return DOW_CODES[d.getDay()]!;
  })();

  // Empleados que deben tener DS hoy (su dia_descanso incluye fechaDOW)
  // Y que NO tienen ya una marca capturada — para no pisar lo que ya existe.
  const descansoHoy = useMemo(() => {
    const set = new Set<string>();
    for (const emp of props.empleados) {
      if (props.marcasExistentes[emp.id]) continue; // ya tiene marca: respeto
      if (emp.dia_descanso?.includes(fechaDOW)) set.add(emp.id);
    }
    return set;
  }, [props.empleados, props.marcasExistentes, fechaDOW]);

  // NOTA: el descanso semanal NO se auto-marca. Se muestra como *sugerencia*
  // (DS en gris punteado) y el supervisor decide colocarlo con un toque. Así
  // el descanso solo queda guardado si él lo confirma — no se marca solo.
  // ¿Está sugerido (descanso del día, aún sin confirmar por el supervisor)?
  function isSugerido(id: string): boolean {
    return descansoHoy.has(id) && !pendientes[id];
  }

  function updateUrl(next: { sede?: string; jornada?: string; fecha?: string }) {
    if (isPending || busyAction) return;
    const usp = new URLSearchParams(params.toString());
    if (next.sede !== undefined) usp.set("sede", next.sede);
    if (next.jornada !== undefined) usp.set("jornada", next.jornada);
    if (next.fecha !== undefined) usp.set("fecha", next.fecha);
    setBusyAction("nav");
    router.push(`/pase-lista?${usp.toString()}`);
    // Liberamos al siguiente tick (Next maneja navegación)
    setTimeout(() => setBusyAction(null), 800);
  }

  function getCurrent(id: string): CodigoAsistencia | null {
    // Prioridad: pendiente del usuario > marca ya en DB > sugerencia DS por descanso semanal
    if (pendientes[id]) return pendientes[id]!;
    const enDb = props.marcasExistentes[id];
    if (enDb) return enDb as CodigoAsistencia;
    if (descansoHoy.has(id)) return "DS";
    return null;
  }

  // === Quick actions con feedback ===
  function todosComo(codigo: CodigoAsistencia) {
    if (!props.canEdit) return;
    const cuantos = props.empleados.length;
    if (!confirm(`¿Marcar a los ${cuantos} empleados como ${codigo}? Después puedes ajustar individualmente.`)) return;
    const newPendientes: Record<string, CodigoAsistencia> = { ...pendientes };
    for (const emp of props.empleados) newPendientes[emp.id] = codigo;
    setPendientes(newPendientes);
    setResultado(null);
    setBulkFeedback(`${cuantos} marcados como ${codigo}.`);
  }

  function pendientesComoA() {
    if (!props.canEdit) return;
    const newPendientes: Record<string, CodigoAsistencia> = { ...pendientes };
    let n = 0;
    for (const emp of props.empleados) {
      // No pisamos un descanso sugerido: el supervisor decide si lo coloca.
      if (isSugerido(emp.id)) continue;
      const current = newPendientes[emp.id] ?? props.marcasExistentes[emp.id];
      if (!current) {
        newPendientes[emp.id] = "A";
        n++;
      }
    }
    if (n === 0) {
      setBulkFeedback("No hay empleados pendientes.");
      return;
    }
    setPendientes(newPendientes);
    setResultado(null);
    setBulkFeedback(`${n} pendiente${n === 1 ? "" : "s"} → A.`);
  }

  function copiarPaseAnterior() {
    if (!props.canEdit) return;
    const newPendientes: Record<string, CodigoAsistencia> = { ...pendientes };
    let n = 0;
    for (const emp of props.empleados) {
      const ayer = props.marcasAnteriores[emp.id];
      if (ayer && CODIGOS.includes(ayer as CodigoAsistencia)) {
        newPendientes[emp.id] = ayer as CodigoAsistencia;
        n++;
      }
    }
    if (n === 0) {
      setBulkFeedback("Sin marcas del día anterior para copiar.");
      return;
    }
    setPendientes(newPendientes);
    setResultado(null);
    setBulkFeedback(`${n} copiada${n === 1 ? "" : "s"} del día anterior.`);
  }

  function aplicarBulkIDs() {
    if (!props.canEdit) return;
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
      // Un descanso solo sugerido (aún sin confirmar) cuenta como pendiente.
      if (isSugerido(emp.id)) { pend++; continue; }
      const cls = classifyCode(getCurrent(emp.id));
      if (cls === "asist") asist++;
      else if (cls === "falta") falta++;
      else if (cls === "incid") incid++;
      else pend++;
    }
    return { asist, falta, incid, pend, total: props.empleados.length };
  }, [props.empleados, pendientes, props.marcasExistentes]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiosCount = Object.keys(pendientes).length;
  const operacionEnCurso = isPending || busyAction !== null;

  function commitGuardar() {
    if (!cambiosCount || operacionEnCurso) return;
    const marcas = Object.entries(pendientes).map(([empleado_id, codigo]) => ({ empleado_id, codigo }));
    setBusyAction("save");
    startTransition(async () => {
      const r = await offline.guardar({
        fecha: props.fecha,
        sedeId: props.sedeId,
        jornada: props.jornada,
        marcas,
      });
      // Si fue offline, mostramos mensaje específico
      if (r.ok && (r as { offline?: boolean }).offline) {
        setResultado({
          ok: true,
          saved: r.saved,
          skipped: r.skipped,
          mensaje: "Sin red — guardado local. Se sincronizará al volver online.",
        } as GuardarResult);
      } else {
        setResultado(r);
      }
      setBusyAction(null);
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
    <div className="overflow-x-hidden">
      {/* ============ HERO HEADER ============ */}
      <section className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="font-serif text-5xl leading-none text-gradient-blue sm:text-7xl">{fechaInfo.dia}</span>
          <div className="min-w-0">
            <p className="font-serif text-lg capitalize leading-tight sm:text-2xl">{fechaInfo.nombreDia}</p>
            <p className="text-[10px] uppercase tracking-tagline text-muted sm:text-xs">{fechaInfo.mesAnio}</p>
          </div>
        </div>
        <div className="min-w-0 sm:text-right">
          <p className="text-[9px] font-semibold uppercase tracking-ultra text-[#67E8F9] sm:text-[10px]">
            Supervisor Pro
          </p>
          <h1 className="truncate font-serif text-2xl leading-none sm:text-3xl">
            {sedeActual?.abrev ?? "—"}
            <span className="mx-1 text-gradient-blue serif-italic">·</span>
            <span className="text-gradient-blue">
              {props.jornada === "ALL" ? "Todos mis turnos" : props.jornada}
            </span>
          </h1>
          <p className="mt-1 truncate text-[11px] text-muted sm:text-xs">
            {sedeActual?.nombre ?? "—"} · {stats.total} empleado{stats.total === 1 ? "" : "s"}
            {props.jornada === "ALL" && jornadasDeSede.length > 1 && <> (todos tus turnos)</>}
          </p>
          {/* Filtro de jornada — chips de jornadas asignadas + "Todas mis" */}
          {jornadasDeSede.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1 sm:justify-end">
              <span className="text-[9px] uppercase tracking-tagline text-muted-2">
                Tus turnos ({jornadasDeSede.length}):
              </span>
              {/* Chip "Todas mis jornadas" — solo aparece si tiene más de 1 */}
              {jornadasDeSede.length > 1 && (
                <button
                  type="button"
                  onClick={() => updateUrl({ jornada: "ALL" })}
                  disabled={operacionEnCurso}
                  className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold transition disabled:opacity-50 ${
                    props.jornada === "ALL"
                      ? "bg-blue-500/80 text-white ring-2 ring-blue-400/60 ring-offset-1 ring-offset-[color:var(--bg)]"
                      : "border border-blue-400/30 bg-blue-500/10 text-blue-200 opacity-70 hover:opacity-100"
                  }`}
                  title="Ver empleados de todas mis jornadas"
                >
                  TODAS
                </button>
              )}
              {jornadasDeSede.map((j) => {
                const style = jornadaChip(j);
                const isActive = j === props.jornada;
                return (
                  <button
                    key={j}
                    type="button"
                    onClick={() => updateUrl({ jornada: j })}
                    disabled={operacionEnCurso}
                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold transition disabled:opacity-50 ${
                      isActive ? "ring-2 ring-blue-400/60 ring-offset-1 ring-offset-[color:var(--bg)]" : "opacity-60 hover:opacity-100"
                    }`}
                    style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}
                    title={isActive ? `Filtrando por ${j}` : `Ver solo ${j}`}
                  >
                    {style.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ============ Ventana de gracia banner ============ */}
      {props.graceMsg && (
        <div className={`mb-4 flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] sm:gap-3 sm:px-4 sm:py-2.5 sm:text-xs ${
          props.canEdit
            ? "border-amber-400/30 bg-amber-400/[0.06] text-amber-200"
            : "border-red-400/40 bg-red-500/[0.08] text-red-300"
        }`}>
          <Icon name={props.canEdit ? "clock" : "alert-triangle"} size={18} className="shrink-0 mt-0.5" />
          <p className="min-w-0 flex-1 break-words">
            {props.canEdit ? "Período de gracia hasta " : ""}
            <span className="font-mono">{props.graceMsg}</span>
          </p>
          {props.puedeLiberar && !props.canEdit && (
            <button
              type="button"
              onClick={() => {
                if (!confirm(`¿Liberar ${props.fecha} por 6 horas? Pasado ese tiempo se bloquea de nuevo.`)) return;
                setBusyAction("liberar");
                startTransition(async () => {
                  const r = await liberarFechaQuickAction(props.fecha, 6);
                  setBusyAction(null);
                  if (!r.ok) alert(`Error: ${r.error}`);
                  else router.refresh();
                });
              }}
              disabled={operacionEnCurso}
              className="shrink-0 inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-200 transition hover:bg-amber-500/30 disabled:opacity-40"
              title="Solo SUPERADMIN/SOPORTE: libera esta fecha 6h"
            >
              <Icon name="lock-open" size={12} /> Liberar 6h
            </button>
          )}
        </div>
      )}

      {/* Botón master para SUPERADMIN/SOPORTE — siempre visible */}
      {props.puedeLiberar && props.canEdit && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.04] px-3 py-2 text-[11px] text-emerald-200 sm:text-xs">
          <Icon name="life-buoy" size={16} className="shrink-0" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Recursos Humanos · </span>
            Captura libre activa. Para que otros supervisores capturen{" "}
            <span className="font-mono">{props.fecha}</span>:
          </p>
          <button
            type="button"
            onClick={() => {
              if (!confirm(`¿Liberar ${props.fecha} por 6 horas para todos los supervisores?`)) return;
              setBusyAction("liberar");
              startTransition(async () => {
                const r = await liberarFechaQuickAction(props.fecha, 6);
                setBusyAction(null);
                if (!r.ok) alert(`Error: ${r.error}`);
                else { setBulkFeedback("Fecha liberada 6h."); router.refresh(); }
              });
            }}
            disabled={operacionEnCurso}
            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-200 transition hover:bg-emerald-500/30 disabled:opacity-40"
          >
            <Icon name="lock-open" size={12} /> Liberar 6h
          </button>
        </div>
      )}

      {/* ============ STATS RINGS (2x2 mobile, 4x1 desktop) ============ */}
      <section className="mb-5 grid grid-cols-2 gap-2 sm:mb-6 sm:grid-cols-4 sm:gap-3">
        <StatRing label="Asist." value={stats.asist} total={stats.total} color="#22c55e" />
        <StatRing label="Faltas" value={stats.falta} total={stats.total} color="#ef4444" />
        <StatRing label="Incid." value={stats.incid} total={stats.total} color="#f59e0b" />
        <StatRing label="Pend." value={stats.pend} total={stats.total} color="#60a5fa" />
      </section>

      {/* ============ Selectores ============ */}
      <section className="mb-5 surface-glow rounded-2xl p-3 sm:mb-6 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-tagline text-muted">Sede</span>
            <select
              value={props.sedeId}
              onChange={(e) => updateUrl({ sede: e.target.value, jornada: "" })}
              disabled={operacionEnCurso}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-text focus:border-blue-400 focus:outline-none disabled:opacity-50"
            >
              {props.asignaciones.map((a) => (
                <option key={a.sede.id} value={a.sede.id} className="bg-[color:var(--surface)]">
                  {a.sede.abrev} · {a.sede.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-tagline text-muted">Jornada</span>
            <select
              value={props.jornada}
              onChange={(e) => updateUrl({ jornada: e.target.value })}
              disabled={operacionEnCurso}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-text focus:border-blue-400 focus:outline-none disabled:opacity-50"
            >
              {jornadasDeSede.length > 1 && (
                <option value="ALL" className="bg-[color:var(--surface)]">
                  Todas mis jornadas ({jornadasDeSede.length})
                </option>
              )}
              {(jornadasDeSede.length ? jornadasDeSede : ["MATUTINO", "VESPERTINO", "NOCTURNO"]).map((j) => (
                <option key={j} value={j} className="bg-[color:var(--surface)]">{j}</option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-tagline text-muted">Fecha</span>
            <input
              type="date"
              value={props.fecha}
              onChange={(e) => updateUrl({ fecha: e.target.value })}
              disabled={operacionEnCurso}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-text focus:border-blue-400 focus:outline-none disabled:opacity-50"
            />
          </label>
        </div>
      </section>

      {/* ============ CAPTURA POR ID + QUICK ACTIONS ============ */}
      {props.empleados.length > 0 && (
        <section className="mb-5 surface-glow rounded-2xl p-3 sm:mb-6 sm:p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-base italic sm:text-lg">
              <span className="text-gradient-cyan">Captura por ID</span>
            </h2>
            <span className="font-mono text-[10px] text-muted-2">Bulk-mode</span>
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {CODIGOS.filter((c) => c !== "SN").map((cod) => {
              const active = bulkCode === cod;
              const spec = CODIGO_SPEC[cod];
              return (
                <button
                  key={cod}
                  type="button"
                  onClick={() => !operacionEnCurso && setBulkCode(cod)}
                  disabled={operacionEnCurso}
                  className={`chip-code ${active ? "chip-code-active" : ""} disabled:opacity-40`}
                  style={active ? { background: spec.color } : undefined}
                  title={spec.nombre}
                >
                  {cod}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
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
              placeholder="Ej: 92, 45, 21..."
              className="min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 font-mono text-sm text-text placeholder:text-muted-2 focus:border-blue-400 focus:outline-none disabled:opacity-50"
              disabled={!props.canEdit || operacionEnCurso}
              inputMode="text"
              pattern="[0-9, ]*"
              autoComplete="off"
            />
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (!props.canEdit || operacionEnCurso) return;
                  setBulkIDs((s) => (s.trim().endsWith(",") || !s.trim() ? s : s + ", "));
                }}
                disabled={!props.canEdit || operacionEnCurso || !bulkIDs.trim()}
                className="rounded-lg bg-blue-500/15 px-3 py-2.5 font-mono text-sm font-bold text-blue-300 transition hover:bg-blue-500/30 disabled:opacity-40"
                title="Agregar coma separadora"
              >
                ,
              </button>
              <button
                type="button"
                onClick={aplicarBulkIDs}
                disabled={!props.canEdit || !bulkIDs.trim() || operacionEnCurso}
                className="rounded-lg bg-emerald-500/20 px-3 py-2.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-40 sm:px-4 sm:text-sm"
              >
                ✓
              </button>
              <button
                type="button"
                onClick={() => setBulkIDs("")}
                disabled={operacionEnCurso}
                className="rounded-lg bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Numpad on-screen — funciona consistente en móvil/PC/tablet */}
          <div className="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-12">
            {["1","2","3","4","5","6","7","8","9","0",",","⌫"].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  if (!props.canEdit || operacionEnCurso) return;
                  if (k === "⌫") {
                    setBulkIDs((s) => s.slice(0, -1));
                  } else if (k === ",") {
                    setBulkIDs((s) => (s.trim().endsWith(",") || !s.trim() ? s : s + ", "));
                  } else {
                    setBulkIDs((s) => s + k);
                  }
                }}
                disabled={!props.canEdit || operacionEnCurso}
                className={`rounded-lg border py-2.5 font-mono text-sm font-bold transition disabled:opacity-40 ${
                  k === ","
                    ? "border-blue-400/30 bg-blue-500/10 text-blue-200 hover:bg-blue-500/25"
                    : k === "⌫"
                      ? "border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/25"
                      : "border-white/10 bg-white/[0.03] text-text hover:border-white/30 hover:bg-white/[0.08]"
                }`}
                aria-label={k === "⌫" ? "Borrar último" : k === "," ? "Coma separadora" : `Tecla ${k}`}
              >
                {k}
              </button>
            ))}
          </div>

          {bulkFeedback && (
            <p className="mt-2 break-words rounded-md border border-blue-400/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-200">
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
              disabled={!props.canEdit || operacionEnCurso}
            />
            <QuickAction
              icon="✓"
              title="Pendientes como A"
              hint="Solo los no marcados"
              onClick={pendientesComoA}
              disabled={!props.canEdit || operacionEnCurso}
            />
            <QuickAction
              icon="•"
              title="Todos A"
              hint="Marca a todos como Asistencia"
              onClick={() => todosComo("A")}
              disabled={!props.canEdit || operacionEnCurso}
            />
          </div>
        </section>
      )}

      {/* ============ LISTA DE EMPLEADOS ============ */}
      {!props.empleados.length ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[color:var(--surface)]/40 p-8 text-center text-sm text-muted">
          No hay empleados activos para esta combinación sede × jornada.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {props.empleados.map((emp) => {
            const current = getCurrent(emp.id);
            const isPendingChange = !!pendientes[emp.id];
            const sugerido = isSugerido(emp.id); // descanso del día aún sin confirmar
            const spec = current ? CODIGO_SPEC[current] : null;
            const cls = classifyCode(current);
            const badge = CLS_BADGE[cls];
            const isExpanded = expandedRow === emp.id;
            const meta = !isPendingChange ? props.marcasMeta[emp.id] : undefined;
            // Inmutabilidad: si ya hay marca guardada y el usuario NO es admin-like,
            // bloqueamos los botones. Solo RH puede sobrescribir.
            const yaCapturada = !!meta && !isPendingChange;
            const noPuedeModificar = yaCapturada && !props.isAdmin;
            const disabledRow = !props.canEdit || operacionEnCurso || noPuedeModificar;
            return (
              <li
                key={emp.id}
                className={`min-w-0 rounded-xl border bg-[color:var(--surface)]/60 transition ${
                  isPendingChange ? "border-blue-400/40 ring-1 ring-blue-400/20" : "border-white/5"
                }`}
              >
                <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
                  <span className="shrink-0 font-mono text-[10px] text-muted-2 sm:text-xs">#{emp.numero_empleado}</span>
                  {sugerido ? (
                    <span
                      className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-emerald-400/40 font-mono text-[9px] font-bold text-emerald-300/70 sm:h-8 sm:w-8 sm:text-[10px]"
                      title="Descanso sugerido — sin confirmar"
                    >
                      DS
                    </span>
                  ) : (
                    <span
                      className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs font-bold sm:h-8 sm:w-8 sm:text-sm"
                      style={{ background: badge.bg, boxShadow: `inset 0 0 0 1px ${badge.ring}`, color: badge.text }}
                      title={cls === "asist" ? "Asistencia" : cls === "falta" ? "Falta" : cls === "incid" ? `Incidencia${spec ? ` (${spec.nombre})` : ""}` : "Sin marcar"}
                    >
                      {badge.letter}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="min-w-0 truncate text-sm font-medium text-text sm:text-base">{emp.nombre}</p>
                      {(() => {
                        const j = jornadaChip(emp.jornada);
                        return (
                          <span
                            className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold"
                            style={{ background: j.bg, color: j.text, border: `1px solid ${j.border}` }}
                            title={emp.jornada}
                          >
                            {j.label}
                          </span>
                        );
                      })()}
                    </div>
                    {current === "DS" && (
                      sugerido ? (
                        <button
                          type="button"
                          onClick={() => setMarca(emp.id, "DS")}
                          disabled={disabledRow}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300/80 transition hover:text-emerald-200 disabled:opacity-40"
                          title="Colocar descanso (DS) para este trabajador"
                        >
                          <span className="inline-block h-1.5 w-1.5 rounded-full border border-emerald-400/60" />
                          Descanso sugerido · toca para colocar
                        </button>
                      ) : (
                        <p className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          Día de descanso
                        </p>
                      )
                    )}
                    {meta && (
                      <p className="truncate text-[10px] text-muted-2" title={meta.ts ? new Date(meta.ts).toLocaleString("es-MX") : ""}>
                        por <span className="font-mono">@{meta.username}</span>
                        {meta.ts && <> · {new Date(meta.ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</>}
                        {noPuedeModificar && <span className="ml-1 text-amber-300/80">· solo RH puede modificar</span>}
                      </p>
                    )}
                    {isPendingChange && current !== "DS" && (
                      <p className="text-[10px] text-blue-300/70">cambio pendiente — sin guardar</p>
                    )}
                  </div>
                  {/* Botones rápidos A/F/I */}
                  <div className="flex shrink-0 items-center gap-1">
                    <RowCodeBtn label="A" active={current === "A"} color="emerald" onClick={() => setMarca(emp.id, "A")} disabled={disabledRow} />
                    <RowCodeBtn label="F" active={current === "F"} color="red"     onClick={() => setMarca(emp.id, "F")} disabled={disabledRow} />
                    <RowCodeBtn label="I" active={current === "I" || current === "DT" || current === "INH" || current === "FER" || current === "PCG" || current === "PSG" || (current === "DS" && !sugerido) || current === "AF"} color="amber" onClick={() => setMarca(emp.id, "I")} disabled={disabledRow} />
                    <button
                      type="button"
                      onClick={() => setExpandedRow(isExpanded ? null : emp.id)}
                      disabled={disabledRow}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-bold transition sm:h-8 sm:w-8 sm:text-sm ${
                        isExpanded
                          ? "border-blue-400/50 bg-blue-500/20 text-blue-200"
                          : "border-white/10 bg-white/[0.03] text-muted hover:border-white/30 hover:text-text"
                      } disabled:opacity-40`}
                      title="Más códigos"
                    >
                      ⋯
                    </button>
                    {current ? (
                      sugerido ? (
                        <button
                          type="button"
                          onClick={() => setMarca(emp.id, "DS")}
                          disabled={disabledRow}
                          className="shrink-0 hidden sm:inline-flex items-center gap-1 rounded-full border border-dashed border-emerald-400/50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-emerald-300/80 transition hover:border-emerald-400 hover:text-emerald-200 disabled:opacity-40"
                          title="Colocar descanso (DS) para este trabajador"
                        >
                          DS ✓
                        </button>
                      ) : (
                        <span
                          className="shrink-0 hidden sm:inline-flex rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white"
                          style={{ background: spec?.color }}
                          title={spec?.nombre}
                        >
                          {current}
                        </span>
                      )
                    ) : null}
                  </div>
                </div>
                {/* Códigos avanzados expandidos */}
                {isExpanded && (
                  <div className="border-t border-white/5 px-3 py-2 sm:px-4">
                    <p className="mb-2 text-[10px] uppercase tracking-tagline text-muted-2">Códigos detallados</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(["A", "AF", "F", "I", "DT", "DS", "DL", "INH", "FER", "PCG", "PSG"] as const).map((c) => {
                        const s = CODIGO_SPEC[c];
                        const isActive = current === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => { setMarca(emp.id, c); setExpandedRow(null); }}
                            disabled={disabledRow}
                            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] font-bold transition disabled:opacity-40 ${
                              isActive ? "border-white/50 text-white" : "border-white/10 text-muted hover:border-white/30 hover:text-text"
                            }`}
                            style={isActive ? { background: s.color } : undefined}
                            title={s.nombre}
                          >
                            <span>{c}</span>
                            <span className="text-[9px] font-normal opacity-70">{s.nombre}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ============ Save bar sticky ============ */}
      {props.empleados.length > 0 && (
        <div className="sticky bottom-0 mt-6 -mx-4 border-t border-white/10 bg-[color:var(--bg)]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 sm:py-4">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1 text-[11px] text-muted sm:text-xs">
              {resultado?.ok && (
                <span className="text-emerald-300">
                  ✓ {resultado.saved} marca{resultado.saved === 1 ? "" : "s"}
                  {resultado.protegidas && resultado.protegidas > 0 ? (
                    <span className="ml-2 text-amber-300">· {resultado.protegidas} protegida{resultado.protegidas === 1 ? "" : "s"} (solo RH)</span>
                  ) : null}
                </span>
              )}
              {resultado && !resultado.ok && <span className="block truncate text-red-300">⚠ {resultado.error}</span>}
              {!resultado && cambiosCount > 0 && <span className="font-mono text-[#FCD34D]">{cambiosCount} sin guardar</span>}
              {!resultado && !cambiosCount && <span>{stats.asist}/{stats.total} capturados</span>}
            </div>
            <button
              type="button"
              onClick={() => setShowReview(true)}
              disabled={!props.canEdit || !cambiosCount || operacionEnCurso}
              className="btn btn-primary shrink-0 whitespace-nowrap"
            >
              Revisar y guardar →
            </button>
          </div>
        </div>
      )}

      {/* ============ MODAL DE REVISIÓN FINAL ============ */}
      {showReview && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-[color:var(--bg)]/70 backdrop-blur-sm sm:items-center sm:justify-center"
          onClick={() => !operacionEnCurso && setShowReview(false)}
        >
          <div
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-[color:var(--surface)] p-5 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mb-4 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="pill pill-blue mb-2">Revisión final</p>
                <h2 className="font-serif text-2xl">
                  Revisar <span className="text-gradient-blue serif-italic">pase</span>
                </h2>
                <p className="mt-1 truncate text-xs text-muted">
                  {sedeActual?.nombre} · {props.jornada} · {props.fecha} · {cambiosCount} cambio{cambiosCount === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !operacionEnCurso && setShowReview(false)}
                disabled={operacionEnCurso}
                className="shrink-0 rounded-md p-1.5 text-muted-2 hover:bg-white/5 disabled:opacity-40"
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
                    <span className="shrink-0 font-mono text-[10px] text-muted-2">#{emp.numero_empleado}</span>
                    <span className="min-w-0 flex-1 truncate">{emp.nombre}</span>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold text-white"
                      style={{ background: spec.color }}
                    >
                      {cod}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowReview(false)} disabled={operacionEnCurso} className="btn btn-ghost">
                ← Corregir
              </button>
              <button type="button" onClick={commitGuardar} disabled={operacionEnCurso} className="btn btn-primary">
                {operacionEnCurso ? (
                  <>
                    <span className="loader-vortex-sm" />
                    Guardando...
                  </>
                ) : (
                  <>💾 Guardar definitivo</>
                )}
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

      {/* Overlay full-screen para acciones largas */}
      {operacionEnCurso && (
        <div className="overlay-loader">
          <VortexLoader size={64} />
          <p className="overlay-loader-text">
            {busyAction === "save" ? `Guardando ${cambiosCount} marca${cambiosCount === 1 ? "" : "s"}...` : "Cargando..."}
          </p>
          <p className="text-xs text-muted-2">No cierres ni recargues la pantalla</p>
        </div>
      )}

    </div>
  );
}

function StatRing({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  const circumference = 2 * Math.PI * 22;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-[color:var(--surface)]/60 p-2 sm:p-4">
      <div className="relative h-12 w-12 sm:h-16 sm:w-16">
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
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-text sm:text-lg">
          {value}
        </span>
      </div>
      <p className="mt-1 text-[9px] font-semibold uppercase tracking-tagline text-muted sm:mt-1.5 sm:text-[10px]">{label}</p>
    </div>
  );
}

function RowCodeBtn({
  label,
  active,
  color,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  color: "emerald" | "red" | "amber";
  onClick: () => void;
  disabled?: boolean;
}) {
  const palette = {
    emerald: { activeBg: "rgba(34,197,94,0.85)",  activeText: "#fff", inactive: "border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/15" },
    red:     { activeBg: "rgba(239,68,68,0.85)",  activeText: "#fff", inactive: "border-red-400/30 text-red-300 hover:bg-red-500/15" },
    amber:   { activeBg: "rgba(245,158,11,0.85)", activeText: "#fff", inactive: "border-amber-400/30 text-amber-300 hover:bg-amber-500/15" },
  }[color];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold transition sm:h-8 sm:w-8 sm:text-sm disabled:opacity-40 ${
        active ? "" : `border ${palette.inactive}`
      }`}
      style={active ? { background: palette.activeBg, color: palette.activeText } : undefined}
      aria-pressed={active}
    >
      {label}
    </button>
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
      className="flex min-w-0 items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left transition hover:border-blue-400/30 hover:bg-blue-500/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-base text-blue-300">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">{title}</p>
        <p className="truncate text-[11px] text-muted">{hint}</p>
      </div>
    </button>
  );
}
