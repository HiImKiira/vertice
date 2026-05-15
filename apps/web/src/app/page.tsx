import { Logo } from "@/components/Logo";
import { ROL_LABEL } from "@vertice/shared/roles";

const modulos = [
  {
    rol: "USER",
    titulo: "Supervisor",
    color: "from-sky-50 to-sky-100 border-sky-200",
    items: ["Pase de lista por sede y jornada", "Incidencias formales", "Turnos eventuales (CDT)", "Soporte a RH"],
  },
  {
    rol: "ADMIN",
    titulo: "RH",
    color: "from-emerald-50 to-emerald-100 border-emerald-200",
    items: ["Exportación quincenal", "Gestión de personal", "Inbox de tickets", "Reportes y nómina"],
  },
  {
    rol: "CEO",
    titulo: "Dirección",
    color: "from-violet-50 to-violet-100 border-violet-200",
    items: ["Dashboard ejecutivo multi-sede", "Monitor en vivo de operación"],
  },
  {
    rol: "SUPERADMIN",
    titulo: "Superadmin",
    color: "from-stone-50 to-stone-100 border-stone-200",
    items: ["Control de períodos de nómina", "Configuración del sistema", "Análisis con IA"],
  },
] as const;

export default function Home() {
  return (
    <main className="min-h-screen bg-cream text-onyx">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
        <header className="mb-20 lg:mb-28">
          <Logo className="h-20 w-auto" aria-label="Vértice" />
        </header>

        <section className="mb-20 max-w-3xl">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-tagline text-gold-700">
            Sistema de asistencia · operación · datos
          </p>
          <h1 className="font-serif text-5xl leading-[1.05] tracking-tight text-balance lg:text-7xl">
            Una sola plataforma para gobernar la operación de tus sedes.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-onyx/70">
            Vértice reemplaza hojas de cálculo dispersas con un sistema único de captura,
            incidencias, nómina y monitoreo en vivo. Cuatro roles, una verdad.
          </p>
        </section>

        <section>
          <h2 className="mb-8 text-[11px] font-semibold uppercase tracking-tagline text-onyx/50">
            Cuatro roles, un sistema
          </h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {modulos.map((m) => (
              <article
                key={m.rol}
                className={`rounded-xl border bg-gradient-to-b ${m.color} p-5 transition-shadow hover:shadow-lg`}
              >
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-tagline text-onyx/50">
                  {m.rol}
                </div>
                <h3 className="mb-4 font-serif text-2xl text-onyx">{m.titulo}</h3>
                <ul className="space-y-1.5 text-sm text-onyx/75">
                  {m.items.map((it) => (
                    <li key={it} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-gold-500" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <footer className="mt-24 border-t border-onyx/10 pt-8 text-xs text-onyx/40">
          <p>
            © {new Date().getFullYear()} Vértice · Roles oficiales:{" "}
            {Object.values(ROL_LABEL).join(" · ")}
          </p>
        </footer>
      </div>
    </main>
  );
}
