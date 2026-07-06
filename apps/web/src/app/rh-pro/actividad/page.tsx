import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Topbar } from "@/components/Topbar";
import { Icon, type IconName } from "@/components/Icon";
import { AutoRefresh } from "../../live/AutoRefresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "Actividad de supervisores · RH Pro" };

interface PageProps {
  searchParams: Promise<{ sup?: string; cat?: string }>;
}

const DIA_FULL: Record<string, string> = {
  LUN: "Lun", MAR: "Mar", MIE: "Mié", JUE: "Jue", VIE: "Vie", SAB: "Sáb", DOM: "Dom",
};
function diasTxt(arr: string[] | null): string {
  if (!arr || arr.length === 0) return "—";
  return arr.map((d) => DIA_FULL[d] ?? d).join(" y ");
}

type Categoria = "descanso_fijo" | "cambio_sede" | "descanso_temporal" | "incapacidad";

interface Item {
  key: string;
  ts: string;
  actorId: string | null;
  categoria: Categoria;
  titulo: string;
  detalle: string;
  empleado: string;
  motivo: string | null;
  href?: string;
}

const CAT_SPEC: Record<Categoria, { label: string; color: string; icon: IconName }> = {
  descanso_fijo:     { label: "Descanso fijo",     color: "#3B82F6", icon: "calendar" },
  descanso_temporal: { label: "Descanso temporal", color: "#60A5FA", icon: "calendar" },
  cambio_sede:       { label: "Cambio sede/jornada", color: "#8B5CF6", icon: "arrow-right" },
  incapacidad:       { label: "Incapacidad",       color: "#F59E0B", icon: "file-text" },
};

function empNombre(e: unknown): string {
  const emp = Array.isArray(e) ? e[0] : e;
  const o = emp as { nombre?: string; numero_empleado?: string } | null;
  if (!o?.nombre) return "—";
  return `${o.nombre}${o.numero_empleado ? ` (#${o.numero_empleado})` : ""}`;
}

export default async function ActividadPage({ searchParams }: PageProps) {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const admin = supabaseAdmin();
  const params = await searchParams;
  const supFilter = params.sup ?? "all";
  const catFilter = params.cat ?? "all";

  const [movsRes, cdtsRes, incapRes, usersRes, sedesRes] = await Promise.all([
    admin
      .from("empleado_movimientos")
      .select("id, tipo, motivo, efectuado_en, efectuado_por, dia_descanso_anterior, dia_descanso_nuevo, sede_anterior, sede_nueva, jornada_anterior, jornada_nueva, empleados(nombre, numero_empleado)")
      .order("efectuado_en", { ascending: false })
      .limit(300),
    admin
      .from("cdts")
      .select("id, fecha_original, fecha_temporal, motivo, creado_en, creado_por, cancelado_en, empleados(nombre, numero_empleado)")
      .order("creado_en", { ascending: false })
      .limit(300),
    admin
      .from("incapacidades")
      .select("id, tipo, estado, creado_en, reportada_por, empleados(nombre, numero_empleado)")
      .order("creado_en", { ascending: false })
      .limit(300),
    admin.from("usuarios").select("id, nombre, username, rol").eq("activo", true).order("nombre"),
    admin.from("sedes").select("id, abrev"),
  ]);

  const userMap = new Map<string, { nombre: string; username: string }>(
    ((usersRes.data ?? []) as Array<{ id: string; nombre: string; username: string }>).map((u) => [u.id, { nombre: u.nombre, username: u.username }]),
  );
  const sedeMap = new Map<string, string>(
    ((sedesRes.data ?? []) as Array<{ id: string; abrev: string }>).map((s) => [s.id, s.abrev]),
  );
  const nombreActor = (id: string | null) => (id && userMap.get(id) ? `${userMap.get(id)!.nombre}` : "—");
  const userActor = (id: string | null) => (id && userMap.get(id) ? userMap.get(id)!.username : null);

  const items: Item[] = [];

  // 1) Movimientos (descanso fijo, cambio de sede/jornada)
  for (const m of (movsRes.data ?? []) as Array<Record<string, unknown>>) {
    const tipo = String(m.tipo);
    if (tipo === "cambio_descanso") {
      items.push({
        key: `mov-${m.id}`,
        ts: String(m.efectuado_en),
        actorId: (m.efectuado_por as string) ?? null,
        categoria: "descanso_fijo",
        titulo: "Cambió descanso fijo",
        detalle: `${diasTxt(m.dia_descanso_anterior as string[] | null)} → ${diasTxt(m.dia_descanso_nuevo as string[] | null)}`,
        empleado: empNombre(m.empleados),
        motivo: (m.motivo as string) ?? null,
      });
    } else {
      const sa = m.sede_anterior ? sedeMap.get(m.sede_anterior as string) ?? "—" : null;
      const sn = m.sede_nueva ? sedeMap.get(m.sede_nueva as string) ?? "—" : null;
      const partes: string[] = [];
      if (sa || sn) partes.push(`sede ${sa ?? "—"} → ${sn ?? "—"}`);
      if (m.jornada_anterior || m.jornada_nueva) partes.push(`jornada ${m.jornada_anterior ?? "—"} → ${m.jornada_nueva ?? "—"}`);
      items.push({
        key: `mov-${m.id}`,
        ts: String(m.efectuado_en),
        actorId: (m.efectuado_por as string) ?? null,
        categoria: "cambio_sede",
        titulo: "Reasignación",
        detalle: partes.join(" · ") || "—",
        empleado: empNombre(m.empleados),
        motivo: (m.motivo as string) ?? null,
      });
    }
  }

  // 2) CDTs (descanso temporal)
  for (const c of (cdtsRes.data ?? []) as Array<Record<string, unknown>>) {
    items.push({
      key: `cdt-${c.id}`,
      ts: String(c.creado_en),
      actorId: (c.creado_por as string) ?? null,
      categoria: "descanso_temporal",
      titulo: c.cancelado_en ? "Descanso temporal (cancelado)" : "Descanso temporal",
      detalle: `descansa ${c.fecha_original} → ${c.fecha_temporal}`,
      empleado: empNombre(c.empleados),
      motivo: (c.motivo as string) ?? null,
    });
  }

  // 3) Incapacidades reportadas
  for (const i of (incapRes.data ?? []) as Array<Record<string, unknown>>) {
    items.push({
      key: `inc-${i.id}`,
      ts: String(i.creado_en),
      actorId: (i.reportada_por as string) ?? null,
      categoria: "incapacidad",
      titulo: `Reportó incapacidad (${String(i.tipo).replace(/_/g, " ").toLowerCase()})`,
      detalle: `estado: ${String(i.estado).replace(/_/g, " ").toLowerCase()}`,
      empleado: empNombre(i.empleados),
      motivo: null,
      href: `/incapacidades/${i.id}`,
    });
  }

  // Orden global por fecha desc
  items.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));

  // Filtros
  const filtrados = items.filter((it) => {
    if (supFilter !== "all" && it.actorId !== supFilter) return false;
    if (catFilter !== "all" && it.categoria !== catFilter) return false;
    return true;
  });

  // Actores que sí tienen actividad, para el dropdown
  const actoresConActividad = [...new Set(items.map((i) => i.actorId).filter(Boolean) as string[])]
    .map((id) => ({ id, nombre: nombreActor(id), username: userActor(id) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const generadoEn = new Date().toISOString();

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 animate-fade-up">
          <Link href="/rh-pro" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> RH Pro
          </Link>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl">Actividad de supervisores</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted">
                Histórico de lo que han hecho los supervisores: cambios de descanso (fijo y temporal),
                reasignaciones e incapacidades reportadas. Todo documentado y a la mano.
              </p>
            </div>
            <AutoRefresh generadoEn={generadoEn} intervalSeconds={45} />
          </div>
        </header>

        {/* Filtros */}
        <form className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <select name="sup" defaultValue={supFilter} className="rounded-md border border-white/10 bg-[color:var(--surface)] px-2 py-1.5">
            <option value="all">Todos los supervisores</option>
            {actoresConActividad.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre}{a.username ? ` (@${a.username})` : ""}</option>
            ))}
          </select>
          <select name="cat" defaultValue={catFilter} className="rounded-md border border-white/10 bg-[color:var(--surface)] px-2 py-1.5">
            <option value="all">Todas las acciones</option>
            {(Object.keys(CAT_SPEC) as Categoria[]).map((c) => (
              <option key={c} value={c}>{CAT_SPEC[c].label}</option>
            ))}
          </select>
          <button type="submit" className="rounded-md border border-blue-400/30 bg-blue-500/15 px-3 py-1.5 text-blue-200">Aplicar</button>
          <span className="ml-auto text-[10px] text-muted-2">{filtrados.length} de {items.length} registros</span>
        </form>

        {/* Lista */}
        {filtrados.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[color:var(--card)] p-10 text-center text-sm text-muted">
            Sin actividad con esos filtros.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {filtrados.slice(0, 200).map((it) => {
              const spec = CAT_SPEC[it.categoria];
              const actor = it.actorId ? userMap.get(it.actorId) : null;
              const row = (
                <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-[color:var(--card)] p-3 transition hover:border-white/15">
                  <div
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    style={{ background: `${spec.color}1A`, border: `1px solid ${spec.color}44` }}
                  >
                    <span style={{ color: spec.color }}><Icon name={spec.icon} size={13} /></span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold" style={{ background: `${spec.color}22`, color: spec.color }}>
                        {spec.label}
                      </span>
                      <span className="text-sm font-semibold">{it.titulo}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      <span className="text-text">{it.empleado}</span> · {it.detalle}
                    </p>
                    {it.motivo && <p className="mt-0.5 text-[11px] text-muted-2">"{it.motivo}"</p>}
                    <p className="mt-1 text-[10px] text-muted-2">
                      por <span className="font-semibold text-muted">{actor?.nombre ?? "—"}</span>
                      {actor?.username && <span className="font-mono"> @{actor.username}</span>}
                      {" · "}
                      {new Date(it.ts).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                </div>
              );
              return <li key={it.key}>{it.href ? <Link href={it.href} className="block">{row}</Link> : row}</li>;
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
