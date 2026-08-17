"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type LoginResult = { ok: false; error: string } | { ok: true; redirect: string };

export async function loginAction(formData: FormData): Promise<LoginResult> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!identifier || !password) {
    return { ok: false, error: "Falta usuario y/o contraseña." };
  }

  // Buscar el usuario por email o username (sin filtrar por activo, para poder
  // detectar bajas y mostrar su mensaje). Tolera que la columna mensaje_baja
  // aún no exista (reintenta sin ella) para no romper el login.
  const byEmail = identifier.includes("@");
  async function buscarUsuario(): Promise<{ email: string; activo: boolean; mensaje_baja?: string | null } | null> {
    for (const cols of ["email, activo, mensaje_baja", "email, activo"]) {
      let q = supabaseAdmin().from("usuarios").select(cols);
      q = byEmail ? q.ilike("email", identifier) : q.ilike("username", identifier);
      const { data, error } = await q.maybeSingle();
      if (!error) return (data as unknown as { email: string; activo: boolean; mensaje_baja?: string | null } | null);
    }
    return null;
  }

  const u = await buscarUsuario();
  if (!u) return { ok: false, error: "Usuario no existe." };
  // Dado de baja → mensaje explícito (ej: "Dado de baja por renuncia voluntaria…")
  if (u.mensaje_baja && u.mensaje_baja.trim()) {
    return { ok: false, error: u.mensaje_baja.trim() };
  }
  if (!u.activo) return { ok: false, error: "Tu cuenta está inactiva. Contacta a RH." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: u.email, password });
  if (error) {
    return { ok: false, error: "Credenciales incorrectas." };
  }

  // Redirige (loginAction tira porque el "use server" lo permite)
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
