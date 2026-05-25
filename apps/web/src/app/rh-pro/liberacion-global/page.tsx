import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { LiberacionGlobalClient } from "./LiberacionGlobalClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Liberación global · RH Pro" };

interface LibRow {
  id: string;
  activado_por: string;
  activado_en: string;
  expira_en: string | null;
  motivo: string | null;
  activo: boolean;
  desactivado_por: string | null;
  desactivado_en: string | null;
  usuarios_act: { nombre: string; username: string } | { nombre: string; username: string }[] | null;
  usuarios_des: { nombre: string; username: string } | { nombre: string; username: string }[] | null;
}

export default async function LiberacionGlobalPage() {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);

  const supabase = await createSupabaseServerClient();
  const admin = supabaseAdmin();

  // Liberación actual activa
  const { data: activas } = await admin
    .from("liberaciones_globales")
    .select("id, activado_por, activado_en, expira_en, motivo, activo, desactivado_por, desactivado_en, usuarios_act:activado_por(nombre, username), usuarios_des:desactivado_por(nombre, username)")
    .eq("activo", true)
    .order("activado_en", { ascending: false })
    .limit(1);

  const activa = (activas?.[0] as unknown as LibRow | undefined) ?? null;
  // Filtrar las expiradas — solo mostramos si todavía no expiró
  const validas = activa && (!activa.expira_en || new Date(activa.expira_en) > new Date())
    ? activa
    : null;

  const autorActiva = validas
    ? (Array.isArray(validas.usuarios_act) ? validas.usuarios_act[0] : validas.usuarios_act)
    : null;

  // Historial reciente (últimas 10)
  const { data: historial } = await supabase
    .from("liberaciones_globales")
    .select("id, activado_por, activado_en, expira_en, motivo, activo, desactivado_en, usuarios_act:activado_por(nombre)")
    .order("activado_en", { ascending: false })
    .limit(10);

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[900px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 animate-fade-up">
          <Link href="/rh-pro" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> RH Pro
          </Link>
          <p className="role-badge role-ADMIN mt-2 mb-2">Liberación global · ADMIN/SUPERADMIN/SOPORTE</p>
          <h1 className="font-display text-3xl sm:text-4xl">Liberar todas las fechas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Atajo de emergencia: con un click, libera TODAS las fechas para que cualquier
            supervisor pueda capturar sin restricciones de gracia. Útil en cierre de
            quincena, problemas técnicos generalizados o recuperación masiva.
          </p>
        </header>

        <LiberacionGlobalClient
          activaActual={validas ? {
            id: validas.id,
            activado_por: validas.activado_por,
            activado_en: validas.activado_en,
            expira_en: validas.expira_en,
            motivo: validas.motivo,
            autor_nombre: autorActiva?.nombre ?? "Desconocido",
          } : null}
        />

        {/* Historial reciente */}
        <section className="mt-8">
          <div className="section-label mb-3">Historial reciente</div>
          {(historial ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 bg-[color:var(--card)] p-6 text-center text-xs text-muted">
              Sin liberaciones globales previas.
            </p>
          ) : (
            <ul className="space-y-1">
              {(historial as unknown as Array<{
                id: string; activado_en: string; expira_en: string | null; motivo: string | null;
                activo: boolean; desactivado_en: string | null;
                usuarios_act: { nombre: string } | { nombre: string }[] | null;
              }>).map((h) => {
                const autor = Array.isArray(h.usuarios_act) ? h.usuarios_act[0] : h.usuarios_act;
                const expirada = h.expira_en && new Date(h.expira_en) < new Date();
                const status = h.activo && !expirada ? "ACTIVA" : h.desactivado_en ? "DESACTIVADA" : expirada ? "EXPIRADA" : "—";
                const statusColor = status === "ACTIVA" ? "text-emerald-300" : "text-muted-2";
                return (
                  <li key={h.id} className="flex items-center gap-3 rounded-md border border-white/5 bg-[color:var(--card)] px-3 py-2 text-xs">
                    <span className={`shrink-0 font-mono font-bold uppercase ${statusColor}`}>{status}</span>
                    <span className="shrink-0 font-mono text-muted">
                      {new Date(h.activado_en).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-text">
                      {autor?.nombre ?? "—"} {h.motivo ? `· ${h.motivo}` : ""}
                    </span>
                    {h.expira_en && (
                      <span className="shrink-0 text-[10px] text-muted-2">
                        hasta {new Date(h.expira_en).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
