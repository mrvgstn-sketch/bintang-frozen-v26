const fs=require('fs'),vm=require('vm'),assert=require('assert');
const data=new Map([['bf_note_setoran_v26',JSON.stringify([{id:'legacy-1',customer:'CV Lama',nominal:100000}])]]);
const before=[];
const localStorage={getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(String(k),String(v)),removeItem:k=>data.delete(String(k))};
const storage={
  beforeSet(fn){before.push(fn)},
  list(k){try{const v=JSON.parse(data.get(k)||'[]');return Array.isArray(v)?v:[]}catch{return[]}},
  set(k,value){let next=JSON.stringify(value);for(const fn of before){const out=fn({key:String(k),value:next});if(out&&Object.prototype.hasOwnProperty.call(out,'value'))next=String(out.value)}data.set(String(k),next)},
  setRaw(k,v){data.set(String(k),String(v))},removeRaw(k){data.delete(String(k))}
};
const events=[];
class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail}}
const window={BFCore:{storage},dispatchEvent:e=>events.push(e),CustomEvent};
const context={window,localStorage,console,CustomEvent};vm.createContext(context);
vm.runInContext(fs.readFileSync('assets/js/schema-migrations.js','utf8'),context,{filename:'schema-migrations.js'});
assert(window.BFSetoranStore?.isCanonicalWriter===true,'canonical Setoran writer must exist');
const original=data.get('bf_note_setoran_v26');
// Simulate a legacy writer going through BFCore/localStorage beforeSet pipeline.
storage.set('bf_note_setoran_v26',[{id:'legacy-evil',customer:'Changed',nominal:999999}]);
assert.strictEqual(data.get('bf_note_setoran_v26'),original,'non-canonical writer must not mutate Setoran');
assert(events.some(e=>e.type==='bf:setoran-writer-blocked'),'blocked write must emit diagnostic event');
// Canonical writer must still mutate the dataset.
window.BFSetoranStore.write([{id:'canonical-1',customer_id:'cust-1',customer_name_snapshot:'CV A',gross_transfer:1100000}]);
const saved=JSON.parse(data.get('bf_note_setoran_v26'));
assert.strictEqual(saved[0].id,'canonical-1');
assert.strictEqual(saved[0].customer_id,'cust-1');
// Identical compatibility write is harmless and remains accepted as a no-op.
const stable=data.get('bf_note_setoran_v26');storage.set('bf_note_setoran_v26',JSON.parse(stable));assert.strictEqual(data.get('bf_note_setoran_v26'),stable);
console.log('R13 Setoran single-writer guard PASS');
