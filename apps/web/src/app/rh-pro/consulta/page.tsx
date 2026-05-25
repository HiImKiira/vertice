import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { ConsultaSearch } from "./ConsultaSearch";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consulta de empleados · RH Pro" };

interface PageProps {
  searchParams: Promise<{ q?: string; sede?: string; estado?: string }>;
}

interface RawEmp {
  id: string;
  numero_empleado: string;
  nombre: string;
  jornada: string;
  sede_id: string;
  dia_descanso: string[];
  fecha_alta: string;
  fecha_baja: string | null;
  motivo_baja: string | null;
  notas: string | null;
  sedes: { abrev: string; nombre: string } | { abrev: string; nombre: string }[] | null;
}

export default async function ConsultaPage({ searchParams }: PageProps) {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const supabase = await createSupabaseServerClient();

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const sedeFilter = params.sede ?? "all";
  const estadoFilter = params.estado ?? "all";

  // Sedes para filtro
  const { data: sedes } = await supabase
    .from("sedes")
    .select("id, abrev, nombre")
    .or("activa.is.null,activa.eq.true")
    .order("nombre");

  // Query
  let query = supabase
    .from("empleados")
    .select("id, numero_empleado, nombre, jornada, sede_id, dia_descanso, fecha_alta, fecha_baja, motivo_baja, notas, sedes(abrev, nombre)")
    .order("nombre")
    .limit(200);

  if (q) {
    // Buscar por nombre (ilike) o por numero_empleado exacto/contiene
    query = query.or(`nombre.ilike.%${q}%,numero_empleado.ilike.%${q}%`);
  }
  if (sedeFilter !== "all") query = query.eq("sede_id", sedeFilter);
  if (estadoFilter === "activos") query = query.is("fecha_baja", null);
  if (estadoFilter === "bajas") query = query.not("fecha_baja", "is", null);

  const { data: empRaw } = await query;

  const empleados = ((empRaw ?? []) as RawEmp[]).map((r) => {
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
      fecha_alta: r.fecha_alta,
      fecha_baja: r.fecha_baja,
      motivo_baja: r.motivo_baja,
      tieneNotas: !!r.notas?.trim(),
    };
  });

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 animate-fade-up">
          <Link href="/rh-pro" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> RH Pro
          </Link>
          <p className="role-badge role-ADMIN mt-2 mb-2">Consulta · ADMIN/SUPERADMIN/SOPORTE</p>
          <h1 className="font-display text-3xl sm:text-4xl">Consulta de empleados</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Busca por nombre o ID. Click en un resultado para ver su histórico de asistencias,
            estadísticas y notas internas de RH.
          </p>
        </header>

        <ConsultaSearch
          initialQuery={q}
          initialSede={sedeFilter}
          initialEstado={estadoFilter}
          sedes={sedes ?? []}
        />

        {empleados.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-white/10 bg-[color:var(--card)] p-10 text-center text-sm text-muted">
            {q || sedeFilter !== "all" || estadoFilter !== "all"
              ? "No se encontraron empleados con esos filtros."
              : "Empieza a escribir un nombre o ID arriba."}
          </div>
        ) : (
          <div className="mt-6">
            <p className="mb-3 text-[10px] uppercase tracking-tagline text-muted">
              {empleados.length} resultado{empleados.length === 1 ? "" : "s"}
              {empleados.length === 200 && " (mostrando solo los primeros 200 — refina la búsqueda)"}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {empleados.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/rh-pro/consulta/${e.id}`}
                    className={`block rounded-xl border bg-[color:var(--card)] p-3 transition hover:border-[color:var(--blue)] ${
                      e.fecha_baja ? "border-red-400/20 opacity-70" : "border-white/5"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 font-mono text-[10px] text-muted-2">#{e.numero_empleado}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="min-w-0 truncate text-sm font-medium">{e.nombre}</p>
                          {e.tieneNotas && (
                            <span title="Tiene notas internas" className="shrink-0 text-amber-300">
                              <Icon name="file-text" size={11} />
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[10px] text-muted-2">
                          <span className="font-mono">{e.sede_abrev}</span> · {e.jornada}
                          {e.dia_descanso.length > 0 && (
                            <> · descanso {e.dia_descanso.join("/")}</>
                          )}
                        </p>
                      </div>
                      {e.fecha_baja ? (
                        <span className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-red-300">BAJA</span>
                      ) : (
                        <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300">ACT</span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
