import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccesoFacturacion } from "@/lib/facturacion-gate";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cotizaciones · Facturación" };

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

export default async function CotizacionesPage() {
  await requireAccesoFacturacion();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("cotizaciones")
    .select("id, folio, fecha, estado, total, vigencia_dias, clientes_cotizacion(razon_social, rfc)")
    .order("fecha", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as Array<{
    id: string; folio: string; fecha: string; estado: string; total: number; vigencia_dias: number;
    clientes_cotizacion: { razon_social: string; rfc: string | null } | { razon_social: string; rfc: string | null }[] | null;
  }>;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Cotizaciones</h1>
          <p className="text-xs text-muted">{rows.length} registrada{rows.length === 1 ? "" : "s"}</p>
        </div>
        <Link href="/facturacion/cotizaciones/nueva" className="btn btn-primary btn-sm">
          <Icon name="plus" size={12} /> Nueva cotización
        </Link>
      </header>

      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-xs">
          <thead className="bg-white/[0.03] text-left">
            <tr>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-tagline">Folio</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-tagline">Fecha</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-tagline">Cliente</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-tagline">Estado</th>
              <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-tagline">Total</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
                  Sin cotizaciones aún.{" "}
                  <Link href="/facturacion/cotizaciones/nueva" className="text-amber-300 underline">Crear la primera →</Link>
                </td>
              </tr>
            ) : rows.map((c) => {
              const cliente = Array.isArray(c.clientes_cotizacion) ? c.clientes_cotizacion[0] : c.clientes_cotizacion;
              return (
                <tr key={c.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-3 py-2">
                    <Link href={`/facturacion/cotizaciones/${c.id}`} className="font-mono text-amber-200 hover:underline">
                      {c.folio}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-muted">{c.fecha}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold">{cliente?.razon_social ?? "—"}</div>
                    {cliente?.rfc && <div className="font-mono text-[9px] text-muted-2">{cliente.rfc}</div>}
                  </td>
                  <td className="px-3 py-2"><span className={`pill ${pillEstado(c.estado)}`}>{c.estado}</span></td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-amber-200">{money(Number(c.total))}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/facturacion/cotizaciones/${c.id}`} className="text-[10px] text-muted hover:text-amber-200">Ver →</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
