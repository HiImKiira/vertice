import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Entrar",
};
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center gap-3">
          <Logo className="h-16 w-auto" withWordmark={false} />
          <h1 className="font-serif text-3xl">
            Vér<span className="text-gradient-blue serif-italic">tice</span>
          </h1>
          <p className="text-[10px] uppercase tracking-ultra text-ink-muted">Sistema de Recursos Humanos</p>
        </div>

        <div className="surface-glow rounded-2xl p-7">
          <h2 className="mb-1 font-serif text-xl">Iniciar sesión</h2>
          <p className="mb-6 text-xs text-ink-muted">Sistema interno · acceso autorizado únicamente.</p>
          <Suspense fallback={<div className="text-sm text-ink-dim">Cargando...</div>}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-[10px] uppercase tracking-ultra text-ink-dim">
          MHS Integradora · Vértice
        </p>
      </div>
    </main>
  );
}
