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
  const fechaStr = url.searchParams.get("fecha"); // YYYY-MM-DD para tomar year/month
  if (!usuarioId) return NextResponse.json({ ok: false, error: "Falta usuario_id" }, { status: 400 });

  // Determinar year/month
  let year: number, month: number;
  if (fechaStr && /^\d{4}-\d{2}-\d{2}/.test(fechaStr)) {
    const [y, m] = fechaStr.split("-");
    year = parseInt(y!, 10);
    month = parseInt(m!, 10);
  } else {
    const d = new Date();
    d.setHours(d.getHours() - 6);
    year = d.getFullYear();
    month = d.getMonth() + 1;
  }

  const { data, error } = await supabase.rpc("cobertura_mensual_supervisor", {
    p_usuario_id: usuarioId,
    p_year: year,
    p_month: month,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const arr = data as Array<Record<string, unknown>> | null;
  return NextResponse.json({ ok: true, mensual: arr?.[0] ?? null });
}
