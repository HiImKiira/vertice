import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CotizacionDoc, type CotizacionPDFData } from "@/lib/pdf/CotizacionDoc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  // RLS se encarga de filtrar — si no tiene acceso, no devuelve nada
  const { data: cot, error: cotErr } = await supabase
    .from("cotizaciones")
    .select(`
      id, folio, fecha, vigencia_dias, estado,
      subtotal, iva_total, total, notas, condiciones,
      creado_por,
      clientes_cotizacion ( razon_social, rfc, contacto_nombre, contacto_email, contacto_telefono, direccion )
    `)
    .eq("id", id)
    .single();

  if (cotErr || !cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  const { data: lineas } = await supabase
    .from("cotizacion_lineas")
    .select("descripcion_snapshot, unidad_snapshot, cantidad, precio_unitario, iva_pct, subtotal, iva, total, orden")
    .eq("cotizacion_id", id)
    .order("orden");

  let creadoPorNombre: string | null = null;
  if (cot.creado_por) {
    const { data: u } = await supabase
      .from("usuarios").select("nombre").eq("id", cot.creado_por).maybeSingle<{ nombre: string }>();
    creadoPorNombre = u?.nombre ?? null;
  }

  const cliente = Array.isArray(cot.clientes_cotizacion)
    ? cot.clientes_cotizacion[0]
    : cot.clientes_cotizacion;

  if (!cliente) return NextResponse.json({ error: "Cliente de la cotización no encontrado" }, { status: 404 });

  const data: CotizacionPDFData = {
    folio: cot.folio as string,
    fecha: cot.fecha as string,
    vigencia_dias: (cot.vigencia_dias as number) ?? 30,
    estado: cot.estado as string,
    cliente: {
      razon_social: cliente.razon_social as string,
      rfc: (cliente.rfc as string | null) ?? null,
      contacto_nombre: (cliente.contacto_nombre as string | null) ?? null,
      contacto_email: (cliente.contacto_email as string | null) ?? null,
      contacto_telefono: (cliente.contacto_telefono as string | null) ?? null,
      direccion: (cliente.direccion as string | null) ?? null,
    },
    lineas: (lineas ?? []).map((l) => ({
      descripcion_snapshot: l.descripcion_snapshot as string,
      unidad_snapshot: (l.unidad_snapshot as string | null) ?? null,
      cantidad: Number(l.cantidad ?? 0),
      precio_unitario: Number(l.precio_unitario ?? 0),
      iva_pct: Number(l.iva_pct ?? 16),
      subtotal: Number(l.subtotal ?? 0),
      iva: Number(l.iva ?? 0),
      total: Number(l.total ?? 0),
    })),
    subtotal: Number(cot.subtotal ?? 0),
    iva_total: Number(cot.iva_total ?? 0),
    total: Number(cot.total ?? 0),
    notas: (cot.notas as string | null) ?? null,
    condiciones: (cot.condiciones as string | null) ?? null,
    creado_por_nombre: creadoPorNombre,
  };

  const buffer = await renderToBuffer(CotizacionDoc({ data }));
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${cot.folio}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
