"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { crearCotizacionAction, crearClienteAction } from "../../actions";

export interface ClienteOpt { id: string; razon_social: string; rfc: string | null }
export interface ProductoOpt { id: string; sku: string; nombre: string; unidad: string; precio_unitario: number; iva_pct: number }

interface Linea {
  producto_id: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  iva_pct: number;
}

function emptyLinea(): Linea {
  return { producto_id: null, descripcion: "", unidad: "PIEZA", cantidad: 1, precio_unitario: 0, iva_pct: 16 };
}

function money(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

export function NuevaCotizacionClient({ clientes, productos }: { clientes: ClienteOpt[]; productos: ProductoOpt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? "");
  const [vigenciaDias, setVigenciaDias] = useState(30);
  const [notas, setNotas] = useState("");
  const [condiciones, setCondiciones] = useState("Precios en MXN. Pago contra entrega. Cotización sujeta a disponibilidad de inventario.");
  const [lineas, setLineas] = useState<Linea[]>([emptyLinea()]);
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);
  const [nuevoRazon, setNuevoRazon] = useState("");
  const [nuevoRfc, setNuevoRfc] = useState("");
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [clientesLocal, setClientesLocal] = useState<ClienteOpt[]>(clientes);

  const totales = useMemo(() => {
    let subtotal = 0, iva = 0;
    for (const l of lineas) {
      const sub = Number(l.cantidad) * Number(l.precio_unitario);
      subtotal += sub;
      iva += sub * (Number(l.iva_pct) / 100);
    }
    return { subtotal: Math.round(subtotal * 100) / 100, iva: Math.round(iva * 100) / 100, total: Math.round((subtotal + iva) * 100) / 100 };
  }, [lineas]);

  function actualizarLinea(idx: number, patch: Partial<Linea>) {
    setLineas((arr) => arr.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }

  function aplicarProducto(idx: number, prodId: string) {
    const p = productos.find((x) => x.id === prodId);
    if (!p) {
      actualizarLinea(idx, { producto_id: null });
      return;
    }
    actualizarLinea(idx, {
      producto_id: p.id,
      descripcion: p.nombre,
      unidad: p.unidad,
      precio_unitario: p.precio_unitario,
      iva_pct: p.iva_pct,
    });
  }

  function agregarLinea() { setLineas((arr) => [...arr, emptyLinea()]); }
  function quitarLinea(idx: number) {
    setLineas((arr) => arr.length === 1 ? arr : arr.filter((_, i) => i !== idx));
  }

  function crearCliente() {
    if (!nuevoRazon.trim()) { setMsg({ kind: "err", text: "Razón social requerida" }); return; }
    setMsg(null);
    start(async () => {
      const r = await crearClienteAction({
        razon_social: nuevoRazon,
        rfc: nuevoRfc,
        contacto_email: nuevoEmail,
      });
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      const nuevo: ClienteOpt = { id: r.id, razon_social: nuevoRazon.trim(), rfc: nuevoRfc.trim() || null };
      setClientesLocal((arr) => [...arr, nuevo].sort((a, b) => a.razon_social.localeCompare(b.razon_social)));
      setClienteId(r.id);
      setShowNuevoCliente(false);
      setNuevoRazon(""); setNuevoRfc(""); setNuevoEmail("");
      setMsg({ kind: "ok", text: "✓ Cliente creado" });
    });
  }

  function guardar() {
    setMsg(null);
    if (!clienteId) { setMsg({ kind: "err", text: "Selecciona un cliente" }); return; }
    const lineasValidas = lineas.filter((l) => l.descripcion.trim() && l.cantidad > 0);
    if (lineasValidas.length === 0) { setMsg({ kind: "err", text: "Agrega al menos una línea con descripción y cantidad" }); return; }

    start(async () => {
      const r = await crearCotizacionAction({
        cliente_id: clienteId,
        vigencia_dias: vigenciaDias,
        notas,
        condiciones,
        lineas: lineasValidas.map((l) => ({
          producto_id: l.producto_id,
          descripcion: l.descripcion,
          unidad: l.unidad,
          cantidad: Number(l.cantidad),
          precio_unitario: Number(l.precio_unitario),
          iva_pct: Number(l.iva_pct),
        })),
      });
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      router.push(`/facturacion/cotizaciones/${r.id}`);
    });
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/facturacion/cotizaciones" className="text-xs text-muted hover:text-text">← Cotizaciones</Link>
          <h1 className="mt-1 font-display text-2xl">Nueva cotización</h1>
        </div>
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
            <div className="section-label mb-2">Cliente</div>
            <div className="flex flex-wrap gap-2">
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                disabled={pending}
                className="flex-1 rounded-md border border-white/10 bg-[color:var(--bg)] px-2 py-1.5 text-sm"
              >
                <option value="">— selecciona —</option>
                {clientesLocal.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razon_social}{c.rfc ? ` · ${c.rfc}` : ""}
                  </option>
                ))}
              </select>
              <button onClick={() => setShowNuevoCliente(!showNuevoCliente)} className="btn btn-ghost btn-sm">
                {showNuevoCliente ? "Cancelar" : "+ Nuevo"}
              </button>
            </div>
            {showNuevoCliente && (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <input placeholder="Razón social *" value={nuevoRazon} onChange={(e) => setNuevoRazon(e.target.value)} className="rounded-md border border-white/10 bg-[color:var(--bg)] px-2 py-1 text-xs" />
                <input placeholder="RFC" value={nuevoRfc} onChange={(e) => setNuevoRfc(e.target.value.toUpperCase())} className="rounded-md border border-white/10 bg-[color:var(--bg)] px-2 py-1 text-xs" />
                <input placeholder="Email contacto" value={nuevoEmail} onChange={(e) => setNuevoEmail(e.target.value)} className="rounded-md border border-white/10 bg-[color:var(--bg)] px-2 py-1 text-xs" />
                <button onClick={crearCliente} disabled={pending} className="btn btn-primary btn-sm sm:col-span-3">Crear cliente</button>
              </div>
            )}
          </div>

          <div className="surface-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="section-label">Líneas de cotización</div>
              <button onClick={agregarLinea} disabled={pending} className="btn btn-ghost btn-sm">
                <Icon name="plus" size={12} /> Agregar línea
              </button>
            </div>
            <div className="space-y-2">
              {lineas.map((l, idx) => (
                <div key={idx} className="rounded-lg border border-white/5 bg-[color:var(--bg)] p-3">
                  <div className="grid gap-2 sm:grid-cols-12">
                    <div className="sm:col-span-5">
                      <label className="text-[9px] uppercase tracking-tagline text-muted-2">Producto del catálogo</label>
                      <select
                        value={l.producto_id ?? ""}
                        onChange={(e) => aplicarProducto(idx, e.target.value)}
                        disabled={pending}
                        className="w-full rounded-md border border-white/10 bg-[color:var(--card)] px-2 py-1 text-xs"
                      >
                        <option value="">— libre / sin producto —</option>
                        {productos.map((p) => (
                          <option key={p.id} value={p.id}>{p.sku} · {p.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-7">
                      <label className="text-[9px] uppercase tracking-tagline text-muted-2">Descripción para el PDF *</label>
                      <input
                        value={l.descripcion}
                        onChange={(e) => actualizarLinea(idx, { descripcion: e.target.value })}
                        disabled={pending}
                        placeholder="Lo que verá el cliente en el PDF"
                        className="w-full rounded-md border border-white/10 bg-[color:var(--card)] px-2 py-1 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[9px] uppercase tracking-tagline text-muted-2">Cantidad</label>
                      <input type="number" step="0.001" min="0" value={l.cantidad} onChange={(e) => actualizarLinea(idx, { cantidad: Number(e.target.value) })} disabled={pending} className="w-full rounded-md border border-white/10 bg-[color:var(--card)] px-2 py-1 text-xs" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[9px] uppercase tracking-tagline text-muted-2">Unidad</label>
                      <input value={l.unidad} onChange={(e) => actualizarLinea(idx, { unidad: e.target.value })} disabled={pending} className="w-full rounded-md border border-white/10 bg-[color:var(--card)] px-2 py-1 text-xs" />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="text-[9px] uppercase tracking-tagline text-muted-2">Precio unit.</label>
                      <input type="number" step="0.01" min="0" value={l.precio_unitario} onChange={(e) => actualizarLinea(idx, { precio_unitario: Number(e.target.value) })} disabled={pending} className="w-full rounded-md border border-white/10 bg-[color:var(--card)] px-2 py-1 text-xs" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[9px] uppercase tracking-tagline text-muted-2">IVA %</label>
                      <input type="number" step="0.01" min="0" max="100" value={l.iva_pct} onChange={(e) => actualizarLinea(idx, { iva_pct: Number(e.target.value) })} disabled={pending} className="w-full rounded-md border border-white/10 bg-[color:var(--card)] px-2 py-1 text-xs" />
                    </div>
                    <div className="sm:col-span-2 flex items-end justify-end">
                      <div className="text-right">
                        <div className="text-[9px] text-muted-2">Subtotal</div>
                        <div className="font-mono text-xs font-bold text-amber-200">
                          {money(Number(l.cantidad) * Number(l.precio_unitario))}
                        </div>
                      </div>
                    </div>
                    <div className="sm:col-span-1 flex items-end justify-end">
                      <button onClick={() => quitarLinea(idx)} disabled={pending || lineas.length === 1} className="rounded p-1 text-red-300 hover:bg-red-500/20 disabled:opacity-30">
                        <Icon name="trash" size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-card p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label>Vigencia (días)</label>
                <input type="number" min="1" max="365" value={vigenciaDias} onChange={(e) => setVigenciaDias(Number(e.target.value))} disabled={pending} />
              </div>
              <div />
              <div className="field sm:col-span-2">
                <label>Notas para el cliente (aparecen en el PDF)</label>
                <textarea value={notas} onChange={(e) => setNotas(e.target.value)} disabled={pending} rows={2} />
              </div>
              <div className="field sm:col-span-2">
                <label>Condiciones</label>
                <textarea value={condiciones} onChange={(e) => setCondiciones(e.target.value)} disabled={pending} rows={3} />
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-3">
          <div className="surface-card sticky top-4 p-4">
            <div className="section-label mb-3">Resumen</div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="font-mono">{money(totales.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">IVA</dt><dd className="font-mono">{money(totales.iva)}</dd></div>
              <div className="flex justify-between border-t border-white/10 pt-2"><dt className="font-display">Total</dt><dd className="font-mono text-lg font-bold text-amber-200">{money(totales.total)}</dd></div>
            </dl>
            <button onClick={guardar} disabled={pending || !clienteId} className="btn btn-primary mt-4 w-full">
              {pending ? "Creando..." : "Crear cotización (BORRADOR)"}
            </button>
            <p className="mt-2 text-[10px] text-muted-2">
              Se genera con estado BORRADOR. Puedes descargar el PDF y enviar al cliente desde la pantalla de detalle.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
