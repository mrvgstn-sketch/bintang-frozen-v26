(function(){
"use strict";
if(window.BFReportingEngine)return;
const {storage}=window.BFCore,DM=window.BFDataModel;
const list=k=>storage.list(k).filter(x=>x&&!x.deleted_at);
const dateOf=r=>String(r?.tanggal||r?.date||r?.created_at||r?.updated_at||"").slice(0,10);
const inRange=(r,from,to)=>{const d=dateOf(r);return !!d&&(!from||d>=from)&&(!to||d<=to)};
const actor=r=>String(r?.updated_by||r?.created_by||r?.actor_email||"-");
const timeOf=r=>{const raw=r?.updated_at||r?.created_at||"";if(!raw)return "-";const d=new Date(raw);return Number.isNaN(d.getTime())?"-":d.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})};
const money=v=>Math.round(DM.num(v));
const photos=v=>Array.isArray(v)?v.filter(Boolean):(typeof v==="string"&&v?[v]:[]);
function dedupe(rows,prefix){const seen=new Set();return rows.filter((r,i)=>{const id=String(r.id||r._bf_uid||r.transaction_no||`${prefix}:${dateOf(r)}:${i}`);if(seen.has(id))return false;seen.add(id);return true})}
function build({from="",to=""}={}){
  const masuk=dedupe(list("bf_masuk_v26"),"in").filter(r=>inRange(r,from,to));
  const keluar=dedupe(list("bf_keluar_v26"),"out").filter(r=>inRange(r,from,to));
  const setoran=dedupe(list("bf_note_setoran_v26"),"dep").filter(r=>inRange(r,from,to));
  const expCombined=[...list("bf_expenses"),...list("bf_note_pengeluaran_v26")];
  const pengeluaran=dedupe(expCombined,"exp").filter(r=>inRange(r,from,to));
  const sembako=dedupe(list("bf_note_sembako_v26"),"gro").filter(r=>inRange(r,from,to));
  const employees=list("bf_employees");
  const rate=name=>DM.num(employees.find(x=>x.active!==false&&String(x.name||x.email||"").toLowerCase()===String(name||"").toLowerCase())?.commission||employees.find(x=>x.active!==false&&String(x.name||x.email||"").toLowerCase()===String(name||"").toLowerCase())?.commission_per_kg||0);
  const incoming=masuk.map(tx=>({tx,groups:DM.supplierGroups(tx).map(g=>({...g,items:(g.items||[]).map(i=>({...i,tally:DM.itemWeights(i),totalKg:DM.itemTotal(i)})),totalKg:DM.groupTotal(g),photos:photos(g.nota_fotos||g.nota_foto)}))}));
  const outgoing=keluar.map(tx=>({tx,groups:DM.customerGroups(tx).map(g=>{const r=DM.num(g.commission_per_kg)||rate(g.marketing);return {...g,items:(g.items||[]).map(i=>({...i,tally:DM.itemWeights(i),totalKg:DM.itemTotal(i)})),totalKg:DM.groupTotal(g),commissionPerKg:g.marketing?r:0,totalKomisi:g.marketing?DM.groupTotal(g)*r:0}})}));
  const commissions=outgoing.flatMap(x=>x.groups.filter(g=>g.marketing).map(g=>({transaction_no:x.tx.transaction_no||"-",tanggal:dateOf(x.tx),customer:g.customer||"-",marketing:g.marketing,kg:g.totalKg,rate:g.commissionPerKg,total:g.totalKomisi,admin:actor(x.tx)})));
  return {from,to,masuk:incoming,keluar:outgoing,setoran,pengeluaran,sembako,komisi:commissions,helpers:{dateOf,actor,timeOf,money,photos}};
}
window.BFReportingEngine={build};
})();
