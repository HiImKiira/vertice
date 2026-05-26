import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Solicitudes de compra" };

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

export default async function ComprasPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("solicitudes_compra")
    .select(`
      id, folio, motivo, prioridad, estado, total_estimado, solicitado_en,
      usuarios:solicitante_id(nombre),
      sedes(abrev, nombre)
    `)
    .order("solicitado_en", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as Array<{
    id: string; folio: string; motivo: string; prioridad: string; estado: string;
    total_estimado: number; solicitado_en: string;
    usuarios: { nombre?: string } | { nombre?: string }[] | null;
    sedes: { abrev?: string; nombre?: string } | { abrev?: string; nombre?: string }[] | null;
  }>;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Solicitudes de compra</h1>
          <p className="text-xs text-muted">
            {rows.length} solicitud{rows.length === 1 ? "" : "es"} · cualquier supervisor puede levantar una
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/facturacion/compras/xlsx"
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30"
            title="Exporta todas las solicitudes a Excel (con detalle de items)"
          >
            📗 Exportar a Excel
          </a>
          <a
            href="/api/facturacion/compras/xlsx?estado=SOLICITADA"
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/30"
            title="Solo solicitudes pendientes de aprobar"
          >
            📗 Solo pendientes
          </a>
          <Link href="/facturacion/compras/nueva" className="btn btn-primary btn-sm">
            <Icon name="plus" size={12} /> Nueva solicitud
          </Link>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-white/10 bg-[color:var(--card)] p-6 text-center text-xs text-muted">
          Sin solicitudes de compra registradas.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => {
            const solic = Array.isArray(s.usuarios) ? s.usuarios[0] : s.usuarios;
            const sede = Array.isArray(s.sedes) ? s.sedes[0] : s.sedes;
            return (
              <li key={s.id}>
                <Link href={`/facturacion/compras/${s.id}`} className="block rounded-lg border border-white/5 bg-[color:var(--card)] p-3 hover:border-violet-400/30">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-violet-200">{s.folio}</span>
                    <span className={`pill ${pillEstado(s.estado)}`}>{s.estado}</span>
                    <span className={`pill ${pillPrioridad(s.prioridad)}`}>{s.prioridad}</span>
                    {sede?.abrev && <span className="font-mono text-[10px] text-blue-200">{sede.abrev}</span>}
                    <span className="ml-auto font-mono text-xs text-amber-200">{money(Number(s.total_estimado))}</span>
                  </div>
                  <p className="line-clamp-2 text-xs">{s.motivo}</p>
                  <p className="mt-1 text-[10px] text-muted-2">
                    {solic?.nombre ?? "—"} · {new Date(s.solicitado_en).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
