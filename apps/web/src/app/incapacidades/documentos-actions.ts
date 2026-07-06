"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyAdminLike } from "@/lib/push";

export type DocResult = { ok: true; documento_id: string; path: string } | { ok: false; error: string };

const TIPOS_VALIDOS = new Set([
  "ST7_INICIAL",
  "ST7_DICTAMEN",
  "ST2_ALTA",
  "INCAPACIDAD_MEDICO",
  "MAPA_TRAYECTO",
  "ST9",
  "OTRO",
]);

const MAX_BYTES = 6 * 1024 * 1024; // 6 MB por archivo (límite razonable para PDFs y fotos)
const MIME_OK = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export async function subirDocumentoAction(formData: FormData): Promise<DocResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" };

  const incapacidadId = String(formData.get("incapacidad_id") ?? "");
  const tipo = String(formData.get("tipo") ?? "OTRO").toUpperCase();
  const file = formData.get("archivo") as File | null;

  if (!incapacidadId) return { ok: false, error: "Falta incapacidad_id" };
  if (!file || !(file instanceof File)) return { ok: false, error: "No se recibió archivo" };
  if (!TIPOS_VALIDOS.has(tipo)) return { ok: false, error: `Tipo inválido: ${tipo}` };
  if (file.size > MAX_BYTES) return { ok: false, error: `Archivo muy grande (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)` };
  if (file.size === 0) return { ok: false, error: "Archivo vacío" };
  if (!MIME_OK.has(file.type)) {
    return { ok: false, error: `Tipo MIME no permitido (${file.type}). Solo PDF, JPG, PNG, WEBP, HEIC.` };
  }

  // Verificar acceso a la incapacidad (RLS la filtra)
  const { data: incap, error: incapErr } = await supabase
    .from("incapacidades")
    .select("id, empleado_id, tipo, empleados(nombre, numero_empleado)")
    .eq("id", incapacidadId)
    .maybeSingle();
  if (incapErr || !incap) return { ok: false, error: "Incapacidad no encontrada o sin acceso" };
  const incapData = incap as unknown as {
    id: string;
    tipo: string;
    empleados?: { nombre: string; numero_empleado: string } | { nombre: string; numero_empleado: string }[] | null;
  };
  const empI = Array.isArray(incapData.empleados) ? incapData.empleados[0] : incapData.empleados;

  // Sanitizar nombre
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const filenameSafe = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 60);
  const ts = Date.now();
  const path = `${incapacidadId}/${tipo}_${ts}_${filenameSafe}.${ext}`;

  // Upload (admin client bypassa límites de policies y simplifica)
  const admin = supabaseAdmin();
  const buffer = await file.arrayBuffer();
  const { error: upErr } = await admin.storage
    .from("incapacidades")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });
  if (upErr) return { ok: false, error: `Storage: ${upErr.message}` };

  // Registrar en incapacidad_documentos
  const { data: doc, error: docErr } = await admin
    .from("incapacidad_documentos")
    .insert({
      incapacidad_id: incapacidadId,
      tipo,
      archivo_path: path,
      archivo_nombre: file.name,
      mime: file.type,
      tamano_bytes: file.size,
      subido_por: user.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (docErr || !doc) {
    // Rollback del archivo
    await admin.storage.from("incapacidades").remove([path]).catch(() => {});
    return { ok: false, error: `Registrar: ${docErr?.message ?? "desconocido"}` };
  }

  // Evento en timeline
  await admin.from("incapacidad_eventos").insert({
    incapacidad_id: incapacidadId,
    tipo: "documento",
    detalle: `Documento subido: ${tipo} (${file.name})`,
    archivo_path: path,
    usuario_id: user.id,
  });

  // Push a admins-soporte para que sepan que hay documento nuevo
  void notifyAdminLike(
    {
      title: "Vortex · Documento subido",
      body: `${tipo} agregado al expediente de ${empI?.nombre ?? "empleado"}`,
      url: `/incapacidades/${incapacidadId}`,
      tag: `incap-${incapacidadId}`,
      icon: "/icons/icon-192.png",
      data: { incapacidadId, tipo: "incapacidad_documento" },
    },
    "incapacidad_documento",
    user.id,
  ).catch((e) => console.error("[incap-docs] notify fail:", e));

  revalidatePath(`/incapacidades/${incapacidadId}`);
  return { ok: true, documento_id: doc.id, path };
}

/**
 * Genera una URL firmada temporal (1 hora) para descargar un documento.
 * El cliente la usa para <a href=... target=_blank download>.
 */
export async function getDocumentoUrlAction(documentoId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" };

  // Verifica acceso vía RLS de la tabla
  const { data: doc, error } = await supabase
    .from("incapacidad_documentos")
    .select("archivo_path")
    .eq("id", documentoId)
    .maybeSingle<{ archivo_path: string }>();
  if (error || !doc) return { ok: false, error: "Sin acceso o no existe" };

  // Generar signed URL
  const admin = supabaseAdmin();
  const { data: signed, error: sigErr } = await admin.storage
    .from("incapacidades")
    .createSignedUrl(doc.archivo_path, 60 * 60);
  if (sigErr || !signed) return { ok: false, error: sigErr?.message ?? "No se pudo firmar" };

  return { ok: true, url: signed.signedUrl };
}

export async function eliminarDocumentoAction(documentoId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" };
  const { data: perfil } = await supabase.from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol)) {
    return { ok: false, error: "Solo admin-like puede eliminar documentos" };
  }

  const admin = supabaseAdmin();
  const { data: doc } = await admin.from("incapacidad_documentos").select("archivo_path, incapacidad_id").eq("id", documentoId).maybeSingle<{ archivo_path: string; incapacidad_id: string }>();
  if (!doc) return { ok: false, error: "No encontrado" };

  await admin.storage.from("incapacidades").remove([doc.archivo_path]).catch(() => {});
  const { error } = await admin.from("incapacidad_documentos").delete().eq("id", documentoId);
  if (error) return { ok: false, error: error.message };

  await admin.from("incapacidad_eventos").insert({
    incapacidad_id: doc.incapacidad_id,
    tipo: "documento",
    detalle: `Documento eliminado`,
    usuario_id: user.id,
  });

  revalidatePath(`/incapacidades/${doc.incapacidad_id}`);
  return { ok: true };
}
