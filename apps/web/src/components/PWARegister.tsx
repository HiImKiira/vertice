"use client";

import { useEffect } from "react";

/**
 * Registra el service worker en background. La UX de pedir permiso y
 * suscribir se delega a <PushControls /> que aparece en el dashboard
 * y en /soporte — esto evita banners duplicados y permite mostrar
 * instrucciones de instalación si la PWA no está instalada todavía.
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          // fail-silent
        });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
