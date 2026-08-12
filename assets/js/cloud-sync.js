(function(){
  "use strict";
  const BF_CLOUD_URL="https://jqcbwanqixdxfeqphckr.supabase.co", BF_CLOUD_KEY="sb_publishable_tQVjtPgSCCY_hj2hd4WjzQ_y0ag0cG7", BF_STORE_CODE="BINTANG-Y70M";
  const BF_CLOUD_KEYS=["bf_customers","bf_suppliers","bf_products","bf_employees","bf_debts","bf_expenses","bf_history","bf_keluar_v23_manual","bf_masuk_fotos","bf_masuk_header","bf_masuk_v23_manual","bf_note_pengeluaran_v23b","bf_note_pengeluaran_v23c","bf_note_sembako_v23c","bf_note_setoran_v23b","bf_note_setoran_v23c","bf_tally_ids","bf_tally_pro_v25","bf_tally_detail_v25","bf_tally_cols_v25","bf_deleted_transactions","bf_report_period"];
  let cloud=null,channel=null,pollTimer=null,timer=null,busy=false,booting=false,applyingRemote=false,lastRemoteUpdatedAt="",base={},activeUserId=null; const dirty=new Set();
  const init=()=>{if(window.BFSupabase){cloud=window.BFSupabase;return true}return false}; window.BF_STORE_CODE=BF_STORE_CODE;
  const snap=()=>{const d={};BF_CLOUD_KEYS.forEach(k=>{const v=localStorage.getItem(k);if(v!==null)d[k]=v});return d}; const clone=x=>JSON.parse(JSON.stringify(x||{}));
  async function user(){try{return (await cloud.auth.getUser()).data?.user||null}catch(_){return null}}
  async function owner(){const u=await user();if(!u)return false;const r=await cloud.from("bf_profiles").select("role,active").eq("id",u.id).maybeSingle();return r.data?.active===true&&r.data?.role==="owner"}
  async function remote(){const r=await cloud.from("bf_shared_state").select("data,updated_at,updated_by").eq("store_code",BF_STORE_CODE).maybeSingle();if(r.error)throw r.error;return r.data||null}
  function event(name,detail){window.dispatchEvent(new CustomEvent(name,{detail}))}
  function apply(data,meta={}){applyingRemote=true;try{window.BFCore.storage.transaction(()=>BF_CLOUD_KEYS.forEach(k=>Object.prototype.hasOwnProperty.call(data||{},k)?window.BFCore.storage.setRaw(k,data[k]):window.BFCore.storage.removeRaw(k)));base=clone(data);dirty.clear();event("bf:cloud-state",{data:clone(data),storeCode:BF_STORE_CODE,...meta});event("bf:data-changed",{keys:Object.keys(data||{}),source:"cloud",...meta})}finally{applyingRemote=false}}
  function conflict(keys=[]){const m="Data telah berubah di perangkat lain"+(keys.length?" ("+keys.join(", ")+")":"")+". Data cloud terbaru dipakai agar perubahan tidak saling menimpa.";alert(m);event("bf:sync-conflict",{message:m,keys})}
  async function pull(initial=false){if(!cloud||!(await user()))return false;event("bf:sync-status",{status:"syncing"});try{const r=await remote();if(!r?.data)return false;const stamp=String(r.updated_at||"");if(!initial&&stamp===lastRemoteUpdatedAt)return false;if(dirty.size&&lastRemoteUpdatedAt&&stamp!==lastRemoteUpdatedAt){const ks=[...dirty].filter(k=>(r.data||{})[k]!==base[k]);if(ks.length)conflict(ks)}lastRemoteUpdatedAt=stamp;apply(r.data,{updatedAt:stamp,updatedBy:r.updated_by,initial});event("bf:sync-status",{status:"online",updatedAt:stamp});return true}catch(e){console.warn("Cloud pull",e);event("bf:sync-status",{status:navigator.onLine?"error":"offline"});return false}}
  async function push(){if(!cloud||busy||applyingRemote||!dirty.size)return false;busy=true;event("bf:sync-status",{status:"syncing"});try{const u=await user();if(!u)return false;const r=await remote();if(!r){if(!(await owner()))return false;const now=new Date().toISOString(),data=snap();const x=await cloud.from("bf_shared_state").upsert({store_code:BF_STORE_CODE,data,updated_at:now,updated_by:u.id},{onConflict:"store_code"});if(x.error)throw x.error;lastRemoteUpdatedAt=now;base=clone(data);dirty.clear();return true}
    const stamp=String(r.updated_at||"");if(lastRemoteUpdatedAt&&stamp!==lastRemoteUpdatedAt){const ks=[...dirty].filter(k=>(r.data||{})[k]!==base[k]);if(ks.length){conflict(ks);lastRemoteUpdatedAt=stamp;apply(r.data,{updatedAt:stamp,conflict:true});return false}}
    const data=snap(),now=new Date().toISOString();let q=cloud.from("bf_shared_state").update({data,updated_at:now,updated_by:u.id}).eq("store_code",BF_STORE_CODE);if(lastRemoteUpdatedAt)q=q.eq("updated_at",lastRemoteUpdatedAt);const x=await q.select("updated_at").maybeSingle();if(x.error)throw x.error;if(!x.data){const latest=await remote();conflict([...dirty]);if(latest){lastRemoteUpdatedAt=String(latest.updated_at||"");apply(latest.data||{},{updatedAt:lastRemoteUpdatedAt,conflict:true})}return false}lastRemoteUpdatedAt=String(x.data.updated_at||now);base=clone(data);dirty.clear();event("bf:cloud-saved",{updatedAt:lastRemoteUpdatedAt});event("bf:sync-status",{status:"online",updatedAt:lastRemoteUpdatedAt});return true}catch(e){console.warn("Cloud push",e);event("bf:sync-status",{status:navigator.onLine?"error":"offline"});return false}finally{busy=false}}
  function schedule(){if(!applyingRemote){clearTimeout(timer);timer=setTimeout(push,500)}}
  function watch(){if(window.__bfCloudWatchV4)return;window.__bfCloudWatchV4=true;window.BFCore.storage.onChange(({key})=>{if(BF_CLOUD_KEYS.includes(key)&&!applyingRemote){dirty.add(key);event("bf:local-change",{key});schedule()}})}
  function stopPolling(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}
  function polling(){if(pollTimer)return;pollTimer=setInterval(async()=>{try{if(!(await user()))return;const r=await cloud.from("bf_shared_state").select("updated_at").eq("store_code",BF_STORE_CODE).maybeSingle();const st=String(r.data?.updated_at||"");if(st&&st!==lastRemoteUpdatedAt)await pull(false)}catch(_){}},30000)}
  function realtime(){if(channel)return;channel=cloud.channel("bf_shared_BINTANG_Y70M").on("postgres_changes",{event:"*",schema:"public",table:"bf_shared_state",filter:"store_code=eq."+BF_STORE_CODE},async p=>{const r=p.new||p.record;if(!r||r.store_code!==BF_STORE_CODE)return;const st=String(r.updated_at||"");if(st===lastRemoteUpdatedAt)return;if(r.data){if(dirty.size){const ks=[...dirty].filter(k=>(r.data||{})[k]!==base[k]);if(ks.length)conflict(ks)}lastRemoteUpdatedAt=st;apply(r.data,{updatedAt:st,realtime:true})}else await pull(false)}).subscribe(status=>{event("bf:realtime-status",{status});if(status==="SUBSCRIBED"){stopPolling();event("bf:sync-status",{status:"online",updatedAt:lastRemoteUpdatedAt})}else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED")polling()})}
  async function start(){
    if(booting)return;
    let authenticated=false;
    if(!init()){try{await window.BFEnsureSupabase?.()}catch(e){console.warn("Supabase belum siap untuk cloud sync",e)}if(!init())return}
    booting=true;
    try{
      const s=(await cloud.auth.getSession()).data.session;
      if(!s)return;
      authenticated=true;
      const uid=s.user?.id||null;
      // auth-ready ganda untuk user yang sama tidak boleh melakukan initial pull
      // atau memasang realtime/polling ulang.
      if(uid && activeUserId===uid && channel)return;
      if(activeUserId && uid && activeUserId!==uid){
        stopPolling();
        if(channel){try{await cloud.removeChannel(channel)}catch(_){}channel=null}
        lastRemoteUpdatedAt="";base={};dirty.clear();
      }
      activeUserId=uid;
      const r=await Promise.race([remote(),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Initial cloud sync timeout")),7000))]);
      if(r?.data){lastRemoteUpdatedAt=String(r.updated_at||"");apply(r.data,{updatedAt:lastRemoteUpdatedAt,initial:true})}
      const migration=window.BFSchema?.run?.()||{changedKeys:[]};
      watch();
      migration.changedKeys.forEach(k=>{if(BF_CLOUD_KEYS.includes(k))dirty.add(k)});
      if(!r?.data&&await owner())BF_CLOUD_KEYS.forEach(k=>{if(localStorage.getItem(k)!==null)dirty.add(k)});
      if(dirty.size)await push();
      realtime();
      // Polling hanya fallback. Realtime yang sehat akan mematikannya.
      polling();
    }catch(e){
      console.warn("[Bintang Frozen] Initial cloud sync gagal; memakai state lokal:",e);
      event("bf:sync-status",{status:navigator.onLine?"error":"offline"});
    }finally{
      booting=false;
      if(authenticated){
        event("bf:cloud-ready",{userId:activeUserId,updatedAt:lastRemoteUpdatedAt});
        document.getElementById("bf-startup-screen")?.remove();
        try{window.BFMountMainApp?.()}catch(e){console.error("[Bintang Frozen] Main app mount gagal",e)}
      }
    }
  }
  window.BFCloud={storeCode:BF_STORE_CODE,pull:()=>pull(false),push,dirtyKeys:()=>[...dirty]};
  window.addEventListener("bf:auth-ready",()=>{start()});
  window.addEventListener("bf:auth-signed-out",()=>{
    activeUserId=null;lastRemoteUpdatedAt="";base={};dirty.clear();
    clearTimeout(timer);timer=null;stopPolling();
    if(channel){try{cloud?.removeChannel(channel)}catch(_){} channel=null}
    event("bf:sync-status",{status:"signed-out"});
  });
})();
