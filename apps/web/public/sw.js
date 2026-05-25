/**
 * Service Worker mínimo para Vortex.
 *
 * Estrategia: network-first con fallback al cache.
 * - Permite que el browser muestre el prompt "Instalar app" en Android.
 * - Habilita el shell offline básico (logo, ícons).
 * - NO cachea respuestas autenticadas ni server actions.
 *
 * Para forzar el refresh del SW en producción: cambiar CACHE_VERSION.
 */
const CACHE_VERSION = "vortex-v3";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const SHELL_FILES = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/favicon-16.png",
  "/favicon-32.png",
  "/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES).catch(() => {})),
  );
});

// Mensaje del cliente para forzar el take-over cuando hay versión nueva
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Solo GET y mismo origen
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // No cachear rutas dinámicas / auth / API
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.includes("/login")
  ) {
    return;
  }

  // Network-first para HTML, cache-first para assets estáticos
  const isAsset = /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$/i.test(url.pathname)
    || url.pathname.startsWith("/icons/");

  if (isAsset) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached
          ?? fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          }).catch(() => cached),
      ),
    );
    return;
  }

  // HTML / dynamic: network-first
  event.respondWith(
    fetch(req).catch(() => caches.match(req)),
  );
});

// ─────────────────────────────────────────────────────────────────────
// Push notifications
// ─────────────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  console.log("[SW push] evento recibido", { hasData: !!event.data });
  let payload = { title: "Vortex", body: "Hay novedades.", url: "/dashboard", tag: "vortex" };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch (e) {
      console.warn("[SW push] data no es JSON, usando text()", e);
      try { payload.body = event.data.text(); } catch {}
    }
  }
  console.log("[SW push] mostrando notificación", payload);
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
    self.registration.showNotification(payload.title, options).then(
      () => console.log("[SW push] showNotification OK"),
      (err) => console.error("[SW push] showNotification FAIL", err),
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Si ya hay una ventana abierta, enfócala y navega
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(url);
          return;
        }
      }
      // Si no, abre una nueva
      return self.clients.openWindow(url);
    }),
  );
});
