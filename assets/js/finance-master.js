(function(){
"use strict";
const {esc,uid,now,today,can,deny,storage,audit,user}=window.BFCore;
const list=k=>storage.list(k);
const write=(k,v)=>storage.set(k,v);
const n=v=>{const x=Number(String(v??0).replace(/\./g,"").replace(",","."));return Number.isFinite(x)?x:0};
const weightNum=v=>{if(typeof v==="number")return Number.isFinite(v)?v:0;const x=Number(String(v??0).trim().replace(",","."));return Number.isFinite(x)?x:0};
const rupiah=v=>"Rp "+Math.round(n(v)).toLocaleString("id-ID");
const DM=window.BFDataModel;
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
function photoArray(value){
  if(Array.isArray(value))return value.filter(Boolean);
  if(typeof value==="string"&&value.trim())return [value.trim()];
  return [];
}
function photoField(existing=[]){
  const photos=photoArray(existing);
  return `<div class="bfcrud-field" style="grid-column:1/-1"><label>Bukti Foto (opsional, bisa lebih dari satu)</label>
    <input class="bf-photo-camera" type="file" accept="image/*" capture="environment">
    <div style="font-size:10px;color:#64748b;margin:4px 0">atau pilih beberapa foto dari galeri:</div>
    <input class="bf-photo-gallery" type="file" accept="image/*" multiple>
    <div class="bfcrud-photo" data-photos="${esc(JSON.stringify(photos))}"></div>
  </div>`;
}
function bindPhoto(root){
  const preview=root.querySelector(".bfcrud-photo"); if(!preview)return;
  let photos=[];try{photos=photoArray(JSON.parse(preview.dataset.photos||"[]"))}catch(_){photos=[]}
  const render=()=>{preview.dataset.photos=JSON.stringify(photos);preview.innerHTML=photos.map((src,i)=>`<span class="bfcrud-photo-item"><img src="${esc(src)}"><button type="button" class="bfcrud-photo-remove" data-index="${i}" aria-label="Hapus foto ${i+1}">×</button></span>`).join("");preview.querySelectorAll(".bfcrud-photo-remove").forEach(b=>b.onclick=()=>{photos.splice(Number(b.dataset.index),1);render()})};
  const handle=async e=>{const files=[...(e.target.files||[])];if(!files.length)return;const before=[...photos];preview.dataset.busy="1";try{for(const f of files)photos.push(await photo(f));render()}catch(err){photos=before;render();alert(err?.message||"Salah satu foto gagal di-upload. Tidak ada perubahan foto yang disimpan.")}finally{delete preview.dataset.busy;e.target.value=""}};
  root.querySelector(".bf-photo-camera")?.addEventListener("change",handle);
  root.querySelector(".bf-photo-gallery")?.addEventListener("change",handle);
  render();
}
function getPhotos(root){const p=root.querySelector(".bfcrud-photo");try{return photoArray(JSON.parse(p?.dataset.photos||"[]"))}catch(_){return []}}
function showPhotos(value){
  const photos=photoArray(value);if(!photos.length)return;
  const w=window.open("","_blank");if(w){w.document.write(`<title>Bukti Foto</title><body style="margin:0;padding:16px;background:#111;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">${photos.map(src=>`<img src="${esc(src)}" style="width:100%;max-height:90vh;object-fit:contain;background:#000;border-radius:10px">`).join("")}</body>`);w.document.close()}
}

function financeDateString(d){
  const pad=x=>String(x).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function financeWeekValue(dateStr=today()){
  const m=String(dateStr||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return "";
  const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
  const th=new Date(d);th.setDate(d.getDate()+3-((d.getDay()+6)%7));
  const week1=new Date(th.getFullYear(),0,4);
  const week=1+Math.round(((th-week1)/86400000-3+((week1.getDay()+6)%7))/7);
  return `${th.getFullYear()}-W${String(week).padStart(2,"0")}`;
}
function financeWeekBounds(value){
  const m=String(value||"").match(/^(\d{4})-W(\d{2})$/);if(!m)return null;
  const y=Number(m[1]),w=Number(m[2]),jan4=new Date(y,0,4),jan4Day=(jan4.getDay()+6)%7;
  const monday=new Date(y,0,4-jan4Day+(w-1)*7),sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
  return [financeDateString(monday),financeDateString(sunday)];
}
function filterFinanceByPeriod(rows,filter){
  const mode=filter?.mode||"all",value=String(filter?.value||"");
  if(mode==="all")return rows.slice();
  if(mode==="day")return rows.filter(x=>String(x.tanggal||"").slice(0,10)===value);
  if(mode==="month")return rows.filter(x=>String(x.tanggal||"").slice(0,7)===value);
  if(mode==="week"){
    const bounds=financeWeekBounds(value);if(!bounds)return [];
    return rows.filter(x=>{const d=String(x.tanggal||"").slice(0,10);return d>=bounds[0]&&d<=bounds[1]});
  }
  return rows.slice();
}
function sortFinanceRows(rows){
  return rows.map((x,i)=>({x,i})).sort((a,b)=>{
    const ad=String(a.x.tanggal||""),bd=String(b.x.tanggal||"");
    return bd.localeCompare(ad)||b.i-a.i;
  }).map(v=>v.x);
}
function financeFilterMarkup(filter){
  const mode=filter.mode||"all",value=filter.value||"";
  const type=mode==="day"?"date":mode==="week"?"week":mode==="month"?"month":"";
  const label=mode==="day"?"Tanggal":mode==="week"?"Minggu":mode==="month"?"Bulan":"";
  return `<div class="bf-fin-filter"><div class="bfcrud-field"><label>Filter Histori</label><select class="bf-fin-period-mode">
    <option value="all"${mode==="all"?" selected":""}>Semua</option>
    <option value="day"${mode==="day"?" selected":""}>Hari</option>
    <option value="week"${mode==="week"?" selected":""}>Minggu</option>
    <option value="month"${mode==="month"?" selected":""}>Bulan</option>
  </select></div>${type?`<div class="bfcrud-field"><label>${label}</label><input class="bf-fin-period-value" type="${type}" value="${esc(value)}"></div>`:""}<div class="bf-fin-filter-reset"><button type="button" class="bfcrud-btn bf-fin-reset">Reset Filter</button></div></div>`;
}
function bindFinanceFilter(root,filter,rerender){
  const mode=root.querySelector(".bf-fin-period-mode");
  if(mode)mode.onchange=()=>{
    filter.mode=mode.value;
    filter.value=filter.mode==="day"?today():filter.mode==="week"?financeWeekValue(today()):filter.mode==="month"?today().slice(0,7):"";
    rerender();
  };
  const value=root.querySelector(".bf-fin-period-value");
  if(value)value.onchange=()=>{filter.value=value.value;rerender()};
  root.querySelector(".bf-fin-reset")?.addEventListener("click",()=>{filter.mode="all";filter.value="";rerender()});
}
function financeSummaryMarkup(label,total,count){
  return `<div class="bf-fin-summary"><div><small>${esc(label)}</small><strong>${rupiah(total)}</strong></div><div><small>Jumlah Transaksi</small><strong>${Number(count||0).toLocaleString("id-ID")}</strong></div></div>`;
}

// ---------- PENGELUARAN ----------
function expense(){
  if(!can("view_finance")&&!can("view_note"))return deny("view_finance");
  const KEY="bf_expenses";let rows=list(KEY).filter(x=>!x.deleted_at),editing=null,filter={mode:"all",value:""};const p=page("Keuangan — Pengeluaran","Tambah, edit, bukti foto, dan catatan pengeluaran");const c=p.querySelector(".bfcrud-content");
  function render(r={}){
    const filtered=filterFinanceByPeriod(rows,filter),display=sortFinanceRows(filtered);
    c.innerHTML=`<div class="bfcrud-card"><div class="bfcrud-grid"><div class="bfcrud-field"><label>Tanggal</label><input id="e-date" type="date" value="${esc(r.tanggal||today())}"></div><div class="bfcrud-field"><label>Kategori / Jenis Pengeluaran</label><input id="e-cat" value="${esc(r.kategori||r.jenis||"")}"></div><div class="bfcrud-field"><label>Nominal</label><input id="e-nom" inputmode="numeric" value="${esc(r.nominal??"")}"></div><div class="bfcrud-field" style="grid-column:1/-1"><label>Keterangan</label><textarea id="e-note">${esc(r.keterangan||"")}</textarea></div>${photoField(r.bukti_fotos||r.bukti_foto||"")}</div><div class="bfcrud-actions"><button class="bfcrud-btn primary" id="e-save">${editing?"Simpan Perubahan":"Simpan"}</button>${editing?'<button class="bfcrud-btn" id="e-cancel">Batal</button>':""}</div></div><div class="bfcrud-card">${financeFilterMarkup(filter)}${financeSummaryMarkup("Total Pengeluaran",filtered.reduce((s,x)=>s+n(x.nominal),0),filtered.length)}<div class="bfcrud-table-wrap"><table class="bfcrud-table"><thead><tr><th>Tanggal</th><th>Kategori</th><th>Nominal</th><th>Bukti</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody>${display.map(x=>`<tr><td>${esc(x.tanggal)}</td><td>${esc(x.kategori||"-")}</td><td>${rupiah(x.nominal)}</td><td>${(photoArray(x.bukti_fotos||x.bukti_foto).length)?`<button class="bfcrud-btn view-photo" data-id="${x.id}">📷 Lihat</button>`:"—"}</td><td>${esc(x.keterangan||"-")}</td><td><button class="bfcrud-btn edit" data-id="${x.id}">Edit</button> <button class="bfcrud-btn danger del" data-id="${x.id}">Hapus</button></td></tr>`).join("")||'<tr><td colspan="6">Belum ada pengeluaran.</td></tr>'}</tbody></table></div></div>`;
    bindPhoto(c);
    bindFinanceFilter(c,filter,()=>render(editing||{}));
    c.querySelector("#e-save").onclick=()=>{if(!can("edit_finance")&&!can("edit_data"))return deny("edit_finance");const old=editing?list(KEY).find(x=>x.id===editing.id):null,row=meta(old,{tanggal:c.querySelector("#e-date").value,kategori:c.querySelector("#e-cat").value.trim(),nominal:n(c.querySelector("#e-nom").value),keterangan:c.querySelector("#e-note").value,bukti_fotos:getPhotos(c),bukti_foto:getPhotos(c)[0]||""});if(!row.kategori)return alert("Kategori / jenis pengeluaran wajib diisi.");const all=list(KEY),i=all.findIndex(x=>x.id===row.id);i>=0?all[i]=row:all.push(row);write(KEY,all);audit(old?"edit":"add","pengeluaran",row.id,old,row);sync();editing=null;rows=list(KEY).filter(x=>!x.deleted_at);render()};
    c.querySelector("#e-cancel")?.addEventListener("click",()=>{editing=null;render()});
    c.querySelectorAll(".edit").forEach(b=>b.onclick=()=>{editing=rows.find(x=>x.id===b.dataset.id);render(editing)});
    c.querySelectorAll(".del").forEach(b=>b.onclick=()=>{if(!can("delete_data"))return deny("delete_data");const all=list(KEY),i=all.findIndex(x=>x.id===b.dataset.id);if(i<0||!confirm("Hapus pengeluaran ini?"))return;const old=all[i];all[i]={...old,deleted_at:now(),deleted_by:me()};write(KEY,all);audit("delete","pengeluaran",old.id,old,all[i]);sync();rows=all.filter(x=>!x.deleted_at);render()});
    c.querySelectorAll(".view-photo").forEach(b=>b.onclick=()=>showPhotos((()=>{const x=rows.find(x=>x.id===b.dataset.id);return x?.bukti_fotos||x?.bukti_foto})()));
  }render();
}

// ---------- SETORAN ----------
function deposit(){
  if(!can("view_finance")&&!can("view_note"))return deny("view_finance");
  const KEY="bf_note_setoran_v26";let rows=list(KEY).filter(x=>!x.deleted_at),editing=null,filter={mode:"all",value:""};const p=page("Keuangan — Setoran","Catatan setoran dengan bukti transfer / slip jika ada");const c=p.querySelector(".bfcrud-content");
  function render(r={}){
    const filtered=filterFinanceByPeriod(rows,filter),display=sortFinanceRows(filtered);
    c.innerHTML=`<div class="bfcrud-card"><div class="bfcrud-grid"><div class="bfcrud-field"><label>Tanggal</label><input id="d-date" type="date" value="${esc(r.tanggal||today())}"></div><div class="bfcrud-field"><label>Nama Customer</label><input id="d-customer" list="bf-fin-customer-list" value="${esc(r.customer||"")}" placeholder="Cari nama / WA Customer..." autocomplete="off"><datalist id="bf-fin-customer-list">${list("bf_customers").filter(x=>!x.deleted_at&&x.active!==false).map(x=>`<option value="${esc(x.name||x.nama||"")}" label="${esc([x.name||x.nama,x.phone||x.no_hp||x.wa||x.contact].filter(Boolean).join(" — "))}"></option>`).join("")}</datalist></div><div class="bfcrud-field"><label>Nominal</label><input id="d-nom" inputmode="numeric" value="${esc(r.nominal??"")}"></div><div class="bfcrud-field"><label>Via Bank / Metode</label><input id="d-method" value="${esc(r.metode||r.via_bank||"")}"></div><div class="bfcrud-field" style="grid-column:1/-1"><label>Keterangan</label><textarea id="d-note">${esc(r.keterangan||"")}</textarea></div>${photoField(r.bukti_fotos||r.bukti_foto||"")}</div><div class="bfcrud-actions"><button class="bfcrud-btn primary" id="d-save">${editing?"Simpan Perubahan":"Simpan"}</button>${editing?'<button class="bfcrud-btn" id="d-cancel">Batal</button>':""}</div></div><div class="bfcrud-card">${financeFilterMarkup(filter)}${financeSummaryMarkup("Total Setoran",filtered.reduce((s,x)=>s+n(x.nominal),0),filtered.length)}<div class="bfcrud-table-wrap"><table class="bfcrud-table"><thead><tr><th>Tanggal</th><th>Customer</th><th>Nominal</th><th>Via Bank / Metode</th><th>Bukti</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody>${display.map(x=>`<tr><td>${esc(x.tanggal)}</td><td>${esc(x.customer||"-")}</td><td>${rupiah(x.nominal)}</td><td>${esc(x.metode||x.via_bank||"-")}</td><td>${(photoArray(x.bukti_fotos||x.bukti_foto).length)?`<button class="bfcrud-btn view-photo" data-id="${x.id}">📷 Lihat</button>`:"—"}</td><td>${esc(x.keterangan||"-")}</td><td><button class="bfcrud-btn edit" data-id="${x.id}">Edit</button> <button class="bfcrud-btn danger del" data-id="${x.id}">Hapus</button></td></tr>`).join("")||'<tr><td colspan="7">Belum ada setoran.</td></tr>'}</tbody></table></div></div>`;
    bindPhoto(c);
    bindFinanceFilter(c,filter,()=>render(editing||{}));
    c.querySelector("#d-save").onclick=()=>{if(!can("edit_finance")&&!can("edit_data"))return deny("edit_finance");const old=editing?list(KEY).find(x=>x.id===editing.id):null,row=meta(old,{tanggal:c.querySelector("#d-date").value,customer:c.querySelector("#d-customer").value,nominal:n(c.querySelector("#d-nom").value),metode:c.querySelector("#d-method").value.trim(),via_bank:c.querySelector("#d-method").value.trim(),keterangan:c.querySelector("#d-note").value,bukti_fotos:getPhotos(c),bukti_foto:getPhotos(c)[0]||""});const all=list(KEY),i=all.findIndex(x=>x.id===row.id);i>=0?all[i]=row:all.push(row);write(KEY,all);audit(old?"edit":"add","setoran",row.id,old,row);sync();editing=null;rows=list(KEY).filter(x=>!x.deleted_at);render()};
    c.querySelector("#d-cancel")?.addEventListener("click",()=>{editing=null;render()});
    c.querySelectorAll(".edit").forEach(b=>b.onclick=()=>{editing=rows.find(x=>x.id===b.dataset.id);render(editing)});
    c.querySelectorAll(".del").forEach(b=>b.onclick=()=>{if(!can("delete_data"))return deny("delete_data");const all=list(KEY),i=all.findIndex(x=>x.id===b.dataset.id);if(i<0||!confirm("Hapus setoran ini?"))return;const old=all[i];all[i]={...old,deleted_at:now(),deleted_by:me()};write(KEY,all);audit("delete","setoran",old.id,old,all[i]);sync();rows=all.filter(x=>!x.deleted_at);render()});
    c.querySelectorAll(".view-photo").forEach(b=>b.onclick=()=>showPhotos((()=>{const x=rows.find(x=>x.id===b.dataset.id);return x?.bukti_fotos||x?.bukti_foto})()));
  }render();
}

// ---------- SEMBAKO MULTI BARANG ----------
function grocery(){
  if(!can("view_finance")&&!can("view_note"))return deny("view_finance");
  const KEY="bf_note_sembako_v26";let rows=list(KEY).filter(x=>!x.deleted_at),editing=null,filter={mode:"all",value:""};const p=page("Keuangan — Catatan Pembelian Sembako","Satu supplier / tempat beli dapat mempunyai banyak barang. Tidak masuk Data Master Produk.");const c=p.querySelector(".bfcrud-content");
  const item=(x={},i=0)=>`<div class="bfcrud-item"><div class="bfcrud-grid"><div class="bfcrud-field"><label>Nama Barang ${i+1}</label><input class="g-name" value="${esc(x.nama||x.nama_barang||x.item||"")}"></div><div class="bfcrud-field"><label>Qty</label><input class="g-qty" inputmode="decimal" value="${esc(x.qty??"")}"></div><div class="bfcrud-field"><label>Satuan</label><input class="g-unit" value="${esc(x.satuan||"")}"></div><div class="bfcrud-field"><label>Nominal</label><input class="g-nom" inputmode="numeric" value="${esc(x.nominal??"")}"></div></div>${i?'<button class="bfcrud-btn danger g-remove" type="button">Hapus Barang</button>':""}</div>`;
  function render(r={}){
    const items=Array.isArray(r.items)&&r.items.length?r.items:[{}],filtered=filterFinanceByPeriod(rows,filter),display=sortFinanceRows(filtered);
    c.innerHTML=`<div class="bfcrud-card"><div class="bfcrud-grid"><div class="bfcrud-field"><label>Tanggal Pembelian</label><input id="g-date" type="date" value="${esc(r.tanggal||today())}"></div><div class="bfcrud-field"><label>Supplier / Tempat Beli</label><input id="g-supplier" list="bf-fin-supplier-list" value="${esc(r.supplier||r.toko||"")}" placeholder="Cari nama / kontak Supplier..." autocomplete="off"><datalist id="bf-fin-supplier-list">${list("bf_suppliers").filter(x=>!x.deleted_at&&x.active!==false).map(x=>`<option value="${esc(x.name||x.nama||"")}" label="${esc([x.name||x.nama,x.phone||x.no_hp||x.wa||x.contact].filter(Boolean).join(" — "))}"></option>`).join("")}</datalist></div>${photoField(r.bukti_fotos||r.nota_fotos||r.bukti_foto||r.nota_foto||"")}</div><div id="g-items">${items.map(item).join("")}</div><button class="bfcrud-btn" id="g-add" type="button">＋ Tambah Barang</button><div class="bfcrud-card" style="background:#f8fafc;margin-top:10px"><small style="font-weight:800;color:#64748b">TOTAL PEMBELIAN</small><div class="bfcrud-money" id="g-total">${rupiah(0)}</div></div><div class="bfcrud-field"><label>Keterangan</label><textarea id="g-note">${esc(r.keterangan||"")}</textarea></div><div class="bfcrud-actions"><button class="bfcrud-btn primary" id="g-save">${editing?"Simpan Perubahan":"Simpan"}</button>${editing?'<button class="bfcrud-btn" id="g-cancel">Batal</button>':""}</div></div><div class="bfcrud-card">${financeFilterMarkup(filter)}${financeSummaryMarkup("Total Pembelian",filtered.reduce((s,x)=>s+n(x.total??x.nominal),0),filtered.length)}<div class="bfcrud-table-wrap"><table class="bfcrud-table"><thead><tr><th>Tanggal</th><th>Supplier / Tempat</th><th>Barang</th><th>Total</th><th>Bukti</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody>${display.map(x=>`<tr><td>${esc(x.tanggal)}</td><td>${esc(x.supplier||x.toko||"-")}</td><td>${esc((x.items||[]).map(i=>i.nama||i.item).filter(Boolean).join(", ")||x.namaBahan||"-")}</td><td>${rupiah(x.total??x.nominal)}</td><td>${(photoArray(x.bukti_fotos||x.nota_fotos||x.bukti_foto||x.nota_foto).length)?`<button class="bfcrud-btn view-photo" data-id="${x.id}">📷 Lihat</button>`:"—"}</td><td>${esc(x.keterangan||"-")}</td><td><button class="bfcrud-btn edit" data-id="${x.id}">Edit</button> <button class="bfcrud-btn danger del" data-id="${x.id}">Hapus</button></td></tr>`).join("")||'<tr><td colspan="7">Belum ada catatan sembako.</td></tr>'}</tbody></table></div></div>`;
    bindPhoto(c);
    bindFinanceFilter(c,filter,()=>render(editing||{}));
    const box=c.querySelector("#g-items");
    const recalc=()=>{const t=[...box.querySelectorAll(".g-nom")].reduce((s,x)=>s+n(x.value),0);c.querySelector("#g-total").textContent=rupiah(t)};
    const bindItems=()=>{box.querySelectorAll(".g-nom").forEach(x=>x.oninput=recalc);box.querySelectorAll(".g-remove").forEach(x=>x.onclick=()=>{x.closest(".bfcrud-item").remove();recalc()});recalc()};
    c.querySelector("#g-add").onclick=()=>{box.insertAdjacentHTML("beforeend",item({},box.children.length));bindItems()};
    bindItems();
    c.querySelector("#g-save").onclick=()=>{if(!can("edit_finance")&&!can("edit_data"))return deny("edit_finance");const its=[...box.querySelectorAll(".bfcrud-item")].map(x=>({nama:x.querySelector(".g-name").value.trim(),qty:n(x.querySelector(".g-qty").value),satuan:x.querySelector(".g-unit").value.trim(),nominal:n(x.querySelector(".g-nom").value)})).filter(x=>x.nama||x.nominal);if(!its.length)return alert("Tambahkan minimal satu barang.");const old=editing?list(KEY).find(x=>x.id===editing.id):null,total=its.reduce((s,x)=>s+x.nominal,0),row=meta(old,{tanggal:c.querySelector("#g-date").value,supplier:c.querySelector("#g-supplier").value.trim(),toko:c.querySelector("#g-supplier").value.trim(),bukti_fotos:getPhotos(c),bukti_foto:getPhotos(c)[0]||"",items:its,total,nominal:total,keterangan:c.querySelector("#g-note").value});const all=list(KEY),i=all.findIndex(x=>x.id===row.id);i>=0?all[i]=row:all.push(row);write(KEY,all);audit(old?"edit":"add","sembako",row.id,old,row);sync();editing=null;rows=list(KEY).filter(x=>!x.deleted_at);render()};
    c.querySelector("#g-cancel")?.addEventListener("click",()=>{editing=null;render()});
    c.querySelectorAll(".edit").forEach(b=>b.onclick=()=>{editing=rows.find(x=>x.id===b.dataset.id);render(editing)});
    c.querySelectorAll(".del").forEach(b=>b.onclick=()=>{if(!can("delete_data"))return deny("delete_data");const all=list(KEY),i=all.findIndex(x=>x.id===b.dataset.id);if(i<0||!confirm("Hapus catatan pembelian ini?"))return;const old=all[i];all[i]={...old,deleted_at:now(),deleted_by:me()};write(KEY,all);audit("delete","sembako",old.id,old,all[i]);sync();rows=all.filter(x=>!x.deleted_at);render()});
    c.querySelectorAll(".view-photo").forEach(b=>b.onclick=()=>{const x=rows.find(x=>x.id===b.dataset.id);showPhotos(x?.bukti_fotos||x?.nota_fotos||x?.bukti_foto||x?.nota_foto)});
  }render();
}

// ---------- KOMISI OTOMATIS ----------
function commission(){
  const owner=window.BFCurrentUser?.().profile?.role==="owner";
  if(!owner||!can("view_commission"))return deny("view_commission");
  const tx=list("bf_keluar_v26").filter(x=>!x.deleted_at);
  const rows=tx.flatMap(r=>DM.customerGroups(r).map(g=>{
    const kg=DM.groupTotal(g),hasSnapshot=Object.prototype.hasOwnProperty.call(g,"commission_per_kg")&&n(g.commission_per_kg)>0;
    const per=hasSnapshot?n(g.commission_per_kg):null;
    return {...r,_customer:g.customer||"-",_marketing:g.marketing||"",_kg:kg,_rate:per,_rateKnown:hasSnapshot,_commission:hasSnapshot?kg*per:null};
  })).filter(r=>r._marketing);
  const p=page("Keuangan — Komisi","Owner only • histori dihitung dari Barang Keluar canonical dan snapshot Komisi/Kg");const c=p.querySelector(".bfcrud-content");
  const marketing=[...new Set(rows.map(x=>x._marketing).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"id"));
  const todayValue=today(),monthValue=todayValue.slice(0,7);
  function weekValue(dateStr){
    const d=new Date(dateStr+"T00:00:00"),day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);
    const jan4=new Date(d.getFullYear(),0,4),janDay=(jan4.getDay()+6)%7,week1=new Date(jan4);week1.setDate(jan4.getDate()-janDay);
    const week=Math.floor((d-week1)/604800000)+1;return `${d.getFullYear()}-W${String(week).padStart(2,"0")}`;
  }
  function isoWeekBounds(value){
    const m=/^(\d{4})-W(\d{2})$/.exec(value||"");if(!m)return null;
    const year=Number(m[1]),week=Number(m[2]),jan4=new Date(year,0,4),janDay=(jan4.getDay()+6)%7,monday=new Date(jan4);monday.setDate(jan4.getDate()-janDay+(week-1)*7);
    const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
    const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    return [iso(monday),iso(sunday)];
  }
  let filters={marketing:"all",mode:"month",day:todayValue,week:weekValue(todayValue),month:monthValue};
  function filtered(){return rows.filter(x=>{
    if(filters.marketing!=="all"&&x._marketing!==filters.marketing)return false;
    const d=String(x.tanggal||x.date||"").slice(0,10);
    if(filters.mode==="day")return d===filters.day;
    if(filters.mode==="week"){const b=isoWeekBounds(filters.week);return !!b&&d>=b[0]&&d<=b[1]}
    if(filters.mode==="month")return d.slice(0,7)===filters.month;
    return true;
  })}
  function render(){
    const data=filtered(),known=data.filter(x=>x._rateKnown),unknown=data.filter(x=>!x._rateKnown),totalKg=data.reduce((s,x)=>s+x._kg,0),totalKomisi=known.reduce((s,x)=>s+x._commission,0),customers=new Set(data.map(x=>x._customer).filter(Boolean)).size;
    c.innerHTML=`<div class="bfcrud-card bf-commission-filter"><div class="bfcrud-grid">
      <div class="bfcrud-field"><label>Marketing</label><select id="cm-marketing"><option value="all">Semua Marketing</option>${marketing.map(m=>`<option value="${esc(m)}" ${filters.marketing===m?"selected":""}>${esc(m)}</option>`).join("")}</select></div>
      <div class="bfcrud-field"><label>Periode</label><select id="cm-mode"><option value="all" ${filters.mode==="all"?"selected":""}>Semua</option><option value="day" ${filters.mode==="day"?"selected":""}>Hari</option><option value="week" ${filters.mode==="week"?"selected":""}>Minggu</option><option value="month" ${filters.mode==="month"?"selected":""}>Bulan</option></select></div>
      <div class="bfcrud-field cm-period cm-day" ${filters.mode!=="day"?'style="display:none"':""}><label>Tanggal</label><input id="cm-day" type="date" value="${esc(filters.day)}"></div>
      <div class="bfcrud-field cm-period cm-week" ${filters.mode!=="week"?'style="display:none"':""}><label>Minggu</label><input id="cm-week" type="week" value="${esc(filters.week)}"></div>
      <div class="bfcrud-field cm-period cm-month" ${filters.mode!=="month"?'style="display:none"':""}><label>Bulan</label><input id="cm-month" type="month" value="${esc(filters.month)}"></div>
    </div></div>
    <div class="bf-commission-summary">
      <div class="bfcrud-card"><small>TOTAL KG</small><div class="bfcrud-money">${totalKg.toLocaleString("id-ID")} kg</div></div>
      <div class="bfcrud-card"><small>TOTAL KOMISI TERVERIFIKASI</small><div class="bfcrud-money">${rupiah(totalKomisi)}</div></div>
      <div class="bfcrud-card"><small>TRANSAKSI / CUSTOMER</small><div class="bfcrud-money">${data.length} / ${customers}</div></div>
    </div>
    ${unknown.length?`<div class="bfcrud-card bf-commission-warning"><b>⚠ ${unknown.length} histori belum memiliki snapshot Komisi/Kg.</b><div>Rate historis tidak ditebak dari rate Marketing saat ini dan tidak dimasukkan ke Total Komisi Terverifikasi.</div></div>`:""}
    <div class="bfcrud-card"><div class="bfcrud-table-wrap"><table class="bfcrud-table"><thead><tr><th>Barang Keluar</th><th>Tanggal</th><th>Customer</th><th>Marketing</th><th>Total Kg</th><th>Komisi/Kg</th><th>Total</th></tr></thead><tbody>${data.slice().reverse().map(x=>`<tr><td><b>${esc(x.transaction_no||"-")}</b></td><td>${esc(x.tanggal||x.date||"-")}</td><td>${esc(x._customer)}</td><td>${esc(x._marketing)}</td><td>${x._kg.toLocaleString("id-ID")} kg</td><td>${x._rateKnown?rupiah(x._rate)+"/kg":'<span class="bf-rate-unknown">Tidak tersedia</span>'}</td><td><b>${x._rateKnown?rupiah(x._commission):'<span class="bf-rate-unknown">Tidak dihitung</span>'}</b></td></tr>`).join("")||'<tr><td colspan="7">Tidak ada histori Komisi pada filter ini.</td></tr>'}</tbody></table></div></div>`;
    c.querySelector("#cm-marketing").onchange=e=>{filters.marketing=e.target.value;render()};
    c.querySelector("#cm-mode").onchange=e=>{filters.mode=e.target.value;render()};
    c.querySelector("#cm-day")?.addEventListener("change",e=>{filters.day=e.target.value;render()});
    c.querySelector("#cm-week")?.addEventListener("change",e=>{filters.week=e.target.value;render()});
    c.querySelector("#cm-month")?.addEventListener("change",e=>{filters.month=e.target.value;render()});
  }
  render();
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
