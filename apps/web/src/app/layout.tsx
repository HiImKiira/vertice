import type { Metadata, Viewport } from "next";
import { ParticlesBg } from "@/components/ParticlesBg";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Vortex",
    template: "%s · Vortex",
  },
  description: "Vortex — centro de operación de asistencia, incidencias, nómina y datos para RH multi-sede.",
  applicationName: "Vortex",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#050B18",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ParticlesBg />
        {children}
      </body>
    </html>
  );
}
