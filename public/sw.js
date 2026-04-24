/* eslint-disable */
/**
 * KILL-SWITCH Service Worker.
 *
 * Temporarily unregisters itself and clears every cache so clients that
 * picked up an earlier broken version (and now can't load the site) can
 * recover on the next visit without having to manually clear site data.
 *
 * When PWA support is re-enabled, this file will be replaced with the
 * real SW again.
 */

self.addEventListener("install", (event) => {
  // Take over immediately, skip the usual waiting phase.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        // 1. Wipe every cache this SW has ever created
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (_) {}

      try {
        // 2. Unregister ourselves
        await self.registration.unregister();
      } catch (_) {}

      // 3. Force every open tab to reload so the next request goes straight
      //    to the network with no SW in between.
      try {
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          try {
            client.navigate(client.url);
          } catch (_) {}
        }
      } catch (_) {}
    })()
  );
});

// No fetch handler on purpose — we want every request to bypass this SW.
