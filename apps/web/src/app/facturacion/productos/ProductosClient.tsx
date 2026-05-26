"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import {
  crearProductoAction,
  actualizarProductoAction,
  eliminarProductoAction,
} from "../actions";

export interface ProductoRow {
  id: string;
  sku: string;
  nombre: string;
  descripcion: string | null;
  unidad: string;
  precio_unitario: number;
  iva_pct: number;
  categoria: string | null;
  stock_actual: number;
  stock_minimo: number;
  proveedor: string | null;
  activo: boolean;
  notas: string | null;
}

type FormData = Omit<ProductoRow, "id" | "activo">;

const EMPTY: FormData = {
  sku: "",
  nombre: "",
  descripcion: "",
  unidad: "PIEZA",
  precio_unitario: 0,
  iva_pct: 16,
  categoria: "",
  stock_actual: 0,
  stock_minimo: 0,
  proveedor: "",
  notas: "",
};

function money(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

export function ProductosClient({ initial }: { initial: ProductoRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ProductoRow | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const filtrados = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return initial;
    return initial.filter((p) =>
      p.sku.toLowerCase().includes(ql)
      || p.nombre.toLowerCase().includes(ql)
      || (p.categoria ?? "").toLowerCase().includes(ql)
      || (p.descripcion ?? "").toLowerCase().includes(ql),
    );
  }, [q, initial]);

  function abrirEdicion(p: ProductoRow) {
    setEditing(p);
    setForm({
      sku: p.sku,
      nombre: p.nombre,
      descripcion: p.descripcion ?? "",
      unidad: p.unidad,
      precio_unitario: p.precio_unitario,
      iva_pct: p.iva_pct,
      categoria: p.categoria ?? "",
      stock_actual: p.stock_actual,
      stock_minimo: p.stock_minimo,
      proveedor: p.proveedor ?? "",
      notas: p.notas ?? "",
    });
    setShowNew(true);
  }

  function abrirNuevo() {
    setEditing(null);
    setForm(EMPTY);
    setShowNew(true);
  }

  function cerrar() {
    setShowNew(false);
    setEditing(null);
    setMsg(null);
  }

  function guardar() {
    setMsg(null);
    start(async () => {
      const payload = {
        sku: form.sku,
        nombre: form.nombre,
        descripcion: form.descripcion || undefined,
        unidad: form.unidad,
        precio_unitario: Number(form.precio_unitario) || 0,
        iva_pct: Number(form.iva_pct) || 0,
        categoria: form.categoria || undefined,
        stock_actual: Number(form.stock_actual) || 0,
        stock_minimo: Number(form.stock_minimo) || 0,
        proveedor: form.proveedor || undefined,
        notas: form.notas || undefined,
      };
      const r = editing
        ? await actualizarProductoAction(editing.id, payload)
        : await crearProductoAction(payload);
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      setMsg({ kind: "ok", text: editing ? "✓ Producto actualizado" : "✓ Producto creado" });
      router.refresh();
      setTimeout(() => cerrar(), 500);
    });
  }

  function eliminar(p: ProductoRow) {
    if (!confirm(`¿Eliminar / desactivar "${p.nombre}"?`)) return;
    start(async () => {
      const r = await eliminarProductoAction(p.id);
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      router.refresh();
    });
  }

  function toggleActivo(p: ProductoRow) {
    start(async () => {
      const r = await actualizarProductoAction(p.id, { activo: !p.activo });
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Catálogo de productos</h1>
          <p className="text-xs text-muted">{initial.length} producto{initial.length === 1 ? "" : "s"} · usados en cotizaciones y solicitudes de compra</p>
        </div>
        <button onClick={abrirNuevo} className="btn btn-primary btn-sm">
          <Icon name="plus" size={12} /> Nuevo producto
        </button>
      </header>

      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por SKU, nombre, categoría..."
        className="w-full rounded-md border border-white/10 bg-[color:var(--card)] px-3 py-2 text-sm"
      />

      {msg && (
        <p className={`rounded-md border px-3 py-2 text-xs ${
          msg.kind === "ok"
            ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200"
            : "border-red-400/30 bg-red-500/[0.08] text-red-200"
        }`}>{msg.text}</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-xs">
          <thead className="bg-white/[0.03] text-left">
            <tr>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-tagline">SKU</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-tagline">Nombre</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-tagline">Categoría</th>
              <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-tagline">Precio</th>
              <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-tagline">IVA</th>
              <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-tagline">Stock</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-tagline">Estado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted">Sin productos. Crea el primero.</td></tr>
            ) : filtrados.map((p) => {
              const bajoStock = p.activo && p.stock_actual <= p.stock_minimo;
              return (
                <tr key={p.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-3 py-2 font-mono text-[11px] text-amber-200">{p.sku}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold">{p.nombre}</div>
                    {p.descripcion && <div className="text-[10px] text-muted-2 line-clamp-1">{p.descripcion}</div>}
                  </td>
                  <td className="px-3 py-2 text-muted">{p.categoria ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(p.precio_unitario)}</td>
                  <td className="px-3 py-2 text-right font-mono text-muted">{p.iva_pct}%</td>
                  <td className={`px-3 py-2 text-right font-mono ${bajoStock ? "text-red-300" : ""}`}>
                    {p.stock_actual}
                    {bajoStock && <span className="ml-1 text-[9px]">⚠</span>}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleActivo(p)}
                      disabled={pending}
                      className={`pill ${p.activo ? "pill-green" : "pill-red"} disabled:opacity-40`}
                    >
                      {p.activo ? "ACTIVO" : "INACTIVO"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => abrirEdicion(p)} className="rounded p-1 hover:bg-white/10" title="Editar">
                      <Icon name="edit" size={12} />
                    </button>
                    <button onClick={() => eliminar(p)} className="rounded p-1 text-red-300 hover:bg-red-500/20" title="Eliminar/desactivar">
                      <Icon name="trash" size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={cerrar}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-xl border border-white/10 bg-[color:var(--bg)] p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg">{editing ? "Editar producto" : "Nuevo producto"}</h2>
              <button onClick={cerrar} className="rounded p-1 hover:bg-white/10"><Icon name="x" size={14} /></button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label>SKU *</label>
                <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} disabled={pending} />
              </div>
              <div className="field">
                <label>Categoría</label>
                <input value={form.categoria ?? ""} onChange={(e) => setForm({ ...form, categoria: e.target.value })} disabled={pending} placeholder="Limpieza, Seguridad, Oficina..." />
              </div>
              <div className="field sm:col-span-2">
                <label>Nombre *</label>
                <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} disabled={pending} />
              </div>
              <div className="field sm:col-span-2">
                <label>Descripción</label>
                <textarea
                  value={form.descripcion ?? ""}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  disabled={pending}
                  rows={2}
                />
              </div>
              <div className="field">
                <label>Unidad</label>
                <select value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} disabled={pending}>
                  <option value="PIEZA">PIEZA</option>
                  <option value="CAJA">CAJA</option>
                  <option value="PAQ">PAQUETE</option>
                  <option value="KG">KG</option>
                  <option value="LT">LT</option>
                  <option value="MTS">MTS</option>
                  <option value="SERV">SERVICIO</option>
                  <option value="HRS">HORAS</option>
                </select>
              </div>
              <div className="field">
                <label>Proveedor</label>
                <input value={form.proveedor ?? ""} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} disabled={pending} />
              </div>
              <div className="field">
                <label>Precio unitario</label>
                <input type="number" step="0.01" min="0" value={form.precio_unitario} onChange={(e) => setForm({ ...form, precio_unitario: Number(e.target.value) })} disabled={pending} />
              </div>
              <div className="field">
                <label>IVA %</label>
                <input type="number" step="0.01" min="0" max="100" value={form.iva_pct} onChange={(e) => setForm({ ...form, iva_pct: Number(e.target.value) })} disabled={pending} />
              </div>
              <div className="field">
                <label>Stock actual</label>
                <input type="number" min="0" value={form.stock_actual} onChange={(e) => setForm({ ...form, stock_actual: Number(e.target.value) })} disabled={pending} />
              </div>
              <div className="field">
                <label>Stock mínimo (alerta)</label>
                <input type="number" min="0" value={form.stock_minimo} onChange={(e) => setForm({ ...form, stock_minimo: Number(e.target.value) })} disabled={pending} />
              </div>
              <div className="field sm:col-span-2">
                <label>Notas internas</label>
                <textarea value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} disabled={pending} rows={2} />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={cerrar} disabled={pending} className="btn btn-ghost btn-sm">Cancelar</button>
              <button onClick={guardar} disabled={pending || !form.sku.trim() || !form.nombre.trim()} className="btn btn-primary btn-sm">
                {pending ? "Guardando..." : (editing ? "Actualizar" : "Crear producto")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
