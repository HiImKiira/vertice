import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/empleados/import-template
 *
 * Descarga un xlsx con:
 *  - Hoja "Empleados" con headers + 2 filas de ejemplo
 *  - Hoja "Sedes" con la lista de abreviaturas válidas (referencia)
 *  - Hoja "Instrucciones" con guía rápida
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "SOPORTE", "CEO"].includes(perfil.rol)) {
    return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
  }

  const { data: sedes } = await supabase
    .from("sedes")
    .select("abrev, nombre")
    .or("activa.is.null,activa.eq.true")
    .order("abrev");

  const wb = new ExcelJS.Workbook();
  wb.creator = "Vortex · MHS Integradora";
  wb.title = "Template import empleados";

  // ─── Hoja Empleados ───
  const ws = wb.addWorksheet("Empleados", { properties: { defaultColWidth: 18 } });
  ws.columns = [
    { header: "numero_empleado", key: "numero", width: 16 },
    { header: "nombre", key: "nombre", width: 32 },
    { header: "sede", key: "sede", width: 12 },
    { header: "jornada", key: "jornada", width: 16 },
    { header: "dia_descanso", key: "diaDesc", width: 14 },
    { header: "salario_diario", key: "salario", width: 14 },
    { header: "fecha_alta", key: "fechaAlta", width: 14 },
  ];

  // Estilo header
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A1428" } };
  headerRow.height = 22;
  headerRow.alignment = { horizontal: "center", vertical: "middle" };

  // Marcar visualmente requeridos vs opcionales en la fila 2
  const labelsRow = ws.addRow({
    numero: "(opcional)",
    nombre: "REQUERIDO",
    sede: "REQUERIDO",
    jornada: "REQUERIDO",
    diaDesc: "(opcional, default DOM)",
    salario: "(opcional, default 315.04)",
    fechaAlta: "(opcional, default hoy)",
  });
  labelsRow.eachCell((cell) => {
    cell.font = { italic: true, size: 8, color: { argb: "FF85692A" } };
    cell.alignment = { horizontal: "center" };
  });

  // 2 filas de ejemplo
  const ejemploSede = sedes?.[0]?.abrev ?? "SHO";
  ws.addRow({
    numero: "",
    nombre: "PEREZ GARCIA JUAN",
    sede: ejemploSede,
    jornada: "MATUTINO",
    diaDesc: "DOM",
    salario: 315.04,
    fechaAlta: new Date().toISOString().slice(0, 10),
  });
  ws.addRow({
    numero: "501",
    nombre: "LOPEZ MARTINEZ MARIA",
    sede: ejemploSede,
    jornada: "VESPERTINO",
    diaDesc: "SAB",
    salario: 350,
    fechaAlta: new Date().toISOString().slice(0, 10),
  });

  // Bordes ligeros
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "hair", color: { argb: "FFE8E8E8" } },
        bottom: { style: "hair", color: { argb: "FFE8E8E8" } },
        left: { style: "hair", color: { argb: "FFE8E8E8" } },
        right: { style: "hair", color: { argb: "FFE8E8E8" } },
      };
    });
  });

  // Freeze header
  ws.views = [{ state: "frozen", ySplit: 2 }];

  // ─── Hoja Sedes (referencia) ───
  const wsSedes = wb.addWorksheet("Sedes válidas", { properties: { defaultColWidth: 16 } });
  wsSedes.columns = [
    { header: "abrev", key: "abrev", width: 10 },
    { header: "nombre completo", key: "nombre", width: 50 },
  ];
  wsSedes.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  wsSedes.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A1428" } };
  for (const s of sedes ?? []) {
    wsSedes.addRow({ abrev: s.abrev, nombre: s.nombre });
  }

  // ─── Hoja Instrucciones ───
  const wsInst = wb.addWorksheet("Instrucciones");
  wsInst.columns = [{ header: "", width: 90 }];
  const lineas = [
    ["IMPORT MASIVO DE EMPLEADOS — VORTEX"],
    [""],
    ["1. Llena la hoja 'Empleados' con tus datos."],
    ["2. Las columnas con 'REQUERIDO' son obligatorias. Las demás tienen defaults."],
    ["3. La columna 'sede' debe coincidir con una abreviatura de la hoja 'Sedes válidas'."],
    ["4. Jornadas válidas: MATUTINO, VESPERTINO, NOCTURNO, DIURNO, TURNO_ROTATIVO, CUBRETURNOS."],
    ["5. dia_descanso acepta: DOM, LUN, MAR, MIE, JUE, VIE, SAB (o nombres completos)."],
    ["6. Si dejas numero_empleado vacío, el sistema lo auto-asigna empezando en 400+."],
    ["7. Si proporcionas un numero_empleado que YA existe, se ACTUALIZARÁ ese empleado."],
    [""],
    ["8. Guarda el archivo y súbelo en Vortex → RH Pro → Empleados → Import masivo."],
    ["9. Verás un preview con validaciones antes de confirmar la importación."],
    [""],
    ["Soporte: edy@vertice.mhs.local — by Vortex"],
  ];
  for (const l of lineas) wsInst.addRow(l);
  wsInst.getRow(1).font = { bold: true, size: 14, color: { argb: "FF85692A" } };

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Vortex_Template_Empleados.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
