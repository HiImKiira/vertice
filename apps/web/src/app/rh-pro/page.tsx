import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { AsignacionesEditor, type SupervisorRow } from "./AsignacionesEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "RH Pro" };

export default async function RHProPage() {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const supabase = await createSupabaseServerClient();

  // Quincena actual (Mérida = UTC-6)
  const ahora = new Date();
  ahora.setHours(ahora.getHours() - 6);
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const day = ahora.getDate();
  const y = ahora.getFullYear();
  const m = ahora.getMonth();
  const qStart = day <= 15 ? new Date(y, m, 1) : new Date(y, m, 16);
  const qEnd = day <= 15 ? new Date(y, m, 15) : new Date(y, m + 1, 0);
  const qStartIso = ymd(qStart);
  const qEndIso = ymd(qEnd);
  const qLabel = day <= 15 ? "Q1" : "Q2";

  // Resumen de operación + asistencias de la quincena
  const [
    { count: totalEmp },
    { count: totalActivos },
    { count: totalSedes },
    { count: totalAsign },
    { count: totalSedesActivas },
    { count: asistQuincena },
  ] = await Promise.all([
    supabase.from("empleados").select("id", { count: "exact", head: true }),
    supabase.from("empleados").select("id", { count: "exact", head: true }).is("fecha_baja", null),
    supabase.from("sedes").select("id", { count: "exact", head: true }),
    supabase.from("asignaciones_supervisor").select("id", { count: "exact", head: true }).eq("activo", true),
    supabase.from("sedes").select("id", { count: "exact", head: true }).or("activa.is.null,activa.eq.true"),
    supabase
      .from("asistencias")
      .select("id", { count: "exact", head: true })
      .gte("fecha", qStartIso)
      .lte("fecha", qEndIso),
  ]);

  // Asistencias esperadas: empleados_activos × días transcurridos de la quincena
  const diasTrans = Math.min(
    Math.floor((ahora.getTime() - qStart.getTime()) / 86_400_000) + 1,
    Math.floor((qEnd.getTime() - qStart.getTime()) / 86_400_000) + 1,
  );
  const esperadas = (totalActivos ?? 0) * Math.max(1, diasTrans);
  const pctQuincena = esperadas > 0 ? Math.round(((asistQuincena ?? 0) / esperadas) * 100) : 0;

  // TODOS los usuarios (activos) — para que aparezcan en el editor aunque no tengan asignaciones
  const { data: usuariosRaw } = await supabase
    .from("usuarios")
    .select("id, username, nombre, rol")
    .eq("activo", true)
    .order("nombre");

  // Asignaciones activas (con sede join) para colgarlas a cada usuario
  const { data: asignRaw } = await supabase
    .from("asignaciones_supervisor")
    .select("id, jornada, usuario_id, sedes(id, abrev, nombre)")
    .eq("activo", true);

  const asignPorUsuario = new Map<string, SupervisorRow["asignaciones"]>();
  for (const a of (asignRaw ?? []) as unknown as Array<{
    id: string;
    jornada: string;
    usuario_id: string;
    sedes: { id: string; abrev: string; nombre: string } | { id: string; abrev: string; nombre: string }[] | null;
  }>) {
    const sede = Array.isArray(a.sedes) ? a.sedes[0] : a.sedes;
    if (!sede) continue;
    if (!asignPorUsuario.has(a.usuario_id)) asignPorUsuario.set(a.usuario_id, []);
    asignPorUsuario.get(a.usuario_id)!.push({ id: a.id, jornada: a.jornada, sede });
  }

  const supervisores: SupervisorRow[] = ((usuariosRaw ?? []) as Array<{ id: string; username: string; nombre: string; rol: string }>).map((u) => ({
    usuario_id: u.id,
    username: u.username,
    nombre: u.nombre,
    rol: u.rol,
    asignaciones: asignPorUsuario.get(u.id) ?? [],
  }));

  // Sedes para el dropdown de "agregar"
  const { data: sedesRaw } = await supabase.from("sedes").select("id, abrev, nombre").order("nombre");
  const sedesParaEditor = (sedesRaw ?? []) as { id: string; abrev: string; nombre: string }[];

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
          <div>
            <p className={`role-badge role-${profile.rol} mb-2`}>{profile.rol}</p>
            <h1 className="font-display text-3xl sm:text-4xl">RH Pro · Gestión de Personal</h1>
            <p className="mt-1 text-sm text-muted">Altas, bajas, incidencias y seguimiento de supervisores.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/rh-pro/sedes" className="btn btn-ghost btn-sm">Sedes activas</Link>
              <Link href="/rh-pro/liberaciones" className="btn btn-ghost btn-sm">Liberar fechas</Link>
              <Link href="/rh-pro/contratos" className="btn btn-ghost btn-sm">Contratos</Link>
              <Link href="/descansos" className="btn btn-ghost btn-sm">Cambios de descanso</Link>
              <Link href="/reportes" className="btn btn-ghost btn-sm">Reportes PDF</Link>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <KPI label="Activos" value={String(totalActivos ?? 0)} sub={`/${totalEmp ?? 0}`} color="green" />
            <KPI label="Sedes activas" value={String(totalSedesActivas ?? 0)} sub={`/${totalSedes ?? 0}`} color="violet" />
            <KPI label="Asignaciones" value={String(totalAsign ?? 0)} color="amber" />
            <KPI
              label={`${qLabel} · ${qStartIso.slice(5)}↔${qEndIso.slice(5)}`}
              value={String(asistQuincena ?? 0)}
              sub={`${pctQuincena}%`}
              color="blue"
            />
          </div>
        </header>

        {/* ─── OPERACIONES DE PERSONAL ─── */}
        <section className="mb-10 animate-fade-up delay-100">
          <div className="section-label">Operaciones de personal</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ActionCard
              href="/rh-pro/sedes"
              icon="🏢"
              iconBg="rgba(139,92,246,0.12)"
              iconBorder="rgba(139,92,246,0.3)"
              title="Sedes activas"
              sub="Alta, edición, activar/desactivar sedes. Solo se ven en captura las activas."
              badge="ADMIN / SUPERADMIN"
              badgeCls="pill pill-violet"
            />
            <ActionCard
              href="/rh-pro/liberaciones"
              icon="🔓"
              iconBg="rgba(16,185,129,0.12)"
              iconBorder="rgba(16,185,129,0.3)"
              title="Liberar fechas"
              sub="Abre fechas globales para que los supervisores capturen fuera de la ventana de gracia. Expira automática."
              badge="ADMIN / SUPERADMIN / SOPORTE"
              badgeCls="pill pill-green"
            />
            <ActionCard
              href="/rh-pro/cambio-descanso"
              icon="🔁"
              iconBg="rgba(16,185,129,0.12)"
              iconBorder="rgba(16,185,129,0.3)"
              title="Cambio de descanso fijo"
              sub="Cambia el día de descanso PERMANENTE de un trabajador (sede → trabajador → día → motivo). Notifica al supervisor y queda en bitácora."
              badge="ADMIN / SUPERADMIN / SOPORTE"
              badgeCls="pill pill-green"
            />
            <ActionCard
              href="/rh-pro/descansos-semanales"
              icon="🛌"
              iconBg="rgba(96,165,250,0.12)"
              iconBorder="rgba(96,165,250,0.3)"
              title="Descansos semanales (masivo)"
              sub="Editor masivo tipo grid de toda la sede. Día de descanso por ley (1 de cada 6 días). Vortex auto-llena DS en pase de lista."
              badge="ADMIN / SUPERADMIN / SOPORTE"
              badgeCls="pill pill-blue"
            />
            <ActionCard
              href="/rh-pro/supervisores"
              icon="👥"
              iconBg="rgba(103,232,249,0.12)"
              iconBorder="rgba(103,232,249,0.3)"
              title="Centro de supervisores"
              sub="Monitoreo, cobertura por persona, notas internas, mensaje directo y notificación masiva."
              badge="ADMIN / SUPERADMIN / SOPORTE"
              badgeCls="pill pill-cyan"
            />
            <ActionCard
              href="/rh-pro/cambio-sede"
              icon="🔀"
              iconBg="rgba(168,85,247,0.12)"
              iconBorder="rgba(168,85,247,0.3)"
              title="Cambio de sede"
              sub="Reasigna uno o varios empleados a otra sede/jornada. Útil cuando se mueven de un hospital a otro. El supervisor receptor se entera por push."
              badge="SUPERADMIN / SOPORTE"
              badgeCls="pill pill-violet"
            />
            <ActionCard
              href="/rh-pro/consulta"
              icon="🔍"
              iconBg="rgba(245,158,11,0.12)"
              iconBorder="rgba(245,158,11,0.3)"
              title="Consulta de empleados"
              sub="Busca por nombre o ID. Histórico, datos personales/bancarios editables, estadísticas y notas internas."
              badge="ADMIN / SUPERADMIN / SOPORTE"
              badgeCls="pill pill-amber"
            />
            <ActionCard
              href="/rh-pro/empleados/importar"
              icon="📥"
              iconBg="rgba(16,185,129,0.12)"
              iconBorder="rgba(16,185,129,0.3)"
              title="Import masivo (xlsx)"
              sub="Crea o actualiza empleados en lote desde un Excel. Valida sede/jornada/RFC/CLABE antes de confirmar. Template descargable."
              badge="ADMIN / SUPERADMIN / SOPORTE"
              badgeCls="pill pill-green"
            />
            <ActionCard
              href="/facturacion/empleados-bancarios"
              icon="🏦"
              iconBg="rgba(59,130,246,0.12)"
              iconBorder="rgba(59,130,246,0.3)"
              title="Datos bancarios · SPEI"
              sub="Vista de empleados con RFC/NSS/banco/CLABE. Exporta layout listo para subir al banco. Filtra por sede."
              badge="Facturación / Admin-like"
              badgeCls="pill pill-blue"
            />
            <ActionCard
              href="/rh-pro/liberacion-global"
              icon="🔓"
              iconBg="rgba(239,68,68,0.12)"
              iconBorder="rgba(239,68,68,0.3)"
              title="Liberación global"
              sub="Atajo de emergencia: abre TODAS las fechas para captura libre. Útil en cierre de quincena o recuperación masiva."
              badge="ADMIN / SUPERADMIN / SOPORTE"
              badgeCls="pill pill-red"
            />
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
              sub="Marca como BAJA con motivo + fecha. Deja de aparecer en pase de lista, conserva su historial."
              badge="ADMIN / SUPERADMIN"
              badgeCls="pill pill-red"
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

        {/* ─── ASIGNACIÓN DE SUPERVISORES ─── */}
        <section className="animate-fade-up delay-300">
          <div className="section-label">Asignación de sede y jornada a supervisores</div>
          <div className="surface-glow p-5 sm:p-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:rgba(16,185,129,0.3)] bg-[color:rgba(16,185,129,0.15)] text-lg">👤</div>
              <div>
                <h2 className="font-display text-base">Editor de asignaciones</h2>
                <p className="text-xs text-muted">
                  Define qué jornada de qué sede ve cada supervisor al tomar pase.
                  Click <span className="font-mono text-[#FCA5A5]">×</span> en una asignación para quitarla.
                  Una asignación = sede × jornada × supervisor (la combinación es única).
                </p>
              </div>
            </div>

            <AsignacionesEditor supervisores={supervisores} sedes={sedesParaEditor} />
          </div>
        </section>

        <footer className="mt-16 border-t border-[color:var(--border)] pt-6 text-xs text-muted-2">
          <Link href="/dashboard" className="hover:text-text">← Dashboard</Link>
        </footer>
      </div>
    </main>
  );
}

function KPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color: "blue" | "green" | "violet" | "amber" }) {
  const cls = {
    blue:   "border-[rgba(59,130,246,0.35)] bg-[rgba(59,130,246,0.08)] text-[#93C5FD]",
    green:  "border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.08)] text-[#6EE7B7]",
    violet: "border-[rgba(139,92,246,0.35)] bg-[rgba(139,92,246,0.08)] text-[#C4B5FD]",
    amber:  "border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] text-[#FCD34D]",
  }[color];
  return (
    <div className={`rounded-xl border px-4 py-2.5 ${cls}`}>
      <div className="font-display text-xl leading-none">
        {value}
        {sub && <span className="ml-1 text-xs opacity-70">{sub}</span>}
      </div>
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
