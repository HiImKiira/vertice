import type { CodigoAsistencia } from "./codes";
import type { Rol } from "./roles";

export type UUID = string;
export type ISODate = string;
export type ISODateTime = string;

export type Jornada = "MATUTINO" | "VESPERTINO" | "NOCTURNO";
export type DiaSemana = "LUN" | "MAR" | "MIE" | "JUE" | "VIE" | "SAB" | "DOM";

export interface Sede {
  id: UUID;
  codigo: string;
  nombre: string;
  direccion: string | null;
  creado_en: ISODateTime;
}

export interface Usuario {
  id: UUID;
  email: string;
  nombre: string;
  rol: Rol;
  sede_id: UUID | null;
  jornada: Jornada | null;
  activo: boolean;
  creado_en: ISODateTime;
}

export interface Empleado {
  id: UUID;
  numero_empleado: string;
  nombre: string;
  sede_id: UUID;
  jornada: Jornada;
  dia_descanso: DiaSemana;
  salario_diario: number;
  fecha_alta: ISODate;
  fecha_baja: ISODate | null;
  motivo_baja: string | null;
  activo: boolean;
  foto_url: string | null;
  creado_en: ISODateTime;
}

export interface Asistencia {
  id: UUID;
  empleado_id: UUID;
  fecha: ISODate;
  codigo: CodigoAsistencia;
  capturado_por: UUID | null;
  observacion: string | null;
  creado_en: ISODateTime;
  actualizado_en: ISODateTime;
}

export interface CDT {
  id: UUID;
  empleado_id: UUID;
  sede_id: UUID;
  fecha_original: ISODate;
  fecha_temporal: ISODate;
  motivo: string | null;
  creado_por: UUID | null;
  cancelado_en: ISODateTime | null;
  cancelado_por: UUID | null;
  creado_en: ISODateTime;
}

export interface TicketSoporte {
  id: UUID;
  supervisor_id: UUID;
  sede_id: UUID | null;
  jornada: Jornada | null;
  asunto: string;
  mensaje: string;
  urgencia: "NORMAL" | "URGENTE";
  estado: "PENDIENTE" | "RESPONDIDO" | "CERRADO";
  respuesta: string | null;
  respondido_por: UUID | null;
  respondido_en: ISODateTime | null;
  leido_por_supervisor: boolean;
  creado_en: ISODateTime;
}

export interface PeriodoNomina {
  id: UUID;
  quincena_inicio: ISODate;
  quincena_fin: ISODate;
  estado: "ABIERTO" | "CERRADO";
  cerrado_por: UUID | null;
  cerrado_en: ISODateTime | null;
  creado_en: ISODateTime;
}

export interface ResumenEmpleadoPeriodo {
  empleado_id: UUID;
  dias_laborados: number;
  turnos_extra: number;
  valor_extra: number;
  dias_falta: number;
  domingos_trabajados: number;
  prima_dominical: number;
  descuento_faltas: number;
  pago_estimado: number;
}
