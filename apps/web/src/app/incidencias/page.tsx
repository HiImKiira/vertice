import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SignOutButton } from "../dashboard/SignOutButton";
import { IncidenciasClient, type Empleado, type Incidencia, type SedeShape, type UsuarioShape } from "./IncidenciasClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Incidencias" };

interface PageProps {
  searchParams: Promise<{ sede?: string; mes?: string }>;
}

function currentYearMonth(): string {
  const d = new Date();
  d.setHours(d.getHours() - 6); // ajuste a Mérida (UTC-6)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(ym: string): { start: string; end: string } {
  const parts = ym.split("-");
  const y = Number(parts[0]!);
  const m = Number(parts[1]!);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function pickSede(a: { sedes: SedeShape | SedeShape[] | null }): SedeShape | null {
  if (!a.sedes) return null;
  return Array.isArray(a.sedes) ? a.sedes[0] ?? null : a.sedes;
}

export default async function IncidenciasPage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const mes = params.mes?.match(/^\d{4}-\d{2}$/) ? params.mes : currentYearMonth();

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("nombre, username, rol")
    .eq("id", user.id)
    .single<{ nombre: string; username: string; rol: string }>();

  const isAdmin = perfil?.rol === "ADMIN" || perfil?.rol === "SUPERADMIN" || perfil?.rol === "CEO";

  // Sedes disponibles (asignaciones del user, o todas si admin)
  let sedes: SedeShape[] = [];
  if (isAdmin) {
    const { data } = await supabase.from("sedes").select("id, codigo, abrev, nombre").order("nombre");
    sedes = (data ?? []) as SedeShape[];
  } else {
    const { data: asign } = await supabase
      .from("asignaciones_supervisor")
      .select("sedes(id, codigo, abrev, nombre)")
      .eq("usuario_id", user.id)
      .eq("activo", true);
    const map = new Map<string, SedeShape>();
    for (const a of (asign ?? []) as unknown as Array<{ sedes: SedeShape | SedeShape[] | null }>) {
      const s = pickSede(a);
      if (s && !map.has(s.id)) map.set(s.id, s);
    }
    sedes = [...map.values()];
  }

  const sedeId = params.sede || sedes[0]?.id || "";

  // Empleados activos de la sede seleccionada
  let empleados: Empleado[] = [];
  if (sedeId) {
    const { data } = await supabase
      .from("empleados")
      .select("id, numero_empleado, nombre, jornada")
      .eq("sede_id", sedeId)
      .is("fecha_baja", null)
      .order("nombre");
    empleados = (data ?? []) as Empleado[];
  }

  // Incidencias del mes para esta sede
  let incidencias: Incidencia[] = [];
  if (sedeId && empleados.length) {
    const { start, end } = monthRange(mes);
    const empIds = empleados.map((e) => e.id);
    const { data } = await supabase
      .from("incidencias")
      .select("id, empleado_id, fecha, codigo, observacion, cubre_id, autoriza, capturado_por, creado_en")
      .in("empleado_id", empIds)
      .gte("fecha", start)
      .lte("fecha", end)
      .order("fecha");
    incidencias = (data ?? []) as Incidencia[];
  }

  // Usuarios para el campo "autoriza" (solo admins)
  let usuariosAutoriza: UsuarioShape[] = [];
  {
    const { data } = await supabase
      .from("usuarios")
      .select("id, nombre, rol")
      .in("rol", ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"])
      .eq("activo", true)
      .order("nombre");
    usuariosAutoriza = (data ?? []) as UsuarioShape[];
  }

  return (
    <main className="min-h-screen text-text">
      <header className="border-b border-white/5 bg-[color:var(--surface)]/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
          <a href="/dashboard" className="flex items-center gap-3">
            <Logo className="h-8 w-auto" withWordmark={false} />
            <span className="hidden font-serif text-lg sm:inline">Vortex</span>
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-tagline text-emerald-300 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {perfil?.username}
            </span>
            <div className="text-right">
              <p className="text-xs font-medium sm:text-sm">{perfil?.nombre}</p>
              <p className="font-mono text-[9px] uppercase tracking-tagline text-muted sm:text-[10px]">{perfil?.rol}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="pill pill-gold mb-2 inline-flex">Incidencias</p>
            <h1 className="font-serif text-3xl sm:text-4xl">
              Calendario <span className="text-gradient-blue serif-italic">mensual</span>
            </h1>
          </div>
          <nav className="flex gap-2 text-xs">
            <a href="/dashboard" className="btn-ghost">Dashboard</a>
            <a href="/pase-lista" className="btn-ghost">Pase de lista</a>
          </nav>
        </section>

        <IncidenciasClient
          mes={mes}
          sedeId={sedeId}
          sedes={sedes}
          empleados={empleados}
          incidencias={incidencias}
          usuariosAutoriza={usuariosAutoriza}
        />
      </div>
    </main>
  );
}
