(function(){
  'use strict';
  const U={
    id(prefix='id'){return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)},
    now(){return new Date().toISOString()},
    today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')},
    esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))},
    num(v){const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:0},
    money(v){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(U.num(v))},
    qty(v,dec=2){return new Intl.NumberFormat('id-ID',{maximumFractionDigits:dec}).format(U.num(v))},
    date(v){if(!v)return '-';const d=new Date(v.length===10?v+'T00:00:00':v);return isNaN(d)?v:new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric'}).format(d)},
    sum(arr,fn=x=>x){return arr.reduce((a,x)=>a+U.num(fn(x)),0)},
    download(name,text,type='application/json'){const b=new Blob([text],{type});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},100)},
    fileText(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsText(file)})},
    fileDataURL(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(file)})}
  };
  window.BFU=U;
})();
