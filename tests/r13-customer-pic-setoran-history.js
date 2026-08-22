'use strict';
const assert=require('assert');
const customers=[
 {id:'c1',name:'Pendi',active:true,phone:'',address:'',type:'Umum',credit_limit:0},
 {id:'c2',name:'Customer B',active:false},
 {id:'c3',name:'Toko Sama',active:true,phone:'0811',address:'A',type:'Umum',credit_limit:0}
];
global.window={BFCore:{storage:{list:k=>k==='bf_customers'?customers:[]}}};
global.document={documentElement:{dataset:{}},querySelectorAll:()=>[],addEventListener:()=>{},getElementById:()=>null};
global.setInterval=()=>0;global.clearInterval=()=>{};
require('../assets/js/customer-pic-setoran-history.js');
const api=window.BFCustomerPicSetoranHistory;
assert(api);
assert.deepStrictEqual(api.activeCustomers().map(x=>x.id),['c1','c3']);
assert.strictEqual(api.exactDuplicate({name:' Pendi ',phone:'',address:'',type:'Umum',credit_limit:0}).id,'c1');
assert.strictEqual(api.exactDuplicate({name:'Toko Sama',phone:'0822',address:'A',type:'Umum',credit_limit:0}),null,'same name with different identifier must not auto-dedupe');
const input={dataset:{customerId:'c1'},value:'Pendi'},group={dataset:{groupId:'g1'},querySelector:s=>s==='.bf-customer-search'?input:null};
document.querySelectorAll=s=>s==='#bf-customer-groups .bf-customer-group'?[group]:[];
window.BFPrepareTransactionSave=(old,row)=>JSON.parse(JSON.stringify(row));
assert.strictEqual(api.installBarangKeluarIdentityWrapper(),true);
const out=window.BFPrepareTransactionSave(null,{customers:[{group_id:'g1',customer:'Pendi'}]});
assert.strictEqual(out.customers[0].customer_id,'c1');
assert.strictEqual(out.customers[0].customer_name_snapshot,'Pendi');
assert.strictEqual(api.installBarangKeluarIdentityWrapper(),false);
console.log('R13 Customer identity + duplicate guard logic PASS');
window.BFSetoranStore={list:()=>[]};
require('../assets/js/setoran-canonical.js');
const sg=window.BFSetoranGuided;
assert(sg,'guided Setoran API must load');
assert.deepStrictEqual(sg.calc(10500000,[4000000,3000000,3000000]),{total:10000000,difference:500000});
assert.strictEqual(sg.normalizeMethod({metode:'Bca'}).key,'TRANSFER');
assert.strictEqual(sg.normalizeMethod({metode:'Bca'}).account,'BCA');
assert.strictEqual(sg.normalizeMethod({metode:'Cash/BCA'}).key,'LEGACY_MIXED');
assert.strictEqual(sg.normalizeMethod({metode:''}).label,'Metode Tidak Tercatat');
assert.strictEqual(sg.businessStatus({commission_status:'PENDING_OWNER'}),'Menunggu Konfirmasi Owner');
console.log('R13 guided Setoran calculation + legacy method normalization PASS');
