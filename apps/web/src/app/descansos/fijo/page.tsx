import Link from "next/link";
import { requireUser, isAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import {
  CambioDescansoForm,
  type EmpleadoRow,
  type SedeRow,
} from "@/app/rh-pro/cambio-descanso/CambioDescansoForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cambio de descanso fijo" };

const SEDE_NULA = "00000000-0000-0000-0000-000000000000";

interface EmpRaw {
  id: string;
  numero_empleado: string;
  nombre: string;
  sede_id: string;
  jornada: string;
  dia_descanso: string[] | null;
  sedes: { abrev: string; nombre: string } | { abrev: string; nombre: string }[] | null;
}

/**
 * Cambio de descanso FIJO (permanente) accesible para supervisores (USER).
 * A diferencia de /descansos (CDT temporal de 1 semana), esto reescribe el
 * dia_descanso del trabajador y el pase de lista lo respeta desde ese día.
 *
 * El supervisor solo ve/afecta trabajadores de sus sedes asignadas; un
 * ADMIN-like ve todas. La validación de scope vive también en la server action.
 */
export default async function DescansoFijoPage() {
  const { id: userId, profile } = await requireUser();
  const supabase = await createSupabaseServerClient();
  const admin = isAdminLike(profile.rol);

  // sedeIds = null → sin restricción (admin). Array → acotado a esas sedes.
  let sedeIds: string[] | null = null;
  if (!admin) {
    const { data: misAsign } = await supabase
      .from("asignaciones_supervisor")
      .select("sede_id")
      .eq("usuario_id", userId)
      .eq("activo", true);
    sedeIds = [...new Set(((misAsign ?? []) as { sede_id: string }[]).map((a) => a.sede_id))];
  }

  // Empleados activos (acotados a sus sedes si es supervisor)
  let empQuery = supabase
    .from("empleados")
    .select("id, numero_empleado, nombre, sede_id, jornada, dia_descanso, sedes(abrev, nombre)")
    .is("fecha_baja", null)
    .order("nombre")
    .limit(2000);
  if (sedeIds !== null) {
    empQuery = sedeIds.length ? empQuery.in("sede_id", sedeIds) : empQuery.eq("sede_id", SEDE_NULA);
  }
  const { data: empsRaw } = await empQuery;

  // Sedes para el paso 1 (solo las suyas si es supervisor)
  let sedeQuery = supabase
    .from("sedes")
    .select("id, abrev, nombre")
    .or("activa.is.null,activa.eq.true")
    .order("abrev");
  if (sedeIds !== null) {
    sedeQuery = sedeIds.length ? sedeQuery.in("id", sedeIds) : sedeQuery.eq("id", SEDE_NULA);
  }
  const { data: sedesRaw } = await sedeQuery;

  const empleados: EmpleadoRow[] = ((empsRaw ?? []) as unknown as EmpRaw[]).map((e) => {
    const sede = Array.isArray(e.sedes) ? e.sedes[0] : e.sedes;
    return {
      id: e.id,
      numero_empleado: e.numero_empleado,
      nombre: e.nombre,
      sede_id: e.sede_id,
      jornada: e.jornada,
      sede_abrev: sede?.abrev ?? "—",
      dia_descanso: (e.dia_descanso ?? []) as string[],
    };
  });
  const sedes = (sedesRaw ?? []) as SedeRow[];

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 animate-fade-up">
          <Link href="/descansos" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> Descansos
          </Link>
          <p className={`role-badge role-${profile.rol} mt-2 mb-2`}>{profile.rol}</p>
          <h1 className="font-display text-3xl sm:text-4xl">
            Cambio de descanso <span className="text-gradient-blue serif-italic">fijo</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Cambia el día de descanso <strong>permanente</strong> de un trabajador de tus sedes. El pase de
            lista sugerirá el nuevo día automáticamente desde el próximo día. Para un cambio de{" "}
            <strong>una sola semana</strong> usa{" "}
            <Link href="/descansos" className="text-blue-300 underline">Descansos temporales</Link>.
          </p>
        </header>

        {sedes.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/10 bg-[color:var(--card)] p-6 text-center text-xs text-muted">
            No tienes sedes asignadas todavía. Pide a RH que te asigne una sede para poder cambiar descansos.
          </p>
        ) : (
          <CambioDescansoForm empleados={empleados} sedes={sedes} />
        )}
      </div>
    </main>
  );
}
