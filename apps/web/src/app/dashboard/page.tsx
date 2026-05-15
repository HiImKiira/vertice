import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser, isAdminLike } from "@/lib/session";
import { Topbar } from "@/components/Topbar";

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
      href: "/pase-lista",
      icon: "📋",
      iconBg: "rgba(16,185,129,0.12)",
      iconBorder: "rgba(16,185,129,0.3)",
      title: "Pase de lista",
      sub: "Captura asistencia diaria por sede y jornada con quick actions y bulk-by-ID.",
      badge: { label: "Todos", cls: "pill" },
    },
    {
      href: "/incidencias",
      icon: "🧾",
      iconBg: "rgba(245,158,11,0.12)",
      iconBorder: "rgba(245,158,11,0.3)",
      title: "Incidencias",
      sub: "Calendario mensual de PCG, PSG, Incapacidad, Feriado, Doble turno y más.",
      badge: { label: "Todos", cls: "pill" },
    },
    {
      href: "/rh-pro",
      icon: "👥",
      iconBg: "rgba(139,92,246,0.12)",
      iconBorder: "rgba(139,92,246,0.3)",
      title: "RH Pro",
      sub: "Gestión de personal, exportación quincenal y asignación de supervisores.",
      badge: { label: "ADMIN / SUPERADMIN", cls: "pill pill-blue" },
    },
    {
      href: "/rh-pro/empleados",
      icon: "📅",
      iconBg: "rgba(6,182,212,0.12)",
      iconBorder: "rgba(6,182,212,0.3)",
      title: "Captura rápida (sedes chicas)",
      sub: "Vista calendario mes × empleado para marcar varios con clicks. Ideal para sedes de 1–5 personas.",
      badge: { label: "ADMIN / SUPERADMIN", cls: "pill pill-cyan" },
    },
    {
      href: "/soporte",
      icon: "💬",
      iconBg: "rgba(59,130,246,0.12)",
      iconBorder: "rgba(59,130,246,0.3)",
      title: "Soporte",
      sub: "Tickets de desbloqueo, urgencias, dudas y sugerencias. Chat en tiempo real.",
      badge: { label: "Todos", cls: "pill" },
    },
    {
      href: "/reportes",
      icon: "📄",
      iconBg: "rgba(201,169,97,0.12)",
      iconBorder: "rgba(201,169,97,0.3)",
      title: "Reportes PDF",
      sub: "Genera reportes históricos por sede o trabajador en formato PDF operativo.",
      badge: { label: "ADMIN / SUPERADMIN", cls: "pill pill-gold" },
    },
  ];

  const adminLike = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(rol);
  return all.filter((m) => {
    if (m.href === "/rh-pro" || m.href === "/rh-pro/empleados" || m.href === "/reportes") return adminLike;
    return true;
  });
}

export default async function DashboardPage() {
  const { id, profile } = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Asignaciones del usuario
  const { data: asignRaw } = await supabase
    .from("asignaciones_supervisor")
    .select("id, jornada, activo, sedes(id, codigo, abrev, nombre)")
    .eq("usuario_id", id)
    .eq("activo", true)
    .order("jornada");
  const rows = (asignRaw ?? []) as unknown as AsignacionRow[];
  const porSede = new Map<string, { sede: SedeJoin; jornadas: string[] }>();
  for (const a of rows) {
    const s = sedeOf(a);
    if (!s) continue;
    if (!porSede.has(s.codigo)) porSede.set(s.codigo, { sede: s, jornadas: [] });
    porSede.get(s.codigo)!.jornadas.push(a.jornada);
  }
  const sedesAgrupadas = [...porSede.values()];

  const modulos = modulosFor(profile.rol);
  const showSedes = !isAdminLike(profile.rol);

  return (
    <main className="min-h-screen text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-12">
        <section className="mb-10 animate-fade-up">
          <p className={`role-badge role-${profile.rol} mb-3`}>{profile.rol}</p>
          <h1 className="font-display text-4xl leading-[1.1] sm:text-5xl">
            Hola, <span className="text-gradient-blue serif-italic">{profile.nombre?.split(" ")[0] ?? "—"}</span>.
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] text-muted">
            {isAdminLike(profile.rol)
              ? "Panel central de operación. Captura, incidencias, RH y reportes. RLS aplicada por rol."
              : "Desde aquí puedes capturar el pase de lista de tus sedes asignadas y abrir tickets a RH."}
          </p>
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
