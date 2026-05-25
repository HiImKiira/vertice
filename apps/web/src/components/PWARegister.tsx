"use client";

import { useEffect } from "react";

/**
 * Registra el service worker en background y fuerza update check en cada
 * carga. Si hay versión nueva del SW (CACHE_VERSION distinta), se instala
 * y toma control inmediatamente (skipWaiting + clients.claim).
 *
 * La UX de pedir permiso + suscribir vive en <PushControls />.
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const onLoad = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        // Force update check — útil cuando bumpamos CACHE_VERSION en sw.js
        // y el browser aún tiene la versión vieja cacheada.
        await reg.update().catch(() => {});

        // Si hay un worker waiting (nueva versión esperando), recargamos
        // los clientes para que la nueva tome control y registre handlers
        // como 'push' que pudieran no estar en la anterior.
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              // Nuevo SW listo. Lo activamos sin esperar reload manual.
              sw.postMessage?.({ type: "SKIP_WAITING" });
            }
          });
        });
      } catch {
        // fail-silent
      }
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
