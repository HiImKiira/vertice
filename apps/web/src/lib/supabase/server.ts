import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta variable de entorno: ${name}`);
  return v;
}

/**
 * Cliente Supabase para Server Components y Route Handlers. Lee/escribe
 * cookies de Next para mantener la sesión en SSR.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => cookieStore.getAll().map(({ name, value }) => ({ name, value })),
        setAll: (cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set({ name, value, ...(options ?? {}) });
            }
          } catch {
            // Server Components no pueden setear cookies; el middleware lo hace.
          }
        },
      },
    },
  );
}
