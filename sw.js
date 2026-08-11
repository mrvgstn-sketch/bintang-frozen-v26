/* Bintang Frozen V26 Service Worker
 * Increment CACHE_VERSION on every deploy.
 */

const CACHE_VERSION = 'bf-v26-20260811-1905';
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
      .then(cache =>
        cache.addAll(CORE).catch(() => {})
      )
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

  // Hanya menangani request GET.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /*
   * SUPABASE / AUTH
   *
   * Jangan cache request Supabase.
   * Login, database, realtime, dan sinkronisasi
   * harus menggunakan data dari jaringan.
   */
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/auth/')
  ) {
    return;
  }

  /*
   * INDEX.HTML / NAVIGASI
   *
   * Network-first agar update terbaru dari
   * GitHub Pages langsung digunakan.
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
          // Jika offline, gunakan versi index.html
          // terakhir yang berhasil disimpan.
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
