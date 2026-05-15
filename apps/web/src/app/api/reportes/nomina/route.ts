import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NominaDoc } from "@/lib/pdf/NominaDoc";
import {
  fetchSede,
  fetchEmpleadosActivos,
  fetchMarcas,
  quincenaRange,
  rangeDates,
} from "@/lib/pdf/fetchPeriodData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol, nombre, username")
    .eq("id", user.id)
    .single<{ rol: string; nombre: string; username: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "CEO"].includes(perfil.rol)) {
    return NextResponse.json({ error: "Solo ADMIN/SUPERADMIN/CEO." }, { status: 403 });
  }

  const url = new URL(req.url);
  const sedeId = url.searchParams.get("sede");
  const mes = url.searchParams.get("mes"); // YYYY-MM
  const q = (url.searchParams.get("q") || "Q1") as "Q1" | "Q2";

  if (!sedeId || !mes?.match(/^\d{4}-\d{2}$/)) {
    return NextResponse.json({ error: "Parámetros inválidos (sede, mes=YYYY-MM, q=Q1|Q2)" }, { status: 400 });
  }

  const sede = await fetchSede(supabase, sedeId);
  if (!sede) return NextResponse.json({ error: "Sede no encontrada" }, { status: 404 });

  const { start, end } = quincenaRange(mes, q);
  const fechas = rangeDates(start, end);
  const empleados = await fetchEmpleadosActivos(supabase, sedeId);
  const marcas = await fetchMarcas(
    supabase,
    empleados.map((e) => e.id),
    start,
    end,
  );

  const buffer = await renderToBuffer(
    NominaDoc({
      sedeNombre: sede.nombre,
      sedeAbrev: sede.abrev,
      periodoLabel: `${mes} · ${q}`,
      fechaInicio: start,
      fechaFin: end,
      fechas,
      empleados,
      marcas,
      generadoPor: perfil.nombre || perfil.username,
      generadoEn: new Date().toISOString(),
    }),
  );

  const filename = `Vertice_Nomina_${sede.abrev}_${mes}_${q}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
