import Link from "next/link";
import { requireUser , blockCoordinacion } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Icon } from "@/components/Icon";
import { CompraEstadoButtons } from "./CompraEstadoButtons";

export const dynamic = "force-dynamic";

interface PageProps { params: Promise<{ id: string }> }

function money(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

function pillEstado(e: string): string {
  switch (e) {
    case "ENTREGADA": return "pill-green";
    case "COMPRADA": case "APROBADA": return "pill-blue";
    case "RECHAZADA": case "CANCELADA": return "pill-red";
    case "SOLICITADA": return "pill-amber";
    default: return "pill-gray";
  }
}

function pillPrioridad(p: string): string {
  switch (p) {
    case "URGENTE": case "ALTA": return "pill-red";
    case "BAJA": return "pill-gray";
    default: return "pill-blue";
  }
}

export default async function SolicitudCompraDetalle({ params }: PageProps) {
  const { id } = await params;
  const { id: userId, profile } = await requireUser();
  blockCoordinacion(profile.rol);
  const supabase = await createSupabaseServerClient();

  // Si el caller tiene acceso facturacion → ver todo. Si no → solo lo suyo (RLS).
  const { data: u } = await supabase.from("usuarios").select("acceso_facturacion").eq("id", userId).maybeSingle<{ acceso_facturacion: boolean }>();
  const esAdmin = ["SUPERADMIN", "SOPORTE", "CEO"].includes(profile.rol);
  const tieneAcceso = esAdmin || u?.acceso_facturacion === true;

  const [{ data: sol }, { data: items }] = await Promise.all([
    supabase
      .from("solicitudes_compra")
      .select(`
        id, folio, motivo, prioridad, estado, total_estimado,
        notas_solicitante, notas_aprobador,
        solicitado_en, aprobado_en, comprado_en, entregado_en,
        solicitante_id,
        usuarios:solicitante_id(nombre),
        sedes(abrev, nombre)
      `)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("solicitud_compra_items")
      .select("id, descripcion, cantidad, unidad, precio_estimado, precio_real, notas, orden")
      .eq("solicitud_id", id)
      .order("orden"),
  ]);

  if (!sol) {
    return (
      <div className="space-y-4">
        <Link href="/facturacion/compras" className="text-xs text-muted hover:text-text">← Solicitudes</Link>
        <div className="rounded-md border border-red-400/30 bg-red-500/[0.08] p-4 text-sm text-red-200">
          Solicitud no encontrada o sin acceso.
        </div>
      </div>
    );
  }

  const solicitante = Array.isArray(sol.usuarios) ? sol.usuarios[0] : sol.usuarios;
  const sede = Array.isArray(sol.sedes) ? sol.sedes[0] : sol.sedes;
  const esSolicitante = sol.solicitante_id === userId;
  const puedeCambiarEstado = tieneAcceso;
  const puedeCancelarPropia = esSolicitante && sol.estado === "SOLICITADA";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/facturacion/compras" className="text-xs text-muted hover:text-text">← Solicitudes</Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl">{sol.folio as string}</h1>
            <span className={`pill ${pillEstado(sol.estado as string)}`}>{sol.estado as string}</span>
            <span className={`pill ${pillPrioridad(sol.prioridad as string)}`}>{sol.prioridad as string}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Solicitado por {solicitante?.nombre ?? "—"}
            {sede?.abrev && <> · sede <span className="font-mono text-blue-200">{sede.abrev}</span></>}
            {" · "}
            {new Date(sol.solicitado_en as string).toLocaleString("es-MX")}
          </p>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <div className="surface-card p-4">
            <div className="section-label mb-2">Motivo</div>
            <p className="text-sm">{sol.motivo as string}</p>
            {sol.notas_solicitante && (
              <div className="mt-3 rounded-md bg-white/5 p-3">
                <div className="text-[10px] uppercase tracking-tagline text-muted-2">Notas del solicitante</div>
                <p className="mt-1 whitespace-pre-wrap text-xs">{sol.notas_solicitante as string}</p>
              </div>
            )}
          </div>

          <div className="surface-card overflow-hidden">
            <div className="p-3 section-label">Ítems solicitados</div>
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03] text-left">
                <tr>
                  <th className="px-2 py-1.5 font-mono text-[9px]">#</th>
                  <th className="px-2 py-1.5 font-mono text-[9px]">Descripción</th>
                  <th className="px-2 py-1.5 text-right font-mono text-[9px]">Cant.</th>
                  <th className="px-2 py-1.5 font-mono text-[9px]">Unidad</th>
                  <th className="px-2 py-1.5 text-right font-mono text-[9px]">P. Estimado</th>
                  <th className="px-2 py-1.5 text-right font-mono text-[9px]">P. Real</th>
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((it, i) => (
                  <tr key={it.id as string} className="border-t border-white/5">
                    <td className="px-2 py-1.5 font-mono text-muted-2">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      {it.descripcion as string}
                      {it.notas ? <span className="ml-1 text-[10px] text-muted-2">· {it.notas as string}</span> : null}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{Number(it.cantidad).toLocaleString("es-MX")}</td>
                    <td className="px-2 py-1.5 font-mono text-muted">{it.unidad as string}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{money(Number(it.precio_estimado))}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-emerald-200">
                      {it.precio_real != null ? money(Number(it.precio_real)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sol.notas_aprobador && (
            <div className="surface-card p-4">
              <div className="section-label mb-2">Notas del aprobador</div>
              <p className="whitespace-pre-wrap text-xs text-muted">{sol.notas_aprobador as string}</p>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="surface-card p-4">
            <div className="section-label mb-3">Total estimado</div>
            <div className="font-mono text-2xl font-bold text-violet-200">{money(Number(sol.total_estimado))}</div>
          </div>

          {(puedeCambiarEstado || puedeCancelarPropia) && (
            <CompraEstadoButtons
              id={id}
              estadoActual={sol.estado as string}
              puedeCambiarEstado={puedeCambiarEstado}
              puedeCancelarPropia={puedeCancelarPropia}
            />
          )}

          <div className="surface-card p-4 text-[11px] text-muted">
            <div className="section-label mb-2">Timeline</div>
            <div>Solicitada: {new Date(sol.solicitado_en as string).toLocaleString("es-MX")}</div>
            {sol.aprobado_en && <div className="text-blue-200">Aprobada: {new Date(sol.aprobado_en as string).toLocaleString("es-MX")}</div>}
            {sol.comprado_en && <div className="text-emerald-200">Comprada: {new Date(sol.comprado_en as string).toLocaleString("es-MX")}</div>}
            {sol.entregado_en && <div className="text-emerald-300">Entregada: {new Date(sol.entregado_en as string).toLocaleString("es-MX")}</div>}
          </div>
        </aside>
      </section>
    </div>
  );
}
