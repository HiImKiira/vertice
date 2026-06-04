import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { CambioDescansoForm, type EmpleadoRow, type SedeRow } from "./CambioDescansoForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cambio de descanso fijo · RH Pro" };

interface EmpRaw {
  id: string;
  numero_empleado: string;
  nombre: string;
  sede_id: string;
  jornada: string;
  dia_descanso: string[] | null;
  sedes: { abrev: string; nombre: string } | { abrev: string; nombre: string }[] | null;
}

interface BitacoraRow {
  id: number;
  empleado_nombre: string;
  empleado_numero: string;
  sede_abrev: string | null;
  dia_descanso_anterior: string[] | null;
  dia_descanso_nuevo: string[] | null;
  motivo: string | null;
  efectuado_en: string;
  efectuado_por_nombre: string | null;
}

const DIA_FULL: Record<string, string> = {
  LUN: "Lunes", MAR: "Martes", MIE: "Miércoles", JUE: "Jueves",
  VIE: "Viernes", SAB: "Sábado", DOM: "Domingo",
};

function diasTexto(dias: string[] | null): string {
  if (!dias || dias.length === 0) return "—";
  return dias.map((d) => DIA_FULL[d] ?? d).join(" y ");
}

export default async function CambioDescansoPage() {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const supabase = await createSupabaseServerClient();

  const [empsRes, sedesRes] = await Promise.all([
    supabase
      .from("empleados")
      .select("id, numero_empleado, nombre, sede_id, jornada, dia_descanso, sedes(abrev, nombre)")
      .is("fecha_baja", null)
      .order("nombre")
      .limit(2000),
    supabase
      .from("sedes")
      .select("id, abrev, nombre")
      .or("activa.is.null,activa.eq.true")
      .order("abrev"),
  ]);
  const empsRaw = empsRes.data;
  const sedesRaw = sedesRes.data;

  // Bitácora: aislada en su propio try/catch porque el RPC requiere v27 SQL.
  // Si aún no se aplicó la migración, el módulo debe funcionar igual (histórico vacío).
  let bitacoraRaw: unknown[] | null = null;
  try {
    const { data } = await supabase.rpc("bitacora_cambios_descanso", { p_limite: 30 });
    bitacoraRaw = (data as unknown[] | null) ?? null;
  } catch {
    bitacoraRaw = null;
  }

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
  const bitacora = (bitacoraRaw ?? []) as BitacoraRow[];

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 animate-fade-up">
          <Link href="/rh-pro" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> RH Pro
          </Link>
          <p className="role-badge role-ADMIN mt-2 mb-2">DESCANSO FIJO · ADMIN / SUPERADMIN / SOPORTE</p>
          <h1 className="font-display text-3xl sm:text-4xl">Cambio de descanso fijo</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Cambia el día de descanso <strong>permanente</strong> de un trabajador. El pase de lista usará el
            nuevo día automáticamente. Para cambios de <strong>una sola semana</strong> usa{" "}
            <Link href="/descansos" className="text-blue-300 underline">Descansos temporales</Link>.
          </p>
        </header>

        <CambioDescansoForm empleados={empleados} sedes={sedes} />

        {/* Histórico */}
        <section className="mt-10 animate-fade-up">
          <div className="section-label mb-3 flex items-center gap-2">
            <Icon name="clock" size={12} className="text-muted" />
            Cambios recientes ({bitacora.length})
          </div>
          {bitacora.length === 0 ? (
            <p className="rounded-md border border-dashed border-white/10 bg-[color:var(--card)] p-6 text-center text-xs text-muted">
              Aún no hay cambios de descanso fijo registrados.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {bitacora.map((b) => (
                <li key={b.id} className="rounded-md border border-white/5 bg-[color:var(--card)] px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-2">#{b.empleado_numero}</span>
                    <span className="font-semibold">{b.empleado_nombre}</span>
                    {b.sede_abrev && <span className="font-mono text-[10px] text-blue-200">{b.sede_abrev}</span>}
                    <span className="text-muted-2 line-through">{diasTexto(b.dia_descanso_anterior)}</span>
                    <Icon name="arrow-right" size={10} className="text-muted-2" />
                    <span className="font-semibold text-emerald-200">{diasTexto(b.dia_descanso_nuevo)}</span>
                    <span className="ml-auto font-mono text-[9px] text-muted-2">
                      {new Date(b.efectuado_en).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </div>
                  {b.motivo && <p className="mt-1 text-[11px] text-muted">"{b.motivo}"{b.efectuado_por_nombre && <span className="text-muted-2"> · por {b.efectuado_por_nombre}</span>}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
