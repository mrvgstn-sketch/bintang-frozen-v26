(function(){
"use strict";
const {esc,can,deny,storage}=window.BFCore;
const arr=k=>storage.list(k).filter(x=>!x?.deleted_at);
const num=v=>{const n=Number(String(v??0).replace(/\./g,"").replace(",","."));return Number.isFinite(n)?n:0};
const weight=v=>{if(typeof v==="number")return Number.isFinite(v)?v:0;const n=Number(String(v??0).trim().replace(",","."));return Number.isFinite(n)?n:0};
const money=v=>"Rp "+Math.round(num(v)).toLocaleString("id-ID");
const kg=r=>{const w=Array.isArray(r?.timbangan)?r.timbangan:(Array.isArray(r?.weights)?r.weights:[]);return w.reduce((s,x)=>s+weight(x),0)};
const dateOf=r=>String(r?.tanggal||r?.date||r?.dateISO||r?.created_at||r?.updated_at||"").slice(0,10);
const dtText=r=>{const raw=r?.updated_at||r?.created_at||r?.dateISO||r?.tanggal||r?.date; if(!raw)return "-"; const d=new Date(raw); return Number.isNaN(d.getTime())?esc(String(raw)):d.toLocaleString("id-ID")};
const profile=()=>{const x=window.BFCurrentUser?.()||{};return {role:String(x.profile?.role||"").toLowerCase(),name:x.profile?.display_name||x.user?.email||"Pengguna"}};
function periodRows(rows){return window.BFPeriodFilter?window.BFPeriodFilter(rows):rows}
function valueOf(r){return num(r?.nominal??r?.total??r?.jumlah??r?.amount)}
function customerCount(r){if(Array.isArray(r?.customers))return r.customers.length;if(Array.isArray(r?.customersSnapshot))return r.customersSnapshot.length;return r?.customerCount||0}
function partyNames(r,incoming){
  if(incoming){const gs=Array.isArray(r?.suppliers)?r.suppliers:[];const names=gs.map(x=>x?.supplier||x?.name).filter(Boolean);return names.length?names.join(", "):(r?.supplier||r?.namaSupplier||"-")}
  const gs=Array.isArray(r?.customers)?r.customers:[];const names=gs.map(x=>x?.customer||x?.name||x?.customer_name).filter(Boolean);return names.length?names.join(", "):(r?.customer||r?.customer_name||"-")
}
function itemCount(r,incoming){
  const groups=incoming?(Array.isArray(r?.suppliers)?r.suppliers:[]):(Array.isArray(r?.customers)?r.customers:[]);
  if(groups.length)return groups.reduce((s,g)=>s+(Array.isArray(g?.items)?g.items.length:0),0);
  if(Array.isArray(r?.items))return r.items.length;
  return r?.item?1:0;
}
function dataset(){
  const masuk=periodRows(arr("bf_masuk_v26")), keluar=periodRows(arr("bf_keluar_v26"));
  const expenses=periodRows([...arr("bf_note_pengeluaran_v26"),...arr("bf_expenses")]);
  const deposits=periodRows(arr("bf_note_setoran_v26"));
  const groceries=periodRows(arr("bf_note_sembako_v26"));
  const employees=arr("bf_employees");
  const empRate=name=>num(employees.find(x=>String(x.name||"").toLowerCase()===String(name||"").toLowerCase()&&x.active!==false)?.commission||0);
  const commissions=keluar.map(r=>{const name=r.marketing||r.staff||r.sales||r.employee||r.marketingNama||"";const rate=num(r.commission_per_kg||r.komisiPerKg||empRate(name));return kg(r)*rate});
  const sum=x=>x.reduce((s,r)=>s+valueOf(r),0);
  return {masuk,keluar,expenses,deposits,groceries,commissionTotal:commissions.reduce((s,x)=>s+x,0),
    kgIn:masuk.reduce((s,r)=>s+kg(r),0),kgOut:keluar.reduce((s,r)=>s+kg(r),0),expenseTotal:sum(expenses),depositTotal:sum(deposits),groceryTotal:sum(groceries)};
}
function shell(id,title,sub){
  document.getElementById(id)?.remove();
  const p=document.createElement("div");p.id=id;p.className="bf-op-page bf-report-page";
  p.innerHTML=`<div class="bf-op-wrap"><div class="bf-op-head"><button class="bf-op-back">← Kembali</button><div><h2>${esc(title)}</h2><small>${esc(sub)}</small></div></div><div class="bf-report-content"></div></div>`;
  document.body.appendChild(p);p.querySelector(".bf-op-back").onclick=()=>p.remove();return p;
}
function metric(label,value,sub,tone="") {return `<div class="bf-report-metric ${tone}"><span>${esc(label)}</span><b>${value}</b><small>${esc(sub||"")}</small></div>`}
function openReports(){
  if(!can("view_reports")&&!can("view_history"))return deny("view_reports");
  const d=dataset(), netCash=d.depositTotal-d.expenseTotal-d.groceryTotal-d.commissionTotal, balanceKg=d.kgIn-d.kgOut;
  const p=shell("bf-report-page","Ringkasan Laporan","Transaksi dan keuangan dalam satu tampilan untuk pemeriksaan Owner");
  const latest=[...d.masuk.map(r=>({...r,_type:"Barang Masuk",_kg:kg(r),_party:partyNames(r,true)})),...d.keluar.map(r=>({...r,_type:"Barang Keluar",_kg:kg(r),_party:partyNames(r,false)}))].sort((a,b)=>String(b.updated_at||b.created_at||b.tanggal||"").localeCompare(String(a.updated_at||a.created_at||a.tanggal||""))).slice(0,12);
  p.querySelector(".bf-report-content").innerHTML=`
    <div class="bf-report-toolbar"><button id="bfr-period">🗓️ Ubah Periode</button><button id="bfr-history">📚 Histori Rinci</button></div>
    <section class="bf-report-section"><div class="bf-report-title"><h3>Ringkasan Transaksi</h3><span>Periode aktif</span></div><div class="bf-report-metrics">
      ${metric("Barang Masuk",d.kgIn.toLocaleString("id-ID")+" kg",d.masuk.length+" transaksi","good")}
      ${metric("Barang Keluar",d.kgOut.toLocaleString("id-ID")+" kg",d.keluar.length+" transaksi","info")}
      ${metric("Selisih Berat",balanceKg.toLocaleString("id-ID")+" kg","Masuk − Keluar",balanceKg<0?"warn":"")}
      ${metric("Total Transaksi",String(d.masuk.length+d.keluar.length),"Masuk + Keluar")}
    </div></section>
    <section class="bf-report-section"><div class="bf-report-title"><h3>Ringkasan Keuangan</h3><span>Untuk koreksi arus kas</span></div><div class="bf-report-metrics">
      ${metric("Setoran",money(d.depositTotal),d.deposits.length+" catatan","good")}
      ${metric("Pengeluaran",money(d.expenseTotal),d.expenses.length+" catatan","warn")}
      ${metric("Sembako",money(d.groceryTotal),d.groceries.length+" catatan")}
      ${metric("Estimasi Komisi",money(d.commissionTotal),"Dari Barang Keluar")}
      ${metric("Selisih Arus Kas",money(netCash),"Setoran − pengeluaran − sembako − komisi",netCash<0?"warn":"good")}
    </div></section>
    <section class="bf-report-section"><div class="bf-report-title"><h3>Transaksi Terbaru</h3><span>${latest.length} terbaru pada periode</span></div><div class="bf-report-table-wrap"><table class="bf-report-table"><thead><tr><th>Waktu</th><th>Jenis</th><th>No Catatan</th><th>Supplier / Customer</th><th>Item</th><th>Berat</th><th>Dibuat</th><th>Diperbarui</th></tr></thead><tbody>${latest.map(r=>`<tr><td>${dtText(r)}</td><td><span class="bf-report-badge">${esc(r._type)}</span></td><td><b>${esc(r.transaction_no||r.no_transaksi||"-")}</b></td><td>${esc(r._party)}</td><td>${itemCount(r,r._type==="Barang Masuk")}</td><td>${r._kg.toLocaleString("id-ID")} kg</td><td>${esc(r.created_by||r.createdBy||"-")}</td><td>${esc(r.updated_by||"-")}</td></tr>`).join("")||'<tr><td colspan="8">Belum ada transaksi pada periode ini.</td></tr>'}</tbody></table></div></section>`;
  p.querySelector("#bfr-period").onclick=()=>window.BFOpenReportPeriod?.();
  p.querySelector("#bfr-history").onclick=()=>{p.remove();openHistory()};
}
function historyRows(){
  const masuk=arr("bf_masuk_v26").map(r=>({...r,_type:"Barang Masuk",_kg:kg(r),_party:partyNames(r,true),_items:itemCount(r,true)}));
  const keluar=arr("bf_keluar_v26").map(r=>({...r,_type:"Barang Keluar",_kg:kg(r),_party:partyNames(r,false),_items:itemCount(r,false)}));
  const legacy=arr("bf_history").map(r=>({...r,_type:r.type==="MASUK"?"Barang Masuk":"Barang Keluar",_kg:num(r.totalMasuk??r.totalKeluar),_party:r.supir||r.customer||"-",_items:Array.isArray(r.snapshotMasuk)?r.snapshotMasuk.length:Array.isArray(r.snapshotKeluar)?r.snapshotKeluar.length:0,_legacy:true}));
  const seen=new Set(), all=[];[...masuk,...keluar,...legacy].forEach(r=>{const key=[r._type,r.transaction_no||r.id||"",dateOf(r),r._kg].join("|");if(!seen.has(key)){seen.add(key);all.push(r)}});
  return all.sort((a,b)=>String(b.updated_at||b.created_at||b.dateISO||b.tanggal||"").localeCompare(String(a.updated_at||a.created_at||a.dateISO||a.tanggal||"")));
}
function openHistory(){
  if(!can("view_history")&&!can("request_history"))return deny("view_history");
  const p=shell("bf-history-detail-page","Histori Rinci","Jejak transaksi, perubahan, pembuat, dan status data");
  const rows=historyRows();
  p.querySelector(".bf-report-content").innerHTML=`<div class="bf-report-toolbar"><input id="bfh-search" placeholder="Cari no catatan, supplier/customer, pembuat..."><select id="bfh-type"><option value="all">Semua jenis</option><option>Barang Masuk</option><option>Barang Keluar</option></select><button id="bfh-report">📊 Ringkasan</button></div><div class="bf-report-metrics">${metric("Total Histori",String(rows.length),"Catatan aktif")}${metric("Barang Masuk",String(rows.filter(x=>x._type==="Barang Masuk").length),"transaksi","good")}${metric("Barang Keluar",String(rows.filter(x=>x._type==="Barang Keluar").length),"transaksi","info")}${metric("Pernah Direvisi",String(rows.filter(x=>Number(x._bf_version||1)>1).length),"versi > 1","warn")}</div><section class="bf-report-section"><div class="bf-report-table-wrap"><table class="bf-report-table"><thead><tr><th>Waktu</th><th>Jenis</th><th>No Catatan</th><th>Supplier / Customer</th><th>Item</th><th>Berat</th><th>Dibuat Oleh</th><th>Diubah Oleh</th><th>Versi</th><th>Keterangan</th></tr></thead><tbody id="bfh-body"></tbody></table></div></section>`;
  const body=p.querySelector("#bfh-body"),search=p.querySelector("#bfh-search"),type=p.querySelector("#bfh-type");
  function draw(){const q=search.value.trim().toLowerCase(),t=type.value;const z=rows.filter(r=>(t==="all"||r._type===t)&&(!q||[r.transaction_no,r.no_transaksi,r._party,r.created_by,r.createdBy,r.updated_by,r.keterangan,r.notes].join(" ").toLowerCase().includes(q)));body.innerHTML=z.map(r=>`<tr><td>${dtText(r)}</td><td><span class="bf-report-badge">${esc(r._type)}</span></td><td><b>${esc(r.transaction_no||r.no_transaksi||r.id||"-")}</b></td><td>${esc(r._party||"-")}</td><td>${r._items||0}</td><td>${num(r._kg).toLocaleString("id-ID")} kg</td><td>${esc(r.created_by||r.createdBy||"-")}</td><td>${esc(r.updated_by||"-")}</td><td>${Number(r._bf_version||1)}</td><td>${esc(r.keterangan||r.notes||r.catatan||"-")}</td></tr>`).join("")||'<tr><td colspan="10">Data tidak ditemukan.</td></tr>'}
  search.oninput=draw;type.onchange=draw;p.querySelector("#bfh-report").onclick=()=>{p.remove();openReports()};draw();
}
function issues(data){
  const out=[];
  data.masuk.forEach(r=>{const reasons=[];if(kg(r)<=0)reasons.push("berat 0");if(!partyNames(r,true)||partyNames(r,true)==="-")reasons.push("supplier kosong");if(Number(r._bf_version||1)>1)reasons.push("pernah direvisi");if(reasons.length)out.push({...r,_type:"Masuk",_reason:reasons.join(", ")})});
  data.keluar.forEach(r=>{const reasons=[];if(kg(r)<=0)reasons.push("berat 0");if(!partyNames(r,false)||partyNames(r,false)==="-")reasons.push("customer kosong");if(Number(r._bf_version||1)>1)reasons.push("pernah direvisi");if(reasons.length)out.push({...r,_type:"Keluar",_reason:reasons.join(", ")})});
  return out.sort((a,b)=>String(b.updated_at||b.created_at||"").localeCompare(String(a.updated_at||a.created_at||""))).slice(0,8)
}
function renderDashboard(){
  if(window.BFNativeRoute!=="dashboard")return;
  const main=document.querySelector("main");if(!main)return;
  document.getElementById("bf-dashboard-tools")?.remove();
  const d=dataset(),me=profile(),owner=me.role==="owner",review=owner?issues(d):[];
  const root=main.querySelector(":scope > div")||main;
  const box=document.createElement("section");box.id="bf-dashboard-tools";box.className="bf-dashboard-tools";
  box.innerHTML=`<div class="bf-dashboard-head"><div><h3>Pintasan Pekerjaan</h3><small>Akses cepat pekerjaan yang paling sering dilakukan</small></div>${owner?'<span class="bf-owner-chip">Tampilan Owner</span>':''}</div><div class="bf-dashboard-shortcuts"><button data-go="in">📥<b>Barang Masuk</b><small>Catat penerimaan</small></button><button data-go="out">📤<b>Barang Keluar</b><small>Catat pengeluaran</small></button><button data-go="expense">💰<b>Keuangan</b><small>Pengeluaran & catatan</small></button><button data-go="report">📊<b>Laporan</b><small>Ringkasan usaha</small></button></div>${owner?`<div class="bf-owner-overview"><div class="bf-report-title"><h3>Kontrol Owner</h3><span>Koreksi pekerjaan & kondisi usaha</span></div><div class="bf-report-metrics">${metric("Masuk",d.kgIn.toLocaleString("id-ID")+" kg",d.masuk.length+" transaksi","good")}${metric("Keluar",d.kgOut.toLocaleString("id-ID")+" kg",d.keluar.length+" transaksi","info")}${metric("Setoran",money(d.depositTotal),"periode aktif","good")}${metric("Pengeluaran + Sembako",money(d.expenseTotal+d.groceryTotal),"periode aktif","warn")}${metric("Perlu Dicek",String(review.length),"data berisiko / direvisi",review.length?"warn":"good")}</div><div class="bf-owner-review"><div class="bf-report-title"><h3>Perlu Dicek Owner</h3><button id="bfd-history">Lihat Histori Rinci</button></div>${review.map(r=>`<div class="bf-owner-review-row"><div><b>${esc(r._type)} • ${esc(r.transaction_no||r.no_transaksi||"-")}</b><small>${esc(r._reason)} • ${esc(r.updated_by||r.created_by||"-")}</small></div><span>${dtText(r)}</span></div>`).join("")||'<div class="bf-owner-empty">Tidak ada catatan yang memerlukan perhatian dari pemeriksaan otomatis.</div>'}</div></div>`:""}`;
  root.prepend(box);
  const actions={in:()=>window.BFOpenTransactionsIn?.(),out:()=>window.BFOpenTransactionsOut?.(),expense:()=>window.BFOpenFinanceExpense?.(),report:openReports};
  box.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>actions[b.dataset.go]?.());box.querySelector("#bfd-history")?.addEventListener("click",openHistory);
}
window.BFReportData=dataset;
window.BFOpenReports=openReports;
window.BFOpenDetailedHistory=openHistory;
window.BFRenderDashboardEnhancements=renderDashboard;
window.BFOnNativeRoute=route=>{if(route==="dashboard")renderDashboard();else document.getElementById("bf-dashboard-tools")?.remove()};
})();
