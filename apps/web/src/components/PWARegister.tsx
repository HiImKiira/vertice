"use client";

import { useEffect, useState } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Padded = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64Padded);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

async function subscribeToPush(reg: ServiceWorkerRegistration) {
  if (!VAPID_PUBLIC_KEY) {
    console.warn("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY no configurado");
    return;
  }
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const keyBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    // ArrayBufferView<ArrayBuffer> requerido por TS estricto
    const applicationServerKey = keyBytes.buffer.slice(
      keyBytes.byteOffset,
      keyBytes.byteOffset + keyBytes.byteLength,
    ) as ArrayBuffer;
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }
  const subscriptionJson = sub.toJSON();
  if (!subscriptionJson.endpoint || !subscriptionJson.keys) return;
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subscriptionJson.endpoint,
      keys: subscriptionJson.keys,
      userAgent: navigator.userAgent,
    }),
  }).catch(() => {});
}

/**
 * Registra el service worker, pide permiso de notificaciones y suscribe
 * el dispositivo al servidor push. Si el usuario no acepta, no insiste
 * en cada navegación — pero muestra un banner para reintentar.
 */
export function PWARegister() {
  const [needsPermission, setNeedsPermission] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let reg: ServiceWorkerRegistration | null = null;

    const init = async () => {
      try {
        reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {
        return;
      }
      if (!("Notification" in window) || !("PushManager" in window)) return;

      const permission = Notification.permission;
      if (permission === "granted") {
        await subscribeToPush(reg);
      } else if (permission === "default") {
        // Mostrar banner para que el usuario haga el tap (requerido por iOS)
        setNeedsPermission(true);
      }
      // 'denied' → respetamos, no insistir
    };

    if (document.readyState === "complete") init();
    else window.addEventListener("load", init);
    return () => window.removeEventListener("load", init);
  }, []);

  async function requestPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      const reg = await navigator.serviceWorker.ready;
      await subscribeToPush(reg);
      setNeedsPermission(false);
    } else {
      // El usuario lo denegó. Ocultamos el banner — solo aparecerá otra vez
      // si vuelven a reset el permiso en el navegador.
      setNeedsPermission(false);
    }
  }

  if (!needsPermission) return null;

  return (
    <div className="fixed inset-x-2 bottom-2 z-50 mx-auto max-w-md rounded-2xl border border-blue-400/30 bg-[#0A1428]/95 p-3 shadow-2xl backdrop-blur sm:bottom-4 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-blue-200">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">Activa las notificaciones</p>
          <p className="mt-0.5 text-[11px] text-muted">
            Recibe recordatorios de captura y anuncios de Recursos Humanos.
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={requestPermission}
          className="flex-1 rounded-md bg-blue-500/80 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500"
        >
          Activar
        </button>
        <button
          type="button"
          onClick={() => setNeedsPermission(false)}
          className="rounded-md border border-white/10 px-3 py-2 text-xs text-muted transition hover:text-text"
        >
          Después
        </button>
      </div>
    </div>
  );
}
