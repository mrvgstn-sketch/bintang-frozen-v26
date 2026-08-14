(function(){
"use strict";
if(window.BFUI)return;
const KEY="bf_ui_preference";
const VALID=new Set(["auto","mobile","tablet","desktop"]);
let preference=VALID.has(localStorage.getItem(KEY))?localStorage.getItem(KEY):"auto";
let resolved="mobile";

function automaticMode(){
  const w=Math.max(document.documentElement.clientWidth||0,window.innerWidth||0);
  return w>=1200?"desktop":w>=768?"tablet":"mobile";
}
function resolve(){return preference==="auto"?automaticMode():preference}
function apply(source="init"){
  const next=resolve();
  const changed=next!==resolved;
  resolved=next;
  const root=document.documentElement;
  root.dataset.bfUiPreference=preference;
  root.dataset.bfUiMode=resolved;
  root.style.setProperty("--bf-ui-mode",resolved);
  if(changed||source==="init")window.dispatchEvent(new CustomEvent("bf:ui-mode",{detail:{preference,mode:resolved,source}}));
  return resolved;
}
function setPreference(value){
  if(!VALID.has(value))throw new Error("Mode tampilan tidak valid");
  preference=value;
  localStorage.setItem(KEY,value);
  return apply("preference");
}
function getPreference(){return preference}
function getMode(){return resolved}
function label(mode=resolved){return mode==="desktop"?"Desktop":mode==="tablet"?"Tablet":"Mobile"}
function renderChoice(host){
  if(!host)return;
  const selected=getPreference();
  host.innerHTML=`<div class="bf-ui-setting-title">Tampilan Aplikasi</div><div class="bf-ui-setting-note">Otomatis menyesuaikan layar. Pilihan manual hanya berlaku pada perangkat ini.</div><div class="bf-ui-choice" role="radiogroup" aria-label="Mode tampilan">${[
    ["auto","Otomatis"],["mobile","Mobile"],["tablet","Tablet"],["desktop","Desktop"]
  ].map(([v,t])=>`<button type="button" data-bf-ui-pref="${v}" class="${selected===v?"active":""}" role="radio" aria-checked="${selected===v}">${t}</button>`).join("")}</div><div class="bf-ui-current">Mode aktif: <b>${label()}</b></div>`;
  host.querySelectorAll("[data-bf-ui-pref]").forEach(btn=>btn.addEventListener("click",()=>{
    setPreference(btn.dataset.bfUiPref);
    renderChoice(host);
  }));
}

window.BFUI={setPreference,getPreference,getMode,label,renderChoice,apply};
window.addEventListener("resize",()=>apply("resize"),{passive:true});
apply("init");
})();
