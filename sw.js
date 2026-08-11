/* Bintang Frozen V26 Service Worker */

const CACHE_VERSION = 'bf-v26-20260812-0015';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './bintang-frozen-logo.png'
];

/* =========================
   INSTALL
   ========================= */

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then(cache => cache.addAll(CORE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

/* =========================
   ACTIVATE
   ========================= */

// Hapus cache versi aplikasi sebelumnya.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== STATIC_CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* =========================
   FETCH
   ========================= */

self.addEventListener('fetch', event => {
  const req = event.request;

  // Service Worker hanya menangani GET.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /*
   * SUPABASE / AUTH
   *
   * Jangan cache request database,
   * autentikasi, realtime, dan sinkronisasi.
   */
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/auth/')
  ) {
    return;
  }

  /*
   * NAVIGASI / INDEX.HTML
   *
   * Network-first.
   *
   * Tujuannya agar setelah index.html baru
   * di-upload ke GitHub Pages, perangkat
   * mengambil aplikasi terbaru terlebih dahulu.
   */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(response => {
          const copy = response.clone();

          caches
            .open(STATIC_CACHE)
            .then(cache => {
              cache.put('./index.html', copy);
            });

          return response;
        })
        .catch(() => {
          /*
           * Jika perangkat offline,
           * buka index.html terakhir yang
           * berhasil disimpan.
           */
          return caches
            .match('./index.html')
            .then(cached => {
              return cached || caches.match('./');
            });
        })
    );

    return;
  }

  /*
   * ASSET STATIS
   *
   * Cache-first untuk aset lokal PWA.
   */
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        return cached;
      }

      return fetch(req).then(response => {
        /*
         * Hanya cache response yang berhasil
         * dan berasal dari aplikasi sendiri.
         */
        if (
          response &&
          response.ok &&
          url.origin === self.location.origin
        ) {
          const copy = response.clone();

          caches
            .open(STATIC_CACHE)
            .then(cache => {
              cache.put(req, copy);
            });
        }

        return response;
      });
    })
  );
});
