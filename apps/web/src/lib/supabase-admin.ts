import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con privilegios de service role. **Solo en código de servidor**
 * (Server Components, Route Handlers, Server Actions, scripts).
 * Bypassa RLS — úsalo para reportes, jobs, importaciones masivas.
 * JAMÁS lo importes desde un componente `"use client"`.
 */
let _admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");

  _admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _admin;
}
