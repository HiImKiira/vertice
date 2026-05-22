import Link from "next/link";
import { requireUser } from "@/lib/session";
import { Topbar } from "@/components/Topbar";
import { NuevoTicketForm } from "./NuevoTicketForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nuevo ticket · Soporte" };

export default async function NuevoTicketPage() {
  const { profile } = await requireUser();
  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/soporte" className="text-xs text-muted hover:text-text">← Tickets</Link>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl">
          Nuevo <span className="text-gradient-blue serif-italic">ticket</span>
        </h1>
        <p className="mt-1 text-sm text-muted">
          Tu ticket llega al equipo de soporte (Edy y los admins) y verás la respuesta acá.
        </p>
        <div className="mt-6">
          <NuevoTicketForm />
        </div>
      </div>
    </main>
  );
}
