const CACHE_NAME = "loyalty-wallet-v10";
const URLS_TO_CACHE = [
  "/",
  "/styles.css",
  "/app.js",
  "/loyalty-card.html",
  "/loyalty-card.js",
  "/checkin-scanner.html",
  "/checkin-scanner.js",
  "/admin-card.html",
  "/admin-card.js",
  "/wallet-success.html",
  "/wallet-success.js",
  "/favicon.ico",
  "/wallet-logo.png",
  "/manifest.json",
  "/scanner.html",
  "/scanner.js",
  "/pass.html",
  "/pass.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
