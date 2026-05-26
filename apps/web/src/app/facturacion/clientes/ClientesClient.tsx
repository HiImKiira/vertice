"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { crearClienteAction, actualizarClienteAction } from "../actions";

export interface ClienteRow {
  id: string;
  razon_social: string;
  rfc: string | null;
  contacto_nombre: string | null;
  contacto_email: string | null;
  contacto_telefono: string | null;
  direccion: string | null;
  notas: string | null;
  activo: boolean;
}

type FormData = Omit<ClienteRow, "id" | "activo">;

const EMPTY: FormData = {
  razon_social: "",
  rfc: "",
  contacto_nombre: "",
  contacto_email: "",
  contacto_telefono: "",
  direccion: "",
  notas: "",
};

export function ClientesClient({ initial }: { initial: ClienteRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ClienteRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const filtrados = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return initial;
    return initial.filter((c) =>
      c.razon_social.toLowerCase().includes(ql)
      || (c.rfc ?? "").toLowerCase().includes(ql)
      || (c.contacto_nombre ?? "").toLowerCase().includes(ql)
      || (c.contacto_email ?? "").toLowerCase().includes(ql),
    );
  }, [q, initial]);

  function abrirNuevo() {
    setEditing(null);
    setForm(EMPTY);
    setShowForm(true);
  }

  function abrirEdicion(c: ClienteRow) {
    setEditing(c);
    setForm({
      razon_social: c.razon_social,
      rfc: c.rfc ?? "",
      contacto_nombre: c.contacto_nombre ?? "",
      contacto_email: c.contacto_email ?? "",
      contacto_telefono: c.contacto_telefono ?? "",
      direccion: c.direccion ?? "",
      notas: c.notas ?? "",
    });
    setShowForm(true);
  }

  function cerrar() { setShowForm(false); setEditing(null); setMsg(null); }

  function guardar() {
    setMsg(null);
    start(async () => {
      const r = editing
        ? await actualizarClienteAction(editing.id, {
            razon_social: form.razon_social,
            rfc: form.rfc ?? "",
            contacto_nombre: form.contacto_nombre ?? "",
            contacto_email: form.contacto_email ?? "",
            contacto_telefono: form.contacto_telefono ?? "",
            direccion: form.direccion ?? "",
            notas: form.notas ?? "",
          })
        : await crearClienteAction({
            razon_social: form.razon_social,
            rfc: form.rfc ?? "",
            contacto_nombre: form.contacto_nombre ?? "",
            contacto_email: form.contacto_email ?? "",
            contacto_telefono: form.contacto_telefono ?? "",
            direccion: form.direccion ?? "",
            notas: form.notas ?? "",
          });
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      setMsg({ kind: "ok", text: editing ? "✓ Cliente actualizado" : "✓ Cliente creado" });
      router.refresh();
      setTimeout(() => cerrar(), 500);
    });
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Clientes</h1>
          <p className="text-xs text-muted">{initial.length} cliente{initial.length === 1 ? "" : "s"} registrado{initial.length === 1 ? "" : "s"}</p>
        </div>
        <button onClick={abrirNuevo} className="btn btn-primary btn-sm">
          <Icon name="plus" size={12} /> Nuevo cliente
        </button>
      </header>

      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar razón social, RFC, contacto..."
        className="w-full rounded-md border border-white/10 bg-[color:var(--card)] px-3 py-2 text-sm"
      />

      {msg && (
        <p className={`rounded-md border px-3 py-2 text-xs ${
          msg.kind === "ok"
            ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200"
            : "border-red-400/30 bg-red-500/[0.08] text-red-200"
        }`}>{msg.text}</p>
      )}

      <ul className="grid gap-2 sm:grid-cols-2">
        {filtrados.length === 0 ? (
          <li className="surface-card p-4 text-center text-xs text-muted sm:col-span-2">Sin clientes registrados.</li>
        ) : filtrados.map((c) => (
          <li key={c.id} className="surface-card flex flex-col gap-1 p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold leading-tight">{c.razon_social}</div>
                {c.rfc && <div className="font-mono text-[10px] text-amber-200">RFC: {c.rfc}</div>}
              </div>
              <button onClick={() => abrirEdicion(c)} className="rounded p-1 hover:bg-white/10"><Icon name="edit" size={12} /></button>
            </div>
            {c.contacto_nombre && (
              <div className="text-[11px] text-muted">{c.contacto_nombre}{c.contacto_email && ` · ${c.contacto_email}`}</div>
            )}
            {c.contacto_telefono && <div className="text-[10px] text-muted-2">{c.contacto_telefono}</div>}
            {c.direccion && <div className="text-[10px] text-muted-2 line-clamp-1">{c.direccion}</div>}
          </li>
        ))}
      </ul>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={cerrar}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl rounded-xl border border-white/10 bg-[color:var(--bg)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg">{editing ? "Editar cliente" : "Nuevo cliente"}</h2>
              <button onClick={cerrar} className="rounded p-1 hover:bg-white/10"><Icon name="x" size={14} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field sm:col-span-2">
                <label>Razón social *</label>
                <input value={form.razon_social} onChange={(e) => setForm({ ...form, razon_social: e.target.value })} disabled={pending} />
              </div>
              <div className="field">
                <label>RFC</label>
                <input value={form.rfc ?? ""} onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })} disabled={pending} />
              </div>
              <div className="field">
                <label>Contacto</label>
                <input value={form.contacto_nombre ?? ""} onChange={(e) => setForm({ ...form, contacto_nombre: e.target.value })} disabled={pending} />
              </div>
              <div className="field">
                <label>Email contacto</label>
                <input type="email" value={form.contacto_email ?? ""} onChange={(e) => setForm({ ...form, contacto_email: e.target.value })} disabled={pending} />
              </div>
              <div className="field">
                <label>Teléfono</label>
                <input value={form.contacto_telefono ?? ""} onChange={(e) => setForm({ ...form, contacto_telefono: e.target.value })} disabled={pending} />
              </div>
              <div className="field sm:col-span-2">
                <label>Dirección</label>
                <textarea value={form.direccion ?? ""} onChange={(e) => setForm({ ...form, direccion: e.target.value })} disabled={pending} rows={2} />
              </div>
              <div className="field sm:col-span-2">
                <label>Notas</label>
                <textarea value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} disabled={pending} rows={2} />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={cerrar} disabled={pending} className="btn btn-ghost btn-sm">Cancelar</button>
              <button onClick={guardar} disabled={pending || !form.razon_social.trim()} className="btn btn-primary btn-sm">
                {pending ? "Guardando..." : (editing ? "Actualizar" : "Crear cliente")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
