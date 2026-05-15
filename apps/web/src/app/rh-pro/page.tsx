import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";

export const dynamic = "force-dynamic";
export const metadata = { title: "RH Pro" };

interface SupervisorAsign {
  usuario_id: string;
  usuario: { username: string; nombre: string; rol: string };
  sede: { abrev: string; nombre: string };
  jornada: string;
}

export default async function RHProPage() {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const supabase = await createSupabaseServerClient();

  // Resumen de operación
  const [{ count: totalEmp }, { count: totalActivos }, { count: totalSedes }, { count: totalAsign }] = await Promise.all([
    supabase.from("empleados").select("id", { count: "exact", head: true }),
    supabase.from("empleados").select("id", { count: "exact", head: true }).is("fecha_baja", null),
    supabase.from("sedes").select("id", { count: "exact", head: true }),
    supabase.from("asignaciones_supervisor").select("id", { count: "exact", head: true }).eq("activo", true),
  ]);

  // Lista de supervisores con sus asignaciones (vista vw_supervisores_con_asignaciones)
  const { data: superRaw } = await supabase
    .from("asignaciones_supervisor")
    .select("usuario_id, jornada, usuarios(username, nombre, rol), sedes(abrev, nombre)")
    .eq("activo", true)
    .order("usuario_id");
  const supervisoresMap = new Map<string, { username: string; nombre: string; rol: string; asignaciones: { abrev: string; nombre: string; jornada: string }[] }>();
  for (const r of (superRaw ?? []) as unknown as Array<{
    usuario_id: string;
    jornada: string;
    usuarios: { username: string; nombre: string; rol: string } | { username: string; nombre: string; rol: string }[] | null;
    sedes: { abrev: string; nombre: string } | { abrev: string; nombre: string }[] | null;
  }>) {
    const u = Array.isArray(r.usuarios) ? r.usuarios[0] : r.usuarios;
    const s = Array.isArray(r.sedes) ? r.sedes[0] : r.sedes;
    if (!u || !s) continue;
    if (!supervisoresMap.has(r.usuario_id)) {
      supervisoresMap.set(r.usuario_id, { username: u.username, nombre: u.nombre, rol: u.rol, asignaciones: [] });
    }
    supervisoresMap.get(r.usuario_id)!.asignaciones.push({ abrev: s.abrev, nombre: s.nombre, jornada: r.jornada });
  }
  const supervisores = [...supervisoresMap.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <main className="min-h-screen text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
          <div>
            <p className={`role-badge role-${profile.rol} mb-2`}>{profile.rol}</p>
            <h1 className="font-display text-3xl sm:text-4xl">RH Pro · Gestión de Personal</h1>
            <p className="mt-1 text-sm text-muted">Altas, bajas, incidencias y seguimiento de supervisores.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <KPI label="Empleados" value={String(totalEmp ?? 0)} color="blue" />
            <KPI label="Activos" value={String(totalActivos ?? 0)} color="green" />
            <KPI label="Sedes" value={String(totalSedes ?? 0)} color="violet" />
            <KPI label="Asignaciones" value={String(totalAsign ?? 0)} color="amber" />
          </div>
        </header>

        {/* ─── OPERACIONES DE PERSONAL ─── */}
        <section className="mb-10 animate-fade-up delay-100">
          <div className="section-label">Operaciones de personal</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ActionCard
              href="/rh-pro/empleados"
              icon="📅"
              iconBg="rgba(6,182,212,0.12)"
              iconBorder="rgba(6,182,212,0.3)"
              title="Captura rápida"
              sub="Calendario mes × empleado para sedes chicas. Click cycle entre A · F · DS · etc."
              badge="ADMIN / SUPERADMIN"
              badgeCls="pill pill-cyan"
            />
            <ActionCard
              href="/rh-pro/alta"
              icon="🟢"
              iconBg="rgba(16,185,129,0.12)"
              iconBorder="rgba(16,185,129,0.3)"
              title="Alta de empleado"
              sub="Genera folio (MHS/ABREV/NNN/2026), crea empleado y contrato. PDF firmable viene en el siguiente release."
              badge="ADMIN / SUPERADMIN"
              badgeCls="pill pill-green"
            />
            <ActionCard
              href="/rh-pro/baja"
              icon="🔴"
              iconBg="rgba(239,68,68,0.12)"
              iconBorder="rgba(239,68,68,0.3)"
              title="Baja de empleado"
              sub="Marca como BAJA. Deja de aparecer en pase de lista."
              badge="ADMIN / SUPERADMIN"
              badgeCls="pill pill-red"
              disabled
            />
            <ActionCard
              href="/rh-pro/escanear"
              icon="📷"
              iconBg="rgba(59,130,246,0.12)"
              iconBorder="rgba(59,130,246,0.3)"
              title="Captura por cámara"
              sub="Identifica empleados con su credencial. Claude analiza la imagen."
              badge="Todos los roles"
              badgeCls="pill"
              disabled
            />
          </div>
        </section>

        {/* ─── EXPORTACIÓN QUINCENAL ─── */}
        <section className="mb-10 animate-fade-up delay-200">
          <div className="section-label">Exportación quincenal</div>
          <div className="surface-glow p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[color:var(--border2)] bg-[color:var(--surface)] text-xl">📤</div>
              <div>
                <h2 className="font-display text-lg">Centro de exportación quincenal</h2>
                <p className="text-sm text-muted">
                  Genera reportes de asistencia con formato operativo. Las celdas vacías se muestran como{" "}
                  <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold">S/N</span>.
                </p>
              </div>
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="field">
                <label>Sede</label>
                <select disabled>
                  <option>Próximamente</option>
                </select>
              </div>
              <div className="field">
                <label>Mes / Año</label>
                <input type="month" disabled />
              </div>
              <div className="field">
                <label>Quincena</label>
                <select disabled>
                  <option>Q1 · 1 al 15</option>
                  <option>Q2 · 16 al fin de mes</option>
                </select>
              </div>
              <div className="field">
                <label>Fecha base</label>
                <input type="text" value="—" disabled readOnly />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" disabled>📊 Quincena operativa</button>
              <button type="button" className="btn btn-success" disabled>💰 Nómina estimada</button>
              <button type="button" className="btn btn-violet" disabled>↺ Sede activa</button>
            </div>
            <div className="mt-3"><span className="pill pill-blue">ADMIN / SUPERADMIN · próximamente</span></div>
          </div>
        </section>

        {/* ─── ASIGNACIÓN DE SUPERVISORES ─── */}
        <section className="animate-fade-up delay-300">
          <div className="section-label">RH Pro · Asignación de sede y jornada</div>
          <div className="surface-glow p-5 sm:p-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:rgba(16,185,129,0.3)] bg-[color:rgba(16,185,129,0.15)] text-lg">👤</div>
              <div>
                <h2 className="font-display text-base">Asignar sede y jornada a supervisores</h2>
                <p className="text-xs text-muted">Define qué jornada de qué sede ve cada supervisor al tomar pase.</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[color:var(--border)]">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--surface)] text-[10px] uppercase tracking-tagline text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Supervisor</th>
                    <th className="px-3 py-2 text-left">Sedes asignadas</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {supervisores.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-muted">Aún no hay asignaciones activas.</td>
                    </tr>
                  ) : (
                    supervisores.map((s) => (
                      <tr key={s.username} className="border-t border-[color:var(--border)] hover:bg-white/[0.02]">
                        <td className="px-3 py-2.5 align-top">
                          <p className="font-medium">{s.nombre}</p>
                          <p className="flex items-center gap-1.5 text-xs text-muted">
                            <span>@{s.username}</span>
                            <span className={`role-badge role-${s.rol}`}>{s.rol}</span>
                          </p>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            {s.asignaciones.map((a, i) => (
                              <span key={i} className="pill pill-green text-[10px]">
                                <span className="font-bold">{a.jornada}</span>
                                <span className="opacity-60">@</span>
                                <span>{a.abrev}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right align-top font-mono text-xs text-muted">
                          {s.asignaciones.length}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-2">
              Edición de asignaciones próximamente · por ahora se gestiona desde Supabase Studio.
            </p>
          </div>
        </section>

        <footer className="mt-16 border-t border-[color:var(--border)] pt-6 text-xs text-muted-2">
          <Link href="/dashboard" className="hover:text-text">← Dashboard</Link>
        </footer>
      </div>
    </main>
  );
}

function KPI({ label, value, color }: { label: string; value: string; color: "blue" | "green" | "violet" | "amber" }) {
  const cls = {
    blue:   "border-[rgba(59,130,246,0.35)] bg-[rgba(59,130,246,0.08)] text-[#93C5FD]",
    green:  "border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.08)] text-[#6EE7B7]",
    violet: "border-[rgba(139,92,246,0.35)] bg-[rgba(139,92,246,0.08)] text-[#C4B5FD]",
    amber:  "border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] text-[#FCD34D]",
  }[color];
  return (
    <div className={`rounded-xl border px-4 py-2.5 ${cls}`}>
      <div className="font-display text-xl leading-none">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-tagline opacity-70">{label}</div>
    </div>
  );
}

function ActionCard({ href, icon, iconBg, iconBorder, title, sub, badge, badgeCls, disabled }: {
  href: string;
  icon: string;
  iconBg: string;
  iconBorder: string;
  title: string;
  sub: string;
  badge: string;
  badgeCls: string;
  disabled?: boolean;
}) {
  const Wrapper = disabled
    ? ({ children }: { children: React.ReactNode }) => <div className="card-action opacity-50 cursor-not-allowed">{children}</div>
    : ({ children }: { children: React.ReactNode }) => <Link href={href} className="card-action">{children}</Link>;
  return (
    <Wrapper>
      <div className="card-action-icon" style={{ background: iconBg, borderColor: iconBorder }}>{icon}</div>
      <div className="card-action-title">{title}</div>
      <div className="card-action-sub">{sub}</div>
      <div className="flex items-center gap-2">
        <span className={badgeCls}>{badge}</span>
        {disabled && <span className="text-[10px] text-muted-2">próximamente</span>}
      </div>
    </Wrapper>
  );
}
