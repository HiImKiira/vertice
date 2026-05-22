import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { SedesEditor, type SedeFull } from "./SedesEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sedes activas · RH Pro" };

interface SedeRow {
  id: string;
  codigo: string;
  abrev: string;
  nombre: string;
  activa: boolean | null;
  notas: string | null;
  ultimo_folio: number;
}

export default async function SedesPage() {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const supabase = await createSupabaseServerClient();

  const [{ data: sedesRaw }, { data: empAll }, { data: asignAll }] = await Promise.all([
    supabase.from("sedes").select("id, codigo, abrev, nombre, activa, notas, ultimo_folio").order("nombre"),
    supabase.from("empleados").select("sede_id, fecha_baja"),
    supabase.from("asignaciones_supervisor").select("sede_id, activo"),
  ]);

  const empByS = new Map<string, { activos: number; total: number }>();
  for (const e of (empAll ?? []) as Array<{ sede_id: string; fecha_baja: string | null }>) {
    const cur = empByS.get(e.sede_id) ?? { activos: 0, total: 0 };
    cur.total++;
    if (!e.fecha_baja) cur.activos++;
    empByS.set(e.sede_id, cur);
  }
  const asignByS = new Map<string, number>();
  for (const a of (asignAll ?? []) as Array<{ sede_id: string; activo: boolean }>) {
    if (!a.activo) continue;
    asignByS.set(a.sede_id, (asignByS.get(a.sede_id) ?? 0) + 1);
  }

  const sedes: SedeFull[] = ((sedesRaw ?? []) as SedeRow[]).map((s) => {
    const emp = empByS.get(s.id) ?? { activos: 0, total: 0 };
    return {
      id: s.id,
      codigo: s.codigo,
      abrev: s.abrev,
      nombre: s.nombre,
      activa: s.activa ?? true,
      notas: s.notas,
      ultimo_folio: s.ultimo_folio,
      empleados_activos: emp.activos,
      empleados_total: emp.total,
      asignaciones_activas: asignByS.get(s.id) ?? 0,
    };
  });

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 animate-fade-up">
          <Link href="/rh-pro" className="text-xs text-muted hover:text-text">← RH Pro</Link>
          <p className="role-badge role-ADMIN mt-2 mb-2">Sedes · ADMIN/SUPERADMIN</p>
          <h1 className="font-display text-3xl sm:text-4xl">Sedes activas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Da de alta, edita, desactiva o elimina sedes. Las inactivas no aparecen en
            captura ni en reportes pero conservan su historial. Solo se pueden{" "}
            <span className="font-mono">eliminar</span> sedes sin empleados.
          </p>
        </header>

        <SedesEditor sedes={sedes} />

        <footer className="mt-16 border-t border-[color:var(--border)] pt-6 text-xs text-muted-2">
          <Link href="/rh-pro" className="hover:text-text">← RH Pro</Link>
        </footer>
      </div>
    </main>
  );
}
