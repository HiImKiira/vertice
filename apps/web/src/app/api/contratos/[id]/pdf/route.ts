import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ContratoDoc } from "@/lib/pdf/ContratoDoc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/contratos/[id]/pdf  → regenera el PDF, sube a Storage,
 * actualiza status_pdf, y devuelve { url, path }
 *
 * GET  /api/contratos/[id]/pdf  → devuelve una URL firmada (1h) para
 * descargar el PDF existente. Si no existe aún, lo genera al vuelo.
 */

interface Ctx { params: Promise<{ id: string }> }

async function getContrato(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, id: string) {
  return await supabase
    .from("contratos")
    .select(`
      id, contrato_id, sexo, nombre_trabajador, rfc, domicilio_completo, cp,
      sede_id, puesto, sueldo_mensual, sueldo_mensual_letra,
      fecha_inicio_texto, fecha_fin_texto, fecha_firma_texto,
      hora_inicio, hora_fin, jornada_descripcion, jornada_horas, dia_descanso_texto,
      proyecto_texto, acta_referencia, representante_legal,
      pdf_storage_path, status_pdf, plantilla_usada,
      sedes ( nombre, abrev )
    `)
    .eq("id", id)
    .single();
}

function buildValues(c: Awaited<ReturnType<typeof getContrato>>["data"]): Record<string, string> {
  if (!c) return {};
  const sedeNombre = Array.isArray(c.sedes) ? c.sedes[0]?.nombre : (c.sedes as { nombre: string } | null)?.nombre;
  return {
    CONTRATO_ID: c.contrato_id ?? "",
    NOMBRE_TRABAJADOR: c.nombre_trabajador ?? "",
    RFC: c.rfc ?? "",
    DOMICILIO_COMPLETO: c.domicilio_completo ?? "",
    CP: c.cp ?? "",
    SEDE: sedeNombre ?? "",
    PUESTO: c.puesto ?? "",
    SUELDO_MENSUAL: (c.sueldo_mensual ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 }),
    SUELDO_MENSUAL_LETRA: c.sueldo_mensual_letra ?? "",
    FECHA_INICIO: c.fecha_inicio_texto ?? "",
    FECHA_FIN: c.fecha_fin_texto ?? "",
    FECHA_FIRMA_TEXTO: c.fecha_firma_texto ?? "",
    HORA_INICIO: c.hora_inicio ?? "",
    HORA_FIN: c.hora_fin ?? "",
    JORNADA: c.jornada_descripcion ?? "",
    JORNADA_HORAS: String(c.jornada_horas ?? 8),
    DIA_DESCANSO: c.dia_descanso_texto ?? "",
    PROYECTO_TEXTO: c.proyecto_texto ?? "",
    ACTA_REFERENCIA: c.acta_referencia ?? "",
    REPRESENTANTE_LEGAL: c.representante_legal ?? "",
  };
}

async function generarYSubir(contratoId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sin sesión", status: 401 as const };

  const { data: perfil } = await supabase.from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN"].includes(perfil.rol)) {
    return { error: "Solo ADMIN/SUPERADMIN", status: 403 as const };
  }

  const { data: c, error: cErr } = await getContrato(supabase, contratoId);
  if (cErr || !c) return { error: "Contrato no encontrado", status: 404 as const };

  const values = buildValues(c);
  const buffer = await renderToBuffer(
    ContratoDoc({
      contratoId: c.contrato_id,
      sexo: c.sexo as "HOMBRE" | "MUJER",
      values,
    }),
  );

  const path = `${new Date().getFullYear()}/${c.contrato_id.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`;

  // Service-role para evitar RLS de storage
  const admin = supabaseAdmin();
  const { error: upErr } = await admin.storage
    .from("contratos-pdf")
    .upload(path, new Uint8Array(buffer), {
      contentType: "application/pdf",
      upsert: true,
    });
  if (upErr) return { error: `Upload: ${upErr.message}`, status: 500 as const };

  // Update DB
  await admin
    .from("contratos")
    .update({ pdf_storage_path: path, status_pdf: "GENERADO" })
    .eq("id", contratoId);

  // Signed URL (1h)
  const { data: signed, error: sErr } = await admin.storage
    .from("contratos-pdf")
    .createSignedUrl(path, 60 * 60);
  if (sErr) return { error: `Signed URL: ${sErr.message}`, status: 500 as const };

  return { ok: true as const, url: signed.signedUrl, path };
}

async function getSignedUrl(contratoId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sin sesión", status: 401 as const };

  const { data: perfil } = await supabase.from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "CEO"].includes(perfil.rol)) {
    return { error: "Acceso restringido", status: 403 as const };
  }

  const { data: c } = await supabase
    .from("contratos")
    .select("pdf_storage_path, status_pdf")
    .eq("id", contratoId)
    .single<{ pdf_storage_path: string | null; status_pdf: string }>();

  if (!c?.pdf_storage_path) {
    // No existe → generarlo ahora
    return await generarYSubir(contratoId);
  }

  const admin = supabaseAdmin();
  const { data: signed, error } = await admin.storage
    .from("contratos-pdf")
    .createSignedUrl(c.pdf_storage_path, 60 * 60);
  if (error) return { error: `Signed URL: ${error.message}`, status: 500 as const };
  return { ok: true as const, url: signed.signedUrl, path: c.pdf_storage_path };
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await generarYSubir(id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status ?? 500 });
  return NextResponse.json({ ok: true, url: r.url, path: r.path });
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await getSignedUrl(id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status ?? 500 });
  // Redirect directo al PDF (más UX-friendly para abrir desde un link)
  return NextResponse.redirect(r.url);
}
