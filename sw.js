const CACHE_NAME = "bf-v26-20260811-0544";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./bintang-frozen-logo.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// INSTALL
// Simpan file utama PWA ke cache.
self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE
// Hapus seluruh cache Bintang Frozen versi sebelumnya.
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

// FETCH
self.addEventListener("fetch", event => {
  const request = event.request;

  // Hanya cache request GET.
  if (request.method !== "GET") return;

  // HTML / navigasi:
  // Network-first supaya update GitHub Pages cepat diterima.
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

  // Asset:
  // Gunakan cache jika tersedia.
  // Jika belum ada, ambil dari network dan simpan.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
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

      return cached || network;
    })
  );
});
