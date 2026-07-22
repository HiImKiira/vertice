import Link from "next/link";
import { requireUser, requireAdminLikeOrCoord } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { BajaForm } from "./BajaForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Baja de empleado · RH Pro" };

interface EmpleadoRow {
  id: string;
  numero_empleado: string;
  nombre: string;
  jornada: string;
  sede_id: string;
  fecha_alta: string;
}
interface SedeRow { id: string; abrev: string; nombre: string }

export default async function BajaPage() {
  const { profile } = await requireUser();
  requireAdminLikeOrCoord(profile.rol);
  const supabase = await createSupabaseServerClient();

  const [{ data: emps }, { data: sedes }] = await Promise.all([
    supabase
      .from("empleados")
      .select("id, numero_empleado, nombre, jornada, sede_id, fecha_alta")
      .is("fecha_baja", null)
      .order("nombre"),
    supabase.from("sedes").select("id, abrev, nombre").order("nombre"),
  ]);

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 animate-fade-up">
          <Link href="/rh-pro" className="text-xs text-muted hover:text-text">← RH Pro</Link>
          <p className="role-badge role-ADMIN mt-2 mb-2">Baja · Solo ADMIN/SUPERADMIN</p>
          <h1 className="font-display text-3xl sm:text-4xl">
            Dar de <span className="text-gradient-blue serif-italic">baja</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Marca a un empleado como BAJA. Deja de aparecer en pase de lista pero
            conserva su historial completo de asistencias. La acción registra
            quién y cuándo la realizó.
          </p>
        </header>

        <BajaForm
          empleados={(emps ?? []) as EmpleadoRow[]}
          sedes={(sedes ?? []) as SedeRow[]}
        />
      </div>
    </main>
  );
}
