"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function CambioDescansoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log para diagnóstico en consola del navegador
    console.error("[cambio-descanso] error boundary:", error);
  }, [error]);

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <div className="relative z-10 mx-auto max-w-[800px] px-4 py-10 sm:px-6">
        <Link href="/rh-pro" className="text-xs text-muted hover:text-text">← RH Pro</Link>
        <div className="mt-6 rounded-xl border border-red-400/40 bg-red-500/[0.08] p-5 text-sm text-red-200">
          <h1 className="mb-2 font-display text-xl">No se pudo cargar Cambio de descanso</h1>
          <p className="text-[12px] text-red-300/80">
            Ocurrió un error al cargar el módulo. Detalle técnico:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-[color:var(--bg)] p-3 font-mono text-[11px] text-red-200">
            {error?.message || "Error desconocido"}
            {error?.digest ? `\n(digest: ${error.digest})` : ""}
          </pre>
          <p className="mt-3 text-[11px] text-muted">
            Probable causa: la migración <strong>v27</strong> aún no se aplicó en Supabase
            (tabla <code className="font-mono">empleado_movimientos</code> sin columnas de descanso,
            o RPC <code className="font-mono">bitacora_cambios_descanso</code> ausente).
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-md border border-blue-400/40 bg-blue-500/15 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-500/30"
            >
              Reintentar
            </button>
            <Link
              href="/rh-pro/descansos-semanales"
              className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-muted hover:text-text"
            >
              Ir a Descansos semanales (masivo)
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
