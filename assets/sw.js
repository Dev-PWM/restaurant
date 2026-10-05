// Service Worker for MasaFlow PWA
const CACHE_NAME = "masaflow-cache-v1";
const ASSETS_TO_CACHE = [
  "/assets/icon.svg",
  "/assets/pwa-192x192.png",
  "/assets/pwa-512x512.png",
  "/assets/apple-touch-icon.png",
  "/assets/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip socket.io and API requests from service worker caching
  if (url.pathname.startsWith("/socket.io") || url.pathname.startsWith("/api/")) {
    return;
  }

  // Network-first strategy for HTML pages, cache-first for static assets
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.hostname.includes("fonts.g")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return (
          cached ||
          fetch(event.request).then((response) => {
            if (response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
        );
      })
    );
  }
});
