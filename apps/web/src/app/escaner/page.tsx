import Link from "next/link";
import { requireUser } from "@/lib/session";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { EscanerClient } from "./EscanerClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Escáner QR · Vortex" };

export default async function EscanerPage() {
  const { profile } = await requireUser();

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[640px] px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-4 animate-fade-up">
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> Dashboard
          </Link>
          <h1 className="mt-2 font-display text-2xl sm:text-3xl">
            Escáner <span className="text-gradient-blue serif-italic">QR</span>
          </h1>
          <p className="mt-1 text-xs text-muted">
            Eventos Extraordinarios · Escanea la credencial del trabajador y su asistencia de hoy queda marcada (A) al instante.
          </p>
        </header>

        <EscanerClient esTester={["SUPERADMIN", "SOPORTE"].includes(profile.rol)} />
      </div>
    </main>
  );
}
