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

const VERSION = "v2-minimal";

// Minimal install: do NOT precache anything. The earlier version tried to
// cache.addAll() on install; if any asset 404'd briefly during deploy the
// SW would enter "redundant" state on some mobile Chromes and get stuck.
// We'd rather have no offline cache than a broken SW.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    // Clear every old cache from the v1 SW so nothing stale lingers.
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// No fetch handler at all — let the network serve everything. The only
// reason we keep this SW alive is for push notifications, which still work
// without any caching logic. If the SW has no fetch listener, the browser
// treats requests exactly as if there were no SW, which is the safest
// mode while PWA usage is still stabilizing.

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
