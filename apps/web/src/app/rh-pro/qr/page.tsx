import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { QRAdminClient, type SedeOpt } from "./QRAdminClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Credenciales QR · RH Pro" };

export default async function QRPage() {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const admin = supabaseAdmin();

  // geo_* puede no existir si v36 no se ha corrido — fallback sin geocerca.
  let sedesRaw: Array<Record<string, unknown>> | null = null;
  {
    const r = await admin
      .from("sedes")
      .select("id, abrev, nombre, qr_habilitado, geo_lat, geo_lng, geo_radio_m")
      .or("activa.is.null,activa.eq.true")
      .order("abrev");
    if (r.error) {
      const r2 = await admin.from("sedes").select("id, abrev, nombre, qr_habilitado").or("activa.is.null,activa.eq.true").order("abrev");
      sedesRaw = r2.data as Array<Record<string, unknown>> | null;
    } else {
      sedesRaw = r.data as Array<Record<string, unknown>> | null;
    }
  }
  const { data: empsRaw } = await admin.from("empleados").select("sede_id").is("fecha_baja", null);

  const conteo = new Map<string, number>();
  for (const e of (empsRaw ?? []) as Array<{ sede_id: string }>) {
    conteo.set(e.sede_id, (conteo.get(e.sede_id) ?? 0) + 1);
  }
  const sedes: SedeOpt[] = (sedesRaw ?? []).map((s) => ({
    id: s.id as string,
    abrev: s.abrev as string,
    nombre: s.nombre as string,
    qr_habilitado: s.qr_habilitado === true,
    activos: conteo.get(s.id as string) ?? 0,
    geo_lat: typeof s.geo_lat === "number" ? s.geo_lat : null,
    geo_lng: typeof s.geo_lng === "number" ? s.geo_lng : null,
    geo_radio_m: typeof s.geo_radio_m === "number" ? s.geo_radio_m : null,
  }));

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-10 print:max-w-none print:p-0">
        <header className="mb-6 animate-fade-up print:hidden">
          <Link href="/rh-pro" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> RH Pro
          </Link>
          <p className="role-badge role-ADMIN mt-2 mb-2">ASISTENCIA POR QR · ADMIN+</p>
          <h1 className="font-display text-3xl sm:text-4xl">
            Credenciales <span className="text-gradient-blue serif-italic">QR</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Designa la sede, genera las credenciales de sus trabajadores (separadas por turno) e imprímelas.
            El supervisor las escanea desde <strong>Escáner QR</strong> y la asistencia se marca sola.
            Si una credencial se pierde, regenera su token y la anterior queda invalidada.
          </p>
        </header>

        <QRAdminClient sedes={sedes} rol={profile.rol} />
      </div>
    </main>
  );
}
