import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Heartbeat: actualiza usuarios.ultimo_acceso = now() para el usuario
 * autenticado. Throttle implícito por el cliente (ping cada 5 min).
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = supabaseAdmin();
  await admin
    .from("usuarios")
    .update({ ultimo_acceso: new Date().toISOString() })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}
