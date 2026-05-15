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

  // Aceptar email O username. Si no parece email, busca el email asociado.
  let email = identifier;
  if (!identifier.includes("@")) {
    const { data, error } = await supabaseAdmin()
      .from("usuarios")
      .select("email")
      .ilike("username", identifier)
      .eq("activo", true)
      .single();
    if (error || !data) {
      return { ok: false, error: "Usuario no existe o está inactivo." };
    }
    email = data.email;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
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
