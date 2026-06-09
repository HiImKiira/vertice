// Tipo de bloque de contrato (compartido por las plantillas auto-generadas).
export interface ContratoBlock {
  /** intro | seccion (centrada) | subseccion (I.- II.-) | inciso (a).-) | clausula (PRIMERA.-) | parrafo */
  t: "intro" | "seccion" | "subseccion" | "inciso" | "clausula" | "parrafo";
  /** Texto en bold al inicio (solo en clausula, ej. "PRIMERA.-") */
  b?: string;
  /** Texto del bloque (puede contener {{LLAVE}}) */
  x: string;
}
