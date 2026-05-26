import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { ImportarEmpleadosClient } from "./ImportarEmpleadosClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import masivo · Empleados" };

export default async function ImportarEmpleadosPage() {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
        <Link href="/rh-pro/empleados" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
          <Icon name="arrow-left" size={12} /> Empleados
        </Link>
        <header className="mb-6 mt-2 animate-fade-up">
          <h1 className="font-display text-3xl sm:text-4xl">Import masivo de empleados</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Sube un archivo .xlsx para crear o actualizar empleados en lote. Valida sede, jornada y datos
            antes de confirmar. Empleados con número ya existente se actualizan; los nuevos reciben número
            auto-asignado si lo dejas vacío.
          </p>
        </header>

        <ImportarEmpleadosClient />
      </div>
    </main>
  );
}
