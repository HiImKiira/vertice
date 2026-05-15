"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Cliente Supabase para componentes `"use client"`. Singleton — reusa la
 * misma instancia en toda la app del navegador.
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Faltan envs NEXT_PUBLIC_SUPABASE_* en el cliente.");
  _client = createBrowserClient(url, key);
  return _client;
}
