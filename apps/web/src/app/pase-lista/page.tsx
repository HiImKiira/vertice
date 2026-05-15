import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SignOutButton } from "../dashboard/SignOutButton";
import { PaseListaClient, type Asignacion, type Empleado, type SedeShape } from "./PaseListaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pase de lista" };

interface PageProps {
  searchParams: Promise<{ sede?: string; jornada?: string; fecha?: string }>;
}

function todayISOMerida(): string {
  const now = new Date();
  now.setHours(now.getHours() - 6);
  return now.toISOString().slice(0, 10);
}

function pickSede(a: { sedes: SedeShape | SedeShape[] | null }): SedeShape | null {
  if (!a.sedes) return null;
  return Array.isArray(a.sedes) ? a.sedes[0] ?? null : a.sedes;
}

function previousDay(iso: string): string {
  const parts = iso.split("-");
  const d = new Date(Number(parts[0]!), Number(parts[1]!) - 1, Number(parts[2]!) - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function PaseListaPage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const fecha = params.fecha?.trim() || todayISOMerida();

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("nombre, username, rol")
    .eq("id", user.id)
    .single<{ nombre: string; username: string; rol: string }>();

  // Asignaciones del usuario, agrupadas por sede
  const { data: asignRaw } = await supabase
    .from("asignaciones_supervisor")
    .select("jornada, sedes(id, codigo, abrev, nombre)")
    .eq("usuario_id", user.id)
    .eq("activo", true)
    .order("jornada");

  const sedeMap = new Map<string, Asignacion>();
  for (const a of (asignRaw ?? []) as unknown as Array<{ jornada: string; sedes: SedeShape | SedeShape[] | null }>) {
    const sede = pickSede(a);
    if (!sede) continue;
    if (!sedeMap.has(sede.id)) sedeMap.set(sede.id, { sede, jornadas: [] });
    sedeMap.get(sede.id)!.jornadas.push(a.jornada);
  }
  const asignaciones = [...sedeMap.values()];

  const isAdmin = perfil?.rol === "ADMIN" || perfil?.rol === "SUPERADMIN" || perfil?.rol === "CEO";

  // Si admin sin asignaciones, traerle todas las sedes
  if (isAdmin && !asignaciones.length) {
    const { data } = await supabase.from("sedes").select("id, codigo, abrev, nombre").order("nombre");
    for (const s of (data ?? []) as SedeShape[]) {
      asignaciones.push({ sede: s, jornadas: ["MATUTINO", "VESPERTINO", "NOCTURNO"] });
    }
  }

  const sedeId = params.sede || asignaciones[0]?.sede.id || "";
  const sedeActual = asignaciones.find((a) => a.sede.id === sedeId);
  const jornadaActual = params.jornada || sedeActual?.jornadas[0] || "MATUTINO";

  // Empleados activos
  let empleados: Empleado[] = [];
  let marcasExistentes: Record<string, string> = {};
  let marcasAnteriores: Record<string, string> = {};

  if (sedeId) {
    const { data: emps } = await supabase
      .from("empleados")
      .select("id, numero_empleado, nombre, jornada")
      .eq("sede_id", sedeId)
      .eq("jornada", jornadaActual)
      .is("fecha_baja", null)
      .order("numero_empleado");
    empleados = (emps ?? []) as Empleado[];

    if (empleados.length) {
      const ids = empleados.map((e) => e.id);
      const [{ data: actuales }, { data: anteriores }] = await Promise.all([
        supabase.from("asistencias").select("empleado_id, codigo").eq("fecha", fecha).in("empleado_id", ids),
        supabase.from("asistencias").select("empleado_id, codigo").eq("fecha", previousDay(fecha)).in("empleado_id", ids),
      ]);
      for (const m of actuales ?? []) {
        marcasExistentes[(m as { empleado_id: string }).empleado_id] = (m as { codigo: string }).codigo;
      }
      for (const m of anteriores ?? []) {
        marcasAnteriores[(m as { empleado_id: string }).empleado_id] = (m as { codigo: string }).codigo;
      }
    }
  }

  // Ventana de gracia
  const { data: ventana } = await supabase.rpc("evaluar_ventana_gracia", { p_fecha: fecha });
  const ventanaRow = (ventana as Array<{ resultado: string; expira: string | null }>)?.[0];
  const canEdit = ventanaRow ? ["OK", "LIBERADA", "SUPER"].includes(ventanaRow.resultado) : false;
  const graceMsg = ventanaRow?.expira
    ? new Date(ventanaRow.expira).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })
    : ventanaRow?.resultado === "LIBERADA"
      ? "Fecha liberada por Superadmin"
      : ventanaRow?.resultado === "SUPER"
        ? "Acceso superadmin"
        : ventanaRow?.resultado === "GRACIA_VENCIDA"
          ? "Gracia vencida — solicita liberación"
          : ventanaRow?.resultado === "FUTURO"
            ? "Fecha futura no permitida"
            : "";

  return (
    <main className="min-h-screen text-ink">
      <header className="border-b border-white/5 bg-surface/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
          <a href="/dashboard" className="flex items-center gap-3">
            <Logo className="h-8 w-auto" withWordmark={false} />
            <span className="hidden font-serif text-lg text-ink sm:inline">Vértice</span>
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-tagline text-emerald-300 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {perfil?.username}
            </span>
            <div className="text-right">
              <p className="text-xs font-medium text-ink sm:text-sm">{perfil?.nombre}</p>
              <p className="font-mono text-[9px] uppercase tracking-tagline text-ink-muted sm:text-[10px]">
                {perfil?.rol}
              </p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <PaseListaClient
          fecha={fecha}
          sedeId={sedeId}
          jornada={jornadaActual}
          asignaciones={asignaciones}
          empleados={empleados}
          marcasExistentes={marcasExistentes}
          marcasAnteriores={marcasAnteriores}
          canEdit={canEdit}
          graceMsg={graceMsg}
          isAdmin={isAdmin}
        />
      </div>
    </main>
  );
}
