"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { cambiarSedeEmpleadosAction } from "./actions";

interface Empleado {
  id: string;
  numero_empleado: string;
  nombre: string;
  sede_id: string;
  sede_abrev: string;
  sede_nombre: string;
  jornada: string;
}

interface Sede {
  id: string;
  abrev: string;
  nombre: string;
}

const JORNADAS = [
  "MATUTINO",
  "VESPERTINO",
  "NOCTURNO",
  "TURNO_ROTATIVO",
  "CUBRETURNOS",
  "DIURNO",
];

export function CambioSedeForm({ empleados, sedes }: { empleados: Empleado[]; sedes: Sede[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [filtroSede, setFiltroSede] = useState<string>("all");
  const [filtroJornada, setFiltroJornada] = useState<string>("all");
  const [q, setQ] = useState("");
  const [nuevaSede, setNuevaSede] = useState<string>("");
  const [nuevaJornada, setNuevaJornada] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const filtrados = useMemo(() => {
    return empleados.filter((e) => {
      if (filtroSede !== "all" && e.sede_id !== filtroSede) return false;
      if (filtroJornada !== "all" && e.jornada !== filtroJornada) return false;
      if (q.trim()) {
        const needle = q.toLowerCase();
        if (!e.nombre.toLowerCase().includes(needle) && !e.numero_empleado.includes(needle)) return false;
      }
      return true;
    });
  }, [empleados, filtroSede, filtroJornada, q]);

  function toggle(id: string) {
    const next = new Set(seleccionados);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSeleccionados(next);
  }
  function selectAllVisibles() {
    const next = new Set(seleccionados);
    for (const e of filtrados) next.add(e.id);
    setSeleccionados(next);
  }
  function clearAll() {
    setSeleccionados(new Set());
  }

  function submit() {
    setMsg(null);
    if (seleccionados.size === 0) { setMsg({ kind: "err", text: "Selecciona al menos un empleado" }); return; }
    if (!nuevaSede) { setMsg({ kind: "err", text: "Elige la sede destino" }); return; }
    if (!motivo.trim()) { setMsg({ kind: "err", text: "El motivo del cambio es obligatorio" }); return; }

    const sedeAct = sedes.find((s) => s.id === nuevaSede);
    if (!confirm(
      `Mover ${seleccionados.size} empleado(s) a ${sedeAct?.abrev ?? "—"}${nuevaJornada ? ` (jornada ${nuevaJornada})` : " (conserva su jornada actual)"}? Motivo: "${motivo.trim()}".`
    )) return;

    start(async () => {
      const r = await cambiarSedeEmpleadosAction({
        empleadoIds: [...seleccionados],
        nuevaSedeId: nuevaSede,
        nuevaJornada: nuevaJornada || undefined,
        motivo: motivo.trim(),
      });
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      setMsg({ kind: "ok", text: r.mensaje });
      setSeleccionados(new Set());
      setMotivo("");
      router.refresh();
    });
  }

  const sedeDest = sedes.find((s) => s.id === nuevaSede);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Selector de empleados */}
      <section className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-[color:var(--card)] p-3">
          <div className="mb-2 flex items-center gap-2 text-xs">
            <Icon name="search" size={12} className="text-muted" />
            <span className="font-semibold">Filtros</span>
            <span className="ml-auto text-muted-2">{filtrados.length} empleado{filtrados.length === 1 ? "" : "s"} · {seleccionados.size} seleccionado{seleccionados.size === 1 ? "" : "s"}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar nombre/número..."
              disabled={pending}
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-[color:var(--surface)] px-2 py-1.5 text-xs sm:max-w-xs"
            />
            <select
              value={filtroSede}
              onChange={(e) => setFiltroSede(e.target.value)}
              disabled={pending}
              className="rounded-md border border-white/10 bg-[color:var(--surface)] px-2 py-1.5 text-xs"
            >
              <option value="all">Todas las sedes</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>{s.abrev} · {s.nombre}</option>
              ))}
            </select>
            <select
              value={filtroJornada}
              onChange={(e) => setFiltroJornada(e.target.value)}
              disabled={pending}
              className="rounded-md border border-white/10 bg-[color:var(--surface)] px-2 py-1.5 text-xs"
            >
              <option value="all">Todas las jornadas</option>
              {JORNADAS.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={selectAllVisibles}
              disabled={pending || filtrados.length === 0}
              className="rounded-md border border-blue-400/30 bg-blue-500/15 px-2 py-1 text-[10px] text-blue-200 hover:bg-blue-500/30 disabled:opacity-40"
            >
              + Todos visibles
            </button>
            {seleccionados.size > 0 && (
              <button
                type="button"
                onClick={clearAll}
                disabled={pending}
                className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-muted hover:text-text disabled:opacity-40"
              >
                Limpiar selección
              </button>
            )}
          </div>
        </div>

        {/* Lista */}
        <div className="max-h-[500px] space-y-1 overflow-y-auto rounded-xl border border-white/5 bg-[color:var(--card)]/40 p-2">
          {filtrados.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-2">Sin empleados con esos filtros.</p>
          ) : (
            filtrados.map((e) => {
              const checked = seleccionados.has(e.id);
              return (
                <label
                  key={e.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition ${
                    checked
                      ? "border-blue-400/50 bg-blue-500/15"
                      : "border-white/5 hover:border-white/20"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(e.id)}
                    disabled={pending}
                    className="h-3.5 w-3.5 accent-blue-500"
                  />
                  <span className="shrink-0 font-mono text-[10px] text-muted-2">#{e.numero_empleado}</span>
                  <span className="min-w-0 flex-1 truncate">{e.nombre}</span>
                  <span className="shrink-0 rounded bg-white/5 px-1 font-mono text-[9px] text-muted">
                    {e.sede_abrev}
                  </span>
                  <span className="shrink-0 rounded bg-amber-500/15 px-1 font-mono text-[9px] text-amber-200">
                    {e.jornada.slice(0, 3)}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </section>

      {/* Form de destino */}
      <aside className="space-y-3">
        <div className="surface-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Icon name="building" size={14} className="text-blue-300" />
            <h2 className="font-display text-sm">Sede destino</h2>
          </div>
          <div className="space-y-2">
            <div className="field">
              <label>Sede</label>
              <select
                value={nuevaSede}
                onChange={(e) => setNuevaSede(e.target.value)}
                disabled={pending}
              >
                <option value="">Seleccionar...</option>
                {sedes.map((s) => (
                  <option key={s.id} value={s.id}>{s.abrev} · {s.nombre}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Nueva jornada (opcional)</label>
              <select
                value={nuevaJornada}
                onChange={(e) => setNuevaJornada(e.target.value)}
                disabled={pending}
              >
                <option value="">Conservar la actual de cada empleado</option>
                {JORNADAS.map((j) => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Motivo del cambio *</label>
              <textarea
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="ej: Iván Sandoval se cambió a UNEME tras solicitud propia el 25/05/2026"
                maxLength={500}
                disabled={pending}
              />
              <p className="mt-1 text-[10px] text-muted-2">Queda en auditoría — todos los cambios se loggean.</p>
            </div>
          </div>

          {/* Preview */}
          <div className="mt-3 rounded-md border border-blue-400/30 bg-blue-500/[0.06] p-2 text-[11px]">
            <p className="font-semibold text-blue-200">Resumen</p>
            <p className="mt-1 text-muted">
              <strong>{seleccionados.size}</strong> empleado{seleccionados.size === 1 ? "" : "s"} →{" "}
              {sedeDest ? <><strong className="text-text">{sedeDest.abrev}</strong> ({sedeDest.nombre})</> : "—"}
              {nuevaJornada && <> · jornada <strong>{nuevaJornada}</strong></>}
            </p>
            <p className="mt-1 text-[10px] text-muted-2">
              Los supervisores asignados a la sede destino recibirán push automático.
              El cambio se aplica de inmediato y queda registrado en el histórico del empleado.
            </p>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={pending || seleccionados.size === 0 || !nuevaSede || !motivo.trim()}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-500/80 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
          >
            <Icon name="arrow-right" size={14} />
            {pending ? "Procesando..." : `Mover ${seleccionados.size} empleado${seleccionados.size === 1 ? "" : "s"}`}
          </button>

          {msg && (
            <p className={`mt-3 rounded-md border px-2.5 py-2 text-[11px] ${
              msg.kind === "ok"
                ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200"
                : "border-red-400/30 bg-red-500/[0.08] text-red-200"
            }`}>
              {msg.text}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
