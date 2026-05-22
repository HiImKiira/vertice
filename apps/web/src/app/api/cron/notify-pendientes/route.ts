import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendPush } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cron endpoint. Llamado por pg_cron cada 3h.
 * Quiet-hours: solo dispara entre 9am y 5pm hora Mérida (UTC-6).
 * Manda push a supervisores que no hayan capturado HOY.
 */
async function handle(req: Request) {
  // Verificar secreto
  const secret = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false, error: "Cron secret inválido" }, { status: 401 });
  }

  // Quiet-hours: hora Mérida = UTC - 6
  const now = new Date();
  const meridaHour = (now.getUTCHours() - 6 + 24) % 24;
  if (meridaHour < 9 || meridaHour >= 17) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Fuera de ventana (hora Mérida: ${meridaHour})`,
    });
  }

  const admin = supabaseAdmin();
  const { data: pendientes, error } = await admin.rpc("supervisores_pendientes_hoy");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const ids = ((pendientes ?? []) as Array<{ usuario_id: string; nombre: string }>).map((p) => p.usuario_id);

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, pendientes: 0, enviados: 0 });
  }

  const result = await sendPush(
    {
      title: "Vortex · Recordatorio de captura",
      body: `Aún no has capturado tu pase de lista de hoy. Tap para abrir.`,
      url: "/pase-lista",
      tag: "recordatorio-captura",
      icon: "/icons/icon-192.png",
    },
    ids,
    "recordatorio_captura",
  );

  return NextResponse.json({
    ok: true,
    pendientes: ids.length,
    enviados: result.enviados,
    fallidos: result.fallidos,
    horaMerida: meridaHour,
  });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
