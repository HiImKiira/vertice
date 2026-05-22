import { LoadingOverlay } from "@/components/VortexLoader";

export default function IncidenciasLoading() {
  return <LoadingOverlay message="Cargando incidencias..." hint="Construyendo calendario del mes" />;
}
