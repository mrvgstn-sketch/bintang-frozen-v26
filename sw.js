/* BINTANG FROZEN — V26 | Service Worker 20260812-0600 */
const CACHE_VERSION='bf-v26-20260812-0600';
const STATIC_CACHE=`${CACHE_VERSION}-static`;
const CORE=['./','./index.html','./manifest.webmanifest','./bintang-frozen-logo.png','./icons/icon-192.png','./icons/icon-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(STATIC_CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==STATIC_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.hostname.includes('supabase.co')||url.pathname.includes('/auth/'))return;

  if(req.mode==='navigate'){
    event.respondWith(fetch(req,{cache:'no-store'}).then(res=>{
      if(res&&res.ok){const copy=res.clone();caches.open(STATIC_CACHE).then(c=>c.put('./index.html',copy)).catch(()=>{});}
      return res;
    }).catch(()=>caches.match('./index.html').then(r=>r||caches.match('./'))));
    return;
  }

  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{
    if(res&&res.ok&&url.origin===self.location.origin){const copy=res.clone();caches.open(STATIC_CACHE).then(c=>c.put(req,copy)).catch(()=>{});}
    return res;
  })));
});
