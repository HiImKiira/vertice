import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyAdminLike, sendPush } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Atorada {
  id: string;
  tipo: string;
  estado: string;
  dias_atorada: number;
  empleado_nombre: string;
  empleado_numero: string;
  sede_abrev: string;
  reportada_por: string | null;
  motivo: string;
}

async function handle(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false, error: "Cron secret inválido" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("incapacidades_atoradas");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const atoradas = (data ?? []) as Atorada[];
  if (atoradas.length === 0) {
    return NextResponse.json({ ok: true, atoradas: 0 });
  }

  // 1) Una notificación resumen a admins-soporte
  const resumen = `${atoradas.length} caso(s) atorado(s): ${atoradas.slice(0, 3).map((a) => `${a.empleado_nombre} (${a.estado})`).join("; ")}${atoradas.length > 3 ? "..." : ""}`;
  void notifyAdminLike(
    {
      title: `Vortex · ${atoradas.length} incapacidad(es) requieren atención`,
      body: resumen,
      url: "/incapacidades?estado=all",
      tag: "incap-atoradas",
      icon: "/icons/icon-192.png",
      requireInteraction: true,
    },
    "incapacidad_atorada",
  ).catch((e) => console.error("[cron-incap] notify admins fail:", e));

  // 2) Push individual al reporter del caso (si existe)
  let pushSent = 0;
  for (const a of atoradas) {
    if (!a.reportada_por) continue;
    try {
      const r = await sendPush(
        {
          title: `Vortex · Caso pendiente: ${a.empleado_nombre}`,
          body: a.motivo,
          url: `/incapacidades/${a.id}`,
          tag: `incap-${a.id}`,
          icon: "/icons/icon-192.png",
        },
        [a.reportada_por],
        "incapacidad_atorada_reporter",
      );
      if (r.enviados > 0) pushSent++;
    } catch (e) {
      console.error("[cron-incap] reporter push fail:", e);
    }
  }

  return NextResponse.json({
    ok: true,
    atoradas: atoradas.length,
    pushes_reporter: pushSent,
    detalle: atoradas.map((a) => ({ id: a.id, estado: a.estado, dias: a.dias_atorada, motivo: a.motivo })),
  });
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
