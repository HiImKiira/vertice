import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { CalendarioQuickMark, type SedeShape, type Empleado, type MarcasMap } from "./CalendarioQuickMark";

export const dynamic = "force-dynamic";
export const metadata = { title: "Captura rápida · RH Pro" };

interface PageProps {
  searchParams: Promise<{ sede?: string; mes?: string }>;
}

function currentYearMonth(): string {
  const d = new Date();
  d.setHours(d.getHours() - 6);
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

export default async function RHEmpleadosPage({ searchParams }: PageProps) {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const supabase = await createSupabaseServerClient();

  const params = await searchParams;
  const mes = params.mes?.match(/^\d{4}-\d{2}$/) ? params.mes : currentYearMonth();

  // Todas las sedes con conteo de empleados activos
  const { data: sedesRaw } = await supabase
    .from("sedes")
    .select("id, codigo, abrev, nombre")
    .order("nombre");
  const sedes = (sedesRaw ?? []) as SedeShape[];

  // Conteo de empleados activos por sede (para ranking)
  const { data: empCountRaw } = await supabase
    .from("empleados")
    .select("sede_id")
    .is("fecha_baja", null);
  const countBySede = new Map<string, number>();
  for (const e of empCountRaw ?? []) {
    const sid = (e as { sede_id: string }).sede_id;
    countBySede.set(sid, (countBySede.get(sid) ?? 0) + 1);
  }
  const sedesConCount = sedes.map((s) => ({ ...s, n: countBySede.get(s.id) ?? 0 }));

  const sedeId = params.sede || sedesConCount.sort((a, b) => a.n - b.n).find((s) => s.n > 0)?.id || "";

  // Empleados de la sede + marcas del mes
  let empleados: Empleado[] = [];
  let marcas: MarcasMap = {};
  if (sedeId) {
    const { data: emps } = await supabase
      .from("empleados")
      .select("id, numero_empleado, nombre, jornada, dia_descanso")
      .eq("sede_id", sedeId)
      .is("fecha_baja", null)
      .order("nombre");
    empleados = (emps ?? []) as Empleado[];

    if (empleados.length) {
      const { start, end } = monthRange(mes);
      const empIds = empleados.map((e) => e.id);
      const { data: marks } = await supabase
        .from("asistencias")
        .select("empleado_id, fecha, codigo")
        .in("empleado_id", empIds)
        .gte("fecha", start)
        .lte("fecha", end);
      for (const m of marks ?? []) {
        const r = m as { empleado_id: string; fecha: string; codigo: string };
        if (!marcas[r.empleado_id]) marcas[r.empleado_id] = {};
        marcas[r.empleado_id]![r.fecha] = r.codigo;
      }
    }
  }

  return (
    <main className="min-h-screen text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1400px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
          <div>
            <Link href="/rh-pro" className="text-xs text-muted hover:text-text">← RH Pro</Link>
            <p className="pill pill-cyan mt-2 mb-2">Captura rápida · sedes chicas</p>
            <h1 className="font-display text-3xl sm:text-4xl">Calendario empleado × día</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Para sedes de 1–10 personas. Click en cada celda cicla entre <span className="font-mono">A → F → DS → A</span>.
              Botones de fila para marcar al empleado completo. Botones de columna para marcar el día entero.
            </p>
          </div>
        </header>

        <CalendarioQuickMark
          mes={mes}
          sedeId={sedeId}
          sedes={sedesConCount}
          empleados={empleados}
          marcasIniciales={marcas}
        />
      </div>
    </main>
  );
}
