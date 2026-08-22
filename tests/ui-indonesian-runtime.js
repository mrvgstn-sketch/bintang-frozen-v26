'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const code=fs.readFileSync('assets/js/ui-indonesian.js','utf8');
const domReady=[];
class MutationObserver{constructor(fn){this.fn=fn}observe(){}disconnect(){}}
const document={
  readyState:'loading',
  documentElement:{},
  body:{},
  addEventListener(name,fn){if(name==='DOMContentLoaded')domReady.push(fn)}
};
const window={
  alert:()=>{},
  confirm:()=>true,
  prompt:()=>null
};
const sandbox={window,document,MutationObserver,Node:{TEXT_NODE:3,ELEMENT_NODE:1},console,setTimeout,clearTimeout};
vm.createContext(sandbox);
vm.runInContext(code,sandbox,{filename:'ui-indonesian.js'});
const ui=window.BFUIIndonesian;
assert(ui,'BFUIIndonesian must initialize');

assert.strictEqual(ui.statusLabel('PENDING_OWNER'),'Menunggu Persetujuan Owner');
assert.strictEqual(ui.statusLabel('CORRECTION_REQUIRED'),'Perlu Koreksi');
assert.strictEqual(ui.statusLabel('BANK_FEE'),'Biaya Bank');
assert.strictEqual(ui.statusLabel('handed_over'),'Sudah Diserahkan');
assert.strictEqual(ui.translatePattern('Customer Pickup',true),'Diambil Customer');
assert.strictEqual(ui.translatePattern('Non-Tunai (Legacy)',true),'Non-Tunai (Catatan Lama)');
assert.strictEqual(ui.translatePattern('ABC_DEF',false),'ABC_DEF','free business data must not be translated as an enum');
assert.strictEqual(ui.statusLabel('ABC_DEF'),'Status belum dikenali','unknown raw enum must be hidden in status context');
const tech=ui.technicalError('SQL R13O failed in Supabase: constraint 23505');
assert.strictEqual(tech,'Data belum dapat diproses. Coba lagi. Jika masalah berlanjut, hubungi Admin.');
assert(!/SQL|R13O|Supabase|constraint|23505/i.test(tech),'technical implementation details must not leak');
assert.strictEqual(ui.translatePattern('Dashboard',true),'Ringkasan');
assert.strictEqual(ui.translatePattern('Item',false),'Item','business data outside label context must be preserved');
assert.strictEqual(ui.translatePattern('Item',true),'Barang');

console.log('UI Indonesian runtime presentation tests: 13 passed');
