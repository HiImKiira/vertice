import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { DateNav } from "./DateNav";
import { SupervisorRow } from "./SupervisorRow";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Cobertura supervisores · Centro LIVE" };

interface PageProps {
  searchParams: Promise<{ fecha?: string; q?: string; filtro?: string }>;
}

interface CovRow {
  usuario_id: string;
  username: string;
  nombre: string;
  sedes_n: number;
  jornadas_n: number;
  empleados_total: number;
  capturadas: number;
  pct_cobertura: number;
  faltantes: number;
  ultima_captura: string | null;
}

function meridaToday(): string {
  const d = new Date();
  d.setHours(d.getHours() - 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function CoberturaPage({ searchParams }: PageProps) {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const fecha = params.fecha?.match(/^\d{4}-\d{2}-\d{2}$/) ? params.fecha : meridaToday();
  const q = (params.q ?? "").trim().toLowerCase();
  const filtro = params.filtro ?? "all";

  const { data: rows, error } = await supabase.rpc("cobertura_supervisores", { p_fecha: fecha });
  const supervisores = (rows ?? []) as CovRow[];

  // Filtros UI
  const filtrados = supervisores.filter((s) => {
    if (filtro === "incompletos" && s.pct_cobertura >= 95) return false;
    if (filtro === "cero" && s.capturadas > 0) return false;
    if (filtro === "completos" && s.pct_cobertura < 100) return false;
    if (q && !s.nombre.toLowerCase().includes(q) && !s.username.toLowerCase().includes(q)) return false;
    return true;
  });

  // Stats top
  const totalEsperado = supervisores.reduce((acc, s) => acc + s.empleados_total, 0);
  const totalCapturado = supervisores.reduce((acc, s) => acc + s.capturadas, 0);
  const pctGlobal = totalEsperado > 0 ? Math.round((totalCapturado / totalEsperado) * 100) : 0;
  const completosN = supervisores.filter((s) => s.pct_cobertura >= 100 && s.empleados_total > 0).length;
  const incompletosN = supervisores.filter((s) => s.pct_cobertura < 100).length;
  const ceroN = supervisores.filter((s) => s.capturadas === 0 && s.empleados_total > 0).length;

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8">
        <Link href="/live" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
          <Icon name="arrow-left" size={12} /> Centro LIVE
        </Link>

        <header className="mt-2 mb-6 animate-fade-up">
          <p className="text-[10px] font-semibold uppercase tracking-ultra text-[#67E8F9]">COBERTURA</p>
          <h1 className="font-display text-3xl sm:text-4xl">Cobertura de supervisores</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Quién ya capturó completo y quién falta. Útil para control diario y para validar
            antes del cierre quincenal (consulta &quot;ayer&quot; para nómina).
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-md border border-red-400/30 bg-red-500/[0.08] p-3 text-xs text-red-200">
            Error: {error.message}
          </div>
        )}

        <section className="mb-4">
          <DateNav fecha={fecha} />
        </section>

        {/* KPIs top */}
        <section className="mb-4 grid gap-2 grid-cols-2 sm:grid-cols-4">
          <KPI label="Supervisores" value={supervisores.length} color="blue" />
          <KPI label="Completos (≥100%)" value={completosN} color="emerald" />
          <KPI label="Incompletos" value={incompletosN} color="amber" sub={`${ceroN} sin capturar nada`} />
          <KPI label="% Global" value={`${pctGlobal}%`} color={pctGlobal >= 80 ? "emerald" : pctGlobal >= 50 ? "amber" : "red"} sub={`${totalCapturado}/${totalEsperado}`} />
        </section>

        {/* Filtros */}
        <form className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar supervisor..."
            className="min-w-0 rounded-md border border-white/10 bg-[color:var(--surface)] px-3 py-1.5 text-xs"
          />
          <select name="filtro" defaultValue={filtro} className="rounded-md border border-white/10 bg-[color:var(--surface)] px-2 py-1.5 text-xs">
            <option value="all">Todos</option>
            <option value="incompletos">Incompletos (&lt;100%)</option>
            <option value="cero">Sin capturar nada</option>
            <option value="completos">Solo completos</option>
          </select>
          {/* Mantener fecha en submit */}
          <input type="hidden" name="fecha" value={fecha} />
          <button type="submit" className="rounded-md border border-blue-400/30 bg-blue-500/15 px-3 py-1.5 text-blue-200">
            Aplicar
          </button>
          <span className="ml-auto text-[10px] text-muted-2">{filtrados.length} resultado{filtrados.length === 1 ? "" : "s"}</span>
        </form>

        {/* Lista */}
        {filtrados.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[color:var(--card)] p-10 text-center text-sm text-muted">
            Sin supervisores con esos filtros.
          </div>
        ) : (
          <ul className="space-y-2">
            {filtrados.map((s) => (
              <SupervisorRow
                key={s.usuario_id}
                usuarioId={s.usuario_id}
                nombre={s.nombre}
                username={s.username}
                sedesN={s.sedes_n}
                jornadasN={s.jornadas_n}
                empTotal={s.empleados_total}
                capturadas={s.capturadas}
                pct={s.pct_cobertura}
                faltantes={s.faltantes}
                ultimaCaptura={s.ultima_captura}
                fecha={fecha}
              />
            ))}
          </ul>
        )}

        <footer className="mt-8 border-t border-[color:var(--border)] pt-4 text-[10px] text-muted-2">
          <p>
            * &quot;Empleados a capturar&quot; = empleados que coinciden exactamente con las asignaciones (sede × jornada)
            activas del supervisor. Click en cualquier renglón para ver el desglose por sede y la cobertura mensual.
          </p>
        </footer>
      </div>
    </main>
  );
}

function KPI({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: "blue" | "emerald" | "amber" | "red" }) {
  const cls = {
    blue: "border-blue-400/30 bg-blue-500/[0.06] text-blue-200",
    emerald: "border-emerald-400/30 bg-emerald-500/[0.06] text-emerald-200",
    amber: "border-amber-400/30 bg-amber-500/[0.06] text-amber-200",
    red: "border-red-400/30 bg-red-500/[0.06] text-red-200",
  }[color];
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${cls}`}>
      <div className="font-display text-2xl leading-none">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-tagline opacity-80">{label}</div>
      {sub && <div className="mt-0.5 text-[9px] opacity-60">{sub}</div>}
    </div>
  );
}
