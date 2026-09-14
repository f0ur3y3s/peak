/* Push handling for the service worker.
 *
 * Kept as a separate file imported by the generated worker (see
 * workbox.importScripts in vite.config.ts) rather than folded into it:
 * vite-plugin-pwa generates the worker with workbox's generateSW strategy,
 * which owns that file completely. Switching to injectManifest to add these
 * two listeners would mean hand-maintaining the whole precache worker.
 *
 * Plain JS on purpose — this ships as-is, unbundled, from public/.
 */

self.addEventListener("push", (event) => {
  let title = "Rest complete";
  let body = "Time to lift";
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data.title === "string") title = data.title;
    if (data && typeof data.body === "string") body = data.body;
  } catch (_err) {
    // A push with no payload, or one we did not send. The defaults above are
    // still the right thing to show — never nothing, since the subscription
    // is userVisibleOnly and a silent push costs us the permission.
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: "peak-rest",
      renotify: true,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // The point of this notification is to be felt through a pocket.
      vibrate: [140, 90, 140],
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Back to the workout that is already open, rather than a second copy
      // of the app on top of it.
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    })
  );
});
