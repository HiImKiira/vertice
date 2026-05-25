import Link from "next/link";
import { requireUser } from "@/lib/session";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { SonidosEditor } from "./SonidosEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sonidos · Vortex" };

export default async function SonidosPage() {
  const { profile } = await requireUser();

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[800px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 animate-fade-up">
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> Dashboard
          </Link>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl">Sonidos de notificación</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Personaliza el sonido que escuchas cuando llega una notificación push en Vortex.
            Cada tipo de evento puede tener su propio tono — por ejemplo, un tono urgente para
            cuando RH te libera una fecha, y uno discreto para anuncios generales.
          </p>
        </header>

        <SonidosEditor />

        <footer className="mt-16 border-t border-[color:var(--border)] pt-6 text-xs text-muted-2">
          <Link href="/dashboard" className="hover:text-text">← Dashboard</Link>
        </footer>
      </div>
    </main>
  );
}
