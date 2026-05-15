"use server";

import { revalidatePath } from "next/cache";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ContratoDoc } from "@/lib/pdf/ContratoDoc";

export type CrearResult =
  | { ok: true; contratoId: string; empleadoId: string; folio: string; pdfUrl: string | null; pdfError?: string | undefined }
  | { ok: false; error: string };

export interface ContratoInput {
  // Identidad
  sexo: "HOMBRE" | "MUJER";
  nombre_trabajador: string;
  rfc?: string;
  domicilio_completo: string;
  cp?: string;

  // Asignación
  sede_id: string;
  jornada_legacy: "MATUTINO" | "VESPERTINO" | "NOCTURNO" | "TURNO_ROTATIVO" | "CUBRETURNOS" | "DIURNO";
  dia_descanso: string[]; // ["DOM"] o ["SAB","DOM"]
  puesto: string;
  segmento_original?: string;

  // Sueldo
  sueldo_mensual: number;
  sueldo_mensual_letra: string;
  salario_diario: number;

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

  observaciones?: string;
}

export async function crearContratoAction(input: ContratoInput): Promise<CrearResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión." };

  const { data: perfil } = await supabase.from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN"].includes(perfil.rol)) {
    return { ok: false, error: "Solo ADMIN o SUPERADMIN pueden dar de alta." };
  }

  if (!input.nombre_trabajador.trim() || !input.sede_id || !input.sueldo_mensual) {
    return { ok: false, error: "Faltan campos obligatorios (nombre, sede, sueldo)." };
  }

  // 1) Generar folio (atómico, vía RPC)
  const { data: folio, error: fErr } = await supabase.rpc("siguiente_folio_contrato", { p_sede: input.sede_id });
  if (fErr || !folio) return { ok: false, error: `Folio: ${fErr?.message ?? "no devuelto"}` };

  // 2) Constantes desde config_contratos
  const { data: cfg } = await supabase.from("config_contratos").select("clave, valor");
  const cfgMap = new Map<string, string>((cfg ?? []).map((c) => [c.clave, c.valor]));

  // 3) Crear empleado (necesario antes para vincular)
  //    Generar numero_empleado autoincrementable a partir del max actual
  const { data: maxEmp } = await supabase
    .from("empleados")
    .select("numero_empleado")
    .order("numero_empleado", { ascending: false })
    .limit(1)
    .maybeSingle<{ numero_empleado: string }>();
  const nextNum = String((parseInt(maxEmp?.numero_empleado || "0", 10) || 0) + 1);

  const { data: empleado, error: empErr } = await supabase
    .from("empleados")
    .insert({
      numero_empleado: nextNum,
      nombre: input.nombre_trabajador.toUpperCase().trim(),
      sede_id: input.sede_id,
      jornada: input.jornada_legacy,
      dia_descanso: input.dia_descanso,
      salario_diario: input.salario_diario,
      segmento_original: input.segmento_original?.trim() || null,
      status: "ACTIVO",
    })
    .select("id")
    .single<{ id: string }>();
  if (empErr || !empleado) return { ok: false, error: `Empleado: ${empErr?.message ?? "no creado"}` };

  // 4) Crear contrato
  const { data: contrato, error: cErr } = await supabase
    .from("contratos")
    .insert({
      contrato_id: folio as string,
      empleado_id: empleado.id,
      sexo: input.sexo,
      nombre_trabajador: input.nombre_trabajador.toUpperCase().trim(),
      rfc: input.rfc?.trim() || null,
      domicilio_completo: input.domicilio_completo.trim(),
      cp: input.cp?.trim() || null,
      sede_id: input.sede_id,
      segmento_original: input.segmento_original?.trim() || null,
      puesto: input.puesto.trim() || "PERSONAL DE LIMPIEZA",
      jornada_legacy: input.jornada_legacy,
      dia_descanso: input.dia_descanso,
      sueldo_mensual: input.sueldo_mensual,
      sueldo_mensual_letra: input.sueldo_mensual_letra.trim(),
      salario_diario: input.salario_diario,
      fecha_inicio_texto: input.fecha_inicio_texto.trim(),
      fecha_fin_texto: input.fecha_fin_texto.trim(),
      fecha_firma_texto: input.fecha_firma_texto.trim(),
      hora_inicio: input.hora_inicio,
      hora_fin: input.hora_fin,
      jornada_descripcion: input.jornada_descripcion,
      jornada_horas: input.jornada_horas,
      dia_descanso_texto: input.dia_descanso_texto,
      proyecto_texto: cfgMap.get("PROYECTO_DEFAULT") ?? null,
      acta_referencia: cfgMap.get("ACTA_REFERENCIA") ?? null,
      representante_legal: cfgMap.get("REPRESENTANTE_LEGAL") ?? null,
      plantilla_usada: input.sexo,
      status_pdf: "PENDIENTE",
      observaciones: input.observaciones?.trim() || null,
      creado_por: user.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (cErr || !contrato) {
    // rollback parcial: eliminar empleado huérfano
    await supabase.from("empleados").delete().eq("id", empleado.id);
    return { ok: false, error: `Contrato: ${cErr?.message ?? "no creado"}` };
  }

  // 5) Generar PDF y subir a Storage (no bloqueante para el alta)
  let pdfUrl: string | null = null;
  let pdfError: string | undefined;
  try {
    const sedeNombre = await supabase.from("sedes").select("nombre").eq("id", input.sede_id).maybeSingle<{ nombre: string }>();
    const buffer = await renderToBuffer(
      ContratoDoc({
        contratoId: folio as string,
        sexo: input.sexo,
        values: {
          CONTRATO_ID: folio as string,
          NOMBRE_TRABAJADOR: input.nombre_trabajador.toUpperCase().trim(),
          RFC: input.rfc ?? "",
          DOMICILIO_COMPLETO: input.domicilio_completo,
          CP: input.cp ?? "",
          SEDE: sedeNombre.data?.nombre ?? "",
          PUESTO: input.puesto,
          SUELDO_MENSUAL: input.sueldo_mensual.toLocaleString("es-MX", { minimumFractionDigits: 2 }),
          SUELDO_MENSUAL_LETRA: input.sueldo_mensual_letra,
          FECHA_INICIO: input.fecha_inicio_texto,
          FECHA_FIN: input.fecha_fin_texto,
          FECHA_FIRMA_TEXTO: input.fecha_firma_texto,
          HORA_INICIO: input.hora_inicio,
          HORA_FIN: input.hora_fin,
          JORNADA: input.jornada_descripcion,
          JORNADA_HORAS: String(input.jornada_horas),
          DIA_DESCANSO: input.dia_descanso_texto,
          PROYECTO_TEXTO: cfgMap.get("PROYECTO_DEFAULT") ?? "",
          ACTA_REFERENCIA: cfgMap.get("ACTA_REFERENCIA") ?? "",
          REPRESENTANTE_LEGAL: cfgMap.get("REPRESENTANTE_LEGAL") ?? "",
        },
      }),
    );
    const path = `${new Date().getFullYear()}/${(folio as string).replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`;
    const admin = supabaseAdmin();
    const { error: upErr } = await admin.storage
      .from("contratos-pdf")
      .upload(path, new Uint8Array(buffer), { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;
    await admin.from("contratos").update({ pdf_storage_path: path, status_pdf: "GENERADO" }).eq("id", contrato.id);
    const { data: signed } = await admin.storage.from("contratos-pdf").createSignedUrl(path, 60 * 60);
    pdfUrl = signed?.signedUrl ?? null;
  } catch (e) {
    pdfError = e instanceof Error ? e.message : String(e);
    await supabase.from("contratos").update({ status_pdf: "ERROR", observaciones: `PDF: ${pdfError}` }).eq("id", contrato.id);
  }

  revalidatePath("/rh-pro/alta");
  revalidatePath("/rh-pro");
  return { ok: true, contratoId: contrato.id, empleadoId: empleado.id, folio: folio as string, pdfUrl, pdfError };
}
