(function(){
"use strict";
let activeWrap=null;
function menuHTML(){
  const can=window.BFCore.can,role=(window.BFCurrentUser?.()?.profile?.role||"").toLowerCase(),owner=role==="owner",admin=role==="admin",item=(show,html)=>show?html:"";
  return '<div class="bf-app-menu-head">Menu Bintang Frozen</div>'+ section('🏠 DASHBOARD',item(true,button('🏠 Dashboard','Pusat kontrol aplikasi','route','dashboard')))+
    section('📦 TRANSAKSI',item(can('view_in'),button('📥 Barang Masuk','Transaksi & Tally Timbangan','action','transactions-in'))+item(can('view_out'),button('📤 Barang Keluar','Transaksi & Tally Timbangan','action','transactions-out'))+item(can('view_tally'),button('⚖️ Tally Timbangan','Masuk / Keluar','action','tally')))+
    section('💰 KEUANGAN',item(can('view_finance')||can('view_note'),button('💰 Pengeluaran','Catatan pengeluaran','action','finance-expense'))+item(can('view_finance')||can('view_note'),button('🏦 Setoran','Canonical • Customer ID • Cloud ACK','action','finance-deposit'))+item(owner||admin,button('🧾 Nota & Dana Titipan','Titipan Customer • Cicilan • Rekonsiliasi Kas','action','nota-dana-titipan'))+item(owner||admin,button('🛡 Kontrol Dana Titipan','Koreksi • Reversal • Customer History','action','nota-dana-controls'))+item(owner&&can('view_commission'),button('💸 Komisi','Otomatis per Customer/Marketing','action','commission'))+item(can('view_finance')||can('view_note'),button('🛒 Sembako','Catatan sembako','action','finance-grocery')))+
    section('📋 DATA MASTER',item(can('view_products'),button('📦 Produk','Data master produk','action','products'))+item(can('view_suppliers'),button('🚚 Supplier','Data master supplier','action','suppliers'))+item(can('view_customers'),button('👥 Customer','Data master customer','action','customers')))+
    section('📊 LAPORAN',item(can('view_history')||can('request_history'),button('📚 Histori','Transaksi dan perubahan terakhir','action','history-detail'))+item(can('view_reports'),button('📊 Laporan Detail','Semua detail transaksi dan Tally','action','reports'))+item(can('export_pdf')||can('export_csv'),button('📄 Export PDF / CSV','Pilih periode dan kategori','action','exports')))+
    section('🚚 PENGANTARAN',item(owner,button('📍 Live Driver Location','Posisi Driver • Owner-only','action','driver-location')))+
    section('👥 MANAJEMEN',item(can('view_employees'),button('👥 Staff','Manajemen karyawan','action','employees'))+item(can('manage_users'),button('👤 Pengguna','Akun Google & role','owner','users'))+item(can('manage_permissions'),button('🔐 Hak Akses','Permission per fitur','owner','permissions'))+item(can('approve_history'),button('🔔 Izin Histori','Approve / reject','owner','requests'))+item(owner&&can('view_audit'),button('📋 Log Aktivitas','Riwayat aktivitas pengguna','owner','audit')))+
    section('⚙️ SISTEM',item(can('view_settings')||owner,button('⚙️ Pengaturan','Konfigurasi aplikasi','route','pengaturan'))+item(can('backup')||owner,button('☁️ Backup Google Drive','Full Backup & Restore','action','backup'))+item(owner,button('🗑 Data Terhapus','Pulihkan / hapus permanen','owner','deleted')));
}
function section(label,items){return items?`<div class="bf-app-menu-section"><div class="bf-app-menu-label">${label}</div><div class="bf-app-menu-grid">${items}</div></div>`:""}
function button(title,sub,type,value){return `<button class="bf-app-menu-item" data-${type}="${value}">${title}<small>${sub}</small></button>`}
function navigate(route){if(typeof window.BFNativeNavigate!=="function")return false;window.BFNativeNavigate(route);return true}
function close(wrap=activeWrap){if(!wrap)return;const btn=wrap.querySelector('.bf-app-menu-btn'),pop=wrap.querySelector('.bf-app-menu-pop');pop?.classList.remove('bf-show');btn?.classList.remove('bf-open');btn?.setAttribute('aria-expanded','false')}
function position(btn,pop){const r=btn.getBoundingClientRect(),vw=document.documentElement.clientWidth||innerWidth,margin=12,width=Math.min(760,Math.max(280,vw-margin*2));let left=Math.min(Math.max(margin,r.right-width),vw-margin-width);if(vw<768)left=margin;pop.style.width=(vw<768?vw-margin*2:width)+'px';pop.style.left=Math.max(margin,left)+'px';pop.style.top=Math.min(r.bottom+8,(window.visualViewport?.height||window.innerHeight)-80)+'px'}
function loadScriptOnce(src,key,readyFn){
  if(typeof window[readyFn]==='function'){window[readyFn]();return Promise.resolve(true)}
  if(window[key])return window[key];
  window[key]=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=true;s.onload=()=>{if(typeof window[readyFn]==='function'){window[readyFn]();resolve(true)}else reject(new Error('Modul gagal diinisialisasi.'))};s.onerror=()=>reject(new Error('Modul gagal dimuat.'));document.head.appendChild(s)}).finally(()=>{window[key]=null});
  return window[key];
}
function loadCanonicalSetoran(){return loadScriptOnce('assets/js/setoran-canonical.js?v=20260822-uat1','__bfCanonicalSetoranLoading','BFOpenCanonicalSetoran')}
async function loadNotaDanaTitipan(){
  await loadScriptOnce('assets/js/nota-dana-titipan-signature-hardening.js?v=20260822-uat2','__bfNotaSignatureLoading','BFNotaSignatureStrokeCount');
  return loadScriptOnce('assets/js/nota-dana-titipan.js?v=20260822-uat2','__bfNotaDanaTitipanLoading','BFOpenNotaDanaTitipan');
}
function loadNotaDanaControls(){return loadScriptOnce('assets/js/nota-dana-titipan-controls.js?v=20260822-uat2','__bfNotaDanaControlsLoading','BFOpenNotaDanaTitipanControls')}
function bind(wrap){
  if(!wrap || wrap.id!=="bf-app-menu-anchor")return false;activeWrap=wrap;if(wrap.dataset.bfMenuBound==="1")return true;
  const btn=wrap.querySelector('.bf-app-menu-btn'),pop=wrap.querySelector('.bf-app-menu-pop');if(!btn||!pop)return false;wrap.dataset.bfMenuBound="1";
  btn.addEventListener('click',e=>{e.stopPropagation();if(pop.classList.contains('bf-show'))return close(wrap);pop.innerHTML=menuHTML();position(btn,pop);pop.classList.add('bf-show');btn.classList.add('bf-open');btn.setAttribute('aria-expanded','true')});
  pop.addEventListener('click',e=>{
    const it=e.target.closest('.bf-app-menu-item');if(!it)return;let ok=false;
    if(it.dataset.action==='finance-deposit'){close(wrap);loadCanonicalSetoran().catch(err=>{console.error(err);alert(err.message||String(err))});return}
    if(it.dataset.action==='nota-dana-titipan'){close(wrap);loadNotaDanaTitipan().catch(err=>{console.error(err);alert(err.message||String(err))});return}
    if(it.dataset.action==='nota-dana-controls'){close(wrap);loadNotaDanaControls().catch(err=>{console.error(err);alert(err.message||String(err))});return}
    const actionMap={'transactions-in':'BFOpenTransactionsIn','transactions-out':'BFOpenTransactionsOut','tally':'BFOpenTallyChooser','finance-expense':'BFOpenFinanceExpense','finance-grocery':'BFOpenFinanceGrocery','commission':'BFOpenCommission','products':'BFOpenProducts','suppliers':'BFOpenSuppliers','customers':'BFOpenCustomers','employees':'BFOpenEmployees','reports':'BFOpenReports','history-detail':'BFOpenDetailedHistory','exports':'BFOpenExports','backup':'BFOpenBackup','driver-location':'BFOpenDriverLocation'};
    if(it.dataset.action){const fn=actionMap[it.dataset.action];if(fn&&typeof window[fn]==='function'){window[fn]();ok=true}}
    if(it.dataset.owner){const om={users:'bfOpenUsers',permissions:'bfOpenPermissions',requests:'bfOpenRequests',audit:'bfOpenAudit',deleted:'BFOpenDeletedData'},fn=om[it.dataset.owner];if(fn&&typeof window[fn]==='function'){window[fn]();ok=true}}
    if(it.dataset.route)ok=navigate(it.dataset.route)||ok;if(ok)close(wrap);
  });return true;
}
window.BFMenuBind=bind;
if(!window.__bfMenuGlobalListeners){window.__bfMenuGlobalListeners=true;document.addEventListener('click',e=>{const wrap=activeWrap;if(wrap&&!wrap.contains(e.target))close(wrap)});window.addEventListener('bf:ui-mode',()=>close())}
function bindCanonical(){return bind(document.getElementById('bf-app-menu-anchor'))}
window.addEventListener('bf:main-mounted',bindCanonical);bindCanonical();
})();