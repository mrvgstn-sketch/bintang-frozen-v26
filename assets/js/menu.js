(function(){
"use strict";
function can(p){return window.BFCore?.can?.(p)===true}
function role(){return String(window.BFCurrentUser?.()?.profile?.role||"").toLowerCase()}
function item(show,html){return show?html:""}
function menuHTML(){
  const owner=role()==="owner";
  return '<div class="bf-app-menu-head">Menu Bintang Frozen</div>'+
    '<div class="bf-app-menu-section"><div class="bf-app-menu-label">🏠 DASHBOARD</div><div class="bf-app-menu-grid">'+
    item(true,'<button class="bf-app-menu-item" data-route="dashboard">🏠 Dashboard<small>Pusat kontrol aplikasi</small></button>')+
    '</div></div>'+
    '<div class="bf-app-menu-section"><div class="bf-app-menu-label">📦 TRANSAKSI</div><div class="bf-app-menu-grid">'+
    item(can("view_in"),'<button class="bf-app-menu-item" data-custom-action="transactions-in">📥 Barang Masuk<small>Transaksi & Tally Timbangan</small></button>')+
    item(can("view_out"),'<button class="bf-app-menu-item" data-custom-action="transactions-out">📤 Barang Keluar<small>Transaksi & Tally Timbangan</small></button>')+
    item(can("view_tally"),'<button class="bf-app-menu-item" data-custom-action="tally">⚖️ Tally Timbangan<small>Masuk / Keluar</small></button>')+
    '</div></div>'+
    '<div class="bf-app-menu-section"><div class="bf-app-menu-label">💰 KEUANGAN</div><div class="bf-app-menu-grid">'+
    item(can("view_finance")||can("view_note"),'<button class="bf-app-menu-item" data-custom-action="finance-expense">💰 Pengeluaran<small>Catatan pengeluaran</small></button>')+
    item(can("view_finance")||can("view_note"),'<button class="bf-app-menu-item" data-custom-action="finance-deposit">🏦 Setoran<small>Catatan setoran</small></button>')+
    item(can("view_commission")||can("view_finance"),'<button class="bf-app-menu-item" data-custom-action="commission">💸 Komisi<small>Otomatis dari Barang Keluar</small></button>')+
    item(can("view_finance")||can("view_note"),'<button class="bf-app-menu-item" data-custom-action="finance-grocery">🛒 Sembako<small>Catatan sembako</small></button>')+
    '</div></div>'+
    '<div class="bf-app-menu-section"><div class="bf-app-menu-label">📋 DATA MASTER</div><div class="bf-app-menu-grid">'+
    item(can("view_products"),'<button class="bf-app-menu-item" data-custom-action="products">📦 Produk<small>Data master produk</small></button>')+
    item(can("view_suppliers"),'<button class="bf-app-menu-item" data-custom-action="suppliers">🚚 Supplier<small>Data master supplier</small></button>')+
    item(can("view_customers"),'<button class="bf-app-menu-item" data-custom-action="customers">👥 Customer<small>Data master customer</small></button>')+
    '</div></div>'+
    '<div class="bf-app-menu-section"><div class="bf-app-menu-label">📊 LAPORAN</div><div class="bf-app-menu-grid">'+
    item(can("view_history")||can("request_history"),'<button class="bf-app-menu-item" data-custom-action="history-detail">📚 Histori<small>Transaksi, pembuat & perubahan</small></button>')+
    item(can("view_reports")||can("export_pdf")||can("export_csv"),'<button class="bf-app-menu-item" data-custom-action="reports">📊 Laporan<small>Filter & ringkasan</small></button>')+
    item(can("export_pdf")||can("export_csv"),'<button class="bf-app-menu-item" data-custom-action="exports">📄 Export PDF / CSV<small>Laporan & data</small></button>')+
    '</div></div>'+
    '<div class="bf-app-menu-section"><div class="bf-app-menu-label">👥 MANAJEMEN</div><div class="bf-app-menu-grid">'+
    item(can("view_employees"),'<button class="bf-app-menu-item" data-custom-action="employees">👥 Staff<small>Manajemen karyawan</small></button>')+
    item(can("manage_users"),'<button class="bf-app-menu-item" data-owner-action="users">👤 Pengguna<small>Akun Google & role</small></button>')+
    item(can("manage_permissions"),'<button class="bf-app-menu-item" data-owner-action="permissions">🔐 Hak Akses<small>Permission per fitur</small></button>')+
    item(can("approve_history"),'<button class="bf-app-menu-item" data-owner-action="requests">🔔 Izin Histori<small>Approve / reject</small></button>')+
    item(can("view_audit"),'<button class="bf-app-menu-item" data-owner-action="audit">📋 Log Aktivitas<small>Audit aktivitas pengguna</small></button>')+
    '</div></div>'+
    '<div class="bf-app-menu-section"><div class="bf-app-menu-label">⚙️ SISTEM</div><div class="bf-app-menu-grid">'+
    item(can("view_settings")||owner,'<button class="bf-app-menu-item" data-route="pengaturan">⚙️ Pengaturan<small>Konfigurasi aplikasi</small></button>')+
    item(can("backup")||owner,'<button class="bf-app-menu-item" data-custom-action="backup">💾 Backup<small>Backup darurat Owner</small></button>')+
    item(owner,'<button class="bf-app-menu-item" data-owner-action="deleted">🗑 Data Terhapus<small>Pulihkan / hapus permanen</small></button>')+
    '</div></div>';
}
function nativeGo(route){
  if(typeof window.BFNativeNavigate!=="function")return false;
  window.BFNativeNavigate(route);return true;
}
function close(){
  const pop=document.querySelector(".bf-app-menu-pop"),btn=document.querySelector(".bf-app-menu-btn");
  pop?.classList.remove("bf-show");btn?.classList.remove("bf-open");
}
function position(pop,btn){
  const r=btn.getBoundingClientRect();
  const inset=8;
  document.documentElement.style.setProperty("--bf-menu-top",Math.max(inset,Math.round(r.bottom+8))+"px");
  document.documentElement.style.setProperty("--bf-menu-right",Math.max(inset,Math.round(window.innerWidth-r.right))+"px");
}
function handleAction(item){
  let ok=false;
  const oa=item.dataset.ownerAction;
  if(oa){
    const map={users:"bfOpenUsers",permissions:"bfOpenPermissions",audit:"bfOpenAudit",requests:"bfOpenRequests",deleted:"BFOpenDeletedData"};
    const fn=map[oa];if(fn&&typeof window[fn]==="function"){window[fn]();ok=true}
  }
  const ca=item.dataset.customAction;
  if(ca){
    const map={
      "transactions-in":"BFOpenTransactionsIn","transactions-out":"BFOpenTransactionsOut","tally":"BFOpenTallyChooser",
      "finance-expense":"BFOpenFinanceExpense","finance-deposit":"BFOpenFinanceDeposit","finance-grocery":"BFOpenFinanceGrocery",
      "commission":"BFOpenCommission","products":"BFOpenProducts","suppliers":"BFOpenSuppliers","customers":"BFOpenCustomers",
      "employees":"BFOpenEmployees","reports":"BFOpenReports","history-detail":"BFOpenDetailedHistory","exports":"BFOpenExports","backup":"BFOpenBackup"
    };
    const fn=map[ca];if(fn&&typeof window[fn]==="function"){window[fn]();ok=true}
  }
  if(item.dataset.route)ok=nativeGo(item.dataset.route)||ok;
  return ok;
}
function install(){
  const header=document.querySelector("header > div");if(!header||header.querySelector(".bf-app-menu-wrap"))return;
  const wrap=document.createElement("span");wrap.className="bf-app-menu-wrap";
  const btn=document.createElement("button");btn.type="button";btn.className="bf-app-menu-btn";btn.innerHTML='☰ <span>MENU</span>';
  const pop=document.createElement("div");pop.className="bf-app-menu-pop";pop.innerHTML=menuHTML();
  wrap.append(btn,pop);header.appendChild(wrap);
  btn.addEventListener("click",e=>{e.stopPropagation();const opening=!pop.classList.contains("bf-show");if(opening){pop.innerHTML=menuHTML();position(pop,btn)}pop.classList.toggle("bf-show");btn.classList.toggle("bf-open")});
  pop.addEventListener("click",e=>{const item=e.target.closest(".bf-app-menu-item");if(!item)return;if(handleAction(item))close()});
  document.addEventListener("click",e=>{if(!wrap.contains(e.target))close()});
}
window.BFMenu={install,close,menuHTML};
window.addEventListener("bf:ui-mode",close);
window.addEventListener("bf:main-mounted",()=>requestAnimationFrame(install),{once:true});
})();