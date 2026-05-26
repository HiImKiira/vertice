import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });

  const { data: perfil } = await supabase.from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol)) {
    return NextResponse.json({ ok: false, error: "Solo admin-like" }, { status: 403 });
  }

  const url = new URL(req.url);
  const usuarioId = url.searchParams.get("u");
  const fecha = url.searchParams.get("fecha");
  if (!usuarioId) return NextResponse.json({ ok: false, error: "Falta usuario_id" }, { status: 400 });

  const { data, error } = await supabase.rpc("cobertura_supervisor_detalle", {
    p_usuario_id: usuarioId,
    p_fecha: fecha || null,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, detalle: data ?? [] });
}
