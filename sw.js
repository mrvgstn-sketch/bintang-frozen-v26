const CACHE_VERSION = "bf-v26-20260811-1605";
const CACHE_NAME = CACHE_VERSION;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./bintang-frozen-logo.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

/* =========================
   INSTALL
   ========================= */

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/* =========================
   ACTIVATE
   ========================= */

// Hapus cache versi lama setiap deploy.
self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
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

/* =========================
   FETCH
   ========================= */

self.addEventListener("fetch", event => {
  const request = event.request;

  // Hanya menangani request GET.
  if (request.method !== "GET") return;

  /*
   * HTML / navigasi:
   * network-first supaya index.html terbaru
   * langsung digunakan setelah deploy.
   */
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
        .catch(() => {
          return caches
            .match("./index.html")
            .then(cached => cached || caches.match("./"));
        })
    );

    return;
  }

  /*
   * Asset statis:
   * gunakan cache terlebih dahulu.
   */
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        return cached;
      }

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
