(function(){
"use strict";
if(window.BFCore)return;

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const json=(value,fallback=null)=>{try{const parsed=JSON.parse(value);return parsed??fallback}catch(_){return fallback}};
const uid=()=>crypto.randomUUID?.()||("bf-"+Date.now()+"-"+Math.random().toString(36).slice(2));
const now=()=>new Date().toISOString();
const today=()=>(new Date(Date.now()-new Date().getTimezoneOffset()*60000)).toISOString().slice(0,10);
const current=()=>window.BFCurrentUser?.()||{};
const user=()=>{const x=current();return {id:x.user?.id||"",email:x.user?.email||x.profile?.email||"",name:x.profile?.display_name||x.user?.email||"Pengguna",role:x.profile?.role||""}};
const can=permission=>typeof window.BFCan==="function"?window.BFCan(permission):false;
const audit=(action,type,id,before,after,metadata={})=>{try{return window.BFLogActivity?.(action,type,id,before??null,after??null,metadata)}catch(_){return undefined}};
const deny=(permission,message="Anda tidak memiliki izin untuk tindakan ini.")=>{audit("permission_denied","feature",permission,null,null,{permission});alert(message);return false};

const nativeSet=localStorage.setItem.bind(localStorage);
const nativeRemove=localStorage.removeItem.bind(localStorage);
const nativeStorageGet=localStorage.getItem.bind(localStorage);
const beforeSet=[];
const changeListeners=[];
const READ_ONLY_LEGACY_KEYS=new Set(["bf_note_setoran_v26"]);
let bypass=0;
function notify(detail){for(const fn of changeListeners){try{fn(detail)}catch(err){console.error("[BFCore] storage listener",err)}}}
function blockLegacyMutation(key,next){
  const currentValue=nativeStorageGet(key);
  if(!READ_ONLY_LEGACY_KEYS.has(String(key))||currentValue===String(next))return false;
  console.error("[BFCore] blocked write to read-only legacy key",key);
  window.dispatchEvent(new CustomEvent("bf:legacy-write-blocked",{detail:{key:String(key)}}));
  return true;
}
localStorage.setItem=function(key,value){
  let next=String(value);
  if(!bypass){
    if(blockLegacyMutation(key,next))return;
    for(const fn of beforeSet){const out=fn({key:String(key),value:next});if(out&&Object.prototype.hasOwnProperty.call(out,"value"))next=String(out.value)}
  }
  nativeSet(key,next);
  if(!bypass)notify({type:"set",key:String(key),value:next});
};
localStorage.removeItem=function(key){
  if(!bypass&&READ_ONLY_LEGACY_KEYS.has(String(key))&&nativeStorageGet(key)!==null){
    console.error("[BFCore] blocked delete of read-only legacy key",key);
    window.dispatchEvent(new CustomEvent("bf:legacy-write-blocked",{detail:{key:String(key),operation:"remove"}}));
    return;
  }
  nativeRemove(key);if(!bypass)notify({type:"remove",key:String(key)});
};

const largeStore=(()=>{
  const DB="bf_v26_cache",STORE="large_values";let dbPromise=null;
  function db(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB,1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error("IndexedDB gagal dibuka"));
    });return dbPromise;
  }
  async function op(mode,key,value){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,mode),st=tx.objectStore(STORE),r=value===undefined?st.get(key):st.put(value,key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  return {get:key=>op("readonly",key),set:(key,value)=>op("readwrite",key,value),remove:async key=>{const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,"readwrite"),r=tx.objectStore(STORE).delete(key);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}};
})();

// Pindahkan cache backup besar versi sebelumnya dari localStorage ke IndexedDB.
try{
  const legacyBackup=nativeStorageGet("bf_drive_backup_data");
  if(legacyBackup){
    largeStore.set("bf_drive_backup_data",legacyBackup).then(()=>{try{nativeRemove("bf_drive_backup_data")}catch(_){}}).catch(()=>{});
  }
}catch(_){}

const storage={
  get:(key,fallback=null)=>json(localStorage.getItem(key),fallback),
  list:(key)=>{const x=json(localStorage.getItem(key),[]);return Array.isArray(x)?x:[]},
  set:(key,value)=>localStorage.setItem(key,JSON.stringify(value)),
  remove:key=>localStorage.removeItem(key),
  setRaw:(key,value)=>{bypass++;try{nativeSet(key,String(value))}finally{bypass--}},
  removeRaw:key=>{bypass++;try{nativeRemove(key)}finally{bypass--}},
  transaction(fn){bypass++;try{return fn()}finally{bypass--}},
  beforeSet(fn){beforeSet.push(fn);return ()=>{const i=beforeSet.indexOf(fn);if(i>=0)beforeSet.splice(i,1)}},
  onChange(fn){changeListeners.push(fn);return ()=>{const i=changeListeners.indexOf(fn);if(i>=0)changeListeners.splice(i,1)}},
  isLegacyReadOnly:key=>READ_ONLY_LEGACY_KEYS.has(String(key))
};

function modal(title,html,{id="bf-core-modal",width=900,className=""}={}){
  document.getElementById(id)?.remove();
  const host=document.createElement("div");host.id=id;host.className=className;
  host.innerHTML=`<div class="bf-gov-back"><div class="bf-gov-modal wide" style="max-width:${Number(width)||900}px"><div class="bf-gov-head"><b>${esc(title)}</b><button data-close>✕</button></div><div class="bf-gov-body">${html}</div></div></div>`;
  document.body.appendChild(host);host.querySelector("[data-close]")?.addEventListener("click",()=>host.remove());return host;
}
function page({id,className,title,subtitle,contentClass="",backText="← Kembali",onBack}={}){
  if(id)document.getElementById(id)?.remove();
  const el=document.createElement("div");if(id)el.id=id;el.className=className||"";
  el.innerHTML=`<div class="bf-op-wrap"><div class="bf-op-head"><button data-bf-back>${esc(backText)}</button><div><h2 style="margin:0;color:#0d1b3e">${esc(title||"")}</h2><small style="color:#64748b">${esc(subtitle||"")}</small></div></div><div class="${esc(contentClass)}" data-bf-content></div></div>`;
  document.body.appendChild(el);el.querySelector("[data-bf-back]")?.addEventListener("click",()=>{onBack?.();el.remove()});return el;
}

window.BFCore={esc,json,uid,now,today,current,user,can,audit,deny,storage,largeStore,modal,page};
})();