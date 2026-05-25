import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { ParticlesBg } from "@/components/ParticlesBg";
import { NavigationLoader } from "@/components/NavigationLoader";
import { ZoomBlocker } from "@/components/ZoomBlocker";
import { PWARegister } from "@/components/PWARegister";
import { PushSoundListener } from "@/components/PushSoundListener";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Vortex - Asistencias",
    template: "%s · Vortex",
  },
  description: "Vortex — centro de operación de asistencia, incidencias, nómina y datos para RH multi-sede.",
  applicationName: "Vortex - Asistencias",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Vortex",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#050B18",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ZoomBlocker />
        <PWARegister />
        <PushSoundListener />
        <ParticlesBg />
        <Suspense fallback={null}>
          <NavigationLoader />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
