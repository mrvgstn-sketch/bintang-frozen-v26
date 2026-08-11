/* Bintang Frozen V26 Service Worker */

const CACHE_VERSION = 'bf-v26-20260812-0512';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './bintang-frozen-logo.png'
];


/* =========================================
   INSTALL
   ========================================= */

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then(cache => {
        return cache.addAll(CORE).catch(() => {});
      })
      .then(() => self.skipWaiting())
  );
});


/* =========================================
   ACTIVATE
   Hapus cache versi lama
   ========================================= */

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


/* =========================================
   FETCH
   ========================================= */

self.addEventListener('fetch', event => {

  const req = event.request;

  // Hanya menangani request GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);


  /* -----------------------------------------
     SUPABASE / AUTH
     Jangan disimpan di cache Service Worker
     ----------------------------------------- */

  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/auth/')
  ) {
    return;
  }


  /* -----------------------------------------
     NAVIGASI / INDEX.HTML

     Selalu mencoba mengambil versi terbaru
     dari internet.

     Jika offline, baru menggunakan cache.
     ----------------------------------------- */

  if (req.mode === 'navigate') {

    event.respondWith(

      fetch(req, {
        cache: 'no-store'
      })

        .then(response => {

          if (response && response.ok) {

            const copy = response.clone();

            caches
              .open(STATIC_CACHE)
              .then(cache => {
                cache.put('./index.html', copy);
              });

          }

          return response;

        })

        .catch(() => {

          return caches
            .match('./index.html')
            .then(cached => {
              return cached || caches.match('./');
            });

        })

    );

    return;
  }


  /* -----------------------------------------
     FILE / ASSET LOKAL

     Gunakan cache jika tersedia.
     Jika belum ada, ambil dari network.
     ----------------------------------------- */

  event.respondWith(

    caches
      .match(req)
      .then(cached => {

        if (cached) {
          return cached;
        }

        return fetch(req)
          .then(response => {

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
