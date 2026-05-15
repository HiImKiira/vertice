import { CONTRATO_HOMBRE_TEXT } from "./contrato-hombre";
import { CONTRATO_MUJER_TEXT } from "./contrato-mujer";

export const TEMPLATE_HOMBRE: string = CONTRATO_HOMBRE_TEXT;
export const TEMPLATE_MUJER: string = CONTRATO_MUJER_TEXT;

export function pickTemplate(sexo: "HOMBRE" | "MUJER"): string {
  return sexo === "MUJER" ? TEMPLATE_MUJER : TEMPLATE_HOMBRE;
}
