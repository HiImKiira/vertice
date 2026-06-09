import { Document, Page, Text, View, StyleSheet, Svg, Polygon, Line, Defs, LinearGradient, Stop } from "@react-pdf/renderer";
import { CONTRATO_HOMBRE_BLOCKS } from "./templates/contrato-hombre-blocks";
import { CONTRATO_MUJER_BLOCKS } from "./templates/contrato-mujer-blocks";
import type { ContratoBlock } from "./templates/blocks-types";

const C = {
  text: "#1A1A1A",
  muted: "#4A6690",
  blue: "#1D4ED8",
  blueLight: "#93C5FD",
  blueDeep: "#0F2E70",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#fff",
    paddingTop: 38,
    paddingBottom: 40,
    paddingHorizontal: 56,
    fontFamily: "Times-Roman",
    fontSize: 11,
    color: C.text,
    lineHeight: 1.4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 10,
    borderBottom: `1pt solid ${C.blue}`,
  },
  brandWrap: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandText: { fontFamily: "Helvetica-Bold", fontSize: 16, letterSpacing: 2, color: C.blueDeep },
  brandSub: { fontFamily: "Helvetica", fontSize: 6.5, color: C.muted, letterSpacing: 1.2, marginTop: 2 },
  meta: { marginLeft: "auto", alignItems: "flex-end" },
  metaRow: { fontFamily: "Helvetica", fontSize: 7.5, color: C.muted },
  metaFolio: { fontFamily: "Helvetica-Bold", fontSize: 12, color: C.blue, marginTop: 1 },

  titulo: {
    fontFamily: "Times-Bold",
    fontSize: 12,
    color: C.blueDeep,
    textAlign: "center",
    marginBottom: 14,
    letterSpacing: 0.3,
  },

  intro: { fontSize: 11, textAlign: "justify", marginBottom: 10, lineHeight: 1.5 },

  seccion: {
    fontFamily: "Times-Bold",
    fontSize: 12,
    color: C.blueDeep,
    marginTop: 14,
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: 1,
  },
  subseccion: {
    fontFamily: "Times-Bold",
    fontSize: 11,
    marginTop: 10,
    marginBottom: 4,
  },
  inciso: {
    fontSize: 11,
    textAlign: "justify",
    marginBottom: 5,
    marginLeft: 18,
    lineHeight: 1.45,
  },
  clausula: { fontSize: 11, textAlign: "justify", marginTop: 7, marginBottom: 4, lineHeight: 1.45 },
  clausulaTitulo: { fontFamily: "Times-Bold" },
  parrafo: { fontSize: 11, textAlign: "justify", marginBottom: 6, lineHeight: 1.45 },

  // Zona de firmas — amplia, con líneas claras para firmar
  firmasWrap: {
    marginTop: 36,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  firma: { width: "46%", alignItems: "center" },
  firmaLinea: {
    borderTopWidth: 0.8,
    borderTopColor: C.text,
    width: "100%",
    marginTop: 48,
    marginBottom: 5,
  },
  firmaRol: { fontFamily: "Times-Bold", fontSize: 10, color: C.blueDeep, marginBottom: 2 },
  firmaNombre: { fontFamily: "Times-Bold", fontSize: 10.5, color: C.text, textAlign: "center" },
  firmaSub: { fontSize: 8.5, color: C.muted, textAlign: "center", marginTop: 2, lineHeight: 1.3 },

  // Número de página discreto (sin pie de página recargado)
  pageNum: {
    position: "absolute",
    bottom: 18,
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: "Helvetica",
    fontSize: 7.5,
    color: "#9AA8BD",
  },
});

function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <LinearGradient id="cVL" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={C.blueLight} />
          <Stop offset="50%" stopColor={C.blue} />
          <Stop offset="100%" stopColor={C.blueDeep} />
        </LinearGradient>
      </Defs>
      <Polygon points="20,30 55,30 100,109 100,170" fill="url(#cVL)" />
      <Polygon points="100,109 145,30 180,30 100,170" fill="url(#cVL)" />
      <Line x1="100" y1="109" x2="100" y2="170" stroke="#E0F2FE" strokeWidth={1.4} strokeOpacity={0.7} />
    </Svg>
  );
}

export interface ContratoDocProps {
  contratoId: string;            // MHS/OHR058/2026
  sexo: "HOMBRE" | "MUJER";
  values: Record<string, string>; // {{KEY}} → valor
  generadoEn?: string;
}

function substitute(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (_m, key) => {
    const v = values[key];
    return v != null && v !== "" ? String(v) : `{{${key}}}`;
  });
}

export function ContratoDoc(props: ContratoDocProps) {
  const blocks: ContratoBlock[] = props.sexo === "MUJER" ? CONTRATO_MUJER_BLOCKS : CONTRATO_HOMBRE_BLOCKS;
  const v = props.values;
  const nombreTrabajador = v.NOMBRE_TRABAJADOR ?? "—";
  const representante = v.REPRESENTANTE_LEGAL ?? "—";

  return (
    <Document title={`Contrato ${props.contratoId}`} author="Vortex · MHS Integradora">
      <Page size="LETTER" style={styles.page} wrap>
        {/* Header con marca Vortex (se repite en cada hoja) */}
        <View style={styles.header} fixed>
          <View style={styles.brandWrap}>
            <LogoMark size={28} />
            <View>
              <Text style={styles.brandText}>VORTEX</Text>
              <Text style={styles.brandSub}>MHS INTEGRADORA · CONTRATOS</Text>
            </View>
          </View>
          <View style={styles.meta}>
            <Text style={styles.metaRow}>Contrato</Text>
            <Text style={styles.metaFolio}>{props.contratoId}</Text>
          </View>
        </View>

        <Text style={styles.titulo}>CONTRATO INDIVIDUAL DE TRABAJO POR TIEMPO DETERMINADO</Text>

        {blocks.map((b, i) => {
          const txt = substitute(b.x, v);
          switch (b.t) {
            case "intro":
              return <Text key={i} style={styles.intro}>{txt}</Text>;
            case "seccion":
              return <Text key={i} style={styles.seccion}>{txt}</Text>;
            case "subseccion":
              return <Text key={i} style={styles.subseccion}>{txt}</Text>;
            case "inciso":
              return <Text key={i} style={styles.inciso}>{txt}</Text>;
            case "clausula":
              return (
                <Text key={i} style={styles.clausula}>
                  <Text style={styles.clausulaTitulo}>{b.b} </Text>
                  {txt}
                </Text>
              );
            default:
              return <Text key={i} style={styles.parrafo}>{txt}</Text>;
          }
        })}

        {/* Firmas — amplias, lado a lado, con líneas para firmar */}
        <View style={styles.firmasWrap} wrap={false}>
          <View style={styles.firma}>
            <Text style={styles.firmaRol}>POR &quot;EL PATRÓN&quot;</Text>
            <View style={styles.firmaLinea} />
            <Text style={styles.firmaNombre}>C. {representante}</Text>
            <Text style={styles.firmaSub}>REPRESENTANTE LEGAL{"\n"}MHS INTEGRADORA COMERCIAL Y DE SERVICIOS S. DE R.L. DE C.V.</Text>
          </View>
          <View style={styles.firma}>
            <Text style={styles.firmaRol}>POR &quot;EL TRABAJADOR&quot;</Text>
            <View style={styles.firmaLinea} />
            <Text style={styles.firmaNombre}>C. {nombreTrabajador}</Text>
          </View>
        </View>

        {/* Número de página discreto (sin pie de página recargado) */}
        <Text style={styles.pageNum} fixed render={({ pageNumber, totalPages }) => `${pageNumber} de ${totalPages}`} />
      </Page>
    </Document>
  );
}
