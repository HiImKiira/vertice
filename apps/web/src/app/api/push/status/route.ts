import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });

  // Mis suscripciones
  const { count: mias, error: e1 } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", user.id)
    .eq("activo", true);
  if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 500 });

  // Total global (solo si soy admin/soporte)
  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .single<{ rol: string }>();
  const esSoporte = perfil && ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol);

  let total: number | null = null;
  let usuariosUnicos: number | null = null;
  if (esSoporte) {
    const admin = supabaseAdmin();
    const { count } = await admin
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("activo", true);
    total = count ?? 0;

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("usuario_id")
      .eq("activo", true);
    const set = new Set((subs ?? []).map((s) => (s as { usuario_id: string }).usuario_id));
    usuariosUnicos = set.size;
  }

  return NextResponse.json({
    ok: true,
    misSuscripciones: mias ?? 0,
    total,
    usuariosUnicos,
    esSoporte,
  });
}
