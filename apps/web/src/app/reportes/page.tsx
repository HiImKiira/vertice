import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { ReportesClient } from "./ReportesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reportes PDF" };

export default async function ReportesPage() {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const supabase = await createSupabaseServerClient();

  const { data: sedes } = await supabase
    .from("sedes")
    .select("id, codigo, abrev, nombre")
    .order("nombre");

  return (
    <main className="min-h-screen text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 animate-fade-up">
          <Link href="/dashboard" className="text-xs text-muted hover:text-text">← Dashboard</Link>
          <p className={`role-badge role-${profile.rol} mt-2 mb-2`}>{profile.rol}</p>
          <h1 className="font-display text-3xl sm:text-4xl">
            Reportes <span className="text-gradient-blue serif-italic">PDF</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Nómina quincenal con cálculo de pago estimado y reporte de asistencias con matriz por día.
            Los PDFs se generan al momento, sin intermedios, descargables.
          </p>
        </header>

        <ReportesClient sedes={(sedes ?? []) as Array<{ id: string; codigo: string; abrev: string; nombre: string }>} />
      </div>
    </main>
  );
}
