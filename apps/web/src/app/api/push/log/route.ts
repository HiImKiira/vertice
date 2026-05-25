import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol)) {
    return NextResponse.json({ ok: false, error: "Solo soporte/admin" }, { status: 403 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("notify_log")
    .select("id, usuario_id, tipo, titulo, cuerpo, resultado, detalle, creado_en, usuarios:usuario_id(nombre, username)")
    .order("creado_en", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, log: data ?? [] });
}
