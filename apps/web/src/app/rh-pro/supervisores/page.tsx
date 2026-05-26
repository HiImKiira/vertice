import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { NotificarTodos } from "./NotificarTodos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Centro de supervisores · RH Pro" };

interface PageProps {
  searchParams: Promise<{ q?: string; estado?: string; ordenar?: string }>;
}

interface SupRow {
  id: string;
  nombre: string;
  username: string;
  rol: string;
  activo: boolean;
  sedes_asignadas: number;
  jornadas_asignadas: number;
  empleados_a_cargo: number;
  capturadas_hoy: number;
  pct_hoy: number;
  push_dispositivos: number;
  ultimo_acceso: string | null;
  ultima_captura: string | null;
  tiene_notas: boolean;
}

export default async function SupervisoresPage({ searchParams }: PageProps) {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const q = (params.q ?? "").trim().toLowerCase();
  const estado = params.estado ?? "all";
  const ordenar = params.ordenar ?? "cobertura";

  const { data: rows, error } = await supabase.rpc("supervisores_lista");
  const supervisores = (rows ?? []) as SupRow[];

  // Filtros + ordenamiento
  const filtrados = supervisores
    .filter((s) => {
      if (estado === "activos" && !s.activo) return false;
      if (estado === "inactivos" && s.activo) return false;
      if (estado === "sin_asignacion" && s.sedes_asignadas > 0) return false;
      if (estado === "sin_push" && s.push_dispositivos > 0) return false;
      if (estado === "completos_hoy" && s.pct_hoy < 100) return false;
      if (estado === "incompletos_hoy" && (s.pct_hoy >= 100 || s.empleados_a_cargo === 0)) return false;
      if (q && !s.nombre.toLowerCase().includes(q) && !s.username.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => {
      if (ordenar === "nombre") return a.nombre.localeCompare(b.nombre);
      if (ordenar === "actividad") {
        return (new Date(b.ultima_captura ?? 0).getTime()) - (new Date(a.ultima_captura ?? 0).getTime());
      }
      // default: cobertura ascendente (peores primero)
      return a.pct_hoy - b.pct_hoy;
    });

  const activos = supervisores.filter((s) => s.activo);
  const incompletosHoy = activos.filter((s) => s.empleados_a_cargo > 0 && s.pct_hoy < 100);
  const sinPush = activos.filter((s) => s.push_dispositivos === 0);
  const sinAsignacion = activos.filter((s) => s.sedes_asignadas === 0);

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1400px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 animate-fade-up">
          <Link href="/rh-pro" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> RH Pro
          </Link>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl">Centro de supervisores</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Monitoreo, cobertura, notas y mensajería directa con cada supervisor activo. Click en una card para ficha completa.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-md border border-red-400/30 bg-red-500/[0.08] p-3 text-xs text-red-200">
            Error cargando supervisores: {error.message}
          </div>
        )}

        {/* KPIs + acciones masivas */}
        <section className="mb-4 grid gap-3 sm:grid-cols-4">
          <KPI label="Activos" value={activos.length} color="blue" />
          <KPI label="Incompletos hoy" value={incompletosHoy.length} color="amber" />
          <KPI label="Sin asignaciones" value={sinAsignacion.length} color="violet" />
          <KPI label="Sin push activo" value={sinPush.length} color="red" />
        </section>

        <section className="mb-4 rounded-xl border border-amber-400/25 bg-amber-500/[0.04] p-3">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="send" size={14} className="text-amber-300" />
            <p className="text-xs font-semibold text-amber-200">Acción masiva</p>
          </div>
          <p className="mb-2 text-[11px] text-muted">
            Manda recordatorio push personalizado a todos los supervisores con cobertura &lt;100% hoy.
            Cada uno recibe su conteo exacto de pendientes.
          </p>
          <NotificarTodos incompletosN={incompletosHoy.length} />
        </section>

        {/* Filtros */}
        <form className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar nombre o username..."
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-[color:var(--surface)] px-3 py-1.5 text-xs sm:max-w-xs"
          />
          <select name="estado" defaultValue={estado} className="rounded-md border border-white/10 bg-[color:var(--surface)] px-2 py-1.5 text-xs">
            <option value="all">Todos</option>
            <option value="activos">Solo activos</option>
            <option value="inactivos">Solo inactivos</option>
            <option value="incompletos_hoy">Incompletos hoy</option>
            <option value="completos_hoy">Completos hoy</option>
            <option value="sin_asignacion">Sin asignaciones</option>
            <option value="sin_push">Sin push activo</option>
          </select>
          <select name="ordenar" defaultValue={ordenar} className="rounded-md border border-white/10 bg-[color:var(--surface)] px-2 py-1.5 text-xs">
            <option value="cobertura">Orden: peor cobertura</option>
            <option value="nombre">Orden: nombre A-Z</option>
            <option value="actividad">Orden: actividad reciente</option>
          </select>
          <button type="submit" className="rounded-md border border-blue-400/30 bg-blue-500/15 px-3 py-1.5 text-blue-200">
            Aplicar
          </button>
          <span className="ml-auto text-[10px] text-muted-2">{filtrados.length} resultado{filtrados.length === 1 ? "" : "s"}</span>
        </form>

        {/* Grid de cards */}
        {filtrados.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[color:var(--card)] p-10 text-center text-sm text-muted">
            Sin resultados con esos filtros.
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtrados.map((s) => <Card key={s.id} sup={s} />)}
          </ul>
        )}
      </div>
    </main>
  );
}

function Card({ sup }: { sup: SupRow }) {
  const colorPct = sup.pct_hoy >= 95 ? "#10B981" : sup.pct_hoy >= 50 ? "#F59E0B" : "#EF4444";
  const ultima = sup.ultima_captura
    ? new Date(sup.ultima_captura).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })
    : null;
  return (
    <li>
      <Link
        href={`/rh-pro/supervisores/${sup.id}`}
        className={`block rounded-xl border p-3 transition hover:border-[color:var(--blue)] ${
          sup.activo ? "border-white/5 bg-[color:var(--card)]" : "border-red-400/20 bg-red-500/[0.04] opacity-70"
        }`}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold">{sup.nombre}</p>
              {sup.tiene_notas && (
                <span title="Tiene notas internas" className="shrink-0 text-amber-300">
                  <Icon name="file-text" size={11} />
                </span>
              )}
            </div>
            <p className="font-mono text-[10px] text-muted-2">@{sup.username}</p>
          </div>
          {!sup.activo && (
            <span className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-red-300">INACT</span>
          )}
        </div>

        {sup.empleados_a_cargo > 0 ? (
          <>
            <div className="mb-1 flex items-baseline justify-between text-[10px]">
              <span className="text-muted-2">{sup.sedes_asignadas} sede{sup.sedes_asignadas === 1 ? "" : "s"} · {sup.jornadas_asignadas} jornada{sup.jornadas_asignadas === 1 ? "" : "s"}</span>
              <span className="font-display text-base font-bold" style={{ color: colorPct }}>{sup.pct_hoy}%</span>
            </div>
            <div className="mb-1.5 h-1 overflow-hidden rounded-full bg-white/5">
              <div className="h-full transition-all duration-500" style={{ width: `${sup.pct_hoy}%`, background: colorPct }} />
            </div>
            <p className="text-[10px] text-muted">
              {sup.capturadas_hoy}/{sup.empleados_a_cargo} hoy
              {ultima && <> · última {ultima.split(",")[1]?.trim() ?? ultima}</>}
            </p>
          </>
        ) : (
          <p className="text-[10px] text-muted-2">Sin empleados a su cargo</p>
        )}

        <div className="mt-2 flex items-center gap-2 text-[10px]">
          <span className={`rounded px-1.5 py-0.5 font-mono font-bold ${
            sup.push_dispositivos > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
          }`}>
            {sup.push_dispositivos} 📱
          </span>
          <span className="text-muted-2">push</span>
        </div>
      </Link>
    </li>
  );
}

function KPI({ label, value, color }: { label: string; value: number; color: "blue" | "amber" | "violet" | "red" }) {
  const cls = {
    blue:   "border-blue-400/30 bg-blue-500/[0.06] text-blue-200",
    amber:  "border-amber-400/30 bg-amber-500/[0.06] text-amber-200",
    violet: "border-violet-400/30 bg-violet-500/[0.06] text-violet-200",
    red:    "border-red-400/30 bg-red-500/[0.06] text-red-200",
  }[color];
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${cls}`}>
      <div className="font-display text-2xl leading-none">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-tagline opacity-80">{label}</div>
    </div>
  );
}
