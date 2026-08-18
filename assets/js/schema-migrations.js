(function(){
"use strict";
const VERSION_KEY="bf_schema_version";
const CURRENT_VERSION=3;
const LEGACY_ALIASES={
  bf_masuk_v26:["bf_masuk_v23_manual"],
  bf_keluar_v26:["bf_keluar_v23_manual"],
  bf_note_pengeluaran_v26:["bf_note_pengeluaran_v23b","bf_note_pengeluaran_v23c"],
  bf_note_setoran_v26:["bf_note_setoran_v23b","bf_note_setoran_v23c"],
  bf_note_sembako_v26:["bf_note_sembako_v23c"],
  bf_tally_pro_v26:["bf_tally_pro_v25"],
  bf_tally_detail_v26:["bf_tally_detail_v25"],
  bf_tally_cols_v26:["bf_tally_cols_v25"],
  bf_current_session_v26:["bf_current_session_v24"],
  bf_staff_v26:["bf_staff_v24"],
  bf_activity_log_v26:["bf_activity_log_v24"],
  bf_owner_v26:["bf_owner_v23"],
  bf_sync_v26:["bf_sync_v24"]
};
function parse(raw,fallback=null){try{return JSON.parse(raw)??fallback}catch(_){return fallback}}
function identity(row){
  if(!row||typeof row!=="object")return JSON.stringify(row);
  return String(row.id||row._bf_uid||row.transaction_no||row.no||row.uid||JSON.stringify(row));
}
function freshness(row){const t=Date.parse(row?.updated_at||row?.created_at||"");return Number.isFinite(t)?t:0}
function mergeArrays(arrays){
  const map=new Map();
  arrays.flat().forEach(row=>{const id=identity(row),old=map.get(id);if(!old||freshness(row)>=freshness(old))map.set(id,row)});
  return [...map.values()];
}
function mergeValues(values){
  const parsed=values.map(v=>parse(v,undefined)).filter(v=>v!==undefined);
  if(!parsed.length)return null;
  if(parsed.every(Array.isArray))return JSON.stringify(mergeArrays(parsed));
  if(parsed.every(v=>v&&typeof v==="object"&&!Array.isArray(v)))return JSON.stringify(Object.assign({},...parsed));
  return values.find(v=>v!==null&&v!==undefined)??null;
}
function migrateCanonicalKeys(){
  const changed=[];
  Object.entries(LEGACY_ALIASES).forEach(([target,aliases])=>{
    const values=[];
    const current=localStorage.getItem(target);if(current!==null)values.push(current);
    aliases.forEach(k=>{const v=localStorage.getItem(k);if(v!==null)values.push(v)});
    if(values.length){const merged=mergeValues(values);if(merged!==null&&merged!==current){window.BFCore.storage.setRaw(target,merged);changed.push(target)}}
    aliases.forEach(k=>window.BFCore.storage.removeRaw(k));
  });
  return changed;
}
function normalizeIncomingPhotos(){
  const key="bf_masuk_v26",raw=localStorage.getItem(key),rows=parse(raw,[]);if(!Array.isArray(rows))return [];
  let changed=false;
  const next=rows.map(row=>{
    if(!row||typeof row!=="object"||!Array.isArray(row.suppliers))return row;
    const suppliers=row.suppliers.map(group=>{
      const g={...group};
      if(!Array.isArray(g.nota_fotos)){g.nota_fotos=g.nota_foto?[g.nota_foto]:[];changed=true}
      if(!g.nota_foto&&g.nota_fotos[0]){g.nota_foto=g.nota_fotos[0];changed=true}
      const hasLegacy=g.nota_fotos.some(x=>typeof x==="string"&&x.startsWith("data:image/"));
      if(hasLegacy&&g.nota_storage_state!=="legacy-base64"){g.nota_storage_state="legacy-base64";changed=true}
      return g;
    });
    return {...row,suppliers};
  });
  if(changed)window.BFCore.storage.setRaw(key,JSON.stringify(next));
  return changed?[key]:[];
}
function run(){
  const start=Number(localStorage.getItem(VERSION_KEY)||0),changed=[];
  changed.push(...migrateCanonicalKeys());
  changed.push(...normalizeIncomingPhotos());
  window.BFCore.storage.setRaw(VERSION_KEY,String(CURRENT_VERSION));
  return {from:start,to:CURRENT_VERSION,changedKeys:[...new Set(changed)]};
}
window.BFSchema={CURRENT_VERSION,LEGACY_ALIASES,run};
})();
