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
  /** PostgREST devuelve la relación to-one como array de 0..1 elementos. */
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const sedesUnicas = new Set(rows.map((a) => sedeOf(a)?.codigo).filter(Boolean));

  return (
    <main className="min-h-screen bg-cream text-onyx">
      <header className="border-b border-onyx/10 bg-cream-50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Logo className="h-9 w-auto" withWordmark />
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-onyx">{perfil?.nombre ?? "—"}</p>
              <p className="font-mono text-[10px] uppercase tracking-tagline text-onyx/50">
                {perfil?.username} · {ROL_LABEL[perfil?.rol ?? "USER"]}
              </p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-12">
        <section className="mb-12">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-tagline text-gold-700">
            Dashboard · {ROL_LABEL[perfil?.rol ?? "USER"]}
          </p>
          <h1 className="font-serif text-4xl text-balance lg:text-5xl">
            Hola, {perfil?.nombre?.split(" ")[0] ?? "—"}.
          </h1>
          <p className="mt-3 max-w-2xl text-onyx/65">
            Tu perfil está autenticado contra Supabase. Las asignaciones que ves abajo vienen filtradas por
            RLS — solo las tuyas. Esta página es el punto de partida para los siguientes módulos.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/pase-lista"
              className="inline-flex items-center gap-2 rounded-lg bg-onyx px-5 py-2.5 text-[11px] font-semibold uppercase tracking-tagline text-cream transition hover:bg-onyx-900"
            >
              Capturar pase de lista →
            </a>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-tagline text-onyx/50">
              Tus asignaciones
            </h2>
            <span className="font-mono text-[11px] text-onyx/40">
              {rows.length} asignaciones · {sedesUnicas.size} sede{sedesUnicas.size === 1 ? "" : "s"}
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-onyx/15 bg-cream-50 p-10 text-center text-sm text-onyx/55">
              No tienes sedes asignadas todavía. Pide a un admin que te asigne en{" "}
              <span className="font-mono">asignaciones_supervisor</span>.
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {rows.map((a) => {
                const sede = sedeOf(a);
                return (
                  <li
                    key={a.id}
                    className="rounded-lg border border-onyx/10 bg-cream-50 p-4 transition hover:border-gold-300"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-md bg-gold-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-gold-800">
                        {sede?.abrev ?? "—"}
                      </span>
                      <span className="text-[10px] uppercase tracking-tagline text-onyx/55">
                        {a.jornada}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-onyx">{sede?.nombre ?? "—"}</p>
                    <p className="font-mono text-[10px] text-onyx/40">{sede?.codigo ?? "—"}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="mt-16 border-t border-onyx/10 pt-6 text-xs text-onyx/40">
          <p>
            Auth via Supabase · RLS aplicada · próximo: módulo de pase de lista.
          </p>
        </footer>
      </div>
    </main>
  );
}
