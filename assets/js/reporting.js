(function(){
"use strict";
const {esc,can,deny,storage}=window.BFCore;
const list=k=>storage.list(k).filter(x=>x&&!x.deleted_at);
const num=v=>{const n=Number(String(v??0).replace(/\./g,"").replace(",","."));return Number.isFinite(n)?n:0};
const money=v=>"Rp "+Math.round(num(v)).toLocaleString("id-ID");
const dateOf=r=>String(r?.tanggal||r?.date||r?.dateISO||r?.created_at||r?.updated_at||"").slice(0,10);
const dt=r=>{const raw=r?.updated_at||r?.created_at||r?.tanggal||r?.date||"";if(!raw)return "-";const d=new Date(raw);return Number.isNaN(d.getTime())?String(raw):d.toLocaleString("id-ID")};
const actor=r=>String(r?.updated_by||r?.created_by||r?.actor_email||r?.actor_name||"-");
const weight=v=>{const n=Number(String(v??0).trim().replace(",","."));return Number.isFinite(n)?n:0};
const weights=r=>Array.isArray(r?.timbangan)?r.timbangan:Array.isArray(r?.weights)?r.weights:[];
const kg=r=>weights(r).reduce((s,x)=>s+weight(x),0);
const uid=(r,prefix="row")=>String(r?.id||r?._bf_uid||r?.transaction_no||`${prefix}:${dateOf(r)}:${actor(r)}:${JSON.stringify(r).slice(0,80)}`);
const photos=v=>Array.isArray(v)?v.filter(Boolean):(typeof v==="string"&&v?[v]:[]);
const photoCount=r=>photos(r?.bukti_fotos||r?.nota_fotos||r?.bukti_foto||r?.nota_foto).length+
  (Array.isArray(r?.suppliers)?r.suppliers.reduce((n,g)=>n+photos(g?.nota_fotos||g?.nota_foto).length,0):0);
const dedupe=(rows,prefix)=>{const seen=new Set();return rows.filter(r=>{const id=uid(r,prefix);if(seen.has(id))return false;seen.add(id);return true})};
function rangeRows(rows,from,to){return rows.filter(r=>{const d=dateOf(r);return (!from||d>=from)&&(!to||d<=to)})}
function customerGroups(r){
  const legacy=r?.marketing||r?.marketingNama||r?.staff||r?.sales||"";
  if(Array.isArray(r?.customers)&&r.customers.length)return r.customers.map(g=>({...g,marketing:g?.marketing||g?.marketingNama||legacy||""}));
  return r?.customer||r?.item?[{customer:r.customer||"",marketing:legacy,items:[{item:r.item||"",qty:r.qty||"",satuan:r.satuan||"",timbangan:weights(r)}]}]:[];
}
function supplierGroups(r){
  if(Array.isArray(r?.suppliers)&&r.suppliers.length)return r.suppliers;
  return r?.supplier||r?.item?[{supplier:r.supplier||"",nota_fotos:photos(r.nota_fotos||r.nota_foto),items:[{item:r.item||"",timbangan:weights(r)}]}]:[];
}
function groupKg(g){return (g?.items||[]).flatMap(i=>i?.timbangan||i?.weights||[]).reduce((s,x)=>s+weight(x),0)}
function uniqueFinance(){
  const expenses=dedupe([...list("bf_expenses"),...list("bf_note_pengeluaran_v26")],"expense");
  return {expenses,deposits:dedupe(list("bf_note_setoran_v26"),"deposit"),groceries:dedupe(list("bf_note_sembako_v26"),"grocery")};
}
function dataset(from,to){
  const masuk=rangeRows(dedupe(list("bf_masuk_v26"),"in"),from,to);
  const keluar=rangeRows(dedupe(list("bf_keluar_v26"),"out"),from,to);
  const f=uniqueFinance();
  const expenses=rangeRows(f.expenses,from,to),deposits=rangeRows(f.deposits,from,to),groceries=rangeRows(f.groceries,from,to);
  const employees=list("bf_employees");
  const rate=name=>num(employees.find(x=>x?.active!==false&&String(x.name||x.email||"").toLowerCase()===String(name||"").toLowerCase())?.commission||0);
  const commissionTotal=keluar.reduce((total,r)=>total+customerGroups(r).reduce((s,g)=>{const rr=num(g.commission_per_kg||rate(g.marketing));return s+groupKg(g)*rr},0),0);
  return {masuk,keluar,expenses,deposits,groceries,commissionTotal,
    kgIn:masuk.reduce((s,r)=>s+kg(r),0),kgOut:keluar.reduce((s,r)=>s+kg(r),0),
    expenseTotal:expenses.reduce((s,r)=>s+num(r.nominal??r.total??r.jumlah),0),
    depositTotal:deposits.reduce((s,r)=>s+num(r.nominal??r.total??r.jumlah),0),
    groceryTotal:groceries.reduce((s,r)=>s+num(r.nominal??r.total??r.jumlah),0)};
}
function shell(id,title,sub){
  document.getElementById(id)?.remove();const p=document.createElement("div");p.id=id;p.className="bf-op-page bf-report-page";
  p.innerHTML=`<div class="bf-op-wrap"><div class="bf-op-head"><button class="bf-op-back">← Kembali</button><div><h2>${esc(title)}</h2><small>${esc(sub)}</small></div></div><div class="bf-report-content"></div></div>`;
  document.body.appendChild(p);p.querySelector(".bf-op-back").onclick=()=>p.remove();return p;
}
const metric=(label,value,sub,tone="")=>`<div class="bf-report-metric ${tone}"><span>${esc(label)}</span><b>${value}</b><small>${esc(sub||"")}</small></div>`;
const badge=t=>`<span class="bf-report-badge">${esc(t)}</span>`;
function incomingRows(rows){return rows.flatMap(r=>supplierGroups(r).map(g=>({tx:r,no:r.transaction_no||"-",supplier:g.supplier||"-",driver:r.supir||r.driver||"-",items:(g.items||[]).map(i=>i.item).filter(Boolean).join(", ")||"-",kg:groupKg(g),shipping:num(r.ongkos_kirim??r.shipping_cost),photos:photos(g.nota_fotos||g.nota_foto).length})))}
function outgoingRows(rows){return rows.flatMap(r=>customerGroups(r).map(g=>({tx:r,no:r.transaction_no||"-",customer:g.customer||"-",marketing:g.marketing||"",items:(g.items||[]).map(i=>i.item).filter(Boolean).join(", ")||"-",qty:(g.items||[]).map(i=>`${i.qty||"-"} ${i.satuan||""}`.trim()).join(", "),kg:groupKg(g)})))}
function issues(d){
  const out=[];
  incomingRows(d.masuk).forEach(x=>{if(!x.supplier||x.supplier==="-")out.push({type:"Barang Masuk",no:x.no,msg:"Supplier belum diisi"});if(x.kg<=0)out.push({type:"Barang Masuk",no:x.no,msg:"Berat/Tally masih 0"})});
  outgoingRows(d.keluar).forEach(x=>{if(!x.customer||x.customer==="-")out.push({type:"Barang Keluar",no:x.no,msg:"Customer belum diisi"});if(!x.marketing)out.push({type:"Barang Keluar",no:x.no,msg:`Marketing Customer ${x.customer} belum diisi`});if(x.kg<=0)out.push({type:"Barang Keluar",no:x.no,msg:`Berat/Tally Customer ${x.customer} masih 0`})});
  [...d.masuk,...d.keluar].forEach(r=>{if(Number(r._bf_version||1)>1)out.push({type:"Revisi",no:r.transaction_no||"-",msg:`Versi ${r._bf_version} • terakhir ${actor(r)}`})});
  return out;
}
function actorSummary(d,audits=[]){
  const map=new Map(),add=(name,type)=>{name=String(name||"-");if(!map.has(name))map.set(name,{name,total:0,in:0,out:0,finance:0,audit:0});const x=map.get(name);x.total++;if(type==="in")x.in++;else if(type==="out")x.out++;else if(type==="audit")x.audit++;else x.finance++};
  d.masuk.forEach(r=>add(actor(r),"in"));d.keluar.forEach(r=>add(actor(r),"out"));
  [...d.expenses,...d.deposits,...d.groceries].forEach(r=>add(actor(r),"finance"));audits.forEach(r=>add(r.actor_email||r.actor_role||"-","audit"));
  return [...map.values()].sort((a,b)=>b.total-a.total);
}
async function fetchAudit(from,to){
  const sb=window.BFSupabase, role=String(window.BFCurrentUser?.()?.profile?.role||"").toLowerCase();
  if(!sb||role!=="owner")return [];
  try{let q=sb.from("bf_audit_logs").select("created_at,actor_email,actor_role,action,entity_type,entity_id,metadata").order("created_at",{ascending:false}).limit(500);
    if(from)q=q.gte("created_at",from+"T00:00:00");if(to)q=q.lte("created_at",to+"T23:59:59.999");
    const {data,error}=await q;if(error)throw error;return Array.isArray(data)?data:[]}
  catch(_){return []}
}
function table(headers,body,empty="Tidak ada data pada periode ini."){
  return `<div class="bf-report-table-wrap"><table class="bf-report-table"><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${body||`<tr><td colspan="${headers.length}">${esc(empty)}</td></tr>`}</tbody></table></div>`;
}
async function renderReport(p,from,to){
  const box=p.querySelector(".bf-report-content"),d=dataset(from,to),audits=await fetchAudit(from,to),alerts=issues(d),staff=actorSummary(d,audits),ins=incomingRows(d.masuk),outs=outgoingRows(d.keluar);
  const net=d.depositTotal-d.expenseTotal-d.groceryTotal-d.commissionTotal;
  box.innerHTML=`
  <div class="bf-report-toolbar bf-owner-report-filter">
    <label>Dari <input id="bfr-from" type="date" value="${esc(from)}"></label>
    <label>Sampai <input id="bfr-to" type="date" value="${esc(to)}"></label>
    <button id="bfr-apply">Terapkan</button><button id="bfr-today">Hari Ini</button><button id="bfr-history">Histori Rinci</button>
  </div>
  <section class="bf-report-section"><div class="bf-report-title"><h3>Kontrol Owner</h3><span>${esc(from)} s/d ${esc(to)}</span></div>
    <div class="bf-report-metrics">${metric("Barang Masuk",d.kgIn.toLocaleString("id-ID")+" kg",d.masuk.length+" transaksi","good")}${metric("Barang Keluar",d.kgOut.toLocaleString("id-ID")+" kg",d.keluar.length+" transaksi","info")}${metric("Setoran",money(d.depositTotal),d.deposits.length+" catatan","good")}${metric("Pengeluaran + Sembako",money(d.expenseTotal+d.groceryTotal),(d.expenses.length+d.groceries.length)+" catatan","warn")}${metric("Estimasi Komisi",money(d.commissionTotal),"Marketing per Customer")}${metric("Perlu Diperiksa",String(alerts.length),"berdasarkan data yang tersedia",alerts.length?"warn":"good")}</div>
  </section>
  <section class="bf-report-section"><div class="bf-report-title"><h3>Pekerjaan per Karyawan</h3><span>Transaksi bisnis dan audit dipisahkan</span></div>${table(["Karyawan","Barang Masuk","Barang Keluar","Keuangan","Aktivitas Audit","Total"],staff.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${x.in}</td><td>${x.out}</td><td>${x.finance}</td><td>${x.audit}</td><td><b>${x.total}</b></td></tr>`).join(""))}</section>
  <section class="bf-report-section"><div class="bf-report-title"><h3>Barang Masuk Rinci</h3><span>${ins.length} supplier/group</span></div>${table(["Waktu","No","Admin","Supplier","Supir","Item","Berat","Ongkir","Foto","Versi"],ins.map(x=>`<tr><td>${esc(dt(x.tx))}</td><td><b>${esc(x.no)}</b></td><td>${esc(actor(x.tx))}</td><td>${esc(x.supplier)}</td><td>${esc(x.driver)}</td><td>${esc(x.items)}</td><td>${x.kg.toLocaleString("id-ID")} kg</td><td>${money(x.shipping)}</td><td>${x.photos}</td><td>${Number(x.tx._bf_version||1)}</td></tr>`).join(""))}</section>
  <section class="bf-report-section"><div class="bf-report-title"><h3>Barang Keluar Rinci</h3><span>Marketing ditampilkan per Customer</span></div>${table(["Waktu","No","Admin","Customer","Marketing","Item","Qty","Berat","Versi"],outs.map(x=>`<tr><td>${esc(dt(x.tx))}</td><td><b>${esc(x.no)}</b></td><td>${esc(actor(x.tx))}</td><td>${esc(x.customer)}</td><td>${esc(x.marketing||"-")}</td><td>${esc(x.items)}</td><td>${esc(x.qty)}</td><td>${x.kg.toLocaleString("id-ID")} kg</td><td>${Number(x.tx._bf_version||1)}</td></tr>`).join(""))}</section>
  <section class="bf-report-section"><div class="bf-report-title"><h3>Keuangan Rinci</h3><span>Setoran, Pengeluaran, Sembako</span></div>${table(["Waktu","Jenis","Admin","Nominal","Kategori / Customer / Supplier","Metode","Keterangan","Foto"],[
    ...d.deposits.map(r=>({r,type:"Setoran",label:r.customer||r.namaCustomer||"-",method:r.metode||r.via_bank||r.via||"-"})),
    ...d.expenses.map(r=>({r,type:"Pengeluaran",label:r.kategori||r.jenis||"-",method:r.metode||r.via||"-"})),
    ...d.groceries.map(r=>({r,type:"Sembako",label:r.supplier||r.toko||"-",method:r.metode||r.via||"-"}))
  ].sort((a,b)=>String(b.r.updated_at||b.r.tanggal||"").localeCompare(String(a.r.updated_at||a.r.tanggal||""))).map(x=>`<tr><td>${esc(dt(x.r))}</td><td>${badge(x.type)}</td><td>${esc(actor(x.r))}</td><td>${money(x.r.nominal??x.r.total??x.r.jumlah)}</td><td>${esc(x.label)}</td><td>${esc(x.method)}</td><td>${esc(x.r.keterangan||"-")}</td><td>${photoCount(x.r)}</td></tr>`).join(""))}</section>
  <section class="bf-report-section"><div class="bf-report-title"><h3>Perlu Diperiksa Owner</h3><span>Hanya indikator yang dapat dibuktikan dari data</span></div>${table(["Jenis","No Catatan","Temuan"],alerts.map(x=>`<tr><td>${badge(x.type)}</td><td>${esc(x.no)}</td><td>${esc(x.msg)}</td></tr>`).join(""),"Tidak ada indikator masalah yang dapat dibuktikan pada periode ini.")}</section>
  <section class="bf-report-section"><div class="bf-report-title"><h3>Aktivitas Audit</h3><span>${audits.length} aktivitas database pada periode</span></div>${table(["Waktu","Akun","Role","Aksi","Entitas","ID"],audits.map(r=>`<tr><td>${esc(dt({created_at:r.created_at}))}</td><td>${esc(r.actor_email||"-")}</td><td>${esc(r.actor_role||"-")}</td><td>${esc(r.action||"-")}</td><td>${esc(r.entity_type||"-")}</td><td>${esc(r.entity_id||"-")}</td></tr>`).join(""),String(window.BFCurrentUser?.()?.profile?.role||"").toLowerCase()==="owner"?"Tidak ada audit pada periode ini atau audit tidak dapat dibaca.":"Audit rinci hanya tersedia untuk Owner.")}</section>
  <section class="bf-report-section"><div class="bf-report-title"><h3>Ringkasan Arus Kas</h3><span>Referensi koreksi, bukan saldo bank</span></div><div class="bf-report-metrics">${metric("Setoran",money(d.depositTotal),"")}${metric("Pengeluaran",money(d.expenseTotal),"")}${metric("Sembako",money(d.groceryTotal),"")}${metric("Komisi",money(d.commissionTotal),"")}${metric("Selisih",money(net),"Setoran − Pengeluaran − Sembako − Komisi",net<0?"warn":"good")}</div></section>`;
  box.querySelector("#bfr-apply").onclick=()=>renderReport(p,box.querySelector("#bfr-from").value,box.querySelector("#bfr-to").value);
  box.querySelector("#bfr-today").onclick=()=>{const t=window.BFCore.today();renderReport(p,t,t)};
  box.querySelector("#bfr-history").onclick=()=>openHistory();
}
function openReports(){
  if(!can("view_reports")&&!can("view_history"))return deny("view_reports");
  const t=window.BFCore.today(),p=shell("bf-report-page","Ringkasan Laporan Owner","Analisa rinci pekerjaan Admin, transaksi, keuangan, revisi, dan audit");
  p.querySelector(".bf-report-content").innerHTML='<div class="bf-report-loading">Memuat laporan Owner…</div>';
  renderReport(p,t,t);
}
function historyRows(){
  const a=dedupe(list("bf_masuk_v26"),"in").map(r=>({...r,_type:"Barang Masuk",_party:supplierGroups(r).map(x=>x.supplier).filter(Boolean).join(", ")}));
  const b=dedupe(list("bf_keluar_v26"),"out").map(r=>({...r,_type:"Barang Keluar",_party:customerGroups(r).map(x=>x.customer).filter(Boolean).join(", ")}));
  return [...a,...b].sort((x,y)=>String(y.updated_at||y.created_at||y.tanggal||"").localeCompare(String(x.updated_at||x.created_at||x.tanggal||"")));
}
function openHistory(){
  if(!can("view_history")&&!can("request_history"))return deny("view_history");
  const p=shell("bf-history-detail-page","Histori Rinci","Jejak transaksi bisnis; audit perubahan tersedia terpisah di Ringkasan Owner"),rows=historyRows();
  p.querySelector(".bf-report-content").innerHTML=`<div class="bf-report-toolbar"><input id="bfh-search" placeholder="Cari no catatan, supplier/customer, pembuat..."><select id="bfh-type"><option value="all">Semua jenis</option><option>Barang Masuk</option><option>Barang Keluar</option></select><button id="bfh-report">📊 Ringkasan Owner</button></div><div id="bfh-table"></div>`;
  const draw=()=>{const q=String(p.querySelector("#bfh-search").value||"").toLowerCase(),type=p.querySelector("#bfh-type").value;const z=rows.filter(r=>(type==="all"||r._type===type)&&(!q||JSON.stringify(r).toLowerCase().includes(q)));p.querySelector("#bfh-table").innerHTML=table(["Waktu","Jenis","No Catatan","Supplier / Customer","Berat","Dibuat Oleh","Diubah Oleh","Versi"],z.map(r=>`<tr><td>${esc(dt(r))}</td><td>${badge(r._type)}</td><td><b>${esc(r.transaction_no||"-")}</b></td><td>${esc(r._party||"-")}</td><td>${kg(r).toLocaleString("id-ID")} kg</td><td>${esc(r.created_by||"-")}</td><td>${esc(r.updated_by||"-")}</td><td>${Number(r._bf_version||1)}</td></tr>`).join(""))};
  p.querySelector("#bfh-search").oninput=draw;p.querySelector("#bfh-type").onchange=draw;p.querySelector("#bfh-report").onclick=()=>{p.remove();openReports()};draw();
}
window.BFOpenReports=openReports;
window.BFOpenDetailedHistory=openHistory;
})();
