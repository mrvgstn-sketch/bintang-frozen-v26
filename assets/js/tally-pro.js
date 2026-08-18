(function(){
"use strict";
const KEY="bf_tally_pro_v26";
const DETAIL="bf_tally_detail_v26";
const COLKEY="bf_tally_cols_v26";
let mode="keluar", rows=[], details={}, cols=20, editing=null;
const $=id=>document.getElementById(id);
const num=v=>{if(v===null||v===undefined||v==="")return 0; let n=Number(String(v).replace(",", ".")); return Number.isFinite(n)?n:0};
const fmt=n=>num(n).toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2});
const nowLocal=()=>{const d=new Date(); const p=n=>String(n).padStart(2,"0"); return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes())};
const load=()=>{try{details=JSON.parse(localStorage.getItem(DETAIL)||"{}")}catch{details={}}; cols=Math.max(5,Math.min(50,Number(localStorage.getItem(COLKEY)||20))); syncRows()};
const syncRows=()=>{
  const sourceKey=mode==="keluar"?"bf_keluar_v26":"bf_masuk_v26";
  let src=[]; try{src=JSON.parse(localStorage.getItem(sourceKey)||"[]")}catch{}
  let saved={}; try{saved=JSON.parse(localStorage.getItem(KEY)||"{}")}catch{}
  if(saved[mode] && Array.isArray(saved[mode])){
    rows=saved[mode];
  }else{
    rows=src.map((r,i)=>({
      id:r.id||("t"+Date.now()+"_"+i),
      customer:r.customer||r.customerName||"",
      supplier:r.supplier||"",
      item:r.item||"",
      qty:r.qty||"",
      satuan:r.satuan||"",
      tanggal:r.tanggal||r.date||"",
      status:r.status||"",
      locked:r.locked===true,
      createdAt:r.createdAt||new Date().toISOString(),
      weights:Array.from({length:Math.max(cols,Array.isArray(r.timbangan)?r.timbangan.length:0)},(_,j)=>Array.isArray(r.timbangan)?num(r.timbangan[j]):0),
      note:r.keterangan||""
    }));
  }
  rows.forEach(r=>{if(!Array.isArray(r.weights))r.weights=[];while(r.weights.length<cols)r.weights.push(0);});
};
const persist=()=>{let all={};try{all=JSON.parse(localStorage.getItem(KEY)||"{}")}catch{};all[mode]=rows;localStorage.setItem(KEY,JSON.stringify(all));localStorage.setItem(DETAIL,JSON.stringify(details));localStorage.setItem(COLKEY,String(cols))};
const sourceLabel=r=>mode==="masuk"?(r.supplier||"—"):(r.customer||"—");
const sourceRows=()=>rows.filter(r=>{const q=($("bfTallySearch").value||"").toLowerCase(); const text=(sourceLabel(r)+" "+(r.item||"")).toLowerCase(); const total=r.weights.reduce((a,b)=>a+num(b),0); const f=$("bfTallyFilter").value; return (!q||text.includes(q))&&(f==="all"||(f==="filled"&&total>0)||(f==="empty"&&total<=0))});
const detailKey=(r,c)=>r.id+"__"+c;
const bfRole=()=>window.BFCurrentUser?.()?.profile?.role||"";
const bfCan=p=>window.BFCan?.(p)!==false;
const bfAudit=(...a)=>window.BFLogActivity?.(...a);
const bfIsOwner=()=>bfRole()==="owner";
function bfNeed(p,msg){if(bfCan(p))return true;alert(msg||"Akses ditolak. Izin ini belum diberikan Owner.");return false;}

function render(){
  const visible=sourceRows(), th=$("bfTallyThead"), tb=$("bfTallyTbody");
  th.innerHTML="<tr><th class='bfTally-sticky' style='left:0;width:39px'>No</th><th class='bfTally-sticky2' style='left:39px;min-width:145px'>"+(mode==="masuk"?"SUPPLIER":"CUSTOMER")+"</th><th style='min-width:130px'>ITEM</th><th style='min-width:70px'>QTY</th><th style='min-width:65px'>SATUAN</th>"+Array.from({length:cols},(_,i)=>"<th class='real'>R"+(i+1)+"<br><span style='font-size:8px;font-weight:500'>REAL KG</span></th>").join("")+"<th style='min-width:90px'>TOTAL KG</th><th style='min-width:85px'>AVG KG</th><th style='min-width:60px'>COUNT</th><th style='min-width:100px'>STATUS</th><th style='min-width:170px'>KETERANGAN</th><th>×</th></tr>";
  tb.innerHTML=visible.map((r,idx)=>{
    const vals=Array.from({length:cols},(_,c)=>num(r.weights[c]));
    const total=vals.reduce((a,b)=>a+b,0), count=vals.filter(v=>v>0).length, avg=count?total/count:0;
    const cells=vals.map((v,c)=>{
      const d=details[detailKey(r,c)]||{};
      return "<td class='bfTally-detail' data-row='"+r.id+"' data-col='"+c+"'><input class='bfTally-real' data-row='"+r.id+"' data-col='"+c+"' value='"+(v?String(v).replace(".",","):"")+"' placeholder='0,00'><div class='bfTally-cell-meta'>"+(d.operator?("👤 "+esc(d.operator)):d.time?"🕒 "+new Date(d.time).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}):"klik detail")+"</div></td>"
    }).join("");
    return "<tr><td class='bfTally-sticky' style='left:0;text-align:center;font-weight:800'>"+(idx+1)+"</td><td class='bfTally-sticky2' style='left:39px'><input class='bfTally-input' style='width:140px;height:30px' data-main='source' data-row='"+r.id+"' value='"+esc(sourceLabel(r))+"' placeholder='"+(mode==="masuk"?"Supplier":"Customer")+"'></td><td><input class='bfTally-input' style='width:125px;height:30px' data-main='item' data-row='"+r.id+"' value='"+esc(r.item||"")+"'></td><td><input class='bfTally-input' style='width:65px;height:30px;text-align:center' data-main='qty' data-row='"+r.id+"' value='"+esc(r.qty||"")+"'></td><td><input class='bfTally-input' style='width:60px;height:30px' data-main='satuan' data-row='"+r.id+"' value='"+esc(r.satuan||"")+"'></td>"+cells+"<td class='bfTally-total'>"+fmt(total)+"</td><td>"+fmt(avg)+"</td><td style='text-align:center'>"+count+"</td><td>"+(count===cols?"<span class='bfTally-badge bfTally-ok'>LENGKAP</span>":count?"<span class='bfTally-badge bfTally-warn'>"+count+"/"+cols+" TERISI</span>":"<span class='bfTally-badge' style='background:#f1f5f9;color:#64748b'>KOSONG</span>")+"</td><td><input class='bfTally-input' style='width:160px;height:30px' data-main='note' data-row='"+r.id+"' value='"+esc(r.note||"")+"'></td><td><button class='bfTally-btn danger' style='padding:6px' data-del='"+r.id+"'>×</button></td></tr>"
  }).join("");
  const all=visible.flatMap(r=>r.weights.map(num)), total=all.reduce((a,b)=>a+b,0), nonzero=all.filter(v=>v>0);
  $("bfTallyRows").textContent=visible.length; $("bfTallyCount").textContent=nonzero.length; $("bfTallyTotal").textContent=fmt(total)+" kg"; $("bfTallyAvg").textContent=fmt(nonzero.length?total/nonzero.length:0)+" kg";
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function openDetail(rid,c){
  editing={rid,c}; const d=details[detailKey({id:rid},c)]||{}; const r=rows.find(x=>x.id===rid); $("bfTallyDetailTitle").textContent=(mode==="masuk"?"Barang Masuk":"Barang Keluar")+" • "+(r?.item||"Item")+" • R"+(c+1);
  $("bfTallyDWeight").value=r?String(num(r.weights[c])||"").replace(".",","):""; $("bfTallyDScale").value=d.scale||""; $("bfTallyDOperator").value=d.operator||""; $("bfTallyDTime").value=d.time||nowLocal(); $("bfTallyDGross").value=d.gross||""; $("bfTallyDTare").value=d.tare||""; $("bfTallyDNote").value=d.note||""; $("bfTallyDetail").style.display="flex"; requestAnimationFrame(()=>$("bfTallyDWeight").focus())
}
$("bfTallyClose").onclick=()=>{$("bfTallyOverlay").style.display="none"};
$("bfTallyOverlay").addEventListener("click",e=>{if(e.target.id==="bfTallyOverlay")$("bfTallyOverlay").style.display="none"});
$("bfTallyMode").onchange=e=>{mode=e.target.value;load();render()};
$("bfTallySearch").oninput=render; $("bfTallyFilter").onchange=render;
$("bfTallyAddCol").onclick=()=>{if(!bfNeed("edit_data"))return;if(cols>=50)return alert("Maksimal 50 kolom timbangan real.");cols++;rows.forEach(r=>r.weights.push(0));persist();render()};
$("bfTallyAddRow").onclick=()=>{if(!bfNeed("add_row"))return;const r={id:"t25_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),customer:"",supplier:"",item:"",qty:"",satuan:"",tanggal:(new Date(Date.now()-new Date().getTimezoneOffset()*60000)).toISOString().slice(0,10),status:"Aktif",locked:false,createdAt:new Date().toISOString(),weights:Array(cols).fill(0),note:""};rows.push(r);persist();render();bfAudit("add_tally_row","tally_row",r.id,null,r,{mode});};
$("bfTallyTbody").addEventListener("click",async e=>{
  const del=e.target.closest("[data-del]");
  if(del){
    if(!bfNeed("delete_data"))return;
    const r=rows.find(x=>x.id===del.dataset.del); if(!r)return;
    if(window.BFIsHistoryRow?.(r) && window.BFCurrentUser?.()?.profile?.role!=="owner"){
      const reason=prompt("Data ini termasuk histori/terkunci. Jelaskan alasan penghapusan:");
      if(reason===null)return;
      const ok=await window.BFRequestHistoryChange?.("tally_row",r.id,{action:"delete",row:r},{action:"delete",row:r},reason);
      if(ok!==true)return;
    }
    const removed=rows.find(x=>x.id===del.dataset.del); rows=rows.filter(x=>x.id!==del.dataset.del);persist();render();bfAudit("delete_tally_row","tally_row",del.dataset.del,removed,null,{mode});return
  }
  const cell=e.target.closest(".bfTally-detail"); if(cell&&!e.target.classList.contains("bfTally-real"))openDetail(cell.dataset.row,Number(cell.dataset.col));
});
$("bfTallyTbody").addEventListener("input",async e=>{
  const t=e.target, rid=t.dataset.row; if(!rid)return;
  if(t.classList.contains("bfTally-real")){ if(!bfNeed(bfIsOwner()?"edit_weight":"input_weight")) {render();return;} } else if(!bfNeed("edit_data")){render();return;} const r=rows.find(x=>x.id===rid); if(!r)return;
  if(t.classList.contains("bfTally-real")){
    const c=Number(t.dataset.col), before=JSON.parse(JSON.stringify(r)), after=JSON.parse(JSON.stringify(r));
    after.weights[c]=num(t.value);
    if(window.BFIsHistoryRow?.(r) && window.BFCurrentUser?.()?.profile?.role!=="owner"){
      const reason=prompt("Data histori. Jelaskan alasan perubahan berat real:");
      if(reason===null){render();return}
      const ok=await window.BFRequestHistoryChange?.("tally_weight",r.id,before,after,reason);
      if(ok!==true){render();return}
    }
    r.weights[c]=num(t.value); persist(); render(); bfAudit("input_weight","tally_weight",r.id,before, r,{mode,col:c+1});
    requestAnimationFrame(()=>{const el=document.querySelector('.bfTally-real[data-row="'+rid+'"][data-col="'+c+'"]'); if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length)}}); return
  }
  const field=t.dataset.main; let val=t.value; const before=JSON.parse(JSON.stringify(r)); const after=JSON.parse(JSON.stringify(r));
  if(field==="source") mode==="masuk"?after.supplier=val:after.customer=val; else after[field]=val;
  if(window.BFIsHistoryRow?.(r) && window.BFCurrentUser?.()?.profile?.role!=="owner"){
    const reason=prompt("Data histori. Jelaskan alasan perubahan:");
    if(reason===null){render();return}
    const ok=await window.BFRequestHistoryChange?.("tally_row",r.id,before,after,reason);
    if(ok!==true){render();return}
  }
  if(field==="source") mode==="masuk"?r.supplier=val:r.customer=val; else r[field]=val; persist(); bfAudit("edit_tally_row","tally_row",r.id,before,r,{mode,field});
});
$("bfTallyCancelDetail").onclick=()=>{$("bfTallyDetail").style.display="none";editing=null};
$("bfTallySaveDetail").onclick=async()=>{
  if(!editing)return; if(!bfNeed("edit_weight"))return; const r=rows.find(x=>x.id===editing.rid), c=editing.c; if(!r)return;
  const k=detailKey(r,c), d={weight:num($("bfTallyDWeight").value),scale:$("bfTallyDScale").value.trim(),operator:$("bfTallyDOperator").value.trim(),time:$("bfTallyDTime").value||nowLocal(),gross:num($("bfTallyDGross").value),tare:num($("bfTallyDTare").value),note:$("bfTallyDNote").value.trim(),updatedAt:new Date().toISOString()};
  const before=JSON.parse(JSON.stringify({row:r,detail:details[k]||null}));
  const after=JSON.parse(JSON.stringify({row:{...r,weights:r.weights.map((x,i)=>i===c?d.weight:x)},detail:d}));
  if(window.BFIsHistoryRow?.(r) && window.BFCurrentUser?.()?.profile?.role!=="owner"){
    const reason=prompt("Data histori. Jelaskan alasan perubahan detail timbangan:");
    if(reason===null)return;
    const ok=await window.BFRequestHistoryChange?.("tally_detail",r.id,before,after,reason);
    if(ok!==true)return;
  }
  r.weights[c]=d.weight; details[k]=d; persist(); $("bfTallyDetail").style.display="none"; editing=null; render(); bfAudit("edit_tally_detail","tally_detail",r.id,before,{row:r,detail:d},{mode,col:c+1});
};
$("bfTallyCombined").onclick=()=>{
  persist();
  const modes=["masuk","keluar"];
  const all=[];
  const saved=JSON.parse(localStorage.getItem(KEY)||"{}");
  const savedDetails=details||{};
  modes.forEach(md=>{
    const srcKey=md==="keluar"?"bf_keluar_v26":"bf_masuk_v26";
    let src=[]; try{src=JSON.parse(localStorage.getItem(srcKey)||"[]")}catch{}
    const rr=Array.isArray(saved[md])?saved[md]:src.map((x,i)=>({id:x.id||("legacy_"+i),customer:x.customer||x.customerName||"",supplier:x.supplier||"",item:x.item||"",qty:x.qty||"",satuan:x.satuan||"",weights:Array.isArray(x.timbangan)?x.timbangan.map(num):[],note:x.keterangan||""}));
    rr.forEach(r=>{
      const weights=Array.from({length:cols},(_,i)=>num(r.weights?.[i]));
      const total=weights.reduce((a,b)=>a+b,0), count=weights.filter(x=>x>0).length;
      const row=[md==="masuk"?"BARANG MASUK":"BARANG KELUAR",md==="masuk"?(r.supplier||""):(r.customer||""),r.item||"",r.qty||"",r.satuan||""];
      weights.forEach((w,i)=>{const d=savedDetails[(r.id||"")+"__"+i]||{};row.push(w||"");row.push(d.scale||"");row.push(d.operator||"");row.push(d.time||"");row.push(d.gross||"");row.push(d.tare||"");row.push(d.note||"")});
      row.push(total.toFixed(2),count? (total/count).toFixed(2):"0.00",count,count===cols?"LENGKAP":count?"BELUM LENGKAP":"KOSONG",r.note||"");
      all.push(row);
    });
  });
  const head=["Jenis","Customer / Supplier","Item","Qty","Satuan"];
  for(let i=0;i<cols;i++) head.push("R"+(i+1)+" Berat Real (kg)","R"+(i+1)+" Timbangan","R"+(i+1)+" Operator","R"+(i+1)+" Waktu","R"+(i+1)+" Gross","R"+(i+1)+" Tare","R"+(i+1)+" Catatan");
  head.push("Total Kg","Rata-rata Kg","Jumlah Timbang","Status","Keterangan");
  const csv=[head,...all].map(row=>row.map(x=>'"'+String(x??"").replace(/"/g,'""')+'"').join(",")).join("\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob), a=document.createElement("a"); a.href=url; a.download="BintangFrozen_EXPORT_GABUNGAN_TALLY_"+(new Date(Date.now()-new Date().getTimezoneOffset()*60000)).toISOString().slice(0,10)+".csv"; a.click(); URL.revokeObjectURL(url);
};
$("bfTallyCombinedPdf").onclick=()=>window.BFPdfExport?.open?.();
$("bfTallyJson").onclick=()=>window.BFOpenBackup?.();
$("bfTallyCsv").onclick=()=>{const head=["No",mode==="masuk"?"Supplier":"Customer","Item","Qty","Satuan",...Array.from({length:cols},(_,i)=>"R"+(i+1)+" Real (kg)"),"Total Kg","Rata-rata Kg","Jumlah Timbang","Status","Keterangan"]; const body=sourceRows().map((r,i)=>{const w=r.weights.slice(0,cols).map(num),t=w.reduce((a,b)=>a+b,0),c=w.filter(x=>x>0).length;return [i+1,sourceLabel(r),r.item||"",r.qty||"",r.satuan||"",...w,t.toFixed(2),c?(t/c).toFixed(2):"0.00",c,c===cols?"LENGKAP":c?"BELUM LENGKAP":"KOSONG",r.note||""]}); const csv=[head,...body].map(row=>row.map(x=>'"'+String(x??"").replace(/"/g,'""')+'"').join(",")).join("\\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\\ufeff"+csv],{type:"text/csv;charset=utf-8"}));a.download="BintangFrozen_TallyPro_"+(new Date(Date.now()-new Date().getTimezoneOffset()*60000)).toISOString().slice(0,10)+".csv";a.click()};
$("bfTallyPrint").onclick=()=>{const w=window.open("","_blank"); if(!w)return; const title=mode==="masuk"?"BARANG MASUK":"BARANG KELUAR"; const head=Array.from({length:cols},(_,i)=>"<th>R"+(i+1)+"<br>REAL KG</th>").join(""); const body=sourceRows().map((r,i)=>{const vals=r.weights.slice(0,cols),t=vals.reduce((a,b)=>a+num(b),0);return "<tr><td>"+(i+1)+"</td><td>"+esc(sourceLabel(r))+"</td><td>"+esc(r.item||"")+"</td><td>"+esc(r.qty||"")+" "+esc(r.satuan||"")+"</td>"+vals.map(v=>"<td>"+(num(v)?fmt(v):"")+"</td>").join("")+"<td><b>"+fmt(t)+"</b></td></tr>"}).join(""); w.document.write("<!doctype html><html><head><title>Tally "+title+"</title></head><body><h2>BINTANG FROZEN — TALLY SHEET "+title+"</h2><div class='meta'>Dicetak: "+new Date().toLocaleString("id-ID")+" • Kolom real: "+cols+"</div><table><thead><tr><th>No</th><th>"+(mode==="masuk"?"Supplier":"Customer")+"</th><th>Item</th><th>Qty</th>"+head+"<th>Total Kg</th></tr></thead><tbody>"+body+"</tbody></table></body></html>");w.document.close();requestAnimationFrame(()=>w.print())};
load();
})();
