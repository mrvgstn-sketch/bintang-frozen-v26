(function(){
  "use strict";
  function menuHTML(){
    var can=window.BFCore.can;
    var role=(window.BFCurrentUser?.()?.profile?.role||"").toLowerCase();
    var owner=role==="owner";
    var item=function(show,html){return show?html:""};
    return '<div class="bf-final-menu-head">Menu Bintang Frozen</div>'+
      '<div class="bf-final-menu-section"><div class="bf-final-menu-label">🏠 DASHBOARD</div><div class="bf-final-menu-grid">'+
      item(true,'<button class="bf-final-menu-item" data-route="dashboard">🏠 Dashboard<small>Pusat kontrol aplikasi</small></button>')+
      '</div></div>'+
      '<div class="bf-final-menu-section"><div class="bf-final-menu-label">📦 TRANSAKSI</div><div class="bf-final-menu-grid">'+
      item(can("view_in"),'<button class="bf-final-menu-item" data-custom-action="transactions-in">📥 Barang Masuk<small>Transaksi & Tally Timbangan</small></button>')+
      item(can("view_out"),'<button class="bf-final-menu-item" data-custom-action="transactions-out">📤 Barang Keluar<small>Transaksi & Tally Timbangan</small></button>')+
      item(can("view_tally"),'<button class="bf-final-menu-item" data-custom-action="tally">⚖️ Tally Timbangan<small>Masuk / Keluar</small></button>')+
      '</div></div>'+
      '<div class="bf-final-menu-section"><div class="bf-final-menu-label">💰 KEUANGAN</div><div class="bf-final-menu-grid">'+
      item(can("view_finance")||can("view_note"),'<button class="bf-final-menu-item" data-custom-action="finance-expense">💰 Pengeluaran<small>Catatan pengeluaran</small></button>')+
      item(can("view_finance")||can("view_note"),'<button class="bf-final-menu-item" data-custom-action="finance-deposit">🏦 Setoran<small>Catatan setoran</small></button>')+
      item(can("view_commission")||can("view_finance"),'<button class="bf-final-menu-item" data-custom-action="commission">💸 Komisi<small>Otomatis dari Barang Keluar</small></button>')+
      item(can("view_finance")||can("view_note"),'<button class="bf-final-menu-item" data-custom-action="finance-grocery">🛒 Sembako<small>Catatan sembako</small></button>')+
      '</div></div>'+
      '<div class="bf-final-menu-section"><div class="bf-final-menu-label">📋 DATA MASTER</div><div class="bf-final-menu-grid">'+
      item(can("view_products"),'<button class="bf-final-menu-item" data-custom-action="products">📦 Produk<small>Data master produk</small></button>')+
      item(can("view_suppliers"),'<button class="bf-final-menu-item" data-custom-action="suppliers">🚚 Supplier<small>Data master supplier</small></button>')+
      item(can("view_customers"),'<button class="bf-final-menu-item" data-custom-action="customers">👥 Customer<small>Data master customer</small></button>')+
      '</div></div>'+
      '<div class="bf-final-menu-section"><div class="bf-final-menu-label">📊 LAPORAN</div><div class="bf-final-menu-grid">'+
      item(can("view_history")||can("request_history"),'<button class="bf-final-menu-item" data-custom-action="history-detail">📚 Histori<small>Transaksi, pembuat & perubahan</small></button>')+
      item(can("view_reports")||can("export_pdf")||can("export_csv"),'<button class="bf-final-menu-item" data-custom-action="reports">📊 Laporan Detail<small>Transaksi, Tally & Keuangan rinci</small></button>')+
      item(can("export_pdf")||can("export_csv"),'<button class="bf-final-menu-item" data-custom-action="exports">📄 Export PDF Detail<small>Pilih tanggal & kategori</small></button>')+
      '</div></div>'+
      '<div class="bf-final-menu-section"><div class="bf-final-menu-label">👥 MANAJEMEN</div><div class="bf-final-menu-grid">'+
      item(can("view_employees"),'<button class="bf-final-menu-item" data-custom-action="employees">👥 Staff<small>Manajemen karyawan</small></button>')+
      item(can("manage_users"),'<button class="bf-final-menu-item" data-owner-action="users">👤 Pengguna<small>Akun Google & role</small></button>')+
      item(can("manage_permissions"),'<button class="bf-final-menu-item" data-owner-action="permissions">🔐 Hak Akses<small>Permission per fitur</small></button>')+
      item(can("approve_history"),'<button class="bf-final-menu-item" data-owner-action="requests">🔔 Izin Histori<small>Approve / reject</small></button>')+
      item(can("view_audit"),'<button class="bf-final-menu-item" data-owner-action="audit">📋 Log Aktivitas<small>Audit aktivitas pengguna</small></button>')+
      '</div></div>'+
      '<div class="bf-final-menu-section"><div class="bf-final-menu-label">⚙️ SISTEM</div><div class="bf-final-menu-grid">'+
      item(can("view_settings")||owner,'<button class="bf-final-menu-item" data-route="pengaturan">⚙️ Pengaturan<small>Konfigurasi aplikasi</small></button>')+
      item(can("backup")||owner,'<button class="bf-final-menu-item" data-custom-action="backup">☁️ Backup Google Drive<small>Full backup & restore</small></button>')+
      item(owner,'<button class="bf-final-menu-item" data-owner-action="deleted">🗑 Data Terhapus<small>Pulihkan / hapus permanen</small></button>')+
      '</div></div>';
  }
  function nativeGo(route){
    if(typeof window.BFNativeNavigate!=="function") return false;
    window.BFNativeNavigate(route);
    return true;
  }
  function wire(pop,btn,wrap){
    function close(){pop.classList.remove('bf-show');btn.classList.remove('bf-open');}
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      if(!pop.classList.contains('bf-show')){
        pop.innerHTML=menuHTML();
      }
      pop.classList.toggle('bf-show');
      btn.classList.toggle('bf-open');
    });
    pop.addEventListener('click',function(e){
      var item=e.target.closest('.bf-final-menu-item');if(!item)return;
      var ok=false,oa=item.dataset.ownerAction;
      if(oa){try{var map={
        users:'bfOpenUsers',
        permissions:'bfOpenPermissions',
        audit:'bfOpenAudit',
        requests:'bfOpenRequests',
        deleted:'BFOpenDeletedData',
        recycle:'BFOpenRecycleBin',
        settings:'BFOpenOwnerSettings'
      },fn=map[oa];if(fn&&typeof window[fn]==='function'){window[fn]();ok=true}}catch(err){console.error(err)}}
      var ca=item.dataset.customAction;
      if(ca){try{var cmap={
        'transactions-in':'BFOpenTransactionsIn',
        'transactions-out':'BFOpenTransactionsOut',
        'tally':'BFOpenTallyChooser',
        'finance':'BFOpenFinance',
        'finance-expense':'BFOpenFinanceExpense',
        'finance-deposit':'BFOpenFinanceDeposit',
        'finance-grocery':'BFOpenFinanceGrocery',
        'commission':'BFOpenCommission',
        'products':'BFOpenProducts',
        'suppliers':'BFOpenSuppliers',
        'customers':'BFOpenCustomers',
        'employees':'BFOpenEmployees',
        'reports':'BFOpenReports',
        'history-detail':'BFOpenDetailedHistory',
        'exports':'BFOpenExports',
        'backup':'BFOpenBackup',
        'report-period':'BFOpenReportPeriod'
      },cf=cmap[ca];if(cf&&typeof window[cf]==='function'){window[cf]();ok=true}}catch(err){console.error(err)}}
      if(item.dataset.route)ok=nativeGo(item.dataset.route)||ok;
      if(item.dataset.action){
        if(item.dataset.action==='backup'&&!(window.BFCan&&BFCan('backup'))){alert('Backup Google Drive hanya untuk Owner / pengguna berizin.');return;}
        var ids={pdf:'bfTallyCombinedPdf',csv:'bfTallyCombined',print:'bfTallyPrint',backup:'bfTallyJson'},target=document.getElementById(ids[item.dataset.action]);
        if(target){target.click();ok=true;}
      }
      if(ok)close();
    });
    document.addEventListener('click',function(e){if(!wrap.contains(e.target))close();});
  }
  function install(){
    var header=document.querySelector('header > div');if(!header)return;
    if(!header.querySelector('.bf-final-menu-wrap')){
      var wrap=document.createElement('span');wrap.className='bf-final-menu-wrap';
      var btn=document.createElement('button');btn.type='button';btn.className='bf-final-menu-btn';btn.innerHTML='☰ <span>MENU</span> <span style="font-size:10px">▼</span>';
      var pop=document.createElement('div');pop.className='bf-final-menu-pop';pop.innerHTML=menuHTML();wrap.appendChild(btn);wrap.appendChild(pop);header.appendChild(wrap);wire(pop,btn,wrap);
    }
    if(!header.querySelector('.bf-mobile-menu-wrap')){
      var wrap2=document.createElement('span');wrap2.className='bf-mobile-menu-wrap';
      var btn2=document.createElement('button');btn2.type='button';btn2.className='bf-mobile-menu-btn';btn2.innerHTML='☰ MENU';
      var pop2=document.createElement('div');pop2.className='bf-mobile-menu-pop';pop2.innerHTML=menuHTML();wrap2.appendChild(btn2);wrap2.appendChild(pop2);header.appendChild(wrap2);wire(pop2,btn2,wrap2);
    }
  }
  window.addEventListener("bf:main-mounted",()=>requestAnimationFrame(install),{once:true});
})();
