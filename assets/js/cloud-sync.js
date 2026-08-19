(function(){
"use strict";
const STORE_CODE="BINTANG-Y70M";
const TABLE="bf_state_items";
const KEYS=["bf_customers","bf_suppliers","bf_products","bf_employees","bf_debts","bf_expenses","bf_history","bf_keluar_v26","bf_masuk_fotos","bf_masuk_header","bf_masuk_v26","bf_note_pengeluaran_v26","bf_note_sembako_v26","bf_note_setoran_v26","bf_tally_ids","bf_tally_pro_v26","bf_tally_detail_v26","bf_tally_cols_v26","bf_deleted_transactions","bf_report_period"];
let cloud=null,channel=null,pollTimer=null,pushTimer=null,busy=false,pollBusy=false,booting=false,applyingRemote=false,activeUserId=null;
const dirty=new Set(),base=new Map();
window.BF_STORE_CODE=STORE_CODE;
const init=()=>{cloud=window.BFSupabase||cloud;return !!cloud};
const event=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail}));
function waitForMainApp(){
  if(typeof window.BFMountMainApp==="function")return Promise.resolve();
  return new Promise(resolve=>{
    const ready=()=>{window.removeEventListener("bf:main-app-defined",ready);resolve()};
    window.addEventListener("bf:main-app-defined",ready,{once:true});
    if(typeof window.BFMountMainApp==="function")ready();
  });
}
async function mountMainApp(){
  await waitForMainApp();
  window.BFMountMainApp();
  if(!window.__bfMainMounted)throw new Error("React mount tidak selesai");
  document.getElementById("bf-startup-screen")?.remove();
}

const localValue=key=>localStorage.getItem(key);
async function currentUser(){try{return (await cloud.auth.getUser()).data?.user||null}catch(_){return null}}
function rowMap(rows){const map=new Map();(rows||[]).forEach(r=>{if(KEYS.includes(r.state_key))map.set(r.state_key,r)});return map}
async function readRemote(keys=null){
  let q=cloud.from(TABLE).select("state_key,value,revision,updated_at,updated_by").eq("store_code",STORE_CODE);
  if(keys?.length)q=q.in("state_key",keys);
  const r=await q;if(r.error)throw r.error;return r.data||[];
}
async function readRemoteMeta(){
  const r=await cloud.from(TABLE).select("state_key,revision,updated_at").eq("store_code",STORE_CODE);
  if(r.error)throw r.error;return r.data||[];
}
function applyRows(rows,{initial=false,realtime=false}={}){
  const changed=[];applyingRemote=true;
  try{
    window.BFCore.storage.transaction(()=>{
      rows.forEach(r=>{if(!KEYS.includes(r.state_key))return;base.set(r.state_key,{value:r.value,revision:Number(r.revision||0),updated_at:r.updated_at||""});if(localValue(r.state_key)!==r.value){window.BFCore.storage.setRaw(r.state_key,r.value);changed.push(r.state_key)}dirty.delete(r.state_key)});
    });
  }finally{applyingRemote=false}
  if(changed.length){const updatedAt=(rows||[]).map(r=>r.updated_at||"").sort().pop()||"";event("bf:cloud-state",{keys:changed,storeCode:STORE_CODE,initial,realtime,updatedAt});event("bf:data-changed",{keys:changed,source:"cloud",initial,realtime,updatedAt})}
}
function applyDelete(key){if(!KEYS.includes(key))return;applyingRemote=true;try{window.BFCore.storage.removeRaw(key);base.delete(key);dirty.delete(key)}finally{applyingRemote=false};event("bf:data-changed",{keys:[key],source:"cloud",deleted:true})}
function conflict(key){const m="Data telah berubah di perangkat lain. Versi terbaru digunakan agar perubahan tidak saling menimpa.";event("bf:sync-conflict",{message:m,keys:[key]});return m}
async function pull(initial=false){
  if(!cloud||!(await currentUser()))return false;event("bf:sync-status",{status:"syncing"});
  try{
    const rows=await readRemote(),remote=rowMap(rows),conflicts=[];
    dirty.forEach(k=>{const r=remote.get(k),b=base.get(k);if((r&&b&&Number(r.revision)!==Number(b.revision))||(!r&&b))conflicts.push(k)});
    if(conflicts.length){conflicts.forEach(conflict);alert("Data telah diperbarui dari perangkat lain. Aplikasi menggunakan versi terbaru agar data tidak saling menimpa.")}
    [...base.keys()].filter(k=>!remote.has(k)&&!dirty.has(k)).forEach(applyDelete);applyRows(rows,{initial});
    event("bf:sync-status",{status:"online"});return true;
  }catch(e){console.warn("[Bintang Frozen] Sinkronisasi data gagal",e);event("bf:sync-status",{status:navigator.onLine?"error":"offline"});return false}
}
async function writeKey(key,user){
  const value=localValue(key),b=base.get(key);
  if(value===null){
    if(!b){dirty.delete(key);return true}
    const r=await cloud.from(TABLE).delete().eq("store_code",STORE_CODE).eq("state_key",key).eq("revision",b.revision).select("state_key");
    if(r.error)throw r.error;if(!r.data?.length)return false;base.delete(key);dirty.delete(key);return true;
  }
  if(!b){
    const r=await cloud.from(TABLE).insert({store_code:STORE_CODE,state_key:key,value,revision:1,updated_by:user.id}).select("state_key,revision,updated_at").maybeSingle();
    if(r.error){if(r.error.code==="23505")return false;throw r.error}base.set(key,{...r.data,value});dirty.delete(key);return true;
  }
  const nextRevision=Number(b.revision||0)+1;
  const r=await cloud.from(TABLE).update({value,revision:nextRevision,updated_at:new Date().toISOString(),updated_by:user.id}).eq("store_code",STORE_CODE).eq("state_key",key).eq("revision",b.revision).select("state_key,revision,updated_at").maybeSingle();
  if(r.error)throw r.error;if(!r.data)return false;base.set(key,{...r.data,value});dirty.delete(key);return true;
}
async function refreshConflict(key){const rows=await readRemote([key]);conflict(key);alert("Data yang sedang diedit telah berubah di perangkat lain. Versi terbaru digunakan.");if(rows.length)applyRows(rows,{});else applyDelete(key)}
async function push(){
  if(!cloud||busy||applyingRemote||!dirty.size)return false;busy=true;event("bf:sync-status",{status:"syncing"});
  try{
    const u=await currentUser();if(!u)return false;
    for(const key of [...dirty]){const ok=await writeKey(key,u);if(!ok)await refreshConflict(key)}
    const updatedAt=new Date().toISOString();event("bf:cloud-saved",{updatedAt});event("bf:sync-status",{status:"online",updatedAt});return true;
  }catch(e){console.warn("[Bintang Frozen] Penyimpanan cloud gagal",e);event("bf:sync-status",{status:navigator.onLine?"error":"offline"});return false}finally{busy=false}
}
function schedule(){if(applyingRemote)return;clearTimeout(pushTimer);pushTimer=setTimeout(push,500)}
function watch(){if(window.__bfCloudStorageWatch)return;window.__bfCloudStorageWatch=true;window.BFCore.storage.onChange(({key})=>{if(KEYS.includes(key)&&!applyingRemote){dirty.add(key);event("bf:local-change",{key});schedule()}})}
function stopPolling(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}
function signature(rows){return (rows||[]).filter(r=>KEYS.includes(r.state_key)).map(r=>r.state_key+":"+r.revision).sort().join("|")}
function baseSignature(){return [...base.entries()].map(([k,v])=>k+":"+v.revision).sort().join("|")}
async function syncFromMetadata(rows){
  const remote=new Map((rows||[]).filter(r=>KEYS.includes(r.state_key)).map(r=>[r.state_key,r]));
  const changed=[],conflicts=[],deleted=[];
  remote.forEach((r,key)=>{const b=base.get(key);if(!b||Number(r.revision||0)!==Number(b.revision||0)){if(dirty.has(key))conflicts.push(key);else changed.push(key)}});
  base.forEach((_,key)=>{if(!remote.has(key)){if(dirty.has(key))conflicts.push(key);else deleted.push(key)}});
  if(conflicts.length){
    const existing=conflicts.filter(k=>remote.has(k)),fresh=existing.length?await readRemote(existing):[];
    conflicts.forEach(conflict);alert("Data telah diperbarui dari perangkat lain. Aplikasi menggunakan versi terbaru agar data tidak saling menimpa.");
    const freshKeys=new Set(fresh.map(r=>r.state_key));applyRows(fresh,{});conflicts.filter(k=>!freshKeys.has(k)).forEach(applyDelete);
  }
  if(changed.length){
    const fresh=await readRemote(changed),freshKeys=new Set(fresh.map(r=>r.state_key));applyRows(fresh,{});changed.filter(k=>!freshKeys.has(k)).forEach(applyDelete);
  }
  deleted.forEach(applyDelete);
  return {changed,conflicts,deleted};
}
function polling(){if(pollTimer)return;pollTimer=setInterval(async()=>{if(pollBusy||!activeUserId)return;pollBusy=true;try{const rows=await readRemoteMeta();if(signature(rows)!==baseSignature())await syncFromMetadata(rows)}catch(e){console.warn("[Bintang Frozen] Polling sinkronisasi gagal",e)}finally{pollBusy=false}},30000)}
function realtime(){
  if(channel)return;
  channel=cloud.channel("bf_state_"+STORE_CODE.replace(/[^a-z0-9]/gi,"_")).on("postgres_changes",{event:"*",schema:"public",table:TABLE,filter:"store_code=eq."+STORE_CODE},async payload=>{
    const row=payload.new&&Object.keys(payload.new).length?payload.new:payload.old;if(!row||!KEYS.includes(row.state_key))return;
    if(dirty.has(row.state_key)){if(busy&&row.updated_by===activeUserId){applyRows([row],{realtime:true});return}await refreshConflict(row.state_key);return}
    if(payload.eventType==="DELETE")applyDelete(row.state_key);else applyRows([row],{realtime:true});
  }).subscribe(status=>{event("bf:realtime-status",{status});if(status==="SUBSCRIBED"){stopPolling();event("bf:sync-status",{status:"online"})}else if(["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(status))polling()});
}
async function start(){
  if(booting)return;let authenticated=false;
  if(!init()){try{await window.BFEnsureSupabase?.()}catch(e){console.warn("[Bintang Frozen] Layanan data belum siap",e)}if(!init())return}
  booting=true;
  try{
    const session=(await cloud.auth.getSession()).data.session;if(!session)return;authenticated=true;const uid=session.user?.id||null;
    // R13N security boundary: Driver tidak boleh menarik bf_state_items penuh ke client.
    // Tugas Driver dibaca melalui RPC server-side terfilter di driver-delivery.js.
    if(window.BFCore.user().role==="driver"){
      activeUserId=uid;stopPolling();
      if(channel){try{await cloud.removeChannel(channel)}catch(_){}channel=null}
      // Security hygiene: jangan biarkan cache bisnis sesi Owner/Admin sebelumnya
      // tetap tersedia di browser ketika akun Driver aktif. Ini hanya membersihkan
      // cache perangkat; canonical cloud state tidak disentuh.
      applyingRemote=true;
      try{window.BFCore.storage.transaction(()=>KEYS.forEach(k=>window.BFCore.storage.removeRaw(k)))}finally{applyingRemote=false}
      base.clear();dirty.clear();
      event("bf:sync-status",{status:"restricted",role:"driver"});
      return;
    }
    if(uid&&activeUserId===uid&&channel)return;
    if(activeUserId&&uid&&activeUserId!==uid){stopPolling();if(channel){try{await cloud.removeChannel(channel)}catch(_){}channel=null}base.clear();dirty.clear()}
    activeUserId=uid;
    const remoteRows=await Promise.race([readRemote(),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Initial data sync timeout")),7000))]);
    applyRows(remoteRows,{initial:true});
    const migration=window.BFSchema?.run?.()||{changedKeys:[]};watch();migration.changedKeys.filter(k=>KEYS.includes(k)).forEach(k=>dirty.add(k));
    const remoteKeys=new Set(remoteRows.map(r=>r.state_key));if(!remoteRows.length&&window.BFCore.user().role==="owner")KEYS.forEach(k=>{if(localValue(k)!==null&&!remoteKeys.has(k))dirty.add(k)});
    if(dirty.size)await push();realtime();polling();
  }catch(e){console.warn("[Bintang Frozen] Initial cloud sync gagal; memakai data perangkat",e);window.BFSchema?.run?.();watch();event("bf:sync-status",{status:navigator.onLine?"error":"offline"})}
  finally{
    booting=false;
    if(authenticated){
      event("bf:cloud-ready",{userId:activeUserId});
      try{await mountMainApp()}
      catch(e){console.error("[Bintang Frozen] Aplikasi gagal dimuat",e);event("bf:startup-error",{message:e?.message||String(e)})}
    }
  }
}
window.BFCloud={storeCode:STORE_CODE,table:TABLE,keys:[...KEYS],pull:()=>pull(false),push,dirtyKeys:()=>[...dirty]};
window.addEventListener("bf:auth-ready",start);
window.addEventListener("bf:auth-signed-out",()=>{activeUserId=null;base.clear();dirty.clear();clearTimeout(pushTimer);pushTimer=null;stopPolling();if(channel){try{cloud?.removeChannel(channel)}catch(_){}channel=null}event("bf:sync-status",{status:"signed-out"})});
})();
