import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccesoFacturacion } from "@/lib/facturacion-gate";
import { Icon } from "@/components/Icon";
import { EstadoButtons } from "./EstadoButtons";

export const dynamic = "force-dynamic";

interface PageProps { params: Promise<{ id: string }> }

function money(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

function pillEstado(e: string): string {
  switch (e) {
    case "ACEPTADA": case "FACTURADA": return "pill-green";
    case "ENVIADA": return "pill-blue";
    case "RECHAZADA": case "CANCELADA": return "pill-red";
    case "BORRADOR": return "pill-gray";
    default: return "pill-amber";
  }
}

export default async function CotizacionDetallePage({ params }: PageProps) {
  await requireAccesoFacturacion();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: cot }, { data: lineas }] = await Promise.all([
    supabase
      .from("cotizaciones")
      .select(`
        id, folio, fecha, vigencia_dias, estado,
        subtotal, iva_total, total, notas, condiciones,
        enviado_en, aceptado_en, rechazado_motivo, creado_en,
        clientes_cotizacion(razon_social, rfc, contacto_nombre, contacto_email, contacto_telefono, direccion),
        usuarios:creado_por(nombre)
      `)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("cotizacion_lineas")
      .select("id, descripcion_snapshot, unidad_snapshot, cantidad, precio_unitario, iva_pct, subtotal, iva, total, orden")
      .eq("cotizacion_id", id)
      .order("orden"),
  ]);

  if (!cot) {
    return (
      <div className="space-y-4">
        <Link href="/facturacion/cotizaciones" className="text-xs text-muted hover:text-text">← Cotizaciones</Link>
        <div className="rounded-md border border-red-400/30 bg-red-500/[0.08] p-4 text-sm text-red-200">
          Cotización no encontrada o sin acceso.
        </div>
      </div>
    );
  }

  const cliente = Array.isArray(cot.clientes_cotizacion) ? cot.clientes_cotizacion[0] : cot.clientes_cotizacion;
  const creador = Array.isArray(cot.usuarios) ? cot.usuarios[0] : cot.usuarios;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/facturacion/cotizaciones" className="text-xs text-muted hover:text-text">← Cotizaciones</Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl">{cot.folio as string}</h1>
            <span className={`pill ${pillEstado(cot.estado as string)}`}>{cot.estado as string}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Fecha {cot.fecha as string} · vigencia {cot.vigencia_dias as number} días
            {creador?.nombre && <> · creó {creador.nombre}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/facturacion/cotizaciones/${id}/pdf`}
            target="_blank"
            rel="noopener"
            className="btn btn-primary btn-sm"
          >
            <Icon name="file-text" size={12} /> Ver / Descargar PDF
          </a>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          {/* Cliente */}
          <div className="surface-card p-4">
            <div className="section-label mb-2">Cliente</div>
            <div className="font-semibold">{cliente?.razon_social ?? "—"}</div>
            {cliente?.rfc && <div className="font-mono text-xs text-amber-200">RFC: {cliente.rfc}</div>}
            {cliente?.contacto_nombre && <div className="mt-1 text-xs text-muted">{cliente.contacto_nombre}</div>}
            <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted">
              {cliente?.contacto_email && <span>{cliente.contacto_email}</span>}
              {cliente?.contacto_telefono && <span>{cliente.contacto_telefono}</span>}
            </div>
            {cliente?.direccion && <div className="mt-1 text-[10px] text-muted-2">{cliente.direccion}</div>}
          </div>

          {/* Líneas */}
          <div className="surface-card overflow-hidden">
            <div className="p-3 section-label">Conceptos cotizados</div>
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03] text-left">
                <tr>
                  <th className="px-2 py-1.5 font-mono text-[9px]">#</th>
                  <th className="px-2 py-1.5 font-mono text-[9px]">Descripción</th>
                  <th className="px-2 py-1.5 text-right font-mono text-[9px]">Cant.</th>
                  <th className="px-2 py-1.5 font-mono text-[9px]">Unidad</th>
                  <th className="px-2 py-1.5 text-right font-mono text-[9px]">P. Unit</th>
                  <th className="px-2 py-1.5 text-right font-mono text-[9px]">IVA</th>
                  <th className="px-2 py-1.5 text-right font-mono text-[9px]">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(lineas ?? []).map((l, i) => (
                  <tr key={l.id as string} className="border-t border-white/5">
                    <td className="px-2 py-1.5 font-mono text-muted-2">{i + 1}</td>
                    <td className="px-2 py-1.5">{l.descripcion_snapshot as string}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{Number(l.cantidad).toLocaleString("es-MX")}</td>
                    <td className="px-2 py-1.5 font-mono text-muted">{l.unidad_snapshot as string}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{money(Number(l.precio_unitario))}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted">{Number(l.iva_pct)}%</td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold text-amber-200">{money(Number(l.subtotal))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(cot.notas || cot.condiciones) && (
            <div className="surface-card space-y-3 p-4">
              {cot.notas && (
                <div>
                  <div className="section-label mb-1">Notas</div>
                  <p className="whitespace-pre-wrap text-xs text-muted">{cot.notas as string}</p>
                </div>
              )}
              {cot.condiciones && (
                <div>
                  <div className="section-label mb-1">Condiciones</div>
                  <p className="whitespace-pre-wrap text-xs text-muted">{cot.condiciones as string}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="surface-card p-4">
            <div className="section-label mb-3">Totales</div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="font-mono">{money(Number(cot.subtotal))}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">IVA</dt><dd className="font-mono">{money(Number(cot.iva_total))}</dd></div>
              <div className="flex justify-between border-t border-white/10 pt-2">
                <dt className="font-display">Total</dt>
                <dd className="font-mono text-xl font-bold text-amber-200">{money(Number(cot.total))}</dd>
              </div>
            </dl>
          </div>

          <EstadoButtons id={id} estadoActual={cot.estado as string} />

          <div className="surface-card p-4 text-[11px] text-muted">
            <div className="section-label mb-2">Eventos</div>
            <div>Creada: {new Date(cot.creado_en as string).toLocaleString("es-MX")}</div>
            {cot.enviado_en && <div>Enviada: {new Date(cot.enviado_en as string).toLocaleString("es-MX")}</div>}
            {cot.aceptado_en && <div className="text-emerald-300">Aceptada: {new Date(cot.aceptado_en as string).toLocaleString("es-MX")}</div>}
            {cot.rechazado_motivo && <div className="mt-2 rounded bg-red-500/15 p-2 text-red-200">Rechazo: {cot.rechazado_motivo as string}</div>}
          </div>
        </aside>
      </section>
    </div>
  );
}
