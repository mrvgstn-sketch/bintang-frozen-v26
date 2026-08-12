(function(){
  "use strict";
  async function purge(){
    try{
      if("serviceWorker" in navigator){
        const regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r=>r.unregister().catch(()=>false)));
      }
      if("caches" in window){
        const keys=await caches.keys();
        await Promise.all(keys.filter(k=>/^bf-v26-/i.test(k)).map(k=>caches.delete(k)));
      }
    }catch(e){console.warn("[Bintang Frozen] Pembersihan cache lama dilewati:",e)}
  }
  window.addEventListener("load",purge,{once:true});
})();
