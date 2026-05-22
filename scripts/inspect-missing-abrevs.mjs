import XLSX from "xlsx";
const wb = XLSX.readFile("C:/Users/edyme/Downloads/Asistencias V4 (1).xlsx");
const rows = XLSX.utils.sheet_to_json(wb.Sheets["PASE_LISTA_V2"], { defval: null, raw: false });

const missing = new Set(["SV", "SHSC", "A", "SCSS", "SC", "SA", "RI", "SLB"]);
const examples = new Map();
for (const r of rows) {
  const abrev = String(r.ABREV ?? "").toUpperCase().trim();
  if (!missing.has(abrev)) continue;
  if (!examples.has(abrev)) {
    examples.set(abrev, new Set());
  }
  examples.get(abrev).add(String(r.SEDE ?? ""));
}
for (const [k, v] of examples) {
  console.log(`${k}: ${[...v].slice(0, 3).join(" | ")}`);
}
