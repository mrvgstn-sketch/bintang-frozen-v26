(function(){
"use strict";
let originalParent=null, originalNext=null, activeMount=null, closeCallback=null;
function modal(){return document.getElementById("bfV25Modal")}
function overlay(){return document.getElementById("bfV25Overlay")}
function restore(){
  const m=modal(),o=overlay();
  if(!m||!originalParent)return;
  if(originalNext && originalNext.parentNode===originalParent) originalParent.insertBefore(m,originalNext);
  else originalParent.appendChild(m);
  if(o){o.style.display="none";o.classList.remove("bf-tally-host-empty")}
  if(activeMount){activeMount.classList.remove("active");activeMount.innerHTML=""}
  activeMount=null;closeCallback=null;
}
window.BFRestoreInlineTally=restore;
window.BFMountInlineTally=function(mode,mount,onClose){
  const m=modal(),o=overlay(); if(!m||!mount)return;
  restore();
  originalParent=m.parentNode;originalNext=m.nextSibling;activeMount=mount;closeCallback=onClose;
  const s=document.getElementById("bf25Mode");
  if(s){s.value=mode;s.dispatchEvent(new Event("change",{bubbles:true}))}
  mount.classList.add("active");mount.appendChild(m);
  if(o){o.style.display="none";o.classList.add("bf-tally-host-empty")}
  const close=document.getElementById("bf25Close");
  if(close){
    close.onclick=()=>{restore(); if(typeof onClose==="function")onClose()}
    close.textContent="← Kembali ke Transaksi";
  }
  // Keep all existing Tally functions alive after moving the DOM.
  try{document.getElementById("bf25Search")?.dispatchEvent(new Event("input",{bubbles:true}))}catch(_){}
};
})();
