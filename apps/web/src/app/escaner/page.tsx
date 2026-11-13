import Link from "next/link";
import { requireUser } from "@/lib/session";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { EscanerClient } from "./EscanerClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Escáner QR · Vortex" };

export default async function EscanerPage({ searchParams }: { searchParams: Promise<{ modo?: string }> }) {
  const { profile } = await requireUser();
  const { modo } = await searchParams;
  const modoInicial = modo === "salida" ? "salida" : "entrada";

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
            Eventos Extraordinarios · Escanea la credencial y registra <strong>entrada</strong> o <strong>salida</strong> con su hora.
          </p>
        </header>

        <EscanerClient esTester={["SUPERADMIN", "SOPORTE"].includes(profile.rol)} modoInicial={modoInicial} />
      </div>
    </main>
  );
}
