import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { NotasEditor } from "./NotasEditor";
import { MensajePanel } from "./MensajePanel";
import { GestionPanel } from "./GestionPanel";
import { DatosEditor } from "./DatosEditor";
import { AsignacionesEditorInline } from "./AsignacionesEditor";
import { AutoRefresh } from "../../../live/AutoRefresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "Supervisor · RH Pro" };

interface PageProps {
  params: Promise<{ id: string }>;
}

interface ResumenRow {
  id: string;
  nombre: string;
  username: string;
  email: string;
  rol: string;
  activo: boolean;
  notas: string | null;
  notas_actualizado_en: string | null;
  notas_autor_username: string | null;
  ultimo_acceso: string | null;
  creado_en: string;
  sedes_asignadas: number;
  jornadas_asignadas: number;
  empleados_a_cargo: number;
  capturadas_hoy: number;
  empleados_total_hoy: number;
  pct_hoy: number;
  capturas_mes: number;
  tickets_abiertos: number;
  push_dispositivos: number;
  ultima_captura: string | null;
  ausente_desde: string | null;
  ausente_hasta: string | null;
  ausente_motivo: string | null;
  esta_ausente: boolean;
}

interface AsignRow {
  id: string;
  jornada: string;
  sedes: { id: string; abrev: string; nombre: string } | { id: string; abrev: string; nombre: string }[] | null;
}

interface BitacoraRow {
  fecha: string;
  codigo: string;
  actualizado_en: string;
  empleado_nombre: string;
  empleado_numero: string;
  sede_abrev: string;
}

function meridaToday(): string {
  const d = new Date();
  d.setHours(d.getHours() - 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function SupervisorDetailPage({ params }: PageProps) {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  // Paralelo: resumen, asignaciones, bitácora, cobertura detalle, flag facturación, sedes activas
  const [resumenRes, asignRes, bitacoraRes, coberturaDetRes, mensualRes, flagRes, sedesRes] = await Promise.all([
    supabase.rpc("supervisor_resumen", { p_usuario_id: id }),
    supabase
      .from("asignaciones_supervisor")
      .select("id, jornada, sedes(id, abrev, nombre)")
      .eq("usuario_id", id)
      .eq("activo", true)
      .order("jornada"),
    supabase.rpc("bitacora_supervisor", { p_usuario_id: id, p_limite: 20 }),
    supabase.rpc("cobertura_supervisor_detalle", { p_usuario_id: id, p_fecha: meridaToday() }),
    (async () => {
      const d = new Date();
      d.setHours(d.getHours() - 6);
      return supabase.rpc("cobertura_mensual_supervisor", {
        p_usuario_id: id,
        p_year: d.getFullYear(),
        p_month: d.getMonth() + 1,
      });
    })(),
    supabase.from("usuarios").select("acceso_facturacion").eq("id", id).maybeSingle(),
    supabase
      .from("sedes")
      .select("id, abrev, nombre")
      .or("activa.is.null,activa.eq.true")
      .order("abrev"),
  ]);
  const accesoFacturacion = ((flagRes.data as { acceso_facturacion?: boolean } | null)?.acceso_facturacion) === true;
  const sedesActivas = (sedesRes.data ?? []) as Array<{ id: string; abrev: string; nombre: string }>;

  const resumen = (resumenRes.data as ResumenRow[] | null)?.[0];
  if (!resumen) {
    // En vez de 404 ciego, mostramos error útil con la causa probable.
    const causa = resumenRes.error
      ? `RPC supervisor_resumen falló: ${resumenRes.error.message}. Probablemente la migración v19 / v20 no se aplicó en Supabase.`
      : `No existe un supervisor con id=${id}, o RLS está bloqueando la lectura.`;
    return (
      <main className="min-h-screen overflow-x-hidden text-text">
        <Topbar user={profile} />
        <div className="relative z-10 mx-auto max-w-[800px] px-4 py-10 sm:px-6">
          <Link href="/rh-pro/supervisores" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> Centro de supervisores
          </Link>
          <div className="mt-6 rounded-xl border border-red-400/40 bg-red-500/[0.08] p-5 text-sm text-red-200">
            <h1 className="mb-2 font-display text-xl">No se pudo cargar la ficha del supervisor</h1>
            <p className="text-[12px] text-red-300/80">{causa}</p>
            <p className="mt-3 text-[11px] text-muted">
              Sugerencias:
            </p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-[11px] text-muted">
              <li>Aplica los SQL v19 y v20 en Supabase Studio si aún no lo hiciste.</li>
              <li>Verifica que el id sea correcto: <code className="font-mono">{id}</code></li>
              <li>Si el problema persiste, abre un ticket en /soporte.</li>
            </ul>
          </div>
        </div>
      </main>
    );
  }

  const asignaciones = (asignRes.data ?? []) as AsignRow[];
  const bitacora = (bitacoraRes.data ?? []) as BitacoraRow[];
  const coberturaDet = (coberturaDetRes.data ?? []) as Array<{
    sede_abrev: string; sede_nombre: string; jornada: string;
    empleados: number; capturadas: number; pct: number;
  }>;
  const mensual = (mensualRes.data as Array<Record<string, number>> | null)?.[0];

  const faltantes = Math.max(0, resumen.empleados_a_cargo - resumen.capturadas_hoy);
  const colorPct = resumen.pct_hoy >= 95 ? "#10B981" : resumen.pct_hoy >= 50 ? "#F59E0B" : "#EF4444";
  const hoy = meridaToday();

  // Agrupar asignaciones por sede
  const porSede = new Map<string, { sede: { abrev: string; nombre: string }; jornadas: string[] }>();
  for (const a of asignaciones) {
    const sede = Array.isArray(a.sedes) ? a.sedes[0] : a.sedes;
    if (!sede) continue;
    if (!porSede.has(sede.id)) porSede.set(sede.id, { sede: { abrev: sede.abrev, nombre: sede.nombre }, jornadas: [] });
    porSede.get(sede.id)!.jornadas.push(a.jornada);
  }
  const sedesAgrupadas = [...porSede.values()];

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/rh-pro/supervisores" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
          <Icon name="arrow-left" size={12} /> Centro de supervisores
        </Link>

        {/* Header */}
        <header className="mt-2 mb-6 animate-fade-up">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`pill ${resumen.activo ? "pill-green" : "pill-red"}`}>{resumen.activo ? "ACTIVO" : "INACTIVO"}</span>
                {resumen.esta_ausente && (
                  <span className="pill pill-amber animate-glow">
                    AUSENTE {resumen.ausente_hasta && `hasta ${resumen.ausente_hasta}`}
                  </span>
                )}
                <span className={`role-badge role-${resumen.rol}`}>{resumen.rol}</span>
                {resumen.push_dispositivos > 0 ? (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300">
                    {resumen.push_dispositivos} dispositivo{resumen.push_dispositivos === 1 ? "" : "s"} push
                  </span>
                ) : (
                  <span className="rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-red-300">
                    SIN PUSH
                  </span>
                )}
              </div>
              <h1 className="mt-2 font-display text-2xl sm:text-3xl">{resumen.nombre}</h1>
              <p className="mt-1 text-xs text-muted">
                <span className="font-mono">@{resumen.username}</span> · {resumen.email} · alta {new Date(resumen.creado_en).toLocaleDateString("es-MX")}
                {resumen.ultimo_acceso && <> · último acceso {new Date(resumen.ultimo_acceso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</>}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Link
                href={`/pase-lista${sedesAgrupadas[0] ? `?sede=${Object.keys(porSede)[0]}` : ""}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-blue-400/40 bg-blue-500/15 px-3 py-2 text-xs font-semibold text-blue-200 hover:bg-blue-500/30"
                title="Ver pase de lista como si fuera él (admin override)"
              >
                Ir a su pase de lista <Icon name="arrow-right" size={12} />
              </Link>
              <AutoRefresh generadoEn={new Date().toISOString()} intervalSeconds={30} />
            </div>
          </div>
        </header>

        {/* KPI principales */}
        <section className="mb-6 grid gap-3 sm:grid-cols-4">
          <KPI label="Sedes asignadas" value={resumen.sedes_asignadas} sub={`${resumen.jornadas_asignadas} jornadas`} color="violet" />
          <KPI label="Empleados a cargo" value={resumen.empleados_a_cargo} sub="match sede×jornada" color="blue" />
          <KPI
            label="Cobertura hoy"
            value={`${resumen.pct_hoy}%`}
            sub={`${resumen.capturadas_hoy}/${resumen.empleados_a_cargo}`}
            color={resumen.pct_hoy >= 95 ? "emerald" : resumen.pct_hoy >= 50 ? "amber" : "red"}
          />
          <KPI label="Capturas del mes" value={resumen.capturas_mes} sub={mensual ? `${mensual.pct_a_hoy ?? 0}% del esperado` : ""} color="emerald" />
        </section>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-6">
            {/* Asignaciones (editable) */}
            <AsignacionesEditorInline
              supervisorId={resumen.id}
              callerRol={profile.rol}
              asignaciones={asignaciones
                .map((a) => {
                  const s = Array.isArray(a.sedes) ? a.sedes[0] : a.sedes;
                  if (!s) return null;
                  return { id: a.id, sede_id: s.id, sede_abrev: s.abrev, sede_nombre: s.nombre, jornada: a.jornada };
                })
                .filter((x): x is { id: string; sede_id: string; sede_abrev: string; sede_nombre: string; jornada: string } => x !== null)}
              sedes={sedesActivas}
            />

            {/* Cobertura hoy detalle */}
            {coberturaDet.length > 0 && (
              <section>
                <div className="section-label mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Icon name="chart" size={12} className="text-muted" />
                    Cobertura hoy por sede × jornada
                  </span>
                  <span className="text-[10px] font-display font-bold" style={{ color: colorPct }}>
                    {resumen.pct_hoy}%
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {coberturaDet.map((d, i) => {
                    const c = d.pct >= 95 ? "#10B981" : d.pct >= 50 ? "#F59E0B" : "#EF4444";
                    return (
                      <li key={i} className="rounded-md border border-white/5 bg-[color:var(--card)] p-2">
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0 flex-1">
                            <span className="font-mono text-[10px] text-muted-2">{d.sede_abrev}</span>
                            <span className="ml-2 rounded bg-white/5 px-1 font-mono text-[9px] font-bold">{d.jornada}</span>
                            <span className="ml-2 truncate text-muted">{d.sede_nombre}</span>
                          </div>
                          <span className="font-mono text-[10px] text-muted">{d.capturadas}/{d.empleados}</span>
                          <span className="font-display text-sm font-bold" style={{ color: c, minWidth: "3rem", textAlign: "right" }}>{d.pct}%</span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-white/5">
                          <div className="h-full" style={{ width: `${d.pct}%`, background: c }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Notas */}
            <section>
              <div className="section-label mb-3 flex items-center gap-2">
                <Icon name="file-text" size={12} className="text-amber-300" />
                Notas internas (solo RH)
              </div>
              <NotasEditor
                supervisorId={resumen.id}
                initial={resumen.notas ?? ""}
                ultimaActualizacion={{
                  fecha: resumen.notas_actualizado_en,
                  autor: resumen.notas_autor_username,
                }}
              />
            </section>

            {/* Bitácora */}
            <section>
              <div className="section-label mb-3 flex items-center gap-2">
                <Icon name="clock" size={12} className="text-muted" />
                Últimas 20 capturas
              </div>
              {bitacora.length === 0 ? (
                <p className="rounded-md border border-dashed border-white/10 bg-[color:var(--card)] p-4 text-center text-xs text-muted">
                  Sin capturas registradas.
                </p>
              ) : (
                <ol className="space-y-1">
                  {bitacora.map((b, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-md border border-white/5 bg-[color:var(--card)] px-2 py-1.5 text-[11px]">
                      <span className="font-mono text-[10px] text-muted-2">{b.fecha}</span>
                      <span className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold text-white" style={{ background: codigoColor(b.codigo) }}>
                        {b.codigo}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-mono text-muted-2">{b.sede_abrev}</span> · #{b.empleado_numero} {b.empleado_nombre}
                      </span>
                      <span className="font-mono text-[9px] text-muted-2">
                        {new Date(b.actualizado_en).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          {/* Columna derecha: acciones */}
          <div className="space-y-6">
            <DatosEditor
              supervisorId={resumen.id}
              nombre={resumen.nombre}
              username={resumen.username}
              email={resumen.email}
              rol={resumen.rol}
              activo={resumen.activo}
              callerRol={profile.rol}
            />

            <MensajePanel
              supervisorId={resumen.id}
              supervisorNombre={resumen.nombre}
              push_dispositivos={resumen.push_dispositivos}
              pct_hoy={resumen.pct_hoy}
              faltantes={faltantes}
              fechaHoy={hoy}
            />

            <GestionPanel
              supervisorId={resumen.id}
              supervisorNombre={resumen.nombre}
              callerRol={profile.rol}
              ausenteDesde={resumen.ausente_desde}
              ausenteHasta={resumen.ausente_hasta}
              ausenteMotivo={resumen.ausente_motivo}
              accesoFacturacion={accesoFacturacion}
            />

            {/* Stats secundarios */}
            <section className="surface-card p-4">
              <div className="section-label mb-3">Resumen rápido</div>
              <dl className="space-y-2 text-xs">
                <Row label="Tickets abiertos" value={String(resumen.tickets_abiertos)} />
                <Row label="Última captura" value={
                  resumen.ultima_captura
                    ? new Date(resumen.ultima_captura).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })
                    : "—"
                } />
                <Row label="Capturas este mes" value={String(resumen.capturas_mes)} />
                {mensual && (
                  <>
                    <Row label="Esperadas (a hoy)" value={String(mensual.registros_esperados_a_hoy ?? 0)} />
                    <Row label="Días al 100%" value={`${mensual.dias_con_100 ?? 0} / ${mensual.dias_transcurridos ?? 0}`} />
                    <Row label="Días en cero" value={String(mensual.dias_con_0 ?? 0)} highlight={(mensual.dias_con_0 ?? 0) > 2 ? "red" : undefined} />
                  </>
                )}
              </dl>
            </section>
          </div>
        </div>

        <footer className="mt-10 border-t border-[color:var(--border)] pt-4 text-[10px] text-muted-2">
          <Link href="/rh-pro/supervisores" className="hover:text-text">← Centro de supervisores</Link>
        </footer>
      </div>
    </main>
  );
}

function KPI({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: "blue" | "emerald" | "violet" | "amber" | "red" }) {
  const cls = {
    blue: "border-blue-400/30 bg-blue-500/[0.06] text-blue-200",
    emerald: "border-emerald-400/30 bg-emerald-500/[0.06] text-emerald-200",
    violet: "border-violet-400/30 bg-violet-500/[0.06] text-violet-200",
    amber: "border-amber-400/30 bg-amber-500/[0.06] text-amber-200",
    red: "border-red-400/30 bg-red-500/[0.06] text-red-200",
  }[color];
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${cls}`}>
      <div className="font-display text-2xl leading-none">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-tagline opacity-80">{label}</div>
      {sub && <div className="mt-0.5 text-[9px] opacity-60">{sub}</div>}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: "red" | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[10px] uppercase tracking-tagline text-muted-2">{label}</dt>
      <dd className={highlight === "red" ? "font-mono font-bold text-red-300" : "font-mono"}>{value}</dd>
    </div>
  );
}

function codigoColor(c: string): string {
  const map: Record<string, string> = {
    A: "#3B6D11", AF: "#3B6D11",
    F: "#A32D2D",
    DS: "#0F6E56", DT: "#0F6E56",
    INH: "#854F0B", FER: "#854F0B",
    PCG: "#534AB7", PSG: "#5F5E5A",
    I: "#5F5E5A", SN: "#888780",
  };
  return map[c] ?? "#6B7280";
}
