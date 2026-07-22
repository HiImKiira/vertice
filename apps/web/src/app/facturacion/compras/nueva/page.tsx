import { requireUser, blockCoordinacion } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NuevaCompraClient, type SedeOpt, type ProductoOpt } from "./NuevaCompraClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Solicitar compra" };

export default async function NuevaCompraPage() {
  const { profile } = await requireUser();
  blockCoordinacion(profile.rol);
  const supabase = await createSupabaseServerClient();

  const [{ data: sedes }, { data: productos }] = await Promise.all([
    supabase
      .from("sedes")
      .select("id, abrev, nombre")
      .or("activa.is.null,activa.eq.true")
      .order("abrev"),
    supabase
      .from("productos")
      .select("id, sku, nombre, unidad, precio_unitario")
      .eq("activo", true)
      .order("nombre"),
  ]);

  return (
    <NuevaCompraClient
      sedes={(sedes ?? []) as SedeOpt[]}
      productos={(productos ?? []) as ProductoOpt[]}
    />
  );
}
