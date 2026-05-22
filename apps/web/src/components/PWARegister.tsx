"use client";

import { useEffect } from "react";

/**
 * Registra el service worker en /sw.js. Solo se monta una vez (root layout).
 * Si el SW falla o el navegador no lo soporta, fail-silent — la app sigue
 * funcionando como SPA normal.
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Evitar registro en dev para no cachear código que cambia constantemente
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
