import Link from "next/link";
import { requireUser , blockCoordinacion } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { NuevaIncapacidadForm } from "./NuevaIncapacidadForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nueva incapacidad · Vortex" };

interface EmpRow {
  id: string;
  numero_empleado: string;
  nombre: string;
  sedes: { abrev: string } | { abrev: string }[] | null;
}

export default async function NuevaIncapacidadPage() {
  const { profile } = await requireUser();
  blockCoordinacion(profile.rol);
  const supabase = await createSupabaseServerClient();

  // Empleados visibles según RLS (admin-like ve todos, supervisor solo su sede)
  const { data: emps } = await supabase
    .from("empleados")
    .select("id, numero_empleado, nombre, sedes(abrev)")
    .is("fecha_baja", null)
    .order("nombre")
    .limit(2000);

  const empleados = ((emps ?? []) as unknown as EmpRow[]).map((e) => {
    const sede = Array.isArray(e.sedes) ? e.sedes[0] : e.sedes;
    return { id: e.id, nombre: e.nombre, numero_empleado: e.numero_empleado, sede_abrev: sede?.abrev ?? "—" };
  });

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[800px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 animate-fade-up">
          <Link href="/incapacidades" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> Incapacidades
          </Link>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl">Reportar incapacidad</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Sigue las 3 etapas. Vortex notifica automáticamente a RH y guarda el timeline.
            Para riesgo de trabajo y trayecto, la ST-7 debe llegar a oficinas en &lt;24 horas.
          </p>
        </header>

        <NuevaIncapacidadForm empleados={empleados} />
      </div>
    </main>
  );
}
