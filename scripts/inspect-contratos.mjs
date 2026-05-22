#!/usr/bin/env node
import XLSX from "xlsx";
const wb = XLSX.readFile("C:/Users/edyme/Downloads/Asistencias V4 (1).xlsx");
const sheet = wb.Sheets["CONTRATOS_2026"];
if (!sheet) { console.error("CONTRATOS_2026 no existe"); process.exit(1); }

const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
console.log(`Filas: ${rows.length}`);
console.log("\nColumnas (de la primera fila):");
if (rows[0]) console.log(Object.keys(rows[0]));
console.log("\nPrimeras 3 filas:");
for (const r of rows.slice(0, 3)) console.log("R:", JSON.stringify(r));
console.log("\nÚltimas 3 filas:");
for (const r of rows.slice(-3)) console.log("R:", JSON.stringify(r));

// Resumen de campos null/vacios por columna
console.log("\nCobertura por columna (filas con valor / total):");
const cols = Object.keys(rows[0] ?? {});
for (const c of cols) {
  const llenos = rows.filter(r => r[c] !== null && r[c] !== "").length;
  console.log(`  ${c.padEnd(28)} ${llenos}/${rows.length}`);
}
