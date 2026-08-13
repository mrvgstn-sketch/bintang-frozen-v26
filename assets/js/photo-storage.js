(function(){
"use strict";
const BUCKET="bf-nota";
async function compress(file){
  if(!file?.type?.startsWith("image/"))throw new Error("File harus berupa gambar.");
  const bitmap=await createImageBitmap(file);const max=1600,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Gagal memproses gambar.")),"image/jpeg",.78));
}
function dataUrlToBlob(dataUrl){const [meta,data]=String(dataUrl).split(",");const mime=(meta.match(/data:([^;]+)/)||[])[1]||"image/jpeg";const bytes=atob(data),arr=new Uint8Array(bytes.length);for(let i=0;i<bytes.length;i++)arr[i]=bytes.charCodeAt(i);return new Blob([arr],{type:mime})}
async function uploadBlob(blob,{transactionNo="nota",supplier="supplier"}={}){
  const sb=window.BFSupabase;if(!sb)throw new Error("Supabase belum siap.");
  const current=window.BFCore.user();if(!current.id)throw new Error("Sesi pengguna belum siap.");
  const date=new Date(),ym=`${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,"0")}`;
  const clean=v=>String(v||"").replace(/[^a-zA-Z0-9_-]+/g,"-").slice(0,60)||"item";
  const path=`${window.BF_STORE_CODE||"BINTANG"}/${current.id}/${ym}/${clean(transactionNo)}-${clean(supplier)}-${window.BFCore.uid()}.jpg`;
  const {error}=await sb.storage.from(BUCKET).upload(path,blob,{contentType:"image/jpeg",upsert:false,cacheControl:"31536000"});
  if(error)throw new Error("Upload foto nota gagal: "+error.message);
  const {data}=sb.storage.from(BUCKET).getPublicUrl(path);if(!data?.publicUrl)throw new Error("URL foto nota tidak tersedia.");
  return {url:data.publicUrl,path,bucket:BUCKET};
}
async function uploadFile(file,meta){return uploadBlob(await compress(file),meta)}
async function uploadDataUrl(dataUrl,meta){return uploadBlob(dataUrlToBlob(dataUrl),meta)}
window.BFPhotoStorage={BUCKET,uploadFile,uploadDataUrl};
})();
