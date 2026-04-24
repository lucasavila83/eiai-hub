/* eslint-disable */
/**
 * Lesco-Hub service worker.
 *
 * Minimal by design. Two jobs:
 *   1. Receive push events from the server and show OS notifications.
 *   2. Focus (or open) the right tab when the user taps the notification.
 *
 * What it deliberately does NOT do:
 *   - Cache fetches. If we intercept requests and return stale responses,
 *     a broken deploy can leave a phone "stuck loading" with no easy way
 *     to recover. Every request goes straight to the network, same as
 *     any other SW-less page.
 *   - Run any app code. No imports, no bundles. The browser fetches this
 *     file directly and runs it in a Worker, so anything that breaks here
 *     can brick the app for everyone until they clear site data.
 *   - Call skipWaiting() / clients.claim(). Those two together force the
 *     new SW to take over open tabs mid-session, which re-triggered a
 *     click-swallowing bug on desktop. Now the SW follows the default
 *     lifecycle: new versions wait until every tab has been closed or
 *     navigated before they take over.
 *
 * If you need a kill-switch, replace this file with one that calls
 * self.registration.unregister() inside `activate` — see git history
 * around the mobile-PWA debugging sessions.
 */

const SW_VERSION = "v3-passive-2026-04-24";

self.addEventListener("install", () => {
  // Intentionally empty — the new SW just waits its turn.
});

self.addEventListener("activate", () => {
  // Intentionally empty — no cache cleanup because we don't create caches,
  // and no clients.claim() so live tabs keep their existing SW (if any).
});

// No fetch handler on purpose.

// ─────────────────────────────────────────────────────────────
// Push handling
// ─────────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = {
      title: "Lesco-Hub",
      body: (event.data && event.data.text && event.data.text()) || "Nova notificação",
    };
  }

  const title = payload.title || "Lesco-Hub";
  const options = {
    body: payload.body || "",
    // Full-color icon shown as the main thumbnail in the tray.
    icon: payload.icon || "/icons/icon-192.png",
    // Monochrome silhouette used in the Android status bar so we don't get
    // a generic white square there.
    badge: payload.badge || "/icons/badge-96.png",
    tag: payload.tag || undefined,
    renotify: false,
    requireInteraction: false,
    vibrate: [80, 40, 80],
    data: {
      url: payload.url || "/",
      ts: Date.now(),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Prefer an already-open Hub tab: focus it and navigate it to the
      // right URL instead of spawning a second window.
      for (const c of all) {
        try {
          const url = new URL(c.url);
          if (url.origin === self.location.origin) {
            await c.focus();
            try {
              if ("navigate" in c) await c.navigate(targetUrl);
            } catch (_) {}
            return;
          }
        } catch (_) {}
      }
      try {
        await self.clients.openWindow(targetUrl);
      } catch (_) {}
    })()
  );
});

// Small liveness ping — lets us verify the SW is alive from DevTools.
self.addEventListener("message", (event) => {
  if (event.data === "ping") {
    event.source && event.source.postMessage({ pong: true, version: SW_VERSION });
  }
});
