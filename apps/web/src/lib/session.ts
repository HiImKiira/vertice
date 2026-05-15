import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TopbarUser } from "@/components/Topbar";

/**
 * Carga el usuario autenticado + perfil. Redirige a /login si no hay sesión.
 * Devuelve datos comunes que la topbar y guards de rol necesitan.
 */
export async function requireUser(): Promise<{ id: string; profile: TopbarUser & { email: string; nombre: string } }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("usuarios")
    .select("username, email, nombre, rol")
    .eq("id", user.id)
    .single<{ username: string; email: string; nombre: string; rol: TopbarUser["rol"] }>();

  if (!profile) redirect("/login");

  return { id: user.id, profile };
}

export function isAdminLike(rol: TopbarUser["rol"]): boolean {
  return rol === "ADMIN" || rol === "SUPERADMIN" || rol === "CEO" || rol === "SOPORTE";
}

export function requireAdminLike(rol: TopbarUser["rol"]): void {
  if (!isAdminLike(rol)) redirect("/dashboard");
}
