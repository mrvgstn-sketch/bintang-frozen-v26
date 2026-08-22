(function(){
"use strict";
if(window.BFUIIndonesian)return;

const EXACT=new Map(Object.entries({
  "Dashboard":"Ringkasan",
  "Pusat kontrol aplikasi":"Pusat kendali aplikasi",
  "Canonical • Customer ID • Cloud + Funds ACK":"Catatan setoran Customer • tersimpan dan tersinkron",
  "Komisi Customer • Deposit • Refund • Rekonsiliasi":"Komisi Customer • Dana Titipan • Pengembalian Dana • Rekonsiliasi",
  "Koreksi • Reversal • Customer History":"Koreksi • Pembatalan • Riwayat Customer",
  "Export PDF / CSV":"Ekspor PDF / CSV",
  "Export Gabungan CSV":"Ekspor Gabungan CSV",
  "Live Driver Location":"Lokasi Driver",
  "Posisi Driver • Owner-only":"Posisi Driver • khusus Owner",
  "Staff":"Karyawan",
  "Akun Google & role":"Akun Google & peran",
  "Permission per fitur":"Hak akses per fitur",
  "Approve / reject":"Setujui / Tolak",
  "Log Aktivitas":"Riwayat Aktivitas",
  "Backup Google Drive":"Cadangan Google Drive",
  "Backup Drive":"Cadangan Drive",
  "Full Backup & Restore":"Cadangan Lengkap & Pemulihan",
  "Reset Filter":"Hapus Filter",
  "Filter":"Saring",
  "Custom":"Rentang Tanggal",
  "Online":"Terhubung",
  "Offline":"Tidak Terhubung",
  "TALLY SHEET PRO":"SISTEM OPERASIONAL BINTANG FROZEN",
  "TALLY SHEET":"LEMBAR TIMBANG",
  "ITEM":"BARANG",
  "QTY":"JUMLAH",
  "REAL KG":"TIMBANG KG",
  "AVG KG":"RATA-RATA",
  "COUNT":"JUMLAH TIMBANG",
  "klik detail":"Lihat detail",
  "Item":"Barang",
  "Grand Total Barang Masuk":"Total Keseluruhan Barang Masuk",
  "Supplier & Item":"Supplier & Barang",
  "Berat Invoice Supplier (kg)":"Berat Nota Supplier (kg)",
  "Total Berat Invoice Supplier (kg)":"Total Berat Nota Supplier (kg)",
  "NOTA / BUKTI INVOICE":"NOTA / BUKTI PEMBELIAN",
  "Invoice Supplier":"Nota Supplier",
  "Invoice Item":"Berat pada Nota",
  "OWNER REVIEW":"PEMERIKSAAN OWNER",
  "Payment Method":"Metode Pembayaran",
  "Cash Status":"Status Uang Tunai",
  "Cash":"Tunai",
  "Customer Pickup":"Diambil Customer",
  "Preview foto lampiran":"Pratinjau foto lampiran",
  "Update Server":"Terakhir Diperbarui",
  "Latitude":"Garis Lintang",
  "Longitude":"Garis Bujur",
  "Owner-only":"Khusus Owner",
  "Login":"Masuk",
  "Logout":"Keluar",
  "Upload":"Unggah",
  "Download":"Unduh",
  "Restore":"Pulihkan",
  "Backup":"Cadangan",
  "Export":"Ekspor",
  "Retry":"Coba Lagi",
  "retry":"coba lagi",
  "Customer Commission • Deposit • Refund • maker-checker":"Komisi Customer • Dana Titipan • Pengembalian Dana • Pemeriksaan Berjenjang",
  "Refund":"Pengembalian Dana",
  "Deposit":"Dana Titipan",
  "Payout":"Pencairan Dana",
  "Komisi Customer Outstanding":"Sisa Komisi Customer",
  "Refund Outstanding":"Sisa Pengembalian Dana",
  "Deposit Available":"Dana Titipan Tersedia",
  "Excess Belum Diklasifikasi":"Kelebihan Dana Belum Diklasifikasi",
  "Klasifikasi Pending Owner":"Klasifikasi Menunggu Owner",
  "Payout Pending / Correction":"Pencairan Menunggu / Perlu Koreksi",
  "Cash Payout Tercatat":"Pencairan Tunai Tercatat",
  "Case":"Referensi",
  "Gross":"Nilai Setoran",
  "Actual":"Dana Diterima",
  "Reconcile":"Rekonsiliasi",
  "Actual Received":"Dana Aktual Diterima",
  "Difference Type":"Jenis Selisih",
  "Fee Bearer":"Penanggung Biaya",
  "External Ref":"Nomor Referensi",
  "Sales Ref":"Referensi Penjualan",
  "Amount":"Nominal",
  "Validate":"Validasi",
  "Confirm":"Konfirmasi",
  "ALL":"Semua",
  "PENDING_OWNER":"Menunggu Persetujuan Owner",
  "CORRECTION_REQUIRED":"Perlu Koreksi",
  "APPROVED":"Disetujui",
  "REJECTED":"Ditolak",
  "REVERSED":"Dibatalkan",
  "CONFIRMED":"Terkonfirmasi",
  "PROPOSED":"Diajukan",
  "PAID":"Sudah Dibayar",
  "PENDING":"Menunggu",
  "ERROR":"Gagal",
  "BANK_FEE":"Biaya Bank",
  "OTHER":"Lainnya",
  "NONE":"Tidak Ada",
  "BF":"Bintang Frozen",
  "LEGACY":"Catatan Lama",
  "LEGACY_MIXED":"Metode Campuran / Catatan Lama",
  "MISSING":"Belum Tercatat",
  "SETORAN_GUIDED":"Setoran Terpandu",
  "CUSTOMER_COMMISSION":"Komisi Customer",
  "CUSTOMER_DEPOSIT":"Dana Titipan Customer",
  "CUSTOMER_DEPOSIT_REFUND":"Pengembalian Dana Titipan Customer",
  "WRONG_TRANSFER_REFUND":"Pengembalian Transfer Salah",
  "handed_over":"Sudah Diserahkan",
  "carried":"Sedang Dibawa Supir",
  "delivered":"Sudah Diantar",
  "entered":"Sudah Dicatat",
  "needs_update":"Perlu Diperbarui",
  "Non-Tunai (Legacy)":"Non-Tunai (Catatan Lama)",
  "role":"peran",
  "Role":"Peran",
  "Permission":"Hak Akses"
}));

const SENTENCES=new Map(Object.entries({
  "Database/login gagal dimuat.":"Data aplikasi atau proses masuk gagal dimuat.",
  "Database belum siap. Muat ulang aplikasi.":"Data aplikasi belum siap. Muat ulang aplikasi.",
  "Supabase belum siap.":"Layanan data belum siap.",
  "Modul lokasi R13O belum siap.":"Fitur lokasi belum siap. Muat ulang aplikasi.",
  "Pastikan SQL R13O dan R13N sudah terpasang di Supabase.":"Coba muat ulang. Jika masalah berlanjut, hubungi Admin.",
  "Pastikan SQL R13O sudah dijalankan di Supabase.":"Coba muat ulang. Jika masalah berlanjut, hubungi Admin.",
  "Live Driver Location tidak dapat dimuat.":"Lokasi Driver tidak dapat dimuat.",
  "Status tidak berasal dari flag Online. Status dihitung dari timestamp lokasi terakhir. Browser/Android dapat menghentikan GPS ketika aplikasi berada di background atau perangkat membatasi lokasi.":"Status lokasi dihitung dari waktu terakhir GPS diterima. Lokasi dapat terlambat diperbarui jika aplikasi tidak aktif atau perangkat membatasi akses lokasi.",
  "Lokasi dibagikan otomatis kepada Owner selama pengantaran aktif. Tidak tersedia tombol untuk mematikan tracking dari aplikasi.":"Lokasi dibagikan otomatis kepada Owner selama pengantaran aktif. Pelacakan lokasi berhenti setelah tidak ada pengantaran aktif.",
  "Foto Bukti + fresh GPS → Cash bila Tunai → Pesanan Selesai. Langkah yang sudah sukses tidak diulang saat retry.":"Foto Bukti + lokasi GPS terbaru → catat uang tunai bila diperlukan → selesaikan pesanan. Langkah yang sudah berhasil tidak akan diulang.",
  "Catatan ini sudah terkunci oleh proses finansial. Gunakan koreksi/reversal yang sah.":"Catatan ini sudah diproses dan tidak dapat diedit langsung. Gunakan menu Koreksi atau Pembatalan yang tersedia.",
  "Semua saldo berasal dari ledger/RPC backend. Komisi Marketing lama tetap terpisah.":"Semua saldo dihitung dari transaksi yang tercatat. Komisi Marketing lama tetap terpisah.",
  "Data material berubah setelah koreksi terakhir.":"Data penting berubah setelah pemeriksaan terakhir.",
  "Real lebih rendah dari invoice":"Hasil timbang lebih rendah dari nota",
  "Real lebih tinggi dari invoice":"Hasil timbang lebih tinggi dari nota"
}));

const TECHNICAL=/\b(?:SQL|RPC|Supabase|backend|schema|migration|payload|constraint|stack trace|R13[A-Z0-9-]*|ACK|timestamp|flag Online)\b/i;
const RAW_ENUM=/^[A-Z][A-Z0-9_]{2,}$/;
const STATUS_CONTEXT=/(?:status|badge|state|method|metode|difference|selisih|type|jenis|recon|cash|payment|pembayaran|delivery|pengantaran|classification|klasifikasi|obligation|kewajiban|payout|deposit|refund)/i;
const SKIP_TAGS=new Set(["SCRIPT","STYLE","CODE","PRE","TEXTAREA"]);
const ATTRS=["placeholder","title","aria-label"];

function preserveWhitespace(original,translated){
  const left=(original.match(/^\s*/)||[""])[0],right=(original.match(/\s*$/)||[""])[0];
  return left+translated+right;
}
function coreText(value){return String(value??"").trim()}
function exact(value){
  const raw=String(value??""),core=coreText(raw);
  if(!core)return raw;
  const mapped=EXACT.get(core)||SENTENCES.get(core);
  return mapped===undefined?raw:preserveWhitespace(raw,mapped);
}
function translatePattern(value){
  const original=String(value??"");
  let core=coreText(exact(original));
  if(!core)return original;
  if(/^Login Google gagal:/i.test(core))core=core.replace(/^Login Google gagal:/i,"Gagal masuk dengan Google:");
  if(/^Logout gagal:/i.test(core))core=core.replace(/^Logout gagal:/i,"Gagal keluar:");
  if(/^Upload foto nota gagal:/i.test(core))core=core.replace(/^Upload foto nota gagal:/i,"Foto nota gagal diunggah:");
  if(/^Safe Delete menolak transaksi ini karena state sensitif:/i.test(core))core=core.replace(/^Safe Delete menolak transaksi ini karena state sensitif:/i,"Transaksi tidak dapat dihapus karena sudah memiliki proses penting yang tercatat:");
  core=core
    .replace(/\bDelivery Proof\b/g,"Bukti Pengantaran")
    .replace(/\bDelivered\b/g,"Pengantaran Selesai")
    .replace(/\bCash carried\b/g,"Uang Tunai Dibawa Supir")
    .replace(/\bCash handed_over\b/g,"Uang Tunai Sudah Diserahkan")
    .replace(/\bfresh GPS\b/gi,"lokasi GPS terbaru")
    .replace(/\bretry\b/gi,"coba lagi")
    .replace(/\bCustomer History\b/g,"Riwayat Customer")
    .replace(/\bReversal\b/g,"Pembatalan")
    .replace(/\bOwner-only\b/gi,"khusus Owner")
    .replace(/\bmaker-checker\b/gi,"pemeriksaan berjenjang")
    .replace(/\bPayment Method\b/g,"Metode Pembayaran")
    .replace(/\bCash Status\b/g,"Status Uang Tunai")
    .replace(/\bCustomer Pickup\b/g,"Diambil Customer")
    .replace(/\bUpdate Server\b/g,"Terakhir Diperbarui")
    .replace(/\bNon-Tunai \(Legacy\)\b/g,"Non-Tunai (Catatan Lama)")
    .replace(/\bPreview\b/g,"Pratinjau")
    .replace(/\bUpload\b/g,"Unggah")
    .replace(/\bDownload\b/g,"Unduh")
    .replace(/\bRestore\b/g,"Pulihkan")
    .replace(/\bBackup\b/g,"Cadangan")
    .replace(/\bExport\b/g,"Ekspor");
  if(TECHNICAL.test(core)&&/gagal|tidak dapat|belum siap|error|failed|timeout/i.test(core)){
    return preserveWhitespace(original,"Data belum dapat diproses. Coba lagi. Jika masalah berlanjut, hubungi Admin.");
  }
  return preserveWhitespace(original,core);
}
function translateStatus(value){
  const original=String(value??""),core=coreText(original);
  if(EXACT.has(core))return preserveWhitespace(original,EXACT.get(core));
  if(RAW_ENUM.test(core)&&core.includes("_"))return preserveWhitespace(original,"Status tidak dikenali");
  return translatePattern(original);
}
function statusContext(el){
  if(!el)return false;
  if(el.tagName==="OPTION")return true;
  return STATUS_CONTEXT.test([el.id,el.className,el.getAttribute?.("name"),el.getAttribute?.("data-status"),el.getAttribute?.("data-state")].filter(Boolean).join(" "));
}
function translate(value){return translatePattern(value)}

function shouldTranslateTextNode(node){
  const p=node?.parentElement;if(!p||SKIP_TAGS.has(p.tagName))return false;
  if(p.closest("[data-bf-ui-no-translate],[contenteditable='true']"))return false;
  return true;
}
function translateNode(node){
  if(node.nodeType===Node.TEXT_NODE){
    if(!shouldTranslateTextNode(node))return;
    const parent=node.parentElement,next=statusContext(parent)?translateStatus(node.nodeValue):translatePattern(node.nodeValue);
    if(next!==node.nodeValue)node.nodeValue=next;return;
  }
  if(node.nodeType!==Node.ELEMENT_NODE)return;
  const el=node;if(SKIP_TAGS.has(el.tagName)||el.matches("[data-bf-ui-no-translate],[contenteditable='true']")||el.closest("[data-bf-ui-no-translate],[contenteditable='true']"))return;
  for(const attr of ATTRS){if(el.hasAttribute(attr)){const old=el.getAttribute(attr),next=translatePattern(old);if(next!==old)el.setAttribute(attr,next)}}
  for(const child of [...el.childNodes])translateNode(child);
}
function translateTree(root=document.body){if(root)translateNode(root)}

const nativeAlert=window.alert.bind(window),nativeConfirm=window.confirm.bind(window),nativePrompt=window.prompt.bind(window);
window.alert=function(message){return nativeAlert(translatePattern(String(message??"")))};
window.confirm=function(message){return nativeConfirm(translatePattern(String(message??"")))};
window.prompt=function(message,defaultValue){return nativePrompt(translatePattern(String(message??"")),defaultValue)};

const observer=new MutationObserver(mutations=>{
  for(const m of mutations){
    if(m.type==="characterData")translateNode(m.target);
    for(const n of m.addedNodes)translateNode(n);
    if(m.type==="attributes")translateNode(m.target);
  }
});
function start(){
  translateTree(document.body);
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();

window.BFUIIndonesian={translate,translatePattern,translateTree,exactMap:EXACT,statusLabel:translateStatus};
})();
