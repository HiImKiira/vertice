import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Devuelve los usuarios activos con conteo de dispositivos suscritos.
 * Sirve para el picker de destinatarios en AnnouncementPanel.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol)) {
    return NextResponse.json({ ok: false, error: "Solo soporte/admin" }, { status: 403 });
  }

  const admin = supabaseAdmin();
  const [{ data: users }, { data: subs }] = await Promise.all([
    admin.from("usuarios").select("id, nombre, username, rol").eq("activo", true).order("nombre"),
    admin.from("push_subscriptions").select("usuario_id").eq("activo", true),
  ]);

  const subsCount = new Map<string, number>();
  for (const s of (subs ?? []) as Array<{ usuario_id: string }>) {
    subsCount.set(s.usuario_id, (subsCount.get(s.usuario_id) ?? 0) + 1);
  }

  const lista = (users ?? []).map((u) => ({
    id: u.id as string,
    nombre: u.nombre as string,
    username: u.username as string,
    rol: u.rol as string,
    dispositivos: subsCount.get(u.id as string) ?? 0,
  }));

  return NextResponse.json({ ok: true, usuarios: lista });
}
