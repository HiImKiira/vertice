import "server-only";
import ExcelJS from "exceljs";
import type { CodigoAsistencia } from "@vertice/shared/codes";
import {
  CODIGO_SPEC,
  PAGO_DIA_DEFAULT,
  PRIMA_DOMINICAL_DEFAULT,
  DESCUENTO_FALTA_DEFAULT,
} from "@vertice/shared/codes";
import type { Empleado } from "@/lib/pdf/fetchPeriodData";

// Branding colors (mismo que PDF para coherencia)
const COLOR_BG = "FF0A1428";
const COLOR_GOLD = "FFC9A961";
const COLOR_GOLD_DEEP = "FF85692A";
const COLOR_HEADER_TEXT = "FFFFFFFF";
const COLOR_DOMINGO_BG = "FFFFE3C8";
const COLOR_DS_BG = "FFD9F5E9";
const COLOR_ALT_ROW = "FFF7FAFF";

interface BuildContext {
  sedeNombre: string;
  sedeAbrev: string;
  fechaInicio: string;
  fechaFin: string;
  fechas: string[];
  empleados: Empleado[];
  marcas: Record<string, Record<string, CodigoAsistencia>>;
  generadoPor: string;
  generadoEn: string;
  periodoLabel: string;
}

function setHeader(row: ExcelJS.Row, columnCount: number, title: string, subtitle: string, periodo: string) {
  row.height = 24;
  const cell = row.getCell(1);
  cell.value = title;
  cell.font = { bold: true, size: 18, color: { argb: COLOR_BG } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  row.getCell(columnCount).value = subtitle;
  row.getCell(columnCount).font = { italic: true, size: 9, color: { argb: COLOR_GOLD_DEEP } };
  row.getCell(columnCount).alignment = { horizontal: "right", vertical: "middle" };
  row.getCell(Math.ceil(columnCount / 2)).value = periodo;
  row.getCell(Math.ceil(columnCount / 2)).font = { bold: true, size: 11, color: { argb: COLOR_GOLD_DEEP } };
  row.getCell(Math.ceil(columnCount / 2)).alignment = { horizontal: "center", vertical: "middle" };
}

function codigoArgbBg(cod: CodigoAsistencia | undefined): string | null {
  if (!cod) return null;
  const spec = CODIGO_SPEC[cod];
  if (!spec) return null;
  // spec.color es un hex tipo "#3B6D11"; lo convertimos a ARGB ("FF" + hex sin #)
  const hex = spec.color?.replace("#", "");
  if (!hex || hex.length !== 6) return null;
  return `FF${hex.toUpperCase()}`;
}

// ─────────────────────────────────────────────────────────────────────
// ASISTENCIAS — matriz mes × empleado con códigos
// ─────────────────────────────────────────────────────────────────────
export async function buildAsistenciasXlsx(ctx: BuildContext): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vortex · MHS Integradora";
  wb.created = new Date(ctx.generadoEn);
  wb.title = `Vortex Asistencias ${ctx.sedeAbrev} ${ctx.periodoLabel}`;

  const ws = wb.addWorksheet("Asistencias", {
    properties: { defaultRowHeight: 14, defaultColWidth: 4 },
    views: [{ state: "frozen", xSplit: 3, ySplit: 5 }],
  });

  // Anchos columnas base
  const fechasObj = ctx.fechas.map((f) => {
    const d = new Date(`${f}T00:00:00`);
    return { iso: f, dia: d.getDate(), dow: d.getDay(), esDom: d.getDay() === 0 };
  });

  ws.columns = [
    { header: "ID", key: "id", width: 7 },
    { header: "Empleado", key: "nombre", width: 36 },
    { header: "Jornada", key: "jornada", width: 12 },
    ...fechasObj.map((f) => ({ header: String(f.dia), key: `d_${f.iso}`, width: 4 })),
    { header: "TOTAL A", key: "totalA", width: 9 },
    { header: "TOTAL F", key: "totalF", width: 9 },
    { header: "DS", key: "totalDS", width: 7 },
    { header: "DT", key: "totalDT", width: 7 },
  ];

  // Filas 1-4: branding header
  ws.spliceRows(1, 0, [], [], [], [], []);
  const colCount = ws.columnCount;

  const r1 = ws.getRow(1);
  r1.height = 28;
  r1.getCell(1).value = "VORTEX · MHS INTEGRADORA";
  r1.getCell(1).font = { bold: true, size: 18, color: { argb: COLOR_BG } };
  ws.mergeCells(1, 1, 1, Math.min(6, colCount));
  r1.getCell(colCount).value = `Generado: ${new Date(ctx.generadoEn).toLocaleString("es-MX")}`;
  r1.getCell(colCount).font = { italic: true, size: 9, color: { argb: COLOR_GOLD_DEEP } };
  r1.getCell(colCount).alignment = { horizontal: "right" };

  const r2 = ws.getRow(2);
  r2.getCell(1).value = `Reporte de asistencias · ${ctx.sedeNombre} (${ctx.sedeAbrev})`;
  r2.getCell(1).font = { bold: true, size: 12, color: { argb: COLOR_GOLD_DEEP } };
  ws.mergeCells(2, 1, 2, Math.min(8, colCount));

  const r3 = ws.getRow(3);
  r3.getCell(1).value = `Período: ${ctx.fechaInicio} al ${ctx.fechaFin}  ·  ${ctx.empleados.length} empleados  ·  por ${ctx.generadoPor}`;
  r3.getCell(1).font = { size: 9, color: { argb: "FF6B8AB5" } };
  ws.mergeCells(3, 1, 3, colCount);

  // Fila 5 = headers (ya autogenerados por exceljs en fila 1, pero los movimos a 5 con spliceRows)
  const headerRow = ws.getRow(5);
  headerRow.height = 20;
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 9, color: { argb: COLOR_HEADER_TEXT } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BG } };
    cell.border = {
      top: { style: "thin", color: { argb: COLOR_GOLD } },
      bottom: { style: "thin", color: { argb: COLOR_GOLD } },
      left: { style: "hair", color: { argb: "FF1A2D4F" } },
      right: { style: "hair", color: { argb: "FF1A2D4F" } },
    };
    // Domingo: bg ámbar
    if (colNumber >= 4 && colNumber - 4 < fechasObj.length) {
      const idx = colNumber - 4;
      if (fechasObj[idx]?.esDom) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE68900" } };
      }
    }
  });

  // Data rows
  let totGlobalA = 0, totGlobalF = 0, totGlobalDS = 0, totGlobalDT = 0;
  for (const emp of ctx.empleados) {
    let totA = 0, totF = 0, totDS = 0, totDT = 0;
    const rowData: Record<string, string | number> = {
      id: emp.numero_empleado,
      nombre: emp.nombre + (emp.cambio_durante_periodo ? ` ⚑ (${emp.dias_en_sede ?? 0}d aquí)` : ""),
      jornada: emp.jornada,
    };
    for (const f of fechasObj) {
      const cod = ctx.marcas[emp.id]?.[f.iso];
      rowData[`d_${f.iso}`] = cod ?? "";
      if (cod === "A" || cod === "AF") totA++;
      else if (cod === "F") totF++;
      else if (cod === "DS") totDS++;
      else if (cod === "DT") totDT++;
    }
    rowData.totalA = totA;
    rowData.totalF = totF;
    rowData.totalDS = totDS;
    rowData.totalDT = totDT;
    totGlobalA += totA; totGlobalF += totF; totGlobalDS += totDS; totGlobalDT += totDT;

    const row = ws.addRow(rowData);
    row.height = 16;
    row.eachCell((cell, colNumber) => {
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = { size: 9, color: { argb: "FF0A1428" } };
      cell.border = {
        top: { style: "hair", color: { argb: "FFE8E8E8" } },
        bottom: { style: "hair", color: { argb: "FFE8E8E8" } },
        left: { style: "hair", color: { argb: "FFE8E8E8" } },
        right: { style: "hair", color: { argb: "FFE8E8E8" } },
      };
      // Columna nombre alineada izquierda
      if (colNumber === 2) cell.alignment = { horizontal: "left", vertical: "middle" };
      // Columna id en bold
      if (colNumber === 1) cell.font = { size: 9, bold: true, color: { argb: COLOR_BG } };
      // Pintar celda de código según spec.color (solo para columnas de fecha)
      if (colNumber >= 4 && colNumber - 4 < fechasObj.length) {
        const cod = cell.value as CodigoAsistencia | "";
        if (cod) {
          const argb = codigoArgbBg(cod as CodigoAsistencia);
          if (argb) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
            cell.font = { size: 9, bold: true, color: { argb: COLOR_HEADER_TEXT } };
          }
        } else {
          const idx = colNumber - 4;
          if (fechasObj[idx]?.esDom) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_DOMINGO_BG } };
          }
        }
      }
    });
  }

  // Fila de totales
  const totalRow = ws.addRow({
    id: "",
    nombre: `TOTAL · ${ctx.empleados.length} empleados`,
    jornada: "",
    totalA: totGlobalA,
    totalF: totGlobalF,
    totalDS: totGlobalDS,
    totalDT: totGlobalDT,
  });
  totalRow.height = 20;
  totalRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 10, color: { argb: COLOR_HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_GOLD_DEEP } };
    cell.alignment = { horizontal: colNumber === 2 ? "left" : "center", vertical: "middle" };
  });

  // Auto-filter en headers
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: colCount } };

  // ─────────────── Hoja 2: Leyenda de códigos ───────────────
  const wsLeg = wb.addWorksheet("Leyenda", { properties: { defaultColWidth: 18 } });
  wsLeg.columns = [
    { header: "Código", key: "cod", width: 12 },
    { header: "Significado", key: "sig", width: 40 },
    { header: "Cuenta como", key: "cuenta", width: 30 },
  ];
  wsLeg.getRow(1).font = { bold: true, color: { argb: COLOR_HEADER_TEXT } };
  wsLeg.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BG } };
  wsLeg.getRow(1).height = 20;
  for (const [cod, spec] of Object.entries(CODIGO_SPEC)) {
    const row = wsLeg.addRow({
      cod,
      sig: spec.nombre ?? cod,
      cuenta: spec.descripcion ?? "",
    });
    const argb = codigoArgbBg(cod as CodigoAsistencia);
    if (argb) {
      row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
      row.getCell(1).font = { bold: true, color: { argb: COLOR_HEADER_TEXT } };
      row.getCell(1).alignment = { horizontal: "center" };
    }
  }

  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr);
}

// ─────────────────────────────────────────────────────────────────────
// NOMINA — cálculo de días, prima, descuentos, pago estimado
// ─────────────────────────────────────────────────────────────────────
function calcEmp(
  emp: Empleado,
  fechas: string[],
  marcas: Record<string, CodigoAsistencia> | undefined,
) {
  let diasLab = 0, diasDT = 0, diasDL = 0, diasDS = 0, diasFalta = 0, diasDom = 0;
  for (const f of fechas) {
    const cod = marcas?.[f];
    if (!cod) continue;
    const dt = new Date(`${f}T00:00:00`);
    const esDom = dt.getDay() === 0;
    if (cod === "DT") { diasLab++; diasDT++; if (esDom) diasDom++; }
    else if (cod === "DL") { diasLab++; diasDL++; }
    else if (cod === "A" || cod === "AF") { diasLab++; if (esDom) diasDom++; }
    else if (cod === "DS") { diasLab++; diasDS++; }
    else if (cod === "INH" || cod === "FER" || cod === "PCG") { diasLab++; }
    else if (cod === "F") { diasFalta++; }
  }
  const salDia = emp.salario_diario || PAGO_DIA_DEFAULT;
  // DT = 1x extra; DL (descanso laborado) = 2x extra → 3x total ese día
  const diasExtraPago = diasDT + diasDL * 2;
  const valorExtra = diasExtraPago * salDia;
  const primaDom = diasDom * PRIMA_DOMINICAL_DEFAULT;
  const descFaltas = diasFalta * DESCUENTO_FALTA_DEFAULT;
  const pagoEstim = diasLab * salDia + valorExtra + primaDom - descFaltas;
  return { diasLab, diasDT, diasDL, diasDS, diasFalta, diasDom, valorExtra, primaDom, descFaltas, pagoEstim };
}

export async function buildNominaXlsx(ctx: BuildContext): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vortex · MHS Integradora";
  wb.created = new Date(ctx.generadoEn);
  wb.title = `Vortex Nómina ${ctx.sedeAbrev} ${ctx.periodoLabel}`;

  const ws = wb.addWorksheet("Nómina", {
    properties: { defaultRowHeight: 14 },
    views: [{ state: "frozen", xSplit: 3, ySplit: 5 }],
  });

  const fechasObj = ctx.fechas.map((f) => {
    const d = new Date(`${f}T00:00:00`);
    return { iso: f, dia: d.getDate(), dow: d.getDay(), esDom: d.getDay() === 0 };
  });

  ws.columns = [
    { header: "ID", key: "id", width: 7 },
    { header: "Empleado", key: "nombre", width: 36 },
    { header: "Jornada", key: "jornada", width: 12 },
    ...fechasObj.map((f) => ({ header: String(f.dia), key: `d_${f.iso}`, width: 4 })),
    { header: "Días", key: "diasLab", width: 7 },
    { header: "DS", key: "diasDS", width: 6 },
    { header: "Extras", key: "diasDT", width: 7 },
    { header: "Val.Ext", key: "valorExtra", width: 11 },
    { header: "Faltas", key: "diasFalta", width: 7 },
    { header: "Dom", key: "diasDom", width: 6 },
    { header: "Prima Dom", key: "primaDom", width: 12 },
    { header: "Descuento", key: "descFaltas", width: 12 },
    { header: "Salario/día", key: "salDia", width: 11 },
    { header: "PAGO ESTIMADO", key: "pagoEstim", width: 17 },
  ];

  ws.spliceRows(1, 0, [], [], [], [], []);
  const colCount = ws.columnCount;

  const r1 = ws.getRow(1);
  r1.height = 28;
  r1.getCell(1).value = "VORTEX · MHS INTEGRADORA";
  r1.getCell(1).font = { bold: true, size: 18, color: { argb: COLOR_BG } };
  ws.mergeCells(1, 1, 1, Math.min(6, colCount));
  r1.getCell(colCount).value = `Generado: ${new Date(ctx.generadoEn).toLocaleString("es-MX")}`;
  r1.getCell(colCount).font = { italic: true, size: 9, color: { argb: COLOR_GOLD_DEEP } };
  r1.getCell(colCount).alignment = { horizontal: "right" };

  const r2 = ws.getRow(2);
  r2.getCell(1).value = `Nómina estimada · ${ctx.sedeNombre} (${ctx.sedeAbrev})`;
  r2.getCell(1).font = { bold: true, size: 12, color: { argb: COLOR_GOLD_DEEP } };
  ws.mergeCells(2, 1, 2, Math.min(10, colCount));

  const r3 = ws.getRow(3);
  r3.getCell(1).value = `Período: ${ctx.fechaInicio} al ${ctx.fechaFin}  ·  ${ctx.empleados.length} empleados  ·  por ${ctx.generadoPor}`;
  r3.getCell(1).font = { size: 9, color: { argb: "FF6B8AB5" } };
  ws.mergeCells(3, 1, 3, colCount);

  const r4 = ws.getRow(4);
  r4.getCell(1).value = `Tarifa día base: $${PAGO_DIA_DEFAULT.toFixed(2)}  ·  Prima dominical: $${PRIMA_DOMINICAL_DEFAULT.toFixed(2)}  ·  Descuento por falta: $${DESCUENTO_FALTA_DEFAULT.toFixed(2)}`;
  r4.getCell(1).font = { size: 9, italic: true, color: { argb: "FF6B8AB5" } };
  ws.mergeCells(4, 1, 4, colCount);

  // Header row (5)
  const headerRow = ws.getRow(5);
  headerRow.height = 20;
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 9, color: { argb: COLOR_HEADER_TEXT } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BG } };
    cell.border = {
      top: { style: "thin", color: { argb: COLOR_GOLD } },
      bottom: { style: "thin", color: { argb: COLOR_GOLD } },
    };
    if (colNumber >= 4 && colNumber - 4 < fechasObj.length) {
      const idx = colNumber - 4;
      if (fechasObj[idx]?.esDom) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE68900" } };
      }
    }
  });
  // Resaltar columna PAGO
  headerRow.getCell(colCount).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_GOLD_DEEP } };

  let totales = { diasLab: 0, diasDT: 0, diasDS: 0, diasFalta: 0, diasDom: 0, valorExtra: 0, primaDom: 0, descFaltas: 0, pagoEstim: 0 };
  for (const emp of ctx.empleados) {
    const calc = calcEmp(emp, ctx.fechas, ctx.marcas[emp.id]);
    const rowData: Record<string, string | number> = {
      id: emp.numero_empleado,
      nombre: emp.nombre + (emp.cambio_durante_periodo ? ` ⚑ (${emp.dias_en_sede ?? 0}d aquí)` : ""),
      jornada: emp.jornada,
      diasLab: calc.diasLab,
      diasDS: calc.diasDS,
      diasDT: calc.diasDT,
      valorExtra: calc.valorExtra,
      diasFalta: calc.diasFalta,
      diasDom: calc.diasDom,
      primaDom: calc.primaDom,
      descFaltas: calc.descFaltas,
      salDia: emp.salario_diario || PAGO_DIA_DEFAULT,
      pagoEstim: calc.pagoEstim,
    };
    for (const f of fechasObj) {
      rowData[`d_${f.iso}`] = ctx.marcas[emp.id]?.[f.iso] ?? "";
    }
    const row = ws.addRow(rowData);
    row.height = 16;

    totales.diasLab += calc.diasLab;
    totales.diasDT += calc.diasDT;
    totales.diasDS += calc.diasDS;
    totales.diasFalta += calc.diasFalta;
    totales.diasDom += calc.diasDom;
    totales.valorExtra += calc.valorExtra;
    totales.primaDom += calc.primaDom;
    totales.descFaltas += calc.descFaltas;
    totales.pagoEstim += calc.pagoEstim;

    row.eachCell((cell, colNumber) => {
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = { size: 9, color: { argb: "FF0A1428" } };
      cell.border = {
        top: { style: "hair", color: { argb: "FFE8E8E8" } },
        bottom: { style: "hair", color: { argb: "FFE8E8E8" } },
        left: { style: "hair", color: { argb: "FFE8E8E8" } },
        right: { style: "hair", color: { argb: "FFE8E8E8" } },
      };
      if (colNumber === 1) cell.font = { size: 9, bold: true, color: { argb: COLOR_BG } };
      if (colNumber === 2) cell.alignment = { horizontal: "left", vertical: "middle" };
      // Pintar celdas de código
      if (colNumber >= 4 && colNumber - 4 < fechasObj.length) {
        const cod = cell.value as CodigoAsistencia | "";
        if (cod) {
          const argb = codigoArgbBg(cod as CodigoAsistencia);
          if (argb) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
            cell.font = { size: 9, bold: true, color: { argb: COLOR_HEADER_TEXT } };
          }
        } else {
          const idx = colNumber - 4;
          if (fechasObj[idx]?.esDom) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_DOMINGO_BG } };
          }
        }
      }
      // Formato monetario en columnas monetarias
      const colKey = ws.columns[colNumber - 1]?.key;
      if (colKey === "valorExtra" || colKey === "primaDom" || colKey === "descFaltas" || colKey === "salDia" || colKey === "pagoEstim") {
        cell.numFmt = '"$"#,##0.00';
      }
      // Resaltar columna PAGO
      if (colKey === "pagoEstim") {
        cell.font = { size: 10, bold: true, color: { argb: COLOR_GOLD_DEEP } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF6E1" } };
      }
      // Resaltar columna DS
      if (colKey === "diasDS") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_DS_BG } };
      }
    });
  }

  // Fila de totales
  const totalRow = ws.addRow({
    id: "",
    nombre: `TOTAL · ${ctx.empleados.length} empleados`,
    jornada: "",
    diasLab: totales.diasLab,
    diasDS: totales.diasDS,
    diasDT: totales.diasDT,
    valorExtra: totales.valorExtra,
    diasFalta: totales.diasFalta,
    diasDom: totales.diasDom,
    primaDom: totales.primaDom,
    descFaltas: totales.descFaltas,
    salDia: "",
    pagoEstim: totales.pagoEstim,
  });
  totalRow.height = 22;
  totalRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 10, color: { argb: COLOR_HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_GOLD_DEEP } };
    cell.alignment = { horizontal: colNumber === 2 ? "left" : "center", vertical: "middle" };
    const colKey = ws.columns[colNumber - 1]?.key;
    if (colKey === "valorExtra" || colKey === "primaDom" || colKey === "descFaltas" || colKey === "pagoEstim") {
      cell.numFmt = '"$"#,##0.00';
    }
    if (colKey === "pagoEstim") {
      cell.font = { bold: true, size: 12, color: { argb: COLOR_HEADER_TEXT } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BG } };
    }
  });

  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: colCount } };

  // Hoja 2: leyenda
  const wsLeg = wb.addWorksheet("Leyenda", { properties: { defaultColWidth: 18 } });
  wsLeg.columns = [
    { header: "Código", key: "cod", width: 12 },
    { header: "Significado", key: "sig", width: 40 },
    { header: "Cuenta como", key: "cuenta", width: 30 },
  ];
  wsLeg.getRow(1).font = { bold: true, color: { argb: COLOR_HEADER_TEXT } };
  wsLeg.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BG } };
  for (const [cod, spec] of Object.entries(CODIGO_SPEC)) {
    const row = wsLeg.addRow({
      cod,
      sig: spec.nombre ?? cod,
      cuenta: spec.descripcion ?? "",
    });
    const argb = codigoArgbBg(cod as CodigoAsistencia);
    if (argb) {
      row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
      row.getCell(1).font = { bold: true, color: { argb: COLOR_HEADER_TEXT } };
      row.getCell(1).alignment = { horizontal: "center" };
    }
  }

  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr);
}
