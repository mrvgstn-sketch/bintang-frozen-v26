(function(){
"use strict";
const {esc,uid,today,can,deny,storage,audit}=window.BFCore;
const rows=k=>storage.list(k);
const save=(k,v)=>storage.set(k,v);
const num=v=>{const x=Number(String(v??0).replace(",","."));return Number.isFinite(x)?x:0};
const kg=r=>{const a=Array.isArray(r.timbangan)?r.timbangan:Array.isArray(r.weights)?r.weights:[];return a.reduce((s,x)=>s+num(x),0)};
const DM=window.BFDataModel;
const isOwner=()=>window.BFCurrentUser?.().profile?.role==="owner";
const currentRole=()=>String(window.BFCurrentUser?.().profile?.role||"").toLowerCase();
const canManageDelivery=()=>["owner","admin"].includes(currentRole());
const delivery=()=>window.BFDriverDelivery||{};

function page(title,sub){
  document.getElementById("bf-op-page")?.remove();
  const el=document.createElement("div");el.id="bf-op-page";el.className="bf-op-page";
  el.innerHTML=`<div class="bf-op-wrap"><div class="bf-op-head"><button class="bf-op-back">← Kembali</button><div><h2 style="margin:0;color:#0d1b3e">${esc(title)}</h2><small style="color:#64748b">${esc(sub)}</small></div></div><div id="bf-op-content"></div></div>`;
  document.body.appendChild(el);el.querySelector(".bf-op-back").onclick=()=>{window.BFRestoreInlineTally?.();el.remove()};return el;
}
function nextTx(prefix,date,data){
  const base=prefix+"-"+String(date).replaceAll("-","")+"-";let max=0;
  data.forEach(r=>{const x=String(r.transaction_no||"");if(x.startsWith(base)){const z=parseInt(x.slice(base.length),10);if(Number.isFinite(z))max=Math.max(max,z)}});
  return base+String(max+1).padStart(4,"0");
}
function transactionCenter(mode){
  const incoming=mode==="in",key=incoming?"bf_masuk_v26":"bf_keluar_v26";
  if(!can(incoming?"view_in":"view_out")&&!can("view_tally"))return deny(incoming?"view_in":"view_out");
  const title=incoming?"Barang Masuk":"Barang Keluar",prefix=incoming?"BM":"BK";
  let data=rows(key).filter(x=>!x.deleted_at),editing=null;
  let outgoingDateMode="all",outgoingDateFrom="",outgoingDateTo="",outgoingCustomerQuery="",focusGroupId="";
  const suppliers=rows("bf_suppliers").filter(x=>x.active!==false),customers=rows("bf_customers").filter(x=>x.active!==false),products=rows("bf_products").filter(x=>x.active!==false),employees=rows("bf_employees").filter(x=>x.active!==false);
  const root=page(title,"Jejak catatan operasional • timbangan real seperti buku tulis");
  const option=(list,val="")=>list.map(x=>`<option value="${esc(x.name||x.nama||"")}" ${String(val)==String(x.name||x.nama||"")?"selected":""}>${esc(x.name||x.nama||"")}</option>`).join("");
  const weightCell=(v="",i=0)=>`<div class="bf-weight-cell"><label>R${i+1}</label><input class="bf-weight-input" inputmode="decimal" value="${esc(v)}" placeholder="0"></div>`;
  const weightInputs=(w=[],initial=false)=>{const a=Array.isArray(w)&&w.length?w:(initial?[""]:[]);return `<div class="bf-weight-grid">${a.map((v,i)=>weightCell(v,i)).join("")}</div><div class="bf-weight-empty" ${a.length?'hidden':''}>Belum ada catatan timbangan.</div><div class="bf-op-actions bf-weight-actions"><button type="button" class="bf-op-secondary bf-add-weight">＋ Kolom Timbang</button><button type="button" class="bf-op-secondary bf-remove-last-weight" ${a.length?'':'disabled'}>− Hapus Kolom</button></div>`};
  function bindWeights(box,cb){
    const grid=box.querySelector('.bf-weight-grid'),empty=box.querySelector('.bf-weight-empty'),removeLast=box.querySelector('.bf-remove-last-weight');
    const renumber=()=>{[...grid.children].forEach((cell,i)=>{const label=cell.querySelector('label');if(label)label.textContent=`R${i+1}`});if(empty)empty.hidden=grid.children.length>0;if(removeLast)removeLast.disabled=grid.children.length===0};
    const calc=()=>{renumber();const v=[...box.querySelectorAll('.bf-weight-input')].map(x=>num(x.value));cb?.(v,v.reduce((a,b)=>a+b,0))};
    const bindCell=cell=>{const input=cell.querySelector('.bf-weight-input');if(input)input.oninput=calc};
    [...grid.children].forEach(bindCell);
    box.querySelector('.bf-add-weight')?.addEventListener('click',()=>{const d=document.createElement('div');d.innerHTML=weightCell('',grid.children.length);const cell=d.firstElementChild;grid.appendChild(cell);bindCell(cell);calc();cell.querySelector('input')?.focus()});
    removeLast?.addEventListener('click',()=>{const cell=grid.lastElementChild;if(!cell)return;const input=cell.querySelector('.bf-weight-input'),label=cell.querySelector('label')?.textContent||`R${grid.children.length}`,raw=input?.value?.trim()||'';const msg=raw?`Hapus kolom timbangan ${label}?\n\nNilai: ${raw} kg\n\nTotal timbang akan dihitung ulang setelah kolom ini dihapus.`:`Hapus kolom timbangan ${label}?\n\nKolom ini belum mempunyai nilai.`;if(!confirm(msg))return;cell.remove();calc()});
    calc();
  }
  function normalizeSup(r){const g=DM.supplierGroups(r);return g.length?g:[{supplier:"",nota_foto:"",nota_fotos:[],items:[{item:"",satuan:"Kg",timbangan:[]}]}]}
  function inItem(it={},ii=0){const hasWeights=Array.isArray(it.timbangan)||Array.isArray(it.weights),w=Array.isArray(it.timbangan)?it.timbangan:(Array.isArray(it.weights)?it.weights:[]);return `<div class="bf-in-item"><div class="bf-op-grid"><div class="bf-op-field"><label>Item ${ii+1}</label><input class="bf-in-item-name" list="bf-product-list" value="${esc(it.item||'')}"></div><div class="bf-op-field"><label>Satuan</label><input class="bf-in-item-unit" value="${esc(it.satuan||it.unit||'Kg')}"></div></div><div class="bf-op-field"><label>Catatan Timbangan Real</label><div class="bf-in-item-weights">${weightInputs(w,!hasWeights)}</div><div class="bf-line-total">Total Item: <span class="bf-in-item-total">0</span> kg</div></div><button type="button" class="bf-op-secondary bf-remove-in-item">Hapus Item</button></div>`}
  function supGroup(g={},gi=0){const items=Array.isArray(g.items)&&g.items.length?g.items:[{}],photos=Array.isArray(g.nota_fotos)?g.nota_fotos:(g.nota_foto?[g.nota_foto]:[]);return `<div class="bf-supplier-group"><div class="bf-op-grid"><div class="bf-op-field"><label>Supplier ${gi+1}</label><input class="bf-supplier-select" list="bf-supplier-list" value="${esc(g.supplier||"")}" placeholder="Cari nama / kontak Supplier..." autocomplete="off"></div><div class="bf-op-field bf-photo-field" style="grid-column:1/-1"><label>NOTA / BUKTI</label><div class="bf-supplier-photo-preview" data-photos="${esc(JSON.stringify(photos))}">${photos.map((src,i)=>`<div class="bf-nota-thumb"><img src="${esc(src)}"><button type="button" class="bf-nota-remove" data-index="${i}">×</button><small>Foto ${i+1}</small></div>`).join('')}</div><div class="bf-op-actions" style="margin-top:8px"><label class="bf-op-secondary bf-photo-label">📷 Ambil Foto<input class="bf-supplier-camera" type="file" accept="image/*" capture="environment" hidden></label><label class="bf-op-secondary bf-photo-label">🖼 Pilih Foto<input class="bf-supplier-gallery" type="file" accept="image/*" multiple hidden></label></div></div></div><div class="bf-in-items">${items.map((it,ii)=>inItem(it,ii)).join('')}</div><div class="bf-line-total">Total Supplier: <span class="bf-supplier-total">0</span> kg</div><div class="bf-op-actions"><button type="button" class="bf-op-secondary bf-add-in-item">＋ Tambah Item</button><button type="button" class="bf-op-secondary bf-remove-supplier">Hapus Supplier</button></div></div>`}
  function incomingForm(r,tx){const gs=normalizeSup(r);return `<div class="bf-op-card"><div class="bf-op-grid"><div class="bf-op-field"><label>No Catatan</label><input id="txno" value="${esc(tx)}" readonly></div><div class="bf-op-field"><label>Tanggal Barang Masuk</label><input id="txdate" type="date" value="${esc(r.tanggal||r.date||today())}"></div><div class="bf-op-field"><label>Supir</label><input id="txdriver" value="${esc(r.supir||r.driver||'')}"></div><div class="bf-op-field"><label>Ongkos Kirim</label><input id="txshipping" inputmode="numeric" value="${esc(r.ongkos_kirim??r.shipping_cost??'')}" placeholder="Rp"></div></div><datalist id="bf-product-list">${products.map(x=>`<option value="${esc(x.name||'')}"></option>`).join('')}</datalist><datalist id="bf-supplier-list">${suppliers.map(x=>`<option value="${esc(x.name||x.nama||'')}" label="${esc([x.name||x.nama,x.phone||x.no_hp||x.wa||x.contact].filter(Boolean).join(' — '))}"></option>`).join('')}</datalist><div class="bf-section-caption">Supplier & Item</div><div id="bf-supplier-groups">${gs.map((g,gi)=>supGroup(g,gi)).join('')}</div><button type="button" class="bf-op-primary" id="bf-add-supplier">＋ Tambah Supplier</button><div class="bf-grand-total"><span>Grand Total Barang Masuk</span><b><span id="bf-in-grand-total">0</span> kg</b></div><div class="bf-op-field" style="margin-top:12px"><label>Keterangan Umum</label><textarea id="txnotes">${esc(r.keterangan||r.catatan||r.notes||'')}</textarea></div></div>`}
  function bindIncoming(){const groups=root.querySelector('#bf-supplier-groups');function recalc(){let grand=0;groups.querySelectorAll('.bf-supplier-group').forEach(g=>{let st=0;g.querySelectorAll('.bf-in-item').forEach(it=>{const vals=[...it.querySelectorAll('.bf-weight-input')].map(x=>num(x.value)),t=vals.reduce((a,b)=>a+b,0);it.querySelector('.bf-in-item-total').textContent=t.toLocaleString('id-ID');st+=t});g.querySelector('.bf-supplier-total').textContent=st.toLocaleString('id-ID');grand+=st});root.querySelector('#bf-in-grand-total').textContent=grand.toLocaleString('id-ID')}
    function renumberIncoming(){groups.querySelectorAll('.bf-supplier-group').forEach((g,gi)=>{const supplierLabel=g.querySelector('.bf-supplier-select')?.closest('.bf-op-field')?.querySelector('label');if(supplierLabel)supplierLabel.textContent=`Supplier ${gi+1}`;g.querySelectorAll('.bf-in-item').forEach((it,ii)=>{const itemLabel=it.querySelector('.bf-in-item-name')?.closest('.bf-op-field')?.querySelector('label');if(itemLabel)itemLabel.textContent=`Item ${ii+1}`})})}
    function bindAll(){
      groups.querySelectorAll('.bf-in-item-weights').forEach(box=>{if(box.dataset.bound)return;box.dataset.bound='1';bindWeights(box,recalc)});
      groups.querySelectorAll('.bf-add-in-item').forEach(b=>b.onclick=()=>{const list=b.closest('.bf-supplier-group').querySelector('.bf-in-items');list.insertAdjacentHTML('beforeend',inItem({},list.children.length));bindAll();renumberIncoming();recalc()});
      groups.querySelectorAll('.bf-remove-in-item').forEach(b=>b.onclick=()=>{const item=b.closest('.bf-in-item'),list=item.parentElement,name=item.querySelector('.bf-in-item-name')?.value.trim()||'Item ini';if(!confirm(`Hapus Item?\n\n${name}\n\nSeluruh catatan Timbangan pada Item ini juga akan ikut dihapus.`))return;if(list.children.length<=1){item.outerHTML=inItem({},0)}else item.remove();bindAll();renumberIncoming();recalc()});
      groups.querySelectorAll('.bf-remove-supplier').forEach(b=>b.onclick=()=>{const group=b.closest('.bf-supplier-group'),name=group.querySelector('.bf-supplier-select')?.value.trim()||'Supplier ini';let photos=[];try{photos=JSON.parse(group.querySelector('.bf-supplier-photo-preview')?.dataset.photos||'[]')}catch(_){photos=[]}const photoNote=photos.length?`\n\n${photos.length} referensi Foto Nota pada Supplier ini juga akan dilepas dari catatan.`:'';if(!confirm(`Hapus Supplier?\n\n${name}\n\nSemua Item dan catatan Timbangan di dalam Supplier ini akan ikut dihapus.${photoNote}`))return;if(groups.children.length<=1){group.outerHTML=supGroup({},0)}else group.remove();bindAll();renumberIncoming();recalc()});
      groups.querySelectorAll('.bf-supplier-photo-preview').forEach(pv=>{if(pv.dataset.bound)return;pv.dataset.bound='1';let photos=[];try{photos=JSON.parse(pv.dataset.photos||'[]')}catch(_){photos=[]}const renderPhotos=()=>{pv.dataset.photos=JSON.stringify(photos);pv.innerHTML=photos.map((src,i)=>`<div class="bf-nota-thumb"><img src="${src}"><button type="button" class="bf-nota-remove" data-index="${i}">×</button><small>Foto ${i+1}</small></div>`).join('');pv.querySelectorAll('.bf-nota-remove').forEach(b=>b.onclick=()=>{photos.splice(Number(b.dataset.index),1);renderPhotos()})};const addFiles=async files=>{for(const f of [...files]){if(!f||!f.type.startsWith('image/'))continue;try{const tx=root.querySelector('#txno')?.value||'nota',supplier=group.querySelector('.bf-supplier-select')?.value||'supplier';const uploaded=await window.BFPhotoStorage.uploadFile(f,{transactionNo:tx,supplier});photos.push(uploaded.url);renderPhotos()}catch(err){alert(err?.message||'Foto nota gagal diunggah.')}}};const group=pv.closest('.bf-supplier-group'),cam=group.querySelector('.bf-supplier-camera'),gal=group.querySelector('.bf-supplier-gallery');if(cam)cam.onchange=e=>{addFiles(e.target.files||[]);e.target.value=''};if(gal)gal.onchange=e=>{addFiles(e.target.files||[]);e.target.value=''};renderPhotos()});
      renumberIncoming();recalc()
    }
    root.querySelector('#bf-add-supplier').onclick=()=>{groups.insertAdjacentHTML('beforeend',supGroup({},groups.children.length));bindAll();recalc()};bindAll()}
  const POS_STATUS={pending:"pending",entered:"entered",needs_update:"needs_update"};
  const posLabel=s=>s===POS_STATUS.entered?"Sudah Input POS":s===POS_STATUS.needs_update?"Perlu Update POS":"Perlu Input POS";
  const posClass=s=>s===POS_STATUS.entered?"entered":s===POS_STATUS.needs_update?"needs-update":"pending";
  const posStatus=g=>[POS_STATUS.entered,POS_STATUS.needs_update].includes(String(g?.pos_status||""))?String(g.pos_status):POS_STATUS.pending;
  const customerGroupId=g=>String(g?.group_id||g?.customer_group_id||"").trim();
  const actor=()=>{const u=window.BFCore.user();return {name:u.name||u.email||"",email:u.email||"",role:u.role||""}};
  function customerSignature(g={}){
    return JSON.stringify({
      customer:String(g.customer||g.name||"").trim(),
      items:(Array.isArray(g.items)?g.items:[]).map(it=>({
        item:String(it.item||"").trim(),
        qty:String(it.qty??"").trim(),
        satuan:String(it.satuan||it.unit||"Kg").trim(),
        timbangan:(Array.isArray(it.timbangan)?it.timbangan:(Array.isArray(it.weights)?it.weights:[])).map(num)
      }))
    });
  }
  function ensureOutgoingGroupIds(){
    if(incoming||(!can('edit_data')&&!can('add_row')))return;
    const all=rows(key);let changed=false;
    all.forEach(tx=>{
      if(!Array.isArray(tx.customers))return;
      tx.customers=tx.customers.map(g=>{
        if(customerGroupId(g))return g;
        changed=true;return {...g,group_id:uid(),pos_status:posStatus(g)};
      });
    });
    if(changed){save(key,all);data=all.filter(x=>!x.deleted_at);window.BFCloud?.push?.()}
  }
  ensureOutgoingGroupIds();
  function normalizeCust(r){
    const g=DM.customerGroups(r).map(x=>({...x,group_id:customerGroupId(x)||uid(),pos_status:posStatus(x),payment_method:String(x.payment_method||"unknown"),delivery_status:String(x.delivery_status||"pending"),delivery_proofs:Array.isArray(x.delivery_proofs)?x.delivery_proofs:[],cash_status:String(x.cash_status||"")}));
    return g.length?g:[{group_id:uid(),customer:"",marketing:"",pos_status:POS_STATUS.pending,payment_method:"unknown",delivery_status:"pending",delivery_proofs:[],cash_status:"",items:[{item:"",qty:"",satuan:"Kg",timbangan:[]}]}]
  }
  function outItem(it={},ii=0){const hasWeights=Array.isArray(it.timbangan)||Array.isArray(it.weights),w=Array.isArray(it.timbangan)?it.timbangan:(Array.isArray(it.weights)?it.weights:[]);return `<div class="bf-out-item"><div class="bf-item-heading">Item ${ii+1}</div><div class="bf-op-grid"><div class="bf-op-field"><label>Item</label><input class="bf-item-name" list="bf-product-list" value="${esc(it.item||'')}"></div><div class="bf-op-field"><label>Qty Pesanan</label><input class="bf-item-qty" inputmode="decimal" value="${esc(it.qty??'')}"></div><div class="bf-op-field"><label>Satuan</label><input class="bf-item-unit" value="${esc(it.satuan||it.unit||'Kg')}"></div></div><div class="bf-op-field"><label>Catatan Timbangan Real</label><div class="bf-item-weights">${weightInputs(w,!hasWeights)}</div><div class="bf-line-total">Total Item: <span class="bf-item-total">0</span> kg</div></div><button type="button" class="bf-op-secondary bf-remove-item">Hapus Item</button></div>`}
  function customerLabel(x){
    const name=String(x?.name||x?.nama||"").trim(), contact=String(x?.contact||x?.phone||x?.wa||"").trim();
    return [name,contact].filter(Boolean).join(" — ");
  }
  function marketingOptions(selected=""){
    return `<option value="">Tanpa Marketing</option>${employees.filter(x=>x?.active!==false).map(x=>{const name=String(x.name||x.email||""),label=isOwner()?`${name} — Rp ${num(x.commission||x.commission_per_kg||0).toLocaleString("id-ID")}/kg`:name;return `<option value="${esc(name)}" ${String(selected)===name?"selected":""}>${esc(label)}</option>`}).join("")}`;
  }
  function posMeta(g){
    if(posStatus(g)===POS_STATUS.entered&&g.pos_entered_at){const by=g.pos_entered_by_name||g.pos_entered_by_email||"";return `Ditandai ${esc(new Date(g.pos_entered_at).toLocaleString('id-ID'))}${by?` • ${esc(by)}`:""}`}
    if(posStatus(g)===POS_STATUS.needs_update&&g.pos_needs_update_at)return `Data berubah ${esc(new Date(g.pos_needs_update_at).toLocaleString('id-ID'))}`;
    return "Belum ditandai sudah masuk POS";
  }
  function paymentLabel(v){return v==="cash"?"Tunai / Cash":v==="non_cash"?"Non-Tunai":"Belum Tercatat"}
  function deliveryLabel(v){return v==="delivered"?"Sudah Diantar":"Belum Diantar"}
  function cashLabel(g){if(g.payment_method!=="cash")return "Tidak Berlaku";return g.cash_status==="handed_over"?"Uang Sudah Diserahkan":g.cash_status==="carried"?"Uang Dibawa Supir":"Perlu Ditagih / Diambil"}
  function deliveryFields(g){
    if(!canManageDelivery())return `<div class="bf-delivery-readonly"><span>Supir: <b>${esc(g.driver_name_snapshot||"Belum ditugaskan")}</b></span><span>Pembayaran: <b>${esc(paymentLabel(g.payment_method||"unknown"))}</b></span></div>`;
    return `<div class="bf-op-grid bf-delivery-fields">
      <div class="bf-op-field"><label>Supir Pengantaran</label><select class="bf-driver-select" data-selected-driver="${esc(g.driver_id||'')}"><option value="">Belum Ditugaskan</option>${g.driver_id?`<option value="${esc(g.driver_id)}" data-driver-name="${esc(g.driver_name_snapshot||'Supir')}" selected>${esc(g.driver_name_snapshot||'Supir')}</option>`:''}</select></div>
      <div class="bf-op-field"><label>Pembayaran</label><select class="bf-payment-method"><option value="unknown" ${g.payment_method==="unknown"||!g.payment_method?'selected':''}>Belum Tercatat</option><option value="cash" ${g.payment_method==="cash"?'selected':''}>Tunai / Cash</option><option value="non_cash" ${g.payment_method==="non_cash"?'selected':''}>Non-Tunai</option></select></div>
    </div>`;
  }
  function custGroup(g={},gi=0){
    const its=Array.isArray(g.items)&&g.items.length?g.items:[{}], current=String(g.customer||g.name||""),gid=customerGroupId(g)||uid(),status=posStatus(g),total=DM.groupTotal({...g,items:its});
    return `<section class="bf-customer-group" data-group-id="${esc(gid)}" data-pos-status="${esc(status)}" data-pos-entered-at="${esc(g.pos_entered_at||'')}" data-pos-entered-by-id="${esc(g.pos_entered_by_id||'')}" data-pos-entered-by-email="${esc(g.pos_entered_by_email||'')}" data-pos-entered-by-name="${esc(g.pos_entered_by_name||'')}">
      <header class="bf-customer-group-header"><div><span class="bf-customer-number">CUSTOMER ${gi+1}</span><strong class="bf-customer-title">${esc(current||'Belum dipilih')}</strong></div><span class="bf-pos-badge ${posClass(status)}">${esc(posLabel(status))}</span></header>
      <div class="bf-op-grid bf-customer-head">
        <div class="bf-op-field"><label>Customer</label><input class="bf-customer-search" list="bf-customer-list" value="${esc(current)}" placeholder="Cari nama / WA Customer..." autocomplete="off"></div>
        <div class="bf-op-field"><label>Marketing</label><select class="bf-customer-marketing">${marketingOptions(g.marketing??"")}</select></div>
      </div>
      ${deliveryFields(g)}
      <div class="bf-delivery-status-strip"><span>${esc(deliveryLabel(g.delivery_status||"pending"))}</span><span class="${g.payment_method==="cash"?'cash':''}">${esc(paymentLabel(g.payment_method||"unknown"))}</span>${g.payment_method==="cash"?`<span class="cash">${esc(cashLabel(g))}</span>`:''}<span>📷 ${(Array.isArray(g.delivery_proofs)?g.delivery_proofs.length:0)} Bukti</span></div>
      <div class="bf-items">${its.map((it,ii)=>outItem(it,ii)).join("")}</div>
      <div class="bf-customer-footer"><div><span>Total Customer</span><b><span class="bf-customer-total">${num(total).toLocaleString('id-ID')}</span> kg</b><small class="bf-pos-meta">${posMeta(g)}</small></div><div class="bf-op-actions"><button type="button" class="bf-op-secondary bf-add-item">＋ Tambah Item</button>${editing?`<button type="button" class="bf-pos-action" data-pos-action="entered">${status===POS_STATUS.needs_update?'✓ Tandai Sudah Diperbarui di POS':'✓ Tandai Sudah Input POS'}</button>`:''}${status===POS_STATUS.entered&&editing?'<button type="button" class="bf-op-secondary bf-pos-reset">Tandai Perlu Input</button>':''}<button type="button" class="bf-op-secondary bf-remove-customer">Hapus Customer</button></div></div>
    </section>`;
  }
  function outgoingForm(r,tx){
    const gs=normalizeCust(r);
    return `<div class="bf-op-card"><div class="bf-op-grid"><div class="bf-op-field"><label>No Catatan</label><input id="txno" value="${esc(tx)}" readonly></div><div class="bf-op-field"><label>Tanggal</label><input id="txdate" type="date" value="${esc(r.tanggal||r.date||today())}"></div></div>
      <datalist id="bf-product-list">${products.map(x=>`<option value="${esc(x.name||"")}"></option>`).join("")}</datalist>
      <datalist id="bf-customer-list">${customers.map(x=>`<option value="${esc(x.name||x.nama||"")}" label="${esc(customerLabel(x))}"></option>`).join("")}</datalist>
      <div class="bf-section-caption">Customer & Item</div><div id="bf-customer-groups">${gs.map((g,gi)=>custGroup(g,gi)).join("")}</div>
      <button type="button" class="bf-op-primary" id="bf-add-customer">＋ Tambah Customer</button>
      <div class="bf-op-field" style="margin-top:12px"><label>Keterangan</label><textarea id="txnotes">${esc(r.keterangan||r.catatan||r.notes||"")}</textarea></div></div>`;
  }
  function recalcOutgoing(groups){
    groups.querySelectorAll('.bf-customer-group').forEach(g=>{let total=0;g.querySelectorAll('.bf-out-item').forEach(it=>{const vals=[...it.querySelectorAll('.bf-weight-input')].map(x=>num(x.value)),t=vals.reduce((a,b)=>a+b,0);it.querySelector('.bf-item-total').textContent=t.toLocaleString('id-ID');total+=t});g.querySelector('.bf-customer-total').textContent=total.toLocaleString('id-ID');const name=g.querySelector('.bf-customer-search')?.value.trim();const title=g.querySelector('.bf-customer-title');if(title)title.textContent=name||'Belum dipilih'})
  }
  async function updatePosStatus(txId,groupId,nextStatus){
    if(!can('edit_data')&&!can('add_row'))return deny('edit_data');
    const all=rows(key),i=all.findIndex(x=>(x._bf_uid||x.transaction_no)===txId);if(i<0)return false;
    const old=all[i],next=JSON.parse(JSON.stringify(old)),groups=Array.isArray(next.customers)?next.customers:[],g=groups.find(x=>customerGroupId(x)===groupId);if(!g)return false;
    const before=JSON.parse(JSON.stringify(g)),me=actor(),now=new Date().toISOString();g.pos_status=nextStatus;
    if(nextStatus===POS_STATUS.entered){g.pos_entered_at=now;g.pos_entered_by_id=window.BFCore.user().id||'';g.pos_entered_by_email=me.email;g.pos_entered_by_name=me.name;delete g.pos_needs_update_at}
    else if(nextStatus===POS_STATUS.pending){delete g.pos_entered_at;delete g.pos_entered_by_id;delete g.pos_entered_by_email;delete g.pos_entered_by_name;delete g.pos_needs_update_at}
    const prepared=window.BFPrepareTransactionSave?window.BFPrepareTransactionSave(old,next):next;all[i]=prepared;save(key,all);audit('update_pos_status','barang_keluar',prepared.transaction_no||prepared._bf_uid,before,g,{group_id:groupId,customer:g.customer||'',pos_status:nextStatus});window.BFCloud?.push?.();data=rows(key).filter(x=>!x.deleted_at);return prepared;
  }
  function bindOutgoing(){
    const groups=root.querySelector('#bf-customer-groups');
    function renumberOutgoing(){groups.querySelectorAll('.bf-customer-group').forEach((g,gi)=>{const n=g.querySelector('.bf-customer-number');if(n)n.textContent=`CUSTOMER ${gi+1}`;g.querySelectorAll('.bf-out-item').forEach((it,ii)=>{const h=it.querySelector('.bf-item-heading');if(h)h.textContent=`Item ${ii+1}`})})}
    function bindAll(){
      groups.querySelectorAll('.bf-item-weights').forEach(box=>{if(box.dataset.bound)return;box.dataset.bound='1';bindWeights(box,()=>recalcOutgoing(groups))});
      groups.querySelectorAll('.bf-customer-search').forEach(inp=>{if(inp.dataset.bound)return;inp.dataset.bound='1';inp.oninput=()=>recalcOutgoing(groups)});
      groups.querySelectorAll('.bf-add-item').forEach(b=>b.onclick=()=>{const list=b.closest('.bf-customer-group').querySelector('.bf-items');list.insertAdjacentHTML('beforeend',outItem({},list.children.length));bindAll();recalcOutgoing(groups)});
      groups.querySelectorAll('.bf-remove-item').forEach(b=>b.onclick=()=>{const item=b.closest('.bf-out-item'),list=item.parentElement,name=item.querySelector('.bf-item-name')?.value.trim()||'Item ini';if(!confirm(`Hapus Item?\n\n${name}\n\nQty Pesanan dan seluruh catatan Timbangan pada Item ini juga akan ikut dihapus.`))return;if(list.children.length<=1){item.outerHTML=outItem({},0)}else item.remove();bindAll();renumberOutgoing();recalcOutgoing(groups)});
      groups.querySelectorAll('.bf-remove-customer').forEach(b=>b.onclick=()=>{const group=b.closest('.bf-customer-group'),name=group.querySelector('.bf-customer-search')?.value.trim()||'Customer ini',status=group.dataset.posStatus||POS_STATUS.pending;const warning=status===POS_STATUS.entered?`\n\n${name} sudah ditandai SUDAH INPUT POS. Menghapus Customer ini dari Bintang Frozen TIDAK menghapus data dari aplikasi POS. Pastikan POS diperiksa manual jika diperlukan.`:'';if(!confirm(`Hapus Customer?\n\n${name}\n\nSemua Item dan catatan Timbangan Customer ini akan ikut dihapus.${warning}`))return;if(groups.children.length<=1){group.outerHTML=custGroup({group_id:uid(),pos_status:POS_STATUS.pending},0)}else group.remove();bindAll();renumberOutgoing();recalcOutgoing(groups)});
      groups.querySelectorAll('[data-pos-action="entered"]').forEach(b=>b.onclick=async()=>{const group=b.closest('.bf-customer-group'),name=group.querySelector('.bf-customer-search')?.value.trim()||'Customer',total=group.querySelector('.bf-customer-total')?.textContent||'0';if(!editing)return alert('Simpan catatan terlebih dahulu sebelum menandai status POS.');const saved=(editing.customers||[]).find(x=>customerGroupId(x)===group.dataset.groupId),draft={customer:group.querySelector('.bf-customer-search')?.value.trim()||'',items:[...group.querySelectorAll('.bf-out-item')].map(it=>({item:it.querySelector('.bf-item-name').value,qty:it.querySelector('.bf-item-qty').value,satuan:it.querySelector('.bf-item-unit').value,timbangan:[...it.querySelectorAll('.bf-weight-input')].map(x=>num(x.value))}))};if(saved&&customerSignature(saved)!==customerSignature(draft))return alert('Ada perubahan Customer/Item/Qty/Satuan/Timbangan yang belum disimpan. Simpan perubahan terlebih dahulu agar status POS tidak salah.');if(!confirm(`Tandai ${name} sebagai sudah diinput/diperbarui di POS?\n\nTotal: ${total} kg`))return;const updated=await updatePosStatus(editing._bf_uid||editing.transaction_no,group.dataset.groupId,POS_STATUS.entered);if(updated){editing=updated;render(editing)}});
      groups.querySelectorAll('.bf-pos-reset').forEach(b=>b.onclick=async()=>{const group=b.closest('.bf-customer-group'),name=group.querySelector('.bf-customer-search')?.value.trim()||'Customer';if(!confirm(`Tandai ${name} kembali sebagai Perlu Input POS?`))return;const updated=await updatePosStatus(editing._bf_uid||editing.transaction_no,group.dataset.groupId,POS_STATUS.pending);if(updated){editing=updated;render(editing)}});
      renumberOutgoing();recalcOutgoing(groups)
    }
    root.querySelector('#bf-add-customer').onclick=()=>{groups.insertAdjacentHTML('beforeend',custGroup({group_id:uid(),pos_status:POS_STATUS.pending,payment_method:'unknown',delivery_status:'pending',delivery_proofs:[],cash_status:''},groups.children.length));bindAll();renumberOutgoing();recalcOutgoing(groups);delivery().populateDriverSelects?.(groups)};bindAll();delivery().populateDriverSelects?.(groups)
  }
  async function migrateLegacyPhotos(){
    if(!incoming)return;
    for(const group of root.querySelectorAll('.bf-supplier-group')){
      const pv=group.querySelector('.bf-supplier-photo-preview');if(!pv)continue;
      let photos=[];try{photos=JSON.parse(pv.dataset.photos||'[]')}catch(_){photos=[]}
      let changed=false;const next=[];
      for(const src of photos){
        if(typeof src==='string'&&src.startsWith('data:image/')){const uploaded=await window.BFPhotoStorage.uploadDataUrl(src,{transactionNo:root.querySelector('#txno')?.value||'nota',supplier:group.querySelector('.bf-supplier-select')?.value||'supplier'});next.push(uploaded.url);changed=true}else next.push(src)
      }
      if(changed)pv.dataset.photos=JSON.stringify(next)
    }
  }
  const businessDate=r=>{const v=String(r?.tanggal||r?.date||"").trim();const m=v.match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:v};
  const normSearch=v=>String(v||"").trim().toLocaleLowerCase("id-ID");
  function outgoingDateMatches(r){
    const d=businessDate(r);if(outgoingDateMode==="all")return true;
    if(outgoingDateMode==="today")return d===today();
    if(outgoingDateMode==="date")return !!outgoingDateFrom&&d===outgoingDateFrom;
    if(outgoingDateMode==="range"){
      if(outgoingDateFrom&&d<outgoingDateFrom)return false;
      if(outgoingDateTo&&d>outgoingDateTo)return false;
      return !!(outgoingDateFrom||outgoingDateTo)
    }
    return true
  }
  function outgoingCustomerMatches(g){const q=normSearch(outgoingCustomerQuery);return !q||normSearch(g?.customer||g?.name||"").includes(q)}
  function outgoingHistoryControls(){return `<div class="bf-out-history-tools">
    <div class="bf-out-filter-grid">
      <label>Filter Tanggal<select id="bf-out-date-mode"><option value="all" ${outgoingDateMode==="all"?"selected":""}>Semua</option><option value="today" ${outgoingDateMode==="today"?"selected":""}>Hari Ini</option><option value="date" ${outgoingDateMode==="date"?"selected":""}>Pilih Tanggal</option><option value="range" ${outgoingDateMode==="range"?"selected":""}>Rentang Tanggal</option></select></label>
      <label class="bf-out-date-from">Dari<input id="bf-out-date-from" type="date" value="${esc(outgoingDateFrom)}"></label>
      <label class="bf-out-date-to">Sampai<input id="bf-out-date-to" type="date" value="${esc(outgoingDateTo)}"></label>
      <label>Cari Customer<input id="bf-out-customer-search" type="search" value="${esc(outgoingCustomerQuery)}" placeholder="Nama Customer..."></label>
      <label>Status POS<select id="bf-pos-filter"><option value="all">Semua</option><option value="pending">Perlu Input POS</option><option value="entered">Sudah Input POS</option><option value="needs_update">Perlu Update POS</option></select></label>
    </div>
    <div class="bf-out-filter-actions"><button type="button" class="bf-op-secondary" id="bf-out-filter-reset">Reset Filter</button></div>
    <div id="bf-pos-summary" class="bf-pos-summary"></div>
  </div>`}
  function historyShell(){return incoming?`<div class="bf-op-table-wrap"><table class="bf-op-table"><thead><tr><th>No</th><th>Tanggal</th><th>Supplier / Supir</th><th>Item</th><th>Total Kg</th><th>Keterangan</th><th></th></tr></thead><tbody id="txbody"></tbody></table></div>`:`${outgoingHistoryControls()}<div id="txbody" class="bf-out-history"></div>`}
  function render(r={}){
    const tx=r.transaction_no||nextTx(prefix,r.tanggal||today(),data);
    root.querySelector('#bf-op-content').innerHTML=`<div class="bf-work-tabs"><button class="bf-work-tab active" id="bf-tab-transaksi">📝 Catatan</button><button class="bf-work-tab" id="bf-tab-tally">⚖️ Tally Timbangan</button></div><div id="bf-transaction-panel"><div class="bf-op-kpis"><div><span>Total Catatan</span><b>${data.length}</b></div><div><span>Total Kg</span><b>${data.reduce((s,x)=>s+kg(x),0).toLocaleString('id-ID')} kg</b></div><div><span>Fungsi</span><b>Buku Catatan</b></div><div><span>Koneksi</span><b>${navigator.onLine?'Online':'Offline'}</b></div></div>${incoming?incomingForm(r,tx):outgoingForm(r,tx)}<div class="bf-op-actions"><button class="bf-op-primary" id="txsave">💾 Simpan Catatan</button><button class="bf-op-secondary" id="txtally">⚖️ Buka Tally</button>${editing?'<button class="bf-op-secondary" id="txcancel">Batal Edit</button>':''}</div><div class="bf-op-card">${incoming?'<input id="txsearch" placeholder="Cari catatan..." style="width:100%;border:1px solid #cbd5e1;border-radius:9px;padding:9px;margin-bottom:8px">':''}${historyShell()}</div></div><div id="bf-inline-tally" class="bf-inline-tally"></div>`;
    incoming?bindIncoming():bindOutgoing();
    root.querySelector('#txsave').onclick=async()=>{
      if(!can('edit_data')&&!can('add_row'))return deny('edit_data');const saveButton=root.querySelector('#txsave');saveButton.disabled=true;
      try{await migrateLegacyPhotos()}catch(err){saveButton.disabled=false;alert(err?.message||'Foto nota gagal dipindahkan ke Storage.');return}
      const all=rows(key),old=editing?all.find(x=>(x._bf_uid||x.transaction_no)===(editing._bf_uid||editing.transaction_no)):null;let row={...(old||{}),_bf_uid:old?._bf_uid||uid(),transaction_no:old?.transaction_no||root.querySelector('#txno').value,tanggal:root.querySelector('#txdate').value,keterangan:root.querySelector('#txnotes').value};
      if(incoming){
        row.supir=root.querySelector('#txdriver').value;row.ongkos_kirim=num(root.querySelector('#txshipping').value);row.suppliers=[...root.querySelectorAll('.bf-supplier-group')].map(g=>{const pv=g.querySelector('.bf-supplier-photo-preview');let nota_fotos=[];try{nota_fotos=JSON.parse(pv.dataset.photos||'[]')}catch(_){nota_fotos=[]}return {supplier:g.querySelector('.bf-supplier-select').value,nota_fotos,nota_foto:nota_fotos[0]||'',items:[...g.querySelectorAll('.bf-in-item')].map(it=>({item:it.querySelector('.bf-in-item-name').value,satuan:it.querySelector('.bf-in-item-unit').value,timbangan:[...it.querySelectorAll('.bf-weight-input')].map(x=>num(x.value))}))}});row.supplier=row.suppliers.map(x=>x.supplier).filter(Boolean).join(', ');row.item=row.suppliers.flatMap(x=>x.items.map(i=>i.item)).filter(Boolean).join(', ');row.satuan='Multi';row.timbangan=row.suppliers.flatMap(x=>x.items.flatMap(i=>i.timbangan));row.weights=row.timbangan;row.nota_foto=row.suppliers.find(x=>x.nota_foto)?.nota_foto||''
      }else{
        const oldById=new Map((old?.customers||[]).map(g=>[customerGroupId(g),g]).filter(([id])=>id));
        row.customers=[...root.querySelectorAll('.bf-customer-group')].map(groupEl=>{
          const gid=groupEl.dataset.groupId||uid(),previous=oldById.get(gid),driverSelect=groupEl.querySelector('.bf-driver-select'),paymentSelect=groupEl.querySelector('.bf-payment-method'),g={group_id:gid,customer:groupEl.querySelector('.bf-customer-search')?.value.trim()||'',marketing:groupEl.querySelector('.bf-customer-marketing')?.value||'',items:[...groupEl.querySelectorAll('.bf-out-item')].map(it=>({item:it.querySelector('.bf-item-name').value,qty:it.querySelector('.bf-item-qty').value,satuan:it.querySelector('.bf-item-unit').value,timbangan:[...it.querySelectorAll('.bf-weight-input')].map(x=>num(x.value))}))};
          g.driver_id=canManageDelivery()?(driverSelect?.value||''):(previous?.driver_id||'');g.driver_name_snapshot=canManageDelivery()?(driverSelect?.selectedOptions?.[0]?.dataset?.driverName||''):(previous?.driver_name_snapshot||'');g.payment_method=canManageDelivery()?(paymentSelect?.value||'unknown'):(previous?.payment_method||'unknown');g.delivery_status=previous?.delivery_status||'pending';g.delivery_proofs=Array.isArray(previous?.delivery_proofs)?previous.delivery_proofs:[];g.cash_status=g.payment_method==='cash'?(previous?.payment_method==='cash'?(previous?.cash_status||'pending'):'pending'):'';g.cash_taken_at=previous?.cash_taken_at||'';g.cash_taken_by_id=previous?.cash_taken_by_id||'';g.cash_taken_by_name=previous?.cash_taken_by_name||'';g.cash_handed_over_at=previous?.cash_handed_over_at||'';g.cash_handed_over_by_id=previous?.cash_handed_over_by_id||'';g.cash_handed_over_by_name=previous?.cash_handed_over_by_name||'';
          g.pos_status=previous?posStatus(previous):POS_STATUS.pending;if(previous){g.pos_entered_at=previous.pos_entered_at||'';g.pos_entered_by_id=previous.pos_entered_by_id||'';g.pos_entered_by_email=previous.pos_entered_by_email||'';g.pos_entered_by_name=previous.pos_entered_by_name||'';g.pos_needs_update_at=previous.pos_needs_update_at||''}
          if(previous&&posStatus(previous)===POS_STATUS.entered&&customerSignature(previous)!==customerSignature(g)){g.pos_status=POS_STATUS.needs_update;g.pos_needs_update_at=new Date().toISOString()}
          return g;
        });
        row.customer=row.customers.map(x=>x.customer).filter(Boolean).join(', ');row.item=row.customers.flatMap(x=>x.items.map(i=>i.item)).filter(Boolean).join(', ');row.timbangan=row.customers.flatMap(x=>x.items.flatMap(i=>i.timbangan));row.weights=row.timbangan;const marketingNames=[...new Set(row.customers.map(x=>x.marketing).filter(Boolean))];row.marketing=marketingNames.length===1?marketingNames[0]:marketingNames.join(', ');row.commission_per_kg=0;row.totalKomisi=row.customers.reduce((total,g)=>{const emp=employees.find(x=>String(x.name||x.email||'')===String(g.marketing||''));const rate=num(emp?.commission||emp?.commission_per_kg||0);const groupKg=(g.items||[]).flatMap(i=>i.timbangan||[]).reduce((a,b)=>a+num(b),0);g.commission_per_kg=rate;g.totalKomisi=groupKg*rate;return total+g.totalKomisi},0)
      }
      if(old){const latest=all.find(x=>(x._bf_uid||x.transaction_no)===(old._bf_uid||old.transaction_no));if(!window.BFTransactionConflictCheck?.(old,latest)){alert('⚠️ Data telah berubah di perangkat lain. Muat versi terbaru sebelum melanjutkan.');saveButton.disabled=false;return}}
      const prepared=window.BFPrepareTransactionSave?window.BFPrepareTransactionSave(old,row):row,idx=all.findIndex(x=>(x._bf_uid||x.transaction_no)===(prepared._bf_uid||prepared.transaction_no));idx>=0?all[idx]=prepared:all.push(prepared);save(key,all);audit(old?'edit':'add',incoming?'barang_masuk':'barang_keluar',prepared.transaction_no||prepared._bf_uid,old||null,prepared,{});window.dispatchEvent(new CustomEvent('bf:local-change',{detail:{key}}));window.BFCloud?.push?.();editing=null;data=rows(key).filter(x=>!x.deleted_at);render()
    };
    const showTx=()=>{window.BFRestoreInlineTally?.();root.querySelector('#bf-transaction-panel').style.display='';root.querySelector('#bf-inline-tally').classList.remove('active');root.querySelector('#bf-tab-transaksi').classList.add('active');root.querySelector('#bf-tab-tally').classList.remove('active')},showTally=()=>{root.querySelector('#bf-transaction-panel').style.display='none';root.querySelector('#bf-tab-transaksi').classList.remove('active');root.querySelector('#bf-tab-tally').classList.add('active');window.BFMountInlineTally?.(incoming?'masuk':'keluar',root.querySelector('#bf-inline-tally'),showTx)};root.querySelector('#bf-tab-transaksi').onclick=showTx;root.querySelector('#bf-tab-tally').onclick=showTally;root.querySelector('#txtally').onclick=showTally;root.querySelector('#txcancel')?.addEventListener('click',()=>{editing=null;focusGroupId='';render()});
    if(incoming){draw('');root.querySelector('#txsearch').oninput=e=>draw(e.target.value)}
    else{
      const mode=root.querySelector('#bf-out-date-mode'),from=root.querySelector('#bf-out-date-from'),to=root.querySelector('#bf-out-date-to'),search=root.querySelector('#bf-out-customer-search'),pos=root.querySelector('#bf-pos-filter');
      const syncDateControl=()=>{const m=mode?.value||'all';root.querySelector('.bf-out-date-from')?.classList.toggle('bf-filter-hidden',!['date','range'].includes(m));root.querySelector('.bf-out-date-to')?.classList.toggle('bf-filter-hidden',m!=='range')};
      mode?.addEventListener('change',()=>{outgoingDateMode=mode.value;if(outgoingDateMode==='today'){outgoingDateFrom='';outgoingDateTo=''}else if(outgoingDateMode==='date'&&!outgoingDateFrom){outgoingDateFrom=today();if(from)from.value=outgoingDateFrom}syncDateControl();draw()});
      from?.addEventListener('change',()=>{outgoingDateFrom=from.value;draw()});to?.addEventListener('change',()=>{outgoingDateTo=to.value;draw()});
      search?.addEventListener('input',()=>{outgoingCustomerQuery=search.value;draw()});pos?.addEventListener('change',()=>draw());
      root.querySelector('#bf-out-filter-reset')?.addEventListener('click',()=>{outgoingDateMode='all';outgoingDateFrom='';outgoingDateTo='';outgoingCustomerQuery='';render(editing||{})});
      syncDateControl();draw();
      if(editing&&focusGroupId){const target=[...root.querySelectorAll('#bf-customer-groups .bf-customer-group')].find(g=>g.dataset.groupId===focusGroupId);if(target){target.classList.add('bf-customer-focus');target.scrollIntoView?.({behavior:'smooth',block:'center'});target.querySelector('.bf-customer-search')?.focus()}focusGroupId=''}
    }
  }
  function historyCustomerBlock(tx,g){
    const status=posStatus(g),total=DM.groupTotal(g),gid=customerGroupId(g),proofs=Array.isArray(g.delivery_proofs)?g.delivery_proofs:[],txid=tx._bf_uid||tx.transaction_no||'';return `<div class="bf-history-customer" data-group-id="${esc(gid)}"><div class="bf-history-customer-main"><div><b>${esc(g.customer||'Customer tidak tercatat')}</b><small>${esc(g.marketing?`Marketing: ${g.marketing}`:'Tanpa Marketing')}</small></div><span class="bf-pos-badge ${posClass(status)}">${esc(posLabel(status))}</span></div><div class="bf-history-customer-meta"><span>${num(total).toLocaleString('id-ID')} kg</span><span>${esc(posMeta(g))}</span></div><div class="bf-delivery-history-meta"><span>Supir: <b>${esc(g.driver_name_snapshot||'Belum ditugaskan')}</b></span><span>Pengantaran: <b>${esc(deliveryLabel(g.delivery_status||'pending'))}</b></span><span>Pembayaran: <b>${esc(paymentLabel(g.payment_method||'unknown'))}</b></span>${g.payment_method==='cash'?`<span class="cash">Cash: <b>${esc(cashLabel(g))}</b></span>`:''}<span>📷 <b>${proofs.length}</b> Bukti</span></div>${(proofs.length||(canManageDelivery()&&g.payment_method==='cash'&&g.cash_status==='carried'))?`<div class="bf-history-delivery-actions">${proofs.length?`<button class="bf-op-secondary txproof" data-tx="${esc(txid)}" data-group="${esc(gid)}">Lihat Bukti Pengantaran</button>`:''}${canManageDelivery()&&g.payment_method==='cash'&&g.cash_status==='carried'?` <button class="bf-op-secondary txcashhandover" data-tx="${esc(txid)}" data-group="${esc(gid)}">Konfirmasi Uang Diserahkan</button>`:''}</div>`:''}${can('edit_data')||can('add_row')?`<div class="bf-history-pos-actions"><button class="bf-op-secondary txeditcustomer" data-tx="${esc(txid)}" data-group="${esc(gid)}">✎ Edit Customer</button>${status!==POS_STATUS.entered?`<button class="bf-op-secondary txpos" data-tx="${esc(txid)}" data-group="${esc(gid)}">✓ ${status===POS_STATUS.needs_update?'Sudah Diperbarui di POS':'Sudah Input POS'}</button>`:`<button class="bf-op-secondary txposreset" data-tx="${esc(txid)}" data-group="${esc(gid)}">Tandai Perlu Input</button>`}</div>`:''}</div>`
  }
  function draw(q){
    const body=root.querySelector('#txbody');if(!body)return;const query=String(q||'').toLowerCase(),z=incoming?data.filter(r=>JSON.stringify(r).toLowerCase().includes(query)):data.filter(outgoingDateMatches);
    if(incoming){body.innerHTML=z.slice().reverse().map(r=>{let party=Array.isArray(r.suppliers)?r.suppliers.map(x=>x.supplier).filter(Boolean).join(', '):r.supplier;if(r.supir)party=[party,r.supir].filter(Boolean).join(' / ');const items=Array.isArray(r.suppliers)?r.suppliers.flatMap(x=>(x.items||[]).map(i=>i.item)).filter(Boolean).join(', '):r.item;return `<tr><td><b>${esc(r.transaction_no||'-')}</b></td><td>${esc(r.tanggal||'-')}</td><td>${esc(party||'-')}</td><td>${esc(items||'-')}</td><td>${kg(r).toLocaleString('id-ID')} kg</td><td>${esc(r.keterangan||r.catatan||'-')}</td><td><button class="bf-op-secondary txedit" data-id="${esc(r._bf_uid||r.transaction_no||'')}">Edit</button> <button class="bf-op-secondary txdel" data-id="${esc(r._bf_uid||r.transaction_no||'')}">Hapus</button></td></tr>`}).join('')||'<tr><td colspan="7">Belum ada catatan.</td></tr>'
    }else{
      const filter=root.querySelector('#bf-pos-filter')?.value||'all';let pending=0,entered=0,needs=0,cashCarried=0,matchedCustomers=0;
      const view=z.map(r=>{const groups=DM.customerGroups(r)||[],searched=groups.filter(outgoingCustomerMatches),visible=filter==='all'?searched:searched.filter(g=>posStatus(g)===filter);return {r,groups,searched,visible}}).filter(x=>x.visible.length);
      z.forEach(r=>(DM.customerGroups(r)||[]).filter(outgoingCustomerMatches).forEach(g=>{matchedCustomers++;const st=posStatus(g);if(st===POS_STATUS.entered)entered++;else if(st===POS_STATUS.needs_update)needs++;else pending++;if(g.payment_method==='cash'&&g.cash_status==='carried')cashCarried++}));
      const summary=root.querySelector('#bf-pos-summary');if(summary)summary.innerHTML=`<span><b>${matchedCustomers}</b> Customer</span><span><b>${pending}</b> Perlu Input</span><span><b>${entered}</b> Sudah Input</span><span><b>${needs}</b> Perlu Update</span>${canManageDelivery()?`<span class="cash"><b>${cashCarried}</b> Cash Dibawa Supir</span>`:''}`;
      const cards=view.slice().reverse().map(({r,groups,visible})=>{const visibleKg=visible.reduce((sum,g)=>sum+DM.groupTotal(g),0),scoped=visible.length!==groups.length;return `<article class="bf-out-history-card"><header><div><b>${esc(r.transaction_no||'-')}</b><span>${esc(businessDate(r)||'-')}${scoped?` • ${visible.length}/${groups.length} Customer`:''}</span></div><strong>${visibleKg.toLocaleString('id-ID')} kg</strong></header><div class="bf-history-customers">${visible.map(g=>historyCustomerBlock(r,g)).join('')}</div><footer><span>${esc(r.keterangan||r.catatan||'')}</span><div><button class="bf-op-secondary txedit" data-id="${esc(r._bf_uid||r.transaction_no||'')}">Edit Transaksi</button> <button class="bf-op-secondary txdel" data-id="${esc(r._bf_uid||r.transaction_no||'')}">Hapus</button></div></footer></article>`});const hasCustomerQuery=!!normSearch(outgoingCustomerQuery),hasDateFilter=outgoingDateMode!=='all';body.innerHTML=cards.join('')||`<div class="bf-op-empty">${hasCustomerQuery?'Customer tidak ditemukan.':hasDateFilter?'Belum ada Barang Keluar pada tanggal/periode ini.':'Belum ada Customer dengan status tersebut.'}</div>`;
      body.querySelectorAll('.txeditcustomer').forEach(b=>b.onclick=()=>{const tx=data.find(x=>(x._bf_uid||x.transaction_no)===b.dataset.tx),gid=b.dataset.group;if(!tx||!(DM.customerGroups(tx)||[]).some(g=>customerGroupId(g)===gid))return;editing=tx;focusGroupId=gid;render(editing)});
      body.querySelectorAll('.txpos').forEach(b=>b.onclick=async()=>{const tx=data.find(x=>(x._bf_uid||x.transaction_no)===b.dataset.tx),g=tx?.customers?.find(x=>customerGroupId(x)===b.dataset.group);if(!tx||!g)return;if(!confirm(`Tandai ${g.customer||'Customer'} sebagai sudah diinput/diperbarui di POS?\n\nTotal: ${DM.groupTotal(g).toLocaleString('id-ID')} kg`))return;await updatePosStatus(b.dataset.tx,b.dataset.group,POS_STATUS.entered);draw()});
      body.querySelectorAll('.txposreset').forEach(b=>b.onclick=async()=>{const tx=data.find(x=>(x._bf_uid||x.transaction_no)===b.dataset.tx),g=tx?.customers?.find(x=>customerGroupId(x)===b.dataset.group);if(!confirm(`Tandai ${g?.customer||'Customer'} kembali sebagai Perlu Input POS?`))return;await updatePosStatus(b.dataset.tx,b.dataset.group,POS_STATUS.pending);draw()})
      body.querySelectorAll('.txproof').forEach(b=>b.onclick=()=>{const tx=data.find(x=>(x._bf_uid||x.transaction_no)===b.dataset.tx),g=tx?.customers?.find(x=>customerGroupId(x)===b.dataset.group);if(g)delivery().openProofGallery?.(g.delivery_proofs||[],g.customer||'Customer')});
      body.querySelectorAll('.txcashhandover').forEach(b=>b.onclick=async()=>{if(!canManageDelivery())return;const all=rows(key),i=all.findIndex(x=>(x._bf_uid||x.transaction_no)===b.dataset.tx),g=all[i]?.customers?.find(x=>customerGroupId(x)===b.dataset.group);if(!g||g.payment_method!=='cash'||g.cash_status!=='carried')return;if(!confirm(`Konfirmasi uang sudah diserahkan?\n\nCustomer: ${g.customer||'Customer'}\nSupir: ${g.driver_name_snapshot||'Supir'}\n\nStatus ini berarti uang telah diserahkan kembali kepada pihak Bintang Frozen.`))return;const before=JSON.parse(JSON.stringify(g)),me=window.BFCore.user(),now=new Date().toISOString();g.cash_status='handed_over';g.cash_handed_over_at=now;g.cash_handed_over_by_id=me.id||'';g.cash_handed_over_by_name=me.name||me.email||'';save(key,all);audit('cash_handed_over','barang_keluar',all[i].transaction_no||all[i]._bf_uid,before,g,{group_id:b.dataset.group,customer:g.customer||''});window.BFCloud?.push?.();data=rows(key).filter(x=>!x.deleted_at);draw()});
    }
    body.querySelectorAll('.txedit').forEach(b=>b.onclick=()=>{focusGroupId='';editing=data.find(x=>(x._bf_uid||x.transaction_no)===b.dataset.id);render(editing||{})});body.querySelectorAll('.txdel').forEach(b=>b.onclick=()=>{if(!can('delete_data'))return deny('delete_data');if(!confirm('Pindahkan catatan ini ke Data Terhapus?'))return;window.BFSoftDeleteTransaction?.(key,b.dataset.id);data=rows(key).filter(v=>!v.deleted_at);render()})
  }
  render();
}
window.BFOpenTransactionsIn=()=>transactionCenter("in");
window.BFOpenTransactionsOut=()=>transactionCenter("out");
})();
