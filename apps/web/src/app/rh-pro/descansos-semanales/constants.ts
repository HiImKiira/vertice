// Constantes y tipos compartidos del módulo descansos-semanales.
// IMPORTANTE: este archivo NO lleva "use server". Un archivo "use server"
// solo puede exportar funciones async; exportar consts (arrays/objetos)
// desde ahí rompe en runtime ("A 'use server' file can only export async
// functions, found object").

export type DiaSemana = "LUN" | "MAR" | "MIE" | "JUE" | "VIE" | "SAB" | "DOM";
export const DIAS_VALIDOS: DiaSemana[] = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"];
