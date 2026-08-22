(function(){
'use strict';
if(window.BFOpenCanonicalSetoran)return;
const KEY='bf_note_setoran_v26',ID='bf-setoran-canonical';
const Core=window.BFCore;
const Store=window.BFSetoranStore;
if(!Core||!Store)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>{const x=Number(String(v??'').replace(/\./g,'').replace(',','.'));return Number.isFinite(x)?x:0};
const rp=v=>'Rp '+Math.round(n(v)).toLocaleString('id-ID');
const today=()=>new Date().toISOString().slice(0,10);
const uid=()=>crypto.randomUUID?.()||('set-'+Date.now()+'-'+Math.random().toString(16).slice(2));
const role=()=>String(window.BFCurrentUser?.()?.profile?.role||'').toLowerCase();
const owner=()=>role()==='owner';
const allowed=()=>['owner','admin'].includes(role());
const sb=()=>window.BFSupabase;
const activeCustomers=()=>Core.storage.list('bf_customers').filter(x=>!x.deleted_at&&x.active!==false&&String(x.id||x._bf_uid||'').trim()&&String(x.name||x.nama||'').trim());
const customerId=x=>String(x?.id||x?._bf_uid||'').trim();
const customerName=x=>String(x?.name||x?.nama||'').trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let editing=null,filter={from:'',to:'',customer:'',method:'ALL',status:'ALL',search:''};
function style(){if(document.getElementById('bf-setoran-guided-style'))return;const s=document.createElement('style');s.id='bf-setoran-guided-style';s.textContent=`
#${ID}{position:fixed;inset:0;z-index:2147482000;background:#f4f6fb;overflow:auto}.cs-wrap{max-width:1160px;margin:auto;padding:14px}.cs-head,.cs-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:12px}.cs-head{display:flex;gap:10px;align-items:center}.cs-head button{margin-left:auto}.cs-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.cs-field label{display:block;font-size:11px;font-weight:800;color:#475569;margin-bottom:4px}.cs-field input,.cs-field select,.cs-field textarea,.cs-btn{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;padding:9px;background:#fff;font-size:13px}.cs-btn{width:auto;font-weight:800;cursor:pointer}.cs-primary{background:#0d1b3e;color:#fff;border-color:#0d1b3e}.cs-good{background:#047857;color:#fff;border-color:#047857}.cs-warn{background:#b45309;color:#fff;border-color:#b45309}.cs-danger{background:#b91c1c;color:#fff;border-color:#b91c1c}.cs-full{grid-column:1/-1}.cs-notes{display:grid;gap:7px}.cs-note-row{display:flex;gap:7px}.cs-note-row input{flex:1}.cs-calc{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.cs-kpi{border-radius:11px;padding:10px;background:#f8fafc;border:1px solid #e2e8f0}.cs-kpi small{display:block;color:#64748b}.cs-kpi b{font-size:16px}.cs-alert{padding:9px 11px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:12px;margin-top:8px}.cs-filter{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.cs-summary{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.cs-pill{padding:5px 8px;border-radius:999px;background:#eef2ff;font-size:11px}.cs-table{width:100%;border-collapse:collapse}.cs-table th,.cs-table td{padding:8px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:11px;vertical-align:top}.cs-mobile{display:none}.cs-status{font-weight:800}.cs-pending{color:#b45309}.cs-done{color:#047857}.cs-correction{color:#b91c1c}
@media(max-width:760px){.cs-wrap{padding:9px}.cs-grid,.cs-filter,.cs-calc{grid-template-columns:1fr}.cs-full{grid-column:auto}.cs-table-wrap{display:none}.cs-mobile{display:grid;gap:8px}.cs-mobile-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:11px}.cs-filter input,.cs-filter select{min-width:0;width:100%;height:42px}.cs-note-row{align-items:center}.cs-head{position:sticky;top:0;z-index:2}.cs-kpi b{font-size:14px}}
`;document.head.appendChild(s)}
function businessStatus(r){
 if(r.commission_status==='PENDING_OWNER')return'Menunggu Konfirmasi Owner';
 if(r.commission_status==='CORRECTION_REQUIRED')return'Perlu Koreksi Admin';
 if(r.commission_status==='APPROVED')return'Komisi Disetujui';
 if(r.commission_status==='REJECTED')return'Komisi Ditolak';
 if(r.commission_status==='PAID')return'Komisi Dibayar';
 if(r.commission_sync_status==='PENDING'||r.commission_sync_status==='ERROR')return'Pengajuan Komisi Belum Tersinkron';
 if(r.business_status)return r.business_status;
 if(r.customer_funds_case_id&&r.flow_mode!=='SETORAN_GUIDED')return'Catatan Lama / Dana Customer';
 return'Selesai — Tidak Ada Komisi';
}
function normalizeMethod(r){
 const code=String(r?.payment_method_code||'').toUpperCase();
 const dest=String(r?.destination_account||'').trim();
 if(code==='TUNAI')return{key:'TUNAI',label:'Tunai',account:''};
 if(code==='QRIS')return{key:'QRIS',label:'QRIS',account:dest};
 if(code==='TRANSFER')return{key:'TRANSFER',label:'Transfer',account:dest};
 const raw=String(r?.metode||r?.via_bank||r?.via||'').trim();
 if(!raw)return{key:'MISSING',label:'Metode Tidak Tercatat',account:''};
 const k=raw.toUpperCase();
 if(k==='CASH'||k==='TUNAI')return{key:'TUNAI',label:'Tunai',account:''};
 if(['BCA','BNI','BRI','MANDIRI','KALBAR','BSI'].includes(k))return{key:'TRANSFER',label:'Transfer',account:k};
 if(k==='QRIS')return{key:'QRIS',label:'QRIS',account:''};
 if(k.includes('/')||k.includes('+'))return{key:'LEGACY_MIXED',label:'Metode Campuran / Catatan Lama',account:raw};
 return{key:'LEGACY',label:'Metode Catatan Lama',account:raw};
}
function noteAmounts(r){const a=Array.isArray(r?.settled_note_amounts)?r.settled_note_amounts.map(n).filter(x=>x>0):[];return a.length?a:[]}
function noteTotal(r){const a=noteAmounts(r);return a.length?a.reduce((s,x)=>s+x,0):n(r?.settled_note_total)}
function calc(gross,notes){const total=(notes||[]).map(n).filter(x=>x>0).reduce((s,x)=>s+x,0);return{total,difference:n(gross)-total}}
function filtered(rows){
 const q=filter.search.trim().toLowerCase(),cq=filter.customer.trim().toLowerCase();
 return rows.filter(r=>{const d=String(r.tanggal||'').slice(0,10),m=normalizeMethod(r),st=businessStatus(r);
  if(filter.from&&d<filter.from)return false;if(filter.to&&d>filter.to)return false;
  if(cq&&!String(r.customer_name_snapshot||r.customer||r.namaCustomer||'').toLowerCase().includes(cq))return false;
  if(filter.method!=='ALL'&&m.key!==filter.method)return false;
  if(filter.status!=='ALL'&&st!==filter.status)return false;
  if(q&&!([r.id,r.customer_name_snapshot,r.customer,r.namaCustomer,r.keterangan,m.label,m.account,st].join(' ').toLowerCase().includes(q)))return false;
  return true;
 })}
async function cloudAck(){
 if(!window.BFCloud?.enabled?.())return true;
 let ok=await window.BFCloud.push();if(!ok)return false;
 for(let i=0;i<12;i++){if(!window.BFCloud.isDirty?.(KEY))return true;await sleep(150)}
 return !window.BFCloud.isDirty?.(KEY)
}
async function rpc(name,args){if(!sb())throw new Error('Database belum siap. Muat ulang aplikasi.');const {data,error}=await sb().rpc(name,args);if(error)throw error;return data}
async function registerCase(row,proofUrl){
 return rpc('bf_cf_record_case',{p_source_setoran_id:String(row.id),p_customer_id:String(row.customer_id),p_customer_name:String(row.customer_name_snapshot),p_gross:n(row.gross_transfer),p_transfer_date:row.tanggal,p_actual_sender:null,p_method:row.payment_method_code||row.metode||null,p_proofs:proofUrl?[proofUrl]:[],p_note:row.keterangan||null,p_idempotency:'SETORAN:'+String(row.id)})
}
async function submitFlow(row,caseId){
 const data=await rpc('bf_cf_submit_setoran_flow',{p_case:caseId,p_customer_id:String(row.customer_id),p_customer_name:String(row.customer_name_snapshot),p_gross:n(row.gross_transfer),p_transfer_date:row.tanggal,p_payment_method:row.payment_method_code||null,p_destination_account:row.destination_account||null,p_note_amounts:row.settled_note_amounts,p_request_commission:!!row.commission_requested,p_agreement:row.commission_agreement||null,p_idempotency:'SETORAN-COMMISSION:'+String(row.id)});
 return data;
}
function modalCustomer(select){
 document.getElementById('bf-active-customer-picker')?.remove();const all=activeCustomers(),o=document.createElement('div');o.id='bf-active-customer-picker';o.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#0f172acc;display:flex;align-items:center;justify-content:center;padding:12px';o.innerHTML=`<div style="width:min(620px,96vw);max-height:86vh;background:#fff;border-radius:15px;overflow:hidden"><div style="padding:12px 14px;background:#0d1b3e;color:#fff;display:flex;justify-content:space-between"><div><b>Pilih Customer Aktif</b><small style="display:block">Hanya dari Data Master Customer aktif</small></div><button data-close>✕</button></div><div style="padding:12px"><input data-q type="search" placeholder="Cari nama / kontak..." style="width:100%;box-sizing:border-box;padding:10px"><div data-list style="max-height:55vh;overflow:auto;margin-top:8px"></div></div></div>`;document.body.appendChild(o);const q=o.querySelector('[data-q]'),list=o.querySelector('[data-list]');const draw=()=>{const s=q.value.toLowerCase();list.innerHTML=all.filter(c=>!s||[customerName(c),c.wa,c.phone,c.contact,c.alamat,c.address].some(v=>String(v||'').toLowerCase().includes(s))).map(c=>`<button data-id="${esc(customerId(c))}" style="display:block;width:100%;text-align:left;padding:10px;margin:4px 0;border:1px solid #e2e8f0;border-radius:9px;background:#fff"><b>${esc(customerName(c))}</b><small style="display:block;color:#64748b">${esc(c.wa||c.phone||c.contact||'Tanpa kontak')}</small></button>`).join('')||'<div style="padding:16px;text-align:center">Tidak ada Customer aktif.</div>'};o.onclick=e=>{if(e.target===o||e.target.closest('[data-close]'))return o.remove();const b=e.target.closest('[data-id]');if(!b)return;select.value=b.dataset.id;select.dispatchEvent(new Event('change',{bubbles:true}));o.remove()};q.oninput=draw;draw();q.focus()}
function shell(){document.getElementById(ID)?.remove();style();const el=document.createElement('div');el.id=ID;el.innerHTML=`<div class="cs-wrap"><div class="cs-head"><div><b>Catatan Setoran</b><small style="display:block;color:#64748b">Setoran Customer • Komisi dihitung sistem • Bahasa operasional sederhana</small></div><button class="cs-btn" data-close>✕ Tutup</button></div><div id="cs-body"></div></div>`;document.body.appendChild(el);el.querySelector('[data-close]').onclick=()=>el.remove();return el}
function render(){
 const el=document.getElementById(ID)||shell(),body=el.querySelector('#cs-body');
 const rows=Store.list().filter(x=>!x.deleted_at).sort((a,b)=>String(b.tanggal||'').localeCompare(String(a.tanggal||''))||String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
 const r=editing?rows.find(x=>x.id===editing)||{}:{};
 const oldNotes=noteAmounts(r);const notes=oldNotes.length?oldNotes:[0];
 const lock=!!r.id&&(r.commission_status==='APPROVED'||r.commission_status==='PAID'||(r.customer_funds_case_id&&r.flow_mode!=='SETORAN_GUIDED'));
 const methods=[['TUNAI','Tunai'],['TRANSFER','Transfer'],['QRIS','QRIS']];
 const selectedMethod=String(r.payment_method_code||'').toUpperCase()||normalizeMethod(r).key;
 const customers=activeCustomers();
 const methodsInHistory=[...new Map(rows.map(x=>{const m=normalizeMethod(x);return[m.key,m.label]}))];
 const statuses=[...new Set(rows.map(businessStatus))].sort();
 body.innerHTML=`<div class="cs-card"><h3 style="margin-top:0">${r.id?'Edit Setoran':'Tambah Setoran'}</h3>${lock?'<div class="cs-alert">Catatan ini sudah terkunci oleh proses finansial. Gunakan koreksi/reversal yang sah.</div>':''}<div class="cs-grid">
 <div class="cs-field"><label>Tanggal</label><input id="cs-date" type="date" value="${esc(r.tanggal||today())}" ${lock?'disabled':''}></div>
 <div class="cs-field"><label>Customer</label><select id="cs-customer" ${lock?'disabled':''}><option value="">Pilih Customer...</option>${customers.map(c=>`<option value="${esc(customerId(c))}" ${String(r.customer_id||'')===customerId(c)?'selected':''}>${esc(customerName(c))}</option>`).join('')}</select></div>
 <div class="cs-field"><label>Nominal Setoran</label><input id="cs-gross" inputmode="numeric" value="${esc(r.gross_transfer??r.nominal??r.jumlah??'')}" ${lock?'disabled':''}></div>
 <div class="cs-field"><label>Metode Pembayaran</label><select id="cs-method" ${lock?'disabled':''}><option value="">Pilih...</option>${methods.map(([k,l])=>`<option value="${k}" ${selectedMethod===k?'selected':''}>${l}</option>`).join('')}</select></div>
 <div class="cs-field"><label>Rekening Tujuan (khusus Transfer)</label><input id="cs-dest" value="${esc(r.destination_account||normalizeMethod(r).account||'')}" placeholder="BCA / BNI / BRI / Mandiri..." ${lock?'disabled':''}></div>
 <div class="cs-field"><label>Bukti Transfer (opsional)</label><input id="cs-proof" type="file" accept="image/*" ${lock?'disabled':''}></div>
 <div class="cs-field cs-full"><label>Nota yang Sudah Lunas — nilai saja, boleh lebih dari satu</label><div class="cs-notes" id="cs-notes"></div><button type="button" class="cs-btn" id="cs-add-note" ${lock?'disabled':''}>＋ Tambah Nota Lunas</button></div>
 <div class="cs-field cs-full"><label>Keterangan</label><textarea id="cs-note" ${lock?'disabled':''}>${esc(r.keterangan||'')}</textarea></div>
 <div class="cs-field cs-full"><div class="cs-calc"><div class="cs-kpi"><small>Total Nota Lunas</small><b id="cs-note-total">Rp 0</b></div><div class="cs-kpi"><small>Selisih Terhitung</small><b id="cs-diff">Rp 0</b></div><div class="cs-kpi"><small>Komisi Diajukan</small><b id="cs-commission">Rp 0</b></div></div></div>
 <div class="cs-field cs-full"><label><input id="cs-request-commission" type="checkbox" style="width:auto" ${r.commission_requested?'checked':''} ${lock?'disabled':''}> Ajukan kelebihan sebagai Komisi Customer</label><small style="color:#64748b">Nominal Komisi tidak dapat diedit; dihitung otomatis dari selisih.</small></div>
 <div class="cs-field cs-full" id="cs-agreement-wrap"><label>Catatan / Kesepakatan Komisi</label><textarea id="cs-agreement" ${lock?'disabled':''}>${esc(r.commission_agreement||'')}</textarea></div>
 </div><div style="display:flex;gap:8px;margin-top:12px"><button class="cs-btn cs-primary" id="cs-save" ${lock?'disabled':''}>${r.id?'Simpan Koreksi':'Simpan Setoran'}</button>${r.id?'<button class="cs-btn" id="cs-cancel">Batal Edit</button>':''}</div></div>
 <div class="cs-card"><h3 style="margin-top:0">Histori Setoran</h3><div class="cs-filter">
 <div class="cs-field"><label>Dari Tanggal</label><input data-f="from" type="date" value="${esc(filter.from)}"></div><div class="cs-field"><label>Sampai Tanggal</label><input data-f="to" type="date" value="${esc(filter.to)}"></div>
 <div class="cs-field"><label>Customer</label><input data-f="customer" value="${esc(filter.customer)}" placeholder="Cari Customer"></div>
 <div class="cs-field"><label>Metode</label><select data-f="method"><option value="ALL">Semua Metode</option>${methodsInHistory.map(([k,l])=>`<option value="${esc(k)}" ${filter.method===k?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
 <div class="cs-field"><label>Status</label><select data-f="status"><option value="ALL">Semua Status</option>${statuses.map(s=>`<option ${filter.status===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
 <div class="cs-field"><label>Pencarian</label><input data-f="search" value="${esc(filter.search)}" placeholder="Customer / keterangan"></div>
 </div><button class="cs-btn" id="cs-reset" style="margin-top:8px">Reset Filter</button><div id="cs-history"></div></div>`;
 let currentNotes=[...notes];
 const notesEl=body.querySelector('#cs-notes');
 function drawNotes(){notesEl.innerHTML=currentNotes.map((v,i)=>`<div class="cs-note-row"><input inputmode="numeric" data-note="${i}" value="${v?esc(v):''}" placeholder="Nilai Nota ${i+1}" ${lock?'disabled':''}><button type="button" class="cs-btn" data-del-note="${i}" ${currentNotes.length<=1||lock?'disabled':''}>✕</button></div>`).join('');notesEl.querySelectorAll('[data-note]').forEach(x=>x.oninput=()=>{currentNotes[Number(x.dataset.note)]=n(x.value);updateCalc()});notesEl.querySelectorAll('[data-del-note]').forEach(x=>x.onclick=()=>{currentNotes.splice(Number(x.dataset.delNote),1);drawNotes();updateCalc()})}
 function updateCalc(){const c=calc(body.querySelector('#cs-gross').value,currentNotes),req=body.querySelector('#cs-request-commission');body.querySelector('#cs-note-total').textContent=rp(c.total);body.querySelector('#cs-diff').textContent=rp(c.difference);if(c.difference<=0&&req.checked)req.checked=false;req.disabled=lock||c.difference<=0;body.querySelector('#cs-commission').textContent=rp(req.checked?c.difference:0);body.querySelector('#cs-agreement-wrap').style.display=req.checked?'block':'none'}
 drawNotes();updateCalc();
 body.querySelector('#cs-add-note').onclick=()=>{currentNotes.push(0);drawNotes();updateCalc()};
 body.querySelector('#cs-gross').oninput=updateCalc;body.querySelector('#cs-request-commission').onchange=updateCalc;
 const cust=body.querySelector('#cs-customer');if(!lock){cust.style.display='none';const b=document.createElement('button');b.type='button';b.className='cs-btn';b.id='cs-customer-pic';const selected=customers.find(c=>customerId(c)===cust.value);b.textContent=selected?customerName(selected):'Pilih Customer Aktif';cust.after(b);b.onclick=()=>modalCustomer(cust);cust.onchange=()=>{const c=customers.find(x=>customerId(x)===cust.value);b.textContent=c?customerName(c):'Pilih Customer Aktif'}}
 if(body.querySelector('#cs-cancel'))body.querySelector('#cs-cancel').onclick=()=>{editing=null;render()};
 body.querySelector('#cs-save').onclick=()=>save(currentNotes);
 body.querySelectorAll('[data-f]').forEach(x=>{const ev=x.type==='text'?'input':'change';x.addEventListener(ev,()=>{filter[x.dataset.f]=x.value;renderHistory(rows)})});
 body.querySelector('#cs-reset').onclick=()=>{filter={from:'',to:'',customer:'',method:'ALL',status:'ALL',search:''};render()};
 renderHistory(rows);
}
function renderHistory(rows){
 const el=document.getElementById('cs-history');if(!el)return;const list=filtered(rows),total=list.reduce((s,r)=>s+n(r.gross_transfer??r.nominal??r.jumlah),0),methodTotals=new Map();
 list.forEach(r=>{const m=normalizeMethod(r),v=methodTotals.get(m.label)||0;methodTotals.set(m.label,v+n(r.gross_transfer??r.nominal??r.jumlah))});
 const summary=`<div class="cs-summary"><span class="cs-pill"><b>${list.length}</b> Setoran</span><span class="cs-pill"><b>${rp(total)}</b> Total</span>${[...methodTotals].map(([k,v])=>`<span class="cs-pill">${esc(k)}: <b>${rp(v)}</b></span>`).join('')}</div>`;
 const row=r=>{const m=normalizeMethod(r),st=businessStatus(r),nt=noteTotal(r),comm=n(r.commission_final??r.commission_amount_calculated??0);return`<tr><td>${esc(r.tanggal||'-')}</td><td><b>${esc(r.customer_name_snapshot||r.customer||r.namaCustomer||'-')}</b></td><td>${rp(r.gross_transfer??r.nominal??r.jumlah)}</td><td>${esc(m.label)}${m.account?'<br><small>'+esc(m.account)+'</small>':''}</td><td>${nt?rp(nt):'Catatan Lama'}</td><td class="cs-status ${st.includes('Menunggu')?'cs-pending':st.includes('Koreksi')?'cs-correction':'cs-done'}">${esc(st)}${comm?'<br><small>Komisi '+rp(comm)+'</small>':''}</td><td>${actions(r)}</td></tr>`};
 const card=r=>{const m=normalizeMethod(r),st=businessStatus(r),nt=noteTotal(r),comm=n(r.commission_final??r.commission_amount_calculated??0);return`<div class="cs-mobile-card"><div style="display:flex;justify-content:space-between"><b>${esc(r.customer_name_snapshot||r.customer||r.namaCustomer||'-')}</b><b>${rp(r.gross_transfer??r.nominal??r.jumlah)}</b></div><small>${esc(r.tanggal||'-')} • ${esc(m.label)}${m.account?' • '+esc(m.account):''}</small><div style="margin-top:7px">Nota Lunas: ${nt?rp(nt):'Informasi tidak tersedia pada catatan lama'}</div>${r.commission_requested?`<div>Komisi: <b>${rp(comm||r.commission_amount_calculated)}</b></div>`:''}<div class="cs-status ${st.includes('Menunggu')?'cs-pending':st.includes('Koreksi')?'cs-correction':'cs-done'}">${esc(st)}</div><div style="margin-top:8px">${actions(r)}</div></div>`};
 el.innerHTML=summary+`<div class="cs-table-wrap"><table class="cs-table"><thead><tr><th>Tanggal</th><th>Customer</th><th>Nominal Setoran</th><th>Metode</th><th>Total Nota Lunas</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${list.map(row).join('')||'<tr><td colspan="7">Tidak ada Setoran sesuai filter.</td></tr>'}</tbody></table></div><div class="cs-mobile">${list.map(card).join('')||'<div class="cs-mobile-card">Tidak ada Setoran sesuai filter.</div>'}</div>`;
 el.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{editing=b.dataset.edit;render()});
 el.querySelectorAll('[data-retry]').forEach(b=>b.onclick=()=>retryFlow(b.dataset.retry));
 el.querySelectorAll('[data-owner]').forEach(b=>b.onclick=()=>ownerDecision(b.dataset.owner));
}
function actions(r){
 let out='';
 const editable=!r.id?false:(!r.commission_status||['CORRECTION_REQUIRED','REJECTED'].includes(r.commission_status))&&(!r.customer_funds_case_id||r.flow_mode==='SETORAN_GUIDED');
 if(editable)out+=`<button class="cs-btn" data-edit="${esc(r.id)}">Edit</button> `;
 if(r.commission_sync_status==='PENDING'||r.commission_sync_status==='ERROR')out+=`<button class="cs-btn cs-warn" data-retry="${esc(r.id)}">Retry Komisi</button> `;
 if(owner()&&r.commission_status==='PENDING_OWNER'&&r.commission_classification_id)out+=`<button class="cs-btn cs-good" data-owner="${esc(r.id)}">Konfirmasi Komisi</button>`;
 return out||'—';
}
async function uploadProof(file,rowId){if(!file)return'';if(!window.BFPhotoStorage)return'';const up=await window.BFPhotoStorage.uploadFile(file,{transactionNo:String(rowId),supplier:'bukti-setoran'});return up?.url||''}
async function save(notes){
 const body=document.getElementById('cs-body'),id=editing||uid(),old=editing?Store.list().find(x=>x.id===editing):null,customer=activeCustomers().find(c=>customerId(c)===body.querySelector('#cs-customer').value);
 if(!customer)return alert('Customer wajib dipilih dari Data Master Customer yang masih aktif.');
 const gross=n(body.querySelector('#cs-gross').value),validNotes=notes.map(n).filter(x=>x>0),c=calc(gross,validNotes),method=body.querySelector('#cs-method').value,request=body.querySelector('#cs-request-commission').checked,agreement=body.querySelector('#cs-agreement').value.trim();
 if(gross<=0)return alert('Nominal Setoran harus lebih dari 0.');if(!validNotes.length)return alert('Masukkan minimal satu nilai Nota yang sudah lunas.');if(!method)return alert('Pilih Metode Pembayaran.');
 if(method==='TRANSFER'&&!body.querySelector('#cs-dest').value.trim())return alert('Isi Rekening Tujuan untuk pembayaran Transfer.');
 if(request&&c.difference<=0)return alert('Komisi hanya dapat diajukan jika ada kelebihan Setoran.');if(request&&!agreement)return alert('Catatan/Kesepakatan wajib untuk pengajuan Komisi.');
 const file=body.querySelector('#cs-proof').files?.[0],proof=await uploadProof(file,id);
 const row={...(old||{}),id,tanggal:body.querySelector('#cs-date').value,customer_id:customerId(customer),customer_name_snapshot:customerName(customer),gross_transfer:gross,actual_sender:null,payment_method_code:method,destination_account:method==='TRANSFER'?body.querySelector('#cs-dest').value.trim():'',metode:method,settled_note_amounts:validNotes,settled_note_total:c.total,difference_amount:c.difference,commission_requested:request,commission_amount_calculated:request?c.difference:0,commission_agreement:request?agreement:null,commission_status:request?'PENDING_OWNER':null,business_status:request?'Menunggu Konfirmasi Owner':'Selesai — Tidak Ada Komisi',flow_mode:'SETORAN_GUIDED',keterangan:body.querySelector('#cs-note').value.trim(),bukti_foto:proof||old?.bukti_foto||null,updated_at:new Date().toISOString()};
 const before=Store.list();try{Store.write(before.filter(x=>x.id!==id).concat(row));if(!(await cloudAck()))throw new Error('GAGAL / BELUM TERSINKRON — Setoran belum mendapat ACK cloud.');
  let caseData=row.customer_funds_case_id?{id:row.customer_funds_case_id,case_no:row.customer_funds_case_no}:await registerCase(row,proof);
  const caseObj=Array.isArray(caseData)?caseData[0]:caseData;row.customer_funds_case_id=caseObj?.id||caseObj?.case_id||row.customer_funds_case_id;row.customer_funds_case_no=caseObj?.case_no||row.customer_funds_case_no;
  try{const flow=await submitFlow(row,row.customer_funds_case_id),f=Array.isArray(flow)?flow[0]:flow;row.commission_classification_id=f?.classification_id||null;row.commission_status=f?.classification_status||null;row.business_status=request?'Menunggu Konfirmasi Owner':'Selesai — Tidak Ada Komisi';row.commission_sync_status='SYNCED'}catch(e){row.commission_sync_status='ERROR';row.commission_sync_error=e.message||String(e)}
  Store.write(Store.list().filter(x=>x.id!==id).concat(row));await cloudAck();editing=null;render();
  if(row.commission_sync_status==='ERROR')alert('Setoran tersimpan, tetapi pengajuan Komisi belum tersinkron. Gunakan Retry Komisi.');else alert(request?'Setoran tersimpan dan Komisi diajukan ke Owner.':'Setoran tersimpan. Tidak memerlukan konfirmasi Owner.');
 }catch(e){Store.write(before);await window.BFCloud?.push?.();alert(e.message||String(e))}
}
async function retryFlow(id){const row=Store.list().find(x=>x.id===id);if(!row)return;try{let caseId=row.customer_funds_case_id;if(!caseId){const c=await registerCase(row,row.bukti_foto);caseId=(Array.isArray(c)?c[0]:c)?.id}const flow=await submitFlow(row,caseId),f=Array.isArray(flow)?flow[0]:flow;const next={...row,customer_funds_case_id:caseId,commission_classification_id:f?.classification_id||row.commission_classification_id,commission_status:f?.classification_status||row.commission_status,commission_sync_status:'SYNCED',commission_sync_error:null};Store.write(Store.list().filter(x=>x.id!==id).concat(next));await cloudAck();render()}catch(e){alert(e.message||String(e))}}
async function ownerDecision(id){const row=Store.list().find(x=>x.id===id);if(!row||!owner())return;const has=confirm('Apakah transaksi ini memiliki potongan admin bank?\nOK = Ada potongan\nBatal = Tidak ada potongan');let fee=0,bearer='NONE';if(has){fee=n(prompt('Nominal potongan admin bank:','0'));if(fee<0)return;const customerBears=confirm('Siapa yang menanggung potongan?\nOK = Customer (mengurangi Komisi)\nBatal = Bintang Frozen (Komisi Customer tetap penuh)');bearer=customerBears?'CUSTOMER':'BF'}const correction=confirm('Pilih tindakan:\nOK = Konfirmasi Komisi\nBatal = Minta Koreksi Admin');let action=correction?'APPROVE':'CORRECTION_REQUIRED',note=null;if(action==='CORRECTION_REQUIRED'){note=prompt('Alasan koreksi (wajib):','')||'';if(!note.trim())return alert('Alasan koreksi wajib.')}else note=prompt('Catatan Owner (opsional):','')||null;try{const d=await rpc('bf_cf_decide_setoran_commission',{p_classification:row.commission_classification_id,p_action:action,p_bank_fee:fee,p_fee_bearer:bearer,p_note:note}),x=Array.isArray(d)?d[0]:d;const next={...row,commission_status:action==='APPROVE'?'APPROVED':'CORRECTION_REQUIRED',business_status:action==='APPROVE'?'Komisi Disetujui':'Perlu Koreksi Admin',owner_bank_fee_amount:fee,owner_bank_fee_bearer:bearer,commission_final:n(x?.commission_final)};Store.write(Store.list().filter(x=>x.id!==id).concat(next));await cloudAck();render();window.BFRenderDashboardEnhancements?.()}catch(e){alert(e.message||String(e))}}
function open(){if(!allowed())return alert('Akses Catatan Setoran hanya untuk Owner/Admin.');shell();render()}
window.BFOpenCanonicalSetoran=open;
window.BFSetoranGuided={normalizeMethod,businessStatus,calc,filtered:rows=>filtered(rows)};
})();
