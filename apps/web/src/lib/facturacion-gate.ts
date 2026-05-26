import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Verifica que el usuario actual tenga acceso al módulo de facturación.
 * Acceso si: rol in (SUPERADMIN, SOPORTE, CEO) o usuarios.acceso_facturacion = true.
 * Redirige a /dashboard si no.
 */
export async function requireAccesoFacturacion(): Promise<{
  userId: string;
  rol: string;
  nombre: string;
  esAdminLike: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol, nombre, acceso_facturacion")
    .eq("id", user.id)
    .single<{ rol: string; nombre: string; acceso_facturacion: boolean }>();

  if (!perfil) redirect("/login");

  const esAdminLike = ["SUPERADMIN", "SOPORTE", "CEO"].includes(perfil.rol);
  const tieneFlag = perfil.acceso_facturacion === true;
  if (!esAdminLike && !tieneFlag) redirect("/dashboard");

  return { userId: user.id, rol: perfil.rol, nombre: perfil.nombre, esAdminLike };
}
