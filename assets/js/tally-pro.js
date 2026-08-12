(function(){
"use strict";
const KEY="bf_tally_pro_v25";
const DETAIL="bf_tally_detail_v25";
const COLKEY="bf_tally_cols_v25";
let mode="keluar", rows=[], details={}, cols=20, editing=null;
const $=id=>document.getElementById(id);
const num=v=>{if(v===null||v===undefined||v==="")return 0; let n=Number(String(v).replace(",", ".")); return Number.isFinite(n)?n:0};
const fmt=n=>num(n).toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2});
const nowLocal=()=>{const d=new Date(); const p=n=>String(n).padStart(2,"0"); return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes())};
const load=()=>{try{details=JSON.parse(localStorage.getItem(DETAIL)||"{}")}catch{details={}}; cols=Math.max(5,Math.min(50,Number(localStorage.getItem(COLKEY)||20))); syncRows()};
const syncRows=()=>{
  const sourceKey=mode==="keluar"?"bf_keluar_v23_manual":"bf_masuk_v23_manual";
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
const sourceRows=()=>rows.filter(r=>{const q=($("bf25Search").value||"").toLowerCase(); const text=(sourceLabel(r)+" "+(r.item||"")).toLowerCase(); const total=r.weights.reduce((a,b)=>a+num(b),0); const f=$("bf25Filter").value; return (!q||text.includes(q))&&(f==="all"||(f==="filled"&&total>0)||(f==="empty"&&total<=0))});
const detailKey=(r,c)=>r.id+"__"+c;
const bfRole=()=>window.BFCurrentUser?.()?.profile?.role||"";
const bfCan=p=>window.BFCan?.(p)!==false;
const bfAudit=(...a)=>window.BFLogActivity?.(...a);
const bfIsOwner=()=>bfRole()==="owner";
function bfNeed(p,msg){if(bfCan(p))return true;alert(msg||"Akses ditolak. Izin ini belum diberikan Owner.");return false;}

function render(){
  const visible=sourceRows(), th=$("bf25Thead"), tb=$("bf25Tbody");
  th.innerHTML="<tr><th class='bf25-sticky' style='left:0;width:39px'>No</th><th class='bf25-sticky2' style='left:39px;min-width:145px'>"+(mode==="masuk"?"SUPPLIER":"CUSTOMER")+"</th><th style='min-width:130px'>ITEM</th><th style='min-width:70px'>QTY</th><th style='min-width:65px'>SATUAN</th>"+Array.from({length:cols},(_,i)=>"<th class='real'>R"+(i+1)+"<br><span style='font-size:8px;font-weight:500'>REAL KG</span></th>").join("")+"<th style='min-width:90px'>TOTAL KG</th><th style='min-width:85px'>AVG KG</th><th style='min-width:60px'>COUNT</th><th style='min-width:100px'>STATUS</th><th style='min-width:170px'>KETERANGAN</th><th>×</th></tr>";
  tb.innerHTML=visible.map((r,idx)=>{
    const vals=Array.from({length:cols},(_,c)=>num(r.weights[c]));
    const total=vals.reduce((a,b)=>a+b,0), count=vals.filter(v=>v>0).length, avg=count?total/count:0;
    const cells=vals.map((v,c)=>{
      const d=details[detailKey(r,c)]||{};
      return "<td class='bf25-detail' data-row='"+r.id+"' data-col='"+c+"'><input class='bf25-real' data-row='"+r.id+"' data-col='"+c+"' value='"+(v?String(v).replace(".",","):"")+"' placeholder='0,00'><div class='bf25-cell-meta'>"+(d.operator?("👤 "+esc(d.operator)):d.time?"🕒 "+new Date(d.time).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}):"klik detail")+"</div></td>"
    }).join("");
    return "<tr><td class='bf25-sticky' style='left:0;text-align:center;font-weight:800'>"+(idx+1)+"</td><td class='bf25-sticky2' style='left:39px'><input class='bf25-input' style='width:140px;height:30px' data-main='source' data-row='"+r.id+"' value='"+esc(sourceLabel(r))+"' placeholder='"+(mode==="masuk"?"Supplier":"Customer")+"'></td><td><input class='bf25-input' style='width:125px;height:30px' data-main='item' data-row='"+r.id+"' value='"+esc(r.item||"")+"'></td><td><input class='bf25-input' style='width:65px;height:30px;text-align:center' data-main='qty' data-row='"+r.id+"' value='"+esc(r.qty||"")+"'></td><td><input class='bf25-input' style='width:60px;height:30px' data-main='satuan' data-row='"+r.id+"' value='"+esc(r.satuan||"")+"'></td>"+cells+"<td class='bf25-total'>"+fmt(total)+"</td><td>"+fmt(avg)+"</td><td style='text-align:center'>"+count+"</td><td>"+(count===cols?"<span class='bf25-badge bf25-ok'>LENGKAP</span>":count?"<span class='bf25-badge bf25-warn'>"+count+"/"+cols+" TERISI</span>":"<span class='bf25-badge' style='background:#f1f5f9;color:#64748b'>KOSONG</span>")+"</td><td><input class='bf25-input' style='width:160px;height:30px' data-main='note' data-row='"+r.id+"' value='"+esc(r.note||"")+"'></td><td><button class='bf25-btn danger' style='padding:6px' data-del='"+r.id+"'>×</button></td></tr>"
  }).join("");
  const all=visible.flatMap(r=>r.weights.map(num)), total=all.reduce((a,b)=>a+b,0), nonzero=all.filter(v=>v>0);
  $("bf25Rows").textContent=visible.length; $("bf25Count").textContent=nonzero.length; $("bf25Total").textContent=fmt(total)+" kg"; $("bf25Avg").textContent=fmt(nonzero.length?total/nonzero.length:0)+" kg";
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function openDetail(rid,c){
  editing={rid,c}; const d=details[detailKey({id:rid},c)]||{}; const r=rows.find(x=>x.id===rid); $("bf25DetailTitle").textContent=(mode==="masuk"?"Barang Masuk":"Barang Keluar")+" • "+(r?.item||"Item")+" • R"+(c+1);
  $("bf25DWeight").value=r?String(num(r.weights[c])||"").replace(".",","):""; $("bf25DScale").value=d.scale||""; $("bf25DOperator").value=d.operator||""; $("bf25DTime").value=d.time||nowLocal(); $("bf25DGross").value=d.gross||""; $("bf25DTare").value=d.tare||""; $("bf25DNote").value=d.note||""; $("bfV25Detail").style.display="flex"; setTimeout(()=>$("bf25DWeight").focus(),50)
}
$("bfV25Fab").onclick=()=>{$("bf25CombinedPdf").click()};
$("bf25Close").onclick=()=>{$("bfV25Overlay").style.display="none"};
$("bfV25Overlay").addEventListener("click",e=>{if(e.target.id==="bfV25Overlay")$("bfV25Overlay").style.display="none"});
$("bf25Mode").onchange=e=>{mode=e.target.value;load();render()};
$("bf25Search").oninput=render; $("bf25Filter").onchange=render;
$("bf25AddCol").onclick=()=>{if(!bfNeed("edit_data"))return;if(cols>=50)return alert("Maksimal 50 kolom timbangan real.");cols++;rows.forEach(r=>r.weights.push(0));persist();render()};
$("bf25AddRow").onclick=()=>{if(!bfNeed("add_row"))return;const r={id:"t25_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),customer:"",supplier:"",item:"",qty:"",satuan:"",tanggal:(new Date(Date.now()-new Date().getTimezoneOffset()*60000)).toISOString().slice(0,10),status:"Aktif",locked:false,createdAt:new Date().toISOString(),weights:Array(cols).fill(0),note:""};rows.push(r);persist();render();bfAudit("add_tally_row","tally_row",r.id,null,r,{mode});};
$("bf25Tbody").addEventListener("click",async e=>{
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
  const cell=e.target.closest(".bf25-detail"); if(cell&&!e.target.classList.contains("bf25-real"))openDetail(cell.dataset.row,Number(cell.dataset.col));
});
$("bf25Tbody").addEventListener("input",async e=>{
  const t=e.target, rid=t.dataset.row; if(!rid)return;
  if(t.classList.contains("bf25-real")){ if(!bfNeed(bfIsOwner()?"edit_weight":"input_weight")) {render();return;} } else if(!bfNeed("edit_data")){render();return;} const r=rows.find(x=>x.id===rid); if(!r)return;
  if(t.classList.contains("bf25-real")){
    const c=Number(t.dataset.col), before=JSON.parse(JSON.stringify(r)), after=JSON.parse(JSON.stringify(r));
    after.weights[c]=num(t.value);
    if(window.BFIsHistoryRow?.(r) && window.BFCurrentUser?.()?.profile?.role!=="owner"){
      const reason=prompt("Data histori. Jelaskan alasan perubahan berat real:");
      if(reason===null){render();return}
      const ok=await window.BFRequestHistoryChange?.("tally_weight",r.id,before,after,reason);
      if(ok!==true){render();return}
    }
    r.weights[c]=num(t.value); persist(); render(); bfAudit("input_weight","tally_weight",r.id,before, r,{mode,col:c+1});
    setTimeout(()=>{const el=document.querySelector('.bf25-real[data-row="'+rid+'"][data-col="'+c+'"]'); if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length)}},0); return
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
$("bf25CancelDetail").onclick=()=>{$("bfV25Detail").style.display="none";editing=null};
$("bf25SaveDetail").onclick=async()=>{
  if(!editing)return; if(!bfNeed("edit_weight"))return; const r=rows.find(x=>x.id===editing.rid), c=editing.c; if(!r)return;
  const k=detailKey(r,c), d={weight:num($("bf25DWeight").value),scale:$("bf25DScale").value.trim(),operator:$("bf25DOperator").value.trim(),time:$("bf25DTime").value||nowLocal(),gross:num($("bf25DGross").value),tare:num($("bf25DTare").value),note:$("bf25DNote").value.trim(),updatedAt:new Date().toISOString()};
  const before=JSON.parse(JSON.stringify({row:r,detail:details[k]||null}));
  const after=JSON.parse(JSON.stringify({row:{...r,weights:r.weights.map((x,i)=>i===c?d.weight:x)},detail:d}));
  if(window.BFIsHistoryRow?.(r) && window.BFCurrentUser?.()?.profile?.role!=="owner"){
    const reason=prompt("Data histori. Jelaskan alasan perubahan detail timbangan:");
    if(reason===null)return;
    const ok=await window.BFRequestHistoryChange?.("tally_detail",r.id,before,after,reason);
    if(ok!==true)return;
  }
  r.weights[c]=d.weight; details[k]=d; persist(); $("bfV25Detail").style.display="none"; editing=null; render(); bfAudit("edit_tally_detail","tally_detail",r.id,before,{row:r,detail:d},{mode,col:c+1});
};
$("bf25Combined").onclick=()=>{
  persist();
  const modes=["masuk","keluar"];
  const all=[];
  const saved=JSON.parse(localStorage.getItem(KEY)||"{}");
  const savedDetails=details||{};
  modes.forEach(md=>{
    const srcKey=md==="keluar"?"bf_keluar_v23_manual":"bf_masuk_v23_manual";
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
$("bf25CombinedPdf").onclick=()=>{
  persist();
  // Offline professional PDF renderer. Tidak bergantung CDN, jsPDF, atau Print Dialog.
  const read=(key,def)=>{try{const v=JSON.parse(localStorage.getItem(key)||"null");return v??def}catch{return def}};
  const arr=v=>Array.isArray(v)?v:[];
  const n=v=>{const x=Number(String(v??"").replace(/,/g,"."));return Number.isFinite(x)?x:0};
  const money=v=>"Rp "+n(v).toLocaleString("id-ID");
  const kg=v=>n(v).toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2})+" kg";
  const clean=v=>String(v??"").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\uFFFF]/g,"").replace(/\s+/g," ").trim();
  const weights=r=>arr(r?.timbangan||r?.weights).map(n).filter(x=>x>0);
  const total=r=>weights(r).reduce((a,b)=>a+b,0);
  const avg=r=>{const w=weights(r);return w.length?total(r)/w.length:0};
  const via=v=>{const m={tunai:"Tunai",cash:"Tunai",qris:"QRIS",transfer:"Transfer",bca:"BCA",bni:"BNI",bri:"BRI",mandiri:"Mandiri",bsi:"BSI",debit:"Debit",kredit:"Kartu Kredit"};return m[String(v||"").toLowerCase()]||clean(v)||"-"};

  const masuk=window.BFPeriodFilter?BFPeriodFilter(arr(read("bf_masuk_v23_manual",[]))):arr(read("bf_masuk_v23_manual",[]));
  const keluar=window.BFPeriodFilter?BFPeriodFilter(arr(read("bf_keluar_v23_manual",[]))):arr(read("bf_keluar_v23_manual",[]));
  const hist=window.BFPeriodFilter?BFPeriodFilter(arr(read("bf_history",[]))):arr(read("bf_history",[]));
  const expenses=window.BFPeriodFilter?BFPeriodFilter(arr(read("bf_expenses",[]))):arr(read("bf_expenses",[]));
  const setoran=window.BFPeriodFilter?BFPeriodFilter(arr(read("bf_note_setoran_v23c",read("bf_note_setoran_v23b",[])))):arr(read("bf_note_setoran_v23c",read("bf_note_setoran_v23b",[])));
  const pengeluaran=window.BFPeriodFilter?BFPeriodFilter(arr(read("bf_note_pengeluaran_v23c",read("bf_note_pengeluaran_v23b",[])))):arr(read("bf_note_pengeluaran_v23c",read("bf_note_pengeluaran_v23b",[])));
  const sembako=window.BFPeriodFilter?BFPeriodFilter(arr(read("bf_note_sembako_v23c",[]))):arr(read("bf_note_sembako_v23c",[]));

  const totalMasuk=masuk.reduce((a,r)=>a+total(r),0);
  const totalKeluar=keluar.reduce((a,r)=>a+total(r),0);
  const totalExp=expenses.reduce((a,r)=>a+n(r.jumlah),0);
  const totalSetoran=setoran.reduce((a,r)=>a+n(r.jumlah),0);
  const totalNoteExp=pengeluaran.reduce((a,r)=>a+n(r.jumlah),0);
  const totalSembako=sembako.reduce((a,r)=>a+n(r.nominal??r.total??r.jumlah),0);
  const totalKomisi=keluar.reduce((a,r)=>{const k=total(r),p=n(r.komisiPerKg??r.komisiValue??0);return a+n(r.totalKomisi??r.komisiAmount??k*p)},0);

  // PDF canvas: A4 landscape, vector drawing, no external library.
  const W=842,H=595,M=34,headerH=42,footerH=28;
  const navy=[13,27,62], navy2=[25,48,94], blue=[37,99,235], green=[16,130,90], gold=[194,128,20], red=[185,55,55], ink=[30,41,59], muted=[100,116,139], line=[220,226,234], pale=[247,249,252], white=[255,255,255];
  const pages=[]; let ops=[]; let y=0; let pageNo=0;
  const rgb=c=>c.map(x=>(x/255).toFixed(3)).join(" ");
  const esc=t=>clean(t).replace(/[\\()]/g,m=>"\\"+m);
  const cmd=(s)=>ops.push(s);
  const fillRect=(x,yy,w,h,c)=>cmd(rgb(c)+" rg "+x+" "+yy+" "+w+" "+h+" re f");
  const strokeLine=(x1,y1,x2,y2,c=line,lw=0.6)=>cmd(rgb(c)+" RG "+lw+" w "+x1+" "+y1+" m "+x2+" "+y2+" l S");
  const text=(x,yy,t,size=8,c=ink,font="/F1")=>cmd("BT "+rgb(c)+" rg "+font+" "+size+" Tf 1 0 0 1 "+x+" "+yy+" Tm ("+esc(t)+") Tj ET");
  const wrapped=(x,yy,t,max,size=7.5,c=ink,leading=10,font="/F1")=>{
    const words=clean(t).split(" "); let line="", cy=yy;
    words.forEach(w=>{const test=line?line+" "+w:w;if(test.length>max&&line){text(x,cy,line,size,c,font);cy-=leading;line=w}else line=test});
    if(line){text(x,cy,line,size,c,font);cy-=leading} return cy;
  };
  const newPage=(titleText="")=>{
    if(ops.length){pages.push(ops);ops=[]}
    pageNo++; y=H-headerH-22;
    fillRect(0,0,W,H,white); fillRect(0,H-headerH,W,headerH,navy);
    text(M,H-25,"BINTANG FROZEN — V26",13,white,"/F2");
    if(titleText) text(190,H-24,titleText,10,[218,226,240],"/F2");
    text(W-M-115,H-24,new Date().toLocaleDateString("id-ID"),8,[218,226,240],"/F1");
  };
  const finishPage=()=>{
    strokeLine(M,footerH,W-M,footerH,line,.7);
    text(M,12,"Bintang Frozen - Laporan Gabungan Operasional",7,muted,"/F1");
    text(W-M-65,12,"Halaman "+pageNo,7,muted,"/F1");
    pages.push(ops);ops=[];
  };
  const ensure=need=>{if(y-need<footerH+8){finishPage();newPage(currentTitle)}};
  let currentTitle="Laporan Gabungan Operasional";
  const section=titleText=>{if(ops.length)finishPage();currentTitle=titleText;newPage(titleText);text(M,y,titleText,15,navy,"/F2");y-=24};
  const labelValue=(x,yy,label,val,w=180)=>{fillRect(x,yy-36,w,36,pale);text(x+9,yy-14,label,6.8,muted,"/F2");text(x+9,yy-29,clean(val),11,navy,"/F2")};
  const table=(headers,rows,widths,opts={})=>{
    const rowH=opts.rowH||22, fs=opts.fs||6.8, x0=M;
    const drawRow=(vals,head=false)=>{
      let x=x0; vals.forEach((v,i)=>{const w=widths[i];fillRect(x,y-rowH,w,rowH,head?navy:(opts.alt&&opts.rowIndex%2? [251,252,254]:white));strokeLine(x,y-rowH,x+w,y-rowH,line,.35);strokeLine(x,y,x,y-rowH,line,.35);if(i===vals.length-1)strokeLine(x+w,y,x+w,y-rowH,line,.35);wrapped(x+4,y-8,clean(v),Math.max(6,Math.floor(w/(fs*0.55))),fs,head?white:ink,rowH/2,"/F1");x+=w});y-=rowH};
    drawRow(headers,true);
    rows.forEach((r,ri)=>{opts.rowIndex=ri;ensure(rowH+3);drawRow(r,false)});
    strokeLine(x0,y,x0+widths.reduce((a,b)=>a+b,0),y,line,.5); y-=8;
  };

  // COVER
  pageNo++; ops=[]; fillRect(0,0,W,H,white); fillRect(0,H-150,W,150,navy);
  text(M,H-55,"BINTANG FROZEN — V26",28,white,"/F2"); text(M,H-82,"LAPORAN GABUNGAN OPERASIONAL",18,[218,226,240],"/F2");
  text(M,H-106,"Format Profesional • Detail • Siap Arsip Owner",9,[190,205,230],"/F1");
  text(M,H-195,"PERIODE LAPORAN",8,muted,"/F2"); text(M,H-220,"Semua data yang tersimpan pada aplikasi",18,navy,"/F2");
  const cards=[[M,"BARANG MASUK",kg(totalMasuk),blue],[M+195,"BARANG KELUAR",kg(totalKeluar),green],[M+390,"PENGELUARAN",money(totalExp),gold],[M+585,"TOTAL KOMISI",money(totalKomisi),red]];
  cards.forEach(([x,l,v,c])=>{fillRect(x,H-315,175,65,[248,250,252]);fillRect(x,H-315,5,65,c);text(x+14,H-275,l,7,muted,"/F2");text(x+14,H-300,v,12,navy,"/F2")});
  text(M,H-370,"Laporan ini menampilkan ringkasan dan rincian operasional yang dipilih.",9,ink,"/F1");
  text(M,H-392,"Tidak ditampilkan: Customer, Staff & Akses, Hutang/Piutang, Tally Pro Barang Masuk, Tally Pro Barang Keluar.",7.5,muted,"/F1");
  text(M,55,"Dicetak otomatis dari Bintang Frozen V26",8,muted,"/F1"); text(W-M-150,55,new Date().toLocaleString("id-ID"),8,muted,"/F1");
  pages.push(ops);ops=[];

  // SUMMARY
  section("01 • RINGKASAN EKSEKUTIF");
  labelValue(M,y,"Barang Masuk",kg(totalMasuk),185); labelValue(M+195,y,"Barang Keluar",kg(totalKeluar),185); labelValue(M+390,y,"Saldo Berat",kg(totalMasuk-totalKeluar),185); labelValue(M+585,y,"Histori",hist.length+" transaksi",175); y-=48;
  labelValue(M,y,"Pengeluaran",money(totalExp),185); labelValue(M+195,y,"Komisi",money(totalKomisi),185); labelValue(M+390,y,"Setoran",money(totalSetoran),185); labelValue(M+585,y,"Sembako",money(totalSembako),175); y-=52;
  text(M,y,"Ringkasan harian / transaksi utama",9,navy,"/F2"); y-=15;
  const daily={}; [...masuk.map(r=>({d:r.tanggal||r.date||"-",t:"M",v:total(r)})),...keluar.map(r=>({d:r.tanggal||r.date||"-",t:"K",v:total(r)}))].forEach(a=>{daily[a.d]??={m:0,k:0};daily[a.d][a.t.toLowerCase()]+=a.v});
  const drows=Object.entries(daily).slice(0,12).map(([d,v])=>[d,kg(v.m),kg(v.k),kg(v.m-v.k)]);
  table(["Tanggal","Masuk","Keluar","Saldo"],drows,[130,150,150,150],{fs:7.2,rowH:21,alt:true});

  // INCOMING
  section("02 • LAPORAN BARANG MASUK");
  table(["No","Item","Supplier","Timbangan Real","Titik","Total","Rata-rata","Status"],masuk.map((r,i)=>{const w=weights(r);return[(i+1),r.item||"-",r.supplier||"-",w.join(" | ")||"-",w.length,kg(total(r)),kg(avg(r)),w.length?"Lengkap":"Kosong"]}),[28,105,95,265,42,72,72,75],{fs:6.5,rowH:25,alt:true});
  text(M,y,"GRAND TOTAL BARANG MASUK",8,navy,"/F2"); text(M+190,y,kg(totalMasuk),10,navy,"/F2"); y-=20;

  // OUTGOING
  section("03 • LAPORAN BARANG KELUAR");
  table(["No","Customer","Item","Qty","Timbangan Real","Titik","Total","Komisi"],keluar.map((r,i)=>{const w=weights(r),k=total(r),p=n(r.komisiPerKg??r.komisiValue??0),c=n(r.totalKomisi??r.komisiAmount??k*p);return[(i+1),r.customerName||r.customer||"-",r.item||"-",(r.qty||"-")+" "+(r.satuan||""),w.join(" | ")||"-",w.length,kg(k),money(c)]}),[28,115,95,60,235,42,72,72],{fs:6.3,rowH:25,alt:true});
  text(M,y,"GRAND TOTAL BARANG KELUAR",8,navy,"/F2"); text(M+190,y,kg(totalKeluar),10,navy,"/F2"); y-=20;

  // HISTORY
  section("04 • HISTORI TRANSAKSI");
  table(["No","ID","Tanggal","Tipe","Operator","Total","Status"],hist.map((r,i)=>[(i+1),r.id||"-",r.tanggalDisplay||r.tanggal||r.date||"-",r.type||"-",r.createdBy||r.operator||"-",kg(r.type==="MASUK"?r.totalMasuk:r.totalKeluar),r.status||"Selesai"]),[28,120,90,65,120,80,90],{fs:6.8,rowH:22,alt:true});

  // EXPENSES
  section("05 • LAPORAN PENGELUARAN");
  table(["No","Tanggal","Kategori","Deskripsi","Jumlah","Metode"],expenses.map((r,i)=>[(i+1),r.tanggal||r.date||"-",r.kategori||r.category||"-",r.deskripsi||r.keterangan||"-",money(r.jumlah),via(r.metode||r.via)]),[28,80,105,310,85,90],{fs:6.8,rowH:24,alt:true});
  text(M,y,"TOTAL PENGELUARAN",8,navy,"/F2"); text(M+150,y,money(totalExp),10,navy,"/F2"); y-=20;

  // COMMISSION
  section("06 • LAPORAN KOMISI");
  table(["No","Marketing","Customer","Item","Total Kg","Komisi/Kg","Total Komisi","Status"],keluar.map((r,i)=>{const k=total(r),p=n(r.komisiPerKg??r.komisiValue??0),c=n(r.totalKomisi??r.komisiAmount??k*p);return[(i+1),r.marketingNama||r.marketing||"-",r.customerName||r.customer||"-",r.item||"-",kg(k),money(p),money(c),r.statusKomisi||r.status||"-"]}),[28,90,130,110,75,75,90,80],{fs:6.2,rowH:25,alt:true});
  text(M,y,"TOTAL KOMISI",8,navy,"/F2"); text(M+120,y,money(totalKomisi),10,navy,"/F2"); y-=20;

  // NOTES: SETORAN
  section("07 • CATATAN SETORAN & PEMBAYARAN");
  table(["No","Tanggal","Customer","Jumlah","Via Pembayaran","Keterangan"],setoran.map((r,i)=>[(i+1),r.tanggal||r.date||"-",r.namaCustomer||r.customer||"-",money(r.jumlah),via(r.via||r.metode),r.keterangan||"-"]),[28,80,180,90,110,280],{fs:6.7,rowH:24,alt:true});
  const setMap={};setoran.forEach(r=>{const k=via(r.via||r.metode);setMap[k]=(setMap[k]||0)+n(r.jumlah)});
  text(M,y,"REKAP VIA PEMBAYARAN",8,navy,"/F2"); y-=14; Object.entries(setMap).forEach(([k,v])=>{ensure(16);text(M,y,k,7.2,ink,"/F2");text(M+140,y,money(v),8,navy,"/F2");y-=14}); text(M,y,"TOTAL SETORAN",8,navy,"/F2");text(M+140,y,money(totalSetoran),9,navy,"/F2");y-=20;

  // NOTES: EXPENSE
  section("08 • CATATAN PENGELUARAN");
  table(["No","Tanggal","Keterangan","Jumlah","Via Pembayaran","Status"],pengeluaran.map((r,i)=>[(i+1),r.tanggal||r.date||"-",r.keterangan||r.deskripsi||"-",money(r.jumlah),via(r.via||r.metode),r.status||"Dicatat"]),[28,80,320,90,110,120],{fs:6.8,rowH:24,alt:true});
  const pengMap={};pengeluaran.forEach(r=>{const k=via(r.via||r.metode);pengMap[k]=(pengMap[k]||0)+n(r.jumlah)});
  text(M,y,"REKAP VIA PEMBAYARAN",8,navy,"/F2"); y-=14; Object.entries(pengMap).forEach(([k,v])=>{ensure(16);text(M,y,k,7.2,ink,"/F2");text(M+140,y,money(v),8,navy,"/F2");y-=14}); text(M,y,"TOTAL CATATAN PENGELUARAN",8,navy,"/F2");text(M+180,y,money(totalNoteExp),9,navy,"/F2");y-=20;

  // NOTES: GROCERIES
  section("09 • CATATAN SEMBAKO");
  table(["No","Tanggal","Bahan","Supplier/Toko","Qty","Satuan","Nominal","Keterangan"],sembako.map((r,i)=>[(i+1),r.tanggal||r.date||"-",r.namaBahan||r.item||"-",r.supplier||r.toko||"-",r.jumlahKg??r.qty??"-",r.satuan||"-",money(r.nominal??r.total??r.jumlah),r.keterangan||"-"]),[28,75,125,120,50,55,90,250],{fs:6.4,rowH:24,alt:true});
  text(M,y,"TOTAL PEMBELIAN SEMBAKO",8,navy,"/F2");text(M+190,y,money(totalSembako),10,navy,"/F2");y-=20;

  // FINAL
  section("10 • REKAP AKHIR OWNER");
  const finalRows=[
    ["Barang Masuk",kg(totalMasuk),"Total seluruh timbang masuk"],
    ["Barang Keluar",kg(totalKeluar),"Total seluruh timbang keluar"],
    ["Saldo Berat",kg(totalMasuk-totalKeluar),"Masuk dikurangi keluar"],
    ["Pengeluaran",money(totalExp),"Transaksi operasional"],
    ["Komisi",money(totalKomisi),"Komisi marketing"],
    ["Setoran",money(totalSetoran),"Catatan setoran"],
    ["Catatan Pengeluaran",money(totalNoteExp),"Catatan pengeluaran terpisah"],
    ["Pembelian Sembako",money(totalSembako),"Catatan sembako terpisah"]
  ];
  table(["Indikator","Nilai","Keterangan"],finalRows,[180,120,390],{fs:7.5,rowH:27,alt:true});
  y-=5; fillRect(M,y-58,738,58,[247,249,252]); text(M+12,y-19,"KONFIGURASI LAPORAN",7,muted,"/F2"); wrapped(M+12,y-34,"Customer, Staff & Akses, Hutang/Piutang, Tally Pro Barang Masuk, dan Tally Pro Barang Keluar tidak ditampilkan pada PDF gabungan.",105,7.2,ink,10,"/F1");

  if(ops.length) finishPage();

  // PDF objects
  const objs=[]; const add=o=>{objs.push(o);return objs.length};
  const font1=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const font2=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids=[];
  pages.forEach(pg=>{
    const content=pg.join("\n");
    const bytes=new TextEncoder().encode(content);
    const stream=add("<< /Length "+bytes.length+" >>\nstream\n"+content+"\nendstream");
    const page=add("<< /Type /Page /Parent 0 0 R /MediaBox [0 0 "+W+" "+H+"] /Resources << /Font << /F1 "+font1+" 0 R /F2 "+font2+" 0 R >> >> /Contents "+stream+" 0 R >>");
    kids.push(page);
  });
  const pagesObj=add("<< /Type /Pages /Kids ["+kids.map(i=>i+" 0 R").join(" ")+"] /Count "+kids.length+" >>");
  kids.forEach(i=>objs[i-1]=objs[i-1].replace("/Parent 0 0 R","/Parent "+pagesObj+" 0 R"));
  const catalog=add("<< /Type /Catalog /Pages "+pagesObj+" 0 R >>");
  let pdf="%PDF-1.4\n%\xFF\xFF\xFF\xFF\n",offs=[0];
  objs.forEach((o,i)=>{offs[i+1]=new TextEncoder().encode(pdf).length;pdf+=(i+1)+" 0 obj\n"+o+"\nendobj\n"});
  const xref=new TextEncoder().encode(pdf).length;pdf+="xref\n0 "+(objs.length+1)+"\n0000000000 65535 f \n";for(let i=1;i<offs.length;i++)pdf+=String(offs[i]).padStart(10,"0")+" 00000 n \n";
  pdf+="trailer\n<< /Size "+(objs.length+1)+" /Root "+catalog+" 0 R >>\nstartxref\n"+xref+"\n%%EOF";
  const blob=new Blob([pdf],{type:"application/pdf"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="BintangFrozen_Laporan_Gabungan_Profesional_"+(new Date(Date.now()-new Date().getTimezoneOffset()*60000)).toISOString().slice(0,10)+".pdf";a.style.display="none";document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},3000);
  q("✅ PDF Gabungan Profesional berhasil dibuat");
};
$("bf25Json").onclick=()=>{persist(); const data={app:"Bintang Frozen Tally Pro",version:"V26",exportedAt:new Date().toISOString(),mode,columns:cols,rows,details}; const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download="BintangFrozen_TallyPro_"+(new Date(Date.now()-new Date().getTimezoneOffset()*60000)).toISOString().slice(0,10)+".json";a.click()};
$("bf25Csv").onclick=()=>{const head=["No",mode==="masuk"?"Supplier":"Customer","Item","Qty","Satuan",...Array.from({length:cols},(_,i)=>"R"+(i+1)+" Real (kg)"),"Total Kg","Rata-rata Kg","Jumlah Timbang","Status","Keterangan"]; const body=sourceRows().map((r,i)=>{const w=r.weights.slice(0,cols).map(num),t=w.reduce((a,b)=>a+b,0),c=w.filter(x=>x>0).length;return [i+1,sourceLabel(r),r.item||"",r.qty||"",r.satuan||"",...w,t.toFixed(2),c?(t/c).toFixed(2):"0.00",c,c===cols?"LENGKAP":c?"BELUM LENGKAP":"KOSONG",r.note||""]}); const csv=[head,...body].map(row=>row.map(x=>'"'+String(x??"").replace(/"/g,'""')+'"').join(",")).join("\\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\\ufeff"+csv],{type:"text/csv;charset=utf-8"}));a.download="BintangFrozen_TallyPro_"+(new Date(Date.now()-new Date().getTimezoneOffset()*60000)).toISOString().slice(0,10)+".csv";a.click()};
$("bf25Print").onclick=()=>{const w=window.open("","_blank"); if(!w)return; const title=mode==="masuk"?"BARANG MASUK":"BARANG KELUAR"; const head=Array.from({length:cols},(_,i)=>"<th>R"+(i+1)+"<br>REAL KG</th>").join(""); const body=sourceRows().map((r,i)=>{const vals=r.weights.slice(0,cols),t=vals.reduce((a,b)=>a+num(b),0);return "<tr><td>"+(i+1)+"</td><td>"+esc(sourceLabel(r))+"</td><td>"+esc(r.item||"")+"</td><td>"+esc(r.qty||"")+" "+esc(r.satuan||"")+"</td>"+vals.map(v=>"<td>"+(num(v)?fmt(v):"")+"</td>").join("")+"<td><b>"+fmt(t)+"</b></td></tr>"}).join(""); w.document.write("<!doctype html><html><head><title>Tally "+title+"</title></head><body><h2>BINTANG FROZEN — TALLY SHEET "+title+"</h2><div class='meta'>Dicetak: "+new Date().toLocaleString("id-ID")+" • Kolom real: "+cols+"</div><table><thead><tr><th>No</th><th>"+(mode==="masuk"?"Supplier":"Customer")+"</th><th>Item</th><th>Qty</th>"+head+"<th>Total Kg</th></tr></thead><tbody>"+body+"</tbody></table></body></html>");w.document.close();setTimeout(()=>w.print(),300)};
load();
})();
