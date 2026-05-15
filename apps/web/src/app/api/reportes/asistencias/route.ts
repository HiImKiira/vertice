import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AsistenciasDoc } from "@/lib/pdf/AsistenciasDoc";
import { fetchSede, fetchEmpleadosActivos, fetchMarcas, rangeDates, quincenaRange } from "@/lib/pdf/fetchPeriodData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol, nombre, username")
    .eq("id", user.id)
    .single<{ rol: string; nombre: string; username: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol)) {
    return NextResponse.json({ error: "Acceso restringido." }, { status: 403 });
  }

  const url = new URL(req.url);
  const sedeId = url.searchParams.get("sede");
  const rango = url.searchParams.get("rango") || "Q1"; // "Q1" | "Q2" | "MES" | "CUSTOM"
  const mes = url.searchParams.get("mes");
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");

  if (!sedeId) {
    return NextResponse.json({ error: "Falta parámetro sede" }, { status: 400 });
  }

  let start = "";
  let end = "";
  let rangoLabel = "";

  if (rango === "CUSTOM") {
    if (!startParam || !endParam) {
      return NextResponse.json({ error: "rango=CUSTOM requiere start y end (YYYY-MM-DD)" }, { status: 400 });
    }
    start = startParam;
    end = endParam;
    rangoLabel = `${start} → ${end}`;
  } else {
    if (!mes?.match(/^\d{4}-\d{2}$/)) {
      return NextResponse.json({ error: "mes=YYYY-MM requerido para Q1/Q2/MES" }, { status: 400 });
    }
    if (rango === "MES") {
      const parts = mes.split("-");
      const y = Number(parts[0]!);
      const m = Number(parts[1]!);
      const lastDay = new Date(y, m, 0).getDate();
      start = `${y}-${String(m).padStart(2, "0")}-01`;
      end = `${y}-${String(m).padStart(2, "0")}-${lastDay}`;
      rangoLabel = `${mes} · Mes completo`;
    } else {
      const r = quincenaRange(mes, rango as "Q1" | "Q2");
      start = r.start;
      end = r.end;
      rangoLabel = `${mes} · ${rango}`;
    }
  }

  const sede = await fetchSede(supabase, sedeId);
  if (!sede) return NextResponse.json({ error: "Sede no encontrada" }, { status: 404 });

  const fechas = rangeDates(start, end);
  if (fechas.length > 62) {
    return NextResponse.json({ error: "Rango máximo: 62 días" }, { status: 400 });
  }
  const empleados = await fetchEmpleadosActivos(supabase, sedeId);
  const marcas = await fetchMarcas(supabase, empleados.map((e) => e.id), start, end);

  const buffer = await renderToBuffer(
    AsistenciasDoc({
      sedeNombre: sede.nombre,
      sedeAbrev: sede.abrev,
      fechaInicio: start,
      fechaFin: end,
      rangoLabel,
      fechas,
      empleados,
      marcas,
      generadoPor: perfil.nombre || perfil.username,
      generadoEn: new Date().toISOString(),
    }),
  );

  const filename = `Vertice_Asistencias_${sede.abrev}_${start}_${end}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
