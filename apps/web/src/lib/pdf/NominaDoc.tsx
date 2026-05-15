import { Document, Page, Text, View, StyleSheet, Svg, Polygon, Line, Defs, LinearGradient, Stop } from "@react-pdf/renderer";
import {
  CODIGO_SPEC,
  type CodigoAsistencia,
  PAGO_DIA_DEFAULT,
  PRIMA_DOMINICAL_DEFAULT,
  DESCUENTO_FALTA_DEFAULT,
} from "@vertice/shared/codes";

const C = {
  bg: "#0A1428",
  surface: "#0D1A30",
  border: "#1A2D4F",
  text: "#E8F0FF",
  muted: "#6B8AB5",
  gold: "#C9A961",
  goldLight: "#F1CB7E",
  goldDeep: "#85692A",
  blue: "#3B82F6",
  green: "#10B981",
  red: "#EF4444",
  amber: "#F59E0B",
  domingoBg: "#FFE3C8",
  domingoBorder: "#E68900",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#fff",
    padding: 28,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#0A1428",
  },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12, paddingBottom: 10, borderBottom: `1pt solid ${C.gold}` },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandText: { fontFamily: "Helvetica-Bold", fontSize: 16, letterSpacing: 1.5, color: C.bg },
  brandSub: { fontSize: 7, color: C.muted, letterSpacing: 1, marginTop: 1 },
  meta: { flexDirection: "column", alignItems: "flex-end", marginLeft: "auto" },
  metaRow: { fontSize: 8, color: C.muted, marginBottom: 1 },
  metaStrong: { fontFamily: "Helvetica-Bold", fontSize: 11, color: C.bg },

  title: { fontFamily: "Helvetica-Bold", fontSize: 14, color: C.bg, marginBottom: 4 },
  subtitle: { fontSize: 9, color: C.muted, marginBottom: 14 },

  table: { border: `0.5pt solid ${C.border}`, borderBottomWidth: 0 },
  tr: { flexDirection: "row", borderBottom: `0.5pt solid ${C.border}` },
  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: "#fff",
    backgroundColor: C.bg,
    paddingVertical: 6,
    paddingHorizontal: 2,
    textAlign: "center",
    borderRight: `0.5pt solid ${C.border}`,
  },
  td: {
    fontSize: 7.5,
    color: C.bg,
    paddingVertical: 4,
    paddingHorizontal: 3,
    borderRight: `0.5pt solid #eee`,
    textAlign: "center",
  },
  tdLeft: { textAlign: "left" },
  tdBold: { fontFamily: "Helvetica-Bold" },

  codeChip: { paddingVertical: 1, paddingHorizontal: 3, borderRadius: 2, fontSize: 7, color: "#fff", fontFamily: "Helvetica-Bold" },

  summary: { marginTop: 14, padding: 10, backgroundColor: "#F9F7F0", border: `0.5pt solid ${C.gold}`, borderRadius: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  summaryLabel: { fontSize: 8, color: C.muted },
  summaryValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.bg },
  summaryTotal: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.goldDeep,
    marginTop: 6,
    paddingTop: 6,
    borderTop: `0.5pt solid ${C.gold}`,
  },

  footer: {
    position: "absolute",
    bottom: 18,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.muted,
    borderTop: `0.5pt solid #eee`,
    paddingTop: 6,
  },
});

function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <LinearGradient id="vL" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={C.goldLight} />
          <Stop offset="50%" stopColor={C.gold} />
          <Stop offset="100%" stopColor={C.goldDeep} />
        </LinearGradient>
        <LinearGradient id="vR" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#A88944" />
          <Stop offset="100%" stopColor="#3F2F11" />
        </LinearGradient>
      </Defs>
      <Polygon points="20,30 55,30 100,109 100,170" fill="url(#vL)" />
      <Polygon points="100,109 145,30 180,30 100,170" fill="url(#vR)" />
      <Line x1="100" y1="109" x2="100" y2="170" stroke="#fff" strokeWidth={1.4} strokeOpacity={0.6} />
    </Svg>
  );
}

export interface NominaDocProps {
  sedeNombre: string;
  sedeAbrev: string;
  periodoLabel: string;
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string;
  fechas: string[]; // todas las fechas del período
  empleados: {
    id: string;
    numero_empleado: string;
    nombre: string;
    jornada: string;
    salario_diario: number;
  }[];
  marcas: Record<string, Record<string, CodigoAsistencia>>; // [empleado_id][fecha] = codigo
  generadoPor: string;
  generadoEn: string; // ISO
}

function calcEmp(emp: NominaDocProps["empleados"][number], fechas: string[], marcas: Record<string, CodigoAsistencia> | undefined) {
  let diasLab = 0, diasDT = 0, diasFalta = 0, diasDom = 0;
  for (const f of fechas) {
    const cod = marcas?.[f];
    if (!cod) continue;
    const dt = new Date(`${f}T00:00:00`);
    const esDom = dt.getDay() === 0;
    if (cod === "DT") { diasLab++; diasDT++; if (esDom) diasDom++; }
    else if (cod === "A" || cod === "AF") { diasLab++; if (esDom) diasDom++; }
    else if (cod === "DS" || cod === "INH" || cod === "FER" || cod === "PCG") { diasLab++; }
    else if (cod === "F") { diasFalta++; }
  }
  const salDia = emp.salario_diario || PAGO_DIA_DEFAULT;
  const valorExtra = diasDT * salDia;
  const primaDom = diasDom * PRIMA_DOMINICAL_DEFAULT;
  const descFaltas = diasFalta * DESCUENTO_FALTA_DEFAULT;
  const pagoEstim = diasLab * salDia + valorExtra + primaDom - descFaltas;
  return { diasLab, diasDT, diasFalta, diasDom, valorExtra, primaDom, descFaltas, pagoEstim };
}

const fmtMXN = (n: number) =>
  "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function NominaDoc(props: NominaDocProps) {
  const fechasObj = props.fechas.map((f) => {
    const d = new Date(`${f}T00:00:00`);
    return { iso: f, dia: d.getDate(), dow: d.getDay(), esDom: d.getDay() === 0 };
  });

  // Cálculos
  const filas = props.empleados.map((e) => ({ emp: e, calc: calcEmp(e, props.fechas, props.marcas[e.id]) }));
  const totales = filas.reduce(
    (acc, f) => ({
      diasLab: acc.diasLab + f.calc.diasLab,
      diasDT: acc.diasDT + f.calc.diasDT,
      diasFalta: acc.diasFalta + f.calc.diasFalta,
      diasDom: acc.diasDom + f.calc.diasDom,
      valorExtra: acc.valorExtra + f.calc.valorExtra,
      primaDom: acc.primaDom + f.calc.primaDom,
      descFaltas: acc.descFaltas + f.calc.descFaltas,
      pagoEstim: acc.pagoEstim + f.calc.pagoEstim,
    }),
    { diasLab: 0, diasDT: 0, diasFalta: 0, diasDom: 0, valorExtra: 0, primaDom: 0, descFaltas: 0, pagoEstim: 0 },
  );

  // Anchos columnas — el calendario crece según N fechas
  const colDateW = Math.max(14, Math.min(20, 200 / fechasObj.length));

  return (
    <Document title={`Vertice Nomina ${props.sedeAbrev} ${props.periodoLabel}`} author="Vértice">
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brand}>
            <LogoMark size={28} />
            <View>
              <Text style={styles.brandText}>VÉRTICE</Text>
              <Text style={styles.brandSub}>MHS INTEGRADORA · NÓMINA</Text>
            </View>
          </View>
          <View style={styles.meta}>
            <Text style={styles.metaRow}>Período</Text>
            <Text style={styles.metaStrong}>{props.periodoLabel}</Text>
            <Text style={styles.metaRow}>Sede: <Text style={{ fontFamily: "Helvetica-Bold" }}>{props.sedeAbrev}</Text></Text>
            <Text style={styles.metaRow}>Generado: {new Date(props.generadoEn).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</Text>
          </View>
        </View>

        <Text style={styles.title}>Nómina estimada · {props.sedeNombre}</Text>
        <Text style={styles.subtitle}>
          {props.fechaInicio} al {props.fechaFin} · {props.empleados.length} empleados · Tarifa día base ${PAGO_DIA_DEFAULT.toFixed(2)} · Prima dominical ${PRIMA_DOMINICAL_DEFAULT.toFixed(2)} · Desc. falta ${DESCUENTO_FALTA_DEFAULT.toFixed(2)}
        </Text>

        {/* Tabla */}
        <View style={styles.table}>
          {/* Header row */}
          <View style={[styles.tr, { backgroundColor: C.bg }]} fixed>
            <Text style={[styles.th, { width: 28, textAlign: "center" }]}>ID</Text>
            <Text style={[styles.th, { width: 130, textAlign: "left", paddingLeft: 4 }]}>NOMBRE</Text>
            <Text style={[styles.th, { width: 42 }]}>JORN.</Text>
            {fechasObj.map((f) => (
              <Text
                key={f.iso}
                style={[
                  styles.th,
                  { width: colDateW },
                  f.esDom ? { backgroundColor: C.domingoBorder, color: "#fff" } : {},
                ]}
              >
                {f.dia}
              </Text>
            ))}
            <Text style={[styles.th, { width: 28 }]}>DÍAS</Text>
            <Text style={[styles.th, { width: 28 }]}>EXT.</Text>
            <Text style={[styles.th, { width: 38 }]}>VAL.EXT</Text>
            <Text style={[styles.th, { width: 28 }]}>FALT.</Text>
            <Text style={[styles.th, { width: 28 }]}>DOM.</Text>
            <Text style={[styles.th, { width: 38 }]}>PRIMA</Text>
            <Text style={[styles.th, { width: 42 }]}>DESC.</Text>
            <Text style={[styles.th, { width: 50, backgroundColor: C.goldDeep }]}>PAGO</Text>
          </View>

          {/* Data rows */}
          {filas.map((f, i) => (
            <View key={f.emp.id} style={[styles.tr, { backgroundColor: i % 2 === 0 ? "#fff" : "#FAFAFA" }]} wrap={false}>
              <Text style={[styles.td, { width: 28 }, styles.tdBold]}>{f.emp.numero_empleado}</Text>
              <Text style={[styles.td, { width: 130 }, styles.tdLeft]}>{f.emp.nombre}</Text>
              <Text style={[styles.td, { width: 42 }]}>{f.emp.jornada}</Text>
              {fechasObj.map((d) => {
                const cod = props.marcas[f.emp.id]?.[d.iso];
                const spec = cod ? CODIGO_SPEC[cod] : null;
                return (
                  <View key={d.iso} style={[styles.td, { width: colDateW, padding: 2 }, d.esDom ? { backgroundColor: C.domingoBg } : {}]}>
                    {spec ? (
                      <Text style={[styles.codeChip, { backgroundColor: spec.color }]}>{cod}</Text>
                    ) : (
                      <Text style={{ color: C.muted, fontSize: 7 }}>—</Text>
                    )}
                  </View>
                );
              })}
              <Text style={[styles.td, { width: 28 }, styles.tdBold]}>{f.calc.diasLab}</Text>
              <Text style={[styles.td, { width: 28 }, f.calc.diasDT > 0 ? { color: C.green, fontFamily: "Helvetica-Bold" } : {}]}>{f.calc.diasDT}</Text>
              <Text style={[styles.td, { width: 38 }]}>{fmtMXN(f.calc.valorExtra)}</Text>
              <Text style={[styles.td, { width: 28 }, f.calc.diasFalta > 0 ? { color: C.red, fontFamily: "Helvetica-Bold" } : {}]}>{f.calc.diasFalta}</Text>
              <Text style={[styles.td, { width: 28 }]}>{f.calc.diasDom}</Text>
              <Text style={[styles.td, { width: 38 }]}>{fmtMXN(f.calc.primaDom)}</Text>
              <Text style={[styles.td, { width: 42 }, f.calc.descFaltas > 0 ? { color: C.red } : {}]}>{fmtMXN(f.calc.descFaltas)}</Text>
              <Text style={[styles.td, { width: 50 }, styles.tdBold, { color: C.goldDeep, backgroundColor: "#FFF8E5" }]}>{fmtMXN(f.calc.pagoEstim)}</Text>
            </View>
          ))}
        </View>

        {/* Resumen */}
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Días laborados (total)</Text>
            <Text style={styles.summaryValue}>{totales.diasLab}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Turnos extra (DT)</Text>
            <Text style={styles.summaryValue}>{totales.diasDT} · {fmtMXN(totales.valorExtra)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Domingos trabajados · prima dominical</Text>
            <Text style={styles.summaryValue}>{totales.diasDom} · {fmtMXN(totales.primaDom)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Faltas · descuento</Text>
            <Text style={[styles.summaryValue, { color: C.red }]}>{totales.diasFalta} · −{fmtMXN(totales.descFaltas)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { fontFamily: "Helvetica-Bold", fontSize: 10 }]}>PAGO ESTIMADO TOTAL</Text>
            <Text style={styles.summaryTotal}>{fmtMXN(totales.pagoEstim)}</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>Vértice · MHS Integradora · Generado por {props.generadoPor}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
