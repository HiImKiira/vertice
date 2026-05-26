import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { CODIGO_SPEC, type CodigoAsistencia } from "@vertice/shared/codes";
import { NotasEditor } from "./NotasEditor";
import { DatosPersonalesEditor } from "./DatosPersonalesEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Empleado · Consulta" };

interface PageProps {
  params: Promise<{ id: string }>;
}

interface RawEmp {
  id: string;
  numero_empleado: string;
  nombre: string;
  jornada: string;
  dia_descanso: string[];
  fecha_alta: string;
  fecha_baja: string | null;
  motivo_baja: string | null;
  salario_diario: number;
  segmento_original: string | null;
  notas: string | null;
  notas_actualizado_en: string | null;
  notas_actualizado_por: string | null;
  sede_id: string;
  // Datos personales / fiscales / bancarios (v25)
  rfc: string | null;
  nss: string | null;
  curp: string | null;
  telefono: string | null;
  email_personal: string | null;
  direccion: string | null;
  banco: string | null;
  cuenta_bancaria: string | null;
  clabe: string | null;
  sedes: { abrev: string; nombre: string } | { abrev: string; nombre: string }[] | null;
  notas_autor: { username: string } | { username: string }[] | null;
  baja_capturado_por_user: { username: string; nombre: string } | { username: string; nombre: string }[] | null;
}

const DIA_FULL: Record<string, string> = {
  LUN: "Lunes", MAR: "Martes", MIE: "Miércoles", JUE: "Jueves", VIE: "Viernes", SAB: "Sábado", DOM: "Domingo",
};

export default async function EmpleadoDetailPage({ params }: PageProps) {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: empRaw, error: empErr } = await supabase
    .from("empleados")
    .select(`
      id, numero_empleado, nombre, jornada, dia_descanso, fecha_alta, fecha_baja,
      motivo_baja, salario_diario, segmento_original, notas, notas_actualizado_en,
      notas_actualizado_por, sede_id,
      rfc, nss, curp, telefono, email_personal, direccion,
      banco, cuenta_bancaria, clabe,
      sedes(abrev, nombre),
      notas_autor:notas_actualizado_por(username),
      baja_capturado_por_user:baja_capturado_por(username, nombre)
    `)
    .eq("id", id)
    .maybeSingle();

  if (empErr) {
    console.error("[consulta/[id]]", empErr);
    notFound();
  }
  if (!empRaw) notFound();
  const emp = empRaw as unknown as RawEmp;

  const sede = Array.isArray(emp.sedes) ? emp.sedes[0] : emp.sedes;
  const notasAutor = Array.isArray(emp.notas_autor) ? emp.notas_autor[0] : emp.notas_autor;
  const bajaUser = Array.isArray(emp.baja_capturado_por_user) ? emp.baja_capturado_por_user[0] : emp.baja_capturado_por_user;

  // Histórico de asistencias (últimos 60 días)
  const hoy = new Date();
  hoy.setHours(hoy.getHours() - 6); // Mérida
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - 59);
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const { data: asists } = await supabase
    .from("asistencias")
    .select("fecha, codigo, capturado_por, actualizado_en, usuarios:capturado_por(username)")
    .eq("empleado_id", id)
    .gte("fecha", ymd(desde))
    .lte("fecha", ymd(hoy))
    .order("fecha", { ascending: false });

  // Stats lifetime
  const { data: allCodes } = await supabase
    .from("asistencias")
    .select("codigo")
    .eq("empleado_id", id);

  const lifetime = { A: 0, F: 0, DS: 0, DT: 0, otros: 0, total: 0 };
  for (const r of (allCodes ?? []) as Array<{ codigo: string }>) {
    lifetime.total++;
    if (r.codigo === "A" || r.codigo === "AF") lifetime.A++;
    else if (r.codigo === "F") lifetime.F++;
    else if (r.codigo === "DS") lifetime.DS++;
    else if (r.codigo === "DT") lifetime.DT++;
    else lifetime.otros++;
  }

  // Stats últimos 60 días
  const last60 = { A: 0, F: 0, DS: 0, otros: 0, total: 0 };
  for (const r of (asists ?? []) as Array<{ codigo: string }>) {
    last60.total++;
    if (r.codigo === "A" || r.codigo === "AF") last60.A++;
    else if (r.codigo === "F") last60.F++;
    else if (r.codigo === "DS") last60.DS++;
    else last60.otros++;
  }

  const histo = (asists ?? []) as Array<{
    fecha: string;
    codigo: CodigoAsistencia;
    actualizado_en: string | null;
    usuarios?: { username: string } | { username: string }[] | null;
  }>;

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/rh-pro/consulta" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
          <Icon name="arrow-left" size={12} /> Consulta
        </Link>

        <header className="mt-2 mb-6 animate-fade-up">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-muted-2">#{emp.numero_empleado}</span>
                {emp.fecha_baja ? (
                  <span className="rounded bg-red-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-red-200">DADO DE BAJA</span>
                ) : (
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-200">ACTIVO</span>
                )}
              </div>
              <h1 className="mt-1 font-display text-3xl sm:text-4xl">{emp.nombre}</h1>
              <p className="mt-1 text-sm text-muted">
                <span className="font-mono">{sede?.abrev}</span> · {sede?.nombre} · {emp.jornada}
              </p>
            </div>
            <Link
              href={`/pase-lista?sede=${emp.sede_id}&jornada=${emp.jornada}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-400/40 bg-blue-500/15 px-3 py-2 text-xs font-semibold text-blue-200 hover:bg-blue-500/30"
            >
              Ir al pase de lista <Icon name="arrow-right" size={12} />
            </Link>
          </div>
        </header>

        {/* Profile card */}
        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard label="Día de descanso" value={emp.dia_descanso.map((d) => DIA_FULL[d] ?? d).join(" + ") || "—"} />
          <InfoCard label="Salario diario" value={`$${Number(emp.salario_diario ?? 0).toFixed(2)}`} />
          <InfoCard label="Fecha de alta" value={emp.fecha_alta ?? "—"} />
          <InfoCard
            label={emp.fecha_baja ? "Fecha de baja" : "Antigüedad"}
            value={emp.fecha_baja ?? antiguedadFrom(emp.fecha_alta)}
            highlight={emp.fecha_baja ? "red" : "blue"}
          />
        </section>

        {emp.fecha_baja && emp.motivo_baja && (
          <section className="mb-6 rounded-xl border border-red-400/25 bg-red-500/[0.06] p-3">
            <p className="text-[10px] uppercase tracking-tagline text-red-300/70">Motivo de baja</p>
            <p className="mt-1 text-sm text-red-100">{emp.motivo_baja}</p>
            {bajaUser && (
              <p className="mt-1 text-[10px] text-muted-2">
                Capturado por <span className="font-mono">@{bajaUser.username}</span> ({bajaUser.nombre})
              </p>
            )}
          </section>
        )}

        {/* Stats */}
        <section className="mb-8">
          <div className="section-label mb-3">Estadísticas</div>
          <div className="grid gap-4 lg:grid-cols-2">
            <StatsBlock title={`Últimos 60 días (${last60.total} capturados)`} stats={last60} />
            <StatsBlock title={`Histórico total (${lifetime.total} capturados)`} stats={lifetime} showOtros />
          </div>
        </section>

        {/* Datos personales / fiscales / bancarios */}
        <section className="mb-6">
          <DatosPersonalesEditor
            empleadoId={emp.id}
            initial={{
              rfc: emp.rfc,
              nss: emp.nss,
              curp: emp.curp,
              telefono: emp.telefono,
              email_personal: emp.email_personal,
              direccion: emp.direccion,
              banco: emp.banco,
              cuenta_bancaria: emp.cuenta_bancaria,
              clabe: emp.clabe,
            }}
          />
        </section>

        {/* Notas internas RH */}
        <section className="mb-8">
          <div className="section-label mb-3 flex items-center gap-2">
            <Icon name="file-text" size={14} className="text-amber-300" />
            Notas internas (solo RH)
          </div>
          <NotasEditor
            empleadoId={emp.id}
            initial={emp.notas ?? ""}
            ultimaActualizacion={{
              fecha: emp.notas_actualizado_en,
              autor: notasAutor?.username ?? null,
            }}
          />
        </section>

        {/* Histórico */}
        <section>
          <div className="section-label mb-3">Histórico de capturas (últimos 60 días)</div>
          {histo.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 bg-[color:var(--card)] p-6 text-center text-sm text-muted">
              Sin asistencias capturadas en los últimos 60 días.
            </p>
          ) : (
            <ul className="space-y-1">
              {histo.map((r, i) => {
                const spec = CODIGO_SPEC[r.codigo];
                const autor = Array.isArray(r.usuarios) ? r.usuarios[0] : r.usuarios;
                const fechaObj = new Date(`${r.fecha}T00:00:00`);
                const dow = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"][fechaObj.getDay()]!;
                const esDescanso = emp.dia_descanso.includes(dow);
                return (
                  <li
                    key={`${r.fecha}-${i}`}
                    className={`flex items-center gap-3 rounded-md border border-white/5 bg-[color:var(--card)] px-3 py-2 ${
                      esDescanso ? "bg-emerald-500/[0.04]" : ""
                    }`}
                  >
                    <span className="shrink-0 font-mono text-xs text-muted">{r.fecha}</span>
                    <span className="shrink-0 text-[9px] uppercase tracking-tagline text-muted-2">{dow}</span>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white"
                      style={{ background: spec.color }}
                      title={spec.nombre}
                    >
                      {r.codigo}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted">{spec.nombre}</span>
                    {autor && (
                      <span className="shrink-0 text-[10px] text-muted-2">
                        por <span className="font-mono">@{autor.username}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="mt-16 border-t border-[color:var(--border)] pt-6 text-xs text-muted-2">
          <Link href="/rh-pro/consulta" className="hover:text-text">← Consulta</Link>
        </footer>
      </div>
    </main>
  );
}

function InfoCard({ label, value, highlight }: { label: string; value: string; highlight?: "blue" | "red" }) {
  const cls = highlight === "red"
    ? "border-red-400/25 bg-red-500/[0.06]"
    : highlight === "blue"
      ? "border-blue-400/25 bg-blue-500/[0.04]"
      : "border-white/10 bg-[color:var(--card)]";
  return (
    <div className={`rounded-xl border ${cls} px-4 py-3`}>
      <div className="text-[10px] uppercase tracking-tagline text-muted">{label}</div>
      <div className="mt-1 text-sm font-medium text-text">{value}</div>
    </div>
  );
}

function StatsBlock({ title, stats, showOtros }: { title: string; stats: { A: number; F: number; DS: number; DT?: number; otros: number; total: number }; showOtros?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[color:var(--card)] p-4">
      <p className="text-[10px] uppercase tracking-tagline text-muted">{title}</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        <Stat label="Asistencias" value={stats.A} color="emerald" />
        <Stat label="Faltas" value={stats.F} color="red" />
        <Stat label="Descansos" value={stats.DS} color="emerald-dark" />
        <Stat label={showOtros ? "Otros" : "Incid."} value={(stats.DT ?? 0) + stats.otros} color="amber" />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: "emerald" | "red" | "emerald-dark" | "amber" }) {
  const cls = {
    "emerald":      "text-emerald-200",
    "red":          "text-red-200",
    "emerald-dark": "text-emerald-300",
    "amber":        "text-amber-200",
  }[color];
  return (
    <div className="rounded-md border border-white/5 bg-[color:var(--surface)] px-2 py-2 text-center">
      <div className={`font-display text-xl ${cls}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-tagline text-muted-2">{label}</div>
    </div>
  );
}

function antiguedadFrom(fechaAlta: string): string {
  if (!fechaAlta) return "—";
  const alta = new Date(`${fechaAlta}T00:00:00`);
  const hoy = new Date();
  const ms = hoy.getTime() - alta.getTime();
  const dias = Math.floor(ms / 86_400_000);
  const meses = Math.floor(dias / 30);
  const anios = Math.floor(dias / 365);
  if (anios > 0) return `${anios} año${anios === 1 ? "" : "s"} ${meses % 12} mes${(meses % 12) === 1 ? "" : "es"}`;
  if (meses > 0) return `${meses} mes${meses === 1 ? "" : "es"}`;
  return `${dias} día${dias === 1 ? "" : "s"}`;
}
