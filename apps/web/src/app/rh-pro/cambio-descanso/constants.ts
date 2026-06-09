// Constantes y tipos compartidos del módulo cambio-descanso.
// NO lleva "use server": un archivo de server actions solo puede exportar
// funciones async, no consts (arrays/objetos).

export type DiaSemana = "LUN" | "MAR" | "MIE" | "JUE" | "VIE" | "SAB" | "DOM";
export const DIAS_VALIDOS: DiaSemana[] = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"];

export const DIA_FULL: Record<DiaSemana, string> = {
  LUN: "Lunes", MAR: "Martes", MIE: "Miércoles", JUE: "Jueves",
  VIE: "Viernes", SAB: "Sábado", DOM: "Domingo",
};
