"use client";

import { useTransition } from "react";
import { logoutAction } from "../login/actions";

export function SignOutButton() {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => logoutAction())}
      disabled={isPending}
      className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-tagline text-ink-muted transition hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
    >
      {isPending ? "Saliendo..." : "Salir"}
    </button>
  );
}
