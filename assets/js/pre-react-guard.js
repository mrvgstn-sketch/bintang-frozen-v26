(function(){
  "use strict";

  function showFatal(message){
    try{
      let box=document.getElementById("bf-pre-react-error");
      if(!box){
        box=document.createElement("div");
        box.id="bf-pre-react-error";
        box.style.cssText="position:fixed;inset:0;z-index:2147483647;background:#0d1b3e;color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif";
        document.addEventListener("DOMContentLoaded",()=>document.body.appendChild(box),{once:true});
      }
      box.innerHTML='<div style="width:min(460px,92vw);background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:18px;padding:20px;text-align:center"><b>BINTANG FROZEN — V26</b><div style="margin-top:10px;font-size:12px;color:#fecaca;word-break:break-word">'+String(message||"Startup React gagal")+'</div><button onclick="location.reload()" style="margin-top:15px;border:0;border-radius:10px;padding:10px 14px;background:#ffcc00;color:#0d1b3e;font-weight:900">Muat Ulang</button></div>';
    }catch(_){}
  }

  // Tangkap error bundle React sejak detik pertama.
  window.addEventListener("error",function(ev){
    const msg=ev?.error?.message||ev?.message||"JavaScript error";
    console.error("[BF PRE-REACT]",ev?.error||ev);
    if(!document.getElementById("root")?.children?.length){
      showFatal(msg);
    }
  });

  window.addEventListener("unhandledrejection",function(ev){
    console.error("[BF PRE-REACT PROMISE]",ev?.reason);
  });

  // Pembaca JSON tahan rusak / beda format.
  window.BFSafeReadJSON=function(key,fallback,type){
    try{
      const raw=localStorage.getItem(key);
      if(raw===null || raw==="") return fallback;
      const val=JSON.parse(raw);
      if(type==="array" && !Array.isArray(val)) return fallback;
      if(type==="object" && (val===null || Array.isArray(val) || typeof val!=="object")) return fallback;
      return val;
    }catch(err){
      console.warn("[Bintang Frozen] State lokal rusak, memakai fallback:",key,err);
      return fallback;
    }
  };
})();
