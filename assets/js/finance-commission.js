(function(){
"use strict";
const {esc,can,deny,storage}=window.BFCore;
const arr=k=>storage.list(k);
const num=v=>{const x=Number(String(v??0).replace(/\./g,"").replace(",","."));return Number.isFinite(x)?x:0};
const weightNum=v=>{if(typeof v==="number")return Number.isFinite(v)?v:0;const x=Number(String(v??0).trim().replace(",","."));return Number.isFinite(x)?x:0};
const money=v=>"Rp "+Math.round(num(v)).toLocaleString("id-ID");
const kg=r=>{const a=Array.isArray(r.timbangan)?r.timbangan:(Array.isArray(r.weights)?r.weights:[]);return a.reduce((s,x)=>s+weightNum(x),0)};
function page(title,sub){
  document.getElementById("bf-fin-page")?.remove();
  const p=document.createElement("div");p.id="bf-fin-page";p.className="bf-op-page";
  p.innerHTML=`<div class="bf-op-wrap"><div class="bf-op-head"><button class="bf-op-back">← Kembali</button><div><h2 style="margin:0;color:#0d1b3e">${esc(title)}</h2><small style="color:#64748b">${esc(sub)}</small></div></div><div id="bf-fin-content"></div></div>`;
  document.body.appendChild(p);p.querySelector(".bf-op-back").onclick=()=>p.remove();return p;
}
function finance(kind){
  if(!can("view_finance")&&!can("view_note"))return deny("view_finance");
  const cfg={
    expense:{title:"Pengeluaran",keys:["bf_note_pengeluaran_v26","bf_expenses"]},
    deposit:{title:"Setoran",keys:["bf_note_setoran_v26"]},
    grocery:{title:"Sembako",keys:["bf_note_sembako_v26"]}
  }[kind];
  const p=page("Keuangan — "+cfg.title,"Bagian Keuangan Bintang Frozen");
  let rows=[];cfg.keys.forEach(k=>arr(k).forEach(x=>rows.push({...x,_key:k})));
  const total=rows.reduce((s,r)=>s+num(r.nominal??r.total??r.jumlah??r.amount),0);
  p.querySelector("#bf-fin-content").innerHTML=`<div class="bf-fin-card"><div style="font-size:10px;color:#64748b;text-transform:uppercase;font-weight:800">Total ${cfg.title}</div><div class="bf-commission-total">${money(total)}</div></div><div class="bf-fin-card"><div style="overflow:auto"><table class="bf-fin-table"><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Nominal</th><th>Catatan</th></tr></thead><tbody>${rows.slice().reverse().map(r=>`<tr><td>${esc(r.tanggal||r.date||"-")}</td><td>${esc(r.keterangan||r.namaBahan||r.item||r.jenis||"-")}</td><td>${money(r.nominal??r.total??r.jumlah??r.amount)}</td><td>${esc(r.catatan||r.notes||r.keterangan||"-")}</td></tr>`).join("")||'<tr><td colspan="4">Belum ada data.</td></tr>'}</tbody></table></div></div>`;
}
function employeeRate(name){
  const em=arr("bf_employees").find(x=>String(x.name||"").toLowerCase()===String(name||"").toLowerCase() && x.active!==false);
  return num(em?.commission??em?.commission_per_kg??0);
}
function commission(){
  if(!can("view_commission")&&!can("view_finance"))return deny("view_commission");
  const keluar=arr("bf_keluar_v26").filter(r=>!r.deleted_at);
  const rows=keluar.map(r=>{
    const marketing=r.marketing||r.staff||r.sales||r.employee||"";
    const rate=num(r.commission_per_kg||employeeRate(marketing));
    const total=kg(r)*rate;
    return {...r,_marketing:marketing,_rate:rate,_commission:total};
  }).filter(r=>r._marketing || r._rate>0);
  const total=rows.reduce((s,r)=>s+r._commission,0);
  const p=page("Komisi","Dihitung otomatis dari Barang Keluar × Komisi/Kg Staff");
  p.querySelector("#bf-fin-content").innerHTML=`<div class="bf-fin-card"><span style="font-size:10px;color:#64748b;font-weight:800;text-transform:uppercase">Total Komisi</span><div class="bf-commission-total">${money(total)}</div><small style="color:#64748b">Tidak perlu input komisi dua kali.</small></div><div class="bf-fin-card"><div style="overflow:auto"><table class="bf-fin-table"><thead><tr><th>No Transaksi</th><th>Tanggal</th><th>Marketing</th><th>Total Kg</th><th>Komisi/Kg</th><th>Komisi</th></tr></thead><tbody>${rows.slice().reverse().map(r=>`<tr><td><b>${esc(r.transaction_no||"-")}</b></td><td>${esc(r.tanggal||r.date||"-")}</td><td>${esc(r._marketing||"-")}</td><td>${kg(r).toLocaleString("id-ID")} kg</td><td>${money(r._rate)}</td><td><b>${money(r._commission)}</b></td></tr>`).join("")||'<tr><td colspan="6">Belum ada transaksi dengan Marketing.</td></tr>'}</tbody></table></div></div>`;
}
function tallyChooser(){
  if(!can("view_tally"))return deny("view_tally");
  const p=page("Tally Timbangan","Pilih sumber transaksi");
  p.querySelector("#bf-fin-content").innerHTML=`<div class="bf-op-card"><div class="bf-op-grid" style="grid-template-columns:1fr 1fr"><button class="bf-op-primary" id="ti">📥 Tally Barang Masuk</button><button class="bf-op-primary" id="to">📤 Tally Barang Keluar</button></div></div>`;
  p.querySelector("#ti").onclick=()=>{p.remove();window.BFOpenTransactionsIn?.();document.getElementById("bf-tab-tally")?.click()};
  p.querySelector("#to").onclick=()=>{p.remove();window.BFOpenTransactionsOut?.();document.getElementById("bf-tab-tally")?.click()};
}
function reports(){
  if(!can("view_reports")&&!can("view_history"))return deny("view_reports");
  if(window.BFNativeNavigate){window.BFNativeNavigate("histori");}
  else document.querySelector('[data-route="histori"]')?.click();
}
function exports(){
  if(!can("export_pdf")&&!can("export_csv"))return deny("export_pdf");
  const p=page("Export Laporan","PDF / CSV / Cetak");
  p.querySelector("#bf-fin-content").innerHTML=`<div class="bf-op-card"><div class="bf-op-grid" style="grid-template-columns:repeat(3,1fr)"><button class="bf-op-primary" id="epdf">📄 Export PDF</button><button class="bf-op-primary" id="ecsv">📊 Export CSV</button><button class="bf-op-primary" id="eprint">🖨️ Cetak</button></div></div>`;
  p.querySelector("#epdf").onclick=()=>document.getElementById("bfTallyCombinedPdf")?.click();
  p.querySelector("#ecsv").onclick=()=>document.getElementById("bfTallyCombined")?.click();
  p.querySelector("#eprint").onclick=()=>document.getElementById("bfTallyPrint")?.click();
}
function backup(){
  if(!can("backup") && (window.BFCurrentUser?.()?.profile?.role||"")!=="owner")return deny("backup");
  document.getElementById("bfTallyJson")?.click();
  window.BFLogActivity?.("backup","system","json",null,null,{});
}
window.BFOpenFinance=()=>finance("expense");
window.BFOpenFinanceExpense=()=>finance("expense");
window.BFOpenFinanceDeposit=()=>finance("deposit");
window.BFOpenFinanceGrocery=()=>finance("grocery");
window.BFOpenCommission=commission;
window.BFOpenTallyChooser=tallyChooser;
window.BFOpenReports=reports;
window.BFOpenExports=exports;
window.BFOpenBackup=backup;
})();
