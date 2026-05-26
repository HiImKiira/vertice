"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendPush } from "@/lib/push";

export type SupResult = { ok: true } | { ok: false; error: string };
export type NotifyMasivoResult =
  | { ok: true; supervisoresNotificados: number; dispositivos: number; saltados: number }
  | { ok: false; error: string };

async function requireAdminLike() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { sb: null, userId: null, error: "Sin sesión" };
  const { data: perfil } = await supabase
    .from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol)) {
    return { sb: null, userId: null, error: "Solo admin/superadmin/soporte" };
  }
  return { sb: supabase, userId: user.id, error: null };
}

/**
 * Guardar notas internas del supervisor.
 */
export async function guardarNotaSupervisorAction(supervisorId: string, notas: string): Promise<SupResult> {
  const auth = await requireAdminLike();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };

  const limpia = notas.trim();
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("usuarios")
    .update({
      notas: limpia || null,
      notas_actualizado_en: new Date().toISOString(),
      notas_actualizado_por: auth.userId,
    })
    .eq("id", supervisorId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/rh-pro/supervisores/${supervisorId}`);
  revalidatePath("/rh-pro/supervisores");
  return { ok: true };
}

/**
 * Mandar mensaje custom directo al supervisor (push individual).
 */
export async function mandarMensajeSupervisorAction(input: {
  supervisorId: string;
  titulo: string;
  cuerpo: string;
  urlDestino?: string;
  urgente?: boolean;
}): Promise<SupResult> {
  const auth = await requireAdminLike();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };

  if (!input.supervisorId || !input.titulo.trim() || !input.cuerpo.trim()) {
    return { ok: false, error: "Faltan campos requeridos" };
  }

  const result = await sendPush(
    {
      title: input.titulo.trim(),
      body: input.cuerpo.trim(),
      url: input.urlDestino?.trim() || "/dashboard",
      tag: `msg-rh-${input.supervisorId}-${Date.now()}`,
      icon: "/icons/icon-192.png",
      requireInteraction: input.urgente === true,
    },
    [input.supervisorId],
    "mensaje_rh_individual",
  ).catch((e) => ({
    enviados: 0,
    fallidos: 0,
    detalles: [{ usuario_id: input.supervisorId, ok: false, razon: e instanceof Error ? e.message : "error" }],
  }));

  if (result.enviados === 0) {
    return { ok: false, error: `No se entregó (${result.fallidos} fallidos). Verifica que el supervisor tenga dispositivos suscritos.` };
  }

  return { ok: true };
}

/**
 * Acción masiva: notificar a TODOS los supervisores con cobertura <100% hoy.
 * Por cada supervisor que tenga faltantes, se manda push individual con su
 * conteo personalizado.
 */
export async function notificarTodosIncompletosAction(): Promise<NotifyMasivoResult> {
  const auth = await requireAdminLike();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };

  const admin = supabaseAdmin();
  const { data: lista, error } = await admin.rpc("supervisores_lista");
  if (error) return { ok: false, error: error.message };

  const supervisores = (lista ?? []) as Array<{
    id: string;
    nombre: string;
    activo: boolean;
    empleados_a_cargo: number;
    capturadas_hoy: number;
    pct_hoy: number;
    push_dispositivos: number;
  }>;

  const incompletos = supervisores.filter(
    (s) => s.activo && s.empleados_a_cargo > 0 && s.pct_hoy < 100,
  );

  if (incompletos.length === 0) {
    return { ok: false, error: "Ningún supervisor tiene cobertura incompleta hoy. ✓" };
  }

  const hoy = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let supervisoresNotificados = 0;
  let dispositivos = 0;
  let saltados = 0;

  for (const s of incompletos) {
    if (s.push_dispositivos === 0) {
      saltados++;
      continue;
    }
    const faltantes = s.empleados_a_cargo - s.capturadas_hoy;
    const r = await sendPush(
      {
        title: `Vortex · ${faltantes} pendientes`,
        body: `Recordatorio de RH: te faltan ${faltantes} de ${s.empleados_a_cargo} empleados por capturar hoy.`,
        url: `/pase-lista?fecha=${hoy}`,
        tag: `pendientes-batch-${s.id}-${hoy}`,
        icon: "/icons/icon-192.png",
        requireInteraction: true,
      },
      [s.id],
      "recordatorio_masivo_rh",
    ).catch(() => ({ enviados: 0, fallidos: 0, detalles: [] }));

    if (r.enviados > 0) {
      supervisoresNotificados++;
      dispositivos += r.enviados;
    } else {
      saltados++;
    }
  }

  revalidatePath("/rh-pro/supervisores");
  revalidatePath("/live");
  revalidatePath("/live/cobertura");

  return { ok: true, supervisoresNotificados, dispositivos, saltados };
}
