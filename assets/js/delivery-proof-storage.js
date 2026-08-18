(function(){
"use strict";
if(window.BFDeliveryProofStorage)return;
const BUCKET="bf-delivery-proof";
const clean=v=>String(v||"").replace(/[^a-zA-Z0-9_-]+/g,"-").slice(0,80)||"item";
const trim=v=>String(v||"").trim().slice(0,72);
function geoOk(g){return g&&Number.isFinite(Number(g.latitude))&&Number(g.latitude)>=-90&&Number(g.latitude)<=90&&Number.isFinite(Number(g.longitude))&&Number(g.longitude)>=-180&&Number(g.longitude)<=180&&Number.isFinite(Number(g.accuracy))&&Number(g.accuracy)>=0}
function fitText(ctx,text,maxWidth,start){let size=start;while(size>12){ctx.font=`700 ${size}px system-ui, sans-serif`;if(ctx.measureText(text).width<=maxWidth)break;size-=2}return size}
async function watermark(file,{geo,driverName="Supir",customer="Customer",capturedAt}={}){
  if(!file?.type?.startsWith("image/"))throw new Error("File harus berupa gambar.");
  if(!geoOk(geo))throw new Error("Koordinat GPS valid wajib tersedia untuk Foto Bukti Pengantaran.");
  const bitmap=await createImageBitmap(file),max=1600,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext("2d");ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
  const pad=Math.max(18,Math.round(canvas.width*.025)),base=Math.max(17,Math.round(canvas.width*.025)),line=Math.round(base*1.34),overlayH=Math.min(canvas.height*.45,Math.max(170,line*6+pad*2));
  const grad=ctx.createLinearGradient(0,canvas.height-overlayH,0,canvas.height);grad.addColorStop(0,"rgba(5,15,35,.20)");grad.addColorStop(.25,"rgba(5,15,35,.76)");grad.addColorStop(1,"rgba(5,15,35,.92)");ctx.fillStyle=grad;ctx.fillRect(0,canvas.height-overlayH,canvas.width,overlayH);
  const when=new Date(capturedAt||geo.capturedAt||Date.now());const whenText=Number.isNaN(when.getTime())?new Date().toLocaleString("id-ID"):when.toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"medium"});
  const lines=["BINTANG FROZEN • BUKTI PENGANTARAN",`${trim(customer)} • ${trim(driverName)}`,whenText,`GPS ${Number(geo.latitude).toFixed(6)}, ${Number(geo.longitude).toFixed(6)}`,`Akurasi ±${Math.round(Number(geo.accuracy))} m`];
  let y=canvas.height-overlayH+pad+base;ctx.textBaseline="alphabetic";ctx.fillStyle="#fff";
  lines.forEach((txt,i)=>{const size=fitText(ctx,txt,canvas.width-pad*2,i===0?base+2:base);ctx.font=`${i===0?800:650} ${size}px system-ui, sans-serif`;ctx.fillStyle=i===4?"#fde68a":"#fff";ctx.fillText(txt,pad,y,canvas.width-pad*2);y+=line});
  return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Gagal memproses gambar.")),"image/jpeg",.82));
}
async function uploadFile(file,{transactionId="delivery",groupId="group",geo,driverName="Supir",customer="Customer"}={}){
  const sb=window.BFSupabase;if(!sb)throw new Error("Supabase belum siap.");const me=window.BFCore.user();if(me.role!=="driver"||!me.id)throw new Error("Upload bukti hanya tersedia untuk akun Supir yang aktif.");if(!geoOk(geo))throw new Error("Lokasi GPS wajib tersedia sebelum Foto Bukti dapat diunggah.");
  const blob=await watermark(file,{geo,driverName:driverName||me.name||me.email,customer,capturedAt:geo.capturedAt}),d=new Date(),ym=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}`,path=`${window.BF_STORE_CODE||"BINTANG-Y70M"}/${me.id}/${ym}/${clean(transactionId)}/${clean(groupId)}-${window.BFCore.uid()}.jpg`;
  const {error}=await sb.storage.from(BUCKET).upload(path,blob,{contentType:"image/jpeg",upsert:false,cacheControl:"31536000"});if(error)throw new Error("Upload bukti pengantaran gagal: "+error.message);return{bucket:BUCKET,path}
}
async function signedUrl(proof){const sb=window.BFSupabase;if(!sb)throw new Error("Supabase belum siap.");const bucket=proof?.bucket||BUCKET,path=proof?.path;if(!path)throw new Error("Path bukti tidak tersedia.");const {data,error}=await sb.storage.from(bucket).createSignedUrl(path,600);if(error)throw error;return data?.signedUrl||""}
window.BFDeliveryProofStorage={BUCKET,uploadFile,signedUrl,watermark};
})();
