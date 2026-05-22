"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type TicketResult = { ok: true; ticketId?: string } | { ok: false; error: string };

export interface NuevoTicketInput {
  tipo: "DESBLOQUEO" | "URGENCIA" | "DUDA" | "SUGERENCIA";
  asunto: string;
  mensaje: string;
  urgencia: "NORMAL" | "URGENTE";
  fecha_solicitada?: string | null;
}

async function getProfile() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { sb: null, error: "Sin sesión.", userId: null, rol: null };
  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol, nombre, username")
    .eq("id", user.id)
    .single<{ rol: string; nombre: string; username: string }>();
  if (!perfil) return { sb: null, error: "Perfil no encontrado.", userId: null, rol: null };
  return { sb: supabase, userId: user.id, rol: perfil.rol, nombre: perfil.nombre, username: perfil.username, error: null };
}

function nextFolio(): string {
  // El folio TCK-#### lo genera la DB via default sequence — solo lo dejamos pasar.
  return "";
}

export async function crearTicketAction(input: NuevoTicketInput): Promise<TicketResult> {
  const auth = await getProfile();
  if (!auth.sb) return { ok: false, error: auth.error! };

  if (!input.asunto.trim() || !input.mensaje.trim()) {
    return { ok: false, error: "Asunto y mensaje son obligatorios." };
  }

  // Determinar sede del usuario (su primera asignación) para etiquetar el ticket
  const { data: asign } = await auth.sb
    .from("asignaciones_supervisor")
    .select("sede_id, jornada")
    .eq("usuario_id", auth.userId)
    .eq("activo", true)
    .limit(1)
    .maybeSingle<{ sede_id: string; jornada: string }>();

  // El folio (TCK-####) y chat_id se generan por DEFAULT en la tabla
  const { data: ticket, error: tErr } = await auth.sb
    .from("tickets_soporte")
    .insert({
      supervisor_id: auth.userId,
      sede_id: asign?.sede_id ?? null,
      jornada: asign?.jornada ?? null,
      fecha_solicitada: input.fecha_solicitada || null,
      tipo: input.tipo,
      prioridad: input.urgencia,
      estado: "PENDIENTE",
      ultimo_mensaje: input.asunto.trim(),
      unread_soporte: 1,
      unread_user: 0,
      apertura_ts: new Date().toISOString(),
      ultimo_ts: new Date().toISOString(),
    })
    .select("id")
    .single<{ id: string }>();
  if (tErr || !ticket) return { ok: false, error: `Ticket: ${tErr?.message ?? "no creado"}` };

  // Primer mensaje (el cuerpo del ticket)
  const { error: mErr } = await auth.sb
    .from("mensajes_soporte")
    .insert({
      ticket_id: ticket.id,
      remitente_id: auth.userId,
      origen: "USUARIO",
      mensaje: `${input.asunto.trim()}\n\n${input.mensaje.trim()}`,
      leido_user: true,
      leido_soporte: false,
    });
  if (mErr) {
    await auth.sb.from("tickets_soporte").delete().eq("id", ticket.id);
    return { ok: false, error: `Mensaje: ${mErr.message}` };
  }

  revalidatePath("/soporte");
  return { ok: true, ticketId: ticket.id };
}

export async function enviarMensajeAction(ticketId: string, mensaje: string): Promise<TicketResult> {
  const auth = await getProfile();
  if (!auth.sb) return { ok: false, error: auth.error! };
  if (!mensaje.trim()) return { ok: false, error: "Mensaje vacío." };

  // ¿Quién envía? Si es admin/soporte responde, si es user agrega mensaje
  const esSoporte = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(auth.rol!);
  const origen = esSoporte ? "SOPORTE" : "USUARIO";

  const { error: mErr } = await auth.sb
    .from("mensajes_soporte")
    .insert({
      ticket_id: ticketId,
      remitente_id: auth.userId,
      origen,
      mensaje: mensaje.trim(),
      leido_user: !esSoporte,           // user lee su propio msg automáticamente
      leido_soporte: esSoporte,
    });
  if (mErr) return { ok: false, error: mErr.message };

  // Actualizar ticket: último_mensaje, ultimo_ts, contadores
  const admin = supabaseAdmin();
  await admin
    .from("tickets_soporte")
    .update({
      ultimo_mensaje: mensaje.trim().slice(0, 120),
      ultimo_ts: new Date().toISOString(),
      estado: esSoporte ? "RESPONDIDO" : "PENDIENTE",
      // increment con sql
      ...(esSoporte
        ? { unread_user: 1 }              // sumamos para el usuario
        : { unread_soporte: 1 }),         // sumamos para soporte
    })
    .eq("id", ticketId);

  revalidatePath("/soporte");
  revalidatePath(`/soporte/${ticketId}`);
  return { ok: true };
}

export async function marcarLeidoAction(ticketId: string): Promise<TicketResult> {
  const auth = await getProfile();
  if (!auth.sb) return { ok: false, error: auth.error! };
  const esSoporte = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(auth.rol!);
  const patch = esSoporte ? { unread_soporte: 0 } : { unread_user: 0 };
  await auth.sb.from("tickets_soporte").update(patch).eq("id", ticketId);
  revalidatePath("/soporte");
  return { ok: true };
}

export async function cerrarTicketAction(ticketId: string): Promise<TicketResult> {
  const auth = await getProfile();
  if (!auth.sb) return { ok: false, error: auth.error! };
  const esSoporte = ["ADMIN", "SUPERADMIN", "SOPORTE", "CEO"].includes(auth.rol!);
  if (!esSoporte) return { ok: false, error: "Solo soporte puede cerrar tickets." };

  const { error } = await auth.sb
    .from("tickets_soporte")
    .update({ estado: "CERRADO", cierre_ts: new Date().toISOString(), cerrado_por: auth.userId })
    .eq("id", ticketId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/soporte");
  revalidatePath(`/soporte/${ticketId}`);
  return { ok: true };
}

void nextFolio;

/**
 * Libera la fecha solicitada de un ticket por N horas (default 6).
 * - Llama al RPC liberar_fecha (security definer, valida rol)
 * - Inserta un mensaje SISTEMA en el thread
 * - Marca el ticket como RESPONDIDO
 */
export async function liberarFechaDesdeTicketAction(
  ticketId: string,
  horas: number = 6,
): Promise<TicketResult> {
  const auth = await getProfile();
  if (!auth.sb) return { ok: false, error: auth.error! };

  const esSoporte = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(auth.rol!);
  if (!esSoporte) return { ok: false, error: "Solo soporte puede liberar fechas." };

  // Traer ticket
  const { data: ticket, error: tErr } = await auth.sb
    .from("tickets_soporte")
    .select("id, fecha_solicitada, folio")
    .eq("id", ticketId)
    .maybeSingle<{ id: string; fecha_solicitada: string | null; folio: string }>();
  if (tErr) return { ok: false, error: `Ticket: ${tErr.message}` };
  if (!ticket) return { ok: false, error: "Ticket no encontrado." };
  if (!ticket.fecha_solicitada) {
    return { ok: false, error: "Este ticket no tiene fecha solicitada. Usa el botón de Pase de Lista." };
  }

  // Liberar fecha — insert directo a la tabla (independiente del cache de PostgREST)
  const expira = new Date(Date.now() + horas * 3600 * 1000).toISOString();
  const admin0 = supabaseAdmin();
  const basePayload = {
    fecha: ticket.fecha_solicitada,
    liberado_por: auth.userId,
    motivo: `Liberada desde ticket ${ticket.folio} por ${horas} hrs`,
    activo: true,
  };
  // Intento 1: con expira_en (v7 aplicada)
  let lErr = (await admin0.from("fechas_liberadas").upsert(
    { ...basePayload, expira_en: expira },
    { onConflict: "fecha" },
  )).error;
  // Fallback: sin expira_en (v7 no aplicada todavía — degrada a liberación indefinida)
  if (lErr && /expira_en/i.test(lErr.message)) {
    lErr = (await admin0.from("fechas_liberadas").upsert(
      basePayload,
      { onConflict: "fecha" },
    )).error;
  }
  if (lErr) return { ok: false, error: `Liberar: ${lErr.message}` };

  const expiraTxt = new Date(expira).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });

  // Mensaje SISTEMA en el thread
  const msg = `🔓 Fecha ${ticket.fecha_solicitada} liberada por ${horas} hora${horas === 1 ? "" : "s"} (expira ${expiraTxt}). Captura tu pase ahora antes de que se bloquee.`;
  await auth.sb.from("mensajes_soporte").insert({
    ticket_id: ticketId,
    remitente_id: auth.userId,
    origen: "SISTEMA",
    mensaje: msg,
    leido_user: false,
    leido_soporte: true,
  });

  // Actualizar ticket
  const admin = supabaseAdmin();
  await admin
    .from("tickets_soporte")
    .update({
      ultimo_mensaje: msg.slice(0, 120),
      ultimo_ts: new Date().toISOString(),
      estado: "RESPONDIDO",
      unread_user: 1,
    })
    .eq("id", ticketId);

  revalidatePath("/soporte");
  revalidatePath(`/soporte/${ticketId}`);
  return { ok: true };
}

/**
 * Libera la fecha de hoy (o p_fecha) por N horas — usado desde el botón
 * "Liberar fecha" del pase de lista. SUPERADMIN/SOPORTE únicamente.
 */
export async function liberarFechaQuickAction(
  fecha: string,
  horas: number = 6,
): Promise<TicketResult> {
  const auth = await getProfile();
  if (!auth.sb) return { ok: false, error: auth.error! };
  const esSoporte = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(auth.rol!);
  if (!esSoporte) return { ok: false, error: "Solo soporte puede liberar fechas." };

  const expira = new Date(Date.now() + horas * 3600 * 1000).toISOString();
  const admin = supabaseAdmin();
  const basePayload = {
    fecha,
    liberado_por: auth.userId,
    motivo: `Liberación rápida de ${horas} hrs desde pase-lista`,
    activo: true,
  };
  let error = (await admin.from("fechas_liberadas").upsert(
    { ...basePayload, expira_en: expira },
    { onConflict: "fecha" },
  )).error;
  if (error && /expira_en/i.test(error.message)) {
    error = (await admin.from("fechas_liberadas").upsert(basePayload, { onConflict: "fecha" })).error;
  }
  if (error) return { ok: false, error: error.message };

  revalidatePath("/pase-lista");
  return { ok: true };
}
