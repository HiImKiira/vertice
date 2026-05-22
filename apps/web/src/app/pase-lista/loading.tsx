import { LoadingOverlay } from "@/components/VortexLoader";

export default function PaseListaLoading() {
  return <LoadingOverlay message="Cargando pase de lista..." hint="Trayendo empleados y marcas del día" />;
}
