/**
 * Conversión de números a letras en español (México).
 * Pensado para sueldos: cubre 0..999,999,999 con dos decimales como centavos.
 *
 * sueldoEnLetra(9451.20) →
 *   "NUEVE MIL CUATROCIENTOS CINCUENTA Y UN PESOS 20/100 MONEDA NACIONAL"
 */

const UNIDADES = [
  "", "UNO", "DOS", "TRES", "CUATRO", "CINCO",
  "SEIS", "SIETE", "OCHO", "NUEVE",
];

const ESPECIALES_10_19 = [
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE",
  "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE",
];

const DECENAS = [
  "", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA",
  "SESENTA", "SETENTA", "OCHENTA", "NOVENTA",
];

const VEINTI = [
  "VEINTE", "VEINTIUNO", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO",
  "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE",
];

const CENTENAS = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS",
  "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
];

/** Convierte un entero 0..999 a letras. */
function _0_999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]!);
  if (resto > 0) {
    if (resto < 10) partes.push(UNIDADES[resto]!);
    else if (resto < 20) partes.push(ESPECIALES_10_19[resto - 10]!);
    else if (resto < 30) partes.push(VEINTI[resto - 20]!);
    else {
      const dec = Math.floor(resto / 10);
      const u = resto % 10;
      if (u === 0) partes.push(DECENAS[dec]!);
      else partes.push(`${DECENAS[dec]} Y ${UNIDADES[u]}`);
    }
  }
  return partes.join(" ");
}

/** Convierte un entero 0..999,999,999 a letras. */
export function numeroALetras(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "CERO";

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  const partes: string[] = [];

  if (millones > 0) {
    if (millones === 1) partes.push("UN MILLÓN");
    else partes.push(`${_0_999(millones)} MILLONES`);
  }

  if (miles > 0) {
    if (miles === 1) partes.push("MIL");
    else partes.push(`${_0_999(miles)} MIL`);
  }

  if (resto > 0) {
    partes.push(_0_999(resto));
  }

  return partes.join(" ").trim();
}

/**
 * Formato sueldo: "NUEVE MIL CUATROCIENTOS CINCUENTA Y UN PESOS 20/100 MONEDA NACIONAL"
 * Convierte el "UNO" final a "UN" cuando es seguido de "PESOS" (concordancia gramatical).
 */
export function sueldoEnLetra(monto: number): string {
  if (!isFinite(monto) || monto < 0) return "";
  const entero = Math.floor(monto);
  const centavos = Math.round((monto - entero) * 100);
  let letra = numeroALetras(entero);
  // "UNO" → "UN" antes de "PESOS" (NUEVE MIL CUATROCIENTOS CINCUENTA Y UN PESOS)
  letra = letra.replace(/\bUNO$/, "UN");
  letra = letra.replace(/\bVEINTIUNO$/, "VEINTIÚN");
  const cc = String(centavos).padStart(2, "0");
  return `${letra} PESOS ${cc}/100 MONEDA NACIONAL`;
}
