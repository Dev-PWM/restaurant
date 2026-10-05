"use strict";

const scope = self.registration.scope;
const scopeKey = new URL(scope).pathname.replaceAll("/", "_");
const cachePrefix = `masaflow-shell-${scopeKey}-`;
const cacheName = `${cachePrefix}v1`;
const appShell = new URL("realtime.html", scope).href;
const precache = [
  appShell,
  new URL("manifest.webmanifest", scope).href,
  new URL("masaflow.svg", scope).href,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName);
      const response = await fetch(appShell);
      if (!response.ok) throw new Error("MasaFlow app shell could not be cached.");
      await cache.put(appShell, response.clone());
      const html = await response.text();
      const assets = new Set(precache.slice(1));
      for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
        const url = new URL(match[1], appShell);
        if (
          url.origin === self.location.origin &&
          url.pathname.startsWith(new URL(scope).pathname)
        )
          assets.add(url.href);
      }
      await cache.addAll([...assets]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(cachePrefix) && key !== cacheName)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/socket.io/")
  )
    return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(cacheName).then((cache) => cache.put(appShell, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(cacheName);
          return (await cache.match(appShell)) || Response.error();
        }),
    );
    return;
  }

  if (!url.pathname.startsWith(new URL(scope).pathname)) return;
  event.respondWith(
    caches.open(cacheName).then((cache) =>
      cache.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void cache.put(request, copy);
          }
          return response;
          }),
      ),
    ),
  );
});
