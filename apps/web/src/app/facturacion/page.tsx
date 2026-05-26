import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccesoFacturacion } from "@/lib/facturacion-gate";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facturación" };

interface KPIs {
  total_cotizaciones: number;
  monto_cotizado: number;
  cotizaciones_aceptadas: number;
  monto_aceptado: number;
  cotizaciones_pendientes: number;
  cotizaciones_rechazadas: number;
  solicitudes_compra_pendientes: number;
  solicitudes_compra_aprobadas: number;
  productos_activos: number;
  productos_bajo_stock: number;
}

function money(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
}

export default async function FacturacionDashboard() {
  await requireAccesoFacturacion();
  const supabase = await createSupabaseServerClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const [
    { data: kpisData },
    { data: ultimasCot },
    { data: ultimasSol },
    { data: empleadosTotalRaw, count: empleadosTotal },
    { count: empleadosListos },
  ] = await Promise.all([
    supabase.rpc("facturacion_kpis_mes", { p_mes: hoy }),
    supabase
      .from("cotizaciones")
      .select("id, folio, fecha, estado, total, clientes_cotizacion(razon_social)")
      .order("creado_en", { ascending: false })
      .limit(6),
    supabase
      .from("solicitudes_compra")
      .select("id, folio, motivo, prioridad, estado, solicitado_en, total_estimado, usuarios:solicitante_id(nombre)")
      .order("solicitado_en", { ascending: false })
      .limit(6),
    supabase
      .from("empleados")
      .select("id", { count: "exact", head: true })
      .is("fecha_baja", null),
    supabase
      .from("empleados")
      .select("id", { count: "exact", head: true })
      .is("fecha_baja", null)
      .not("banco", "is", null)
      .not("cuenta_bancaria", "is", null)
      .not("clabe", "is", null),
  ]);

  // El segundo dato no se usa, solo el count del primero
  void empleadosTotalRaw;

  const kpis = (kpisData as KPIs[] | null)?.[0] ?? {
    total_cotizaciones: 0,
    monto_cotizado: 0,
    cotizaciones_aceptadas: 0,
    monto_aceptado: 0,
    cotizaciones_pendientes: 0,
    cotizaciones_rechazadas: 0,
    solicitudes_compra_pendientes: 0,
    solicitudes_compra_aprobadas: 0,
    productos_activos: 0,
    productos_bajo_stock: 0,
  };

  const empleadosTotalN = empleadosTotal ?? 0;
  const empleadosListosN = empleadosListos ?? 0;
  const pctListo = empleadosTotalN > 0 ? Math.round((empleadosListosN / empleadosTotalN) * 100) : 0;
  const empleadosIncompletos = empleadosTotalN - empleadosListosN;

  return (
    <div className="space-y-6 animate-fade-up">
      <header>
        <h1 className="font-display text-2xl sm:text-3xl">Facturación</h1>
        <p className="mt-1 text-xs text-muted">
          Centro comercial · cotizaciones, productos, solicitudes de compra y nómina · {new Date(hoy).toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
        </p>
      </header>

      {/* ─── HERO: Empleados Bancarios (destacado siempre) ─── */}
      <Link
        href="/facturacion/empleados-bancarios"
        className="group block rounded-2xl border border-blue-400/30 bg-gradient-to-br from-blue-500/[0.08] via-blue-500/[0.04] to-transparent p-5 transition hover:border-blue-400/60 hover:from-blue-500/[0.12]"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-blue-400/40 bg-blue-500/20 text-blue-200">
            <Icon name="dollar" size={28} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="font-display text-xl text-blue-100">Empleados · Datos bancarios</h2>
              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-200">
                {empleadosListosN} / {empleadosTotalN} listos · {pctListo}%
              </span>
              {empleadosIncompletos > 0 && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                  {empleadosIncompletos} incompletos
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">
              Exporta el <strong className="text-blue-200">Layout SPEI</strong> filtrado por sede, listo para subir a tu banco. Incluye RFC, NSS, CLABE y cuenta.
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${pctListo}%`,
                  background: pctListo >= 90 ? "#10B981" : pctListo >= 50 ? "#3B82F6" : "#F59E0B",
                }}
              />
            </div>
          </div>
          <div className="hidden shrink-0 self-center text-blue-300 sm:block">
            <Icon name="arrow-right" size={20} />
          </div>
        </div>
      </Link>

      {/* ─── KPIs cotizaciones / compras ─── */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI label="Cotizaciones mes" value={String(kpis.total_cotizaciones)} sub={money(kpis.monto_cotizado)} color="amber" icon="receipt" />
        <KPI label="Aceptadas mes" value={String(kpis.cotizaciones_aceptadas)} sub={money(kpis.monto_aceptado)} color="emerald" icon="check" />
        <KPI label="Pendientes" value={String(kpis.cotizaciones_pendientes)} sub={`${kpis.cotizaciones_rechazadas} rechazadas`} color="blue" icon="clock" />
        <KPI label="Solicitudes compra" value={String(kpis.solicitudes_compra_pendientes)} sub={`${kpis.solicitudes_compra_aprobadas} en curso`} color={kpis.solicitudes_compra_pendientes > 0 ? "red" : "violet"} icon="shopping-cart" />
      </section>

      {/* ─── Accesos rápidos ─── */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/facturacion/cotizaciones/nueva" className="surface-card group flex items-center gap-3 p-4 hover:border-amber-400/40">
          <Icon name="plus" size={20} className="text-amber-300" />
          <div>
            <div className="text-sm font-semibold">Nueva cotización</div>
            <div className="text-[10px] text-muted">PDF "MHS by Vortex"</div>
          </div>
        </Link>
        <Link href="/facturacion/compras/nueva" className="surface-card group flex items-center gap-3 p-4 hover:border-violet-400/40">
          <Icon name="shopping-cart" size={20} className="text-violet-300" />
          <div>
            <div className="text-sm font-semibold">Solicitar compra</div>
            <div className="text-[10px] text-muted">Notifica al equipo</div>
          </div>
        </Link>
        <Link href="/facturacion/productos" className="surface-card group flex items-center gap-3 p-4 hover:border-emerald-400/40">
          <Icon name="package" size={20} className="text-emerald-300" />
          <div>
            <div className="text-sm font-semibold">Catálogo de productos</div>
            <div className="text-[10px] text-muted">{kpis.productos_activos} activos · {kpis.productos_bajo_stock} bajo stock</div>
          </div>
        </Link>
      </section>

      {/* ─── Listas: últimas cotizaciones + compras ─── */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="section-label flex items-center gap-2">
              <Icon name="receipt" size={12} className="text-amber-300" />
              Últimas cotizaciones
            </div>
            <Link href="/facturacion/cotizaciones" className="text-[11px] text-muted hover:text-amber-200">Ver todas →</Link>
          </div>
          {(ultimasCot ?? []).length === 0 ? (
            <p className="rounded-md border border-dashed border-white/10 bg-[color:var(--card)] p-4 text-center text-xs text-muted">
              Aún no hay cotizaciones.{" "}
              <Link href="/facturacion/cotizaciones/nueva" className="text-amber-300 underline">Crear la primera →</Link>
            </p>
          ) : (
            <ul className="space-y-1.5">
              {(ultimasCot ?? []).map((c) => {
                const cliente = Array.isArray(c.clientes_cotizacion)
                  ? (c.clientes_cotizacion[0] as { razon_social?: string } | undefined)?.razon_social
                  : (c.clientes_cotizacion as { razon_social?: string } | null)?.razon_social;
                return (
                  <li key={c.id as string}>
                    <Link
                      href={`/facturacion/cotizaciones/${c.id}`}
                      className="flex items-center gap-2 rounded-md border border-white/5 bg-[color:var(--card)] px-3 py-2 hover:border-amber-400/30"
                    >
                      <span className="font-mono text-[11px] text-muted-2">{c.folio as string}</span>
                      <span className={`pill ${pillEstado(c.estado as string)}`}>{c.estado as string}</span>
                      <span className="min-w-0 flex-1 truncate text-xs">{cliente ?? "—"}</span>
                      <span className="font-mono text-xs font-bold text-amber-200">{money(Number(c.total ?? 0))}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="section-label flex items-center gap-2">
              <Icon name="shopping-cart" size={12} className="text-violet-300" />
              Solicitudes de compra recientes
            </div>
            <Link href="/facturacion/compras" className="text-[11px] text-muted hover:text-amber-200">Ver todas →</Link>
          </div>
          {(ultimasSol ?? []).length === 0 ? (
            <p className="rounded-md border border-dashed border-white/10 bg-[color:var(--card)] p-4 text-center text-xs text-muted">
              Sin solicitudes de compra registradas.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {(ultimasSol ?? []).map((s) => {
                const solic = Array.isArray(s.usuarios)
                  ? (s.usuarios[0] as { nombre?: string } | undefined)?.nombre
                  : (s.usuarios as { nombre?: string } | null)?.nombre;
                return (
                  <li key={s.id as string}>
                    <Link
                      href={`/facturacion/compras/${s.id}`}
                      className="block rounded-md border border-white/5 bg-[color:var(--card)] px-3 py-2 hover:border-violet-400/30"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-2">{s.folio as string}</span>
                        <span className={`pill ${pillEstado(s.estado as string)}`}>{s.estado as string}</span>
                        <span className={`pill ${pillPrioridad(s.prioridad as string)}`}>{s.prioridad as string}</span>
                        <span className="ml-auto font-mono text-xs text-amber-200">{money(Number(s.total_estimado ?? 0))}</span>
                      </div>
                      <p className="line-clamp-1 text-xs text-muted">
                        <span className="text-text">{solic ?? "—"}</span> · {s.motivo as string}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function pillEstado(e: string): string {
  switch (e) {
    case "ACEPTADA":
    case "FACTURADA":
    case "ENTREGADA":
      return "pill-green";
    case "ENVIADA":
    case "COMPRADA":
      return "pill-blue";
    case "RECHAZADA":
    case "CANCELADA":
      return "pill-red";
    case "APROBADA":
      return "pill-amber";
    default:
      return "pill-gray";
  }
}

function pillPrioridad(p: string): string {
  switch (p) {
    case "URGENTE":
    case "ALTA":
      return "pill-red";
    case "BAJA":
      return "pill-gray";
    default:
      return "pill-blue";
  }
}

function KPI({ label, value, sub, color, icon }: {
  label: string;
  value: string;
  sub?: string;
  color: "amber" | "blue" | "emerald" | "violet" | "red";
  icon: "receipt" | "check" | "clock" | "shopping-cart";
}) {
  const cls = {
    amber: "border-amber-400/30 bg-amber-500/[0.05] text-amber-200",
    blue: "border-blue-400/30 bg-blue-500/[0.05] text-blue-200",
    emerald: "border-emerald-400/30 bg-emerald-500/[0.05] text-emerald-200",
    violet: "border-violet-400/30 bg-violet-500/[0.05] text-violet-200",
    red: "border-red-400/30 bg-red-500/[0.05] text-red-200",
  }[color];
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon name={icon} size={12} />
        <span className="text-[10px] uppercase tracking-tagline opacity-80">{label}</span>
      </div>
      <div className="font-display text-3xl leading-none">{value}</div>
      {sub && <div className="mt-1.5 text-[10px] opacity-70">{sub}</div>}
    </div>
  );
}
