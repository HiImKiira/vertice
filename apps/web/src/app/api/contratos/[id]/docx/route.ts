import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx { params: Promise<{ id: string }> }

// Rutas a las plantillas DOCX reales (incluidas en el bundle via next.config tracing)
const TEMPLATE_DIR = path.join(process.cwd(), "src/lib/contratos/templates");
const TEMPLATES: Record<"HOMBRE" | "MUJER", string> = {
  HOMBRE: path.join(TEMPLATE_DIR, "contrato-hombre.docx"),
  MUJER: path.join(TEMPLATE_DIR, "contrato-mujer.docx"),
};

function normalizeSexo(s: string | null | undefined): "HOMBRE" | "MUJER" {
  const v = String(s ?? "").trim().toUpperCase();
  return v === "MUJER" || v === "M" || v === "F" || v === "FEMENINO" ? "MUJER" : "HOMBRE";
}

/**
 * GET /api/contratos/[id]/docx
 * Llena la plantilla DOCX real (HOMBRE/MUJER) con los datos del contrato
 * usando docxtemplater (reemplazo de {{LLAVE}}) y sirve el .docx generado,
 * idéntico al Word original de MHS.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol)) {
    return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
  }

  const { data: c, error } = await supabase
    .from("contratos")
    .select(`
      id, contrato_id, sexo, nombre_trabajador, rfc, domicilio_completo, cp,
      puesto, sueldo_mensual, sueldo_mensual_letra,
      fecha_inicio_texto, fecha_fin_texto, fecha_firma_texto,
      hora_inicio, hora_fin, jornada_descripcion, jornada_horas, dia_descanso_texto,
      proyecto_texto, acta_referencia, representante_legal,
      sedes ( nombre, abrev )
    `)
    .eq("id", id)
    .single();

  if (error || !c) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });

  const sede = Array.isArray(c.sedes) ? c.sedes[0] : (c.sedes as { nombre: string; abrev: string } | null);

  // Mapeo a las 19 llaves de la plantilla (mismo que el PDF)
  const data: Record<string, string> = {
    CONTRATO_ID: (c.contrato_id as string) ?? "",
    NOMBRE_TRABAJADOR: (c.nombre_trabajador as string) ?? "",
    RFC: (c.rfc as string) ?? "",
    DOMICILIO_COMPLETO: (c.domicilio_completo as string) ?? "",
    CP: (c.cp as string) ?? "",
    SEDE: sede?.nombre ?? "",
    PUESTO: (c.puesto as string) ?? "",
    SUELDO_MENSUAL: Number(c.sueldo_mensual ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 }),
    SUELDO_MENSUAL_LETRA: (c.sueldo_mensual_letra as string) ?? "",
    FECHA_INICIO: (c.fecha_inicio_texto as string) ?? "",
    FECHA_FIN: (c.fecha_fin_texto as string) ?? "",
    FECHA_FIRMA_TEXTO: (c.fecha_firma_texto as string) ?? "",
    HORA_INICIO: (c.hora_inicio as string) ?? "",
    HORA_FIN: (c.hora_fin as string) ?? "",
    JORNADA: (c.jornada_descripcion as string) ?? "",
    JORNADA_HORAS: String(c.jornada_horas ?? 8),
    DIA_DESCANSO: (c.dia_descanso_texto as string) ?? "",
    PROYECTO_TEXTO: (c.proyecto_texto as string) ?? "",
    ACTA_REFERENCIA: (c.acta_referencia as string) ?? "",
    REPRESENTANTE_LEGAL: (c.representante_legal as string) ?? "",
  };

  const sexo = normalizeSexo(c.sexo as string);

  let templateBuf: Buffer;
  try {
    templateBuf = await readFile(TEMPLATES[sexo]);
  } catch (e) {
    return NextResponse.json({ error: `No se encontró la plantilla ${sexo}: ${e instanceof Error ? e.message : ""}` }, { status: 500 });
  }

  let out: Buffer;
  try {
    const zip = new PizZip(templateBuf);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{{", end: "}}" }, // las plantillas usan {{LLAVE}}
    });
    doc.render(data);
    out = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
  } catch (e) {
    return NextResponse.json({ error: `Error generando DOCX: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }

  const folio = String(c.contrato_id ?? "contrato").replace(/[^a-zA-Z0-9-]/g, "_");
  const nombre = String(c.nombre_trabajador ?? "").replace(/[^a-zA-Z0-9 ]/g, "").trim();
  const filename = `CONTRATO - ${folio}${nombre ? " - " + nombre : ""}.docx`;

  return new NextResponse(new Uint8Array(out), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
