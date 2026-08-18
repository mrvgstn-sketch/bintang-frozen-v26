(function(){
"use strict";
if(window.BFDriverLocation)return;

const esc=v=>window.BFCore?.esc?.(v)??String(v??"");
const sb=()=>window.BFSupabase;
const me=()=>window.BFCore?.user?.()||{};
const FRESH_MS=90*1000;
const STALE_MS=4*60*1000;
const HEARTBEAT_MS=45*1000;

let watchId=null;
let heartbeatTimer=null;
let activeCount=0;
let lastSentAt=0;
let lastCoords=null;
let state={status:"idle",message:"Tidak ada pengantaran aktif",recordedAt:null,accuracy:null,errorCode:null};
let ownerChannel=null;
let ownerStaleTimer=null;

function dispatch(){window.dispatchEvent(new CustomEvent("bf:driver-location-state",{detail:{...state,activeCount,lastCoords}}))}
function setState(next){state={...state,...next};dispatch()}
function errorText(err){
  const code=Number(err?.code||0);
  if(code===1)return "Izin lokasi tidak aktif. Lokasi wajib selama pengantaran.";
  if(code===2)return "Lokasi perangkat tidak tersedia.";
  if(code===3)return "Pengambilan lokasi melewati batas waktu.";
  return err?.message||"Lokasi tidak tersedia.";
}
function geoOptions(){return {enableHighAccuracy:true,maximumAge:0,timeout:20000}}
function positionPayload(pos){return {
  latitude:Number(pos.coords.latitude),longitude:Number(pos.coords.longitude),accuracy:Number(pos.coords.accuracy||0),capturedAt:new Date(pos.timestamp||Date.now()).toISOString()
}}
async function pushPosition(pos,{force=false}={}){
  const client=sb();if(!client)throw new Error("Supabase belum siap.");
  const p=positionPayload(pos);const now=Date.now();
  if(!force && lastCoords && now-lastSentAt<10000){
    const dLat=Math.abs(p.latitude-lastCoords.latitude),dLon=Math.abs(p.longitude-lastCoords.longitude);
    if(dLat<0.00002&&dLon<0.00002)return p;
  }
  const {error}=await client.rpc("bf_driver_location_push",{
    p_latitude:p.latitude,p_longitude:p.longitude,p_accuracy:p.accuracy,p_captured_at:p.capturedAt
  });
  if(error)throw error;
  lastSentAt=now;lastCoords=p;
  setState({status:"active",message:"Lokasi aktif — wajib selama pengantaran",recordedAt:new Date().toISOString(),accuracy:p.accuracy,errorCode:null});
  return p;
}
function getPosition(){return new Promise((resolve,reject)=>{
  if(!navigator.geolocation)return reject(new Error("Perangkat/browser tidak mendukung GPS."));
  navigator.geolocation.getCurrentPosition(resolve,reject,geoOptions());
})}
async function getFreshPosition(){
  if(me().role!=="driver")throw new Error("Lokasi Driver hanya tersedia untuk akun Supir.");
  if(activeCount<=0)throw new Error("Tidak ada pengantaran aktif.");
  setState({status:"locating",message:"Memperoleh lokasi GPS terbaru...",errorCode:null});
  try{const pos=await getPosition();const p=await pushPosition(pos,{force:true});return p}catch(err){setState({status:"unavailable",message:errorText(err),errorCode:err?.code||null});throw new Error(errorText(err))}
}
function clearHeartbeat(){if(heartbeatTimer){clearTimeout(heartbeatTimer);heartbeatTimer=null}}
function scheduleHeartbeat(){
  clearHeartbeat();if(activeCount<=0||me().role!=="driver")return;
  heartbeatTimer=setTimeout(async()=>{
    if(activeCount<=0||me().role!=="driver")return;
    try{const pos=await getPosition();await pushPosition(pos,{force:true})}catch(err){setState({status:"unavailable",message:errorText(err),errorCode:err?.code||null})}
    scheduleHeartbeat();
  },HEARTBEAT_MS);
}
function startMandatoryTracking(count){
  activeCount=Math.max(0,Number(count)||0);
  if(me().role!=="driver")return;
  if(activeCount<=0){stopAutomaticTracking();setState({status:"idle",message:"Tidak ada pengantaran aktif",recordedAt:null,accuracy:null,errorCode:null});return}
  if(!navigator.geolocation){setState({status:"unavailable",message:"Browser tidak mendukung GPS. Lokasi wajib selama pengantaran."});return}
  if(watchId===null){
    setState({status:"locating",message:"Mengaktifkan lokasi wajib...",errorCode:null});
    watchId=navigator.geolocation.watchPosition(
      pos=>{pushPosition(pos).catch(err=>setState({status:"unavailable",message:"Lokasi diperoleh tetapi gagal dikirim: "+(err?.message||err)}))},
      err=>setState({status:"unavailable",message:errorText(err),errorCode:err?.code||null}),
      geoOptions()
    );
  }
  scheduleHeartbeat();
}
function stopAutomaticTracking(){
  if(watchId!==null&&navigator.geolocation){try{navigator.geolocation.clearWatch(watchId)}catch(_){ }watchId=null}
  clearHeartbeat();lastSentAt=0;lastCoords=null;
}
function locationStatusHTML(){
  const s=state.status;
  const cls=s==="active"?"active":s==="locating"?"locating":s==="unavailable"?"unavailable":"idle";
  const title=s==="active"?"LOKASI AKTIF — WAJIB":s==="locating"?"MENGAKTIFKAN LOKASI WAJIB":s==="unavailable"?"LOKASI TIDAK TERSEDIA":"TIDAK ADA PENGANTARAN AKTIF";
  const meta=state.recordedAt?`<small>Terakhir diperbarui ${esc(new Date(state.recordedAt).toLocaleTimeString("id-ID"))}${Number.isFinite(Number(state.accuracy))?` • Akurasi ±${Math.round(Number(state.accuracy))} m`:""}</small>`:"";
  return `<div class="bf-driver-location-card ${cls}"><div><span class="bf-location-dot"></span><b>${title}</b></div><p>${esc(state.message)}</p>${meta}<em>Lokasi dibagikan otomatis kepada Owner selama pengantaran aktif. Tidak tersedia tombol untuk mematikan tracking dari aplikasi.</em></div>`;
}
function mountDriverStatus(root){
  if(!root)return()=>{};
  const render=()=>{root.innerHTML=locationStatusHTML()};render();
  const fn=()=>render();window.addEventListener("bf:driver-location-state",fn);return()=>window.removeEventListener("bf:driver-location-state",fn)
}
function ageStatus(row){
  if(!row?.recorded_at)return {key:"none",label:"Lokasi Tidak Tersedia",detail:"Belum ada lokasi yang berhasil dikirim."};
  const age=Math.max(0,Date.now()-new Date(row.recorded_at).getTime());
  if(age<=FRESH_MS)return {key:"active",label:"Lokasi Aktif",detail:`Update ${Math.max(0,Math.round(age/1000))} detik lalu`};
  if(age<=STALE_MS)return {key:"late",label:"Lokasi Terlambat",detail:`Update ${Math.max(1,Math.round(age/60000))} menit lalu`};
  return {key:"unavailable",label:"Lokasi Tidak Tersedia",detail:`Tidak ada update ${Math.max(1,Math.round(age/60000))} menit`};
}
async function ownerRows(){const client=sb();if(!client)throw new Error("Supabase belum siap.");const {data,error}=await client.rpc("bf_owner_driver_locations");if(error)throw error;return Array.isArray(data)?data:[]}
function osmEmbed(lat,lon){const x=Number(lon),y=Number(lat),dx=.008,dy=.005;return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${x-dx},${y-dy},${x+dx},${y+dy}`)}&layer=mapnik&marker=${encodeURIComponent(`${y},${x}`)}`}
function osmOpen(lat,lon){return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lon)}#map=17/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}`}
function cleanupOwnerTracking(){if(ownerChannel&&sb()){try{sb().removeChannel(ownerChannel)}catch(_){ }ownerChannel=null}if(ownerStaleTimer){clearTimeout(ownerStaleTimer);ownerStaleTimer=null}}
function scheduleOwnerAgeRefresh(render,rows){
  if(ownerStaleTimer)clearTimeout(ownerStaleTimer);
  let next=60000;
  for(const r of rows){if(!r.recorded_at)continue;const age=Date.now()-new Date(r.recorded_at).getTime();for(const cut of [FRESH_MS,STALE_MS]){const remain=cut-age;if(remain>0)next=Math.min(next,remain+250)}}
  ownerStaleTimer=setTimeout(()=>render(rows),Math.max(500,next));
}
async function openOwner(){
  if(me().role!=="owner")return window.BFCore?.deny?.("manage_users","Live Driver Location hanya tersedia untuk Owner.");
  cleanupOwnerTracking();document.getElementById("bf-driver-location-page")?.remove();
  const page=window.BFCore.page({id:"bf-driver-location-page",className:"bf-op-page bf-driver-location-page",title:"Live Driver Location",subtitle:"Posisi terakhir Driver • Owner-only • update berdasarkan GPS server",onBack:cleanupOwnerTracking});
  const content=page.querySelector("[data-bf-content]");let selected="";
  async function load(){content.innerHTML='<div class="bf-op-empty">Memuat lokasi Driver...</div>';try{const rows=await ownerRows();render(rows)}catch(err){content.innerHTML=`<div class="bf-driver-error"><b>Live Driver Location tidak dapat dimuat.</b><span>${esc(err?.message||err)}</span><small>Pastikan SQL R13O sudah dijalankan di Supabase.</small></div>`}}
  function render(rows){
    if(!selected||!rows.some(r=>r.driver_id===selected))selected=rows.find(r=>r.recorded_at)?.driver_id||rows[0]?.driver_id||"";
    const current=rows.find(r=>r.driver_id===selected)||null,st=current?ageStatus(current):null;
    const cards=rows.map(r=>{const x=ageStatus(r);return `<button class="bf-live-driver-card ${r.driver_id===selected?'selected':''}" data-driver="${esc(r.driver_id)}"><div><b>${esc(r.display_name||r.email||'Supir')}</b><small>${esc(r.email||'')}</small></div><span class="${x.key}">${esc(x.label)}</span><em>${esc(x.detail)} • ${Number(r.active_delivery_count||0)} pengantaran aktif</em></button>`}).join("")||'<div class="bf-op-empty">Belum ada akun Driver aktif.</div>';
    let detail='<div class="bf-op-empty">Pilih Driver untuk melihat lokasi.</div>';
    if(current){
      const hasGeo=Number.isFinite(Number(current.latitude))&&Number.isFinite(Number(current.longitude));
      detail=`<article class="bf-live-detail"><header><div><b>${esc(current.display_name||current.email||'Supir')}</b><small>${esc(current.email||'')}</small></div><span class="${st.key}">${esc(st.label)}</span></header><div class="bf-live-kpis"><div><small>Pengantaran Aktif</small><b>${Number(current.active_delivery_count||0)}</b></div><div><small>Akurasi</small><b>${current.accuracy_m!=null?'±'+Math.round(Number(current.accuracy_m))+' m':'-'}</b></div><div><small>Update Server</small><b>${current.recorded_at?esc(new Date(current.recorded_at).toLocaleTimeString('id-ID')):'-'}</b></div></div>${hasGeo?`<div class="bf-live-map"><iframe title="Peta lokasi ${esc(current.display_name||'Driver')}" loading="lazy" referrerpolicy="no-referrer" src="${esc(osmEmbed(current.latitude,current.longitude))}"></iframe></div><div class="bf-live-coords"><div><small>Latitude</small><b>${Number(current.latitude).toFixed(6)}</b></div><div><small>Longitude</small><b>${Number(current.longitude).toFixed(6)}</b></div><a href="${esc(osmOpen(current.latitude,current.longitude))}" target="_blank" rel="noopener noreferrer">Buka di OpenStreetMap ↗</a></div>`:'<div class="bf-driver-location-card unavailable"><b>Lokasi belum tersedia</b><p>Driver belum mengirim GPS yang berhasil.</p></div>'}<p class="bf-live-note">Status tidak berasal dari flag Online. Status dihitung dari timestamp lokasi terakhir. Browser/Android dapat menghentikan GPS ketika aplikasi berada di background atau perangkat membatasi lokasi.</p></article>`;
    }
    content.innerHTML=`<div class="bf-live-layout"><aside><div class="bf-live-toolbar"><b>Driver Aktif</b><button class="bf-op-secondary" id="bf-live-refresh">Muat Ulang</button></div><div class="bf-live-driver-list">${cards}</div></aside><section>${detail}</section></div>`;
    content.querySelector('#bf-live-refresh')?.addEventListener('click',load);content.querySelectorAll('[data-driver]').forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.driver;render(rows)}));scheduleOwnerAgeRefresh(render,rows);
  }
  await load();
  const client=sb();if(client){ownerChannel=client.channel('bf-owner-driver-location').on('postgres_changes',{event:'*',schema:'public',table:'bf_driver_locations'},()=>load()).subscribe()}
}

window.BFDriverLocation={startMandatoryTracking,getFreshPosition,mountDriverStatus,openOwner,getState:()=>({...state,activeCount,lastCoords})};
window.BFOpenDriverLocation=openOwner;
window.addEventListener("bf:auth-signed-out",()=>{activeCount=0;stopAutomaticTracking();cleanupOwnerTracking()});
})();
