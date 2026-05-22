"use client";

import { useEffect } from "react";

/**
 * Bloqueo agresivo de zoom para Safari iOS y Android Chrome.
 *
 * iOS Safari ignora `user-scalable=no` desde iOS 10 por accesibilidad,
 * pero respeta `preventDefault()` en eventos `gesturestart` y multi-touch.
 *
 * Lo que bloqueamos:
 *  - Pinch-to-zoom (2 dedos)
 *  - Double-tap-to-zoom
 *  - Ctrl + scroll wheel zoom en desktop
 *  - Ctrl + (+/-/0) keyboard zoom en desktop
 *
 * Lo que NO bloqueamos (intencional):
 *  - Scroll vertical/horizontal de un solo dedo
 *  - Selección de texto larga
 */
export function ZoomBlocker() {
  useEffect(() => {
    // ── Pinch / Multi-touch ────────────────────────────────────────────
    const preventGesture = (e: Event) => {
      e.preventDefault();
    };
    // Safari iOS dispara gesturestart cuando comienza un pinch
    document.addEventListener("gesturestart", preventGesture, { passive: false });
    document.addEventListener("gesturechange", preventGesture, { passive: false });
    document.addEventListener("gestureend", preventGesture, { passive: false });

    // ── Double-tap zoom ────────────────────────────────────────────────
    let lastTouchEnd = 0;
    const preventDoubleTap = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    };
    document.addEventListener("touchend", preventDoubleTap, { passive: false });

    // ── Multi-touch tap (pellizco) ────────────────────────────────────
    const preventMultiTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener("touchmove", preventMultiTouch, { passive: false });
    document.addEventListener("touchstart", preventMultiTouch, { passive: false });

    // ── Desktop: Ctrl + wheel zoom ────────────────────────────────────
    const preventWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    document.addEventListener("wheel", preventWheelZoom, { passive: false });

    // ── Desktop: Ctrl + +/- keyboard zoom ──────────────────────────────
    const preventKeyZoom = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].includes(e.key)) {
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", preventKeyZoom);

    return () => {
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("gestureend", preventGesture);
      document.removeEventListener("touchend", preventDoubleTap);
      document.removeEventListener("touchmove", preventMultiTouch);
      document.removeEventListener("touchstart", preventMultiTouch);
      document.removeEventListener("wheel", preventWheelZoom);
      document.removeEventListener("keydown", preventKeyZoom);
    };
  }, []);

  return null;
}
