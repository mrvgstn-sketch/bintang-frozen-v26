/* Bintang Frozen V26 Service Worker
 * Deploy cache version: 2026-08-11.0443
 * Increment CACHE_VERSION on every deploy.
 */

const CACHE_VERSION = 'bf-v26-20260811-1711';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './bintang-frozen-logo.png'
];

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

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k !== STATIC_CACHE)
            .map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Jangan cache traffic Supabase / Auth / API.
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/auth/')
  ) {
    return;
  }

  // Navigasi / index.html:
  // network-first agar update aplikasi terbaru segera digunakan.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();

          caches
            .open(STATIC_CACHE)
            .then(cache => cache.put('./index.html', copy));

          return res;
        })
        .catch(() =>
          caches
            .match('./index.html')
            .then(r => r || caches.match('./'))
        )
    );

    return;
  }

  // Asset statis:
  // gunakan cache bila tersedia, lalu simpan hasil network.
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(res => {
          if (
            res &&
            res.ok &&
            url.origin === self.location.origin
          ) {
            caches
              .open(STATIC_CACHE)
              .then(cache => cache.put(req, res.clone()));
          }

          return res;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
