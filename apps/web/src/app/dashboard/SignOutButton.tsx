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
      className="rounded-md border border-onyx/15 bg-cream-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-tagline text-onyx/70 transition hover:bg-onyx hover:text-cream disabled:opacity-50"
    >
      {isPending ? "Saliendo..." : "Cerrar sesión"}
    </button>
  );
}
