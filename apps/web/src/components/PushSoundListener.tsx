"use client";

import { useEffect } from "react";
import { playEventSound, type EventoTipo } from "@/lib/sounds";

/**
 * Escucha mensajes del Service Worker que avisan cuando llegó un push.
 * Si el tipo de evento tiene un sonido configurado, lo reproduce.
 *
 * Limitación: solo funciona cuando Vortex está abierto (foreground o
 * background tab). Si la PWA está completamente cerrada, el OS reproduce
 * su tono default — los sonidos custom no aplican.
 */
export function PushSoundListener() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; tipo?: string } | undefined;
      if (data?.type !== "vortex-push") return;
      const tipo = (data.tipo ?? "test") as EventoTipo;
      try {
        playEventSound(tipo);
      } catch (e) {
        console.warn("[PushSoundListener] playSound failed", e);
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  return null;
}
