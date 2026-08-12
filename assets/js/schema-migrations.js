(function(){
"use strict";
const VERSION_KEY="bf_schema_version";
const CURRENT_VERSION=2;
function parseArray(key){const x=window.BFCore.storage.get(key,[]);return Array.isArray(x)?x:[]}
function migrateIncomingV1(){
  const key="bf_masuk_v23_manual", rows=parseArray(key);let changed=false;
  const next=rows.map(row=>{
    if(!row||typeof row!=="object")return row;
    const copy={...row};
    if(Array.isArray(copy.suppliers)){
      copy.suppliers=copy.suppliers.map(group=>{
        const g={...group};
        if(!Array.isArray(g.nota_fotos)){g.nota_fotos=g.nota_foto?[g.nota_foto]:[];changed=true}
        if(!g.nota_foto&&g.nota_fotos[0]){g.nota_foto=g.nota_fotos[0];changed=true}
        return g;
      });
    }
    return copy;
  });
  if(changed)window.BFCore.storage.setRaw(key,JSON.stringify(next));
  return changed?[key]:[];
}
function migratePhotoMetadataV2(){
  const key="bf_masuk_v23_manual",rows=parseArray(key);let changed=false;
  const next=rows.map(row=>{
    if(!row||!Array.isArray(row.suppliers))return row;
    const suppliers=row.suppliers.map(group=>{
      if(!Array.isArray(group.nota_fotos))return group;
      const hasLegacy=group.nota_fotos.some(x=>typeof x==="string"&&x.startsWith("data:image/"));
      if(hasLegacy&&group.nota_storage_state!=="legacy-base64"){changed=true;return {...group,nota_storage_state:"legacy-base64"}}
      return group;
    });
    return {...row,suppliers};
  });
  if(changed)window.BFCore.storage.setRaw(key,JSON.stringify(next));
  return changed?[key]:[];
}
function run(){
  const start=Number(localStorage.getItem(VERSION_KEY)||0);let version=start,changed=[];
  if(version<1){changed.push(...migrateIncomingV1());version=1}
  if(version<2){changed.push(...migratePhotoMetadataV2());version=2}
  window.BFCore.storage.setRaw(VERSION_KEY,String(CURRENT_VERSION));
  return {from:start,to:CURRENT_VERSION,changedKeys:[...new Set(changed)]};
}
window.BFSchema={CURRENT_VERSION,run};
})();
