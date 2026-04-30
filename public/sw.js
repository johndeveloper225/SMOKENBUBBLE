const CACHE_NAME = "loyalty-wallet-v26";
const URLS_TO_CACHE = [
  "/",
  "/styles.css",
  "/app.js",
  "/owner-home.js",
  "/owner-auth.js",
  "/owner-qr.html",
  "/owner-qr.js",
  "/owner.html",
  "/join.html",
  "/loyalty-card.html",
  "/loyalty-card.js",
  "/checkin-scanner.html",
  "/checkin-scanner.js",
  "/admin-card.html",
  "/admin-card.js",
  "/admin-members.html",
  "/admin-members.js",
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
  const requestUrl = new URL(event.request.url);
  const isLocalAsset = requestUrl.origin === self.location.origin;
  const isHtmlNavigation = event.request.mode === "navigate";
  const isScriptOrStyle =
    isLocalAsset &&
    (event.request.destination === "script" ||
      event.request.destination === "style");

  // HTML: always hit network first with no-store so deploys are not masked by SW/cache.
  if (isHtmlNavigation && isLocalAsset) {
    event.respondWith(
      fetch(new Request(event.request, { cache: "no-store" })).catch(() =>
        caches.match(event.request)
      )
    );
    return;
  }

  if (isScriptOrStyle) {
    event.respondWith(
      fetch(new Request(event.request, { cache: "no-store" }))
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
