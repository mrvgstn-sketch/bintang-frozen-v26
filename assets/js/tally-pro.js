(function(){
"use strict";
const DETAIL="bf_tally_detail_v26";
const COLKEY="bf_tally_cols_v26";
const LEGACY="bf_tally_pro_v26";
const $=id=>document.getElementById(id);
const DM=window.BFDataModel;
const {storage,audit,can,deny}=window.BFCore;
let mode="keluar",rows=[],details={},cols=20,editing=null,legacyConflicts=[];
const num=v=>{const n=Number(String(v??0).trim().replace(",","."));return Number.isFinite(n)?n:0};
const esc=s=>window.BFCore.esc(String(s??""));
const fmt=n=>num(n).toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2});
const sourceKey=()=>mode==="masuk"?"bf_masuk_v26":"bf_keluar_v26";
const sourceLabel=r=>mode==="masuk"?r.supplier:r.customer;
const keyOf=(r,c)=>`${mode}|${r.txId}|${r.groupIndex}|${r.itemIndex}|${c}`;
const nowLocal=()=>{const d=new Date(Date.now()-new Date().getTimezoneOffset()*60000);return d.toISOString().slice(0,16)};
function readJSON(k,f){try{const v=JSON.parse(localStorage.getItem(k)||"");return v??f}catch{return f}}
function txId(tx,idx){return String(tx._bf_uid||tx.transaction_no||tx.id||`${sourceKey()}-${idx}`)}
function flatten(){
  const out=[];storage.list(sourceKey()).filter(tx=>!tx.deleted_at).forEach((tx,ti)=>{
    const groups=mode==="masuk"?DM.supplierGroups(tx):DM.customerGroups(tx);
    groups.forEach((g,gi)=>(g.items||[]).forEach((it,ii)=>out.push({
      id:`${txId(tx,ti)}|${gi}|${ii}`,txId:txId(tx,ti),txIndex:ti,groupIndex:gi,itemIndex:ii,
      transaction_no:tx.transaction_no||"",tanggal:tx.tanggal||tx.date||"",customer:g.customer||"",supplier:g.supplier||"",
      item:it.item||"",qty:it.qty??"",satuan:it.satuan||it.unit||"Kg",weights:DM.itemWeights(it),note:it.keterangan||it.note||tx.keterangan||""
    })));
  });return out;
}
function detectLegacyConflicts(){
  legacyConflicts=[];const all=readJSON(LEGACY,{}),legacy=Array.isArray(all?.[mode])?all[mode]:[];
  if(!legacy.length)return;
  const canon=flatten();
  legacy.forEach((lr,i)=>{
    const src=String(mode==="masuk"?(lr.supplier||""):(lr.customer||""));const item=String(lr.item||"");
    const candidates=canon.filter(c=>String(sourceLabel(c))===src&&String(c.item)===item);
    if(!candidates.length){legacyConflicts.push({type:"legacy-only",index:i,source:src,item,legacyWeights:Array.isArray(lr.weights)?lr.weights:[]});return}
    const lw=(Array.isArray(lr.weights)?lr.weights:[]).map(num),match=candidates.some(c=>JSON.stringify(c.weights.map(num))===JSON.stringify(lw));
    if(!match)legacyConflicts.push({type:"weight-conflict",index:i,source:src,item,legacyWeights:lw,canonicalWeights:candidates.map(c=>c.weights)});
  });
}
function load(){details=readJSON(DETAIL,{});cols=Math.max(5,Math.min(50,Number(localStorage.getItem(COLKEY)||20)));rows=flatten();detectLegacyConflicts()}
function saveMetadata(){storage.setRaw(DETAIL,JSON.stringify(details));localStorage.setItem(COLKEY,String(cols))}
function locate(tx,r){
  const groups=mode==="masuk"?DM.supplierGroups(tx):DM.customerGroups(tx),g=groups[r.groupIndex],it=g?.items?.[r.itemIndex];return {groups,g,it};
}
function writeCanonical(r,mutator,action,meta={}){
  const all=storage.list(sourceKey()),i=all.findIndex((tx,idx)=>txId(tx,idx)===r.txId);if(i<0)return false;
  const before=typeof structuredClone==="function"?structuredClone(all[i]):JSON.parse(JSON.stringify(all[i]));
  const tx={...all[i]};
  if(mode==="masuk"){
    tx.suppliers=DM.supplierGroups(tx).map(g=>({...g,items:(g.items||[]).map(it=>({...it,timbangan:[...DM.itemWeights(it)]}))}));
    const it=tx.suppliers[r.groupIndex]?.items?.[r.itemIndex];if(!it)return false;mutator(it,tx.suppliers[r.groupIndex],tx);
    tx.timbangan=tx.suppliers.flatMap(g=>(g.items||[]).flatMap(it=>DM.itemWeights(it)));tx.weights=tx.timbangan;
  }else{
    tx.customers=DM.customerGroups(tx).map(g=>({...g,items:(g.items||[]).map(it=>({...it,timbangan:[...DM.itemWeights(it)]}))}));
    const it=tx.customers[r.groupIndex]?.items?.[r.itemIndex];if(!it)return false;mutator(it,tx.customers[r.groupIndex],tx);
    tx.timbangan=tx.customers.flatMap(g=>(g.items||[]).flatMap(it=>DM.itemWeights(it)));tx.weights=tx.timbangan;
  }
  const prepared=window.BFPrepareTransactionSave?.(before,tx)||{...tx,updated_at:new Date().toISOString()};all[i]=prepared;window.BFOperations.commit(sourceKey(),all,{source:"tally"});audit(action,"tally",r.id,before,prepared,{mode,...meta});return true;
}
function visibleRows(){const q=($('bfTallySearch')?.value||"").toLowerCase(),f=$('bfTallyFilter')?.value||"all";return rows.filter(r=>{const total=r.weights.reduce((a,b)=>a+num(b),0),txt=(sourceLabel(r)+" "+r.item+" "+r.transaction_no).toLowerCase();return(!q||txt.includes(q))&&(f==="all"||(f==="filled"&&total>0)||(f==="empty"&&total<=0))})}
function render(){
  rows=flatten();const visible=visibleRows(),th=$('bfTallyThead'),tb=$('bfTallyTbody');if(!th||!tb)return;
  th.innerHTML="<tr><th>No</th><th>No Transaksi</th><th>"+(mode==="masuk"?"SUPPLIER":"CUSTOMER")+"</th><th>ITEM</th><th>QTY</th><th>SATUAN</th>"+Array.from({length:cols},(_,i)=>`<th class='real'>R${i+1}</th>`).join("")+"<th>TOTAL KG</th><th>KETERANGAN</th></tr>";
  tb.innerHTML=visible.map((r,idx)=>{const total=r.weights.reduce((a,b)=>a+num(b),0);const cells=Array.from({length:cols},(_,c)=>{const v=num(r.weights[c]||0),d=details[keyOf(r,c)]||{};return `<td class='bfTally-detail' data-row='${esc(r.id)}' data-col='${c}'><input class='bfTally-real' data-row='${esc(r.id)}' data-col='${c}' value='${v?String(v).replace('.',','):''}' placeholder='0,00'><div class='bfTally-cell-meta'>${d.operator?'👤 '+esc(d.operator):d.time?'🕒 '+esc(new Date(d.time).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})):'detail'}</div></td>`}).join("");return `<tr><td>${idx+1}</td><td><b>${esc(r.transaction_no||'-')}</b></td><td>${esc(sourceLabel(r)||'-')}</td><td>${esc(r.item||'-')}</td><td>${esc(r.qty||'-')}</td><td>${esc(r.satuan||'-')}</td>${cells}<td class='bfTally-total'>${fmt(total)}</td><td>${esc(r.note||'')}</td></tr>`}).join("")||`<tr><td colspan='${8+cols}'>Belum ada transaksi untuk ditimbang.</td></tr>`;
  const vals=visible.flatMap(r=>r.weights).map(num).filter(v=>v!==0),total=vals.reduce((a,b)=>a+b,0);$('bfTallyRows').textContent=visible.length;$('bfTallyCount').textContent=vals.length;$('bfTallyTotal').textContent=fmt(total)+" kg";$('bfTallyAvg').textContent=fmt(vals.length?total/vals.length:0)+" kg";
  const sub=document.querySelector('.bfTally-sub');if(sub)sub.textContent=`Tally canonical dari transaksi • ${legacyConflicts.length?legacyConflicts.length+' konflik legacy dipertahankan (read-only)':'tidak ada konflik legacy terdeteksi'}`;
}
function openDetail(rid,c){const r=rows.find(x=>x.id===rid);if(!r)return;editing={rid,c};const d=details[keyOf(r,c)]||{};$('bfTallyDetailTitle').textContent=`${mode==='masuk'?'Barang Masuk':'Barang Keluar'} • ${r.transaction_no||'-'} • ${r.item||'Item'} • R${c+1}`;$('bfTallyDWeight').value=String(num(r.weights[c])||'').replace('.',',');$('bfTallyDScale').value=d.scale||'';$('bfTallyDOperator').value=d.operator||'';$('bfTallyDTime').value=d.time||nowLocal();$('bfTallyDGross').value=d.gross||'';$('bfTallyDTare').value=d.tare||'';$('bfTallyDNote').value=d.note||'';$('bfTallyDetail').style.display='flex'}
$('bfTallyClose').onclick=()=>{$('bfTallyOverlay').style.display='none'};
$('bfTallyOverlay').addEventListener('click',e=>{if(e.target.id==='bfTallyOverlay')$('bfTallyOverlay').style.display='none'});
$('bfTallyMode').onchange=e=>{mode=e.target.value;load();render()};$('bfTallySearch').oninput=render;$('bfTallyFilter').onchange=render;
$('bfTallyAddCol').onclick=()=>{if(!can('edit_data'))return deny('edit_data');if(cols>=50)return alert('Maksimal 50 kolom timbangan real.');cols++;localStorage.setItem(COLKEY,String(cols));render()};
$('bfTallyAddRow').textContent='＋ Transaksi';$('bfTallyAddRow').onclick=()=>{if(!can('add_row'))return deny('add_row');$('bfTallyOverlay').style.display='none';(mode==='masuk'?window.BFOpenTransactionsIn:window.BFOpenTransactionsOut)?.()};
$('bfTallyTbody').addEventListener('click',e=>{const cell=e.target.closest('.bfTally-detail');if(cell&&!e.target.classList.contains('bfTally-real'))openDetail(cell.dataset.row,Number(cell.dataset.col))});
$('bfTallyTbody').addEventListener('change',e=>{const t=e.target;if(!t.classList.contains('bfTally-real'))return;if(!can('input_weight')&&!can('edit_weight')&&!can('edit_data'))return deny('input_weight');const r=rows.find(x=>x.id===t.dataset.row),c=Number(t.dataset.col);if(!r)return;writeCanonical(r,it=>{const w=[...DM.itemWeights(it)];while(w.length<=c)w.push(0);w[c]=num(t.value);it.timbangan=w},'input_weight',{col:c+1});requestAnimationFrame(()=>{load();render()})});
$('bfTallyCancelDetail').onclick=()=>{$('bfTallyDetail').style.display='none';editing=null};
$('bfTallySaveDetail').onclick=()=>{if(!editing)return;const r=rows.find(x=>x.id===editing.rid);if(!r)return;const c=editing.c,w=num($('bfTallyDWeight').value);if(!can('input_weight')&&!can('edit_weight')&&!can('edit_data'))return deny('input_weight');if(!writeCanonical(r,it=>{const a=[...DM.itemWeights(it)];while(a.length<=c)a.push(0);a[c]=w;it.timbangan=a},'input_weight',{col:c+1,detail:true}))return;details[keyOf(r,c)]={scale:$('bfTallyDScale').value,operator:$('bfTallyDOperator').value,time:$('bfTallyDTime').value,gross:$('bfTallyDGross').value,tare:$('bfTallyDTare').value,note:$('bfTallyDNote').value};saveMetadata();$('bfTallyDetail').style.display='none';editing=null;load();render()};
window.BFTallyLegacyAudit=()=>({mode,conflicts:[...legacyConflicts],legacyPreserved:localStorage.getItem(LEGACY)!==null});
window.BFOpenTallyLegacyConflicts=()=>{load();if(!legacyConflicts.length)return alert('Tidak ada konflik Tally legacy yang terdeteksi untuk mode ini.');alert(`Ditemukan ${legacyConflicts.length} konflik Tally legacy. Data legacy tidak dihapus dan tidak ditimpa. Lihat console BFTallyLegacyAudit() untuk detail teknis.`);console.warn('[Bintang Frozen] Tally legacy conflicts',legacyConflicts)};
window.BFReloadTally=()=>{load();render()};
window.addEventListener('bf:data-changed',e=>{if((e.detail?.keys||[]).includes(sourceKey())&&$('bfTallyOverlay')?.style.display!=='none'){load();render()}});
load();render();
})();
