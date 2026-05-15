import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SignOutButton } from "../dashboard/SignOutButton";
import { PaseListaClient } from "./PaseListaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pase de lista" };

interface SedeShape {
  id: string;
  codigo: string;
  abrev: string;
  nombre: string;
}
interface AsignacionShape {
  jornada: string;
  sedes: SedeShape | SedeShape[] | null;
}

interface PageProps {
  searchParams: Promise<{ sede?: string; jornada?: string; fecha?: string }>;
}

function todayISOMerida(): string {
  // Suficiente: usamos la zona del servidor (Vercel = UTC). Mérida = UTC-6.
  const now = new Date();
  now.setHours(now.getHours() - 6);
  return now.toISOString().slice(0, 10);
}

function pickSede(a: AsignacionShape): SedeShape | null {
  if (!a.sedes) return null;
  return Array.isArray(a.sedes) ? a.sedes[0] ?? null : a.sedes;
}

export default async function PaseListaPage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const fecha = params.fecha?.trim() || todayISOMerida();

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("nombre, username, rol")
    .eq("id", user.id)
    .single<{ nombre: string; username: string; rol: string }>();

  // Asignaciones del usuario (vacías si es admin sin asignar)
  const { data: asignRaw } = await supabase
    .from("asignaciones_supervisor")
    .select("jornada, sedes(id, codigo, abrev, nombre)")
    .eq("usuario_id", user.id)
    .eq("activo", true)
    .order("jornada");

  const asignaciones = ((asignRaw ?? []) as unknown as AsignacionShape[])
    .map((a) => ({ jornada: a.jornada, sede: pickSede(a) }))
    .filter((a) => a.sede) as Array<{ jornada: string; sede: SedeShape }>;

  const isAdmin = perfil?.rol === "ADMIN" || perfil?.rol === "SUPERADMIN" || perfil?.rol === "CEO";

  // Si admin sin asignaciones, traerle TODAS las sedes para poder elegir
  let sedesAdmin: SedeShape[] = [];
  if (isAdmin && !asignaciones.length) {
    const { data } = await supabase.from("sedes").select("id, codigo, abrev, nombre").order("nombre");
    sedesAdmin = (data ?? []) as SedeShape[];
  }

  // Determinar selección activa
  const sedeId = params.sede || asignaciones[0]?.sede.id || sedesAdmin[0]?.id || "";
  const jornada = params.jornada || asignaciones.find((a) => a.sede.id === sedeId)?.jornada || "MATUTINO";

  // Empleados activos de esta sede × jornada
  let empleados: Array<{ id: string; numero_empleado: string; nombre: string }> = [];
  let marcasExistentes: Record<string, string> = {};
  if (sedeId) {
    const { data: emps } = await supabase
      .from("empleados")
      .select("id, numero_empleado, nombre")
      .eq("sede_id", sedeId)
      .eq("jornada", jornada)
      .is("fecha_baja", null)
      .order("nombre");
    empleados = (emps ?? []) as typeof empleados;

    if (empleados.length) {
      const ids = empleados.map((e) => e.id);
      const { data: marks } = await supabase
        .from("asistencias")
        .select("empleado_id, codigo")
        .eq("fecha", fecha)
        .in("empleado_id", ids);
      for (const m of marks ?? []) {
        marcasExistentes[(m as { empleado_id: string }).empleado_id] =
          (m as { codigo: string }).codigo;
      }
    }
  }

  // Evaluar ventana de gracia para esta fecha
  const { data: ventana } = await supabase.rpc("evaluar_ventana_gracia", { p_fecha: fecha });
  const ventanaRow = (ventana as Array<{ resultado: string; expira: string | null }>)?.[0];
  const canEdit = ventanaRow ? ["OK", "LIBERADA", "SUPER"].includes(ventanaRow.resultado) : false;
  const ventanaMsg =
    ventanaRow?.resultado === "GRACIA_VENCIDA"
      ? "Ventana de gracia vencida. Pide al Superadmin liberar la fecha."
      : ventanaRow?.resultado === "FUTURO"
        ? "Fechas futuras no se pueden capturar."
        : ventanaRow?.resultado === "LIBERADA"
          ? "Fecha liberada por Superadmin."
          : ventanaRow?.expira
            ? `Gracia hasta ${new Date(ventanaRow.expira).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}`
            : "";

  // Opciones disponibles para el selector (asignaciones reales o todas si admin sin asignar)
  const opciones = asignaciones.length
    ? asignaciones
    : sedesAdmin.flatMap((s) => [
        { jornada: "MATUTINO", sede: s },
        { jornada: "VESPERTINO", sede: s },
        { jornada: "NOCTURNO", sede: s },
      ]);

  return (
    <main className="min-h-screen bg-cream text-onyx">
      <header className="border-b border-onyx/10 bg-cream-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
          <a href="/dashboard" className="flex items-center gap-3">
            <Logo className="h-8 w-auto" withWordmark={false} />
            <span className="hidden font-serif text-lg text-onyx sm:inline">Vértice</span>
          </a>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-medium text-onyx sm:text-sm">{perfil?.nombre}</p>
              <p className="font-mono text-[9px] uppercase tracking-tagline text-onyx/50 sm:text-[10px]">
                {perfil?.username} · {perfil?.rol}
              </p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-tagline text-gold-700">
            Pase de lista · {fecha}
          </p>
          <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Captura del día</h1>
          {ventanaMsg && (
            <p className={`mt-2 text-xs ${canEdit ? "text-emerald-700" : "text-red-700"}`}>{ventanaMsg}</p>
          )}
        </section>

        <PaseListaClient
          fecha={fecha}
          sedeId={sedeId}
          jornada={jornada}
          opciones={opciones}
          empleados={empleados}
          marcasExistentes={marcasExistentes}
          canEdit={canEdit}
        />
      </div>
    </main>
  );
}
