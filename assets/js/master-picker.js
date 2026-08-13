(function(){
"use strict";
if(window.BFMasterPicker)return;
const esc=v=>window.BFCore?.esc?window.BFCore.esc(v):String(v??"");
const rows=key=>window.BFCore?.storage?.list(key)||[];
function nameOf(x){return String(x?.name||x?.nama||"").trim()}
function contactOf(x){return String(x?.wa||x?.phone||x?.contact||x?.no_hp||"").trim()}
function active(type){const key=type==="customer"?"bf_customers":"bf_suppliers";return rows(key).filter(x=>x&&!x.deleted_at&&x.active!==false&&nameOf(x))}
function listId(type,scope="global"){return `bf-${type}-picker-${String(scope).replace(/[^a-z0-9_-]/gi,"-")}`}
function datalist(type,scope="global"){
  const id=listId(type,scope), items=active(type);
  return `<datalist id="${id}">${items.map(x=>`<option value="${esc(nameOf(x))}" label="${esc([nameOf(x),contactOf(x)].filter(Boolean).join(" — "))}"></option>`).join("")}</datalist>`;
}
function input(type,{value="",id="",className="",scope="global",placeholder=""}={}){
  const list=listId(type,scope), ph=placeholder||(type==="customer"?"Cari nama / WA Customer...":"Cari nama / kontak Supplier...");
  return `<input ${id?`id="${esc(id)}"`:""} class="${esc(className)}" list="${esc(list)}" value="${esc(value)}" placeholder="${esc(ph)}" autocomplete="off">`;
}
function matches(type,query){const q=String(query||"").trim().toLowerCase();return active(type).filter(x=>!q||`${nameOf(x)} ${contactOf(x)}`.toLowerCase().includes(q))}
window.BFMasterPicker={active,datalist,input,matches,nameOf,contactOf,listId};
})();
