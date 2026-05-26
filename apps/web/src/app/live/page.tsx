import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { AutoRefresh } from "./AutoRefresh";
import {
  TIPO_SPECS as INCAP_TIPO_SPECS,
  ESTADO_SPECS as INCAP_ESTADO_SPECS,
  type IncapacidadEstado,
  type IncapacidadTipo,
} from "@/lib/incapacidades";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Centro LIVE · Vortex" };

interface KPIs {
  empleados_activos: number;
  sedes_activas: number;
  sedes_con_captura_hoy: number;
  asistencias_hoy: number;
  asistencias_esperadas_hoy: number;
  tickets_abiertos: number;
  tickets_urgentes: number;
  tickets_sin_responder: number;
  incap_activas: number;
  incap_riesgo_trabajo_activas: number;
  incap_st9_activas: number;
  liberaciones_globales_activas: number;
  liberaciones_fechas_activas: number;
  pushes_24h_enviados: number;
  pushes_24h_fallidos: number;
}

interface CapturaSede {
  sede_id: string;
  sede_abrev: string;
  sede_nombre: string;
  empleados_activos: number;
  asistencias_hoy: number;
  pct_cobertura: number;
  ultima_captura: string | null;
}

interface LiberacionDetail {
  tipo: "GLOBAL" | "FECHA";
  fecha: string | null;
  activada_por_nombre: string | null;
  motivo: string | null;
  expira_en: string | null;
  creado_en: string;
}

interface TicketActivo {
  id: string;
  folio: string;
  tipo: string;
  prioridad: string;
  estado: string;
  ultimo_mensaje: string | null;
  ultimo_ts: string;
  unread_soporte: number;
  fecha_solicitada: string | null;
  usuarios: { nombre: string; username: string } | { nombre: string; username: string }[] | null;
  sedes: { abrev: string } | { abrev: string }[] | null;
}

interface IncapActiva {
  id: string;
  tipo: IncapacidadTipo;
  estado: IncapacidadEstado;
  fecha_accidente: string | null;
  creado_en: string;
  empleados: { nombre: string; numero_empleado: string; sedes: { abrev: string } | { abrev: string }[] | null } | { nombre: string; numero_empleado: string; sedes: { abrev: string } | { abrev: string }[] | null }[] | null;
}

export default async function CeoLivePage() {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const supabase = await createSupabaseServerClient();

  // Hora Mérida actual
  const ahora = new Date();
  const meridaIso = new Date(ahora.getTime() - 6 * 60 * 60 * 1000).toISOString();
  const horaMerida = (ahora.getUTCHours() - 6 + 24) % 24;
  const saludo =
    horaMerida >= 5 && horaMerida < 12 ? "Buenos días" :
    horaMerida >= 12 && horaMerida < 19 ? "Buenas tardes" :
    "Buenas noches";

  // Llamadas en paralelo
  const [
    { data: kpisRaw },
    { data: capturaRaw },
    { data: liberacionesRaw },
    { data: ticketsActivos },
    { data: incapActivas },
  ] = await Promise.all([
    supabase.rpc("ceo_kpis_overview"),
    supabase.rpc("captura_por_sede_hoy"),
    supabase.rpc("liberaciones_activas_detail"),
    supabase
      .from("tickets_soporte")
      .select(`
        id, folio, tipo, prioridad, estado, ultimo_mensaje, ultimo_ts,
        unread_soporte, fecha_solicitada,
        usuarios:supervisor_id(nombre, username),
        sedes(abrev)
      `)
      .neq("estado", "CERRADO")
      .order("ultimo_ts", { ascending: false })
      .limit(8),
    supabase
      .from("incapacidades")
      .select(`
        id, tipo, estado, fecha_accidente, creado_en,
        empleados(nombre, numero_empleado, sedes(abrev))
      `)
      .not("estado", "in", "(CERRADA,RECHAZADA,CANCELADA)")
      .order("creado_en", { ascending: false })
      .limit(8),
  ]);

  const kpis = (kpisRaw as KPIs[] | null)?.[0] ?? null;
  const captura = (capturaRaw as CapturaSede[] | null) ?? [];
  const liberaciones = (liberacionesRaw as LiberacionDetail[] | null) ?? [];
  const tickets = (ticketsActivos as unknown as TicketActivo[]) ?? [];
  const incaps = (incapActivas as unknown as IncapActiva[]) ?? [];

  const pctCapturaHoy = kpis && kpis.asistencias_esperadas_hoy > 0
    ? Math.min(100, Math.round((kpis.asistencias_hoy / kpis.asistencias_esperadas_hoy) * 100))
    : 0;

  // Sedes ordenadas por % cobertura (peores primero — requieren atención)
  const sedesAtencion = captura.filter((c) => c.pct_cobertura < 80).slice(0, 8);
  const sedesCompletadas = captura.filter((c) => c.pct_cobertura >= 80).length;

  // Alertas accionables
  const alertas: { icon: "alert-triangle" | "lock-open" | "clock" | "life-buoy"; text: string; href: string; severity: "red" | "amber" | "blue" }[] = [];
  if ((kpis?.tickets_urgentes ?? 0) > 0) {
    alertas.push({ icon: "alert-triangle", text: `${kpis!.tickets_urgentes} ticket(s) URGENTE(s) sin atender`, href: "/soporte", severity: "red" });
  }
  if ((kpis?.tickets_sin_responder ?? 0) > 0) {
    alertas.push({ icon: "life-buoy", text: `${kpis!.tickets_sin_responder} ticket(s) sin responder`, href: "/soporte", severity: "amber" });
  }
  if ((kpis?.incap_st9_activas ?? 0) > 0) {
    alertas.push({ icon: "alert-triangle", text: `${kpis!.incap_st9_activas} ST-9 activa(s) — auditoría IMSS posible`, href: "/incapacidades?tipo=RIESGO_BIOLOGICO", severity: "red" });
  }
  if (sedesAtencion.length >= 3) {
    alertas.push({ icon: "clock", text: `${sedesAtencion.length} sede(s) con captura incompleta`, href: "/pase-lista", severity: "amber" });
  }
  if ((kpis?.liberaciones_globales_activas ?? 0) > 0) {
    alertas.push({ icon: "lock-open", text: "Liberación GLOBAL activa — todas las fechas capturables", href: "/rh-pro/liberacion-global", severity: "amber" });
  }

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-ultra text-[#67E8F9]">CENTRO LIVE</p>
            <h1 className="font-display text-3xl sm:text-4xl">
              {saludo}, <span className="text-gradient-blue serif-italic">{profile.nombre?.split(" ")[0]}</span>
            </h1>
            <p className="mt-1 text-xs text-muted">
              Pulso de operación en tiempo real ·{" "}
              {new Date(meridaIso).toLocaleString("es-MX", { dateStyle: "full", timeStyle: "short" })}
            </p>
          </div>
          <AutoRefresh generadoEn={meridaIso} />
        </header>

        {/* KPIs hero */}
        <section className="mb-6 grid gap-3 grid-cols-2 sm:grid-cols-4 animate-fade-up delay-100">
          <KpiHero
            label="Empleados activos"
            value={kpis?.empleados_activos ?? 0}
            color="blue"
          />
          <KpiHero
            label="Sedes activas"
            value={kpis?.sedes_activas ?? 0}
            sub={`${sedesCompletadas} con captura ≥80%`}
            color="violet"
          />
          <KpiHero
            label="Capturas hoy"
            value={kpis?.asistencias_hoy ?? 0}
            sub={`de ${kpis?.asistencias_esperadas_hoy ?? 0} esperadas`}
            color="emerald"
          />
          <KpiHero
            label="% Cobertura hoy"
            value={`${pctCapturaHoy}%`}
            sub={pctCapturaHoy >= 80 ? "Saludable" : pctCapturaHoy >= 50 ? "Atención" : "Crítico"}
            color={pctCapturaHoy >= 80 ? "emerald" : pctCapturaHoy >= 50 ? "amber" : "red"}
          />
        </section>

        {/* Alertas */}
        {alertas.length > 0 && (
          <section className="mb-6 animate-fade-up delay-150">
            <div className="section-label mb-2">Alertas accionables ({alertas.length})</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {alertas.map((a, i) => (
                <Link
                  key={i}
                  href={a.href}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition hover:border-white/30 ${
                    a.severity === "red"
                      ? "border-red-400/40 bg-red-500/[0.08] text-red-200"
                      : a.severity === "amber"
                        ? "border-amber-400/40 bg-amber-500/[0.06] text-amber-200"
                        : "border-blue-400/30 bg-blue-500/[0.05] text-blue-200"
                  }`}
                >
                  <Icon name={a.icon} size={14} className="shrink-0" />
                  <span className="min-w-0 flex-1">{a.text}</span>
                  <Icon name="arrow-right" size={12} className="shrink-0 opacity-60" />
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          {/* Columna izquierda: captura por sede + liberaciones */}
          <div className="space-y-6">
            <section className="animate-fade-up delay-200">
              <div className="section-label mb-3 flex items-center justify-between">
                <span>Captura por sede HOY ({captura.length})</span>
                <Link href="/pase-lista" className="text-[10px] text-muted hover:text-text">
                  Ir a pase de lista →
                </Link>
              </div>
              {captura.length === 0 ? (
                <p className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-3 text-center text-xs text-muted">
                  Sin sedes activas con empleados.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {captura.map((c) => (
                    <CapturaSedeBar key={c.sede_id} sede={c} />
                  ))}
                </ul>
              )}
            </section>

            {liberaciones.length > 0 && (
              <section className="animate-fade-up delay-250">
                <div className="section-label mb-3">Liberaciones vigentes ({liberaciones.length})</div>
                <ul className="space-y-1.5">
                  {liberaciones.map((l, i) => (
                    <li
                      key={i}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
                        l.tipo === "GLOBAL"
                          ? "border-emerald-400/30 bg-emerald-500/[0.06]"
                          : "border-amber-400/30 bg-amber-500/[0.06]"
                      }`}
                    >
                      <Icon name="lock-open" size={12} className={l.tipo === "GLOBAL" ? "text-emerald-300" : "text-amber-300"} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {l.tipo === "GLOBAL" ? "GLOBAL · todas las fechas" : `Fecha ${l.fecha}`}
                        </p>
                        <p className="text-[10px] text-muted-2 truncate">
                          {l.activada_por_nombre} · {l.motivo ?? "sin motivo"} ·{" "}
                          {l.expira_en ? `expira ${new Date(l.expira_en).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}` : "sin expira"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Columna derecha: tickets + incapacidades + push */}
          <div className="space-y-6">
            <section className="animate-fade-up delay-300">
              <div className="section-label mb-3 flex items-center justify-between">
                <span>Tickets abiertos ({kpis?.tickets_abiertos ?? 0})</span>
                <Link href="/soporte" className="text-[10px] text-muted hover:text-text">→</Link>
              </div>
              <div className="mb-2 grid grid-cols-3 gap-1.5 text-center text-[10px]">
                <MiniStat label="Urgentes" value={kpis?.tickets_urgentes ?? 0} color="red" />
                <MiniStat label="Sin resp." value={kpis?.tickets_sin_responder ?? 0} color="amber" />
                <MiniStat label="Total abiertos" value={kpis?.tickets_abiertos ?? 0} color="blue" />
              </div>
              {tickets.length === 0 ? (
                <p className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-3 text-center text-xs text-muted">
                  Sin tickets abiertos.
                </p>
              ) : (
                <ul className="space-y-1">
                  {tickets.map((t) => {
                    const sup = Array.isArray(t.usuarios) ? t.usuarios[0] : t.usuarios;
                    const sede = Array.isArray(t.sedes) ? t.sedes[0] : t.sedes;
                    const isUrg = t.prioridad === "URGENTE";
                    return (
                      <li key={t.id}>
                        <Link
                          href={`/soporte/${t.id}`}
                          className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition ${
                            isUrg
                              ? "border-red-400/30 bg-red-500/[0.06] hover:bg-red-500/[0.12]"
                              : "border-white/5 bg-[color:var(--card)] hover:border-blue-400/30"
                          }`}
                        >
                          <span className={`shrink-0 rounded px-1 font-mono text-[9px] font-bold ${
                            isUrg ? "bg-red-500/30 text-red-200" : "bg-blue-500/20 text-blue-300"
                          }`}>
                            {isUrg ? "URG" : t.tipo.slice(0, 4)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{t.folio} · {sup?.nombre ?? "—"}</p>
                            <p className="truncate text-[10px] text-muted-2">
                              {sede?.abrev && <span className="font-mono">{sede.abrev} · </span>}
                              {t.ultimo_mensaje?.slice(0, 60) ?? "—"}
                            </p>
                          </div>
                          {t.unread_soporte > 0 && (
                            <span className="shrink-0 rounded-full bg-blue-500/80 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
                              {t.unread_soporte}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="animate-fade-up delay-350">
              <div className="section-label mb-3 flex items-center justify-between">
                <span>Incapacidades activas ({kpis?.incap_activas ?? 0})</span>
                <Link href="/incapacidades" className="text-[10px] text-muted hover:text-text">→</Link>
              </div>
              <div className="mb-2 grid grid-cols-3 gap-1.5 text-center text-[10px]">
                <MiniStat label="RT/RTra" value={kpis?.incap_riesgo_trabajo_activas ?? 0} color="amber" />
                <MiniStat label="ST-9" value={kpis?.incap_st9_activas ?? 0} color="red" />
                <MiniStat label="Total" value={kpis?.incap_activas ?? 0} color="violet" />
              </div>
              {incaps.length === 0 ? (
                <p className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-3 text-center text-xs text-muted">
                  Sin incapacidades activas.
                </p>
              ) : (
                <ul className="space-y-1">
                  {incaps.map((i) => {
                    const emp = Array.isArray(i.empleados) ? i.empleados[0] : i.empleados;
                    const sede = emp && (Array.isArray(emp.sedes) ? emp.sedes[0] : emp.sedes);
                    const tipo = INCAP_TIPO_SPECS[i.tipo];
                    const estado = INCAP_ESTADO_SPECS[i.estado];
                    return (
                      <li key={i.id}>
                        <Link
                          href={`/incapacidades/${i.id}`}
                          className="flex items-center gap-2 rounded-md border border-white/5 bg-[color:var(--card)] px-2 py-1.5 text-xs transition hover:border-blue-400/30"
                        >
                          <span
                            className="shrink-0 rounded px-1 font-mono text-[9px] font-bold text-white"
                            style={{ background: tipo.color }}
                          >
                            {tipo.short}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{emp?.nombre ?? "—"}</p>
                            <p className="truncate text-[10px]" style={{ color: estado.color }}>
                              {sede?.abrev && <span className="font-mono text-muted-2">{sede.abrev} · </span>}
                              {estado.label}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="animate-fade-up delay-400">
              <div className="section-label mb-3">Push 24h</div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <MiniStat label="Enviados" value={kpis?.pushes_24h_enviados ?? 0} color="emerald" />
                <MiniStat label="Fallidos" value={kpis?.pushes_24h_fallidos ?? 0} color="red" />
              </div>
            </section>
          </div>
        </div>

        <footer className="mt-10 border-t border-[color:var(--border)] pt-4 text-[10px] text-muted-2">
          <p>
            Generado: {new Date(meridaIso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} (Mérida) ·
            Auto-refresh activado · Solo SUPERADMIN/ADMIN/CEO/SOPORTE
          </p>
        </footer>
      </div>
    </main>
  );
}

function KpiHero({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color: "blue" | "emerald" | "violet" | "amber" | "red" }) {
  const cls = {
    blue:    "border-blue-400/30 bg-blue-500/[0.06] text-blue-200",
    emerald: "border-emerald-400/30 bg-emerald-500/[0.06] text-emerald-200",
    violet:  "border-violet-400/30 bg-violet-500/[0.06] text-violet-200",
    amber:   "border-amber-400/30 bg-amber-500/[0.06] text-amber-200",
    red:     "border-red-400/30 bg-red-500/[0.06] text-red-200",
  }[color];
  return (
    <div className={`rounded-xl border px-4 py-3 ${cls}`}>
      <div className="font-display text-3xl leading-none sm:text-4xl">{value}</div>
      <div className="mt-1.5 text-[10px] uppercase tracking-tagline opacity-80">{label}</div>
      {sub && <div className="mt-1 text-[10px] opacity-60">{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: "red" | "amber" | "blue" | "emerald" | "violet" }) {
  const cls = {
    red:     "bg-red-500/15 text-red-200",
    amber:   "bg-amber-500/15 text-amber-200",
    blue:    "bg-blue-500/15 text-blue-200",
    emerald: "bg-emerald-500/15 text-emerald-200",
    violet:  "bg-violet-500/15 text-violet-200",
  }[color];
  return (
    <div className={`rounded-md py-1.5 ${cls}`}>
      <div className="font-display text-base font-bold">{value}</div>
      <div className="text-[9px] uppercase opacity-70">{label}</div>
    </div>
  );
}

function CapturaSedeBar({ sede }: { sede: CapturaSede }) {
  const pct = sede.pct_cobertura;
  const color = pct >= 80 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444";
  const ultima = sede.ultima_captura
    ? new Date(sede.ultima_captura).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
    : "—";
  return (
    <li className="rounded-md border border-white/5 bg-[color:var(--card)] p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <div className="min-w-0 flex-1">
          <span className="font-mono text-[10px] text-muted-2">{sede.sede_abrev}</span>
          <span className="ml-2 truncate">{sede.sede_nombre}</span>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted">{sede.asistencias_hoy}/{sede.empleados_activos}</span>
          <span className="font-display text-sm font-bold" style={{ color }}>{pct}%</span>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <p className="mt-1 text-[9px] text-muted-2">Última captura: {ultima}</p>
    </li>
  );
}
