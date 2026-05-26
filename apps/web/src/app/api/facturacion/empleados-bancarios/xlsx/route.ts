import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EmpleadoBancario {
  id: string;
  numero_empleado: string;
  nombre: string;
  sede_id: string;
  sede_abrev: string;
  sede_nombre: string;
  jornada: string;
  rfc: string | null;
  nss: string | null;
  curp: string | null;
  telefono: string | null;
  email_personal: string | null;
  banco: string | null;
  cuenta_bancaria: string | null;
  clabe: string | null;
  salario_diario: number;
  activo: boolean;
  fecha_alta: string;
  fecha_baja: string | null;
  completo_bancario: boolean;
  faltantes: string | null;
}

const COLOR_BG = "FF0A1428";
const COLOR_GOLD_DEEP = "FF85692A";
const COLOR_HEADER_TEXT = "FFFFFFFF";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol, nombre, acceso_facturacion")
    .eq("id", user.id)
    .single<{ rol: string; nombre: string; acceso_facturacion: boolean }>();
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 403 });

  const esAdminLike = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(perfil.rol);
  const tieneAcceso = perfil.acceso_facturacion === true;
  if (!esAdminLike && !tieneAcceso) {
    return NextResponse.json({ error: "Acceso restringido (requiere acceso_facturacion)" }, { status: 403 });
  }

  const url = new URL(req.url);
  const sedeId = url.searchParams.get("sede"); // null = todas
  const soloConDatos = url.searchParams.get("solo_con_datos") === "1";

  const { data, error } = await supabase.rpc("empleados_bancarios_por_sede", {
    p_sede: sedeId,
    p_solo_con_datos: soloConDatos,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as EmpleadoBancario[];

  // ─── Workbook ───
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vortex · MHS Integradora";
  wb.created = new Date();
  wb.title = "Empleados — Datos bancarios";

  // Hoja 1: Listado para depósito
  const ws = wb.addWorksheet("Depósitos", { views: [{ state: "frozen", ySplit: 4 }] });
  ws.columns = [
    { header: "Sede", key: "sede", width: 8 },
    { header: "#", key: "numero", width: 7 },
    { header: "Empleado", key: "nombre", width: 36 },
    { header: "Banco", key: "banco", width: 16 },
    { header: "Cuenta", key: "cuenta", width: 18 },
    { header: "CLABE", key: "clabe", width: 22 },
    { header: "RFC", key: "rfc", width: 15 },
    { header: "NSS", key: "nss", width: 13 },
    { header: "Salario/día", key: "salario", width: 12 },
    { header: "Datos faltantes", key: "faltantes", width: 24 },
  ];

  // Branding header (insertar 3 filas arriba)
  ws.spliceRows(1, 0, [], [], []);

  ws.mergeCells(1, 1, 1, 10);
  const r1 = ws.getRow(1);
  r1.height = 28;
  r1.getCell(1).value = "VORTEX · MHS INTEGRADORA · Empleados para depósito de nómina";
  r1.getCell(1).font = { bold: true, size: 14, color: { argb: COLOR_BG } };
  r1.getCell(1).alignment = { vertical: "middle", horizontal: "left" };

  ws.mergeCells(2, 1, 2, 10);
  const sedeLabel = sedeId
    ? rows[0]?.sede_abrev ? `Sede: ${rows[0].sede_abrev} (${rows[0].sede_nombre})` : "Sede seleccionada"
    : "Todas las sedes";
  ws.getRow(2).getCell(1).value = `${sedeLabel} · ${rows.length} empleados activos · Generado ${new Date().toLocaleString("es-MX")} por ${perfil.nombre}`;
  ws.getRow(2).getCell(1).font = { italic: true, size: 9, color: { argb: COLOR_GOLD_DEEP } };

  ws.mergeCells(3, 1, 3, 10);
  ws.getRow(3).getCell(1).value = "Confidencial. Solo para uso interno de Facturación · No compartir fuera de la empresa.";
  ws.getRow(3).getCell(1).font = { size: 8, color: { argb: "FFAA6F1A" } };

  // Header row (row 4 — automático con columns; reaplicamos estilo)
  const headerRow = ws.getRow(4);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLOR_HEADER_TEXT }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BG } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFC9A961" } },
    };
  });

  // Data rows
  let totalBancariosCompletos = 0;
  for (const e of rows) {
    if (e.completo_bancario) totalBancariosCompletos++;
    const row = ws.addRow({
      sede: e.sede_abrev,
      numero: e.numero_empleado,
      nombre: e.nombre,
      banco: e.banco ?? "",
      cuenta: e.cuenta_bancaria ?? "",
      clabe: e.clabe ?? "",
      rfc: e.rfc ?? "",
      nss: e.nss ?? "",
      salario: e.salario_diario,
      faltantes: e.faltantes ?? "",
    });
    row.height = 18;
    row.eachCell((cell, colNumber) => {
      cell.alignment = { horizontal: colNumber === 3 ? "left" : "center", vertical: "middle" };
      cell.font = { size: 10, color: { argb: "FF0A1428" } };
      cell.border = {
        top: { style: "hair", color: { argb: "FFE8E8E8" } },
        bottom: { style: "hair", color: { argb: "FFE8E8E8" } },
      };
    });
    // CLABE en font monoespaciada visualmente (negrita)
    row.getCell(6).font = { name: "Consolas", size: 10, bold: true, color: { argb: "FF0A1428" } };
    row.getCell(5).font = { name: "Consolas", size: 10, color: { argb: "FF0A1428" } };
    // Salario con formato money
    row.getCell(9).numFmt = '"$"#,##0.00';
    // Si faltan datos → fila ámbar
    if (!e.completo_bancario) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF6E1" } };
      });
      row.getCell(10).font = { size: 9, color: { argb: "FFAA6F1A" }, italic: true };
    }
  }

  // Fila resumen
  const summaryRow = ws.addRow({
    sede: "",
    numero: "",
    nombre: `TOTAL: ${rows.length} empleados · ${totalBancariosCompletos} listos para depósito · ${rows.length - totalBancariosCompletos} incompletos`,
  });
  ws.mergeCells(summaryRow.number, 3, summaryRow.number, 10);
  summaryRow.height = 22;
  summaryRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLOR_HEADER_TEXT }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_GOLD_DEEP } };
    cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  });

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 10 } };

  // ─── Hoja 2: Layout simplificado para banco (formato típico SPEI) ───
  const wsBanco = wb.addWorksheet("Layout SPEI", { views: [{ state: "frozen", ySplit: 1 }] });
  wsBanco.columns = [
    { header: "clabe_destino", key: "clabe", width: 22 },
    { header: "nombre_beneficiario", key: "nombre", width: 36 },
    { header: "monto", key: "monto", width: 12 },
    { header: "concepto", key: "concepto", width: 30 },
    { header: "referencia", key: "referencia", width: 14 },
  ];
  const hb = wsBanco.getRow(1);
  hb.font = { bold: true, color: { argb: COLOR_HEADER_TEXT } };
  hb.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BG } };
  hb.height = 20;
  hb.alignment = { horizontal: "center", vertical: "middle" };

  for (const e of rows.filter((r) => r.completo_bancario)) {
    const row = wsBanco.addRow({
      clabe: e.clabe,
      nombre: e.nombre,
      monto: 0, // dejado en blanco; nómina lo llena
      concepto: `Nomina ${new Date().toLocaleString("es-MX", { month: "long", year: "numeric" })}`,
      referencia: e.numero_empleado,
    });
    row.getCell(1).font = { name: "Consolas", bold: true };
    row.getCell(3).numFmt = '"$"#,##0.00';
  }
  wsBanco.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };

  // ─── Hoja 3: Incompletos (los que faltan llenar) ───
  const wsIncomp = wb.addWorksheet("Incompletos");
  wsIncomp.columns = [
    { header: "Sede", key: "sede", width: 8 },
    { header: "#", key: "numero", width: 7 },
    { header: "Empleado", key: "nombre", width: 36 },
    { header: "Faltan", key: "faltantes", width: 30 },
  ];
  wsIncomp.getRow(1).font = { bold: true, color: { argb: COLOR_HEADER_TEXT } };
  wsIncomp.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BG } };
  for (const e of rows.filter((r) => !r.completo_bancario)) {
    wsIncomp.addRow({
      sede: e.sede_abrev,
      numero: e.numero_empleado,
      nombre: e.nombre,
      faltantes: e.faltantes ?? "",
    });
  }

  const sedeNombreFile = sedeId && rows[0] ? `_${rows[0].sede_abrev}` : "_TODAS";
  const fecha = new Date().toISOString().slice(0, 10);
  const filename = `Vortex_Empleados_Bancarios${sedeNombreFile}_${fecha}.xlsx`;

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
