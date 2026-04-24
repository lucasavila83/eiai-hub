/* eslint-disable */
/**
 * Service Worker — Lesco Hub PWA
 *
 * Responsibilities:
 *   1. Install/activate lifecycle (no heavy caching — Next.js handles HTML,
 *      only static assets are pre-cached).
 *   2. Handle "push" events to display notifications for chat messages.
 *   3. Handle "notificationclick" to focus/open the Hub tab and route to
 *      the relevant chat.
 *
 * Intentionally simple: no workbox, no complex routing. The app is
 * server-rendered and relies on live network for data — we don't want
 * stale content.
 */

const VERSION = "v1";
const CACHE = `lesco-hub-static-${VERSION}`;
const STATIC_ASSETS = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Static assets only — everything else goes to the network (live data)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Same-origin static assets
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/icons/") ||
      url.pathname === "/manifest.json" ||
      url.pathname === "/apple-touch-icon.png" ||
      url.pathname.endsWith(".png") ||
      url.pathname.endsWith(".svg") ||
      url.pathname.endsWith(".ico"))
  ) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
  }
});

// --------------- PUSH NOTIFICATIONS ---------------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Lesco-Hub", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Lesco-Hub";
  const body = data.body || "Nova mensagem";
  const url = data.url || "/";
  const tag = data.tag || `lesco-${Date.now()}`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: data.icon || "/icons/icon-192.png",
      badge: data.badge || "/icons/icon-192.png",
      tag,
      renotify: true,
      data: { url },
      requireInteraction: false,
      vibrate: [150, 50, 150],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url;
  const url = target || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // If an existing Lesco-Hub tab is open, focus it and navigate
        for (const client of clients) {
          try {
            const clientUrl = new URL(client.url);
            if (clientUrl.origin === self.location.origin && "focus" in client) {
              client.focus();
              if ("navigate" in client) return client.navigate(url);
              return;
            }
          } catch {}
        }
        // Otherwise, open a new window
        if (self.clients.openWindow) return self.clients.openWindow(url);
      })
  );
});
