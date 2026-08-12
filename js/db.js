(function(){
  'use strict';
  const DB_NAME='bintang_frozen_v27'; const VERSION=1;
  const stores=['items','customers','suppliers','drivers','units','incoming','outgoing','notes','adjustments','settings','logs'];
  let dbPromise;
  function open(){
    if(dbPromise) return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,VERSION);
      req.onupgradeneeded=()=>{const db=req.result; for(const name of stores){if(!db.objectStoreNames.contains(name)) db.createObjectStore(name,{keyPath:'id'});}};
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
      req.onblocked=()=>reject(new Error('Database sedang digunakan tab lain. Tutup tab lama lalu coba lagi.'));
    }); return dbPromise;
  }
  async function tx(store,mode,fn){const db=await open();return new Promise((resolve,reject)=>{const t=db.transaction(store,mode);const s=t.objectStore(store);let result;try{result=fn(s,t);}catch(e){reject(e);return;}t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Transaksi database dibatalkan'));});}
  async function all(store){const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});}
  async function get(store,id){const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function put(store,obj){await tx(store,'readwrite',s=>s.put(obj));return obj;}
  async function del(store,id){await tx(store,'readwrite',s=>s.delete(id));}
  async function clear(store){await tx(store,'readwrite',s=>s.clear());}
  async function count(store){const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function exportAll(){const out={version:1,exportedAt:new Date().toISOString(),data:{}};for(const s of stores) out.data[s]=await all(s);return out;}
  async function importAll(payload){if(!payload||!payload.data) throw new Error('Format backup tidak valid');for(const s of stores){await clear(s);for(const row of (payload.data[s]||[])) await put(s,row);}}
  async function resetAll(){for(const s of stores) await clear(s);}
  window.BFDB={open,all,get,put,del,clear,count,exportAll,importAll,resetAll,stores};
})();
