import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });

    const result = await sendPush(
      {
        title: "Vortex · Push de prueba",
        body: "Si recibes esto, las notificaciones funcionan correctamente.",
        url: "/dashboard",
        tag: "vortex-test",
        icon: "/icons/icon-192.png",
      },
      [user.id],
      "test",
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[push/test]", e);
    const msg = e instanceof Error ? e.message : "Error interno";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
