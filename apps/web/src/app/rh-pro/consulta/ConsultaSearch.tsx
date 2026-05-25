"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

interface Props {
  initialQuery: string;
  initialSede: string;
  initialEstado: string;
  sedes: { id: string; abrev: string; nombre: string }[];
}

export function ConsultaSearch({ initialQuery, initialSede, initialEstado, sedes }: Props) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [sede, setSede] = useState(initialSede);
  const [estado, setEstado] = useState(initialEstado);
  const [pending, start] = useTransition();

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const usp = new URLSearchParams();
    if (q.trim()) usp.set("q", q.trim());
    if (sede !== "all") usp.set("sede", sede);
    if (estado !== "all") usp.set("estado", estado);
    start(() => {
      router.push(`/rh-pro/consulta?${usp.toString()}`);
    });
  }

  function clearAll() {
    setQ("");
    setSede("all");
    setEstado("all");
    start(() => router.push("/rh-pro/consulta"));
  }

  return (
    <form onSubmit={submit} className="surface-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:flex-initial sm:w-80">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" size={14} />
          </span>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre o número de empleado..."
            className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] py-2 pl-9 pr-3 text-sm"
            autoFocus
          />
        </div>
        <select
          value={sede}
          onChange={(e) => setSede(e.target.value)}
          className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm"
        >
          <option value="all">Todas las sedes</option>
          {sedes.map((s) => (
            <option key={s.id} value={s.id}>{s.abrev} · {s.nombre}</option>
          ))}
        </select>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm"
        >
          <option value="all">Activos + Bajas</option>
          <option value="activos">Solo activos</option>
          <option value="bajas">Solo bajas</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-500/80 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {pending ? "Buscando..." : "Buscar"}
        </button>
        {(q || sede !== "all" || estado !== "all") && (
          <button
            type="button"
            onClick={clearAll}
            disabled={pending}
            className="rounded-md border border-white/10 px-3 py-2 text-xs text-muted hover:text-text disabled:opacity-40"
          >
            Limpiar
          </button>
        )}
      </div>
    </form>
  );
}
