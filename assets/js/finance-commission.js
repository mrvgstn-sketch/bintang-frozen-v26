(function(){
"use strict";
const {esc,can,deny}=window.BFCore;
function page(title,sub){
  document.getElementById("bf-fin-page")?.remove();
  const p=document.createElement("div");p.id="bf-fin-page";p.className="bf-op-page";
  p.innerHTML=`<div class="bf-op-wrap"><div class="bf-op-head"><button class="bf-op-back">← Kembali</button><div><h2 style="margin:0;color:#0d1b3e">${esc(title)}</h2><small style="color:#64748b">${esc(sub)}</small></div></div><div id="bf-fin-content"></div></div>`;
  document.body.appendChild(p);p.querySelector(".bf-op-back").onclick=()=>p.remove();return p;
}
function tallyChooser(){
  if(!can("view_tally"))return deny("view_tally");
  const p=page("Tally Timbangan","Pilih sumber transaksi");
  p.querySelector("#bf-fin-content").innerHTML=`<div class="bf-op-card"><div class="bf-op-grid" style="grid-template-columns:1fr 1fr"><button class="bf-op-primary" id="ti">📥 Tally Barang Masuk</button><button class="bf-op-primary" id="to">📤 Tally Barang Keluar</button></div></div>`;
  p.querySelector("#ti").onclick=()=>{p.remove();window.BFOpenTransactionsIn?.();document.getElementById("bf-tab-tally")?.click()};
  p.querySelector("#to").onclick=()=>{p.remove();window.BFOpenTransactionsOut?.();document.getElementById("bf-tab-tally")?.click()};
}
function exports(){
  if(!can("export_pdf")&&!can("export_csv"))return deny("export_pdf");
  const p=page("Export Laporan","Gunakan satu sumber laporan untuk PDF; CSV Tally tetap tersedia");
  p.querySelector("#bf-fin-content").innerHTML=`<div class="bf-op-card"><div class="bf-op-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))"><button class="bf-op-primary" id="epdf">📄 Export PDF Detail</button><button class="bf-op-primary" id="ecsv">📊 Export CSV Tally</button></div></div>`;
  p.querySelector("#epdf").onclick=()=>{p.remove();window.BFPdfExport?.open?.()};
  p.querySelector("#ecsv").onclick=()=>document.getElementById("bfTallyCombined")?.click();
}
window.BFOpenTallyChooser=tallyChooser;
window.BFOpenExports=exports;
})();
