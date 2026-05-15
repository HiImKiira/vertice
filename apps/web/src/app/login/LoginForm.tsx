"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginAction } from "./actions";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showPwd, setShowPwd] = useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      formData.set("next", next);
      const result = await loginAction(formData);
      if (result && !result.ok) {
        setError(result.error);
      } else if (result && result.ok) {
        router.push(result.redirect);
        router.refresh();
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="identifier" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-tagline text-ink-muted">
          Usuario
        </label>
        <input
          id="identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          required
          autoFocus
          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 font-mono text-sm text-ink placeholder:text-ink-dim focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          placeholder="super, admin, edy..."
          disabled={isPending}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-tagline text-ink-muted">
          Contraseña
        </label>
        <div className="flex gap-2">
          <input
            id="password"
            name="password"
            type={showPwd ? "text" : "password"}
            autoComplete="current-password"
            required
            className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 font-mono text-sm text-ink focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            disabled={isPending}
          />
          <button
            type="button"
            onClick={() => setShowPwd((p) => !p)}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-ink-muted transition hover:bg-white/[0.08]"
            aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPwd ? "🙈" : "👁"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</div>
      )}

      <button type="submit" disabled={isPending} className="btn-primary mt-2 w-full">
        {isPending ? "Entrando..." : "Entrar →"}
      </button>
    </form>
  );
}
