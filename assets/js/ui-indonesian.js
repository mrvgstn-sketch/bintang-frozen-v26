(function(){
"use strict";
if(window.BFUIIndonesian)return;

/*
 * Compatibility presentation layer only.
 * Canonical renderers should use Indonesian labels directly whenever editable source exists.
 * This fallback remains necessary for the compiled react-app.js bundle and late/dynamic legacy UI.
 * It never changes IDs, dataset values, option values, storage, enums, RPC names, or canonical data.
 */

const DISPLAY=new Map(Object.entries({
  "Dashboard":"Ringkasan",
  "DASHBOARD":"RINGKASAN",
  "Pusat kontrol aplikasi":"Pusat kendali aplikasi",
  "Canonical • Customer ID • Cloud + Funds ACK":"Catatan setoran Customer • tersimpan dan tersinkron",
  "Komisi Customer • Deposit • Refund • Rekonsiliasi":"Komisi Customer • Dana Titipan • Pengembalian Dana • Rekonsiliasi",
  "Customer Commission • Deposit • Refund • maker-checker":"Komisi Customer • Dana Titipan • Pengembalian Dana • Pemeriksaan Berjenjang",
  "Koreksi • Reversal • Customer History":"Koreksi • Pembatalan • Riwayat Customer",
  "Export PDF / CSV":"Ekspor PDF / CSV",
  "Export Gabungan CSV":"Ekspor Gabungan CSV",
  "Export":"Ekspor",
  "Import":"Impor",
  "Backup":"Cadangan",
  "Backup Drive":"Cadangan Drive",
  "Backup Google Drive":"Cadangan Google Drive",
  "Full Backup & Restore":"Cadangan Lengkap & Pemulihan",
  "Restore":"Pulihkan",
  "Download":"Unduh",
  "Upload":"Unggah",
  "Preview":"Pratinjau",
  "Preview foto lampiran":"Pratinjau foto lampiran",
  "Reset Filter":"Hapus Filter",
  "Filter":"Saring",
  "Custom":"Rentang Tanggal",
  "Search":"Cari",
  "Login":"Masuk",
  "Logout":"Keluar",
  "Retry":"Coba Lagi",
  "retry":"coba lagi",
  "Staff":"Karyawan",
  "Role":"Peran",
  "role":"peran",
  "Permission":"Hak Akses",
  "Permission per fitur":"Hak akses per fitur",
  "Akun Google & role":"Akun Google & peran",
  "Approve / reject":"Setujui / Tolak",
  "Log Aktivitas":"Riwayat Aktivitas",
  "Live Driver Location":"Lokasi Supir",
  "Posisi Driver • Owner-only":"Posisi Supir • khusus Owner",
  "Owner-only":"Khusus Owner",
  "Update Server":"Terakhir Diperbarui",
  "Latitude":"Garis Lintang",
  "Longitude":"Garis Bujur",
  "TALLY SHEET PRO":"SISTEM OPERASIONAL BINTANG FROZEN",
  "TALLY SHEET":"LEMBAR TIMBANG",
  "ITEM":"BARANG",
  "QTY":"JUMLAH",
  "REAL KG":"TIMBANG KG",
  "AVG KG":"RATA-RATA",
  "COUNT":"JUMLAH TIMBANG",
  "TOTAL ITEM":"TOTAL BARANG",
  "Qty Pesanan":"Jumlah Pesanan",
  "klik detail":"Lihat detail",
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
  "Customer Pickup":"Diambil Customer",
  "Non-Tunai (Legacy)":"Non-Tunai (Catatan Lama)",
  "Customer History":"Riwayat Customer",
  "Reversal":"Pembatalan",
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
  "Ref":"Referensi",
  "Cash":"Tunai",
  "ALL":"Semua"
}));

const STATUS=new Map(Object.entries({
  "PENDING_OWNER":"Menunggu Persetujuan Owner",
  "CORRECTION_REQUIRED":"Perlu Koreksi",
  "APPROVED":"Disetujui",
  "REJECTED":"Ditolak",
  "REVERSED":"Dibatalkan",
  "CONFIRMED":"Terkonfirmasi",
  "PROPOSED":"Diajukan",
  "PAID":"Sudah Dibayar",
  "PENDING":"Menunggu",
  "PENDING_VERIFICATION":"Menunggu Verifikasi",
  "PENDING_APPROVAL":"Menunggu Persetujuan",
  "RECORDED":"Tercatat",
  "VALIDATED":"Tervalidasi",
  "ACTIVE":"Aktif",
  "INACTIVE":"Tidak Aktif",
  "OPEN":"Terbuka",
  "CLOSED":"Ditutup",
  "DRAFT":"Draf",
  "COMPLETED":"Selesai",
  "CANCELLED":"Dibatalkan",
  "CANCELED":"Dibatalkan",
  "FAILED":"Gagal",
  "ERROR":"Gagal",
  "EXCEPTION":"Perlu Pemeriksaan",
  "NO_OWNER_REQUIRED":"Tidak Memerlukan Persetujuan Owner",
  "COMMISSION_PENDING_OWNER":"Komisi Menunggu Persetujuan Owner",
  "COMMISSION_APPROVED":"Komisi Disetujui",
  "BANK_FEE":"Biaya Bank",
  "OTHER":"Lainnya",
  "NONE":"Tidak Ada",
  "MATCHED":"Cocok",
  "UNMATCHED":"Belum Cocok",
  "DIFFERENCE":"Ada Selisih",
  "INVESTIGATE":"Perlu Investigasi",
  "ON_HOLD":"Ditahan Sementara",
  "CREDIT_HOLD":"Kredit Ditahan",
  "BLACKLISTED":"Diblokir",
  "LEGACY":"Catatan Lama",
  "LEGACY_MIXED":"Metode Campuran / Catatan Lama",
  "MISSING":"Belum Tercatat",
  "SETORAN_GUIDED":"Setoran Terpandu",
  "CUSTOMER_COMMISSION":"Komisi Customer",
  "CUSTOMER_DEPOSIT":"Dana Titipan Customer",
  "CUSTOMER_DEPOSIT_REFUND":"Pengembalian Dana Titipan Customer",
  "WRONG_TRANSFER_REFUND":"Pengembalian Transfer Salah",
  "TUNAI":"Tunai",
  "TRANSFER":"Transfer",
  "QRIS":"QRIS",
  "cash":"Tunai",
  "non_cash":"Non-Tunai",
  "handed_over":"Sudah Diserahkan",
  "carried":"Sedang Dibawa Supir",
  "delivered":"Sudah Diantar",
  "entered":"Sudah Dicatat",
  "needs_update":"Perlu Diperbarui"
}));

const SENTENCES=new Map(Object.entries({
  "Database/login gagal dimuat.":"Data aplikasi atau proses masuk gagal dimuat.",
  "Database belum siap. Muat ulang aplikasi.":"Data aplikasi belum siap. Muat ulang aplikasi.",
  "Supabase belum siap.":"Layanan data belum siap. Muat ulang aplikasi.",
  "Modul lokasi R13O belum siap.":"Fitur lokasi belum siap. Muat ulang aplikasi.",
  "Pastikan SQL R13O dan R13N sudah terpasang di Supabase.":"Coba muat ulang. Jika masalah berlanjut, hubungi Admin.",
  "Pastikan SQL R13O sudah dijalankan di Supabase.":"Coba muat ulang. Jika masalah berlanjut, hubungi Admin.",
  "Live Driver Location tidak dapat dimuat.":"Lokasi Supir tidak dapat dimuat.",
  "Status tidak berasal dari flag Online. Status dihitung dari timestamp lokasi terakhir. Browser/Android dapat menghentikan GPS ketika aplikasi berada di background atau perangkat membatasi lokasi.":"Status lokasi dihitung dari waktu terakhir GPS diterima. Pembaruan lokasi dapat terlambat jika aplikasi tidak aktif atau perangkat membatasi akses lokasi.",
  "Lokasi dibagikan otomatis kepada Owner selama pengantaran aktif. Tidak tersedia tombol untuk mematikan tracking dari aplikasi.":"Lokasi dibagikan otomatis kepada Owner selama pengantaran aktif. Pelacakan lokasi berhenti setelah tidak ada pengantaran aktif.",
  "Foto Bukti + fresh GPS → Cash bila Tunai → Pesanan Selesai. Langkah yang sudah sukses tidak diulang saat retry.":"Foto Bukti + lokasi GPS terbaru → catat uang tunai bila diperlukan → selesaikan pesanan. Langkah yang sudah berhasil tidak akan diulang.",
  "Catatan ini sudah terkunci oleh proses finansial. Gunakan koreksi/reversal yang sah.":"Catatan ini sudah diproses dan tidak dapat diedit langsung. Gunakan menu Koreksi atau Pembatalan yang tersedia.",
  "Semua saldo berasal dari ledger/RPC backend. Komisi Marketing lama tetap terpisah.":"Semua saldo dihitung dari transaksi yang tercatat. Komisi Marketing lama tetap terpisah.",
  "Data material berubah setelah koreksi terakhir.":"Data penting berubah setelah pemeriksaan terakhir.",
  "Real lebih rendah dari invoice":"Hasil timbang lebih rendah dari nota",
  "Real lebih tinggi dari invoice":"Hasil timbang lebih tinggi dari nota"
}));

const TECHNICAL=/\b(?:SQL|RPC|Supabase|backend|schema|migration|payload|constraint|stack(?:\s+trace)?|R13[A-Z0-9-]*|ACK|timestamp|flag\s+Online|Postgres|PostgreSQL|database enum|internal id)\b/i;
const TECHNICAL_FAILURE=/(?:gagal|tidak dapat|belum siap|error|failed|timeout|exception|violat|not found|denied|unauthorized|forbidden)/i;
const RAW_ENUM=/^[A-Z][A-Z0-9_]{2,}$/;
const STATUS_CONTEXT=/(?:status|badge|state|method|metode|difference|diff|selisih|type|jenis|recon|cash|payment|pembayaran|delivery|pengantaran|classification|klasifikasi|obligation|kewajiban|payout|deposit|refund|commission|komisi|bearer|fee|penanggung)/i;
const LABEL_TAGS=new Set(["BUTTON","LABEL","TH","LEGEND","SUMMARY","H1","H2","H3","H4","H5","H6"]);
const SKIP_TAGS=new Set(["SCRIPT","STYLE","CODE","PRE"]);
const ATTRS=["placeholder","title","aria-label"];

function preserveWhitespace(original,translated){
  const left=(String(original).match(/^\s*/)||[""])[0],right=(String(original).match(/\s*$/)||[""])[0];
  return left+translated+right;
}
function coreText(value){return String(value??"").trim()}
function lookupDisplay(core){return DISPLAY.get(core)??SENTENCES.get(core)}
function exact(value){
  const raw=String(value??""),core=coreText(raw);if(!core)return raw;
  const mapped=lookupDisplay(core);return mapped===undefined?raw:preserveWhitespace(raw,mapped);
}
function statusLabel(value){
  const raw=String(value??""),core=coreText(raw);if(!core)return raw;
  const mapped=STATUS.get(core)??DISPLAY.get(core)??SENTENCES.get(core);
  if(mapped!==undefined)return preserveWhitespace(raw,mapped);
  if(RAW_ENUM.test(core)&&core.includes("_"))return preserveWhitespace(raw,"Status belum dikenali");
  return translatePattern(raw,true);
}
function technicalError(value){
  const raw=coreText(value);
  if(!raw)return "Terjadi kendala. Coba lagi. Jika masalah berlanjut, hubungi Admin.";
  if(TECHNICAL.test(raw)||/^[A-Z][A-Z0-9_]{3,}$/.test(raw)||/\b(?:23505|23503|42501|PGRST\d+)\b/.test(raw)){
    return "Data belum dapat diproses. Coba lagi. Jika masalah berlanjut, hubungi Admin.";
  }
  return translatePattern(raw,false);
}
function translatePattern(value,labelContext=false){
  const original=String(value??"");
  let core=coreText(exact(original));if(!core)return original;
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
    .replace(/\bExport\b/g,"Ekspor")
    .replace(/\bOutstanding\b/g,"Belum Diselesaikan")
    .replace(/\bPending Owner\b/g,"Menunggu Owner")
    .replace(/\bPending\b/g,"Menunggu")
    .replace(/\bCorrection\b/g,"Koreksi");
  if(labelContext){
    core=core
      .replace(/^Item$/i,"Barang")
      .replace(/^Qty$/i,"Jumlah")
      .replace(/^Case$/i,"Referensi")
      .replace(/^Ref$/i,"Referensi")
      .replace(/^Amount$/i,"Nominal")
      .replace(/^Actual$/i,"Dana Diterima")
      .replace(/^Gross$/i,"Nilai Setoran");
  }
  if(TECHNICAL.test(core)&&TECHNICAL_FAILURE.test(core))core="Data belum dapat diproses. Coba lagi. Jika masalah berlanjut, hubungi Admin.";
  return preserveWhitespace(original,core);
}
function tableHeaderContext(el){
  const cell=el?.closest?.("td,th");
  if(!cell||cell.tagName==="TH")return "";
  const row=cell.parentElement;
  const index=row?.children?Array.prototype.indexOf.call(row.children,cell):-1;
  if(index<0)return "";
  const table=cell.closest?.("table");
  const headerRows=table?.tHead?.rows;
  const headerRow=headerRows?.length?headerRows[headerRows.length-1]:null;
  return coreText(headerRow?.cells?.[index]?.textContent||"");
}
function fieldContext(el){
  if(!el)return "";
  const target=el.tagName==="OPTION"?el.parentElement:el;
  const own=[target?.id,typeof target?.className==="string"?target.className:"",target?.getAttribute?.("name"),target?.getAttribute?.("data-status"),target?.getAttribute?.("data-state")].filter(Boolean).join(" ");
  if(STATUS_CONTEXT.test(own))return own;
  const field=target?.closest?.(".cf-form,.nt-form,.cs-field,.bf-field,.form-group");
  const label=coreText(field?.querySelector?.("label")?.textContent||"");
  if(STATUS_CONTEXT.test(label))return label;
  return tableHeaderContext(target);
}
function statusContext(el){
  const ctx=fieldContext(el);
  return !!ctx&&STATUS_CONTEXT.test(ctx);
}
function labelContext(el){return !!el&&(LABEL_TAGS.has(el.tagName)||el.tagName==="OPTION"||statusContext(el))}
function translate(value){return translatePattern(value,false)}
function shouldTranslateTextNode(node){
  const p=node?.parentElement;if(!p||SKIP_TAGS.has(p.tagName))return false;
  if(p.closest?.("[data-bf-ui-no-translate],[contenteditable='true']"))return false;
  return true;
}
function translateNode(node){
  if(node.nodeType===Node.TEXT_NODE){
    if(!shouldTranslateTextNode(node))return;
    const parent=node.parentElement;
    const next=statusContext(parent)?statusLabel(node.nodeValue):translatePattern(node.nodeValue,labelContext(parent));
    if(next!==node.nodeValue)node.nodeValue=next;
    return;
  }
  if(node.nodeType!==Node.ELEMENT_NODE)return;
  const el=node;
  if(SKIP_TAGS.has(el.tagName)||el.matches?.("[data-bf-ui-no-translate],[contenteditable='true']")||el.closest?.("[data-bf-ui-no-translate],[contenteditable='true']"))return;
  for(const attr of ATTRS){
    if(el.hasAttribute?.(attr)){
      const old=el.getAttribute(attr),next=translatePattern(old,true);
      if(next!==old)el.setAttribute(attr,next);
    }
  }
  if(el.tagName==="INPUT"&&["button","submit","reset"].includes(String(el.type||"").toLowerCase())){
    const old=el.value,next=translatePattern(old,true);if(next!==old)el.value=next;
  }
  for(const child of [...(el.childNodes||[])])translateNode(child);
}
function translateTree(root=document.body){if(root)translateNode(root)}

const nativeAlert=window.alert?.bind(window),nativeConfirm=window.confirm?.bind(window),nativePrompt=window.prompt?.bind(window);
if(nativeAlert)window.alert=function(message){return nativeAlert(technicalError(String(message??"")))};
if(nativeConfirm)window.confirm=function(message){return nativeConfirm(translatePattern(String(message??""),true))};
if(nativePrompt)window.prompt=function(message,defaultValue){return nativePrompt(translatePattern(String(message??""),true),defaultValue)};

/*
 * Fallback observer: only for late UI generated by the compiled React bundle and legacy dynamic templates.
 * It does not write business values. Editable canonical renderers are translated at source instead.
 */
const observer=new MutationObserver(mutations=>{
  for(const m of mutations){
    if(m.type==="characterData")translateNode(m.target);
    for(const n of m.addedNodes||[])translateNode(n);
    if(m.type==="attributes")translateNode(m.target);
  }
});
function start(){
  translateTree(document.documentElement);
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();

window.BFUIIndonesian={
  translate,
  translatePattern,
  translateTree,
  exactMap:DISPLAY,
  statusMap:STATUS,
  statusLabel,
  technicalError,
  statusContext
};
})();