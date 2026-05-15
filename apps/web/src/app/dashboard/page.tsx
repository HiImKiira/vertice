import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ROL_LABEL } from "@vertice/shared/roles";
import { SignOutButton } from "./SignOutButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

interface SedeJoin {
  codigo: string;
  abrev: string;
  nombre: string;
}

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

interface UsuarioRow {
  id: string;
  username: string;
  email: string;
  nombre: string;
  rol: keyof typeof ROL_LABEL;
  activo: boolean;
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("id, username, email, nombre, rol, activo")
    .eq("id", user.id)
    .single<UsuarioRow>();

  const { data: asignaciones } = await supabase
    .from("asignaciones_supervisor")
    .select("id, jornada, activo, sedes(codigo, abrev, nombre)")
    .eq("usuario_id", user.id)
    .eq("activo", true)
    .order("jornada");

  const rows = (asignaciones ?? []) as unknown as AsignacionRow[];

  // Agrupar por sede
  const porSede = new Map<string, { sede: SedeJoin; jornadas: string[] }>();
  for (const a of rows) {
    const sede = sedeOf(a);
    if (!sede) continue;
    if (!porSede.has(sede.codigo)) porSede.set(sede.codigo, { sede, jornadas: [] });
    porSede.get(sede.codigo)!.jornadas.push(a.jornada);
  }
  const sedesAgrupadas = [...porSede.values()];

  return (
    <main className="min-h-screen text-ink">
      <header className="border-b border-white/5 bg-surface/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <Logo className="h-8 w-auto" withWordmark={false} />
            <div>
              <p className="font-serif text-lg leading-none">Vértice</p>
              <p className="pill pill-blue mt-1 inline-flex">RH</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-tagline text-emerald-300 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {perfil?.username}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="mb-10">
          <p className="pill pill-gold mb-3 inline-flex">Dashboard · {ROL_LABEL[perfil?.rol ?? "USER"]}</p>
          <h1 className="font-serif text-5xl leading-[1.05] text-balance sm:text-6xl">
            Hola, <span className="text-gradient-gold serif-italic">{perfil?.nombre?.split(" ")[0] ?? "—"}</span>.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-ink-muted">
            Tu perfil está autenticado contra Supabase. Las asignaciones que ves abajo vienen filtradas por
            RLS — solo las tuyas.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="/pase-lista" className="btn-primary inline-flex items-center gap-2">
              Iniciar pase de lista →
            </a>
            <a href="/incidencias" className="btn-ghost inline-flex items-center gap-2">
              Incidencias
            </a>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-ultra text-ink-muted">
              Tus sedes asignadas
            </h2>
            <span className="font-mono text-[11px] text-ink-dim">
              {sedesAgrupadas.length} sede{sedesAgrupadas.length === 1 ? "" : "s"} · {rows.length} asignaciones
            </span>
          </div>

          {sedesAgrupadas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-surface/40 p-10 text-center text-sm text-ink-muted">
              No tienes sedes asignadas. Si eres admin, igual tienes acceso global.
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {sedesAgrupadas.map(({ sede, jornadas }) => (
                <li key={sede.codigo} className="surface-glow rounded-xl p-4 transition hover:border-blue-400/40">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-md bg-blue-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-300">
                      {sede.abrev}
                    </span>
                    <p className="flex-1 truncate text-sm font-medium text-ink">{sede.nombre}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {jornadas.map((j) => (
                      <span key={j} className="pill pill-blue">{j}</span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-16 border-t border-white/5 pt-6 text-xs text-ink-dim">
          <p>Auth via Supabase · RLS aplicada · próximo: módulo de soporte.</p>
        </footer>
      </div>
    </main>
  );
}
