import Link from "next/link";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { DescansosClient, type CDTRow, type EmpleadoMini, type SedeMini, type UsuarioMini } from "./DescansosClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Descansos · Cambios temporales" };

export default async function DescansosPage() {
  const { id: userId, profile } = await requireUser();
  const supabase = await createSupabaseServerClient();
  const isAdmin = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(profile.rol);

  // CDTs activos + historial reciente
  const { data: cdtsRaw } = await supabase
    .from("cdts")
    .select(`
      id, empleado_id, sede_id, fecha_original, fecha_fin, fecha_temporal,
      dia_descanso_orig, dia_descanso_temp, motivo, cancelado_en, creado_en,
      empleados ( numero_empleado, nombre ),
      sedes ( abrev, nombre )
    `)
    .order("creado_en", { ascending: false })
    .limit(100);
  const cdts = (cdtsRaw ?? []) as unknown as CDTRow[];

  // Empleados activos (para el form)
  let empleadosQuery = supabase
    .from("empleados")
    .select("id, numero_empleado, nombre, sede_id, dia_descanso")
    .is("fecha_baja", null)
    .order("nombre");
  // USER ve solo de sus sedes
  if (!isAdmin) {
    const { data: misAsign } = await supabase
      .from("asignaciones_supervisor")
      .select("sede_id")
      .eq("usuario_id", userId)
      .eq("activo", true);
    const sedeIds = [...new Set(((misAsign ?? []) as { sede_id: string }[]).map((a) => a.sede_id))];
    if (sedeIds.length === 0) {
      // no asignaciones → empleados vacío
      empleadosQuery = empleadosQuery.eq("sede_id", "00000000-0000-0000-0000-000000000000");
    } else {
      empleadosQuery = empleadosQuery.in("sede_id", sedeIds);
    }
  }
  const { data: empsRaw } = await empleadosQuery;
  const empleados = (empsRaw ?? []) as EmpleadoMini[];

  // Sedes + usuarios para "autoriza"
  const { data: sedesRaw } = await supabase.from("sedes").select("id, abrev, nombre").order("nombre");
  const { data: autorizaRaw } = await supabase
    .from("usuarios")
    .select("id, nombre, rol")
    .in("rol", ["ADMIN", "SUPERADMIN", "CEO"])
    .eq("activo", true)
    .order("nombre");

  return (
    <main className="min-h-screen text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 animate-fade-up">
          <Link href="/dashboard" className="text-xs text-muted hover:text-text">← Dashboard</Link>
          <p className={`role-badge role-${profile.rol} mt-2 mb-2`}>{profile.rol}</p>
          <h1 className="font-display text-3xl sm:text-4xl">
            Cambios temporales de <span className="text-gradient-blue serif-italic">descanso</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Registra cuando un empleado cambia su día de descanso temporalmente
            (ej: necesita descansar martes en lugar de domingo por una sola semana).
            El sistema lo respeta en pase de lista durante el rango indicado.
          </p>
        </header>

        <DescansosClient
          cdts={cdts}
          empleados={empleados}
          sedes={(sedesRaw ?? []) as SedeMini[]}
          autorizadores={(autorizaRaw ?? []) as UsuarioMini[]}
          canCancel={isAdmin}
        />
      </div>
    </main>
  );
}
