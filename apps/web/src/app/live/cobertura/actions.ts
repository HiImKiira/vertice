"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendPush } from "@/lib/push";

export type NotifyResult =
  | { ok: true; enviados: number; fallidos: number; resumen: string }
  | { ok: false; error: string };

interface DetalleRow {
  sede_id: string;
  sede_abrev: string;
  sede_nombre: string;
  jornada: string;
  empleados: number;
  capturadas: number;
  pct: number;
}

/**
 * Notifica a un supervisor específico qué le falta capturar en una fecha.
 * Solo ADMIN/SUPERADMIN/CEO/SOPORTE pueden invocarlo (es manual + intencional).
 *
 * El mensaje se arma con los faltantes reales por sede×jornada.
 */
export async function notificarSupervisorPendientesAction(
  usuarioId: string,
  fecha: string,
): Promise<NotifyResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión" };

  const { data: perfilCaller } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .single<{ rol: string }>();
  if (!perfilCaller || !["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfilCaller.rol)) {
    return { ok: false, error: "Solo admin/superadmin/soporte puede notificar" };
  }

  if (!usuarioId || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: "Faltan datos válidos (usuario_id, fecha)" };
  }

  const admin = supabaseAdmin();

  // Datos del destinatario (validamos que sea USER activo)
  const { data: dest } = await admin
    .from("usuarios")
    .select("id, nombre, username, rol, activo")
    .eq("id", usuarioId)
    .maybeSingle<{ id: string; nombre: string; username: string; rol: string; activo: boolean }>();
  if (!dest) return { ok: false, error: "Supervisor no encontrado" };
  if (!dest.activo) return { ok: false, error: "Supervisor inactivo" };

  // Breakdown por sede × jornada
  const { data: detRaw, error: detErr } = await admin.rpc("cobertura_supervisor_detalle", {
    p_usuario_id: usuarioId,
    p_fecha: fecha,
  });
  if (detErr) return { ok: false, error: `RPC detalle: ${detErr.message}` };
  const detalle = (detRaw ?? []) as DetalleRow[];

  // Filtramos a los que tienen faltantes (capturadas < empleados)
  const pendientes = detalle.filter((d) => d.empleados > d.capturadas);
  if (pendientes.length === 0) {
    return { ok: false, error: `${dest.nombre} ya tiene 100% capturado en ${fecha} — no se mandó notificación.` };
  }

  // Total faltantes
  const totalFalta = pendientes.reduce((acc, p) => acc + (p.empleados - p.capturadas), 0);
  const totalEmp = pendientes.reduce((acc, p) => acc + p.empleados, 0);
  const totalCap = pendientes.reduce((acc, p) => acc + p.capturadas, 0);

  // Construir cuerpo legible
  const lineas = pendientes
    .slice(0, 4)
    .map((p) => `${p.sede_abrev}/${p.jornada}: ${p.capturadas}/${p.empleados}`);
  const masSi = pendientes.length > 4 ? `… y ${pendientes.length - 4} más` : "";
  const bodyResumen = `Te faltan ${totalFalta} de ${totalEmp} empleados en ${fecha}. ` + [...lineas, masSi].filter(Boolean).join(" · ");

  // Push a TODOS los dispositivos del usuario (un solo usuario)
  const result = await sendPush(
    {
      title: `Vortex · ${totalFalta} pendientes por capturar`,
      body: bodyResumen,
      url: `/pase-lista?fecha=${fecha}`,
      tag: `pendientes-${usuarioId}-${fecha}`,
      icon: "/icons/icon-192.png",
      requireInteraction: true,
      data: { fecha, totalFalta, totalEmp, totalCap },
    },
    [usuarioId],
    "recordatorio_manual_supervisor",
  ).catch((e) => {
    console.error("[notificar-pendientes] sendPush threw:", e);
    return { enviados: 0, fallidos: 0, detalles: [{ usuario_id: usuarioId, ok: false, razon: e instanceof Error ? e.message : "error" }] };
  });

  // Resumen para retornar al cliente (lo mostramos en la UI)
  const resumen = `${totalFalta} pendientes · ${pendientes.length} combo${pendientes.length === 1 ? "" : "s"} sede×jornada incompletas`;

  return {
    ok: true,
    enviados: result.enviados,
    fallidos: result.fallidos,
    resumen,
  };
}
