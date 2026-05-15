export const ROLES = ["USER", "ADMIN", "CEO", "SUPERADMIN"] as const;
export type Rol = (typeof ROLES)[number];

export const ROL_LABEL: Record<Rol, string> = {
  USER: "Supervisor",
  ADMIN: "RH / Admin",
  CEO: "Dirección",
  SUPERADMIN: "Superadmin",
};

export function puedeGestionar(rol: Rol, accion: "captura" | "nomina" | "config" | "libera_fecha"): boolean {
  switch (accion) {
    case "captura":
      return true;
    case "nomina":
      return rol === "ADMIN" || rol === "CEO" || rol === "SUPERADMIN";
    case "libera_fecha":
      return rol === "SUPERADMIN";
    case "config":
      return rol === "SUPERADMIN";
  }
}
