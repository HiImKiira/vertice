"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  crearSedeAction,
  editarSedeAction,
  toggleSedeActivaAction,
  eliminarSedeAction,
} from "./sedes-actions";

export interface SedeFull {
  id: string;
  codigo: string;
  abrev: string;
  nombre: string;
  activa: boolean;
  notas: string | null;
  ultimo_folio: number;
  empleados_activos: number;
  empleados_total: number;
  asignaciones_activas: number;
}

export function SedesEditor({ sedes }: { sedes: SedeFull[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [search, setSearch] = useState("");

  // Form alta
  const [nuevoCodigo, setNuevoCodigo] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoAbrev, setNuevoAbrev] = useState("");
  const [nuevoNotas, setNuevoNotas] = useState("");

  const filtered = sedes
    .filter((s) => filter === "all" || (filter === "active" ? s.activa : !s.activa))
    .filter(
      (s) =>
        !search ||
        s.nombre.toLowerCase().includes(search.toLowerCase()) ||
        s.codigo.toLowerCase().includes(search.toLowerCase()) ||
        s.abrev.toLowerCase().includes(search.toLowerCase()),
    );

  const totalActivas = sedes.filter((s) => s.activa).length;
  const totalInactivas = sedes.length - totalActivas;
  const totalEmpleados = sedes.reduce((acc, s) => acc + s.empleados_activos, 0);

  async function handleCrear() {
    if (!nuevoCodigo.trim() || !nuevoNombre.trim()) {
      alert("Código y nombre son requeridos.");
      return;
    }
    start(async () => {
      const res = await crearSedeAction({
        codigo: nuevoCodigo,
        nombre: nuevoNombre,
        abrev: nuevoAbrev || undefined,
        notas: nuevoNotas || undefined,
      });
      if (!res.ok) {
        alert(`Error: ${res.error}`);
        return;
      }
      setNuevoCodigo("");
      setNuevoNombre("");
      setNuevoAbrev("");
      setNuevoNotas("");
      router.refresh();
    });
  }

  async function handleToggle(id: string, activa: boolean) {
    start(async () => {
      const res = await toggleSedeActivaAction(id, activa);
      if (!res.ok) alert(`Error: ${res.error}`);
      else router.refresh();
    });
  }

  async function handleEliminar(id: string, nombre: string) {
    if (!confirm(`¿Eliminar sede "${nombre}"? Solo procede si no tiene empleados activos.`)) return;
    start(async () => {
      const res = await eliminarSedeAction(id);
      if (!res.ok) alert(`Error: ${res.error}`);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.08)] px-4 py-3">
          <div className="font-display text-2xl text-[#6EE7B7]">{totalActivas}</div>
          <div className="text-[10px] uppercase tracking-tagline text-muted">Sedes activas</div>
        </div>
        <div className="rounded-xl border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-4 py-3">
          <div className="font-display text-2xl text-[#FCA5A5]">{totalInactivas}</div>
          <div className="text-[10px] uppercase tracking-tagline text-muted">Inactivas</div>
        </div>
        <div className="rounded-xl border border-[rgba(59,130,246,0.35)] bg-[rgba(59,130,246,0.08)] px-4 py-3">
          <div className="font-display text-2xl text-[#93C5FD]">{totalEmpleados}</div>
          <div className="text-[10px] uppercase tracking-tagline text-muted">Empleados activos totales</div>
        </div>
      </div>

      {/* Alta */}
      <div className="surface-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-lg">➕</span>
          <h3 className="font-display text-sm">Crear nueva sede</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="field">
            <label>Código *</label>
            <input
              type="text"
              value={nuevoCodigo}
              onChange={(e) => setNuevoCodigo(e.target.value.toUpperCase())}
              placeholder="EJ. MAT-IF"
              disabled={pending}
            />
          </div>
          <div className="field">
            <label>Nombre *</label>
            <input
              type="text"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              placeholder="Materno Infantil"
              disabled={pending}
            />
          </div>
          <div className="field">
            <label>Abrev (auto si vacío)</label>
            <input
              type="text"
              value={nuevoAbrev}
              onChange={(e) => setNuevoAbrev(e.target.value.toUpperCase())}
              placeholder="MI"
              maxLength={8}
              disabled={pending}
            />
          </div>
          <div className="field">
            <label>Notas</label>
            <input
              type="text"
              value={nuevoNotas}
              onChange={(e) => setNuevoNotas(e.target.value)}
              placeholder="opcional"
              disabled={pending}
            />
          </div>
        </div>
        <div className="mt-3">
          <button className="btn btn-primary" onClick={handleCrear} disabled={pending}>
            {pending ? "..." : "Crear sede"}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Buscar..."
          className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-sm"
        />
        <div className="flex gap-1">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-xs ${
                filter === f
                  ? "bg-[color:var(--blue)] text-white"
                  : "border border-[color:var(--border)] text-muted hover:text-text"
              }`}
            >
              {f === "all" ? "Todas" : f === "active" ? "Activas" : "Inactivas"}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted">{filtered.length} sede{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {/* Lista */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s) =>
          editing === s.id ? (
            <SedeEditRow
              key={s.id}
              sede={s}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                router.refresh();
              }}
              pending={pending}
              start={start}
            />
          ) : (
            <div
              key={s.id}
              className={`rounded-xl border p-3 ${
                s.activa
                  ? "border-[color:var(--border)] bg-[color:var(--card)]"
                  : "border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.04)] opacity-70"
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[#93C5FD]">{s.abrev}</span>
                    {!s.activa && <span className="pill pill-red text-[9px]">INACTIVA</span>}
                  </div>
                  <p className="truncate text-sm font-medium">{s.nombre}</p>
                  <p className="font-mono text-[10px] text-muted-2">{s.codigo}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => setEditing(s.id)}
                    className="rounded-md border border-[color:var(--border)] px-2 py-1 text-[10px] text-muted hover:text-text"
                    disabled={pending}
                    title="Editar"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleToggle(s.id, !s.activa)}
                    className={`rounded-md px-2 py-1 text-[10px] ${
                      s.activa
                        ? "border border-[rgba(245,158,11,0.3)] text-[#FCD34D] hover:bg-[rgba(245,158,11,0.1)]"
                        : "border border-[rgba(16,185,129,0.3)] text-[#6EE7B7] hover:bg-[rgba(16,185,129,0.1)]"
                    }`}
                    disabled={pending}
                    title={s.activa ? "Desactivar" : "Activar"}
                  >
                    {s.activa ? "⏸" : "▶"}
                  </button>
                  {s.empleados_total === 0 && (
                    <button
                      onClick={() => handleEliminar(s.id, s.nombre)}
                      className="rounded-md border border-[rgba(239,68,68,0.3)] px-2 py-1 text-[10px] text-[#FCA5A5] hover:bg-[rgba(239,68,68,0.1)]"
                      disabled={pending}
                      title="Eliminar"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="rounded bg-[rgba(59,130,246,0.12)] px-1.5 py-0.5 text-[#93C5FD]">
                  {s.empleados_activos} activos
                </span>
                {s.empleados_total > s.empleados_activos && (
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-muted-2">
                    {s.empleados_total - s.empleados_activos} dados de baja
                  </span>
                )}
                <span className="rounded bg-[rgba(139,92,246,0.12)] px-1.5 py-0.5 text-[#C4B5FD]">
                  {s.asignaciones_activas} supervisores
                </span>
              </div>
              {s.notas && <p className="mt-2 text-[10px] text-muted-2">📝 {s.notas}</p>}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function SedeEditRow({
  sede,
  onCancel,
  onSaved,
  pending,
  start,
}: {
  sede: SedeFull;
  onCancel: () => void;
  onSaved: () => void;
  pending: boolean;
  start: (fn: () => void) => void;
}) {
  const [nombre, setNombre] = useState(sede.nombre);
  const [abrev, setAbrev] = useState(sede.abrev);
  const [notas, setNotas] = useState(sede.notas ?? "");

  function handleSave() {
    start(async () => {
      const res = await editarSedeAction({ id: sede.id, nombre, abrev, notas });
      if (!res.ok) {
        alert(`Error: ${res.error}`);
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="rounded-xl border border-[color:var(--blue-dim)] bg-[color:var(--card)] p-3">
      <div className="mb-2 font-mono text-[10px] text-muted-2">{sede.codigo}</div>
      <div className="space-y-2">
        <div className="field">
          <label>Nombre</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={pending} />
        </div>
        <div className="field">
          <label>Abrev</label>
          <input
            value={abrev}
            onChange={(e) => setAbrev(e.target.value.toUpperCase())}
            maxLength={8}
            disabled={pending}
          />
        </div>
        <div className="field">
          <label>Notas</label>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} disabled={pending} />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={handleSave} className="btn btn-primary btn-sm" disabled={pending}>
          Guardar
        </button>
        <button onClick={onCancel} className="btn btn-ghost btn-sm" disabled={pending}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
