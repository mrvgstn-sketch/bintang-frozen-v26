(function(){
"use strict";
if(window.BFPermissionRegistry)return;
const PERMISSIONS={
  view_in:{label:"Barang Masuk",defaults:{owner:true,admin:true,operator:true}},
  view_out:{label:"Barang Keluar",defaults:{owner:true,admin:true,operator:true}},
  view_tally:{label:"Tally Timbangan",defaults:{owner:true,admin:true,operator:true}},
  add_row:{label:"Tambah Baris",defaults:{owner:true,admin:true,operator:true}},
  edit_data:{label:"Edit Data",defaults:{owner:true,admin:true,operator:true}},
  delete_data:{label:"Hapus Data",defaults:{owner:true,admin:false,operator:false}},
  input_weight:{label:"Input Timbangan",defaults:{owner:true,admin:true,operator:true}},
  edit_weight:{label:"Edit Timbangan",defaults:{owner:true,admin:true,operator:false}},
  delete_weight:{label:"Hapus Timbangan",defaults:{owner:true,admin:false,operator:false}},
  view_finance:{label:"Lihat Keuangan",defaults:{owner:true,admin:true,operator:false}},
  view_note:{label:"Catatan Keuangan",defaults:{owner:true,admin:true,operator:false}},
  edit_finance:{label:"Edit Keuangan",defaults:{owner:true,admin:true,operator:false}},
  view_commission:{label:"Lihat Komisi",defaults:{owner:true,admin:true,operator:false}},
  view_reports:{label:"Laporan",defaults:{owner:true,admin:true,operator:true}},
  view_history:{label:"Histori",defaults:{owner:true,admin:true,operator:true}},
  print:{label:"Cetak",defaults:{owner:true,admin:true,operator:true}},
  export_csv:{label:"Export CSV",defaults:{owner:true,admin:true,operator:false}},
  export_pdf:{label:"Export PDF",defaults:{owner:true,admin:true,operator:false}},
  backup:{label:"Backup",defaults:{owner:true,admin:false,operator:false}},
  restore:{label:"Restore",defaults:{owner:true,admin:false,operator:false}},
  manage_users:{label:"Kelola Pengguna",defaults:{owner:true,admin:false,operator:false}},
  manage_permissions:{label:"Kelola Hak Akses",defaults:{owner:true,admin:false,operator:false}},
  view_audit:{label:"Log Aktivitas",defaults:{owner:true,admin:false,operator:false}},
  approve_history:{label:"Persetujuan Histori",defaults:{owner:true,admin:false,operator:false}},
  request_history:{label:"Permintaan Histori",defaults:{owner:true,admin:true,operator:true}},
  view_products:{label:"Produk",defaults:{owner:true,admin:true,operator:true}},
  manage_products:{label:"Kelola Produk",defaults:{owner:true,admin:true,operator:false}},
  view_suppliers:{label:"Supplier",defaults:{owner:true,admin:true,operator:true}},
  manage_suppliers:{label:"Kelola Supplier",defaults:{owner:true,admin:true,operator:false}},
  view_customers:{label:"Customer",defaults:{owner:true,admin:true,operator:true}},
  manage_customers:{label:"Kelola Customer",defaults:{owner:true,admin:true,operator:false}},
  view_employees:{label:"Staff",defaults:{owner:true,admin:true,operator:true}},
  manage_employees:{label:"Kelola Staff",defaults:{owner:true,admin:true,operator:false}},
  view_settings:{label:"Pengaturan",defaults:{owner:true,admin:false,operator:false}}
};
function defaults(role){
  const r=String(role||"operator").toLowerCase();
  const out={};
  for(const [key,cfg] of Object.entries(PERMISSIONS))out[key]=cfg.defaults?.[r]===true;
  return out;
}
function keys(){return Object.keys(PERMISSIONS)}
function label(key){return PERMISSIONS[key]?.label||key}
function hasKey(key){return Object.prototype.hasOwnProperty.call(PERMISSIONS,key)}
function legacyPermissions(role,can){
  const has=p=>String(role).toLowerCase()==="owner"||can(p);
  return {
    dashboard:true,
    masuk:has("view_in"),keluar:has("view_out"),
    note_pengeluaran:has("view_finance")||has("view_note"),
    note_setoran:has("view_finance")||has("view_note"),
    note_sembako:has("view_finance")||has("view_note"),
    komisi:has("view_commission")||has("view_finance"),
    histori:has("view_history")||has("request_history"),
    staff:has("view_employees"),
    pengaturan:has("view_settings"),
    hapusData:has("delete_data"),
    editKomisi:has("edit_finance"),
    lihatKeuangan:has("view_finance")
  };
}
window.BFPermissionRegistry={PERMISSIONS,defaults,keys,label,hasKey,legacyPermissions};
})();