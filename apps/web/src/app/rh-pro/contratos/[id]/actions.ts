"use server";

import { revalidatePath } from "next/cache";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ContratoDoc } from "@/lib/pdf/ContratoDoc";

export type UpdateResult =
  | { ok: true; pdfUrl: string | null; pdfError?: string | undefined }
  | { ok: false; error: string };

export interface ContratoUpdateInput {
  id: string;                    // contratos.id
  // Identidad
  sexo: "HOMBRE" | "MUJER";
  nombre_trabajador: string;
  rfc?: string | null;
  domicilio_completo: string;
  cp?: string | null;
  // Asignación
  puesto: string;
  // Sueldo
  sueldo_mensual: number;
  sueldo_mensual_letra: string;
  // Período
  fecha_inicio_texto: string;
  fecha_fin_texto: string;
  fecha_firma_texto: string;
  // Jornada
  hora_inicio: string;
  hora_fin: string;
  jornada_descripcion: string;
  jornada_horas: number;
  dia_descanso_texto: string;
  observaciones?: string | null;
  // Regenerar PDF al guardar?
  regenerar_pdf: boolean;
}

export async function actualizarContratoAction(input: ContratoUpdateInput): Promise<UpdateResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión." };

  const { data: perfil } = await supabase.from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "COORDINACION"].includes(perfil.rol)) {
    return { ok: false, error: "Solo ADMIN o SUPERADMIN." };
  }

  // Update contratos
  const { error: upErr } = await supabase
    .from("contratos")
    .update({
      sexo: input.sexo,
      nombre_trabajador: input.nombre_trabajador.toUpperCase().trim(),
      rfc: input.rfc?.trim() || null,
      domicilio_completo: input.domicilio_completo.trim(),
      cp: input.cp?.trim() || null,
      puesto: input.puesto,
      sueldo_mensual: input.sueldo_mensual,
      sueldo_mensual_letra: input.sueldo_mensual_letra,
      fecha_inicio_texto: input.fecha_inicio_texto.trim(),
      fecha_fin_texto: input.fecha_fin_texto.trim(),
      fecha_firma_texto: input.fecha_firma_texto.trim(),
      hora_inicio: input.hora_inicio,
      hora_fin: input.hora_fin,
      jornada_descripcion: input.jornada_descripcion,
      jornada_horas: input.jornada_horas,
      dia_descanso_texto: input.dia_descanso_texto,
      observaciones: input.observaciones?.trim() || null,
      plantilla_usada: input.sexo,
    })
    .eq("id", input.id);
  if (upErr) return { ok: false, error: `Update: ${upErr.message}` };

  // Sincronizar el nombre del empleado vinculado (si existe)
  const { data: cur } = await supabase
    .from("contratos")
    .select("empleado_id")
    .eq("id", input.id)
    .single<{ empleado_id: string | null }>();
  if (cur?.empleado_id) {
    await supabase
      .from("empleados")
      .update({ nombre: input.nombre_trabajador.toUpperCase().trim() })
      .eq("id", cur.empleado_id);
  }

  // Regenerar PDF si se solicitó
  let pdfUrl: string | null = null;
  let pdfError: string | undefined;
  if (input.regenerar_pdf) {
    try {
      const { data: c } = await supabase
        .from("contratos")
        .select(`
          contrato_id, sexo, nombre_trabajador, rfc, domicilio_completo, cp,
          puesto, sueldo_mensual, sueldo_mensual_letra,
          fecha_inicio_texto, fecha_fin_texto, fecha_firma_texto,
          hora_inicio, hora_fin, jornada_descripcion, jornada_horas, dia_descanso_texto,
          proyecto_texto, acta_referencia, representante_legal,
          sedes ( nombre )
        `)
        .eq("id", input.id)
        .single();
      if (!c) throw new Error("Contrato no encontrado");
      const sedeNombre = Array.isArray(c.sedes) ? c.sedes[0]?.nombre : (c.sedes as { nombre: string } | null)?.nombre;
      const buffer = await renderToBuffer(
        ContratoDoc({
          contratoId: c.contrato_id,
          sexo: c.sexo as "HOMBRE" | "MUJER",
          values: {
            CONTRATO_ID: c.contrato_id,
            NOMBRE_TRABAJADOR: c.nombre_trabajador,
            RFC: c.rfc ?? "",
            DOMICILIO_COMPLETO: c.domicilio_completo,
            CP: c.cp ?? "",
            SEDE: sedeNombre ?? "",
            PUESTO: c.puesto,
            SUELDO_MENSUAL: Number(c.sueldo_mensual).toLocaleString("es-MX", { minimumFractionDigits: 2 }),
            SUELDO_MENSUAL_LETRA: c.sueldo_mensual_letra,
            FECHA_INICIO: c.fecha_inicio_texto,
            FECHA_FIN: c.fecha_fin_texto,
            FECHA_FIRMA_TEXTO: c.fecha_firma_texto,
            HORA_INICIO: c.hora_inicio,
            HORA_FIN: c.hora_fin,
            JORNADA: c.jornada_descripcion,
            JORNADA_HORAS: String(c.jornada_horas),
            DIA_DESCANSO: c.dia_descanso_texto,
            PROYECTO_TEXTO: c.proyecto_texto ?? "",
            ACTA_REFERENCIA: c.acta_referencia ?? "",
            REPRESENTANTE_LEGAL: c.representante_legal ?? "",
          },
        }),
      );
      const path = `${new Date().getFullYear()}/${c.contrato_id.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`;
      const admin = supabaseAdmin();
      const { error: uErr } = await admin.storage
        .from("contratos-pdf")
        .upload(path, new Uint8Array(buffer), { contentType: "application/pdf", upsert: true });
      if (uErr) throw uErr;
      await admin.from("contratos").update({ pdf_storage_path: path, status_pdf: "GENERADO" }).eq("id", input.id);
      const { data: signed } = await admin.storage.from("contratos-pdf").createSignedUrl(path, 60 * 60);
      pdfUrl = signed?.signedUrl ?? null;
    } catch (e) {
      pdfError = e instanceof Error ? e.message : String(e);
    }
  }

  revalidatePath(`/rh-pro/contratos/${input.id}`);
  revalidatePath("/rh-pro/contratos");
  return { ok: true, pdfUrl, pdfError };
}
