import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { TIPO_SPECS, estadoInfo, type IncapacidadTipo, type IncapacidadEstado } from "@/lib/incapacidades";
import { quincenaDe, meridaToday } from "@/lib/quincena";
import { CorreccionesClient, type IncapMini, type EmpMini } from "./CorreccionesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Correcciones · RH Pro" };

export default async function CorreccionesPage() {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const admin = supabaseAdmin();

  const [incRes, empRes] = await Promise.all([
    admin
      .from("incapacidades")
      .select("id, tipo, estado, creado_en, empleados(nombre, numero_empleado, sedes(abrev)), reporter:reportada_por(username), incapacidad_documentos(count)")
      .order("creado_en", { ascending: false })
      .limit(25),
    admin
      .from("empleados")
      .select("id, numero_empleado, nombre, sedes(abrev)")
      .is("fecha_baja", null)
      .order("nombre")
      .limit(2000),
  ]);

  const incapacidades: IncapMini[] = ((incRes.data ?? []) as Array<{
    id: string; tipo: IncapacidadTipo; estado: IncapacidadEstado; creado_en: string;
    empleados: { nombre: string; numero_empleado: string; sedes: { abrev: string } | { abrev: string }[] | null } | { nombre: string; numero_empleado: string; sedes: { abrev: string } | { abrev: string }[] | null }[] | null;
    reporter: { username: string } | { username: string }[] | null;
    incapacidad_documentos: { count: number }[] | null;
  }>).map((i) => {
    const e = Array.isArray(i.empleados) ? i.empleados[0] : i.empleados;
    const s = e && (Array.isArray(e.sedes) ? e.sedes[0] : e.sedes);
    const r = Array.isArray(i.reporter) ? i.reporter[0] : i.reporter;
    return {
      id: i.id,
      tipo_label: TIPO_SPECS[i.tipo]?.short ?? i.tipo,
      estado_label: estadoInfo(i.tipo, i.estado).label,
      creado_en: i.creado_en,
      empleado: e ? `${e.nombre} (#${e.numero_empleado})` : "—",
      sede: s?.abrev ?? "—",
      reporter: r?.username ?? "—",
      docs: i.incapacidad_documentos?.[0]?.count ?? 0,
    };
  });

  const empleados: EmpMini[] = ((empRes.data ?? []) as Array<{
    id: string; numero_empleado: string; nombre: string;
    sedes: { abrev: string } | { abrev: string }[] | null;
  }>).map((e) => {
    const s = Array.isArray(e.sedes) ? e.sedes[0] : e.sedes;
    return { id: e.id, numero_empleado: e.numero_empleado, nombre: e.nombre, sede_abrev: s?.abrev ?? "—" };
  });

  const quincena = quincenaDe(meridaToday());

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 animate-fade-up">
          <Link href="/rh-pro" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> RH Pro
          </Link>
          <p className="role-badge role-ADMIN mt-2 mb-2">CORRECCIONES · SOLO RH</p>
          <h1 className="font-display text-3xl sm:text-4xl">
            Correcciones de <span className="text-gradient-blue serif-italic">registros</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Elimina incapacidades mal registradas y corrige marcas de asistencia equivocadas.
            Toda corrección exige motivo y queda asentada en{" "}
            <Link href="/rh-pro/actividad" className="text-blue-300 underline">Actividad</Link>.
          </p>
        </header>

        <CorreccionesClient
          incapacidades={incapacidades}
          empleados={empleados}
          rangoDefault={{ inicio: quincena.start, fin: quincena.end }}
        />
      </div>
    </main>
  );
}
