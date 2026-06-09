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
  "DL",
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
  /**
   * Días EXTRA de salario que suma este código, ADEMÁS del día base.
   *  - DT (doble turno): 1 → paga 2x ese día (1 base + 1 extra)
   *  - DL (descanso laborado): 2 → paga 3x ese día (1 base + 2 extra), como feriado trabajado
   *  - resto: 0
   */
  diasExtra: number;
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
  A:   { codigo: "A",   nombre: "Asistencia",         descripcion: "Día trabajado normal",                       dia_laborado: true,  genera_prima_dominical: true,  descuento: 0,                          extra: false, diasExtra: 0, color: "#3B6D11" },
  AF:  { codigo: "AF",  nombre: "Asistencia forzada", descripcion: "Asistencia capturada por administrador",     dia_laborado: true,  genera_prima_dominical: true,  descuento: 0,                          extra: false, diasExtra: 0, color: "#3B6D11" },
  DS:  { codigo: "DS",  nombre: "Descanso",           descripcion: "Día de descanso semanal (pagado, no trabajó)", dia_laborado: true,  genera_prima_dominical: false, descuento: 0,                          extra: false, diasExtra: 0, color: "#0F6E56" },
  DL:  { codigo: "DL",  nombre: "Descanso laborado",  descripcion: "Trabajó en su día de descanso — pago triple (3x) como feriado laborado", dia_laborado: true, genera_prima_dominical: false, descuento: 0,             extra: true,  diasExtra: 2, color: "#0E7490" },
  DT:  { codigo: "DT",  nombre: "Doble turno",        descripcion: "Trabajó doble jornada — suma turno extra",   dia_laborado: true,  genera_prima_dominical: true,  descuento: 0,                          extra: true,  diasExtra: 1, color: "#0F6E56" },
  INH: { codigo: "INH", nombre: "Inhábil",            descripcion: "Día inhábil pagado (no laborable)",          dia_laborado: true,  genera_prima_dominical: false, descuento: 0,                          extra: false, diasExtra: 0, color: "#854F0B" },
  FER: { codigo: "FER", nombre: "Feriado",            descripcion: "Día feriado oficial",                        dia_laborado: true,  genera_prima_dominical: false, descuento: 0,                          extra: false, diasExtra: 0, color: "#854F0B" },
  PCG: { codigo: "PCG", nombre: "Permiso c/goce",     descripcion: "Permiso con goce de sueldo",                 dia_laborado: true,  genera_prima_dominical: false, descuento: 0,                          extra: false, diasExtra: 0, color: "#534AB7" },
  PSG: { codigo: "PSG", nombre: "Permiso s/goce",     descripcion: "Permiso sin goce de sueldo",                 dia_laborado: false, genera_prima_dominical: false, descuento: 0,                          extra: false, diasExtra: 0, color: "#5F5E5A" },
  I:   { codigo: "I",   nombre: "Incapacidad",        descripcion: "Incapacidad médica",                         dia_laborado: false, genera_prima_dominical: false, descuento: 0,                          extra: false, diasExtra: 0, color: "#5F5E5A" },
  F:   { codigo: "F",   nombre: "Falta",              descripcion: "Falta injustificada — descuento aplica",     dia_laborado: false, genera_prima_dominical: false, descuento: DESCUENTO_FALTA_DEFAULT,    extra: false, diasExtra: 0, color: "#A32D2D" },
  SN:  { codigo: "SN",  nombre: "Sin marcar",         descripcion: "Aún no se captura código para este día",     dia_laborado: false, genera_prima_dominical: false, descuento: 0,                          extra: false, diasExtra: 0, color: "#888780" },
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
 * - `DL`: +1 día lab, +2 extra (descanso laborado = pago triple, como feriado trabajado)
 * - `DS`, `INH`, `FER`, `PCG`: +1 día lab (pagado, sin prima dom aunque caiga domingo)
 * - `F`: +1 falta (descuento)
 * - `PSG`, `I`, `SN`: sin efecto
 *
 * `diasDT` en el retorno representa el total de DÍAS EXTRA pagados
 * (DT suma 1, DL suma 2), para el cálculo de `valorExtra`.
 */
export function calcularNominaPeriodo(
  marcas: { fecha: string; codigo: CodigoAsistencia }[],
  rates: { pagoDia?: number; primaDom?: number; descFalta?: number } = {},
): ResumenPeriodoEmpleado {
  const pagoDia = rates.pagoDia ?? PAGO_DIA_DEFAULT;
  const primaDom = rates.primaDom ?? PRIMA_DOMINICAL_DEFAULT;
  const descFalta = rates.descFalta ?? DESCUENTO_FALTA_DEFAULT;

  let diasLab = 0;
  let diasExtraPago = 0; // días equivalentes de pago extra (DT=1, DL=2)
  let diasFalta = 0;
  let diasDom = 0;

  for (const { fecha, codigo } of marcas) {
    const spec = CODIGO_SPEC[codigo];
    if (!spec) continue;
    const esDomingo = new Date(`${fecha}T00:00:00`).getDay() === 0;
    if (spec.dia_laborado) diasLab++;
    diasExtraPago += spec.diasExtra;
    if (spec.genera_prima_dominical && esDomingo) diasDom++;
    if (spec.descuento > 0) diasFalta++;
  }

  const diasDT = diasExtraPago; // compat: el campo histórico ahora es "días extra pagados"
  const valorExtra = diasExtraPago * pagoDia;
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
