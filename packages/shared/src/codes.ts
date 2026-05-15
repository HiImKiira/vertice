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

export const SALARIO_DIARIO_DEFAULT = 393.8;

export const CODIGO_SPEC: Record<CodigoAsistencia, CodigoSpec> = {
  A:   { codigo: "A",   nombre: "Asistencia",         descripcion: "Día trabajado normal",                       dia_laborado: true,  genera_prima_dominical: true,  descuento: 0,                       extra: false, color: "#3B6D11" },
  AF:  { codigo: "AF",  nombre: "Asistencia forzada", descripcion: "Asistencia capturada por administrador",     dia_laborado: true,  genera_prima_dominical: true,  descuento: 0,                       extra: false, color: "#3B6D11" },
  DS:  { codigo: "DS",  nombre: "Descanso pagado",    descripcion: "Día de descanso programado",                 dia_laborado: true,  genera_prima_dominical: false, descuento: 0,                       extra: false, color: "#0F6E56" },
  DT:  { codigo: "DT",  nombre: "Doble turno",        descripcion: "Trabajó doble jornada — suma turno extra",   dia_laborado: true,  genera_prima_dominical: true,  descuento: 0,                       extra: true,  color: "#0F6E56" },
  INH: { codigo: "INH", nombre: "Inhábil",            descripcion: "Día inhábil pagado (no laborable)",          dia_laborado: true,  genera_prima_dominical: false, descuento: 0,                       extra: false, color: "#854F0B" },
  FER: { codigo: "FER", nombre: "Feriado",            descripcion: "Día feriado oficial",                        dia_laborado: true,  genera_prima_dominical: false, descuento: 0,                       extra: false, color: "#854F0B" },
  PCG: { codigo: "PCG", nombre: "Permiso c/goce",     descripcion: "Permiso con goce de sueldo",                 dia_laborado: true,  genera_prima_dominical: false, descuento: 0,                       extra: false, color: "#534AB7" },
  PSG: { codigo: "PSG", nombre: "Permiso s/goce",     descripcion: "Permiso sin goce de sueldo",                 dia_laborado: false, genera_prima_dominical: false, descuento: 0,                       extra: false, color: "#5F5E5A" },
  I:   { codigo: "I",   nombre: "Incapacidad",        descripcion: "Incapacidad médica",                         dia_laborado: false, genera_prima_dominical: false, descuento: 0,                       extra: false, color: "#5F5E5A" },
  F:   { codigo: "F",   nombre: "Falta",              descripcion: "Falta injustificada — descuento aplica",     dia_laborado: false, genera_prima_dominical: false, descuento: SALARIO_DIARIO_DEFAULT,  extra: false, color: "#A32D2D" },
  SN:  { codigo: "SN",  nombre: "Sin marcar",         descripcion: "Aún no se captura código para este día",     dia_laborado: false, genera_prima_dominical: false, descuento: 0,                       extra: false, color: "#888780" },
};

export function esDiaLaborado(codigo: CodigoAsistencia): boolean {
  return CODIGO_SPEC[codigo].dia_laborado;
}

export function generaPrimaDominical(codigo: CodigoAsistencia, fecha: Date): boolean {
  return fecha.getDay() === 0 && CODIGO_SPEC[codigo].genera_prima_dominical;
}

export function esTurnoExtra(codigo: CodigoAsistencia): boolean {
  return CODIGO_SPEC[codigo].extra;
}
