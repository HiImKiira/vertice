import { Document, Page, Text, View, StyleSheet, Svg, Polygon, Line, Defs, LinearGradient, Stop } from "@react-pdf/renderer";
import { pickTemplate } from "./templates";

const C = {
  text: "#0A1428",
  muted: "#4A6690",
  border: "#1A2D4F",
  blue: "#1D4ED8",
  blueLight: "#93C5FD",
  blueDeep: "#0F2E70",
  gold: "#C9A961",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#fff",
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 50,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    color: C.text,
    lineHeight: 1.45,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
    paddingBottom: 12,
    borderBottom: `1.5pt solid ${C.blue}`,
  },
  brandWrap: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandText: { fontFamily: "Helvetica-Bold", fontSize: 18, letterSpacing: 2, color: C.blueDeep },
  brandSub: { fontSize: 7, color: C.muted, letterSpacing: 1.2, marginTop: 2 },
  meta: { marginLeft: "auto", alignItems: "flex-end" },
  metaRow: { fontSize: 8, color: C.muted },
  metaFolio: { fontFamily: "Helvetica-Bold", fontSize: 13, color: C.blue, marginTop: 2 },

  titulo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: C.blueDeep,
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: 0.4,
  },
  intro: {
    fontSize: 10,
    textAlign: "justify",
    marginBottom: 12,
    lineHeight: 1.55,
  },

  sectionHeader: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: C.blueDeep,
    marginTop: 12,
    marginBottom: 6,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  clausula: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    color: C.text,
    marginTop: 8,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 10,
    textAlign: "justify",
    marginBottom: 6,
    lineHeight: 1.5,
  },
  paragraphIndent: {
    fontSize: 10,
    textAlign: "justify",
    marginBottom: 6,
    marginLeft: 14,
    lineHeight: 1.5,
  },

  signaturesWrap: {
    marginTop: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
  },
  signature: { width: "45%", alignItems: "center" },
  signatureLine: {
    borderTopWidth: 0.5,
    borderTopColor: C.text,
    width: "100%",
    marginTop: 40,
    marginBottom: 4,
  },
  signatureTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: C.blueDeep,
    marginBottom: 2,
  },
  signatureName: { fontFamily: "Helvetica-Bold", fontSize: 10, color: C.text, textAlign: "center" },
  signatureSub: { fontSize: 8, color: C.muted, textAlign: "center", marginTop: 2 },

  footer: {
    position: "absolute",
    bottom: 22,
    left: 50,
    right: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.muted,
    borderTop: `0.5pt solid #ddd`,
    paddingTop: 6,
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
        <LinearGradient id="cVR" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={C.blue} />
          <Stop offset="100%" stopColor={C.blueDeep} />
        </LinearGradient>
      </Defs>
      <Polygon points="20,30 55,30 100,109 100,170" fill="url(#cVL)" />
      <Polygon points="100,109 145,30 180,30 100,170" fill="url(#cVR)" />
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

function substitute(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_m, key) => {
    const v = values[key];
    return v != null && v !== "" ? String(v) : `{{${key}}}`;
  });
}

interface Block {
  type: "intro" | "section" | "clausula" | "para" | "para-indent" | "signatures-marker";
  text: string;
}

/**
 * Parsea el texto de la plantilla en bloques estructurados para renderizar
 * con estilos. Reglas heurísticas:
 *   - DECLARACIONES / CLAUSULAS / CONTRATO ... → sectionHeader
 *   - PRIMERA.- / SEGUNDA.- / etc. → clausula bold
 *   - I.-  /  II.- → sectionHeader
 *   - a).- / b).- → paragraph indented
 *   - resto → paragraph
 *   - "POR EL TRABAJADOR" + lineas siguientes → bloque de firmas
 */
function parseTemplate(text: string): Block[] {
  // Normalizar saltos: dejar uno entre párrafos, no acumular vacíos
  const lines = text.split(/\r?\n/);
  const paragraphs: string[] = [];
  let current = "";
  for (const ln of lines) {
    if (ln.trim() === "") {
      if (current) { paragraphs.push(current.trim()); current = ""; }
    } else {
      current = current ? current + " " + ln.trim() : ln.trim();
    }
  }
  if (current) paragraphs.push(current.trim());

  const blocks: Block[] = [];
  let firmasMode = false;
  for (const p of paragraphs) {
    if (firmasMode) break; // bloque firmas se renderiza separado
    if (/^POR "EL TRABAJADOR"$/i.test(p) || /^POR \"EL PATR[ÓO]N\"$/i.test(p)) {
      firmasMode = true;
      break;
    }
    if (/^CONTRATO (\{\{|MHS)/.test(p) || /^CONTRATO INDIVIDUAL DE TRABAJO/i.test(p)) {
      blocks.push({ type: "intro", text: p });
      continue;
    }
    if (/^DECLARACIONES$/i.test(p) || /^CL[ÁA]USULAS$/i.test(p)) {
      blocks.push({ type: "section", text: p });
      continue;
    }
    if (/^(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|S[ÉE]PTIMA|OCTAVA|NOVENA|D[ÉE]CIMA|D[ÉE]CIMA \w+)\.-/i.test(p)) {
      // Separar título de párrafo
      const m = p.match(/^([A-ZÁÉÍÓÚ ]+\.-)\s*(.*)$/i);
      if (m) {
        blocks.push({ type: "clausula", text: m[1]! });
        if (m[2]) blocks.push({ type: "para", text: m[2] });
      } else {
        blocks.push({ type: "clausula", text: p });
      }
      continue;
    }
    if (/^I+\.-/i.test(p) && p.length < 80) {
      blocks.push({ type: "section", text: p });
      continue;
    }
    if (/^[a-z]\)\.-/i.test(p)) {
      blocks.push({ type: "para-indent", text: p });
      continue;
    }
    blocks.push({ type: "para", text: p });
  }

  return blocks;
}

export function ContratoDoc(props: ContratoDocProps) {
  const tpl = pickTemplate(props.sexo);
  const filled = substitute(tpl, props.values);
  const blocks = parseTemplate(filled);
  const nombreTrabajador = props.values.NOMBRE_TRABAJADOR ?? "—";
  const representante = props.values.REPRESENTANTE_LEGAL ?? "—";

  return (
    <Document title={`Contrato ${props.contratoId}`} author="Vortex · MHS Integradora">
      <Page size="LETTER" style={styles.page} wrap>
        {/* Header con marca Vortex */}
        <View style={styles.header} fixed>
          <View style={styles.brandWrap}>
            <LogoMark size={30} />
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

        {/* Cuerpo */}
        <Text style={styles.titulo}>CONTRATO INDIVIDUAL DE TRABAJO POR TIEMPO DETERMINADO</Text>

        {blocks.map((b, i) => {
          if (b.type === "section") return <Text key={i} style={styles.sectionHeader}>{b.text}</Text>;
          if (b.type === "clausula") return <Text key={i} style={styles.clausula}>{b.text}</Text>;
          if (b.type === "para-indent") return <Text key={i} style={styles.paragraphIndent}>{b.text}</Text>;
          if (b.type === "intro") return <Text key={i} style={styles.intro}>{b.text}</Text>;
          return <Text key={i} style={styles.paragraph}>{b.text}</Text>;
        })}

        {/* Firmas */}
        <View style={styles.signaturesWrap} wrap={false}>
          <View style={styles.signature}>
            <Text style={styles.signatureTitle}>POR &quot;EL TRABAJADOR&quot;</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureName}>C. {nombreTrabajador}</Text>
          </View>
          <View style={styles.signature}>
            <Text style={styles.signatureTitle}>POR &quot;EL PATRÓN&quot;</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureName}>C. {representante}</Text>
            <Text style={styles.signatureSub}>REPRESENTANTE LEGAL DE LA PERSONA MORAL</Text>
            <Text style={styles.signatureSub}>MHS INTEGRADORA COMERCIAL Y DE SERVICIOS S. DE R.L. DE C.V.</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>Vortex · {props.contratoId} · {props.sexo}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
