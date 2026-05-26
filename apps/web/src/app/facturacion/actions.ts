"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendPush } from "@/lib/push";

export type Result<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string };

async function requireFacturacion() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { sb: null, userId: null, error: "Sin sesión" as const };
  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol, nombre, acceso_facturacion")
    .eq("id", user.id)
    .single<{ rol: string; nombre: string; acceso_facturacion: boolean }>();
  if (!perfil) return { sb: null, userId: null, error: "Perfil no encontrado" };
  const esAdminLike = ["SUPERADMIN", "SOPORTE", "CEO"].includes(perfil.rol);
  if (!esAdminLike && perfil.acceso_facturacion !== true) {
    return { sb: null, userId: null, error: "Sin acceso al módulo de Facturación" };
  }
  return { sb: supabase, userId: user.id, nombre: perfil.nombre, error: null as null };
}

// ─────────────────────────────────────────────────────────────────────
// PRODUCTOS
// ─────────────────────────────────────────────────────────────────────
export async function crearProductoAction(input: {
  sku: string;
  nombre: string;
  descripcion?: string | undefined;
  unidad: string;
  precio_unitario: number;
  iva_pct: number;
  categoria?: string | undefined;
  stock_actual?: number | undefined;
  stock_minimo?: number | undefined;
  proveedor?: string | undefined;
  notas?: string | undefined;
}): Promise<Result> {
  const auth = await requireFacturacion();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };
  if (!input.sku.trim() || !input.nombre.trim()) return { ok: false, error: "SKU y nombre requeridos" };

  const { error } = await auth.sb.from("productos").insert({
    sku: input.sku.trim().toUpperCase(),
    nombre: input.nombre.trim(),
    descripcion: input.descripcion?.trim() || null,
    unidad: input.unidad || "PIEZA",
    precio_unitario: input.precio_unitario || 0,
    iva_pct: input.iva_pct ?? 16,
    categoria: input.categoria?.trim() || null,
    stock_actual: input.stock_actual ?? 0,
    stock_minimo: input.stock_minimo ?? 0,
    proveedor: input.proveedor?.trim() || null,
    notas: input.notas?.trim() || null,
    creado_por: auth.userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/facturacion/productos");
  return { ok: true };
}

export async function actualizarProductoAction(
  id: string,
  patch: {
    sku?: string | undefined;
    nombre?: string | undefined;
    descripcion?: string | undefined;
    unidad?: string | undefined;
    precio_unitario?: number | undefined;
    iva_pct?: number | undefined;
    categoria?: string | undefined;
    stock_actual?: number | undefined;
    stock_minimo?: number | undefined;
    proveedor?: string | undefined;
    notas?: string | undefined;
    activo?: boolean | undefined;
  },
): Promise<Result> {
  const auth = await requireFacturacion();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };

  const update: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (typeof v === "string") update[k] = v.trim() || null;
    else update[k] = v;
  }

  const { error } = await auth.sb.from("productos").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/facturacion/productos");
  return { ok: true };
}

export async function eliminarProductoAction(id: string): Promise<Result> {
  const auth = await requireFacturacion();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };
  // Soft-delete (toggle activo) si tiene referencias en cotizaciones
  const { count } = await auth.sb
    .from("cotizacion_lineas")
    .select("id", { count: "exact", head: true })
    .eq("producto_id", id);
  if ((count ?? 0) > 0) {
    const { error } = await auth.sb.from("productos").update({ activo: false }).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await auth.sb.from("productos").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/facturacion/productos");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// CLIENTES DE COTIZACIÓN
// ─────────────────────────────────────────────────────────────────────
export async function crearClienteAction(input: {
  razon_social: string;
  rfc?: string | undefined;
  contacto_nombre?: string | undefined;
  contacto_email?: string | undefined;
  contacto_telefono?: string | undefined;
  direccion?: string | undefined;
  notas?: string | undefined;
}): Promise<Result<{ id: string }>> {
  const auth = await requireFacturacion();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };
  if (!input.razon_social.trim()) return { ok: false, error: "Razón social requerida" };

  const { data, error } = await auth.sb
    .from("clientes_cotizacion")
    .insert({
      razon_social: input.razon_social.trim(),
      rfc: input.rfc?.trim() || null,
      contacto_nombre: input.contacto_nombre?.trim() || null,
      contacto_email: input.contacto_email?.trim() || null,
      contacto_telefono: input.contacto_telefono?.trim() || null,
      direccion: input.direccion?.trim() || null,
      notas: input.notas?.trim() || null,
      creado_por: auth.userId,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { ok: false, error: error?.message ?? "Error al crear" };

  revalidatePath("/facturacion/clientes");
  revalidatePath("/facturacion/cotizaciones/nueva");
  return { ok: true, id: data.id };
}

export async function actualizarClienteAction(
  id: string,
  patch: {
    razon_social?: string | undefined;
    rfc?: string | undefined;
    contacto_nombre?: string | undefined;
    contacto_email?: string | undefined;
    contacto_telefono?: string | undefined;
    direccion?: string | undefined;
    notas?: string | undefined;
    activo?: boolean | undefined;
  },
): Promise<Result> {
  const auth = await requireFacturacion();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (typeof v === "string") update[k] = v.trim() || null;
    else update[k] = v;
  }

  const { error } = await auth.sb.from("clientes_cotizacion").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/facturacion/clientes");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// COTIZACIONES
// ─────────────────────────────────────────────────────────────────────
export async function crearCotizacionAction(input: {
  cliente_id: string;
  vigencia_dias?: number | undefined;
  notas?: string | undefined;
  condiciones?: string | undefined;
  lineas: Array<{
    producto_id?: string | null | undefined;
    descripcion: string;
    unidad?: string | undefined;
    cantidad: number;
    precio_unitario: number;
    iva_pct?: number | undefined;
  }>;
}): Promise<Result<{ id: string; folio: string }>> {
  const auth = await requireFacturacion();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };
  if (!input.cliente_id) return { ok: false, error: "Cliente requerido" };
  if (!input.lineas?.length) return { ok: false, error: "Agrega al menos una línea" };

  // Folio
  const { data: folioData, error: folioErr } = await auth.sb.rpc("siguiente_folio_cotizacion");
  if (folioErr || !folioData) return { ok: false, error: folioErr?.message ?? "Error al generar folio" };
  const folio = String(folioData);

  // Header
  const { data: cot, error: cotErr } = await auth.sb
    .from("cotizaciones")
    .insert({
      folio,
      cliente_id: input.cliente_id,
      vigencia_dias: input.vigencia_dias ?? 30,
      notas: input.notas?.trim() || null,
      condiciones: input.condiciones?.trim() || null,
      creado_por: auth.userId,
    })
    .select("id, folio")
    .single<{ id: string; folio: string }>();
  if (cotErr || !cot) return { ok: false, error: cotErr?.message ?? "Error al crear cotización" };

  // Líneas
  const lineas = input.lineas.map((l, i) => ({
    cotizacion_id: cot.id,
    producto_id: l.producto_id ?? null,
    descripcion_snapshot: l.descripcion.trim(),
    unidad_snapshot: l.unidad ?? "PIEZA",
    cantidad: Number(l.cantidad) || 1,
    precio_unitario: Number(l.precio_unitario) || 0,
    iva_pct: l.iva_pct ?? 16,
    orden: i,
  }));
  const { error: linErr } = await auth.sb.from("cotizacion_lineas").insert(lineas);
  if (linErr) {
    // rollback manual
    await auth.sb.from("cotizaciones").delete().eq("id", cot.id);
    return { ok: false, error: linErr.message };
  }

  revalidatePath("/facturacion/cotizaciones");
  revalidatePath("/facturacion");
  return { ok: true, id: cot.id, folio: cot.folio };
}

export async function cambiarEstadoCotizacionAction(
  id: string,
  nuevo: "BORRADOR" | "ENVIADA" | "ACEPTADA" | "RECHAZADA" | "FACTURADA" | "CANCELADA",
  rechazado_motivo?: string,
): Promise<Result> {
  const auth = await requireFacturacion();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };

  const update: Record<string, unknown> = { estado: nuevo };
  if (nuevo === "ENVIADA") update.enviado_en = new Date().toISOString();
  if (nuevo === "ACEPTADA") update.aceptado_en = new Date().toISOString();
  if (nuevo === "RECHAZADA") update.rechazado_motivo = rechazado_motivo?.trim() || null;

  const { error } = await auth.sb.from("cotizaciones").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/facturacion/cotizaciones");
  revalidatePath(`/facturacion/cotizaciones/${id}`);
  return { ok: true };
}

export async function eliminarCotizacionAction(id: string): Promise<Result> {
  const auth = await requireFacturacion();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };
  // Solo si está en BORRADOR
  const { data: cot } = await auth.sb.from("cotizaciones").select("estado").eq("id", id).single<{ estado: string }>();
  if (!cot) return { ok: false, error: "No encontrada" };
  if (cot.estado !== "BORRADOR") return { ok: false, error: "Solo se pueden eliminar cotizaciones en BORRADOR" };

  const { error } = await auth.sb.from("cotizaciones").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/facturacion/cotizaciones");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// SOLICITUDES DE COMPRA
// ─────────────────────────────────────────────────────────────────────
export async function crearSolicitudCompraAction(input: {
  sede_id?: string | null | undefined;
  motivo: string;
  prioridad: "BAJA" | "NORMAL" | "ALTA" | "URGENTE";
  notas_solicitante?: string | undefined;
  items: Array<{
    producto_id?: string | null | undefined;
    descripcion: string;
    cantidad: number;
    unidad?: string | undefined;
    precio_estimado?: number | undefined;
    notas?: string | undefined;
  }>;
}): Promise<Result<{ id: string; folio: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" };
  // Cualquier usuario autenticado puede solicitar — RLS lo refuerza
  if (!input.motivo.trim()) return { ok: false, error: "Motivo requerido" };
  if (!input.items?.length) return { ok: false, error: "Agrega al menos un ítem" };

  const { data: folioData, error: folioErr } = await supabase.rpc("siguiente_folio_compra");
  if (folioErr || !folioData) return { ok: false, error: folioErr?.message ?? "Error al generar folio" };
  const folio = String(folioData);

  const { data: sol, error: solErr } = await supabase
    .from("solicitudes_compra")
    .insert({
      folio,
      solicitante_id: user.id,
      sede_id: input.sede_id ?? null,
      motivo: input.motivo.trim(),
      prioridad: input.prioridad ?? "NORMAL",
      notas_solicitante: input.notas_solicitante?.trim() || null,
    })
    .select("id, folio")
    .single<{ id: string; folio: string }>();
  if (solErr || !sol) return { ok: false, error: solErr?.message ?? "Error al crear solicitud" };

  const items = input.items.map((it, i) => ({
    solicitud_id: sol.id,
    producto_id: it.producto_id ?? null,
    descripcion: it.descripcion.trim(),
    cantidad: Number(it.cantidad) || 1,
    unidad: it.unidad ?? "PIEZA",
    precio_estimado: Number(it.precio_estimado) || 0,
    notas: it.notas?.trim() || null,
    orden: i,
  }));
  const { error: itemErr } = await supabase.from("solicitud_compra_items").insert(items);
  if (itemErr) {
    await supabase.from("solicitudes_compra").delete().eq("id", sol.id);
    return { ok: false, error: itemErr.message };
  }

  // Push a usuarios con acceso_facturacion
  const admin = supabaseAdmin();
  const { data: nombreSolic } = await admin
    .from("usuarios").select("nombre").eq("id", user.id).single<{ nombre: string }>();
  const { data: targets } = await admin.rpc("usuarios_con_acceso_facturacion");
  const targetIds = (targets ?? []).map((r: { id?: string } | string) =>
    typeof r === "string" ? r : (r.id ?? "")
  ).filter(Boolean) as string[];

  if (targetIds.length > 0) {
    const prioridadLabel = input.prioridad === "URGENTE" ? "⚠ URGENTE" : input.prioridad === "ALTA" ? "❗ ALTA" : "";
    void sendPush(
      {
        title: `Nueva solicitud de compra · ${folio}`,
        body: `${prioridadLabel ? prioridadLabel + " · " : ""}${nombreSolic?.nombre ?? "Un supervisor"}: ${input.motivo.trim()}`,
        url: `/facturacion/compras/${sol.id}`,
        tag: `solicitud-compra-${sol.id}`,
        icon: "/icons/icon-192.png",
        requireInteraction: input.prioridad === "URGENTE" || input.prioridad === "ALTA",
      },
      targetIds.filter((id) => id !== user.id),
      "solicitud_compra_nueva",
    ).catch(() => {});
  }

  revalidatePath("/facturacion/compras");
  revalidatePath("/facturacion");
  return { ok: true, id: sol.id, folio: sol.folio };
}

export async function cambiarEstadoSolicitudAction(
  id: string,
  nuevo: "SOLICITADA" | "APROBADA" | "RECHAZADA" | "COMPRADA" | "ENTREGADA" | "CANCELADA",
  notas?: string,
): Promise<Result> {
  const auth = await requireFacturacion();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };

  const update: Record<string, unknown> = { estado: nuevo };
  if (nuevo === "APROBADA") {
    update.aprobado_en = new Date().toISOString();
    update.aprobado_por = auth.userId;
  }
  if (nuevo === "COMPRADA") {
    update.comprado_en = new Date().toISOString();
    update.comprado_por = auth.userId;
  }
  if (nuevo === "ENTREGADA") {
    update.entregado_en = new Date().toISOString();
  }
  if (notas && notas.trim()) update.notas_aprobador = notas.trim();

  const { data: sol, error } = await auth.sb
    .from("solicitudes_compra")
    .update(update)
    .eq("id", id)
    .select("folio, solicitante_id, motivo")
    .single<{ folio: string; solicitante_id: string; motivo: string }>();
  if (error || !sol) return { ok: false, error: error?.message ?? "Error al actualizar" };

  // Notificar al solicitante del cambio
  const titulo = {
    SOLICITADA: "Solicitud reabierta",
    APROBADA: "✓ Tu solicitud fue APROBADA",
    RECHAZADA: "✗ Tu solicitud fue rechazada",
    COMPRADA: "Tu solicitud fue COMPRADA",
    ENTREGADA: "Tu solicitud fue ENTREGADA",
    CANCELADA: "Tu solicitud fue cancelada",
  }[nuevo];

  void sendPush(
    {
      title: `${titulo} · ${sol.folio}`,
      body: notas?.trim() || sol.motivo,
      url: `/facturacion/compras/${id}`,
      tag: `solicitud-${id}-${nuevo}`,
      icon: "/icons/icon-192.png",
    },
    [sol.solicitante_id],
    "solicitud_compra_estado",
  ).catch(() => {});

  revalidatePath("/facturacion/compras");
  revalidatePath(`/facturacion/compras/${id}`);
  return { ok: true };
}

export async function cancelarSolicitudPropiaAction(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" };

  const { data: sol } = await supabase
    .from("solicitudes_compra")
    .select("solicitante_id, estado")
    .eq("id", id)
    .single<{ solicitante_id: string; estado: string }>();
  if (!sol) return { ok: false, error: "No encontrada" };
  if (sol.solicitante_id !== user.id) return { ok: false, error: "Solo el solicitante puede cancelar" };
  if (sol.estado !== "SOLICITADA") return { ok: false, error: "Solo se puede cancelar mientras esté en SOLICITADA" };

  const { error } = await supabase
    .from("solicitudes_compra")
    .update({ estado: "CANCELADA" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/facturacion/compras");
  return { ok: true };
}
