const CACHE_NAME = "neon-academy-v6";
const APP_SHELL = [
  "/",
  "/styles.css",
  "/app.js",
  "/asset-cache.js",
  "/academy-themes.js",
  "/roblox-ui-visualizer.js",
  "/academy-effects.js",
  "/academy-scene.js",
  "/academy-data.js",
  "/integration-systems.js",
  "/system-expansion.js",
  "/learning-library.js",
  "/assets/lucide.min.js",
  "/assets/vendor/three.module.min.js",
  "/assets/vendor/three.core.min.js",
  "/assets/economy-workshop.png",
  "/assets/academy-icon.svg",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname === "/login") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
  );
});
