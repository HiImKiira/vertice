import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { EditContratoForm, type ContratoFullRow } from "./EditContratoForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar contrato · RH Pro" };

interface PageProps { params: Promise<{ id: string }> }

export default async function EditContratoPage({ params }: PageProps) {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: contrato } = await supabase
    .from("contratos")
    .select(`
      id, contrato_id, empleado_id, sexo, nombre_trabajador, rfc,
      domicilio_completo, cp, sede_id, puesto, sueldo_mensual,
      sueldo_mensual_letra, fecha_inicio_texto, fecha_fin_texto,
      fecha_firma_texto, hora_inicio, hora_fin, jornada_descripcion,
      jornada_horas, dia_descanso_texto, observaciones, status_pdf,
      pdf_storage_path, fecha_captura, plantilla_usada,
      sedes(abrev, nombre)
    `)
    .eq("id", id)
    .maybeSingle();
  if (!contrato) notFound();
  const c = contrato as unknown as ContratoFullRow;
  const sede = Array.isArray(c.sedes) ? c.sedes[0] : c.sedes;

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
          <div>
            <Link href="/rh-pro/contratos" className="text-xs text-muted hover:text-text">← Lista de contratos</Link>
            <p className="role-badge role-ADMIN mt-2 mb-2">Editar contrato</p>
            <h1 className="font-display text-3xl sm:text-4xl">
              <span className="font-mono text-gradient-blue">{c.contrato_id}</span>
            </h1>
            <p className="mt-1 text-sm text-muted">
              {c.nombre_trabajador} · {sede?.abrev ?? "—"} · {sede?.nombre ?? "—"} · alta {new Date(c.fecha_captura).toLocaleDateString("es-MX", { dateStyle: "medium" })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.status_pdf === "GENERADO" && c.pdf_storage_path && (
              <a
                href={`/api/contratos/${c.id}/pdf`}
                target="_blank"
                rel="noopener"
                className="btn btn-success"
              >
                📄 Descargar PDF actual
              </a>
            )}
          </div>
        </header>

        <EditContratoForm contrato={c} />
      </div>
    </main>
  );
}
