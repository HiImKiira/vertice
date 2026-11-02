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

  const [{ data: sedesRaw }, { data: empsRaw }] = await Promise.all([
    admin.from("sedes").select("id, abrev, nombre, qr_habilitado").or("activa.is.null,activa.eq.true").order("abrev"),
    admin.from("empleados").select("sede_id").is("fecha_baja", null),
  ]);

  const conteo = new Map<string, number>();
  for (const e of (empsRaw ?? []) as Array<{ sede_id: string }>) {
    conteo.set(e.sede_id, (conteo.get(e.sede_id) ?? 0) + 1);
  }
  const sedes: SedeOpt[] = ((sedesRaw ?? []) as Array<{ id: string; abrev: string; nombre: string; qr_habilitado: boolean | null }>)
    .map((s) => ({ id: s.id, abrev: s.abrev, nombre: s.nombre, qr_habilitado: s.qr_habilitado === true, activos: conteo.get(s.id) ?? 0 }));

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

        <QRAdminClient sedes={sedes} />
      </div>
    </main>
  );
}
