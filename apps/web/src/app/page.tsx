import { Logo } from "@/components/Logo";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const modulos = [
  {
    rol: "USER",
    titulo: "Supervisor",
    items: ["Pase de lista por sede y jornada", "Incidencias formales", "Turnos eventuales", "Soporte a RH"],
  },
  {
    rol: "ADMIN",
    titulo: "RH",
    items: ["Exportación quincenal", "Gestión de personal", "Inbox de tickets", "Reportes y nómina"],
  },
  {
    rol: "CEO",
    titulo: "Dirección",
    items: ["Dashboard ejecutivo multi-sede", "Monitor en vivo de operación"],
  },
  {
    rol: "SUPERADMIN",
    titulo: "Superadmin",
    items: ["Control de períodos de nómina", "Configuración del sistema", "Análisis con IA"],
  },
] as const;

async function getHeartbeat() {
  try {
    const { count, error } = await supabaseAdmin()
      .from("sedes")
      .select("*", { count: "exact", head: true });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, sedes: count ?? 0 };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function Home() {
  const heartbeat = await getHeartbeat();
  return (
    <main className="min-h-screen text-ink">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
        <header className="mb-20 flex items-center justify-between lg:mb-28">
          <Logo className="h-16 w-auto" withWordmark={false} />
          <a href="/login" className="btn-primary">
            Iniciar sesión →
          </a>
        </header>

        <section className="mb-20 max-w-3xl">
          <p className="pill pill-gold mb-4">Asistencia · Operación · Datos</p>
          <h1 className="font-serif text-5xl leading-[1.05] tracking-tight text-balance lg:text-7xl">
            Una sola plataforma para gobernar la{" "}
            <span className="text-gradient-blue serif-italic">operación</span> de tus sedes.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-ink-muted">
            Vértice reemplaza hojas de cálculo dispersas con un sistema único de captura,
            incidencias, nómina y monitoreo en vivo. Cuatro roles, una verdad.
          </p>
        </section>

        <section>
          <h2 className="mb-8 text-[10px] font-semibold uppercase tracking-ultra text-ink-muted">
            Cuatro roles, un sistema
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {modulos.map((m) => (
              <article key={m.rol} className="surface-glow rounded-2xl p-5 transition hover:border-blue-400/40">
                <p className="pill pill-blue mb-3 inline-flex">{m.rol}</p>
                <h3 className="mb-4 font-serif text-2xl text-ink">{m.titulo}</h3>
                <ul className="space-y-1.5 text-sm text-ink-muted">
                  {m.items.map((it) => (
                    <li key={it} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-blue-400" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <footer className="mt-24 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-8 text-xs text-ink-dim">
          <p>© {new Date().getFullYear()} Vértice · MHS Integradora</p>
          <p className="flex items-center gap-2 font-mono">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${heartbeat.ok ? "bg-emerald-400" : "bg-red-400"}`} aria-hidden />
            {heartbeat.ok ? `Supabase OK · ${heartbeat.sedes} sedes` : `Supabase ERR: ${heartbeat.error}`}
          </p>
        </footer>
      </div>
    </main>
  );
}
