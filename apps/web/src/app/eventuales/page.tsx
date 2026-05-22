import Link from "next/link";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { EventualesClient, type Empleado, type Sede, type Usuario, type EventualRow } from "./EventualesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cal. Eventuales" };

interface PageProps {
  searchParams: Promise<{ sede?: string; mes?: string }>;
}

function currentYM(): string {
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
  return { start, end: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}` };
}

export default async function EventualesPage({ searchParams }: PageProps) {
  const { id: userId, profile } = await requireUser();
  const supabase = await createSupabaseServerClient();
  const esAdmin = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(profile.rol);
  const params = await searchParams;
  const mes = params.mes?.match(/^\d{4}-\d{2}$/) ? params.mes : currentYM();

  // Sedes disponibles
  let sedes: Sede[] = [];
  if (esAdmin) {
    const { data } = await supabase.from("sedes").select("id, codigo, abrev, nombre").order("nombre");
    sedes = (data ?? []) as Sede[];
  } else {
    const { data: asign } = await supabase
      .from("asignaciones_supervisor")
      .select("sedes(id, codigo, abrev, nombre)")
      .eq("usuario_id", userId)
      .eq("activo", true);
    const map = new Map<string, Sede>();
    for (const a of (asign ?? []) as unknown as Array<{ sedes: Sede | Sede[] | null }>) {
      const s = Array.isArray(a.sedes) ? a.sedes[0] : a.sedes;
      if (s) map.set(s.id, s);
    }
    sedes = [...map.values()];
  }
  const sedeId = params.sede || sedes[0]?.id || "";

  // Empleados de esa sede (para "cubre a") + para registrar empleado del turno
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

  // Turnos eventuales del mes
  let eventuales: EventualRow[] = [];
  if (sedeId) {
    const { start, end } = monthRange(mes);
    const { data } = await supabase
      .from("turnos_eventuales")
      .select(`
        id, fecha, jornada, empleado_id, nombre_externo, cubre_id, observaciones, es_externo, creado_en,
        empleados:empleado_id(numero_empleado, nombre),
        cubre:cubre_id(numero_empleado, nombre)
      `)
      .eq("sede_id", sedeId)
      .gte("fecha", start)
      .lte("fecha", end)
      .order("fecha");
    eventuales = (data ?? []) as unknown as EventualRow[];
  }

  // Autorizadores
  const { data: autRaw } = await supabase
    .from("usuarios")
    .select("id, nombre, rol")
    .in("rol", ["ADMIN", "SUPERADMIN", "CEO"])
    .eq("activo", true)
    .order("nombre");

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
          <div>
            <Link href="/dashboard" className="text-xs text-muted hover:text-text">← Dashboard</Link>
            <p className={`role-badge role-${profile.rol} mt-2 mb-2`}>{profile.rol}</p>
            <h1 className="font-display text-3xl sm:text-4xl">
              Cal. <span className="text-gradient-blue serif-italic">eventuales</span>
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Turnos eventuales: cuando alguien (interno o externo) cubre un turno extra
              en una sede. Vista mensual visual + form para registrar.
            </p>
          </div>
          <Link href="/incidencias" className="btn btn-ghost btn-sm">📌 Cal. Incidencias</Link>
        </header>

        <EventualesClient
          mes={mes}
          sedeId={sedeId}
          sedes={sedes}
          empleados={empleados}
          eventuales={eventuales}
          autorizadores={(autRaw ?? []) as Usuario[]}
        />
      </div>
    </main>
  );
}
