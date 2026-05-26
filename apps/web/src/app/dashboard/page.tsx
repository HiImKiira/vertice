import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser, isAdminLike } from "@/lib/session";
import { Topbar } from "@/components/Topbar";
import { PushControls } from "@/components/PushControls";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inicio" };

interface SedeJoin { id: string; codigo: string; abrev: string; nombre: string }
interface AsignacionRow {
  id: string;
  jornada: string;
  activo: boolean;
  sedes: SedeJoin[] | SedeJoin | null;
}
function sedeOf(a: AsignacionRow): SedeJoin | null {
  if (!a.sedes) return null;
  return Array.isArray(a.sedes) ? a.sedes[0] ?? null : a.sedes;
}

interface Modulo {
  href: string;
  icon: string;
  iconBg: string;
  iconBorder: string;
  title: string;
  sub: string;
  badge: { label: string; cls: string };
}

function modulosFor(rol: string): Modulo[] {
  const all: Modulo[] = [
    {
      href: "/live",
      icon: "🟢",
      iconBg: "rgba(103,232,249,0.15)",
      iconBorder: "rgba(103,232,249,0.4)",
      title: "Centro LIVE",
      sub: "Pulso en vivo: captura, tickets, incapacidades, alertas. Auto-refresh 30s.",
      badge: { label: "ADMIN+", cls: "pill pill-cyan" },
    },
    {
      href: "/pase-lista",
      icon: "📋",
      iconBg: "rgba(16,185,129,0.12)",
      iconBorder: "rgba(16,185,129,0.3)",
      title: "Pase de lista",
      sub: "Captura asistencia diaria por sede y jornada.",
      badge: { label: "Todos", cls: "pill" },
    },
    {
      href: "/incapacidades",
      icon: "🏥",
      iconBg: "rgba(239,68,68,0.12)",
      iconBorder: "rgba(239,68,68,0.3)",
      title: "Incapacidades IMSS",
      sub: "Flujo completo: enfermedad, riesgo de trabajo, trayecto, ST-9. Notifica a RH automático.",
      badge: { label: "Todos", cls: "pill pill-red" },
    },
    {
      href: "/incidencias",
      icon: "🧾",
      iconBg: "rgba(245,158,11,0.12)",
      iconBorder: "rgba(245,158,11,0.3)",
      title: "Incidencias",
      sub: "Calendario de incidencias formales del mes.",
      badge: { label: "Todos", cls: "pill" },
    },
    {
      href: "/eventuales",
      icon: "🔄",
      iconBg: "rgba(139,92,246,0.12)",
      iconBorder: "rgba(139,92,246,0.3)",
      title: "Eventuales",
      sub: "Turnos eventuales: alguien cubre un turno extra (interno o externo).",
      badge: { label: "Todos", cls: "pill" },
    },
    {
      href: "/descansos",
      icon: "🛌",
      iconBg: "rgba(96,165,250,0.12)",
      iconBorder: "rgba(96,165,250,0.3)",
      title: "Descansos",
      sub: "Cambios temporales de día de descanso (CDTs).",
      badge: { label: "Todos", cls: "pill" },
    },
    {
      href: "/soporte",
      icon: "💬",
      iconBg: "rgba(59,130,246,0.12)",
      iconBorder: "rgba(59,130,246,0.3)",
      title: "Soporte",
      sub: "Tickets de desbloqueo, dudas, urgencias y sugerencias.",
      badge: { label: "Todos", cls: "pill" },
    },
    {
      href: "/sonidos",
      icon: "🔔",
      iconBg: "rgba(245,158,11,0.12)",
      iconBorder: "rgba(245,158,11,0.3)",
      title: "Sonidos",
      sub: "Personaliza el tono de cada tipo de notificación.",
      badge: { label: "Todos", cls: "pill pill-amber" },
    },
    {
      href: "/rh-pro",
      icon: "👥",
      iconBg: "rgba(139,92,246,0.12)",
      iconBorder: "rgba(139,92,246,0.3)",
      title: "RH Pro",
      sub: "Altas, bajas, asignaciones, exportación quincenal.",
      badge: { label: "ADMIN+", cls: "pill pill-violet" },
    },
    {
      href: "/rh-pro/empleados",
      icon: "📅",
      iconBg: "rgba(6,182,212,0.12)",
      iconBorder: "rgba(6,182,212,0.3)",
      title: "Captura rápida",
      sub: "Calendario mes × empleado para sedes chicas. Click cycle A→F→DS.",
      badge: { label: "ADMIN+", cls: "pill pill-cyan" },
    },
    {
      href: "/rh-pro/contratos",
      icon: "📄",
      iconBg: "rgba(16,185,129,0.12)",
      iconBorder: "rgba(16,185,129,0.3)",
      title: "Contratos",
      sub: "Lista de contratos generados, editar y regenerar PDFs.",
      badge: { label: "ADMIN+", cls: "pill pill-green" },
    },
    {
      href: "/rh-pro/sedes",
      icon: "🏢",
      iconBg: "rgba(139,92,246,0.12)",
      iconBorder: "rgba(139,92,246,0.3)",
      title: "Sedes activas",
      sub: "Da de alta, edita, activa o elimina sedes.",
      badge: { label: "ADMIN+", cls: "pill pill-violet" },
    },
    {
      href: "/rh-pro/descansos-semanales",
      icon: "🛌",
      iconBg: "rgba(96,165,250,0.12)",
      iconBorder: "rgba(96,165,250,0.3)",
      title: "Descansos semanales",
      sub: "Día de descanso por ley de cada empleado. Vortex auto-llena DS en pase de lista.",
      badge: { label: "ADMIN+", cls: "pill pill-blue" },
    },
    {
      href: "/rh-pro/consulta",
      icon: "🔍",
      iconBg: "rgba(245,158,11,0.12)",
      iconBorder: "rgba(245,158,11,0.3)",
      title: "Consulta de empleados",
      sub: "Busca por nombre o ID. Histórico, estadísticas y notas.",
      badge: { label: "ADMIN+", cls: "pill pill-amber" },
    },
    {
      href: "/reportes",
      icon: "📊",
      iconBg: "rgba(201,169,97,0.12)",
      iconBorder: "rgba(201,169,97,0.3)",
      title: "Reportes PDF",
      sub: "Nómina quincenal y matriz de asistencias en PDF.",
      badge: { label: "ADMIN+", cls: "pill pill-gold" },
    },
  ];

  const adminLike = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(rol);
  const adminOnly = new Set(["/live", "/rh-pro", "/rh-pro/empleados", "/rh-pro/contratos", "/rh-pro/sedes", "/rh-pro/descansos-semanales", "/rh-pro/consulta", "/reportes"]);
  return all.filter((m) => (adminOnly.has(m.href) ? adminLike : true));
}

function moduloFacturacion(): Modulo {
  return {
    href: "/facturacion",
    icon: "🏦",
    iconBg: "rgba(59,130,246,0.12)",
    iconBorder: "rgba(59,130,246,0.4)",
    title: "Facturación",
    sub: "Cotizaciones MHS by Vortex, productos, solicitudes de compra y datos bancarios para depósito de nómina.",
    badge: { label: "Acceso facturación", cls: "pill pill-blue" },
  };
}

export default async function DashboardPage() {
  const { id, profile } = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Asignaciones del usuario + flag acceso_facturacion en paralelo
  const [asignRes, perfilFacRes] = await Promise.all([
    supabase
      .from("asignaciones_supervisor")
      .select("id, jornada, activo, sedes(id, codigo, abrev, nombre)")
      .eq("usuario_id", id)
      .eq("activo", true)
      .order("jornada"),
    supabase
      .from("usuarios")
      .select("acceso_facturacion")
      .eq("id", id)
      .maybeSingle<{ acceso_facturacion: boolean }>(),
  ]);

  const rows = (asignRes.data ?? []) as unknown as AsignacionRow[];
  const porSede = new Map<string, { sede: SedeJoin; jornadas: string[] }>();
  for (const a of rows) {
    const s = sedeOf(a);
    if (!s) continue;
    if (!porSede.has(s.codigo)) porSede.set(s.codigo, { sede: s, jornadas: [] });
    porSede.get(s.codigo)!.jornadas.push(a.jornada);
  }
  const sedesAgrupadas = [...porSede.values()];

  const tieneAccesoFacturacion = perfilFacRes.data?.acceso_facturacion === true;
  const esAdminLike = isAdminLike(profile.rol);
  const esFacturacion = profile.rol === "FACTURACION";

  // Redirect a /facturacion en dos casos:
  //   1) Rol FACTURACION (siempre — es su único módulo).
  //   2) acceso_facturacion sin admin-like ni asignaciones (un USER que solo
  //      tiene el flag por compras y no tiene nada más que hacer aquí).
  if (esFacturacion || (tieneAccesoFacturacion && !esAdminLike && sedesAgrupadas.length === 0)) {
    redirect("/facturacion");
  }

  const modulos = modulosFor(profile.rol);
  // Insertamos la tarjeta de Facturación cerca del inicio si el user tiene acceso
  if (tieneAccesoFacturacion) {
    modulos.splice(1, 0, moduloFacturacion());
  }
  const showSedes = !esAdminLike;

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-10">
        <section className="mb-8 animate-fade-up sm:mb-10">
          <p className={`role-badge role-${profile.rol} mb-3`}>{profile.rol}</p>
          <h1 className="font-display text-3xl leading-[1.1] sm:text-5xl">
            Hola, <span className="text-gradient-blue serif-italic">{profile.nombre?.split(" ")[0] ?? "—"}</span>.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted sm:text-[15px]">
            {isAdminLike(profile.rol)
              ? "Centro de operación: pase de lista, incidencias, RH y reportes."
              : "Captura el pase de lista de tus sedes asignadas y manda tickets a RH."}
          </p>
        </section>

        {/* Estado de notificaciones del dispositivo actual */}
        <section className="mb-6 animate-fade-up delay-50">
          <ErrorBoundary label="Notificaciones">
            <PushControls compact />
          </ErrorBoundary>
        </section>

        {showSedes && sedesAgrupadas.length > 0 && (
          <section className="mb-10 animate-fade-up delay-100">
            <div className="section-label">Tus sedes asignadas</div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sedesAgrupadas.map(({ sede, jornadas }) => (
                <li key={sede.codigo} className="surface-card p-4 transition hover:border-[color:var(--border2)]">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-md bg-[color:var(--blue-dim)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#93C5FD]">
                      {sede.abrev}
                    </span>
                    <p className="flex-1 truncate text-sm font-medium text-text">{sede.nombre}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {jornadas.map((j) => (
                      <span key={j} className="pill pill-amber">{j}</span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="animate-fade-up delay-200">
          <div className="section-label">Módulos disponibles</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modulos.map((m, i) => (
              <a
                key={m.href}
                href={m.href}
                className="card-action animate-fade-up"
                style={{ animationDelay: `${(i + 3) * 80}ms` }}
              >
                <div
                  className="card-action-icon"
                  style={{ background: m.iconBg, borderColor: m.iconBorder }}
                >
                  {m.icon}
                </div>
                <div className="card-action-title">{m.title}</div>
                <div className="card-action-sub">{m.sub}</div>
                <div><span className={m.badge.cls}>{m.badge.label}</span></div>
              </a>
            ))}
          </div>
        </section>

        <footer className="mt-16 border-t border-[color:var(--border)] pt-6 text-xs text-muted-2">
          <p>Vortex · MHS Integradora · Auth Supabase + RLS</p>
        </footer>
      </div>
    </main>
  );
}
