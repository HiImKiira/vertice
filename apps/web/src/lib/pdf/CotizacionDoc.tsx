import { Document, Page, Text, View, StyleSheet, Svg, Polygon, Line } from "@react-pdf/renderer";

const C = {
  bg: "#0A1428",
  surface: "#0D1A30",
  border: "#1A2D4F",
  text: "#0A1428",
  muted: "#6B8AB5",
  gold: "#C9A961",
  goldLight: "#F1CB7E",
  goldDeep: "#85692A",
  blue: "#3B82F6",
  rowAlt: "#F7FAFF",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#fff",
    padding: 32,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: C.text,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: `1.5pt solid ${C.gold}`,
  },
  brand: { flexDirection: "column", flex: 1 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandName: { fontFamily: "Helvetica-Bold", fontSize: 14, letterSpacing: 0.5, color: C.bg },
  brandLegal: { fontSize: 7.5, color: C.muted, marginTop: 2, letterSpacing: 0.4 },
  brandTag: { fontSize: 7, color: C.goldDeep, marginTop: 1, fontFamily: "Helvetica-Oblique" },

  meta: { flexDirection: "column", alignItems: "flex-end" },
  metaTitle: { fontFamily: "Helvetica-Bold", fontSize: 18, color: C.bg, letterSpacing: 1.2 },
  metaFolio: { fontFamily: "Helvetica-Bold", fontSize: 11, color: C.goldDeep, marginTop: 2 },
  metaSub: { fontSize: 8, color: C.muted, marginTop: 4 },

  twoCol: { flexDirection: "row", gap: 14, marginBottom: 12 },
  card: {
    flex: 1,
    backgroundColor: C.rowAlt,
    border: `0.5pt solid ${C.border}`,
    padding: 8,
    borderRadius: 2,
  },
  cardLabel: { fontSize: 7, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 3 },
  cardValue: { fontSize: 10, color: C.bg, fontFamily: "Helvetica-Bold" },
  cardSub: { fontSize: 8, color: "#465670", marginTop: 1 },

  // tabla líneas
  table: { border: `0.5pt solid ${C.border}`, marginBottom: 12 },
  thead: { flexDirection: "row", backgroundColor: C.bg },
  th: { color: "#fff", padding: 6, fontFamily: "Helvetica-Bold", fontSize: 8.5, letterSpacing: 0.5 },
  tr: { flexDirection: "row", borderBottom: `0.3pt solid ${C.border}`, alignItems: "flex-start" },
  trAlt: { backgroundColor: C.rowAlt },
  td: { padding: 6, fontSize: 9, color: C.text },
  tdNum: { padding: 6, fontSize: 9, color: C.text, textAlign: "right" },

  // anchos columnas
  cIdx: { width: "5%" },
  cDesc: { width: "47%" },
  cQty: { width: "10%" },
  cUnit: { width: "10%" },
  cPrec: { width: "14%" },
  cTotal: { width: "14%" },

  // totales
  totalsWrap: { flexDirection: "row", marginBottom: 12 },
  totalsSpacer: { flex: 1 },
  totalsBox: {
    width: 220,
    border: `0.5pt solid ${C.border}`,
  },
  totRow: { flexDirection: "row", padding: 6, borderBottom: `0.3pt solid ${C.border}` },
  totRowFinal: { flexDirection: "row", padding: 8, backgroundColor: C.bg },
  totLabel: { flex: 1, fontSize: 9, color: C.muted },
  totLabelFinal: { flex: 1, fontSize: 11, color: "#fff", fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  totValue: { fontSize: 9, color: C.bg, fontFamily: "Helvetica-Bold", textAlign: "right" },
  totValueFinal: { fontSize: 13, color: C.goldLight, fontFamily: "Helvetica-Bold", textAlign: "right" },

  // notas / condiciones
  notesWrap: { marginBottom: 12 },
  noteLabel: { fontSize: 7.5, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 },
  noteText: { fontSize: 8.5, color: C.text, lineHeight: 1.4 },

  // firmas
  firmas: { flexDirection: "row", gap: 24, marginTop: 28, marginBottom: 18 },
  firmaCol: { flex: 1 },
  firmaLine: { borderTop: `0.6pt solid ${C.bg}`, marginBottom: 4 },
  firmaLabel: { fontSize: 8, color: C.muted, textAlign: "center", letterSpacing: 0.5 },
  firmaName: { fontSize: 9, color: C.bg, textAlign: "center", fontFamily: "Helvetica-Bold", marginTop: 2 },

  // footer Vortex
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    borderTop: `0.4pt solid ${C.gold}`,
    paddingTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerLeft: { fontSize: 7, color: C.muted, letterSpacing: 0.5 },
  footerRight: { fontSize: 7, color: C.goldDeep, letterSpacing: 1.2, fontFamily: "Helvetica-Bold" },

  estado: {
    position: "absolute",
    top: 26,
    right: 32,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2,
  },
  estadoText: { color: "#fff", fontSize: 7, letterSpacing: 1.4, fontFamily: "Helvetica-Bold" },
});

// Logo "V" estilizado de Vortex
function VortexMark() {
  return (
    <Svg width={28} height={28} viewBox="0 0 100 100">
      <Polygon points="50,8 90,30 90,70 50,92 10,70 10,30" fill={C.bg} />
      <Polygon points="50,18 80,34 80,66 50,82 20,66 20,34" fill="none" stroke={C.gold} strokeWidth={1.5} />
      <Line x1="30" y1="38" x2="50" y2="68" stroke={C.goldLight} strokeWidth={4} />
      <Line x1="70" y1="38" x2="50" y2="68" stroke={C.goldLight} strokeWidth={4} />
    </Svg>
  );
}

export interface CotizacionPDFData {
  folio: string;
  fecha: string; // ISO date
  vigencia_dias: number;
  estado: string;
  cliente: {
    razon_social: string;
    rfc: string | null;
    contacto_nombre: string | null;
    contacto_email: string | null;
    contacto_telefono: string | null;
    direccion: string | null;
  };
  lineas: Array<{
    descripcion_snapshot: string;
    unidad_snapshot: string | null;
    cantidad: number;
    precio_unitario: number;
    iva_pct: number;
    subtotal: number;
    iva: number;
    total: number;
  }>;
  subtotal: number;
  iva_total: number;
  total: number;
  notas: string | null;
  condiciones: string | null;
  creado_por_nombre: string | null;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function estadoColor(estado: string): string {
  switch (estado) {
    case "ACEPTADA": case "FACTURADA": return "#10B981";
    case "ENVIADA": return "#3B82F6";
    case "RECHAZADA": case "CANCELADA": return "#EF4444";
    case "BORRADOR": return "#6B7280";
    default: return "#6B7280";
  }
}

export function CotizacionDoc({ data }: { data: CotizacionPDFData }) {
  const vencimiento = addDays(data.fecha, data.vigencia_dias);
  return (
    <Document
      title={`Cotización ${data.folio}`}
      author="MHS Integradora · Vortex"
      subject={`Cotización para ${data.cliente.razon_social}`}
    >
      <Page size="LETTER" style={styles.page}>
        {/* Estado pill */}
        {data.estado !== "BORRADOR" && (
          <View style={[styles.estado, { backgroundColor: estadoColor(data.estado) }]}>
            <Text style={styles.estadoText}>{data.estado}</Text>
          </View>
        )}

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brand}>
            <View style={styles.brandRow}>
              <VortexMark />
              <View>
                <Text style={styles.brandName}>MHS INTEGRADORA</Text>
                <Text style={styles.brandLegal}>COMERCIAL Y DE SERVICIOS S. DE R.L. DE C.V.</Text>
                <Text style={styles.brandTag}>by Vortex · centro de operación RH y comercial</Text>
              </View>
            </View>
          </View>
          <View style={styles.meta}>
            <Text style={styles.metaTitle}>COTIZACIÓN</Text>
            <Text style={styles.metaFolio}>{data.folio}</Text>
            <Text style={styles.metaSub}>Fecha: {formatDate(data.fecha)}</Text>
            <Text style={styles.metaSub}>Vigencia: {data.vigencia_dias} días (al {formatDate(vencimiento)})</Text>
          </View>
        </View>

        {/* Cliente */}
        <View style={styles.twoCol}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Cotizado a</Text>
            <Text style={styles.cardValue}>{data.cliente.razon_social}</Text>
            {data.cliente.rfc && <Text style={styles.cardSub}>RFC: {data.cliente.rfc}</Text>}
            {data.cliente.direccion && <Text style={styles.cardSub}>{data.cliente.direccion}</Text>}
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Contacto</Text>
            <Text style={styles.cardValue}>{data.cliente.contacto_nombre ?? "—"}</Text>
            {data.cliente.contacto_email && <Text style={styles.cardSub}>{data.cliente.contacto_email}</Text>}
            {data.cliente.contacto_telefono && <Text style={styles.cardSub}>{data.cliente.contacto_telefono}</Text>}
          </View>
        </View>

        {/* Tabla líneas */}
        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={[styles.th, styles.cIdx]}>#</Text>
            <Text style={[styles.th, styles.cDesc]}>Concepto</Text>
            <Text style={[styles.th, styles.cQty, { textAlign: "right" }]}>Cant.</Text>
            <Text style={[styles.th, styles.cUnit]}>Unidad</Text>
            <Text style={[styles.th, styles.cPrec, { textAlign: "right" }]}>P. Unitario</Text>
            <Text style={[styles.th, styles.cTotal, { textAlign: "right" }]}>Subtotal</Text>
          </View>
          {data.lineas.map((l, i) => (
            <View key={i} style={[styles.tr, i % 2 === 1 ? styles.trAlt : {}]}>
              <Text style={[styles.td, styles.cIdx]}>{i + 1}</Text>
              <Text style={[styles.td, styles.cDesc]}>{l.descripcion_snapshot}</Text>
              <Text style={[styles.tdNum, styles.cQty]}>
                {Number(l.cantidad).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
              </Text>
              <Text style={[styles.td, styles.cUnit]}>{l.unidad_snapshot ?? "PIEZA"}</Text>
              <Text style={[styles.tdNum, styles.cPrec]}>{formatMoney(Number(l.precio_unitario))}</Text>
              <Text style={[styles.tdNum, styles.cTotal]}>{formatMoney(Number(l.subtotal))}</Text>
            </View>
          ))}
        </View>

        {/* Totales */}
        <View style={styles.totalsWrap}>
          <View style={styles.totalsSpacer} />
          <View style={styles.totalsBox}>
            <View style={styles.totRow}>
              <Text style={styles.totLabel}>Subtotal</Text>
              <Text style={styles.totValue}>{formatMoney(Number(data.subtotal))}</Text>
            </View>
            <View style={styles.totRow}>
              <Text style={styles.totLabel}>IVA</Text>
              <Text style={styles.totValue}>{formatMoney(Number(data.iva_total))}</Text>
            </View>
            <View style={styles.totRowFinal}>
              <Text style={styles.totLabelFinal}>TOTAL MXN</Text>
              <Text style={styles.totValueFinal}>{formatMoney(Number(data.total))}</Text>
            </View>
          </View>
        </View>

        {/* Notas y condiciones */}
        {(data.notas || data.condiciones) && (
          <View style={styles.notesWrap}>
            {data.notas && (
              <>
                <Text style={styles.noteLabel}>Notas</Text>
                <Text style={styles.noteText}>{data.notas}</Text>
              </>
            )}
            {data.condiciones && (
              <View style={{ marginTop: 6 }}>
                <Text style={styles.noteLabel}>Condiciones</Text>
                <Text style={styles.noteText}>{data.condiciones}</Text>
              </View>
            )}
          </View>
        )}

        {/* Firmas */}
        <View style={styles.firmas}>
          <View style={styles.firmaCol}>
            <View style={styles.firmaLine} />
            <Text style={styles.firmaLabel}>Atentamente</Text>
            <Text style={styles.firmaName}>{data.creado_por_nombre ?? "MHS Integradora"}</Text>
          </View>
          <View style={styles.firmaCol}>
            <View style={styles.firmaLine} />
            <Text style={styles.firmaLabel}>Conforme cliente</Text>
            <Text style={styles.firmaName}>{data.cliente.razon_social}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerLeft}>
            MHS Integradora · Comercial y de Servicios S. de R.L. de C.V. · Mérida, Yucatán
          </Text>
          <Text style={styles.footerRight}>BY VORTEX</Text>
        </View>
      </Page>
    </Document>
  );
}
