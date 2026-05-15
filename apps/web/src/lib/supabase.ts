import { createBrowserClient, createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Re-exporta el tipo SupabaseClient para conveniencia.
export type { SupabaseClient };

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Falta variable de entorno: ${name}. Copia .env.example y rellena.`);
  }
  return v;
}

/**
 * Cliente para usar dentro de componentes "use client".
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}

/**
 * Cliente para Server Components / Route Handlers. Recibe el contenedor de
 * cookies de Next (importa desde `next/headers` en el caller).
 */
export function createSupabaseServerClient(cookieStore: {
  get(name: string): { value: string } | undefined;
  set(opts: { name: string; value: string } & CookieOptions): void;
}) {
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options) => cookieStore.set({ name, value, ...options }),
        remove: (name, options) => cookieStore.set({ name, value: "", ...options }),
      },
    },
  );
}
