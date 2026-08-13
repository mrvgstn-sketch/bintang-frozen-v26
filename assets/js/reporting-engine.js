(function(){
"use strict";
if(window.BFReportingEngine)return;
const storage=()=>window.BFCore.storage;
const list=k=>storage().list(k).filter(x=>x&&!x.deleted_at);
const n=v=>{const x=Number(String(v??0).replace(/\./g,"").replace(",","."));return Number.isFinite(x)?x:0};
const w=v=>{const x=Number(String(v??0).trim().replace(",","."));return Number.isFinite(x)?x:0};
const dateOf=r=>String(r?.tanggal||r?.date||r?.dateISO||r?.created_at||r?.updated_at||"").slice(0,10);
const dtOf=r=>String(r?.updated_at||r?.created_at||r?.tanggal||r?.date||"");
const actorOf=r=>String(r?.updated_by||r?.created_by||r?.actor_email||"-");
const photos=v=>Array.isArray(v)?v.filter(Boolean):(typeof v==="string"&&v.trim()?[v.trim()]:[]);
const totalWeights=a=>(a||[]).reduce((s,x)=>s+w(x),0);
function range(rows,from,to){return rows.filter(r=>{const d=dateOf(r);return (!from||d>=from)&&(!to||d<=to)})}
function dedupe(rows,prefix){const seen=new Set();return rows.filter((r,i)=>{const id=String(r?.id||r?._bf_uid||r?.transaction_no||`${prefix}:${dateOf(r)}:${actorOf(r)}:${i}`);if(seen.has(id))return false;seen.add(id);return true})}
function customerGroups(r){const legacy=r?.marketing||r?.marketingNama||r?.staff||r?.sales||"";if(Array.isArray(r?.customers)&&r.customers.length)return r.customers.map(g=>({...g,marketing:g?.marketing||g?.marketingNama||legacy||""}));return r?.customer||r?.item?[{customer:r.customer||"",marketing:legacy,items:[{item:r.item||"",qty:r.qty||"",satuan:r.satuan||r.unit||"",timbangan:Array.isArray(r.timbangan)?r.timbangan:(Array.isArray(r.weights)?r.weights:[])}]}]:[]}
function supplierGroups(r){if(Array.isArray(r?.suppliers)&&r.suppliers.length)return r.suppliers.map(g=>({...g,nota_fotos:photos(g?.nota_fotos||g?.nota_foto)}));return r?.supplier||r?.item?[{supplier:r.supplier||"",nota_fotos:photos(r.nota_fotos||r.nota_foto),items:[{item:r.item||"",satuan:r.satuan||r.unit||"",timbangan:Array.isArray(r.timbangan)?r.timbangan:(Array.isArray(r.weights)?r.weights:[])}]}]:[]}
function itemDetail(item={}){const tally=Array.isArray(item.timbangan)?item.timbangan:(Array.isArray(item.weights)?item.weights:[]);return {item:item.item||item.nama||"-",qty:item.qty??item.jumlah??"",satuan:item.satuan||item.unit||"",tally:tally.map(w),totalKg:totalWeights(tally),keterangan:item.keterangan||item.note||""}}
function build({from="",to=""}={}){
  const masuk=range(dedupe(list("bf_masuk_v26"),"in"),from,to),keluar=range(dedupe(list("bf_keluar_v26"),"out"),from,to);
  const expenses=range(dedupe([...list("bf_expenses"),...list("bf_note_pengeluaran_v26")],"expense"),from,to);
  const deposits=range(dedupe(list("bf_note_setoran_v26"),"deposit"),from,to),groceries=range(dedupe(list("bf_note_sembako_v26"),"grocery"),from,to);
  const employees=list("bf_employees"),rate=name=>n(employees.find(x=>x?.active!==false&&String(x.name||x.email||"").toLowerCase()===String(name||"").toLowerCase())?.commission||0);
  const incoming=masuk.map(r=>({id:r._bf_uid||r.id||r.transaction_no,no:r.transaction_no||"-",tanggal:dateOf(r),waktu:dtOf(r),admin:actorOf(r),supir:r.supir||r.driver||"-",ongkosKirim:n(r.ongkos_kirim??r.shipping_cost),keterangan:r.keterangan||r.catatan||r.notes||"",version:Number(r._bf_version||1),groups:supplierGroups(r).map(g=>({supplier:g.supplier||"-",photos:photos(g.nota_fotos||g.nota_foto),items:(g.items||[]).map(itemDetail)}))}));
  const outgoing=keluar.map(r=>({id:r._bf_uid||r.id||r.transaction_no,no:r.transaction_no||"-",tanggal:dateOf(r),waktu:dtOf(r),admin:actorOf(r),keterangan:r.keterangan||r.catatan||r.notes||"",version:Number(r._bf_version||1),groups:customerGroups(r).map(g=>{const items=(g.items||[]).map(itemDetail),kg=items.reduce((s,i)=>s+i.totalKg,0),rr=n(g.commission_per_kg||rate(g.marketing));return {customer:g.customer||g.name||"-",marketing:g.marketing||"",commissionPerKg:rr,totalKomisi:n(g.totalKomisi)||kg*rr,items}})}));
  const setoran=deposits.map(r=>({id:r.id,tanggal:dateOf(r),waktu:dtOf(r),admin:actorOf(r),customer:r.customer||r.namaCustomer||"-",nominal:n(r.nominal??r.jumlah),metode:r.metode||r.via_bank||r.via||"-",keterangan:r.keterangan||"",photos:photos(r.bukti_fotos||r.bukti_foto)}));
  const pengeluaran=expenses.map(r=>({id:r.id,tanggal:dateOf(r),waktu:dtOf(r),admin:actorOf(r),kategori:r.kategori||r.jenis||"-",nominal:n(r.nominal??r.jumlah),metode:r.metode||r.via||"-",keterangan:r.keterangan||"",photos:photos(r.bukti_fotos||r.bukti_foto)}));
  const sembako=groceries.map(r=>({id:r.id,tanggal:dateOf(r),waktu:dtOf(r),admin:actorOf(r),supplier:r.supplier||r.toko||"-",items:Array.isArray(r.items)?r.items.map(i=>({item:i.nama||i.item||"-",qty:n(i.qty??i.jumlah),satuan:i.satuan||"",nominal:n(i.nominal)})):[{item:r.namaBahan||"-",qty:n(r.jumlahKg),satuan:r.satuan||"",nominal:n(r.nominal)}],nominal:n(r.total??r.nominal),metode:r.metode||r.via||"-",keterangan:r.keterangan||"",photos:photos(r.bukti_fotos||r.nota_fotos||r.bukti_foto||r.nota_foto)}));
  const komisi=outgoing.flatMap(tx=>tx.groups.filter(g=>g.marketing||g.commissionPerKg).map(g=>({no:tx.no,tanggal:tx.tanggal,admin:tx.admin,customer:g.customer,marketing:g.marketing,totalKg:g.items.reduce((s,i)=>s+i.totalKg,0),rate:g.commissionPerKg,total:g.totalKomisi})));
  return {from,to,barangMasuk:incoming,barangKeluar:outgoing,setoran,pengeluaran,sembako,komisi};
}
window.BFReportingEngine={build,dateOf,customerGroups,supplierGroups,itemDetail,photos,num:n,weight:w};
})();
