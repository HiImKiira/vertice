import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccesoFacturacion } from "@/lib/facturacion-gate";
import { NuevaCotizacionClient, type ClienteOpt, type ProductoOpt } from "./NuevaCotizacionClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nueva cotización" };

export default async function NuevaCotizacionPage() {
  await requireAccesoFacturacion();
  const supabase = await createSupabaseServerClient();
  const [{ data: clientes }, { data: productos }] = await Promise.all([
    supabase
      .from("clientes_cotizacion")
      .select("id, razon_social, rfc")
      .eq("activo", true)
      .order("razon_social"),
    supabase
      .from("productos")
      .select("id, sku, nombre, unidad, precio_unitario, iva_pct")
      .eq("activo", true)
      .order("nombre"),
  ]);
  return (
    <NuevaCotizacionClient
      clientes={(clientes ?? []) as ClienteOpt[]}
      productos={(productos ?? []) as ProductoOpt[]}
    />
  );
}
