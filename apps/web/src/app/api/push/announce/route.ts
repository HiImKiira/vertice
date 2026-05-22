import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendPush } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface AnnounceBody {
  titulo: string;
  cuerpo: string;
  urlDestino?: string;
  destinatarios?: string[]; // usuario_ids; vacío = broadcast
}

export async function POST(req: Request) {
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

  const body = (await req.json()) as AnnounceBody;
  if (!body?.titulo?.trim() || !body?.cuerpo?.trim()) {
    return NextResponse.json({ ok: false, error: "Título y cuerpo requeridos" }, { status: 400 });
  }

  const destinatarios = body.destinatarios && body.destinatarios.length > 0 ? body.destinatarios : null;

  const result = await sendPush(
    {
      title: body.titulo.trim(),
      body: body.cuerpo.trim(),
      url: body.urlDestino?.trim() || "/dashboard",
      tag: "announcement",
      icon: "/icons/icon-192.png",
    },
    destinatarios,
    "announcement",
  );

  // Log del anuncio
  const admin = supabaseAdmin();
  await admin.from("announcements").insert({
    creado_por: user.id,
    titulo: body.titulo.trim(),
    cuerpo: body.cuerpo.trim(),
    url_destino: body.urlDestino?.trim() || null,
    destinatarios,
    enviados: result.enviados,
    fallidos: result.fallidos,
  });

  return NextResponse.json({ ok: true, ...result });
}
