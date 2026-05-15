import { Document, Page, Text, View, StyleSheet, Svg, Polygon, Line, Defs, LinearGradient, Stop } from "@react-pdf/renderer";
import { CODIGO_SPEC, type CodigoAsistencia } from "@vertice/shared/codes";

const C = {
  bg: "#0A1428",
  border: "#1A2D4F",
  text: "#0A1428",
  muted: "#6B8AB5",
  gold: "#C9A961",
  goldLight: "#F1CB7E",
  goldDeep: "#85692A",
  domingoBg: "#FFE3C8",
  domingoBorder: "#E68900",
};

const styles = StyleSheet.create({
  page: { backgroundColor: "#fff", padding: 28, fontFamily: "Helvetica", fontSize: 9, color: C.text },
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
    borderRight: "0.5pt solid #eee",
    textAlign: "center",
  },
  tdLeft: { textAlign: "left" },
  codeChip: {
    paddingVertical: 1,
    paddingHorizontal: 3,
    borderRadius: 2,
    fontSize: 7,
    color: "#fff",
    fontFamily: "Helvetica-Bold",
  },

  legend: {
    marginTop: 12,
    padding: 8,
    backgroundColor: "#F9F7F0",
    border: `0.5pt solid ${C.gold}`,
    borderRadius: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 3, marginRight: 8 },

  footer: {
    position: "absolute",
    bottom: 18,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.muted,
    borderTop: "0.5pt solid #eee",
    paddingTop: 6,
  },
});

function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <LinearGradient id="vL2" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={C.goldLight} />
          <Stop offset="50%" stopColor={C.gold} />
          <Stop offset="100%" stopColor={C.goldDeep} />
        </LinearGradient>
        <LinearGradient id="vR2" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#A88944" />
          <Stop offset="100%" stopColor="#3F2F11" />
        </LinearGradient>
      </Defs>
      <Polygon points="20,30 55,30 100,109 100,170" fill="url(#vL2)" />
      <Polygon points="100,109 145,30 180,30 100,170" fill="url(#vR2)" />
      <Line x1="100" y1="109" x2="100" y2="170" stroke="#fff" strokeWidth={1.4} strokeOpacity={0.6} />
    </Svg>
  );
}

export interface AsistenciasDocProps {
  sedeNombre: string;
  sedeAbrev: string;
  fechaInicio: string;
  fechaFin: string;
  rangoLabel: string;
  fechas: string[];
  empleados: { id: string; numero_empleado: string; nombre: string; jornada: string }[];
  marcas: Record<string, Record<string, CodigoAsistencia>>;
  generadoPor: string;
  generadoEn: string;
}

export function AsistenciasDoc(props: AsistenciasDocProps) {
  const fechasObj = props.fechas.map((f) => {
    const d = new Date(`${f}T00:00:00`);
    return { iso: f, dia: d.getDate(), dow: d.getDay(), esDom: d.getDay() === 0 };
  });
  const colDateW = Math.max(14, Math.min(22, 260 / Math.max(fechasObj.length, 1)));

  // Stats por empleado
  function stats(empId: string) {
    let asist = 0, falta = 0, desc = 0, incid = 0, sn = 0;
    for (const f of props.fechas) {
      const c = props.marcas[empId]?.[f];
      if (!c) sn++;
      else if (c === "A" || c === "AF") asist++;
      else if (c === "F") falta++;
      else if (c === "DS") desc++;
      else if (c === "SN") sn++;
      else incid++;
    }
    return { asist, falta, desc, incid, sn };
  }

  // Legend de códigos
  const codigosVistos = new Set<CodigoAsistencia>();
  for (const empId in props.marcas) {
    for (const f in props.marcas[empId]) {
      codigosVistos.add(props.marcas[empId]![f]!);
    }
  }

  return (
    <Document title={`Vertice Asistencias ${props.sedeAbrev} ${props.rangoLabel}`} author="Vértice">
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <View style={styles.header}>
          <View style={styles.brand}>
            <LogoMark size={28} />
            <View>
              <Text style={styles.brandText}>VÉRTICE</Text>
              <Text style={styles.brandSub}>MHS INTEGRADORA · ASISTENCIAS</Text>
            </View>
          </View>
          <View style={styles.meta}>
            <Text style={styles.metaRow}>Período</Text>
            <Text style={styles.metaStrong}>{props.rangoLabel}</Text>
            <Text style={styles.metaRow}>Sede: <Text style={{ fontFamily: "Helvetica-Bold" }}>{props.sedeAbrev}</Text></Text>
            <Text style={styles.metaRow}>Generado: {new Date(props.generadoEn).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</Text>
          </View>
        </View>

        <Text style={styles.title}>Reporte de asistencias · {props.sedeNombre}</Text>
        <Text style={styles.subtitle}>
          {props.fechaInicio} al {props.fechaFin} · {props.empleados.length} empleados · {props.fechas.length} días
        </Text>

        <View style={styles.table}>
          <View style={[styles.tr]} fixed>
            <Text style={[styles.th, { width: 26 }]}>ID</Text>
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
            <Text style={[styles.th, { width: 24, backgroundColor: "#065F46" }]}>A</Text>
            <Text style={[styles.th, { width: 24, backgroundColor: "#7F1D1D" }]}>F</Text>
            <Text style={[styles.th, { width: 24, backgroundColor: "#065F46" }]}>DS</Text>
            <Text style={[styles.th, { width: 26, backgroundColor: "#854F0B" }]}>INC</Text>
            <Text style={[styles.th, { width: 24 }]}>S/N</Text>
          </View>

          {props.empleados.map((emp, i) => {
            const s = stats(emp.id);
            return (
              <View key={emp.id} style={[styles.tr, { backgroundColor: i % 2 === 0 ? "#fff" : "#FAFAFA" }]} wrap={false}>
                <Text style={[styles.td, { width: 26, fontFamily: "Helvetica-Bold" }]}>{emp.numero_empleado}</Text>
                <Text style={[styles.td, { width: 130 }, styles.tdLeft]}>{emp.nombre}</Text>
                <Text style={[styles.td, { width: 42 }]}>{emp.jornada}</Text>
                {fechasObj.map((d) => {
                  const cod = props.marcas[emp.id]?.[d.iso];
                  const spec = cod ? CODIGO_SPEC[cod] : null;
                  return (
                    <View
                      key={d.iso}
                      style={[styles.td, { width: colDateW, padding: 2 }, d.esDom ? { backgroundColor: C.domingoBg } : {}]}
                    >
                      {spec ? (
                        <Text style={[styles.codeChip, { backgroundColor: spec.color }]}>{cod}</Text>
                      ) : (
                        <Text style={{ color: C.muted, fontSize: 7 }}>—</Text>
                      )}
                    </View>
                  );
                })}
                <Text style={[styles.td, { width: 24, color: "#10B981", fontFamily: "Helvetica-Bold" }]}>{s.asist}</Text>
                <Text style={[styles.td, { width: 24, color: "#EF4444", fontFamily: "Helvetica-Bold" }]}>{s.falta}</Text>
                <Text style={[styles.td, { width: 24 }]}>{s.desc}</Text>
                <Text style={[styles.td, { width: 26 }]}>{s.incid}</Text>
                <Text style={[styles.td, { width: 24, color: C.muted }]}>{s.sn}</Text>
              </View>
            );
          })}
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.goldDeep, marginRight: 8 }}>Códigos:</Text>
          {[...codigosVistos].sort().map((c) => {
            const s = CODIGO_SPEC[c];
            return (
              <View key={c} style={styles.legendItem}>
                <Text style={[styles.codeChip, { backgroundColor: s.color }]}>{c}</Text>
                <Text style={{ fontSize: 7, color: C.text }}>{s.nombre}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.footer} fixed>
          <Text>Vértice · MHS Integradora · Generado por {props.generadoPor}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
