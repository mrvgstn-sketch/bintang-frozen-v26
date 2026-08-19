/* Bintang Frozen V26 — Legacy Service Worker retirement */
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>/^bf-v26-/i.test(k)).map(k=>caches.delete(k)));
    await self.registration.unregister();
    const clients=await self.clients.matchAll({type:'window'});
    clients.forEach(c=>c.navigate(c.url));
  })());
});
self.addEventListener('fetch', () => {});
