(function(){
  "use strict";
  const SOURCES=[
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js",
    "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js",
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
  ];
  const valid=()=>!!(window.supabase&&typeof window.supabase.createClient==="function");
  const status=(m,e=false)=>{
    const el=document.getElementById("bf-startup-message");
    if(el){el.textContent=m;el.style.color=e?"#fecaca":"#dbe4f3"}
  };
  const load=url=>new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    let done=false;
    const finish=(err)=>{if(done)return;done=true;clearTimeout(to);if(err){try{s.remove()}catch(_){}reject(err)}else resolve(window.supabase)};
    const to=setTimeout(()=>finish(new Error("Timeout memuat "+url)),6000);
    s.src=url;s.async=true;s.crossOrigin="anonymous";
    s.onload=()=>valid()?finish():finish(new Error("Supabase tidak tersedia"));
    s.onerror=()=>finish(new Error("Gagal memuat "+url));
    document.head.appendChild(s);
  });
  let promise=null;
  window.BFEnsureSupabase=function(){
    if(valid())return Promise.resolve(window.supabase);
    if(promise)return promise;
    promise=(async()=>{
      let last=null;
      for(let i=0;i<SOURCES.length;i++){
        try{
          status("Menghubungkan modul database... ("+(i+1)+"/"+SOURCES.length+")");
          await load(SOURCES[i]);
          if(valid()){status("Modul database siap.");window.dispatchEvent(new CustomEvent("bf:supabase-ready"));return window.supabase}
        }catch(err){last=err;console.warn("[Bintang Frozen] Supabase CDN gagal",SOURCES[i],err)}
      }
      status("Modul database gagal dimuat. Periksa internet lalu muat ulang.",true);
      throw last||new Error("Semua sumber Supabase gagal dimuat");
    })();
    return promise;
  };
  window.BFEnsureSupabase().catch(()=>{});
})();
