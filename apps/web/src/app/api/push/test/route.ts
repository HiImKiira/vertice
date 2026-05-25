import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });

    const url = new URL(req.url);
    const broadcast = url.searchParams.get("broadcast") === "true";

    let usuarios: string[] | null = [user.id];
    if (broadcast) {
      // Admin/soporte puede mandar prueba a todos los suscritos
      const { data: perfil } = await supabase
        .from("usuarios")
        .select("rol")
        .eq("id", user.id)
        .single<{ rol: string }>();
      if (!perfil || !["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol)) {
        return NextResponse.json({ ok: false, error: "Broadcast solo para soporte/admin" }, { status: 403 });
      }
      usuarios = null; // null → todos
    }

    const result = await sendPush(
      {
        title: broadcast ? "Vortex · Test broadcast" : "Vortex · Push de prueba",
        body: broadcast
          ? "Test de notificaciones a todos los dispositivos suscritos."
          : "Si recibes esto, las notificaciones funcionan correctamente.",
        url: "/dashboard",
        tag: "vortex-test",
        icon: "/icons/icon-192.png",
      },
      usuarios,
      "test",
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[push/test]", e);
    const msg = e instanceof Error ? e.message : "Error interno";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
