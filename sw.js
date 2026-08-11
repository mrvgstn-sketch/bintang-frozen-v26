/* Bintang Frozen V26 Service Worker */

const CACHE_VERSION = 'bf-v26-20260811-1945';
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

// Hapus cache versi lama.
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

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /*
   * Jangan cache Supabase / Auth.
   * Login, database, realtime dan sinkronisasi
   * harus tetap menggunakan jaringan.
   */
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/auth/')
  ) {
    return;
  }

  /*
   * INDEX.HTML / NAVIGASI
   * Network-first supaya update GitHub Pages
   * cepat masuk ke HP pengguna.
   */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(response => {
          const copy = response.clone();

          caches.open(STATIC_CACHE).then(cache => {
            cache.put('./index.html', copy);
          });

          return response;
        })
        .catch(() =>
          caches
            .match('./index.html')
            .then(cached => cached || caches.match('./'))
        )
    );

    return;
  }

  /*
   * ASSET STATIS
   * Cache-first untuk PWA/offline.
   */
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        return cached;
      }

      return fetch(req).then(response => {
        if (
          response &&
          response.ok &&
          url.origin === self.location.origin
        ) {
          const copy = response.clone();

          caches.open(STATIC_CACHE).then(cache => {
            cache.put(req, copy);
          });
        }

        return response;
      });
    })
