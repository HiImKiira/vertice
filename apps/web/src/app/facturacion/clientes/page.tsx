import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccesoFacturacion } from "@/lib/facturacion-gate";
import { ClientesClient, type ClienteRow } from "./ClientesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clientes · Facturación" };

export default async function ClientesPage() {
  await requireAccesoFacturacion();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clientes_cotizacion")
    .select("id, razon_social, rfc, contacto_nombre, contacto_email, contacto_telefono, direccion, notas, activo")
    .order("razon_social");
  return <ClientesClient initial={(data ?? []) as ClienteRow[]} />;
}
