(function(){
'use strict';
// Compatibility helper only. The canonical Setoran UI/writer is assets/js/setoran-canonical-split.js.
// Do not define BFOpenCanonicalSetoran here; this file preserves legacy helper/test contracts only.
if(window.BFSetoranGuided)return;
const n=v=>{const x=Number(String(v??'').replace(/\./g,'').replace(',','.'));return Number.isFinite(x)?x:0};
function calc(gross,notes){const total=(notes||[]).map(n).filter(x=>x>0).reduce((s,x)=>s+x,0);return{total,difference:n(gross)-total}}
function normalizeMethod(r){
 const code=String(r?.payment_method_code||'').toUpperCase();
 const dest=String(r?.destination_account||'').trim();
 if(code==='TUNAI')return{key:'TUNAI',label:'Tunai',account:''};
 if(code==='QRIS')return{key:'QRIS',label:'QRIS',account:dest};
 if(code==='TRANSFER')return{key:'TRANSFER',label:'Transfer',account:dest};
 if(code==='MIXED')return{key:'MIXED',label:'Metode Campuran',account:''};
 const raw=String(r?.metode||r?.via_bank||r?.via||'').trim();
 if(!raw)return{key:'MISSING',label:'Metode Tidak Tercatat',account:''};
 const k=raw.toUpperCase();
 if(k==='CASH'||k==='TUNAI')return{key:'TUNAI',label:'Tunai',account:''};
 if(['BCA','BNI','BRI','MANDIRI','KALBAR','BSI'].includes(k))return{key:'TRANSFER',label:'Transfer',account:k};
 if(k==='QRIS')return{key:'QRIS',label:'QRIS',account:''};
 if(k.includes('/')||k.includes('+'))return{key:'LEGACY_MIXED',label:'Metode Campuran / Catatan Lama',account:raw};
 return{key:'LEGACY',label:'Metode Catatan Lama',account:raw};
}
function businessStatus(r){
 if(r?.deleted_at||r?.cancelled_at)return'Dibatalkan';
 if(r?.commission_status==='PENDING_OWNER')return'Menunggu Konfirmasi Owner';
 if(r?.commission_status==='CORRECTION_REQUIRED')return'Perlu Koreksi Admin';
 if(r?.commission_status==='APPROVED')return'Komisi Disetujui';
 if(r?.commission_status==='REJECTED')return'Komisi Ditolak';
 if(r?.commission_status==='PAID')return'Komisi Dibayar';
 if(r?.commission_sync_status==='PENDING'||r?.commission_sync_status==='ERROR')return'Pengajuan Komisi Belum Tersinkron';
 if(r?.business_status)return r.business_status;
 if(r?.customer_funds_case_id&&r?.flow_mode!=='SETORAN_GUIDED')return'Catatan Lama / Dana Customer';
 return'Selesai — Tidak Ada Komisi';
}
window.BFSetoranGuided={normalizeMethod,businessStatus,calc};
})();
