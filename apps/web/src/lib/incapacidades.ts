/**
 * Catálogo y máquina de estados para incapacidades IMSS.
 *
 * Define las transiciones válidas, etiquetas en español, ayudas para UI
 * y constantes de cálculo (descuento por enfermedad general, etc.).
 */

export type IncapacidadTipo =
  | "ENFERMEDAD_GENERAL"
  | "RIESGO_TRABAJO"
  | "RIESGO_TRAYECTO"
  | "RIESGO_BIOLOGICO";

export type IncapacidadEstado =
  | "REPORTADA"
  | "DOCS_EMPLEADO"
  | "RH_VALIDA"
  | "MEDICINA_TRABAJO"
  | "DICTAMEN"
  | "ALTA_PENDIENTE"
  | "CERRADA"
  | "RECHAZADA"
  | "CANCELADA";

export interface TipoSpec {
  id: IncapacidadTipo;
  label: string;
  short: string;
  description: string;
  color: string;             // hex
  iconBg: string;
  flujoEstados: IncapacidadEstado[]; // orden esperado
  pagaImssDesde: number;     // días que empresa cubre antes
  descuentoEmpresa: number;  // monto descontado por día no laborado (1-3)
  documentosRequeridos: { tipo: string; label: string; requerido: boolean; etapa: IncapacidadEstado }[];
  notas: string[];
  // ¿Es proceso ST-7 (notifica + flujo completo) o solo notificación simple?
  esST7: boolean;
  // Overrides de etiqueta/descripción de estado según el tipo. Ej: para
  // enfermedad general, DOCS_EMPLEADO = "Recepción de incapacidad médica".
  estadoLabels?: Partial<Record<IncapacidadEstado, { label: string; desc: string }>>;
}

export const TIPO_SPECS: Record<IncapacidadTipo, TipoSpec> = {
  ENFERMEDAD_GENERAL: {
    id: "ENFERMEDAD_GENERAL",
    label: "Enfermedad general",
    short: "Enferm.",
    description: "Viral o infección ajena al trabajo. IMSS paga desde día 4 (1-3 sin sueldo y descuento de $315.04/día). No afecta 7mo día de descanso si se reporta a tiempo.",
    color: "#3B82F6",
    iconBg: "rgba(59,130,246,0.12)",
    flujoEstados: ["REPORTADA", "DOCS_EMPLEADO", "CERRADA"],
    pagaImssDesde: 4,
    descuentoEmpresa: 315.04,
    esST7: false,
    estadoLabels: {
      REPORTADA: { label: "Alta y notificación", desc: "Registrada y notificada a RH. Solo notifica que el trabajador está incapacitado." },
      DOCS_EMPLEADO: { label: "Recepción de incapacidad médica", desc: "RH recibe el formato de incapacidad del médico familiar." },
      CERRADA: { label: "Marcada en pase de lista", desc: "Días marcados como Incapacidad (I) en el pase de lista y expediente cerrado. Sin flujo ST-7." },
    },
    documentosRequeridos: [
      { tipo: "INCAPACIDAD_MEDICO", label: "Formato de incapacidad (médico familiar)", requerido: true, etapa: "DOCS_EMPLEADO" },
    ],
    notas: [
      "Proceso SIMPLE (sin ST-7): alta → recepción de incapacidad médica → marcar en pase de lista. Solo notifica.",
      "IMSS cubre del día 4 en adelante. Días 1-3 sin sueldo.",
      "Descuento empresa: $315.04 por cada día no laborado (1-3).",
      "Reporte a tiempo (<24h) preserva el 7mo día de descanso.",
    ],
  },
  RIESGO_TRABAJO: {
    id: "RIESGO_TRABAJO",
    label: "Riesgo de trabajo",
    short: "RT",
    description: "Accidente en horario laboral en día laborable. Proceso de 4 etapas con ST-7. La empresa debe responder en <24h.",
    color: "#F59E0B",
    iconBg: "rgba(245,158,11,0.12)",
    flujoEstados: [
      "REPORTADA",
      "DOCS_EMPLEADO",     // ST7 inicial del médico familiar
      "RH_VALIDA",         // RH llena parte trasera + sello
      "MEDICINA_TRABAJO",  // Trabajador va a UMF IMSS
      "DICTAMEN",          // IMSS califica
      "ALTA_PENDIENTE",    // Esperando ST2 para volver a laborar
      "CERRADA",
    ],
    pagaImssDesde: 1,
    descuentoEmpresa: 0,
    esST7: true,
    documentosRequeridos: [
      { tipo: "INCAPACIDAD_MEDICO", label: "Incapacidad médica con leyenda 'RIESGO DE TRABAJO: SI'", requerido: true, etapa: "DOCS_EMPLEADO" },
      { tipo: "ST7_INICIAL",        label: "Hoja ST-7 expedida por Medicina de Trabajo",             requerido: true, etapa: "DOCS_EMPLEADO" },
      { tipo: "ST7_DICTAMEN",       label: "ST-7 con dictamen IMSS",                                  requerido: true, etapa: "DICTAMEN" },
      { tipo: "ST2_ALTA",           label: "Hoja de alta ST-2",                                       requerido: true, etapa: "ALTA_PENDIENTE" },
    ],
    notas: [
      "ETAPA 1: Médico familiar expide ST-7 con datos generales del empleado, horario, día de descanso y hora del accidente.",
      "ETAPA 2: RH llena la parte trasera superior de la ST-7 (confirmación de datos, relato, testigos, horario, atención previa) + firma representante legal + sello.",
      "ETAPA 3: Trabajador lleva ST-7 a su UMF IMSS. Medicina de Trabajo recibe y dictamina si fue o no riesgo de trabajo.",
      "ETAPA 4: Trabajador presenta ST-2 (alta) + ST-7 con dictamen. Sin ST-2 NO puede volver a laborar (multas).",
      "Plazo: ST-7 debe llegar a oficinas en <24 horas desde el accidente.",
    ],
  },
  RIESGO_TRAYECTO: {
    id: "RIESGO_TRAYECTO",
    label: "Riesgo de trayecto",
    short: "RTra",
    description: "Accidente camino al trabajo o desde el trabajo a casa. Mismo proceso que RT pero con mapa de recorrido requerido.",
    color: "#EAB308",
    iconBg: "rgba(234,179,8,0.12)",
    flujoEstados: [
      "REPORTADA",
      "DOCS_EMPLEADO",
      "RH_VALIDA",
      "MEDICINA_TRABAJO",
      "DICTAMEN",
      "ALTA_PENDIENTE",
      "CERRADA",
    ],
    pagaImssDesde: 1,
    descuentoEmpresa: 0,
    esST7: true,
    documentosRequeridos: [
      { tipo: "INCAPACIDAD_MEDICO", label: "Incapacidad médica con leyenda 'RIESGO DE TRABAJO: SI'", requerido: true, etapa: "DOCS_EMPLEADO" },
      { tipo: "ST7_INICIAL",        label: "Hoja ST-7 expedida por Medicina de Trabajo",             requerido: true, etapa: "DOCS_EMPLEADO" },
      { tipo: "MAPA_TRAYECTO",      label: "Mapa del recorrido con horarios reales",                  requerido: true, etapa: "DOCS_EMPLEADO" },
      { tipo: "ST7_DICTAMEN",       label: "ST-7 con dictamen IMSS",                                  requerido: true, etapa: "DICTAMEN" },
      { tipo: "ST2_ALTA",           label: "Hoja de alta ST-2",                                       requerido: true, etapa: "ALTA_PENDIENTE" },
    ],
    notas: [
      "Mismo flujo que Riesgo de Trabajo + se exige al colaborador trazar mapa del recorrido con horarios reales.",
      "El IMSS valida que el trayecto sea razonable (origen→destino directo).",
      "Si el accidente ocurrió fuera de la ruta lógica, puede rechazarse.",
    ],
  },
  RIESGO_BIOLOGICO: {
    id: "RIESGO_BIOLOGICO",
    label: "Riesgo biológico / químico",
    short: "ST-9",
    description: "ST-9. Contacto con fluidos infectados o químicos flamables que pueden causar incapacidad permanente. Activa AUDITORÍA IMSS sin aviso previo.",
    color: "#EF4444",
    iconBg: "rgba(239,68,68,0.12)",
    flujoEstados: [
      "REPORTADA",
      "DOCS_EMPLEADO",
      "RH_VALIDA",
      "MEDICINA_TRABAJO",
      "DICTAMEN",
      "ALTA_PENDIENTE",
      "CERRADA",
    ],
    pagaImssDesde: 1,
    descuentoEmpresa: 0,
    esST7: true,
    documentosRequeridos: [
      { tipo: "ST9", label: "Hoja ST-9 (riesgo biológico/químico)", requerido: true, etapa: "DOCS_EMPLEADO" },
      { tipo: "INCAPACIDAD_MEDICO", label: "Incapacidad médica", requerido: true, etapa: "DOCS_EMPLEADO" },
      { tipo: "ST2_ALTA", label: "Hoja de alta ST-2", requerido: true, etapa: "ALTA_PENDIENTE" },
    ],
    notas: [
      "⚠ MUY IMPORTANTE: Disparar la ST-9 puede activar auditoría IMSS sin aviso previo.",
      "El IMSS visita las instalaciones donde ocurrió el accidente para verificar protocolos y equipo de protección personal.",
      "Multas superiores a $100,000 pesos si no se cumplen los procedimientos.",
      "Asegurarse antes de levantar la ST-9 que todo el EPP y protocolos estén documentados.",
    ],
  },
};

export const ESTADO_SPECS: Record<IncapacidadEstado, { label: string; description: string; color: string; orden: number }> = {
  REPORTADA:        { label: "Reportada",          description: "Recién levantada, falta validar documentos",      color: "#94a3b8", orden: 1 },
  DOCS_EMPLEADO:    { label: "Esperando docs",     description: "El empleado debe traer ST-7 / incapacidad médica", color: "#3B82F6", orden: 2 },
  RH_VALIDA:        { label: "RH validando",       description: "RH llena parte trasera de ST-7 + sello + firma",   color: "#8B5CF6", orden: 3 },
  MEDICINA_TRABAJO: { label: "En UMF IMSS",        description: "Trabajador llevó ST-7, esperando dictamen",         color: "#F59E0B", orden: 4 },
  DICTAMEN:         { label: "Dictamen IMSS",      description: "IMSS calificó (sí o no es RT)",                     color: "#06B6D4", orden: 5 },
  ALTA_PENDIENTE:   { label: "Esperando ST-2",     description: "Falta hoja de alta para volver a laborar",         color: "#EAB308", orden: 6 },
  CERRADA:          { label: "Cerrada",            description: "Expediente subido al portal IMSS",                  color: "#10B981", orden: 7 },
  RECHAZADA:        { label: "Rechazada",          description: "IMSS no calificó como riesgo de trabajo",           color: "#EF4444", orden: 8 },
  CANCELADA:        { label: "Cancelada",          description: "Cancelada por error o no procedente",               color: "#64748b", orden: 9 },
};

/**
 * Etiqueta/descripción de un estado según el tipo. Si el tipo define un
 * override (ej. enfermedad general: DOCS_EMPLEADO = "Recepción de incapacidad
 * médica"), lo usa; si no, cae al global de ESTADO_SPECS.
 */
export function estadoInfo(
  tipo: IncapacidadTipo,
  estado: IncapacidadEstado,
): { label: string; description: string; color: string; orden: number } {
  const base = ESTADO_SPECS[estado];
  const override = TIPO_SPECS[tipo].estadoLabels?.[estado];
  return {
    label: override?.label ?? base.label,
    description: override?.desc ?? base.description,
    color: base.color,
    orden: base.orden,
  };
}

/**
 * Devuelve los siguientes estados posibles desde un estado dado.
 * El usuario en UI solo puede elegir uno de estos.
 */
export function siguientesEstados(actual: IncapacidadEstado, tipo: IncapacidadTipo): IncapacidadEstado[] {
  const flujo = TIPO_SPECS[tipo].flujoEstados;
  const idx = flujo.indexOf(actual);
  const siguientes: IncapacidadEstado[] = [];
  // Siguiente en el flujo
  if (idx >= 0 && idx < flujo.length - 1) {
    siguientes.push(flujo[idx + 1]!);
  }
  // Terminales: RECHAZADA y CANCELADA disponibles casi siempre
  if (actual !== "CERRADA" && actual !== "RECHAZADA" && actual !== "CANCELADA") {
    if (actual === "DICTAMEN" || actual === "MEDICINA_TRABAJO") siguientes.push("RECHAZADA");
    siguientes.push("CANCELADA");
  }
  return [...new Set(siguientes)];
}
