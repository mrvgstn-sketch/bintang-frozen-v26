(function(){
"use strict";
function menuHTML(){
  const can=window.BFCore.can,role=(window.BFCurrentUser?.()?.profile?.role||"").toLowerCase(),owner=role==="owner",item=(show,html)=>show?html:"";
  return '<div class="bf-app-menu-head">Menu Bintang Frozen</div>'+ section('🏠 DASHBOARD',item(true,button('🏠 Dashboard','Pusat kontrol aplikasi','route','dashboard')))+
    section('📦 TRANSAKSI',item(can('view_in'),button('📥 Barang Masuk','Transaksi & Tally Timbangan','action','transactions-in'))+item(can('view_out'),button('📤 Barang Keluar','Transaksi & Tally Timbangan','action','transactions-out'))+item(can('view_tally'),button('⚖️ Tally Timbangan','Masuk / Keluar','action','tally')))+
    section('💰 KEUANGAN',item(can('view_finance')||can('view_note'),button('💰 Pengeluaran','Catatan pengeluaran','action','finance-expense'))+item(can('view_finance')||can('view_note'),button('🏦 Setoran','Catatan setoran','action','finance-deposit'))+item(can('view_commission')||can('view_finance'),button('💸 Komisi','Otomatis per Customer/Marketing','action','commission'))+item(can('view_finance')||can('view_note'),button('🛒 Sembako','Catatan sembako','action','finance-grocery')))+
    section('📋 DATA MASTER',item(can('view_products'),button('📦 Produk','Data master produk','action','products'))+item(can('view_suppliers'),button('🚚 Supplier','Data master supplier','action','suppliers'))+item(can('view_customers'),button('👥 Customer','Data master customer','action','customers')))+
    section('📊 LAPORAN',item(can('view_history')||can('request_history'),button('📚 Histori','Transaksi dan perubahan terakhir','action','history-detail'))+item(can('view_reports'),button('📊 Laporan Detail','Semua detail transaksi dan Tally','action','reports'))+item(can('export_pdf')||can('export_csv'),button('📄 Export PDF / CSV','Pilih periode dan kategori','action','exports')))+
    section('👥 MANAJEMEN',item(can('view_employees'),button('👥 Staff','Manajemen karyawan','action','employees'))+item(can('manage_users'),button('👤 Pengguna','Akun Google & role','owner','users'))+item(can('manage_permissions'),button('🔐 Hak Akses','Permission per fitur','owner','permissions'))+item(can('approve_history'),button('🔔 Izin Histori','Approve / reject','owner','requests'))+item(can('view_audit'),button('📋 Log Aktivitas','Audit aktivitas pengguna','owner','audit')))+
    section('⚙️ SISTEM',item(can('view_settings')||owner,button('⚙️ Pengaturan','Konfigurasi aplikasi','route','pengaturan'))+item(can('backup')||owner,button('☁️ Backup Google Drive','Full Backup & Restore','action','backup'))+item(owner,button('🗑 Data Terhapus','Pulihkan / hapus permanen','owner','deleted')));
}
function section(label,items){return items?`<div class="bf-app-menu-section"><div class="bf-app-menu-label">${label}</div><div class="bf-app-menu-grid">${items}</div></div>`:""}
function button(title,sub,type,value){return `<button class="bf-app-menu-item" data-${type}="${value}">${title}<small>${sub}</small></button>`}
function navigate(route){if(typeof window.BFNativeNavigate!=="function")return false;window.BFNativeNavigate(route);return true}
function install(){
  const header=document.getElementById('bf-menu-host');if(!header||document.querySelector('.bf-app-menu-wrap'))return;
  const wrap=document.createElement('span');wrap.className='bf-app-menu-wrap';wrap.innerHTML='<button type="button" class="bf-app-menu-btn">☰ <span>MENU</span></button><div class="bf-app-menu-pop"></div>';header.appendChild(wrap);
  const btn=wrap.querySelector('.bf-app-menu-btn'),pop=wrap.querySelector('.bf-app-menu-pop');
  const close=()=>{pop.classList.remove('bf-show');btn.classList.remove('bf-open')};
  const position=()=>{const r=btn.getBoundingClientRect(),vw=document.documentElement.clientWidth||innerWidth,vh=window.visualViewport?.height||window.innerHeight,margin=12,width=Math.min(760,Math.max(280,vw-margin*2));let left=Math.min(Math.max(margin,r.right-width),vw-margin-width);if(vw<768)left=margin;pop.style.width=(vw<768?vw-margin*2:width)+'px';pop.style.left=Math.max(margin,left)+'px';pop.style.maxHeight=Math.max(180,vh-margin*2)+'px';const desired=r.bottom+8,maxTop=Math.max(margin,vh-margin-Math.min(pop.scrollHeight,vh-margin*2));pop.style.top=Math.max(margin,Math.min(desired,maxTop))+'px'};
  btn.onclick=e=>{e.stopPropagation();if(pop.classList.contains('bf-show'))return close();pop.innerHTML=menuHTML();position();pop.classList.add('bf-show');btn.classList.add('bf-open')};
  pop.onclick=e=>{const it=e.target.closest('.bf-app-menu-item');if(!it)return;let ok=false;const actionMap={
    'transactions-in':'BFOpenTransactionsIn','transactions-out':'BFOpenTransactionsOut','tally':'BFOpenTallyChooser','finance-expense':'BFOpenFinanceExpense','finance-deposit':'BFOpenFinanceDeposit','finance-grocery':'BFOpenFinanceGrocery','commission':'BFOpenCommission','products':'BFOpenProducts','suppliers':'BFOpenSuppliers','customers':'BFOpenCustomers','employees':'BFOpenEmployees','reports':'BFOpenReports','history-detail':'BFOpenDetailedHistory','exports':'BFOpenExports','backup':'BFOpenBackup'};
    if(it.dataset.action){const fn=actionMap[it.dataset.action];if(fn&&typeof window[fn]==='function'){window[fn]();ok=true}}
    if(it.dataset.owner){const om={users:'bfOpenUsers',permissions:'bfOpenPermissions',requests:'bfOpenRequests',audit:'bfOpenAudit',deleted:'BFOpenDeletedData'},fn=om[it.dataset.owner];if(fn&&typeof window[fn]==='function'){window[fn]();ok=true}}
    if(it.dataset.route)ok=navigate(it.dataset.route)||ok;if(ok)close()};
  document.addEventListener('click',e=>{if(!wrap.contains(e.target))close()});
  window.addEventListener('bf:ui-mode',close);
}
window.addEventListener('bf:main-mounted',()=>requestAnimationFrame(install),{once:true});if(window.__bfMainMounted)requestAnimationFrame(install);
})();
