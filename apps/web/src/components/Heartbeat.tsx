"use client";

import { useEffect, useRef } from "react";

/**
 * Mantiene el `ultimo_acceso` del usuario actualizado en DB.
 * Ping al servidor cada 5 minutos mientras la app esté visible.
 * Si el tab está oculto, pausa el ping (no gasta requests).
 */
export function Heartbeat() {
  const lastPingRef = useRef<number>(0);
  const intRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;

    const PING_MS = 5 * 60 * 1000; // 5 min

    function ping() {
      const ahora = Date.now();
      if (ahora - lastPingRef.current < 60 * 1000) return; // throttle 1 min
      lastPingRef.current = ahora;
      fetch("/api/heartbeat", { method: "POST", credentials: "include" }).catch(() => {});
    }

    // Ping inmediato al cargar
    ping();

    // Ping periódico
    intRef.current = setInterval(() => {
      if (document.visibilityState === "visible") ping();
    }, PING_MS);

    // Ping al volver a la app
    function onVisibility() {
      if (document.visibilityState === "visible") ping();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (intRef.current) clearInterval(intRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
