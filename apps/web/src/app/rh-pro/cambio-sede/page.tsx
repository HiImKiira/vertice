import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { CambioSedeForm } from "./CambioSedeForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cambio de sede · RH Pro" };

interface EmpRaw {
  id: string;
  numero_empleado: string;
  nombre: string;
  sede_id: string;
  jornada: string;
  sedes: { abrev: string; nombre: string } | { abrev: string; nombre: string }[] | null;
}

export default async function CambioSedePage() {
  const { profile } = await requireUser();
  // Solo SUPERADMIN o SOPORTE
  if (profile.rol !== "SUPERADMIN" && profile.rol !== "SOPORTE") {
    redirect("/rh-pro");
  }
  const supabase = await createSupabaseServerClient();

  const [{ data: empsRaw }, { data: sedesRaw }, { data: movsRaw }] = await Promise.all([
    supabase
      .from("empleados")
      .select("id, numero_empleado, nombre, sede_id, jornada, sedes(abrev, nombre)")
      .is("fecha_baja", null)
      .order("nombre")
      .limit(2000),
    supabase
      .from("sedes")
      .select("id, abrev, nombre")
      .or("activa.is.null,activa.eq.true")
      .order("nombre"),
    supabase
      .from("empleado_movimientos")
      .select(`
        id, tipo, sede_anterior, sede_nueva, jornada_anterior, jornada_nueva,
        motivo, efectuado_en,
        empleados(nombre, numero_empleado),
        autor:efectuado_por(nombre, username),
        sede_ant:sede_anterior(abrev),
        sede_nva:sede_nueva(abrev)
      `)
      .order("efectuado_en", { ascending: false })
      .limit(20),
  ]);

  const empleados = ((empsRaw ?? []) as unknown as EmpRaw[]).map((e) => {
    const sede = Array.isArray(e.sedes) ? e.sedes[0] : e.sedes;
    return {
      id: e.id,
      numero_empleado: e.numero_empleado,
      nombre: e.nombre,
      sede_id: e.sede_id,
      sede_abrev: sede?.abrev ?? "—",
      sede_nombre: sede?.nombre ?? "—",
      jornada: e.jornada,
    };
  });

  const sedes = (sedesRaw ?? []) as Array<{ id: string; abrev: string; nombre: string }>;

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 animate-fade-up">
          <Link href="/rh-pro" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> RH Pro
          </Link>
          <p className="role-badge role-SUPERADMIN mt-2 mb-2">CAMBIO DE SEDE · SUPERADMIN / SOPORTE</p>
          <h1 className="font-display text-3xl sm:text-4xl">Reasignación de empleados</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Mueve uno o varios empleados a otra sede (y opcionalmente jornada).
            La asignación al nuevo supervisor sucede automáticamente — quien tenga
            esa sede × jornada en sus asignaciones, los verá en su pase de lista.
          </p>
        </header>

        <CambioSedeForm empleados={empleados} sedes={sedes} />

        {/* Histórico de movimientos */}
        <section className="mt-10">
          <div className="section-label mb-3 flex items-center gap-2">
            <Icon name="clock" size={12} className="text-muted" />
            Histórico reciente de movimientos
          </div>
          {!movsRaw || movsRaw.length === 0 ? (
            <p className="rounded-md border border-dashed border-white/10 bg-[color:var(--card)] p-3 text-center text-xs text-muted">
              Sin movimientos registrados.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {(movsRaw as Array<{
                id: number;
                tipo: string;
                jornada_anterior: string | null;
                jornada_nueva: string | null;
                motivo: string | null;
                efectuado_en: string;
                empleados: { nombre: string; numero_empleado: string } | { nombre: string; numero_empleado: string }[] | null;
                autor: { nombre: string; username: string } | { nombre: string; username: string }[] | null;
                sede_ant: { abrev: string } | { abrev: string }[] | null;
                sede_nva: { abrev: string } | { abrev: string }[] | null;
              }>).map((m) => {
                const emp = Array.isArray(m.empleados) ? m.empleados[0] : m.empleados;
                const aut = Array.isArray(m.autor) ? m.autor[0] : m.autor;
                const sA = Array.isArray(m.sede_ant) ? m.sede_ant[0] : m.sede_ant;
                const sN = Array.isArray(m.sede_nva) ? m.sede_nva[0] : m.sede_nva;
                return (
                  <li key={m.id} className="rounded-md border border-white/5 bg-[color:var(--card)] p-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-2">{new Date(m.efectuado_en).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</span>
                      <span className="font-semibold">{emp?.nombre ?? "—"}</span>
                      <span className="font-mono text-muted-2">#{emp?.numero_empleado ?? "—"}</span>
                      <span className="mx-1 text-muted-2">·</span>
                      <span className="font-mono">{sA?.abrev ?? "?"}</span>
                      <Icon name="arrow-right" size={10} className="text-blue-400" />
                      <span className="font-mono font-bold text-text">{sN?.abrev ?? "?"}</span>
                      {m.jornada_anterior !== m.jornada_nueva && (
                        <>
                          <span className="ml-1 font-mono text-amber-300">{m.jornada_anterior?.slice(0,3)}</span>
                          <Icon name="arrow-right" size={10} className="text-blue-400" />
                          <span className="font-mono font-bold text-amber-200">{m.jornada_nueva?.slice(0,3)}</span>
                        </>
                      )}
                      <span className="ml-auto text-[10px] text-muted-2">por @{aut?.username ?? "—"}</span>
                    </div>
                    {m.motivo && <p className="mt-0.5 text-[10px] text-muted">{m.motivo}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
