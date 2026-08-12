/* Bintang Frozen V26 Service Worker — Refresh Stable 0805 R2 */
const CACHE_VERSION = 'bf-v26-20260812-0805-r2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const CORE = [
  './index.html',
  './manifest.webmanifest',
  './bintang-frozen-logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(async cache => {
        for(const url of CORE){
          try{
            const res=await fetch(url,{cache:'reload'});
            if(res.ok) await cache.put(url,res);
          }catch(err){
            console.warn('[BF SW] precache dilewati',url,err);
          }
        }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req=event.request;
  if(req.method!=='GET') return;

  const url=new URL(req.url);

  // Auth / database / CDN tidak pernah dicache oleh SW.
  if(
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/auth/') ||
    url.hostname==='cdn.jsdelivr.net' ||
    url.hostname==='unpkg.com' ||
    url.hostname==='cdnjs.cloudflare.com'
  ) return;

  // Refresh / navigation: selalu jaringan dulu.
  if(req.mode==='navigate'){
    event.respondWith(
      fetch(req,{cache:'no-store'})
        .then(response=>{
          if(!response || !response.ok) throw new Error('Navigation network gagal');
          const copy=response.clone();
          caches.open(STATIC_CACHE).then(c=>c.put('./index.html',copy)).catch(()=>{});
          return response;
        })
        .catch(async()=>{
          return (await caches.match('./index.html')) ||
            new Response(
              '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:24px"><h2>Bintang Frozen sedang offline</h2><p>Sambungkan internet lalu muat ulang.</p></body>',
              {headers:{'Content-Type':'text/html; charset=utf-8'}}
            );
        })
    );
    return;
  }

  // Asset lokal: cache first + background refresh.
  if(url.origin===self.location.origin){
    event.respondWith(
      caches.match(req).then(cached=>{
        const network=fetch(req).then(response=>{
          if(response && response.ok){
            const copy=response.clone();
            caches.open(STATIC_CACHE).then(c=>c.put(req,copy)).catch(()=>{});
          }
          return response;
        }).catch(()=>null);

        return cached || network.then(r=>r || Response.error());
      })
    );
  }
});
