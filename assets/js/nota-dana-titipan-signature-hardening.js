(function(){
'use strict';
if(window.__bfNtSignatureHardening)return;
window.__bfNtSignatureHardening=true;
let strokeCount=0;
let lastCanvas=null;
function resetForCanvas(canvas){if(canvas&&canvas!==lastCanvas){lastCanvas=canvas;strokeCount=0}}
function targetCanvas(e){const t=e.target;return t&&t.id==='po-sign'?t:null}
document.addEventListener('mousedown',e=>{const c=targetCanvas(e);if(c){resetForCanvas(c);strokeCount++}},true);
document.addEventListener('touchstart',e=>{const c=targetCanvas(e);if(c){resetForCanvas(c);strokeCount++}},true);
document.addEventListener('click',e=>{if(e.target&&e.target.id==='po-clear')strokeCount=0},true);
const obs=new MutationObserver(()=>{const c=document.getElementById('po-sign');if(c)resetForCanvas(c)});
obs.observe(document.documentElement,{childList:true,subtree:true});
function patch(){
 const client=window.BFSupabase;
 if(!client||typeof client.rpc!=='function'||client.__bfNtSignaturePatched)return false;
 const original=client.rpc.bind(client);
 client.rpc=function(name,args,options){
   if(name==='bf_nt_create_payout'){
     const next=Object.assign({},args||{}, {p_signature_strokes:strokeCount});
     return original('bf_nt_create_payout_v2',next,options);
   }
   return original(name,args,options);
 };
 client.__bfNtSignaturePatched=true;
 return true;
}
if(!patch()){
 const timer=setInterval(()=>{if(patch())clearInterval(timer)},200);
 setTimeout(()=>clearInterval(timer),30000);
}
window.BFNotaSignatureStrokeCount=()=>strokeCount;
})();
