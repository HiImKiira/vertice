/**
 * Service Worker mínimo para Vortex.
 *
 * FILOSOFÍA (desde v9): el SW existe SOLO para push notifications.
 * NO cachea navegación, HTML, ni chunks de Next.js (/_next/).
 *
 * Razón: cachear /_next/*.js causaba ChunkLoadError ("application error:
 * a client-side exception") tras cada deploy, porque el SW podía servir
 * chunks de un build viejo mientras el HTML pedía los de un build nuevo.
 * Next.js ya sirve /_next/static con cache HTTP `immutable` + content-hash,
 * así que el navegador lo maneja perfectamente sin ayuda del SW.
 *
 * El modo offline del pase de lista usa IndexedDB (lib/offline-store.ts),
 * NO depende del cache del SW, así que sigue funcionando igual.
 *
 * Para forzar refresh del SW en producción: cambiar CACHE_VERSION.
 */
const CACHE_VERSION = "vortex-v9";

self.addEventListener("install", () => {
  // Activar de inmediato la versión nueva, sin esperar.
  self.skipWaiting();
});

// Mensaje del cliente para forzar el take-over cuando hay versión nueva
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Borrar TODOS los caches viejos (incluyendo los shells de versiones
      // anteriores que pudieran tener chunks rotos).
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// IMPORTANTE: NO hay listener 'fetch'. El SW no intercepta peticiones de red.
// Esto elimina por completo la posibilidad de servir chunks viejos/rotos.

// ─────────────────────────────────────────────────────────────────────
// Push notifications
// ─────────────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let payload = { title: "Vortex", body: "Hay novedades.", url: "/dashboard", tag: "vortex" };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch (e) {
      try { payload.body = event.data.text(); } catch {}
    }
  }
  const options = {
    body: payload.body,
    icon: payload.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag,
    data: { url: payload.url, ...(payload.data || {}) },
    vibrate: [200, 100, 200],
    requireInteraction: payload.requireInteraction === true,
    renotify: true,
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, options).catch(() => {}),
      // Broadcast a clients abiertos para que toquen sonido custom
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          try {
            client.postMessage({
              type: "vortex-push",
              payload: payload,
              tipo: (payload.data && payload.data.tipo) || payload.tag || "test",
            });
          } catch (e) { /* ignore */ }
        }
      }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
