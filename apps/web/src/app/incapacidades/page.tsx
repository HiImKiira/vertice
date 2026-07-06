import Link from "next/link";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { TIPO_SPECS, ESTADO_SPECS, type IncapacidadEstado, type IncapacidadTipo } from "@/lib/incapacidades";

export const dynamic = "force-dynamic";
export const metadata = { title: "Incapacidades · Vortex" };

interface RawIncap {
  id: string;
  tipo: IncapacidadTipo;
  estado: IncapacidadEstado;
  fecha_accidente: string | null;
  fecha_inicio: string | null;
  dias_autorizados: number | null;
  creado_en: string;
  empleados: { nombre: string; numero_empleado: string; sedes: { abrev: string } | { abrev: string }[] | null } | { nombre: string; numero_empleado: string; sedes: { abrev: string } | { abrev: string }[] | null }[] | null;
  incapacidad_documentos: { count: number }[] | null;
}

const TERMINALES: IncapacidadEstado[] = ["CERRADA", "RECHAZADA", "CANCELADA"];

/** Paso actual dentro del flujo del tipo. Devuelve {paso, total} o null si es terminal. */
function progresoDe(tipo: IncapacidadTipo, estado: IncapacidadEstado): { paso: number; total: number } | null {
  if (TERMINALES.includes(estado)) return null;
  const flujo = TIPO_SPECS[tipo].flujoEstados;
  const idx = flujo.indexOf(estado);
  if (idx < 0) return null;
  return { paso: idx + 1, total: flujo.length };
}

interface PageProps {
  searchParams: Promise<{ estado?: string; tipo?: string }>;
}

export default async function IncapacidadesPage({ searchParams }: PageProps) {
  const { profile } = await requireUser();
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const esSoporte = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(profile.rol);

  let query = supabase
    .from("incapacidades")
    .select(`
      id, tipo, estado, fecha_accidente, fecha_inicio, dias_autorizados, creado_en,
      empleados(nombre, numero_empleado, sedes(abrev)),
      incapacidad_documentos(count)
    `)
    .order("creado_en", { ascending: false })
    .limit(100);

  if (params.estado && params.estado !== "all") query = query.eq("estado", params.estado);
  if (params.tipo && params.tipo !== "all") query = query.eq("tipo", params.tipo);

  const { data: rows } = await query;
  const incapacidades = (rows ?? []) as unknown as RawIncap[];

  // KPIs
  const abiertas = incapacidades.filter((i) => !["CERRADA", "RECHAZADA", "CANCELADA"].includes(i.estado));
  const requierenAccion = abiertas.filter((i) => ["REPORTADA", "DOCS_EMPLEADO", "RH_VALIDA", "ALTA_PENDIENTE"].includes(i.estado));
  const enImss = abiertas.filter((i) => ["MEDICINA_TRABAJO", "DICTAMEN"].includes(i.estado));

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
          <div>
            <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
              <Icon name="arrow-left" size={12} /> Dashboard
            </Link>
            <h1 className="mt-2 font-display text-3xl sm:text-4xl">Incapacidades IMSS</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Flujo completo: enfermedad general, riesgo de trabajo, riesgo de trayecto y riesgo biológico (ST-9).
              Cada cambio de etapa notifica a RH automáticamente.
            </p>
          </div>
          <Link href="/incapacidades/nueva" className="btn btn-primary inline-flex items-center gap-1.5">
            <Icon name="plus" size={14} /> Reportar incapacidad
          </Link>
        </header>

        {/* KPIs */}
        <div className="mb-6 grid gap-2 sm:grid-cols-4 animate-fade-up delay-100">
          <KPI label="Abiertas" value={abiertas.length} color="blue" />
          <KPI label="Requieren acción" value={requierenAccion.length} color="amber" />
          <KPI label="En IMSS" value={enImss.length} color="violet" />
          <KPI label="Total" value={incapacidades.length} color="muted" />
        </div>

        {/* Filtros */}
        <form className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-2">Filtros:</span>
          <select name="estado" defaultValue={params.estado ?? "all"} className="rounded-md border border-white/10 bg-[color:var(--surface)] px-2 py-1">
            <option value="all">Todos los estados</option>
            {(Object.keys(ESTADO_SPECS) as IncapacidadEstado[]).map((e) => (
              <option key={e} value={e}>{ESTADO_SPECS[e].label}</option>
            ))}
          </select>
          <select name="tipo" defaultValue={params.tipo ?? "all"} className="rounded-md border border-white/10 bg-[color:var(--surface)] px-2 py-1">
            <option value="all">Todos los tipos</option>
            {(Object.keys(TIPO_SPECS) as IncapacidadTipo[]).map((t) => (
              <option key={t} value={t}>{TIPO_SPECS[t].label}</option>
            ))}
          </select>
          <button type="submit" className="rounded-md border border-blue-400/30 bg-blue-500/15 px-3 py-1 text-blue-200">
            Aplicar
          </button>
        </form>

        {/* Lista */}
        {incapacidades.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[color:var(--card)] p-10 text-center text-sm text-muted">
            No hay incapacidades con esos filtros. {esSoporte ? "Cuando un supervisor reporte una, aparecerá aquí." : "Reporta una nueva arriba."}
          </div>
        ) : (
          <ul className="space-y-2">
            {incapacidades.map((i) => {
              const emp = Array.isArray(i.empleados) ? i.empleados[0] : i.empleados;
              const sede = emp && (Array.isArray(emp.sedes) ? emp.sedes[0] : emp.sedes);
              const tipo = TIPO_SPECS[i.tipo];
              const estado = ESTADO_SPECS[i.estado];
              const prog = progresoDe(i.tipo, i.estado);
              const nDocs = i.incapacidad_documentos?.[0]?.count ?? 0;
              return (
                <li key={i.id}>
                  <Link
                    href={`/incapacidades/${i.id}`}
                    className="block rounded-xl border border-white/5 bg-[color:var(--card)] p-3 transition hover:border-[color:var(--blue)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold text-white"
                            style={{ background: tipo.color }}
                          >
                            {tipo.short}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
                            style={{ background: `${estado.color}22`, color: estado.color, border: `1px solid ${estado.color}55` }}
                          >
                            {estado.label}
                          </span>
                          {sede && <span className="font-mono text-[10px] text-muted-2">{sede.abrev}</span>}
                        </div>
                        <p className="mt-1 truncate text-sm font-medium">{emp?.nombre ?? "—"}</p>
                        <p className="text-[10px] text-muted-2">
                          #{emp?.numero_empleado ?? "—"} · {tipo.label}
                          {i.fecha_accidente && <> · accidente {i.fecha_accidente}</>}
                          {i.dias_autorizados && <> · {i.dias_autorizados}d</>}
                        </p>
                        {/* Progreso del proceso + documentos subidos */}
                        <div className="mt-2 flex items-center gap-2">
                          {prog ? (
                            <>
                              <div className="h-1 w-24 overflow-hidden rounded-full bg-white/5">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${(prog.paso / prog.total) * 100}%`, background: estado.color }}
                                />
                              </div>
                              <span className="font-mono text-[9px] text-muted-2">
                                paso {prog.paso}/{prog.total}
                              </span>
                            </>
                          ) : (
                            <span className="font-mono text-[9px] text-muted-2">proceso finalizado</span>
                          )}
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                              nDocs > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                            }`}
                            title={nDocs > 0 ? `${nDocs} documento(s) subido(s)` : "Sin documentos subidos"}
                          >
                            📎 {nDocs}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-2">
                        {new Date(i.creado_en).toLocaleDateString("es-MX", { dateStyle: "short" })}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

function KPI({ label, value, color }: { label: string; value: number; color: "blue" | "amber" | "violet" | "muted" }) {
  const cls = {
    blue:   "border-blue-400/30 bg-blue-500/[0.06] text-blue-200",
    amber:  "border-amber-400/30 bg-amber-500/[0.06] text-amber-200",
    violet: "border-violet-400/30 bg-violet-500/[0.06] text-violet-200",
    muted:  "border-white/10 bg-white/[0.03] text-muted",
  }[color];
  return (
    <div className={`rounded-xl border px-4 py-3 ${cls}`}>
      <div className="font-display text-2xl">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-tagline opacity-80">{label}</div>
    </div>
  );
}
