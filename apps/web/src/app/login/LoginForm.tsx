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
        <label htmlFor="identifier" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-tagline text-onyx/60">
          Usuario o email
        </label>
        <input
          id="identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          required
          autoFocus
          className="w-full rounded-lg border border-onyx/15 bg-cream-50 px-4 py-3 font-mono text-sm text-onyx placeholder:text-onyx/30 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-100"
          placeholder="super, admin, ferchopino2401@..."
          disabled={isPending}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-tagline text-onyx/60">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-onyx/15 bg-cream-50 px-4 py-3 font-mono text-sm text-onyx focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-100"
          disabled={isPending}
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 w-full rounded-lg bg-onyx px-4 py-3 text-sm font-semibold uppercase tracking-tagline text-cream transition hover:bg-onyx-900 disabled:opacity-50"
      >
        {isPending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
