import Link from "next/link";
import { requireUser } from "@/lib/session";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { CambiarPasswordForm } from "./CambiarPasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi cuenta · Vortex" };

export default async function CuentaPage() {
  const { profile } = await requireUser();

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[800px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 animate-fade-up">
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> Dashboard
          </Link>
          <p className={`role-badge role-${profile.rol} mt-2 mb-2`}>{profile.rol}</p>
          <h1 className="font-display text-3xl sm:text-4xl">
            Mi <span className="text-gradient-blue serif-italic">cuenta</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {profile.nombre} · <span className="font-mono">@{profile.username}</span> · {profile.email}
          </p>
        </header>

        <CambiarPasswordForm />
      </div>
    </main>
  );
}
