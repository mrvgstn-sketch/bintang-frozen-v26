(function(){
"use strict";

const parse=(k,d=[])=>{try{const x=JSON.parse(localStorage.getItem(k)||"");return x??d}catch(_){return d}};
const arr=k=>{const x=parse(k,[]);return Array.isArray(x)?x:[]};
const num=v=>{const x=Number(String(v??0).replace(/\./g,"").replace(",","."));return Number.isFinite(x)?x:0};
const weightNum=v=>{if(typeof v==="number")return Number.isFinite(v)?v:0;const x=Number(String(v??0).trim().replace(",","."));return Number.isFinite(x)?x:0};
const weights=r=>Array.isArray(r.timbangan)?r.timbangan:(Array.isArray(r.weights)?r.weights:[]);
const totalKg=r=>weights(r).reduce((s,x)=>s+weightNum(x),0);
const money=v=>"Rp "+Math.round(num(v)).toLocaleString("id-ID");
const {esc,today}=window.BFCore;

function currentProfile(){
  const x=window.BFCurrentUser?.()||{};
  return {id:x.user?.id||"", email:x.user?.email||"", name:x.profile?.display_name||x.user?.email||"Pengguna", role:x.profile?.role||""};
}

function annotateTransactions(){
  const me=currentProfile();
  ["bf_masuk_v26","bf_keluar_v26"].forEach(key=>{
    const data=arr(key); let changed=false;
    data.forEach(r=>{
      if(!r.created_at){r.created_at=r.updated_at||new Date().toISOString();changed=true}
      if(!r.created_by){r.created_by=me.name||me.email||"-";changed=true}
      if(!r.updated_at){r.updated_at=r.created_at;changed=true}
      if(!r.updated_by){r.updated_by=r.created_by;changed=true}
      if(!r._bf_version){r._bf_version=1;changed=true}
    });
    if(changed)localStorage.setItem(key,JSON.stringify(data));
  });
}

function transactionSnapshot(r){
  return {updated_at:String(r?.updated_at||""),version:Number(r?._bf_version||0),deleted_at:String(r?.deleted_at||"")};
}

window.BFTransactionConflictCheck=function(localRow, latestRow){
  if(!localRow||!latestRow)return true;
  const a=transactionSnapshot(localRow),b=transactionSnapshot(latestRow);
  return a.updated_at===b.updated_at && a.version===b.version && a.deleted_at===b.deleted_at;
};

window.BFPrepareTransactionSave=function(oldRow,newRow){
  const me=currentProfile(), now=new Date().toISOString();
  const out={...(oldRow||{}),...(newRow||{})};
  if(!oldRow){
    out.created_at=now;
    out.created_by=me.name||me.email||"-";
    out._bf_version=1;
  }else{
    out.created_at=oldRow.created_at||now;
    out.created_by=oldRow.created_by||me.name||me.email||"-";
    out._bf_version=Number(oldRow._bf_version||0)+1;
  }
  out.updated_at=now;
  out.updated_by=me.name||me.email||"-";
  return out;
};

window.BFSoftDeleteTransaction=function(key,id){
  const data=arr(key), me=currentProfile(), now=new Date().toISOString();
  const i=data.findIndex(r=>(r._bf_uid||r.transaction_no)===id);
  if(i<0)return false;
  if(data[i].deleted_at)return false;
  data[i]={...data[i],deleted_at:now,deleted_by:me.name||me.email||"-",updated_at:now,updated_by:me.name||me.email||"-",_bf_version:Number(data[i]._bf_version||0)+1};
  localStorage.setItem(key,JSON.stringify(data));
  window.BFLogActivity?.("delete",key==="bf_masuk_v26"?"barang_masuk":"barang_keluar",data[i].transaction_no||id,null,data[i],{soft_delete:true});
  window.BFCloud?.push?.();
  return true;
};

window.BFRestoreTransaction=function(key,id){
  const data=arr(key), me=currentProfile(), now=new Date().toISOString();
  const i=data.findIndex(r=>(r._bf_uid||r.transaction_no)===id);
  if(i<0)return false;
  data[i]={...data[i],deleted_at:null,deleted_by:null,updated_at:now,updated_by:me.name||me.email||"-",_bf_version:Number(data[i]._bf_version||0)+1};
  localStorage.setItem(key,JSON.stringify(data));
  window.BFLogActivity?.("restore",key==="bf_masuk_v26"?"barang_masuk":"barang_keluar",data[i].transaction_no||id,null,data[i],{});
  window.BFCloud?.push?.();
  return true;
};

window.BFPermanentDeleteTransaction=function(key,id){
  const me=currentProfile();
  if(me.role!=="owner"){alert("Hanya Owner yang dapat menghapus permanen.");return false}
  const data=arr(key), i=data.findIndex(r=>(r._bf_uid||r.transaction_no)===id);
  if(i<0)return false;
  const old=data[i]; data.splice(i,1); localStorage.setItem(key,JSON.stringify(data));
  window.BFLogActivity?.("permanent_delete",key==="bf_masuk_v26"?"barang_masuk":"barang_keluar",old.transaction_no||id,old,null,{});
  window.BFCloud?.push?.();
  return true;
};



window.BFOpenDeletedData=function(){
  const me=currentProfile(); if(me.role!=="owner")return alert("Hanya Owner.");
  document.getElementById("bf-trash-page")?.remove();
  const p=document.createElement("div");p.id="bf-trash-page";p.className="bf-op-page";
  const deleted=[
    ...arr("bf_masuk_v26").filter(r=>r.deleted_at).map(r=>({...r,_key:"bf_masuk_v26",_type:"Barang Masuk"})),
    ...arr("bf_keluar_v26").filter(r=>r.deleted_at).map(r=>({...r,_key:"bf_keluar_v26",_type:"Barang Keluar"}))
  ];
  p.innerHTML=`<div class="bf-op-wrap"><div class="bf-op-head"><button class="bf-op-back">← Kembali</button><div><h2 style="margin:0;color:#0d1b3e">Data Terhapus</h2><small style="color:#64748b">Transaksi yang dihapus • Owner dapat memulihkan atau menghapus permanen</small></div></div><div class="bf-op-card"><div class="bf-op-table-wrap"><table class="bf-op-table"><thead><tr><th>Jenis</th><th>No Transaksi</th><th>Item</th><th>Dihapus</th><th>Oleh</th><th>Aksi</th></tr></thead><tbody>${deleted.map(r=>`<tr><td>${esc(r._type)}</td><td><b>${esc(r.transaction_no||"-")}</b></td><td>${esc(r.item||"-")}</td><td>${esc(r.deleted_at?new Date(r.deleted_at).toLocaleString("id-ID"):"-")}</td><td>${esc(r.deleted_by||"-")}</td><td><div class="bf-trash-actions"><button class="bf-mini-btn restore" data-k="${r._key}" data-id="${esc(r._bf_uid||r.transaction_no)}">Pulihkan</button><button class="bf-mini-btn danger purge" data-k="${r._key}" data-id="${esc(r._bf_uid||r.transaction_no)}">Hapus Permanen</button></div></td></tr>`).join("")||'<tr><td colspan="6">Tidak ada data terhapus.</td></tr>'}</tbody></table></div></div></div>`;
  document.body.appendChild(p);p.querySelector(".bf-op-back").onclick=()=>p.remove();
  p.querySelectorAll(".restore").forEach(b=>b.onclick=()=>{if(window.BFRestoreTransaction(b.dataset.k,b.dataset.id)){p.remove();window.BFOpenDeletedData()}});
  p.querySelectorAll(".purge").forEach(b=>b.onclick=()=>{if(confirm("Hapus permanen? Data tidak dapat dipulihkan.")){if(window.BFPermanentDeleteTransaction(b.dataset.k,b.dataset.id)){p.remove();window.BFOpenDeletedData()}}});
};

function boot(){
  annotateTransactions();
  if(typeof window.BFRenderDashboardEnhancements==="function")window.BFRenderDashboardEnhancements();
}
window.addEventListener("bf:main-mounted",()=>{boot()},{once:true});
})();
