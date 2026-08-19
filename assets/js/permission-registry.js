(function(){
"use strict";
if(window.BFPermissions)return;
const registry={
  view_assigned_deliveries:{label:"Melihat Pengantaran Saya",description:"Akses khusus Supir untuk melihat Customer Barang Keluar yang ditugaskan kepadanya.",group:"Pengantaran",driverOnly:true,owner:false,admin:false,operator:false,driver:true},
  upload_delivery_proof:{label:"Upload Bukti Pengantaran",description:"Akses khusus Supir untuk mengunggah bukti pada tugas pengantaran miliknya.",group:"Pengantaran",driverOnly:true,owner:false,admin:false,operator:false,driver:true},
  view_in:{label:"Melihat Barang Masuk",description:"Mengizinkan melihat catatan Barang Masuk.",group:"Transaksi",owner:true,admin:true,operator:true,driver:false},
  view_out:{label:"Melihat Barang Keluar",description:"Mengizinkan melihat catatan Barang Keluar.",group:"Transaksi",owner:true,admin:true,operator:true},
  view_tally:{label:"Melihat Tally",description:"Mengizinkan membuka dan melihat Tally Sheet.",group:"Transaksi",owner:true,admin:true,operator:true},
  add_row:{label:"Menambah Data Transaksi",description:"Mengizinkan menambah baris/data baru pada area transaksi yang mendukungnya.",group:"Transaksi",owner:true,admin:true,operator:true},
  edit_data:{label:"Mengubah Data",description:"Mengizinkan mengubah data pada area yang menggunakan izin umum Edit Data.",group:"Transaksi",sensitive:true,owner:true,admin:true,operator:true},
  delete_data:{label:"Menghapus Data",description:"Mengizinkan penghapusan data pada bagian yang mendukung izin ini.",group:"Pengawasan & Administrasi",sensitive:true,owner:true,admin:false,operator:false},
  input_weight:{label:"Input Timbangan",description:"Mengizinkan memasukkan nilai timbangan real.",group:"Timbangan",owner:true,admin:true,operator:true},
  edit_weight:{label:"Mengubah Timbangan",description:"Mengizinkan mengubah nilai timbangan yang sudah dicatat.",group:"Timbangan",sensitive:true,owner:true,admin:true,operator:false},
  delete_weight:{label:"Menghapus Timbangan",description:"Permission lama; tidak ditemukan lagi sebagai pemeriksaan runtime aktif.",group:"Timbangan",legacy:true,sensitive:true,owner:true,admin:false,operator:false},
  view_finance:{label:"Melihat Keuangan",description:"Mengizinkan membuka data Keuangan yang tersedia untuk role tersebut.",group:"Keuangan",sensitive:true,owner:true,admin:true,operator:false},
  view_note:{label:"Melihat Catatan Keuangan",description:"Izin kompatibilitas untuk membuka Pengeluaran, Setoran, dan Sembako; sebagian fungsinya tumpang tindih dengan Melihat Keuangan.",group:"Keuangan",sensitive:true,overlap:"view_finance",owner:true,admin:true,operator:false},
  edit_finance:{label:"Menambah & Mengubah Data Keuangan",description:"Mengizinkan menambah atau mengubah Pengeluaran, Setoran, dan Sembako pada jalur finance canonical.",group:"Keuangan",sensitive:true,owner:true,admin:true,operator:false},
  view_commission:{label:"Melihat Komisi",description:"Akses Komisi khusus Owner dan tidak dapat diberikan kepada Admin/Operator.",group:"Keuangan",sensitive:true,ownerOnly:true,owner:true,admin:false,operator:false},
  view_reports:{label:"Melihat Laporan Detail",description:"Mengizinkan membuka Laporan Detail.",group:"Laporan & Ekspor",owner:true,admin:true,operator:true},
  view_history:{label:"Melihat Histori",description:"Mengizinkan membuka histori transaksi sesuai aturan aplikasi.",group:"Laporan & Ekspor",owner:true,admin:true,operator:true},
  print:{label:"Mencetak",description:"Mengizinkan fungsi cetak yang dilindungi permission.",group:"Laporan & Ekspor",owner:true,admin:true,operator:true},
  export_csv:{label:"Ekspor CSV",description:"Mengizinkan ekspor CSV yang tersedia pada aplikasi.",group:"Laporan & Ekspor",owner:true,admin:true,operator:false},
  export_pdf:{label:"Ekspor PDF",description:"Mengizinkan membuat laporan PDF yang tersedia untuk role tersebut.",group:"Laporan & Ekspor",owner:true,admin:true,operator:false},
  backup:{label:"Membuat Cadangan Data",description:"Mengizinkan fungsi backup/cadangan yang dilindungi permission, termasuk Backup Google Drive/Owner snapshot sesuai jalurnya.",group:"Sistem & Cadangan",sensitive:true,owner:true,admin:false,operator:false},
  restore:{label:"Memulihkan Cadangan",description:"Permission lama; mekanisme restore aktif saat ini menggunakan guard lain seperti Owner/backup/approval.",group:"Sistem & Cadangan",legacy:true,sensitive:true,owner:true,admin:false,operator:false},
  view_settings:{label:"Melihat Pengaturan",description:"Mengizinkan membuka menu Pengaturan yang tersedia.",group:"Sistem & Cadangan",owner:true,admin:false,operator:false},
  manage_users:{label:"Mengelola Pengguna",description:"Mengizinkan Owner mengatur role dan status aktif pengguna.",group:"Pengguna & Hak Akses",sensitive:true,ownerOnly:true,owner:true,admin:false,operator:false},
  manage_permissions:{label:"Mengelola Hak Akses",description:"Mengizinkan membuka dan menyimpan pengaturan hak akses role.",group:"Pengguna & Hak Akses",sensitive:true,ownerOnly:true,owner:true,admin:false,operator:false},
  view_audit:{label:"Melihat Riwayat Aktivitas",description:"Akses Log Aktivitas khusus Owner; Admin/Operator tetap dicatat ke audit tetapi tidak dapat membaca log.",group:"Pengawasan & Administrasi",sensitive:true,ownerOnly:true,owner:true,admin:false,operator:false},
  approve_history:{label:"Menyetujui Perubahan Histori",description:"Mengizinkan Owner menyetujui permintaan perubahan histori dan memulihkan data pada jalur governance tertentu.",group:"Pengawasan & Administrasi",sensitive:true,ownerOnly:true,owner:true,admin:false,operator:false},
  request_history:{label:"Mengajukan Izin Perubahan Histori",description:"Mengizinkan pengguna mengajukan permintaan perubahan histori yang memerlukan persetujuan Owner.",group:"Pengawasan & Administrasi",owner:true,admin:true,operator:true},
  view_products:{label:"Melihat Produk",description:"Mengizinkan melihat data master Produk.",group:"Data Master",owner:true,admin:true,operator:true},
  manage_products:{label:"Mengelola Produk",description:"Mengizinkan menambah atau mengubah data master Produk.",group:"Data Master",owner:true,admin:true,operator:false},
  view_suppliers:{label:"Melihat Supplier",description:"Mengizinkan melihat data master Supplier.",group:"Data Master",owner:true,admin:true,operator:true},
  manage_suppliers:{label:"Mengelola Supplier",description:"Mengizinkan menambah atau mengubah data master Supplier.",group:"Data Master",owner:true,admin:true,operator:false},
  view_customers:{label:"Melihat Customer",description:"Mengizinkan melihat data master Customer.",group:"Data Master",owner:true,admin:true,operator:true},
  manage_customers:{label:"Mengelola Customer",description:"Mengizinkan menambah atau mengubah data master Customer.",group:"Data Master",owner:true,admin:true,operator:false},
  view_employees:{label:"Melihat Staff",description:"Mengizinkan melihat data Staff/Karyawan.",group:"Data Master",owner:true,admin:true,operator:true},
  manage_employees:{label:"Mengelola Staff",description:"Mengizinkan menambah atau mengubah data Staff sesuai batasan role; rate Komisi tetap Owner-only.",group:"Data Master",sensitive:true,owner:true,admin:true,operator:false}
};
const groups=["Pengantaran","Transaksi","Timbangan","Keuangan","Data Master","Laporan & Ekspor","Pengawasan & Administrasi","Pengguna & Hak Akses","Sistem & Cadangan"];
function defaults(role){const out={};for(const [key,cfg] of Object.entries(registry))out[key]=!!cfg[role];return out}
function activeEntries(){return Object.entries(registry).filter(([,cfg])=>!cfg.legacy)}
window.BFPermissions={
  registry,groups,defaults,
  keys:()=>Object.keys(registry),
  activeKeys:()=>activeEntries().map(([key])=>key),
  label:key=>registry[key]?.label||key,
  description:key=>registry[key]?.description||"",
  group:key=>registry[key]?.group||"Lainnya",
  meta:key=>registry[key]||null,
  isLegacy:key=>registry[key]?.legacy===true,
  isOwnerOnly:key=>registry[key]?.ownerOnly===true
};
})();
