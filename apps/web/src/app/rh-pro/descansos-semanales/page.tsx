import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { DescansosEditor, type EmpleadoRow } from "./DescansosEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Descansos semanales · RH Pro" };

interface RawRow {
  id: string;
  numero_empleado: string;
  nombre: string;
  jornada: string;
  sede_id: string;
  dia_descanso: string[];
  sedes: { abrev: string; nombre: string } | { abrev: string; nombre: string }[] | null;
}

export default async function DescansosSemanalesPage() {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const supabase = await createSupabaseServerClient();

  const [{ data: empRaw }, { data: sedes }] = await Promise.all([
    supabase
      .from("empleados")
      .select("id, numero_empleado, nombre, jornada, sede_id, dia_descanso, sedes(abrev, nombre)")
      .is("fecha_baja", null)
      .order("nombre"),
    supabase
      .from("sedes")
      .select("id, abrev, nombre")
      .or("activa.is.null,activa.eq.true")
      .order("nombre"),
  ]);

  const empleados: EmpleadoRow[] = ((empRaw ?? []) as RawRow[]).map((r) => {
    const sede = Array.isArray(r.sedes) ? r.sedes[0] : r.sedes;
    return {
      id: r.id,
      numero_empleado: r.numero_empleado,
      nombre: r.nombre,
      jornada: r.jornada,
      sede_id: r.sede_id,
      sede_abrev: sede?.abrev ?? "—",
      sede_nombre: sede?.nombre ?? "—",
      dia_descanso: r.dia_descanso ?? [],
    };
  });

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 animate-fade-up">
          <Link href="/rh-pro" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> RH Pro
          </Link>
          <p className="role-badge role-ADMIN mt-2 mb-2">Descansos semanales · ADMIN/SUPERADMIN/SOPORTE</p>
          <h1 className="font-display text-3xl sm:text-4xl">Día de descanso por ley</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            De cada 6 días trabajados, el empleado tiene derecho a <strong>1 día de descanso</strong> (no es pagado extra,
            no es CDT, es el descanso semanal por ley). Cuando llegue ese día en el calendario, Vortex pre-llena
            el código <span className="font-mono text-emerald-300">DS</span> automáticamente en el pase de lista.
          </p>
          <p className="mt-2 text-xs text-muted-2">
            ¿Cambio temporal o swap entre empleados? Eso va en{" "}
            <Link href="/descansos" className="text-blue-300 hover:underline">Cambios de descanso</Link>.
          </p>
        </header>

        <DescansosEditor empleados={empleados} sedes={sedes ?? []} />

        <footer className="mt-16 border-t border-[color:var(--border)] pt-6 text-xs text-muted-2">
          <Link href="/rh-pro" className="hover:text-text">← RH Pro</Link>
        </footer>
      </div>
    </main>
  );
}
