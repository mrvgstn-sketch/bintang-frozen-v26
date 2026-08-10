const CACHE_NAME = "bf-v26-20260811-0443";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./bintang-frozen-logo.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Install: simpan file utama aplikasi ke cache
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: hapus cache versi lama
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch:
// - Navigasi/HTML: network-first agar update cepat masuk
// - Asset lainnya: cache-first dengan fallback network
self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();

          caches.open(CACHE_NAME).then(cache => {
            cache.put("./index.html", copy);
          });

          return response;
        })
        .catch(() =>
          caches.match("./index.html")
            .then(cached => cached || caches.match("./"))
        )
    );

    return;
  }

  event.respondWith(
    caches.match(request)
      .then(cached => {
        if (cached) return cached;

        return fetch(request).then(response => {
          if (
            response &&
            response.status === 200 &&
            response.type === "basic"
          ) {
            const copy = response.clone();

            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, copy);
            });
          }

          return response;
        });
      })
  );
});
