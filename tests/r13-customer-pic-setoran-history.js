'use strict';
const assert=require('assert');
const customers=[
  {id:'c1',name:'Customer A',active:true,contact:'0811'},
  {id:'c2',name:'Customer B',active:false},
  {id:'c3',name:'Customer C',active:true}
];
global.window={BFCore:{storage:{list:key=>key==='bf_customers'?customers:[]}}};
global.document={documentElement:{},getElementById:()=>null,querySelectorAll:()=>[],addEventListener:()=>{}};
global.MutationObserver=class{constructor(fn){this.fn=fn}observe(){}};
global.setInterval=()=>0;
global.clearInterval=()=>{};
require('../assets/js/customer-pic-setoran-history.js');
const api=window.BFCustomerPicSetoranHistory;
assert(api,'enhancer API must load');
assert.deepStrictEqual(api.activeCustomers().map(x=>x.id),['c1','c3'],'only active master customers are selectable');
assert.strictEqual(api.methodKey('transfer'),'TRANSFER');
assert.strictEqual(api.methodLabel('transfer'),'Transfer');
assert.strictEqual(api.methodLabel('bank'),'bank','unknown legacy method must not be guessed as Transfer');
const rows=[
  {id:'s1',tanggal:'2026-08-01',customer_name_snapshot:'Customer A',gross_transfer:1000000,metode:'Transfer',customer_funds_sync_status:'SYNCED',actual_sender:'A',sales_refs:['KP-1']},
  {id:'s2',tanggal:'2026-08-02',customer_name_snapshot:'Customer A',gross_transfer:2000000,metode:'Tunai',customer_funds_sync_status:'PENDING',actual_sender:'B'},
  {id:'s3',tanggal:'2026-08-03',customer_name_snapshot:'Customer C',gross_transfer:3000000,metode:'BANK',customer_funds_sync_status:'LEGACY',actual_sender:'C'}
];
assert.deepStrictEqual(api.filterRecords(rows,{from:'2026-08-01',to:'2026-08-02',customer:'customer a',method:'ALL',status:'ALL',search:''}).map(x=>x.id),['s1','s2']);
assert.deepStrictEqual(api.filterRecords(rows,{from:'',to:'',customer:'',method:'TRANSFER',status:'SYNCED',search:'kp-1'}).map(x=>x.id),['s1']);
assert.deepStrictEqual(api.filterRecords(rows,{from:'',to:'',customer:'',method:'BANK',status:'ALL',search:''}).map(x=>x.id),['s3']);
const input={dataset:{customerId:'c1'},value:'Customer A'};
const group={dataset:{groupId:'g1'},querySelector:sel=>sel==='.bf-customer-search'?input:null};
document.querySelectorAll=sel=>sel==='#bf-customer-groups .bf-customer-group'?[group]:[];
window.BFPrepareTransactionSave=(old,row)=>JSON.parse(JSON.stringify(row));
assert.strictEqual(api.installBarangKeluarIdentityWrapper(),true,'wrapper must install once');
const out=window.BFPrepareTransactionSave(null,{customers:[{group_id:'g1',customer:'Customer A'}]});
assert.strictEqual(out.customers[0].customer_id,'c1');
assert.strictEqual(out.customers[0].customer_name_snapshot,'Customer A');
assert.strictEqual(api.installBarangKeluarIdentityWrapper(),false,'wrapper must not double-wrap');
console.log('R13 Customer PIC + Setoran history logic PASS');
