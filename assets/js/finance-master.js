(function(){
"use strict";
const {esc,uid,now,today,can,deny,storage,audit,user}=window.BFCore;
const list=k=>storage.list(k);
const write=(k,v)=>storage.set(k,v);
const n=v=>{const x=Number(String(v??0).replace(/\./g,"").replace(",","."));return Number.isFinite(x)?x:0};
const weightNum=v=>{if(typeof v==="number")return Number.isFinite(v)?v:0;const x=Number(String(v??0).trim().replace(",","."));return Number.isFinite(x)?x:0};
const rupiah=v=>"Rp "+Math.round(n(v)).toLocaleString("id-ID");
const me=()=>user().name;
function page(title,sub){
  document.querySelectorAll(".bfcrud-page").forEach(x=>x.remove());
  const p=document.createElement("div");p.className="bfcrud-page";
  p.innerHTML=`<div class="bfcrud-wrap"><div class="bfcrud-head"><button class="bfcrud-btn bfcrud-back">← Kembali</button><div><h2 style="margin:0;color:#0d1b3e;font-size:20px;font-weight:900">${esc(title)}</h2><small style="color:#64748b">${esc(sub)}</small></div></div><div class="bfcrud-content"></div></div>`;
  document.body.appendChild(p);p.querySelector(".bfcrud-back").onclick=()=>p.remove();return p;
}
function sync(){window.BFCloud?.push?.()}
function meta(old,row){const t=now(),u=me();return {...(old||{}),...row,id:old?.id||row.id||uid(),created_at:old?.created_at||t,created_by:old?.created_by||u,updated_at:t,updated_by:u}}
async function photo(file){
  if(!file)return "";
  const uploaded=await window.BFPhotoStorage.uploadFile(file,{transactionNo:"finance",supplier:"bukti"});
  return uploaded.url;
}
function photoField(existing=""){
  return `<div class="bfcrud-field" style="grid-column:1/-1"><label>Bukti Foto (opsional)</label><input class="bf-photo-camera" type="file" accept="image/*" capture="environment"><div style="font-size:10px;color:#64748b;margin:4px 0">atau pilih foto dari galeri:</div><input class="bf-photo-gallery" type="file" accept="image/*"><div class="bfcrud-photo" data-existing="${esc(existing)}">${existing?`<img src="${esc(existing)}">`:""}</div></div>`;
}
function bindPhoto(root){
  const preview=root.querySelector(".bfcrud-photo");
  const handle=async e=>{const f=e.target.files?.[0];if(!f)return;preview.innerHTML="Memproses foto...";try{const d=await photo(f);preview.dataset.photo=d;preview.innerHTML=`<img src="${d}">`}catch(_){preview.innerHTML="Foto gagal diproses"}};
  root.querySelector(".bf-photo-camera")?.addEventListener("change",handle);
  root.querySelector(".bf-photo-gallery")?.addEventListener("change",handle);
}
function getPhoto(root){const p=root.querySelector(".bfcrud-photo");return p?.dataset.photo||p?.dataset.existing||""}
function showPhoto(src){if(!src)return;const w=window.open("","_blank");if(w){w.document.write(`<title>Bukti Foto</title><body style="margin:0;background:#111;display:grid;place-items:center;min-height:100vh"><img src="${src}" style="max-width:100%;max-height:100vh"></body>`);w.document.close()}}

// ---------- PENGELUARAN ----------
function expense(){
  if(!can("view_finance")&&!can("view_note"))return deny("view_finance");
  const KEY="bf_expenses";let rows=list(KEY).filter(x=>!x.deleted_at),editing=null;const p=page("Keuangan — Pengeluaran","Tambah, edit, bukti foto, dan catatan pengeluaran");const c=p.querySelector(".bfcrud-content");
  function render(r={}){
    c.innerHTML=`<div class="bfcrud-card"><div class="bfcrud-grid"><div class="bfcrud-field"><label>Tanggal</label><input id="e-date" type="date" value="${esc(r.tanggal||today())}"></div><div class="bfcrud-field"><label>Kategori / Jenis Pengeluaran</label><input id="e-cat" value="${esc(r.kategori||r.jenis||"")}"></div><div class="bfcrud-field"><label>Nominal</label><input id="e-nom" inputmode="numeric" value="${esc(r.nominal??"")}"></div><div class="bfcrud-field" style="grid-column:1/-1"><label>Keterangan</label><textarea id="e-note">${esc(r.keterangan||"")}</textarea></div>${photoField(r.bukti_foto||"")}</div><div class="bfcrud-actions"><button class="bfcrud-btn primary" id="e-save">${editing?"Simpan Perubahan":"Simpan"}</button>${editing?'<button class="bfcrud-btn" id="e-cancel">Batal</button>':""}</div></div><div class="bfcrud-card"><div class="bfcrud-money">Total: ${rupiah(rows.reduce((s,x)=>s+n(x.nominal),0))}</div><div class="bfcrud-table-wrap"><table class="bfcrud-table"><thead><tr><th>Tanggal</th><th>Kategori</th><th>Nominal</th><th>Bukti</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody>${rows.slice().reverse().map(x=>`<tr><td>${esc(x.tanggal)}</td><td>${esc(x.kategori||"-")}</td><td>${rupiah(x.nominal)}</td><td>${x.bukti_foto?`<button class="bfcrud-btn view-photo" data-id="${x.id}">📷 Lihat</button>`:"—"}</td><td>${esc(x.keterangan||"-")}</td><td><button class="bfcrud-btn edit" data-id="${x.id}">Edit</button> <button class="bfcrud-btn danger del" data-id="${x.id}">Hapus</button></td></tr>`).join("")||'<tr><td colspan="6">Belum ada pengeluaran.</td></tr>'}</tbody></table></div></div>`;
    bindPhoto(c);
    c.querySelector("#e-save").onclick=()=>{if(!can("edit_finance")&&!can("edit_data"))return deny("edit_finance");const old=editing?list(KEY).find(x=>x.id===editing.id):null,row=meta(old,{tanggal:c.querySelector("#e-date").value,kategori:c.querySelector("#e-cat").value.trim(),nominal:n(c.querySelector("#e-nom").value),keterangan:c.querySelector("#e-note").value,bukti_foto:getPhoto(c)});if(!row.kategori)return alert("Kategori / jenis pengeluaran wajib diisi.");const all=list(KEY),i=all.findIndex(x=>x.id===row.id);i>=0?all[i]=row:all.push(row);write(KEY,all);audit(old?"edit":"add","pengeluaran",row.id,old,row);sync();editing=null;rows=list(KEY).filter(x=>!x.deleted_at);render()};
    c.querySelector("#e-cancel")?.addEventListener("click",()=>{editing=null;render()});
    c.querySelectorAll(".edit").forEach(b=>b.onclick=()=>{editing=rows.find(x=>x.id===b.dataset.id);render(editing)});
    c.querySelectorAll(".del").forEach(b=>b.onclick=()=>{if(!can("delete_data"))return deny("delete_data");const all=list(KEY),i=all.findIndex(x=>x.id===b.dataset.id);if(i<0||!confirm("Hapus pengeluaran ini?"))return;const old=all[i];all[i]={...old,deleted_at:now(),deleted_by:me()};write(KEY,all);audit("delete","pengeluaran",old.id,old,all[i]);sync();rows=all.filter(x=>!x.deleted_at);render()});
    c.querySelectorAll(".view-photo").forEach(b=>b.onclick=()=>showPhoto(rows.find(x=>x.id===b.dataset.id)?.bukti_foto));
  }render();
}

// ---------- SETORAN ----------
function deposit(){
  if(!can("view_finance")&&!can("view_note"))return deny("view_finance");
  const KEY="bf_note_setoran_v26";let rows=list(KEY).filter(x=>!x.deleted_at),editing=null;const p=page("Keuangan — Setoran","Catatan setoran dengan bukti transfer / slip jika ada");const c=p.querySelector(".bfcrud-content");
  function render(r={}){
    c.innerHTML=`<div class="bfcrud-card"><div class="bfcrud-grid"><div class="bfcrud-field"><label>Tanggal</label><input id="d-date" type="date" value="${esc(r.tanggal||today())}"></div><div class="bfcrud-field"><label>Nama Customer</label><select id="d-customer"><option value="">Pilih Customer...</option>${list("bf_customers").filter(x=>!x.deleted_at&&x.active!==false).map(x=>`<option value="${esc(x.name||x.nama||"")}" ${String(r.customer||"")===String(x.name||x.nama||"")?"selected":""}>${esc(x.name||x.nama||"")}</option>`).join("")}</select></div><div class="bfcrud-field"><label>Nominal</label><input id="d-nom" inputmode="numeric" value="${esc(r.nominal??"")}"></div><div class="bfcrud-field"><label>Via Bank / Metode</label><input id="d-method" value="${esc(r.metode||r.via_bank||"")}"></div><div class="bfcrud-field" style="grid-column:1/-1"><label>Keterangan</label><textarea id="d-note">${esc(r.keterangan||"")}</textarea></div>${photoField(r.bukti_foto||"")}</div><div class="bfcrud-actions"><button class="bfcrud-btn primary" id="d-save">${editing?"Simpan Perubahan":"Simpan"}</button>${editing?'<button class="bfcrud-btn" id="d-cancel">Batal</button>':""}</div></div><div class="bfcrud-card"><div class="bfcrud-money">Total: ${rupiah(rows.reduce((s,x)=>s+n(x.nominal),0))}</div><div class="bfcrud-table-wrap"><table class="bfcrud-table"><thead><tr><th>Tanggal</th><th>Customer</th><th>Nominal</th><th>Via Bank / Metode</th><th>Bukti</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody>${rows.slice().reverse().map(x=>`<tr><td>${esc(x.tanggal)}</td><td>${esc(x.customer||"-")}</td><td>${rupiah(x.nominal)}</td><td>${esc(x.metode||x.via_bank||"-")}</td><td>${x.bukti_foto?`<button class="bfcrud-btn view-photo" data-id="${x.id}">📷 Lihat</button>`:"—"}</td><td>${esc(x.keterangan||"-")}</td><td><button class="bfcrud-btn edit" data-id="${x.id}">Edit</button> <button class="bfcrud-btn danger del" data-id="${x.id}">Hapus</button></td></tr>`).join("")||'<tr><td colspan="7">Belum ada setoran.</td></tr>'}</tbody></table></div></div>`;
    bindPhoto(c);
    c.querySelector("#d-save").onclick=()=>{if(!can("edit_finance")&&!can("edit_data"))return deny("edit_finance");const old=editing?list(KEY).find(x=>x.id===editing.id):null,row=meta(old,{tanggal:c.querySelector("#d-date").value,customer:c.querySelector("#d-customer").value,nominal:n(c.querySelector("#d-nom").value),metode:c.querySelector("#d-method").value.trim(),via_bank:c.querySelector("#d-method").value.trim(),keterangan:c.querySelector("#d-note").value,bukti_foto:getPhoto(c)});const all=list(KEY),i=all.findIndex(x=>x.id===row.id);i>=0?all[i]=row:all.push(row);write(KEY,all);audit(old?"edit":"add","setoran",row.id,old,row);sync();editing=null;rows=list(KEY).filter(x=>!x.deleted_at);render()};
    c.querySelector("#d-cancel")?.addEventListener("click",()=>{editing=null;render()});
    c.querySelectorAll(".edit").forEach(b=>b.onclick=()=>{editing=rows.find(x=>x.id===b.dataset.id);render(editing)});
    c.querySelectorAll(".del").forEach(b=>b.onclick=()=>{if(!can("delete_data"))return deny("delete_data");const all=list(KEY),i=all.findIndex(x=>x.id===b.dataset.id);if(i<0||!confirm("Hapus setoran ini?"))return;const old=all[i];all[i]={...old,deleted_at:now(),deleted_by:me()};write(KEY,all);audit("delete","setoran",old.id,old,all[i]);sync();rows=all.filter(x=>!x.deleted_at);render()});
    c.querySelectorAll(".view-photo").forEach(b=>b.onclick=()=>showPhoto(rows.find(x=>x.id===b.dataset.id)?.bukti_foto));
  }render();
}

// ---------- SEMBAKO MULTI BARANG ----------
function grocery(){
  if(!can("view_finance")&&!can("view_note"))return deny("view_finance");
  const KEY="bf_note_sembako_v26";let rows=list(KEY).filter(x=>!x.deleted_at),editing=null;const p=page("Keuangan — Catatan Pembelian Sembako","Satu supplier / tempat beli dapat mempunyai banyak barang. Tidak masuk Data Master Produk.");const c=p.querySelector(".bfcrud-content");
  const item=(x={},i=0)=>`<div class="bfcrud-item"><div class="bfcrud-grid"><div class="bfcrud-field"><label>Nama Barang ${i+1}</label><input class="g-name" value="${esc(x.nama||x.nama_barang||x.item||"")}"></div><div class="bfcrud-field"><label>Qty</label><input class="g-qty" inputmode="decimal" value="${esc(x.qty??"")}"></div><div class="bfcrud-field"><label>Satuan</label><input class="g-unit" value="${esc(x.satuan||"")}"></div><div class="bfcrud-field"><label>Nominal</label><input class="g-nom" inputmode="numeric" value="${esc(x.nominal??"")}"></div></div>${i?'<button class="bfcrud-btn danger g-remove" type="button">Hapus Barang</button>':""}</div>`;
  function render(r={}){
    const items=Array.isArray(r.items)&&r.items.length?r.items:[{}];
    c.innerHTML=`<div class="bfcrud-card"><div class="bfcrud-grid"><div class="bfcrud-field"><label>Tanggal Pembelian</label><input id="g-date" type="date" value="${esc(r.tanggal||today())}"></div><div class="bfcrud-field"><label>Supplier / Tempat Beli</label><input id="g-supplier" value="${esc(r.supplier||r.toko||"")}" placeholder="Contoh: Toko ABC"></div>${photoField(r.bukti_foto||r.nota_foto||"")}</div><div id="g-items">${items.map(item).join("")}</div><button class="bfcrud-btn" id="g-add" type="button">＋ Tambah Barang</button><div class="bfcrud-card" style="background:#f8fafc;margin-top:10px"><small style="font-weight:800;color:#64748b">TOTAL PEMBELIAN</small><div class="bfcrud-money" id="g-total">${rupiah(0)}</div></div><div class="bfcrud-field"><label>Keterangan</label><textarea id="g-note">${esc(r.keterangan||"")}</textarea></div><div class="bfcrud-actions"><button class="bfcrud-btn primary" id="g-save">${editing?"Simpan Perubahan":"Simpan"}</button>${editing?'<button class="bfcrud-btn" id="g-cancel">Batal</button>':""}</div></div><div class="bfcrud-card"><div class="bfcrud-table-wrap"><table class="bfcrud-table"><thead><tr><th>Tanggal</th><th>Supplier / Tempat</th><th>Barang</th><th>Total</th><th>Bukti</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody>${rows.slice().reverse().map(x=>`<tr><td>${esc(x.tanggal)}</td><td>${esc(x.supplier||x.toko||"-")}</td><td>${esc((x.items||[]).map(i=>i.nama||i.item).filter(Boolean).join(", ")||x.namaBahan||"-")}</td><td>${rupiah(x.total??x.nominal)}</td><td>${x.bukti_foto||x.nota_foto?`<button class="bfcrud-btn view-photo" data-id="${x.id}">📷 Lihat</button>`:"—"}</td><td>${esc(x.keterangan||"-")}</td><td><button class="bfcrud-btn edit" data-id="${x.id}">Edit</button> <button class="bfcrud-btn danger del" data-id="${x.id}">Hapus</button></td></tr>`).join("")||'<tr><td colspan="7">Belum ada catatan sembako.</td></tr>'}</tbody></table></div></div>`;
    bindPhoto(c);
    const box=c.querySelector("#g-items");
    const recalc=()=>{const t=[...box.querySelectorAll(".g-nom")].reduce((s,x)=>s+n(x.value),0);c.querySelector("#g-total").textContent=rupiah(t)};
    const bindItems=()=>{box.querySelectorAll(".g-nom").forEach(x=>x.oninput=recalc);box.querySelectorAll(".g-remove").forEach(x=>x.onclick=()=>{x.closest(".bfcrud-item").remove();recalc()});recalc()};
    c.querySelector("#g-add").onclick=()=>{box.insertAdjacentHTML("beforeend",item({},box.children.length));bindItems()};
    bindItems();
    c.querySelector("#g-save").onclick=()=>{if(!can("edit_finance")&&!can("edit_data"))return deny("edit_finance");const its=[...box.querySelectorAll(".bfcrud-item")].map(x=>({nama:x.querySelector(".g-name").value.trim(),qty:n(x.querySelector(".g-qty").value),satuan:x.querySelector(".g-unit").value.trim(),nominal:n(x.querySelector(".g-nom").value)})).filter(x=>x.nama||x.nominal);if(!its.length)return alert("Tambahkan minimal satu barang.");const old=editing?list(KEY).find(x=>x.id===editing.id):null,total=its.reduce((s,x)=>s+x.nominal,0),row=meta(old,{tanggal:c.querySelector("#g-date").value,supplier:c.querySelector("#g-supplier").value.trim(),toko:c.querySelector("#g-supplier").value.trim(),bukti_foto:getPhoto(c),items:its,total,nominal:total,keterangan:c.querySelector("#g-note").value});const all=list(KEY),i=all.findIndex(x=>x.id===row.id);i>=0?all[i]=row:all.push(row);write(KEY,all);audit(old?"edit":"add","sembako",row.id,old,row);sync();editing=null;rows=list(KEY).filter(x=>!x.deleted_at);render()};
    c.querySelector("#g-cancel")?.addEventListener("click",()=>{editing=null;render()});
    c.querySelectorAll(".edit").forEach(b=>b.onclick=()=>{editing=rows.find(x=>x.id===b.dataset.id);render(editing)});
    c.querySelectorAll(".del").forEach(b=>b.onclick=()=>{if(!can("delete_data"))return deny("delete_data");const all=list(KEY),i=all.findIndex(x=>x.id===b.dataset.id);if(i<0||!confirm("Hapus catatan pembelian ini?"))return;const old=all[i];all[i]={...old,deleted_at:now(),deleted_by:me()};write(KEY,all);audit("delete","sembako",old.id,old,all[i]);sync();rows=all.filter(x=>!x.deleted_at);render()});
    c.querySelectorAll(".view-photo").forEach(b=>b.onclick=()=>{const x=rows.find(x=>x.id===b.dataset.id);showPhoto(x?.bukti_foto||x?.nota_foto)});
  }render();
}

// ---------- KOMISI OTOMATIS ----------
function commission(){
  if(!can("view_commission")&&!can("view_finance"))return deny("view_commission");
  const employees=list("bf_employees");
  const rate=name=>n(employees.find(x=>x.active!==false&&String(x.name||"").toLowerCase()===String(name||"").toLowerCase())?.commission||employees.find(x=>x.active!==false&&String(x.name||"").toLowerCase()===String(name||"").toLowerCase())?.commission_per_kg||0);
  const tx=list("bf_keluar_v26").filter(x=>!x.deleted_at);
  const totalKg=r=>Array.isArray(r.timbangan)?r.timbangan.reduce((s,x)=>s+weightNum(x),0):Array.isArray(r.weights)?r.weights.reduce((s,x)=>s+weightNum(x),0):0;
  const rows=tx.map(r=>{const marketing=r.marketing||"",kg=totalKg(r),per=n(r.commission_per_kg)||rate(marketing);return {...r,_kg:kg,_rate:per,_commission:kg*per}}).filter(r=>r.marketing&&r._rate>0);
  const p=page("Keuangan — Komisi","Otomatis: total kg Barang Keluar × Komisi/Kg Staff");const c=p.querySelector(".bfcrud-content");
  c.innerHTML=`<div class="bfcrud-card"><small style="font-weight:800;color:#64748b">TOTAL KOMISI</small><div class="bfcrud-money">${rupiah(rows.reduce((s,x)=>s+x._commission,0))}</div><div style="font-size:11px;color:#64748b">Komisi tidak diinput ulang di menu ini.</div></div><div class="bfcrud-card"><div class="bfcrud-table-wrap"><table class="bfcrud-table"><thead><tr><th>Barang Keluar</th><th>Tanggal</th><th>Marketing</th><th>Total Kg</th><th>Komisi/Kg</th><th>Perhitungan</th><th>Total</th></tr></thead><tbody>${rows.slice().reverse().map(x=>`<tr><td><b>${esc(x.transaction_no||"-")}</b></td><td>${esc(x.tanggal||"-")}</td><td>${esc(x.marketing)}</td><td>${x._kg.toLocaleString("id-ID")} kg</td><td>${rupiah(x._rate)}/kg</td><td>${x._kg.toLocaleString("id-ID")} × ${rupiah(x._rate)}</td><td><b>${rupiah(x._commission)}</b></td></tr>`).join("")||'<tr><td colspan="7">Belum ada Barang Keluar dengan Marketing dan Komisi/Kg.</td></tr>'}</tbody></table></div></div>`;
}

// ---------- DATA MASTER ----------
function master(type){
  const cfg={
    product:{title:"Produk",key:"bf_products",view:"view_products",manage:"manage_products"},
    supplier:{title:"Supplier",key:"bf_suppliers",view:"view_suppliers",manage:"manage_suppliers"},
    customer:{title:"Customer",key:"bf_customers",view:"view_customers",manage:"manage_customers"}
  }[type];
  if(!can(cfg.view)&&!can(cfg.manage))return deny(cfg.view);
  let rows=list(cfg.key).filter(x=>!x.deleted_at),editing=null;const p=page("Data Master — "+cfg.title,"Tambah, edit, status aktif/nonaktif");const c=p.querySelector(".bfcrud-content");
  function fields(r={}){
    if(type==="product")return `<div class="bfcrud-field"><label>Nama Produk</label><input id="m-name" value="${esc(r.name||r.nama||"")}"></div><div class="bfcrud-field" style="grid-column:1/-1"><label>Catatan</label><textarea id="m-note">${esc(r.notes||r.catatan||"")}</textarea></div><div class="bfcrud-field"><label>Status</label><select id="m-active"><option value="1" ${r.active!==false?"selected":""}>Aktif</option><option value="0" ${r.active===false?"selected":""}>Nonaktif</option></select></div>`;
    if(type==="supplier")return `<div class="bfcrud-field"><label>Nama Supplier</label><input id="m-name" value="${esc(r.name||r.nama||"")}"></div><div class="bfcrud-field"><label>No HP</label><input id="m-phone" value="${esc(r.phone||r.no_hp||"")}"></div><div class="bfcrud-field"><label>Alamat</label><input id="m-address" value="${esc(r.address||r.alamat||"")}"></div><div class="bfcrud-field"><label>Status</label><select id="m-active"><option value="1" ${r.active!==false?"selected":""}>Aktif</option><option value="0" ${r.active===false?"selected":""}>Nonaktif</option></select></div><div class="bfcrud-field" style="grid-column:1/-1"><label>Catatan</label><textarea id="m-note">${esc(r.notes||r.catatan||"")}</textarea></div>`;
    return `<div class="bfcrud-field"><label>Nama</label><input id="m-name" value="${esc(r.name||r.nama||"")}"></div><div class="bfcrud-field"><label>No HP</label><input id="m-phone" value="${esc(r.phone||r.no_hp||"")}"></div><div class="bfcrud-field"><label>Alamat</label><input id="m-address" value="${esc(r.address||r.alamat||"")}"></div><div class="bfcrud-field"><label>Jenis Customer</label><input id="m-type" value="${esc(r.customer_type||r.jenis_customer||"")}"></div><div class="bfcrud-field"><label>Limit Piutang</label><input id="m-limit" inputmode="numeric" value="${esc(r.credit_limit??r.limit_piutang??0)}"></div><div class="bfcrud-field"><label>Status</label><select id="m-active"><option value="1" ${r.active!==false?"selected":""}>Aktif</option><option value="0" ${r.active===false?"selected":""}>Nonaktif</option></select></div><div class="bfcrud-field" style="grid-column:1/-1"><label>Catatan</label><textarea id="m-note">${esc(r.notes||r.catatan||"")}</textarea></div>`;
  }
  function render(r={}){
    c.innerHTML=`<div class="bfcrud-card"><div class="bfcrud-grid">${fields(r)}</div><div class="bfcrud-actions"><button class="bfcrud-btn primary" id="m-save">${editing?"Simpan Perubahan":"+ Tambah "+cfg.title}</button>${editing?'<button class="bfcrud-btn" id="m-cancel">Batal</button>':""}</div></div><div class="bfcrud-card"><input id="m-search" placeholder="Cari ${cfg.title.toLowerCase()}..." style="width:100%;border:1px solid #cbd5e1;border-radius:9px;padding:9px;margin-bottom:8px"><div class="bfcrud-table-wrap"><table class="bfcrud-table"><thead><tr><th>Nama</th><th>${type==="product"?"Catatan":"No HP"}</th><th>${type==="customer"?"Jenis / Limit":type==="supplier"?"Alamat":"Status"}</th><th>Status</th><th>Catatan</th><th>Aksi</th></tr></thead><tbody id="m-body"></tbody></table></div></div>`;
    c.querySelector("#m-save").onclick=()=>{if(!can(cfg.manage)&&!can("edit_data"))return deny(cfg.manage);const old=editing?list(cfg.key).find(x=>x.id===editing.id):null;let row={name:c.querySelector("#m-name").value.trim(),active:c.querySelector("#m-active").value==="1",notes:c.querySelector("#m-note").value};if(!row.name)return alert("Nama wajib diisi.");if(type==="supplier")row={...row,phone:c.querySelector("#m-phone").value,address:c.querySelector("#m-address").value};if(type==="customer")row={...row,phone:c.querySelector("#m-phone").value,address:c.querySelector("#m-address").value,customer_type:c.querySelector("#m-type").value,credit_limit:n(c.querySelector("#m-limit").value)};row=meta(old,row);const all=list(cfg.key),i=all.findIndex(x=>x.id===row.id);i>=0?all[i]=row:all.push(row);write(cfg.key,all);audit(old?"edit":"add",type,row.id,old,row);sync();editing=null;rows=list(cfg.key).filter(x=>!x.deleted_at);render()};
    c.querySelector("#m-cancel")?.addEventListener("click",()=>{editing=null;render()});
    const draw=q=>{const z=rows.filter(x=>JSON.stringify(x).toLowerCase().includes(String(q||"").toLowerCase()));c.querySelector("#m-body").innerHTML=z.map(x=>`<tr><td><b>${esc(x.name||x.nama||"-")}</b></td><td>${esc(type==="product"?(x.notes||"-"):(x.phone||"-"))}</td><td>${type==="customer"?`${esc(x.customer_type||"-")} / ${rupiah(x.credit_limit||0)}`:type==="supplier"?esc(x.address||"-"):(x.active===false?"Nonaktif":"Aktif")}</td><td><span class="bfcrud-status ${x.active===false?"off":""}">${x.active===false?"Nonaktif":"Aktif"}</span></td><td>${esc(x.notes||"-")}</td><td><button class="bfcrud-btn edit" data-id="${x.id}">Edit</button> <button class="bfcrud-btn danger del" data-id="${x.id}">Hapus</button></td></tr>`).join("")||'<tr><td colspan="6">Belum ada data.</td></tr>';c.querySelectorAll(".edit").forEach(b=>b.onclick=()=>{editing=rows.find(x=>x.id===b.dataset.id);render(editing)});c.querySelectorAll(".del").forEach(b=>b.onclick=()=>{if(!can(cfg.manage)&&!can("delete_data"))return deny(cfg.manage);const all=list(cfg.key),i=all.findIndex(x=>x.id===b.dataset.id);if(i<0||!confirm("Hapus data ini?"))return;const old=all[i];all[i]={...old,deleted_at:now(),deleted_by:me(),active:false};write(cfg.key,all);audit("delete",type,old.id,old,all[i]);sync();rows=all.filter(x=>!x.deleted_at);render()})};
    draw("");c.querySelector("#m-search").oninput=e=>draw(e.target.value);
  }render();
}

window.BFOpenFinance=expense;
window.BFOpenFinanceExpense=expense;
window.BFOpenFinanceDeposit=deposit;
window.BFOpenFinanceGrocery=grocery;
window.BFOpenCommission=commission;
window.BFOpenProducts=()=>master("product");
window.BFOpenSuppliers=()=>master("supplier");
window.BFOpenCustomers=()=>master("customer");
})();
