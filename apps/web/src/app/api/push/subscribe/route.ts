import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SubscribeBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });

  const body = (await req.json()) as SubscribeBody;
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return NextResponse.json({ ok: false, error: "Subscription incompleta" }, { status: 400 });
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({
      usuario_id: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      user_agent: body.userAgent ?? null,
      activo: true,
      ultimo_uso: new Date().toISOString(),
    }, { onConflict: "usuario_id,endpoint" });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });

  const { endpoint } = (await req.json()) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ ok: false, error: "Endpoint requerido" }, { status: 400 });

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("usuario_id", user.id)
    .eq("endpoint", endpoint);

  return NextResponse.json({ ok: true });
}
