const CACHE = "peak-v2";
const PRECACHE = ["/", "/index.html"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests (opening/relaunching the app, including from the
  // home screen icon while offline) get their own network-first strategy:
  // prefer a fresh index.html when online (so a new deploy's hashed asset
  // references don't go stale), but if the network is unavailable, fall
  // back to whatever app-shell HTML is cached rather than failing outright.
  // Without this, launching the installed PWA offline had no fallback if
  // the exact request didn't hit the precached "/" entry — this is what
  // makes "won't open at all when offline" possible.
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch {
          return (
            (await cache.match(event.request)) ||
            (await cache.match("/index.html")) ||
            (await cache.match("/"))
          );
        }
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch (err) {
        throw err;
      }
    })
  );
});
