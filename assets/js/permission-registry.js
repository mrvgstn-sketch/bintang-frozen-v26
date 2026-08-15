(function(){
"use strict";
if(window.BFPermissions)return;
const registry={
  view_in:{label:"Lihat Barang Masuk",owner:true,admin:true,operator:true},
  view_out:{label:"Lihat Barang Keluar",owner:true,admin:true,operator:true},
  view_tally:{label:"Lihat Tally",owner:true,admin:true,operator:true},
  add_row:{label:"Tambah Data",owner:true,admin:true,operator:true},
  edit_data:{label:"Edit Data",owner:true,admin:true,operator:true},
  delete_data:{label:"Hapus Data",owner:true,admin:false,operator:false},
  input_weight:{label:"Input Timbangan",owner:true,admin:true,operator:true},
  edit_weight:{label:"Edit Timbangan",owner:true,admin:true,operator:false},
  delete_weight:{label:"Hapus Timbangan",owner:true,admin:false,operator:false},
  view_finance:{label:"Lihat Keuangan",owner:true,admin:true,operator:false},
  view_note:{label:"Lihat Catatan Keuangan",owner:true,admin:true,operator:false},
  edit_finance:{label:"Edit Keuangan",owner:true,admin:true,operator:false},
  view_commission:{label:"Lihat Komisi",owner:true,admin:false,operator:false},
  view_reports:{label:"Lihat Laporan",owner:true,admin:true,operator:true},
  view_history:{label:"Lihat Histori",owner:true,admin:true,operator:true},
  print:{label:"Cetak",owner:true,admin:true,operator:true},
  export_csv:{label:"Export CSV",owner:true,admin:true,operator:false},
  export_pdf:{label:"Export PDF",owner:true,admin:true,operator:false},
  backup:{label:"Backup",owner:true,admin:false,operator:false},
  restore:{label:"Restore",owner:true,admin:false,operator:false},
  view_settings:{label:"Lihat Pengaturan",owner:true,admin:false,operator:false},
  manage_users:{label:"Kelola Pengguna",owner:true,admin:false,operator:false},
  manage_permissions:{label:"Kelola Hak Akses",owner:true,admin:false,operator:false},
  view_audit:{label:"Lihat Audit",owner:true,admin:false,operator:false},
  approve_history:{label:"Persetujuan Histori",owner:true,admin:false,operator:false},
  request_history:{label:"Ajukan Izin Histori",owner:true,admin:true,operator:true},
  view_products:{label:"Lihat Produk",owner:true,admin:true,operator:true},
  manage_products:{label:"Kelola Produk",owner:true,admin:true,operator:false},
  view_suppliers:{label:"Lihat Supplier",owner:true,admin:true,operator:true},
  manage_suppliers:{label:"Kelola Supplier",owner:true,admin:true,operator:false},
  view_customers:{label:"Lihat Customer",owner:true,admin:true,operator:true},
  manage_customers:{label:"Kelola Customer",owner:true,admin:true,operator:false},
  view_employees:{label:"Lihat Staff",owner:true,admin:true,operator:true},
  manage_employees:{label:"Kelola Staff",owner:true,admin:true,operator:false}
};
function defaults(role){const out={};for(const [key,cfg] of Object.entries(registry))out[key]=!!cfg[role];return out}
window.BFPermissions={registry,defaults,keys:()=>Object.keys(registry),label:key=>registry[key]?.label||key};
})();
