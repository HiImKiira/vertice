"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
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
  if (!user) return { sb: null, userId: null, rol: null, error: "Sin sesión" };
  const { data: perfil } = await supabase
    .from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol)) {
    return { sb: null, userId: null, rol: null, error: "Solo admin/superadmin/soporte" };
  }
  return { sb: supabase, userId: user.id, rol: perfil.rol, error: null };
}

async function requireSuperOrSoporte() {
  const auth = await requireAdminLike();
  if (!auth.sb) return auth;
  if (!["SUPERADMIN", "SOPORTE"].includes(auth.rol ?? "")) {
    return { sb: null, userId: null, rol: null, error: "Solo SUPERADMIN o SOPORTE" };
  }
  return auth;
}

function generarPassword(): string {
  // 10 caracteres alfanuméricos seguros, fáciles de leer
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  let pwd = "";
  for (let i = 0; i < bytes.length; i++) pwd += alfabeto[bytes[i]! % alfabeto.length];
  return pwd;
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

// ─────────────────────────────────────────────────────────────────────
// VACACIONES / AUSENCIA
// ─────────────────────────────────────────────────────────────────────
export async function marcarAusenciaAction(input: {
  supervisorId: string;
  desde: string;   // YYYY-MM-DD
  hasta: string;
  motivo?: string;
}): Promise<SupResult> {
  const auth = await requireSuperOrSoporte();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.desde) || !/^\d{4}-\d{2}-\d{2}$/.test(input.hasta)) {
    return { ok: false, error: "Fechas inválidas (formato YYYY-MM-DD)" };
  }
  if (input.desde > input.hasta) {
    return { ok: false, error: "'Desde' no puede ser mayor que 'Hasta'" };
  }

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("usuarios")
    .update({
      ausente_desde: input.desde,
      ausente_hasta: input.hasta,
      ausente_motivo: input.motivo?.trim() || null,
      ausencia_marcada_por: auth.userId,
      ausencia_marcada_en: new Date().toISOString(),
    })
    .eq("id", input.supervisorId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/rh-pro/supervisores/${input.supervisorId}`);
  revalidatePath("/rh-pro/supervisores");
  return { ok: true };
}

export async function quitarAusenciaAction(supervisorId: string): Promise<SupResult> {
  const auth = await requireSuperOrSoporte();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("usuarios")
    .update({
      ausente_desde: null,
      ausente_hasta: null,
      ausente_motivo: null,
      ausencia_marcada_por: null,
      ausencia_marcada_en: null,
    })
    .eq("id", supervisorId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/rh-pro/supervisores/${supervisorId}`);
  revalidatePath("/rh-pro/supervisores");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// RESET PASSWORD
// ─────────────────────────────────────────────────────────────────────
export type ResetResult =
  | { ok: true; password: string }
  | { ok: false; error: string };

export async function resetPasswordSupervisorAction(supervisorId: string): Promise<ResetResult> {
  const auth = await requireSuperOrSoporte();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };

  const admin = supabaseAdmin();
  // Verificar que existe y traer username/email para feedback
  const { data: target } = await admin
    .from("usuarios").select("id, nombre, username, email").eq("id", supervisorId).single<{ id: string; nombre: string; username: string; email: string }>();
  if (!target) return { ok: false, error: "Usuario no encontrado" };

  const nueva = generarPassword();

  const { error: authErr } = await admin.auth.admin.updateUserById(supervisorId, { password: nueva });
  if (authErr) return { ok: false, error: `Auth: ${authErr.message}` };

  // Log opcional (en notify_log para auditoría unificada)
  await admin.from("notify_log").insert({
    usuario_id: supervisorId,
    tipo: "reset_password",
    titulo: "Password reseteado",
    cuerpo: `Reset por @${auth.userId}`,
    resultado: "enviado",
    detalle: `target=${target.username}`,
  });

  revalidatePath(`/rh-pro/supervisores/${supervisorId}`);
  return { ok: true, password: nueva };
}

// ─────────────────────────────────────────────────────────────────────
// ACCESO FACTURACIÓN (toggle de flag por supervisor)
// ─────────────────────────────────────────────────────────────────────
export async function toggleAccesoFacturacionAction(
  supervisorId: string,
  habilitar: boolean,
): Promise<SupResult> {
  const auth = await requireSuperOrSoporte();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("usuarios")
    .update({ acceso_facturacion: habilitar })
    .eq("id", supervisorId);
  if (error) return { ok: false, error: error.message };

  // Push informativo al usuario afectado (fire-and-forget)
  void sendPush(
    {
      title: habilitar ? "Acceso a Facturación habilitado" : "Acceso a Facturación retirado",
      body: habilitar
        ? "Ya puedes entrar al módulo de Facturación desde Vortex."
        : "Tu acceso al módulo de Facturación fue retirado.",
      url: habilitar ? "/facturacion" : "/dashboard",
      tag: `acceso-fac-${supervisorId}-${Date.now()}`,
      icon: "/icons/icon-192.png",
    },
    [supervisorId],
    "acceso_facturacion",
  ).catch(() => {});

  revalidatePath(`/rh-pro/supervisores/${supervisorId}`);
  revalidatePath("/rh-pro/supervisores");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// CREAR / EDITAR / ELIMINAR supervisor (usuario)
// ─────────────────────────────────────────────────────────────────────
const ROLES_VALIDOS = ["USER", "ADMIN", "SUPERADMIN", "CEO", "SOPORTE"] as const;
type RolValido = (typeof ROLES_VALIDOS)[number];

export type CrearSupResult =
  | { ok: true; id: string; password: string; username: string }
  | { ok: false; error: string };

/**
 * Crea un nuevo supervisor (auth user + fila en usuarios) y devuelve la
 * password temporal generada. Solo SUPERADMIN/SOPORTE pueden hacerlo.
 *
 * Si la inserción en `usuarios` falla, hace rollback del auth user para
 * no dejar registros huérfanos.
 */
export async function crearSupervisorAction(input: {
  email: string;
  nombre: string;
  username?: string | undefined;
  rol: RolValido;
  acceso_facturacion?: boolean | undefined;
}): Promise<CrearSupResult> {
  const auth = await requireSuperOrSoporte();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };

  const email = input.email.trim().toLowerCase();
  const nombre = input.nombre.trim();
  const rol = input.rol;
  const username = (input.username?.trim() || email.split("@")[0] || "").toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Email inválido" };
  if (!nombre) return { ok: false, error: "Nombre requerido" };
  if (!username || username.length < 2) return { ok: false, error: "Username inválido" };
  if (!ROLES_VALIDOS.includes(rol)) return { ok: false, error: "Rol inválido" };

  const admin = supabaseAdmin();

  // 1) Verificar que no exista (email o username)
  const { data: existeEmail } = await admin
    .from("usuarios").select("id").ilike("email", email).maybeSingle<{ id: string }>();
  if (existeEmail) return { ok: false, error: `Ya existe un usuario con email ${email}` };
  const { data: existeUser } = await admin
    .from("usuarios").select("id").ilike("username", username).maybeSingle<{ id: string }>();
  if (existeUser) return { ok: false, error: `Ya existe el username @${username}` };

  // 2) Crear auth user con password temporal
  const password = generarPassword();
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr || !created.user) {
    return { ok: false, error: `Auth: ${authErr?.message ?? "no se creó usuario"}` };
  }
  const userId = created.user.id;

  // 3) Insertar en usuarios
  const { error: insErr } = await admin.from("usuarios").insert({
    id: userId,
    email,
    username,
    nombre,
    rol,
    activo: true,
    acceso_facturacion: input.acceso_facturacion === true,
  });
  if (insErr) {
    // Rollback del auth user
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return { ok: false, error: `Insert usuarios: ${insErr.message}` };
  }

  revalidatePath("/rh-pro/supervisores");
  return { ok: true, id: userId, password, username };
}

/**
 * Edita datos básicos del supervisor (nombre, username, email, rol, activo).
 * - Cambiar rol o `activo` requiere SUPERADMIN/SOPORTE.
 * - El resto cualquier admin-like.
 *
 * Si cambia el email, también lo actualiza en auth.users.
 */
export async function actualizarSupervisorAction(
  supervisorId: string,
  patch: {
    nombre?: string | undefined;
    username?: string | undefined;
    email?: string | undefined;
    rol?: RolValido | undefined;
    activo?: boolean | undefined;
  },
): Promise<SupResult> {
  const auth = await requireAdminLike();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };

  const cambiosSensibles = patch.rol !== undefined || patch.activo !== undefined;
  if (cambiosSensibles && !["SUPERADMIN", "SOPORTE"].includes(auth.rol ?? "")) {
    return { ok: false, error: "Cambiar rol o estado activo requiere SUPERADMIN/SOPORTE" };
  }

  const admin = supabaseAdmin();
  const update: Record<string, unknown> = {};
  if (patch.nombre !== undefined) {
    const v = patch.nombre.trim();
    if (!v) return { ok: false, error: "Nombre vacío" };
    update.nombre = v;
  }
  if (patch.username !== undefined) {
    const v = patch.username.trim().toLowerCase();
    if (v.length < 2) return { ok: false, error: "Username inválido" };
    // Verificar que no choque con otro
    const { data: existe } = await admin
      .from("usuarios").select("id").ilike("username", v).neq("id", supervisorId).maybeSingle<{ id: string }>();
    if (existe) return { ok: false, error: `Username @${v} ya está en uso` };
    update.username = v;
  }
  let emailNuevo: string | null = null;
  if (patch.email !== undefined) {
    const v = patch.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { ok: false, error: "Email inválido" };
    const { data: existe } = await admin
      .from("usuarios").select("id").ilike("email", v).neq("id", supervisorId).maybeSingle<{ id: string }>();
    if (existe) return { ok: false, error: `Email ${v} ya está en uso` };
    update.email = v;
    emailNuevo = v;
  }
  if (patch.rol !== undefined) {
    if (!ROLES_VALIDOS.includes(patch.rol)) return { ok: false, error: "Rol inválido" };
    update.rol = patch.rol;
  }
  if (patch.activo !== undefined) update.activo = patch.activo;

  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await admin.from("usuarios").update(update).eq("id", supervisorId);
  if (error) return { ok: false, error: error.message };

  // Si cambió email, actualizar también en auth.users
  if (emailNuevo) {
    const { error: authErr } = await admin.auth.admin.updateUserById(supervisorId, { email: emailNuevo, email_confirm: true });
    if (authErr) {
      // No es fatal — pero avisamos. La fila ya está actualizada.
      return { ok: false, error: `Datos guardados pero auth no se sincronizó: ${authErr.message}. Actualízalo manualmente.` };
    }
  }

  revalidatePath(`/rh-pro/supervisores/${supervisorId}`);
  revalidatePath("/rh-pro/supervisores");
  return { ok: true };
}

/**
 * "Eliminar" un supervisor.
 * - Si NO tiene capturas / asignaciones / tickets → eliminación dura (DELETE).
 * - Si tiene historial → soft-delete (activo = false) para preservar auditoría.
 * Solo SUPERADMIN/SOPORTE.
 */
export type EliminarSupResult =
  | { ok: true; modo: "hard" | "soft"; razon?: string }
  | { ok: false; error: string };

export async function eliminarSupervisorAction(supervisorId: string): Promise<EliminarSupResult> {
  const auth = await requireSuperOrSoporte();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };
  if (supervisorId === auth.userId) return { ok: false, error: "No puedes eliminarte a ti mismo" };

  const admin = supabaseAdmin();

  // ¿Tiene historial? — capturas, tickets, asignaciones, asistencias capturadas
  const [{ count: nCapturas }, { count: nTickets }, { count: nAsign }] = await Promise.all([
    admin.from("asistencias").select("id", { count: "exact", head: true }).eq("capturado_por", supervisorId),
    admin.from("tickets_soporte").select("id", { count: "exact", head: true }).eq("supervisor_id", supervisorId),
    admin.from("asignaciones_supervisor").select("id", { count: "exact", head: true }).eq("usuario_id", supervisorId),
  ]);

  const tieneHistorial = (nCapturas ?? 0) > 0 || (nTickets ?? 0) > 0 || (nAsign ?? 0) > 0;

  if (tieneHistorial) {
    // Soft-delete: desactivar usuario + desactivar todas sus asignaciones
    const { error: e1 } = await admin.from("usuarios").update({ activo: false }).eq("id", supervisorId);
    if (e1) return { ok: false, error: e1.message };
    await admin.from("asignaciones_supervisor").update({ activo: false }).eq("usuario_id", supervisorId);
    // Desactivar suscripciones push para que no le sigan llegando notificaciones
    await admin.from("push_subscriptions").update({ activo: false }).eq("usuario_id", supervisorId);

    revalidatePath("/rh-pro/supervisores");
    revalidatePath(`/rh-pro/supervisores/${supervisorId}`);
    return {
      ok: true,
      modo: "soft",
      razon: `Tiene historial (${nCapturas ?? 0} capturas, ${nTickets ?? 0} tickets, ${nAsign ?? 0} asignaciones). Desactivado en lugar de borrar para preservar auditoría.`,
    };
  }

  // Hard delete: sin historial, podemos borrar limpio
  await admin.from("push_subscriptions").delete().eq("usuario_id", supervisorId);
  const { error: e1 } = await admin.from("usuarios").delete().eq("id", supervisorId);
  if (e1) return { ok: false, error: e1.message };
  const { error: e2 } = await admin.auth.admin.deleteUser(supervisorId);
  if (e2) return { ok: false, error: `Usuarios borrado pero auth falló: ${e2.message}` };

  revalidatePath("/rh-pro/supervisores");
  return { ok: true, modo: "hard" };
}

// ─────────────────────────────────────────────────────────────────────
// ASIGNACIONES (sede × jornada) — agregar/quitar desde detalle supervisor
// ─────────────────────────────────────────────────────────────────────
type Jornada = "MATUTINO" | "VESPERTINO" | "NOCTURNO" | "TURNO_ROTATIVO" | "CUBRETURNOS" | "DIURNO";

export async function agregarAsignacionSupervisorAction(input: {
  supervisorId: string;
  sedeId: string;
  jornada: Jornada;
}): Promise<SupResult> {
  const auth = await requireAdminLike();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };
  if (!input.supervisorId || !input.sedeId || !input.jornada) return { ok: false, error: "Faltan campos" };

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("asignaciones_supervisor")
    .upsert({
      usuario_id: input.supervisorId,
      sede_id: input.sedeId,
      jornada: input.jornada,
      activo: true,
      creado_por: auth.userId,
    }, { onConflict: "usuario_id,sede_id,jornada" });

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/rh-pro/supervisores/${input.supervisorId}`);
  revalidatePath("/rh-pro/supervisores");
  revalidatePath("/rh-pro");
  return { ok: true };
}

export async function eliminarAsignacionSupervisorAction(input: {
  supervisorId: string;
  asignacionId: string;
}): Promise<SupResult> {
  const auth = await requireAdminLike();
  if (!auth.sb || !auth.userId) return { ok: false, error: auth.error ?? "Sin permisos" };

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("asignaciones_supervisor")
    .update({ activo: false })
    .eq("id", input.asignacionId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/rh-pro/supervisores/${input.supervisorId}`);
  revalidatePath("/rh-pro/supervisores");
  revalidatePath("/rh-pro");
  return { ok: true };
}
