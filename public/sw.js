const CACHE_NAME = "loyalty-wallet-v2";
const URLS_TO_CACHE = [
  "/",
  "/styles.css",
  "/app.js",
  "/loyalty-card.html",
  "/loyalty-card.js",
  "/checkin-scanner.html",
  "/checkin-scanner.js",
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
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
