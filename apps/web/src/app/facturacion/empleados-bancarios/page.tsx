import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccesoFacturacion } from "@/lib/facturacion-gate";
import { EmpleadosBancariosClient, type SedeRow, type EmpleadoBancarioRow } from "./EmpleadosBancariosClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Empleados · Datos bancarios" };

export default async function EmpleadosBancariosPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string }>;
}) {
  await requireAccesoFacturacion();
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const sedeId = params.sede ?? "";

  const [{ data: sedesRaw }, { data: empleadosRaw }] = await Promise.all([
    supabase
      .from("sedes")
      .select("id, abrev, nombre")
      .or("activa.is.null,activa.eq.true")
      .order("abrev"),
    supabase.rpc("empleados_bancarios_por_sede", {
      p_sede: sedeId || null,
      p_solo_con_datos: false,
    }),
  ]);

  const sedes = (sedesRaw ?? []) as SedeRow[];
  const empleados = (empleadosRaw ?? []) as EmpleadoBancarioRow[];

  return <EmpleadosBancariosClient sedes={sedes} empleados={empleados} sedeIdInicial={sedeId} />;
}
