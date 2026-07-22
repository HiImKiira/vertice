"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifyAdminLike } from "@/lib/push";
import { coberturaQuincena } from "@/lib/quincena";

export type AvisoResult = { ok: true; mensaje: string } | { ok: false; error: string };

/**
 * El supervisor avisa a RH el estado de su quincena (días completos / faltantes).
 * Manda push a admin-like con el resumen — la "conectividad" hacia RH.
 */
export async function avisarRHQuincenaAction(): Promise<AvisoResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" };

  const { data: perfil } = await supabase
    .from("usuarios").select("nombre, username").eq("id", user.id)
    .single<{ nombre: string; username: string }>();

  const cob = await coberturaQuincena(supabase, user.id);
  if (cob.sinAsignaciones) return { ok: false, error: "No tienes sedes asignadas" };

  const quien = perfil?.nombre ?? perfil?.username ?? "Supervisor";
  const faltan = cob.diasIncompletos.length;
  const cuerpo = faltan === 0
    ? `${quien}: quincena ${cob.quincena.label} COMPLETA (${cob.diasCompletos}/${cob.diasTranscurridos} días al 100%).`
    : `${quien}: ${cob.diasCompletos}/${cob.diasTranscurridos} días al 100% (${cob.pctGlobal}%). Le faltan ${faltan} día(s): ${cob.diasIncompletos.slice(0, 6).join(", ")}${faltan > 6 ? "…" : ""}`;

  await notifyAdminLike(
    {
      title: `Vortex · Quincena de ${quien}`,
      body: cuerpo,
      url: "/rh-pro/supervisores",
      tag: `quincena-${user.id}`,
      icon: "/icons/icon-192.png",
      data: { tipo: "quincena_supervisor", usuarioId: user.id },
    },
    "quincena_supervisor",
    user.id,
  ).catch((e) => console.error("[mi-quincena] push fail:", e));

  return { ok: true, mensaje: faltan === 0 ? "RH fue notificado: tu quincena está completa ✓" : `RH fue notificado (${faltan} día(s) pendientes).` };
}
