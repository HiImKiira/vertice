"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

export interface UsuarioCandidato {
  id: string;
  nombre: string;
  username: string;
  rol: string;
  dispositivos: number;
}

interface Props {
  value: string[];               // user_ids seleccionados (vacío = broadcast)
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function DestinatariosPicker({ value, onChange, disabled }: Props) {
  const [usuarios, setUsuarios] = useState<UsuarioCandidato[] | null>(null);
  const [filtroRol, setFiltroRol] = useState<"all" | "USER" | "ADMIN_LIKE">("all");
  const [q, setQ] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/push/users").catch(() => null);
      if (res?.ok) {
        const j = (await res.json().catch(() => null)) as { ok?: boolean; usuarios?: UsuarioCandidato[] } | null;
        if (j?.ok && Array.isArray(j.usuarios)) setUsuarios(j.usuarios);
      }
      setLoaded(true);
    })();
  }, []);

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  }
  function clearAll() { onChange([]); }
  function selectAllVisibles() {
    onChange([...new Set([...value, ...filtrados.map((u) => u.id)])]);
  }

  const adminRoles = new Set(["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"]);
  const filtrados = (usuarios ?? []).filter((u) => {
    if (filtroRol === "USER" && u.rol !== "USER") return false;
    if (filtroRol === "ADMIN_LIKE" && !adminRoles.has(u.rol)) return false;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      if (!u.nombre.toLowerCase().includes(needle) && !u.username.toLowerCase().includes(needle)) return false;
    }
    return true;
  });

  const broadcast = value.length === 0;

  return (
    <div className="rounded-lg border border-white/10 bg-[color:var(--surface)]/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Icon name="users" size={12} className="text-muted" />
        <p className="text-xs font-semibold">Destinatarios</p>
        {broadcast ? (
          <span className="rounded bg-violet-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-violet-200">
            BROADCAST · todos los suscritos
          </span>
        ) : (
          <span className="rounded bg-blue-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-blue-200">
            {value.length} seleccionado{value.length === 1 ? "" : "s"}
          </span>
        )}
        {!broadcast && (
          <button
            type="button"
            onClick={clearAll}
            disabled={disabled}
            className="ml-auto text-[10px] text-muted hover:text-text"
          >
            Limpiar (= broadcast)
          </button>
        )}
      </div>

      <p className="mb-2 text-[10px] text-muted-2">
        Vacío = broadcast a todos los suscritos. Selecciona usuarios para targeting individual.
      </p>

      {/* Filtros */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar nombre/username..."
          disabled={disabled}
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-[color:var(--bg)] px-2 py-1 text-[11px]"
        />
        <select
          value={filtroRol}
          onChange={(e) => setFiltroRol(e.target.value as typeof filtroRol)}
          disabled={disabled}
          className="rounded-md border border-white/10 bg-[color:var(--bg)] px-2 py-1 text-[11px]"
        >
          <option value="all">Todos los roles</option>
          <option value="USER">Solo USER</option>
          <option value="ADMIN_LIKE">Solo ADMIN/SOPORTE</option>
        </select>
        {filtrados.length > 0 && (
          <button
            type="button"
            onClick={selectAllVisibles}
            disabled={disabled}
            className="rounded-md border border-blue-400/30 bg-blue-500/15 px-2 py-1 text-[10px] text-blue-200 hover:bg-blue-500/30"
          >
            + Todos visibles
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {!loaded && <p className="text-[10px] text-muted-2">Cargando usuarios...</p>}
        {loaded && filtrados.length === 0 && (
          <p className="text-[10px] text-muted-2">Sin resultados con esos filtros.</p>
        )}
        {filtrados.map((u) => {
          const checked = value.includes(u.id);
          const sinSubs = u.dispositivos === 0;
          return (
            <label
              key={u.id}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[11px] transition ${
                checked ? "bg-blue-500/20" : "hover:bg-white/5"
              } ${sinSubs ? "opacity-50" : ""}`}
              title={sinSubs ? "Sin dispositivos suscritos — no recibirá push aunque se elija" : ""}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(u.id)}
                disabled={disabled}
                className="h-3.5 w-3.5 accent-blue-500"
              />
              <span className="min-w-0 flex-1 truncate">
                {u.nombre} <span className="font-mono text-muted-2">@{u.username}</span>
              </span>
              <span className={`shrink-0 rounded px-1 font-mono text-[9px] font-bold ${
                u.rol === "USER" ? "bg-white/5 text-muted" : "bg-violet-500/20 text-violet-200"
              }`}>
                {u.rol}
              </span>
              <span className={`shrink-0 font-mono text-[9px] ${sinSubs ? "text-red-300" : "text-emerald-300"}`}>
                {u.dispositivos} dev
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
