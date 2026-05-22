#!/usr/bin/env node
import XLSX from "xlsx";

const PATH = "C:/Users/edyme/Downloads/Asistencias V4 (1).xlsx";
const wb = XLSX.readFile(PATH);
console.log("Sheets:", wb.SheetNames);

const sheet = wb.Sheets["PASE_LISTA_V2"];
if (!sheet) {
  console.error("Sheet PASE_LISTA_V2 not found");
  process.exit(1);
}
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
console.log(`Rows: ${rows.length}`);
console.log("First 3 rows:");
for (const r of rows.slice(0, 3)) console.log("R:", JSON.stringify(r));
console.log("Last 3 rows:");
for (const r of rows.slice(-3)) console.log("R:", JSON.stringify(r));

// Unique columns
if (rows.length) console.log("Columns:", Object.keys(rows[0]));

// Date range
const dates = new Set();
for (const r of rows) {
  for (const k of Object.keys(r)) {
    if (/^\d{4}-\d{2}-\d{2}/.test(String(r[k]))) dates.add(String(r[k]).slice(0, 10));
  }
}
const sorted = [...dates].sort();
console.log(`Date range: ${sorted[0]} → ${sorted[sorted.length-1]} (${dates.size} fechas)`);
