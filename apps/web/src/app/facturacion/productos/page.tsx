import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccesoFacturacion } from "@/lib/facturacion-gate";
import { ProductosClient, type ProductoRow } from "./ProductosClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Productos · Facturación" };

export default async function ProductosPage() {
  await requireAccesoFacturacion();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("productos")
    .select("id, sku, nombre, descripcion, unidad, precio_unitario, iva_pct, categoria, stock_actual, stock_minimo, proveedor, activo, notas")
    .order("nombre");
  return <ProductosClient initial={(data ?? []) as ProductoRow[]} />;
}
