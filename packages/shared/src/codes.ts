/**
 * Códigos de asistencia oficiales de Vértice.
 *
 * Cada código declara:
 *   - `dia_laborado`: si cuenta como día trabajado para nómina.
 *   - `genera_prima_dominical`: si en domingo genera prima.
 *   - `descuento`: descuento fijo aplicado (en pesos MXN).
 *   - `extra`: si suma turno extra (DT).
 */

export const CODIGOS = [
  "A",
  "AF",
  "DS",
  "DT",
  "INH",
  "FER",
  "PCG",
  "PSG",
  "I",
  "F",
  "SN",
] as const;

export type CodigoAsistencia = (typeof CODIGOS)[number];

export interface CodigoSpec {
  codigo: CodigoAsistencia;
  nombre: string;
  descripcion: string;
  dia_laborado: boolean;
  genera_prima_dominical: boolean;
  descuento: number;
  extra: boolean;
  color: string;
}

/**
 * Constantes oficiales de nómina (origen: sistema MHS RH Pro vigente).
 * Estos números son la verdad para el cálculo quincenal — cámbialos solo si
 * cambia la política de la empresa, no por código.
 */
export const PAGO_DIA_DEFAULT       = 315.04; // sueldo base por día (MXN)
export const PRIMA_DOMINICAL_DEFAULT =  78.76; // 25% del sueldo (LFT art. 71)
export const DESCUENTO_FALTA_DEFAULT = 393.80; // descuento por falta injustificada (día + prima proporcional + recargo)

export const CODIGO_SPEC: Record<CodigoAsistencia, CodigoSpec> = {
  A:   { codigo: "A",   nombre: "Asistencia",         descripcion: "Día trabajado normal",                       dia_laborado: true,  genera_prima_dominical: true,  descuento: 0,                          extra: false, color: "#3B6D11" },
  AF:  { codigo: "AF",  nombre: "Asistencia forzada", descripcion: "Asistencia capturada por administrador",     dia_laborado: true,  genera_prima_dominical: true,  descuento: 0,                          extra: false, color: "#3B6D11" },
  DS:  { codigo: "DS",  nombre: "Descanso pagado",    descripcion: "Día de descanso programado",                 dia_laborado: true,  genera_prima_dominical: false, descuento: 0,                          extra: false, color: "#0F6E56" },
  DT:  { codigo: "DT",  nombre: "Doble turno",        descripcion: "Trabajó doble jornada — suma turno extra",   dia_laborado: true,  genera_prima_dominical: true,  descuento: 0,                          extra: true,  color: "#0F6E56" },
  INH: { codigo: "INH", nombre: "Inhábil",            descripcion: "Día inhábil pagado (no laborable)",          dia_laborado: true,  genera_prima_dominical: false, descuento: 0,                          extra: false, color: "#854F0B" },
  FER: { codigo: "FER", nombre: "Feriado",            descripcion: "Día feriado oficial",                        dia_laborado: true,  genera_prima_dominical: false, descuento: 0,                          extra: false, color: "#854F0B" },
  PCG: { codigo: "PCG", nombre: "Permiso c/goce",     descripcion: "Permiso con goce de sueldo",                 dia_laborado: true,  genera_prima_dominical: false, descuento: 0,                          extra: false, color: "#534AB7" },
  PSG: { codigo: "PSG", nombre: "Permiso s/goce",     descripcion: "Permiso sin goce de sueldo",                 dia_laborado: false, genera_prima_dominical: false, descuento: 0,                          extra: false, color: "#5F5E5A" },
  I:   { codigo: "I",   nombre: "Incapacidad",        descripcion: "Incapacidad médica",                         dia_laborado: false, genera_prima_dominical: false, descuento: 0,                          extra: false, color: "#5F5E5A" },
  F:   { codigo: "F",   nombre: "Falta",              descripcion: "Falta injustificada — descuento aplica",     dia_laborado: false, genera_prima_dominical: false, descuento: DESCUENTO_FALTA_DEFAULT,    extra: false, color: "#A32D2D" },
  SN:  { codigo: "SN",  nombre: "Sin marcar",         descripcion: "Aún no se captura código para este día",     dia_laborado: false, genera_prima_dominical: false, descuento: 0,                          extra: false, color: "#888780" },
};

export interface ResumenPeriodoEmpleado {
  diasLab: number;
  diasDT: number;
  diasFalta: number;
  diasDom: number;
  valorExtra: number;
  primaDom: number;
  descFaltas: number;
  pagoEstim: number;
}

/**
 * Calcula la nómina de un empleado para un período de fechas.
 * Reglas tomadas literal del sistema original (apiExportarNomina en Code.js:3852):
 * - `A`, `AF`: +1 día lab, +1 prima dom si domingo
 * - `DT`: +1 día lab, +1 turno extra, +1 prima dom si domingo
 * - `DS`, `INH`, `FER`, `PCG`: +1 día lab (pagado, sin prima dom aunque caiga domingo)
 * - `F`: +1 falta (descuento)
 * - `PSG`, `I`, `SN`: sin efecto
 */
export function calcularNominaPeriodo(
  marcas: { fecha: string; codigo: CodigoAsistencia }[],
  rates: { pagoDia?: number; primaDom?: number; descFalta?: number } = {},
): ResumenPeriodoEmpleado {
  const pagoDia = rates.pagoDia ?? PAGO_DIA_DEFAULT;
  const primaDom = rates.primaDom ?? PRIMA_DOMINICAL_DEFAULT;
  const descFalta = rates.descFalta ?? DESCUENTO_FALTA_DEFAULT;

  let diasLab = 0;
  let diasDT = 0;
  let diasFalta = 0;
  let diasDom = 0;

  for (const { fecha, codigo } of marcas) {
    const esDomingo = new Date(`${fecha}T00:00:00`).getDay() === 0;
    if (codigo === "DT") {
      diasLab++;
      diasDT++;
      if (esDomingo) diasDom++;
    } else if (codigo === "A" || codigo === "AF") {
      diasLab++;
      if (esDomingo) diasDom++;
    } else if (codigo === "DS" || codigo === "INH" || codigo === "FER" || codigo === "PCG") {
      diasLab++;
    } else if (codigo === "F") {
      diasFalta++;
    }
  }

  const valorExtra = diasDT * pagoDia;
  const primaDomTotal = diasDom * primaDom;
  const descFaltasTotal = diasFalta * descFalta;
  const pagoEstim = diasLab * pagoDia + valorExtra + primaDomTotal - descFaltasTotal;

  return {
    diasLab,
    diasDT,
    diasFalta,
    diasDom,
    valorExtra,
    primaDom: primaDomTotal,
    descFaltas: descFaltasTotal,
    pagoEstim,
  };
}

export function esDiaLaborado(codigo: CodigoAsistencia): boolean {
  return CODIGO_SPEC[codigo].dia_laborado;
}

export function generaPrimaDominical(codigo: CodigoAsistencia, fecha: Date): boolean {
  return fecha.getDay() === 0 && CODIGO_SPEC[codigo].genera_prima_dominical;
}

export function esTurnoExtra(codigo: CodigoAsistencia): boolean {
  return CODIGO_SPEC[codigo].extra;
}
