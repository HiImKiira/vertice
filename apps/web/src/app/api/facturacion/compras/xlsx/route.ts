import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const esAdminLike = ["SUPERADMIN", "SOPORTE", "CEO"].includes(perfil.rol);
  const esFac = perfil.rol === "FACTURACION";
  const tieneAcceso = perfil.acceso_facturacion === true;
  if (!esAdminLike && !esFac && !tieneAcceso) {
    return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
  }

  const url = new URL(req.url);
  const estadoFiltro = url.searchParams.get("estado"); // null = todos
  const sedeFiltro = url.searchParams.get("sede");
  const desde = url.searchParams.get("desde");
  const hasta = url.searchParams.get("hasta");

  // Fetch solicitudes + items
  let q = supabase
    .from("solicitudes_compra")
    .select(`
      id, folio, motivo, prioridad, estado, total_estimado,
      notas_solicitante, notas_aprobador,
      solicitado_en, aprobado_en, comprado_en, entregado_en,
      usuarios:solicitante_id(nombre),
      aprobador:aprobado_por(nombre),
      sedes(abrev, nombre)
    `)
    .order("solicitado_en", { ascending: false });

  if (estadoFiltro) q = q.eq("estado", estadoFiltro);
  if (sedeFiltro) q = q.eq("sede_id", sedeFiltro);
  if (desde) q = q.gte("solicitado_en", desde);
  if (hasta) q = q.lte("solicitado_en", hasta + "T23:59:59");

  const { data: solicitudes, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type SolRow = {
    id: string; folio: string; motivo: string; prioridad: string; estado: string;
    total_estimado: number; notas_solicitante: string | null; notas_aprobador: string | null;
    solicitado_en: string; aprobado_en: string | null;
    comprado_en: string | null; entregado_en: string | null;
    usuarios: { nombre?: string } | { nombre?: string }[] | null;
    aprobador: { nombre?: string } | { nombre?: string }[] | null;
    sedes: { abrev?: string; nombre?: string } | { abrev?: string; nombre?: string }[] | null;
  };
  const rows = (solicitudes ?? []) as unknown as SolRow[];

  // Fetch items en bulk
  const ids = rows.map((r) => r.id);
  const itemsMap = new Map<string, Array<{ descripcion: string; cantidad: number; unidad: string | null; precio_estimado: number; precio_real: number | null; notas: string | null; orden: number }>>();
  if (ids.length > 0) {
    const { data: items } = await supabase
      .from("solicitud_compra_items")
      .select("solicitud_id, descripcion, cantidad, unidad, precio_estimado, precio_real, notas, orden")
      .in("solicitud_id", ids)
      .order("orden");
    for (const it of (items ?? []) as Array<{ solicitud_id: string; descripcion: string; cantidad: number; unidad: string | null; precio_estimado: number; precio_real: number | null; notas: string | null; orden: number }>) {
      if (!itemsMap.has(it.solicitud_id)) itemsMap.set(it.solicitud_id, []);
      itemsMap.get(it.solicitud_id)!.push({
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        unidad: it.unidad,
        precio_estimado: it.precio_estimado,
        precio_real: it.precio_real,
        notas: it.notas,
        orden: it.orden,
      });
    }
  }

  // ─── Workbook ───
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vortex · MHS Integradora";
  wb.created = new Date();
  wb.title = "Solicitudes de compra";

  // Hoja 1: Resumen de solicitudes
  const ws = wb.addWorksheet("Solicitudes", { views: [{ state: "frozen", ySplit: 4 }] });
  ws.columns = [
    { header: "Folio", key: "folio", width: 16 },
    { header: "Fecha", key: "fecha", width: 12 },
    { header: "Estado", key: "estado", width: 12 },
    { header: "Prioridad", key: "prioridad", width: 10 },
    { header: "Sede", key: "sede", width: 10 },
    { header: "Solicitante", key: "solicitante", width: 26 },
    { header: "Motivo", key: "motivo", width: 40 },
    { header: "Items", key: "n_items", width: 8 },
    { header: "Total estimado", key: "total", width: 14 },
    { header: "Aprobado por", key: "aprobador", width: 20 },
    { header: "Aprobado", key: "aprobado_en", width: 14 },
    { header: "Comprado", key: "comprado_en", width: 14 },
    { header: "Entregado", key: "entregado_en", width: 14 },
  ];

  ws.spliceRows(1, 0, [], [], []);
  ws.mergeCells(1, 1, 1, 13);
  ws.getRow(1).height = 28;
  ws.getRow(1).getCell(1).value = "VORTEX · MHS INTEGRADORA · Solicitudes de compra";
  ws.getRow(1).getCell(1).font = { bold: true, size: 14, color: { argb: COLOR_BG } };
  ws.getRow(1).getCell(1).alignment = { vertical: "middle" };

  ws.mergeCells(2, 1, 2, 13);
  const filtros: string[] = [];
  if (estadoFiltro) filtros.push(`estado=${estadoFiltro}`);
  if (sedeFiltro) filtros.push(`sede=${rows[0]?.sedes ? (Array.isArray(rows[0].sedes) ? rows[0].sedes[0]?.abrev : (rows[0].sedes as { abrev?: string }).abrev) : "?"}`);
  if (desde) filtros.push(`desde=${desde}`);
  if (hasta) filtros.push(`hasta=${hasta}`);
  ws.getRow(2).getCell(1).value = `${rows.length} solicitudes · ${filtros.length > 0 ? "Filtros: " + filtros.join(" · ") : "Sin filtros"} · Generado ${new Date().toLocaleString("es-MX")} por ${perfil.nombre}`;
  ws.getRow(2).getCell(1).font = { italic: true, size: 9, color: { argb: COLOR_GOLD_DEEP } };

  ws.mergeCells(3, 1, 3, 13);
  ws.getRow(3).getCell(1).value = "Sólo para uso interno de Facturación.";
  ws.getRow(3).getCell(1).font = { size: 8, color: { argb: "FFAA6F1A" } };

  // Header row (4)
  const headerRow = ws.getRow(4);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLOR_HEADER_TEXT }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BG } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFC9A961" } } };
  });

  // Data
  let totalGeneral = 0;
  for (const sol of rows) {
    const solic = Array.isArray(sol.usuarios) ? sol.usuarios[0]?.nombre : sol.usuarios?.nombre;
    const aprob = Array.isArray(sol.aprobador) ? sol.aprobador[0]?.nombre : sol.aprobador?.nombre;
    const sede = Array.isArray(sol.sedes) ? sol.sedes[0] : sol.sedes;
    const items = itemsMap.get(sol.id) ?? [];
    const row = ws.addRow({
      folio: sol.folio,
      fecha: sol.solicitado_en.slice(0, 10),
      estado: sol.estado,
      prioridad: sol.prioridad,
      sede: sede?.abrev ?? "—",
      solicitante: solic ?? "—",
      motivo: sol.motivo,
      n_items: items.length,
      total: Number(sol.total_estimado ?? 0),
      aprobador: aprob ?? "—",
      aprobado_en: sol.aprobado_en?.slice(0, 10) ?? "—",
      comprado_en: sol.comprado_en?.slice(0, 10) ?? "—",
      entregado_en: sol.entregado_en?.slice(0, 10) ?? "—",
    });
    totalGeneral += Number(sol.total_estimado ?? 0);
    row.eachCell((cell, colNumber) => {
      cell.alignment = { horizontal: colNumber === 7 ? "left" : "center", vertical: "middle", wrapText: colNumber === 7 };
      cell.font = { size: 10 };
      cell.border = { top: { style: "hair", color: { argb: "FFE8E8E8" } }, bottom: { style: "hair", color: { argb: "FFE8E8E8" } } };
    });
    row.getCell(9).numFmt = '"$"#,##0.00';

    // Pintar estado
    const bg = sol.estado === "ENTREGADA" ? "FFD9F5E9"
      : sol.estado === "COMPRADA" ? "FFCDE5FF"
      : sol.estado === "APROBADA" ? "FFFFF1C8"
      : sol.estado === "RECHAZADA" || sol.estado === "CANCELADA" ? "FFFDD7D7"
      : sol.estado === "SOLICITADA" ? "FFFEF6E1"
      : null;
    if (bg) row.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    if (sol.prioridad === "URGENTE" || sol.prioridad === "ALTA") {
      row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDD7D7" } };
      row.getCell(4).font = { bold: true, color: { argb: "FFA32D2D" }, size: 10 };
    }
  }

  // Totales
  const totRow = ws.addRow({
    folio: "",
    fecha: "",
    estado: "",
    prioridad: "",
    sede: "",
    solicitante: "",
    motivo: `TOTAL: ${rows.length} solicitudes`,
    n_items: "",
    total: totalGeneral,
  });
  totRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, color: { argb: COLOR_HEADER_TEXT }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_GOLD_DEEP } };
    cell.alignment = { horizontal: colNumber === 7 ? "right" : "center", vertical: "middle" };
  });
  totRow.getCell(9).numFmt = '"$"#,##0.00';

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 13 } };

  // ─── Hoja 2: Items detalle ───
  const wsItems = wb.addWorksheet("Items detalle", { views: [{ state: "frozen", ySplit: 1 }] });
  wsItems.columns = [
    { header: "Folio", key: "folio", width: 16 },
    { header: "Estado solicitud", key: "estado", width: 14 },
    { header: "Sede", key: "sede", width: 10 },
    { header: "Solicitante", key: "solic", width: 24 },
    { header: "#", key: "orden", width: 4 },
    { header: "Descripción", key: "desc", width: 40 },
    { header: "Cant.", key: "cant", width: 8 },
    { header: "Unidad", key: "unidad", width: 10 },
    { header: "P. Estimado", key: "pest", width: 12 },
    { header: "P. Real", key: "preal", width: 12 },
    { header: "Subtotal estimado", key: "subEst", width: 16 },
    { header: "Notas", key: "notas", width: 28 },
  ];
  wsItems.getRow(1).font = { bold: true, color: { argb: COLOR_HEADER_TEXT } };
  wsItems.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BG } };
  wsItems.getRow(1).height = 20;
  wsItems.getRow(1).alignment = { horizontal: "center", vertical: "middle" };

  for (const sol of rows) {
    const solic = Array.isArray(sol.usuarios) ? sol.usuarios[0]?.nombre : sol.usuarios?.nombre;
    const sede = Array.isArray(sol.sedes) ? sol.sedes[0] : sol.sedes;
    const items = itemsMap.get(sol.id) ?? [];
    for (const it of items) {
      const r = wsItems.addRow({
        folio: sol.folio,
        estado: sol.estado,
        sede: sede?.abrev ?? "—",
        solic: solic ?? "—",
        orden: (it.orden ?? 0) + 1,
        desc: it.descripcion,
        cant: it.cantidad,
        unidad: it.unidad ?? "PIEZA",
        pest: it.precio_estimado,
        preal: it.precio_real ?? "",
        subEst: it.cantidad * it.precio_estimado,
        notas: it.notas ?? "",
      });
      r.getCell(9).numFmt = '"$"#,##0.00';
      r.getCell(10).numFmt = '"$"#,##0.00';
      r.getCell(11).numFmt = '"$"#,##0.00';
    }
  }
  wsItems.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 12 } };

  const fecha = new Date().toISOString().slice(0, 10);
  const filename = `Vortex_Solicitudes_Compra_${estadoFiltro ?? "TODAS"}_${fecha}.xlsx`;
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
