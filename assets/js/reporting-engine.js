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
const txIdentity=tx=>String(tx?._bf_uid||tx?.transaction_id||tx?.transaction_no||"");
function dedupe(rows,prefix){const seen=new Set();return rows.filter((r,i)=>{const id=String(r.id||r._bf_uid||r.transaction_id||r.transaction_no||`${prefix}:${dateOf(r)}:${i}`);if(seen.has(id))return false;seen.add(id);return true})}
function stableNumber(v){const n=Number(v);return Number.isFinite(n)?n:null}
function proofMaterial(p={}){return {bucket:String(p.bucket||""),path:String(p.path||""),latitude:stableNumber(p.latitude),longitude:stableNumber(p.longitude),accuracy_m:stableNumber(p.accuracy_m),location_captured_at:String(p.location_captured_at||""),uploaded_at:String(p.uploaded_at||"")}}
function itemMaterial(i={}){return {item:String(i.item||""),qty:i.qty??"",satuan:String(i.satuan||i.unit||""),invoice_weight_kg:i.invoice_weight_kg==null?null:DM.num(i.invoice_weight_kg),timbangan:DM.itemWeights(i)}}
function outgoingMaterial(g={}){return {group_id:String(g.group_id||""),customer:String(g.customer||""),marketing:String(g.marketing||""),driver_id:String(g.driver_id||""),driver_name_snapshot:String(g.driver_name_snapshot||""),payment_method:String(g.payment_method||""),delivery_status:String(g.delivery_status||""),cash_status:String(g.cash_status||""),pos_status:String(g.pos_status||""),pos_snapshot:g.pos_snapshot??null,items:(g.items||[]).map(itemMaterial),delivery_proofs:(Array.isArray(g.delivery_proofs)?g.delivery_proofs:[]).map(proofMaterial)}}
function incomingMaterial(tx={}){return {transaction_no:String(tx.transaction_no||""),tanggal:String(tx.tanggal||tx.date||""),supir:String(tx.supir||tx.driver||""),ongkos_kirim:DM.num(tx.ongkos_kirim??tx.shipping_cost??0),keterangan:String(tx.keterangan||tx.catatan||""),suppliers:DM.supplierGroups(tx).map(g=>({supplier:String(g.supplier||""),invoice_total_weight_kg:g.invoice_total_weight_kg==null?null:DM.num(g.invoice_total_weight_kg),nota_fotos:photos(g.nota_fotos||g.nota_foto),items:(g.items||[]).map(itemMaterial)}))}}
function hashMaterial(value){const s=JSON.stringify(value);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,"0")}
const outgoingFingerprint=g=>hashMaterial(outgoingMaterial(g));
const incomingFingerprint=tx=>hashMaterial(incomingMaterial(tx));
function reviewState(review,fingerprint){if(!review?.fingerprint)return {key:"unreviewed",label:"Belum Dikoreksi",review};if(String(review.fingerprint)!==String(fingerprint))return {key:"stale",label:"Perlu Dikoreksi Ulang",review};return {key:"reviewed",label:"Sudah Dikoreksi",review}}
function invoiceValue(v){return v===null||v===undefined||String(v).trim()===""?null:DM.num(v)}
function variance(real,invoice){return invoice===null?null:DM.num(real)-DM.num(invoice)}
function build({from="",to=""}={}){
  const masuk=dedupe(list("bf_masuk_v26"),"in").filter(r=>inRange(r,from,to));
  const keluar=dedupe(list("bf_keluar_v26"),"out").filter(r=>inRange(r,from,to));
  const setoran=dedupe(list("bf_note_setoran_v26"),"dep").filter(r=>inRange(r,from,to));
  const expCombined=[...list("bf_expenses"),...list("bf_note_pengeluaran_v26")];
  const pengeluaran=dedupe(expCombined,"exp").filter(r=>inRange(r,from,to));
  const sembako=dedupe(list("bf_note_sembako_v26"),"gro").filter(r=>inRange(r,from,to));
  const employees=list("bf_employees");
  const incoming=masuk.map(tx=>{const fp=incomingFingerprint(tx);return {tx,identity:txIdentity(tx),review:reviewState(tx.owner_review,fp),reviewFingerprint:fp,groups:DM.supplierGroups(tx).map(g=>{const invoiceTotal=invoiceValue(g.invoice_total_weight_kg),items=(g.items||[]).map(i=>{const tally=DM.itemWeights(i),totalKg=DM.itemTotal(i),invoice=invoiceValue(i.invoice_weight_kg);return {...i,tally,totalKg,invoiceWeight:invoice,varianceKg:variance(totalKg,invoice)}}),totalKg=DM.groupTotal(g);return {...g,items,totalKg,invoiceTotalWeight:invoiceTotal,varianceKg:variance(totalKg,invoiceTotal),photos:photos(g.nota_fotos||g.nota_foto)}})}});
  const outgoing=keluar.map(tx=>({tx,identity:txIdentity(tx),groups:DM.customerGroups(tx).map(g=>{const rateKnown=DM.own(g,"commission_per_kg")&&DM.num(g.commission_per_kg)>0,r=rateKnown?DM.num(g.commission_per_kg):0,fp=outgoingFingerprint(g);return {...g,items:(g.items||[]).map(i=>({...i,tally:DM.itemWeights(i),totalKg:DM.itemTotal(i)})),totalKg:DM.groupTotal(g),commissionRateKnown:rateKnown,commissionPerKg:g.marketing&&rateKnown?r:0,totalKomisi:g.marketing&&rateKnown?DM.groupTotal(g)*r:0,review:reviewState(g.owner_review,fp),reviewFingerprint:fp}})}));
  const commissions=outgoing.flatMap(x=>x.groups.filter(g=>g.marketing).map(g=>({transaction_no:x.tx.transaction_no||"-",tanggal:dateOf(x.tx),customer:g.customer||"-",marketing:g.marketing,kg:g.totalKg,rate:g.commissionPerKg,rateKnown:g.commissionRateKnown,total:g.totalKomisi,admin:actor(x.tx)})));
  return {from,to,masuk:incoming,keluar:outgoing,setoran,pengeluaran,sembako,komisi:commissions,helpers:{dateOf,actor,timeOf,money,photos,txIdentity,outgoingFingerprint,incomingFingerprint,reviewState,variance}};
}
window.BFReportingEngine={build,txIdentity,outgoingFingerprint,incomingFingerprint,reviewState,_outgoingMaterial:outgoingMaterial,_incomingMaterial:incomingMaterial};
})();
