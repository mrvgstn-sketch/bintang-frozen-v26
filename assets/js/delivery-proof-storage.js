(function(){
"use strict";
if(window.BFDeliveryProofStorage)return;
const BUCKET="bf-delivery-proof";
async function compress(file){if(!file?.type?.startsWith("image/"))throw new Error("File harus berupa gambar.");const bitmap=await createImageBitmap(file),max=1600,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Gagal memproses gambar.")),"image/jpeg",.78))}
const clean=v=>String(v||"").replace(/[^a-zA-Z0-9_-]+/g,"-").slice(0,80)||"item";
async function uploadFile(file,{transactionId="delivery",groupId="group"}={}){const sb=window.BFSupabase;if(!sb)throw new Error("Supabase belum siap.");const me=window.BFCore.user();if(me.role!=="driver"||!me.id)throw new Error("Upload bukti hanya tersedia untuk akun Supir yang aktif.");const blob=await compress(file),d=new Date(),ym=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}`,path=`${window.BF_STORE_CODE||"BINTANG-Y70M"}/${me.id}/${ym}/${clean(transactionId)}/${clean(groupId)}-${window.BFCore.uid()}.jpg`;const {error}=await sb.storage.from(BUCKET).upload(path,blob,{contentType:"image/jpeg",upsert:false,cacheControl:"31536000"});if(error)throw new Error("Upload bukti pengantaran gagal: "+error.message);return{bucket:BUCKET,path}}
async function signedUrl(proof){const sb=window.BFSupabase;if(!sb)throw new Error("Supabase belum siap.");const bucket=proof?.bucket||BUCKET,path=proof?.path;if(!path)throw new Error("Path bukti tidak tersedia.");const {data,error}=await sb.storage.from(bucket).createSignedUrl(path,600);if(error)throw error;return data?.signedUrl||""}
window.BFDeliveryProofStorage={BUCKET,uploadFile,signedUrl};
})();
