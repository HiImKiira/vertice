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
    .select("rol, sede_id:id, nombre, username")
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
