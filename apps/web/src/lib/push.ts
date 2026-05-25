import webpush from "web-push";
import { supabaseAdmin } from "./supabase-admin";

// Sanitizamos para evitar que un newline/whitespace pegado al setear el
// env var en Vercel rompa el parseo de URL del web-push library.
function clean(v: string | undefined): string {
  return (v ?? "").trim().replace(/[\r\n]+/g, "");
}

function pickValidSubject(raw: string): string {
  const v = clean(raw);
  // Acepta solo mailto: o https:// (lo que pide la spec VAPID)
  if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(v)) return v;
  if (/^https?:\/\/[^\s]+$/i.test(v)) return v;
  // Fallback seguro: nuestro propio dominio en Vercel
  return "https://vertice-rosy.vercel.app";
}

const VAPID_SUBJECT = pickValidSubject(process.env.VAPID_SUBJECT ?? "");
const VAPID_PUBLIC = clean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
const VAPID_PRIVATE = clean(process.env.VAPID_PRIVATE_KEY);

let configured = false;
function configure() {
  if (configured) return;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    throw new Error("Faltan VAPID keys (NEXT_PUBLIC_VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY)");
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string | undefined;
  tag?: string | undefined;
  icon?: string | undefined;
  data?: Record<string, unknown> | undefined;
  /** Si true, notification persiste hasta que el usuario interactúa */
  requireInteraction?: boolean | undefined;
}

interface Subscription {
  id: string;
  usuario_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface SendResult {
  enviados: number;
  fallidos: number;
  detalles: Array<{ usuario_id: string; ok: boolean; razon?: string }>;
}

/**
 * Manda push a TODOS los usuarios admin-like (ADMIN/SUPERADMIN/CEO/SOPORTE).
 * Útil para eventos que requieren acción del equipo de RH:
 *   - Nuevo ticket de soporte abierto
 *   - Nueva respuesta de supervisor en un ticket
 *   - Etc.
 *
 * El parámetro `excluirUserId` evita notificar al usuario que disparó la
 * acción (ej. si un admin escribe en un ticket, no recibe su propio push).
 */
export async function notifyAdminLike(
  payload: PushPayload,
  tipo: string,
  excluirUserId?: string | null,
): Promise<SendResult> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("usuarios")
    .select("id")
    .in("rol", ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"])
    .eq("activo", true);
  if (error || !data) {
    return { enviados: 0, fallidos: 0, detalles: [{ usuario_id: "n/a", ok: false, razon: error?.message ?? "no admins" }] };
  }
  const ids = data.map((u) => u.id as string).filter((id) => id !== excluirUserId);
  if (ids.length === 0) return { enviados: 0, fallidos: 0, detalles: [] };
  return sendPush(payload, ids, tipo);
}

/**
 * Manda un push a uno o varios usuarios. Si usuarioIds es null/undefined,
 * broadcast a TODOS los supervisores activos con suscripción.
 *
 * Limpia automáticamente suscripciones que devuelvan 410 (Gone).
 */
export async function sendPush(
  payload: PushPayload,
  usuarioIds?: string[] | null,
  tipo: string = "manual",
): Promise<SendResult> {
  configure();
  const admin = supabaseAdmin();

  let query = admin.from("push_subscriptions").select("id, usuario_id, endpoint, p256dh, auth").eq("activo", true);
  if (usuarioIds && usuarioIds.length > 0) {
    query = query.in("usuario_id", usuarioIds);
  }
  const { data: subs, error } = await query;
  if (error) {
    return { enviados: 0, fallidos: 0, detalles: [{ usuario_id: "n/a", ok: false, razon: error.message }] };
  }
  const subscriptions = (subs ?? []) as Subscription[];

  let enviados = 0;
  let fallidos = 0;
  const detalles: SendResult["detalles"] = [];
  const muertas: string[] = [];

  // Embebemos `tipo` en payload.data para que el SW pueda elegir el sonido
  const payloadConTipo: PushPayload = {
    ...payload,
    data: { ...(payload.data ?? {}), tipo },
  };

  await Promise.all(
    subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payloadConTipo),
          { TTL: 24 * 60 * 60 }, // 24h max retry por el push service
        );
        enviados++;
        detalles.push({ usuario_id: s.usuario_id, ok: true });
        await admin.from("notify_log").insert({
          usuario_id: s.usuario_id,
          tipo,
          titulo: payload.title,
          cuerpo: payload.body,
          resultado: "enviado",
        });
      } catch (e: unknown) {
        fallidos++;
        const err = e as { statusCode?: number; body?: string; message?: string };
        const status = err?.statusCode ?? 0;
        const razon = status === 410 ? "gone_410" : status === 404 ? "not_found_404" : err?.message ?? "unknown";
        detalles.push({ usuario_id: s.usuario_id, ok: false, razon });
        if (status === 410 || status === 404) {
          muertas.push(s.id);
        }
        await admin.from("notify_log").insert({
          usuario_id: s.usuario_id,
          tipo,
          titulo: payload.title,
          cuerpo: payload.body,
          resultado: `fallido_${razon}`,
          detalle: err?.body ?? null,
        });
      }
    }),
  );

  // Limpiar suscripciones muertas
  if (muertas.length > 0) {
    await admin.from("push_subscriptions").update({ activo: false }).in("id", muertas);
  }

  return { enviados, fallidos, detalles };
}
