import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Entrar",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex justify-center">
          <Logo className="h-14 w-auto" withWordmark />
        </div>

        <div className="rounded-2xl border border-onyx/10 bg-cream-50 p-7 shadow-sm">
          <h1 className="mb-1 font-serif text-2xl text-onyx">Iniciar sesión</h1>
          <p className="mb-6 text-sm text-onyx/55">
            Sistema interno · acceso autorizado únicamente.
          </p>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-[10px] uppercase tracking-tagline text-onyx/40">
          MHS Integradora · Vértice
        </p>
      </div>
    </main>
  );
}
