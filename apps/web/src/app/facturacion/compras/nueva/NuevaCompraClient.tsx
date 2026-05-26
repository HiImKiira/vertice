"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { crearSolicitudCompraAction } from "../../actions";

export interface SedeOpt { id: string; abrev: string; nombre: string }
export interface ProductoOpt { id: string; sku: string; nombre: string; unidad: string; precio_unitario: number }

interface Item {
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_estimado: number;
  notas: string;
}

function emptyItem(): Item {
  return { producto_id: null, descripcion: "", cantidad: 1, unidad: "PIEZA", precio_estimado: 0, notas: "" };
}

function money(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

export function NuevaCompraClient({ sedes, productos }: { sedes: SedeOpt[]; productos: ProductoOpt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sedeId, setSedeId] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [prioridad, setPrioridad] = useState<"BAJA" | "NORMAL" | "ALTA" | "URGENTE">("NORMAL");
  const [notas, setNotas] = useState("");
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const totalEstimado = useMemo(
    () => items.reduce((acc, it) => acc + Number(it.cantidad || 0) * Number(it.precio_estimado || 0), 0),
    [items],
  );

  function actualizar(idx: number, patch: Partial<Item>) {
    setItems((arr) => arr.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function aplicarProducto(idx: number, prodId: string) {
    const p = productos.find((x) => x.id === prodId);
    if (!p) {
      actualizar(idx, { producto_id: null });
      return;
    }
    actualizar(idx, {
      producto_id: p.id,
      descripcion: p.nombre,
      unidad: p.unidad,
      precio_estimado: p.precio_unitario,
    });
  }

  function agregar() { setItems((arr) => [...arr, emptyItem()]); }
  function quitar(idx: number) {
    setItems((arr) => arr.length === 1 ? arr : arr.filter((_, i) => i !== idx));
  }

  function guardar() {
    setMsg(null);
    if (!motivo.trim()) { setMsg({ kind: "err", text: "El motivo es requerido" }); return; }
    const itemsValidos = items.filter((it) => it.descripcion.trim() && it.cantidad > 0);
    if (itemsValidos.length === 0) { setMsg({ kind: "err", text: "Agrega al menos un ítem con descripción y cantidad" }); return; }

    start(async () => {
      const r = await crearSolicitudCompraAction({
        sede_id: sedeId || null,
        motivo,
        prioridad,
        notas_solicitante: notas,
        items: itemsValidos.map((it) => ({
          producto_id: it.producto_id,
          descripcion: it.descripcion,
          cantidad: Number(it.cantidad),
          unidad: it.unidad,
          precio_estimado: Number(it.precio_estimado),
          notas: it.notas,
        })),
      });
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      router.push(`/facturacion/compras/${r.id}`);
    });
  }

  return (
    <div className="space-y-4">
      <header>
        <Link href="/facturacion/compras" className="text-xs text-muted hover:text-text">← Solicitudes de compra</Link>
        <h1 className="mt-1 font-display text-2xl">Nueva solicitud de compra</h1>
        <p className="mt-1 text-xs text-muted">
          Al enviarla, el equipo de Facturación recibirá un push para revisarla.
        </p>
      </header>

      {msg && (
        <p className={`rounded-md border px-3 py-2 text-xs ${
          msg.kind === "ok"
            ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200"
            : "border-red-400/30 bg-red-500/[0.08] text-red-200"
        }`}>{msg.text}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-4">
          <div className="surface-card p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field sm:col-span-2">
                <label>Motivo *</label>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  disabled={pending}
                  placeholder="Ej: Reposición de material para SHO, equipo dañado…"
                />
              </div>
              <div className="field">
                <label>Sede asociada (opcional)</label>
                <select value={sedeId} onChange={(e) => setSedeId(e.target.value)} disabled={pending}>
                  <option value="">— sin sede específica —</option>
                  {sedes.map((s) => (
                    <option key={s.id} value={s.id}>{s.abrev} · {s.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Prioridad</label>
                <select value={prioridad} onChange={(e) => setPrioridad(e.target.value as typeof prioridad)} disabled={pending}>
                  <option value="BAJA">Baja</option>
                  <option value="NORMAL">Normal</option>
                  <option value="ALTA">Alta</option>
                  <option value="URGENTE">Urgente</option>
                </select>
              </div>
              <div className="field sm:col-span-2">
                <label>Notas adicionales</label>
                <textarea value={notas} onChange={(e) => setNotas(e.target.value)} disabled={pending} rows={2} placeholder="Cualquier contexto adicional…" />
              </div>
            </div>
          </div>

          <div className="surface-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="section-label">Ítems a comprar</div>
              <button onClick={agregar} disabled={pending} className="btn btn-ghost btn-sm">
                <Icon name="plus" size={12} /> Agregar
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="rounded-lg border border-white/5 bg-[color:var(--bg)] p-3">
                  <div className="grid gap-2 sm:grid-cols-12">
                    <div className="sm:col-span-5">
                      <label className="text-[9px] uppercase tracking-tagline text-muted-2">Producto del catálogo (opcional)</label>
                      <select
                        value={it.producto_id ?? ""}
                        onChange={(e) => aplicarProducto(idx, e.target.value)}
                        disabled={pending}
                        className="w-full rounded-md border border-white/10 bg-[color:var(--card)] px-2 py-1 text-xs"
                      >
                        <option value="">— sin producto del catálogo —</option>
                        {productos.map((p) => (
                          <option key={p.id} value={p.id}>{p.sku} · {p.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-7">
                      <label className="text-[9px] uppercase tracking-tagline text-muted-2">Descripción *</label>
                      <input value={it.descripcion} onChange={(e) => actualizar(idx, { descripcion: e.target.value })} disabled={pending} placeholder="Qué se necesita comprar" className="w-full rounded-md border border-white/10 bg-[color:var(--card)] px-2 py-1 text-xs" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[9px] uppercase tracking-tagline text-muted-2">Cantidad</label>
                      <input type="number" min="0" step="0.001" value={it.cantidad} onChange={(e) => actualizar(idx, { cantidad: Number(e.target.value) })} disabled={pending} className="w-full rounded-md border border-white/10 bg-[color:var(--card)] px-2 py-1 text-xs" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[9px] uppercase tracking-tagline text-muted-2">Unidad</label>
                      <input value={it.unidad} onChange={(e) => actualizar(idx, { unidad: e.target.value })} disabled={pending} className="w-full rounded-md border border-white/10 bg-[color:var(--card)] px-2 py-1 text-xs" />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="text-[9px] uppercase tracking-tagline text-muted-2">Precio estimado</label>
                      <input type="number" min="0" step="0.01" value={it.precio_estimado} onChange={(e) => actualizar(idx, { precio_estimado: Number(e.target.value) })} disabled={pending} className="w-full rounded-md border border-white/10 bg-[color:var(--card)] px-2 py-1 text-xs" />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="text-[9px] uppercase tracking-tagline text-muted-2">Notas del ítem</label>
                      <input value={it.notas} onChange={(e) => actualizar(idx, { notas: e.target.value })} disabled={pending} className="w-full rounded-md border border-white/10 bg-[color:var(--card)] px-2 py-1 text-xs" />
                    </div>
                    <div className="sm:col-span-1 flex items-end justify-end">
                      <button onClick={() => quitar(idx)} disabled={pending || items.length === 1} className="rounded p-1 text-red-300 hover:bg-red-500/20 disabled:opacity-30">
                        <Icon name="trash" size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside>
          <div className="surface-card sticky top-4 p-4">
            <div className="section-label mb-3">Resumen</div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Ítems</dt><dd className="font-mono">{items.length}</dd></div>
              <div className="flex justify-between border-t border-white/10 pt-2">
                <dt className="font-display">Estimado</dt>
                <dd className="font-mono text-lg font-bold text-violet-200">{money(totalEstimado)}</dd>
              </div>
            </dl>
            <button onClick={guardar} disabled={pending} className="btn btn-primary mt-4 w-full">
              {pending ? "Enviando..." : "Enviar solicitud"}
            </button>
            <p className="mt-2 text-[10px] text-muted-2">
              El equipo de Facturación recibirá un push y podrá APROBAR, comprar y marcar como entregada.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
