(function(){
"use strict";
if(window.BFOpenCanonicalSetoran)return;
const KEY="bf_note_setoran_v26",Core=window.BFCore,Store=window.BFSetoranStore;
if(!Core||!Store)throw new Error("Setoran canonical store belum siap.");
const {esc,uid,now,today,can,deny,audit,user}=Core;
const money=v=>"Rp "+Math.round(Number(v||0)).toLocaleString("id-ID");
const num=v=>{const n=Number(String(v??"").replace(/\./g,"").replace(",","."));return Number.isFinite(n)?n:0};
function activeCustomers(){return Core.storage.list("bf_customers").filter(x=>!x.deleted_at&&x.active!==false)}
function customerName(x){return String(x?.name||x?.nama||"").trim()}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
async function confirmCloudPersistence(){
  if(!window.BFCloud?.push||!window.BFCloud?.dirtyKeys)throw new Error("Layanan cloud Setoran belum siap.");
  for(let i=0;i<4;i++){
    if(!window.BFCloud.dirtyKeys().includes(KEY))return true;
    const ok=await window.BFCloud.push();
    if(ok===true&&!window.BFCloud.dirtyKeys().includes(KEY))return true;
    await wait(350*(i+1));
  }
  if(!window.BFCloud.dirtyKeys().includes(KEY))return true;
  throw new Error("Penyimpanan Setoran ke cloud belum terkonfirmasi.");
}
async function durableWrite(next,previous){
  Store.write(next);
  try{await confirmCloudPersistence();return true}
  catch(err){
    try{Store.write(previous);await confirmCloudPersistence()}catch(rollbackErr){console.error("[Setoran] rollback cloud belum terkonfirmasi",rollbackErr)}
    throw err;
  }
}
async function uploadProof(file){
  if(!file)return "";
  if(!window.BFPhotoStorage?.uploadFile)throw new Error("Layanan upload bukti belum siap.");
  const r=await window.BFPhotoStorage.uploadFile(file,{transactionNo:"setoran",supplier:"customer-funds"});
  if(!r?.url)throw new Error("Upload bukti Setoran gagal.");
  return r.url;
}
async function registerCustomerFunds(record){
  const sb=window.BFSupabase;if(!sb?.rpc)throw new Error("Backend Customer Funds belum siap.");
  const args={p_source_setoran_id:String(record.id),p_customer_id:String(record.customer_id),p_customer_name:String(record.customer_name_snapshot||record.customer||""),p_gross:num(record.gross_transfer??record.nominal),p_transfer_date:String(record.tanggal||today()).slice(0,10),p_actual_sender:record.actual_sender||null,p_method:record.metode||record.via_bank||null,p_proofs:record.bukti_fotos||[],p_note:record.keterangan||null,p_idempotency:"setoran:"+String(record.id)};
  const {data,error}=await sb.rpc("bf_cf_record_case",args);if(error)throw error;const row=Array.isArray(data)?data[0]:data;if(!row?.id)throw new Error("Customer Funds case tidak mengembalikan ID.");return row;
}
async function persistFundsLink(record,caseRow){
  const before=Store.list(),next=before.map(x=>String(x.id)===String(record.id)?{...x,customer_funds_case_id:caseRow.id,customer_funds_case_no:caseRow.case_no||x.customer_funds_case_no||"",customer_funds_sync_status:"SYNCED",customer_funds_synced_at:now(),customer_funds_sync_error:""}:x);
  await durableWrite(next,before);return next.find(x=>String(x.id)===String(record.id));
}
async function markFundsPending(record,err){
  const before=Store.list(),next=before.map(x=>String(x.id)===String(record.id)?{...x,customer_funds_sync_status:"PENDING",customer_funds_sync_error:String(err?.message||err||"Registrasi Customer Funds gagal"),customer_funds_last_attempt_at:now()}:x);
  try{await durableWrite(next,before)}catch(markerErr){console.error("[Setoran] status Customer Funds pending tidak tersimpan",markerErr)}
}
function isLocked(r){return ["CONFIRMED","ALLOCATED","COMPLETED","VERIFIED","REVERSED"].includes(String(r?.reconciliation_status||r?.status||"").toUpperCase())||!!r?.customer_funds_case_id}
function open(){
  if(!can("view_finance")&&!can("view_note"))return deny("view_finance");
  document.getElementById("bf-setoran-canonical")?.remove();
  let rows=Store.list().filter(x=>!x.deleted_at),editing=null,busy=false;
  const host=document.createElement("div");host.id="bf-setoran-canonical";host.className="bfcrud-page";document.body.appendChild(host);
  function render(){
    const customers=activeCustomers(),r=editing||{};const legacy=!r.customer_id&&!!r.id;
    host.innerHTML=`<div class="bfcrud-wrap"><div class="bfcrud-head"><button class="bfcrud-btn" data-close>← Kembali</button><div><h2 style="margin:0;color:#0d1b3e;font-size:20px;font-weight:900">Keuangan — Setoran</h2><small style="color:#64748b">Satu writer canonical • Customer ID stabil • Cloud ACK + Customer Funds ACK</small></div></div><div class="bfcrud-content">
      <div class="bfcrud-card"><div class="bfcrud-grid">
        <div class="bfcrud-field"><label>Tanggal</label><input id="cs-date" type="date" value="${esc(String(r.tanggal||today()).slice(0,10))}"></div>
        <div class="bfcrud-field"><label>Customer</label><select id="cs-customer"><option value="">Pilih Customer...</option>${customers.map(c=>`<option value="${esc(c.id||c._bf_uid||"")}" ${(r.customer_id&&(r.customer_id===(c.id||c._bf_uid)))?"selected":""}>${esc(customerName(c))}</option>`).join("")}</select>${legacy?`<small style="color:#b45309">Legacy: ${esc(r.customer||r.namaCustomer||"-")} belum memiliki Customer ID. Pilih mapping sebelum menyimpan perubahan.</small>`:""}</div>
        <div class="bfcrud-field"><label>Gross Transfer</label><input id="cs-gross" inputmode="numeric" value="${esc(r.gross_transfer??r.nominal??r.jumlah??"")}"></div>
        <div class="bfcrud-field"><label>Actual Sender</label><input id="cs-sender" value="${esc(r.actual_sender||r.pengirim_aktual||"")}" placeholder="Nama pemilik/pengirim rekening"></div>
        <div class="bfcrud-field"><label>Via Bank / Metode</label><input id="cs-method" value="${esc(r.metode||r.via_bank||r.via||"")}"></div>
        <div class="bfcrud-field"><label>Referensi Nota/POS (opsional)</label><input id="cs-ref" value="${esc(Array.isArray(r.sales_refs)?r.sales_refs.join(", "):(r.sales_ref||""))}" placeholder="Contoh KP-12345, KP-12346"></div>
        <div class="bfcrud-field" style="grid-column:1/-1"><label>Keterangan</label><textarea id="cs-note">${esc(r.keterangan||"")}</textarea></div>
        <div class="bfcrud-field" style="grid-column:1/-1"><label>Bukti transfer/slip (opsional)</label><input id="cs-proof" type="file" accept="image/*" capture="environment">${(r.bukti_foto||r.bukti_fotos?.[0])?`<small>Bukti existing tersimpan.</small>`:""}</div>
      </div><div class="bfcrud-actions"><button class="bfcrud-btn primary" id="cs-save">${editing?"Simpan Perubahan":"Simpan Setoran"}</button>${editing?'<button class="bfcrud-btn" id="cs-cancel">Batal Edit</button>':""}<span id="cs-status" style="font-size:11px;color:#64748b"></span></div></div>
      <div class="bfcrud-card"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><b>Histori Setoran</b><b>${money(rows.reduce((s,x)=>s+num(x.gross_transfer??x.nominal??x.jumlah),0))}</b></div><div class="bfcrud-table-wrap"><table class="bfcrud-table"><thead><tr><th>Tanggal</th><th>Customer</th><th>Gross</th><th>Actual Sender</th><th>Customer Funds</th><th>Metode</th><th>Aksi</th></tr></thead><tbody>${rows.slice().sort((a,b)=>String(b.tanggal||"").localeCompare(String(a.tanggal||""))).map(x=>{const fs=x.customer_funds_sync_status||"LEGACY";return `<tr><td>${esc(x.tanggal||"-")}</td><td>${esc(x.customer_name_snapshot||x.customer||x.namaCustomer||"-")}${!x.customer_id?' <small style="color:#b45309">LEGACY</small>':""}</td><td><b>${money(x.gross_transfer??x.nominal??x.jumlah)}</b></td><td>${esc(x.actual_sender||"-")}</td><td>${esc(x.customer_funds_case_no||fs)}${fs==="PENDING"?`<br><small style="color:#b45309">${esc(x.customer_funds_sync_error||"Menunggu retry")}</small>`:""}</td><td>${esc(x.metode||x.via_bank||x.via||"-")}</td><td>${x.customer_id&&fs!=="SYNCED"?`<button class="bfcrud-btn cs-retry" data-id="${esc(x.id||"")}">Retry Customer Funds</button> `:""}${isLocked(x)?'<small>Locked — koreksi terkontrol</small>':`<button class="bfcrud-btn cs-edit" data-id="${esc(x.id||"")}">Edit</button> <button class="bfcrud-btn danger cs-del" data-id="${esc(x.id||"")}">Hapus Draft</button>`}</td></tr>`}).join("")||'<tr><td colspan="7">Belum ada Setoran.</td></tr>'}</tbody></table></div></div>
    </div></div>`;
    host.querySelector("[data-close]").onclick=()=>host.remove();host.querySelector("#cs-cancel")?.addEventListener("click",()=>{editing=null;render()});
    host.querySelectorAll(".cs-edit").forEach(b=>b.onclick=()=>{editing=rows.find(x=>String(x.id)===b.dataset.id)||null;render()});
    host.querySelectorAll(".cs-retry").forEach(b=>b.onclick=async()=>{if(busy)return;const target=rows.find(x=>String(x.id)===b.dataset.id);if(!target?.customer_id)return;busy=true;b.disabled=true;try{const cf=await registerCustomerFunds(target);await persistFundsLink(target,cf);rows=Store.list().filter(x=>!x.deleted_at);render();alert("Customer Funds case terkonfirmasi: "+(cf.case_no||cf.id))}catch(err){await markFundsPending(target,err);rows=Store.list().filter(x=>!x.deleted_at);render();alert("SETORAN AMAN, CUSTOMER FUNDS BELUM TERSINKRON: "+(err?.message||String(err)))}finally{busy=false}});
    host.querySelectorAll(".cs-del").forEach(b=>b.onclick=async()=>{
      if(busy)return;if(!can("delete_data"))return deny("delete_data");const idx=rows.findIndex(x=>String(x.id)===b.dataset.id);if(idx<0)return;const target=rows[idx];if(isLocked(target))return alert("Setoran sudah locked / terdaftar ke Customer Funds. Gunakan Correction/Reversal.");if(!confirm("Hapus draft Setoran ini?"))return;
      const previous=Store.list(),next=previous.map(x=>String(x.id)===String(target.id)?{...x,deleted_at:now(),deleted_by:user().name}:x);busy=true;
      try{await durableWrite(next,previous);audit("delete","setoran",target.id,target,next.find(x=>String(x.id)===String(target.id)),{canonical_writer:true});rows=Store.list().filter(x=>!x.deleted_at);editing=null;render();alert("Draft Setoran tersimpan dan cloud terkonfirmasi.")}catch(err){alert("GAGAL / BELUM TERSINKRON: "+(err?.message||String(err)))}finally{busy=false}
    });
    host.querySelector("#cs-save").onclick=async()=>{
      if(busy)return;if(!can("edit_finance")&&!can("edit_data"))return deny("edit_finance");
      const customerId=host.querySelector("#cs-customer").value;if(!customerId)return alert("Customer wajib dipilih dari Data Master agar Customer ID stabil.");const customer=customers.find(c=>String(c.id||c._bf_uid||"")===String(customerId));if(!customer)return alert("Customer ID tidak valid. Muat ulang Data Master Customer.");
      const gross=num(host.querySelector("#cs-gross").value);if(gross<=0)return alert("Gross Transfer harus lebih dari Rp0.");const previous=Store.list(),old=editing?previous.find(x=>String(x.id)===String(editing.id)):null;if(old&&isLocked(old))return alert("Setoran sudah locked / terdaftar ke Customer Funds. Gunakan Correction/Reversal.");
      const proofFile=host.querySelector("#cs-proof").files?.[0]||null,status=host.querySelector("#cs-status");busy=true;host.querySelector("#cs-save").disabled=true;status.textContent="Menyimpan Setoran dan menunggu cloud ACK...";
      let record=null;
      try{
        const proof=proofFile?await uploadProof(proofFile):(old?.bukti_foto||old?.bukti_fotos?.[0]||"");const refs=host.querySelector("#cs-ref").value.split(",").map(x=>x.trim()).filter(Boolean),stamp=now();
        record={...(old||{}),id:old?.id||uid(),tanggal:host.querySelector("#cs-date").value,customer_id:String(customerId),customer_name_snapshot:customerName(customer),customer:customerName(customer),gross_transfer:gross,nominal:gross,actual_sender:host.querySelector("#cs-sender").value.trim(),metode:host.querySelector("#cs-method").value.trim(),via_bank:host.querySelector("#cs-method").value.trim(),sales_refs:refs,keterangan:host.querySelector("#cs-note").value.trim(),bukti_foto:proof,bukti_fotos:proof?[proof]:[],reconciliation_status:old?.reconciliation_status||"PENDING_OWNER_CONFIRMATION",customer_funds_sync_status:"PENDING",created_at:old?.created_at||stamp,created_by:old?.created_by||user().name,created_by_id:old?.created_by_id||user().id,updated_at:stamp,updated_by:user().name,updated_by_id:user().id,schema_version:3};
        const next=[...previous],idx=next.findIndex(x=>String(x.id)===String(record.id));idx>=0?next[idx]=record:next.push(record);await durableWrite(next,previous);audit(old?"edit":"add","setoran",record.id,old,record,{canonical_writer:true,customer_id:record.customer_id,durable_ack:true});
        status.textContent="Setoran aman. Mendaftarkan Customer Funds...";
        try{const cf=await registerCustomerFunds(record);record=await persistFundsLink(record,cf);audit("link_customer_funds","setoran",record.id,null,{case_id:cf.id,case_no:cf.case_no},{idempotent:true});rows=Store.list().filter(x=>!x.deleted_at);editing=null;render();alert("Setoran tersimpan, cloud ACK dan Customer Funds ACK terkonfirmasi.")}
        catch(cfErr){await markFundsPending(record,cfErr);rows=Store.list().filter(x=>!x.deleted_at);editing=null;render();alert("SETORAN TERSIMPAN, tetapi Customer Funds belum terkonfirmasi. Gunakan tombol Retry Customer Funds. Detail: "+(cfErr?.message||String(cfErr)))}
      }catch(err){status.textContent="GAGAL / BELUM TERSINKRON";alert("GAGAL / BELUM TERSINKRON: "+(err?.message||String(err)));host.querySelector("#cs-save").disabled=false}
      finally{busy=false}
    };
  }
  render();
}
window.BFOpenCanonicalSetoran=open;
})();