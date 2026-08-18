(function(){
"use strict";
if(window.BFDataModel)return;
const own=(o,k)=>!!o&&Object.prototype.hasOwnProperty.call(o,k);
const str=v=>String(v??"").trim();
const num=v=>{const n=Number(String(v??0).trim().replace(",","."));return Number.isFinite(n)?n:0};
const weights=v=>Array.isArray(v)?v.map(num):[];
function marketingOf(group,legacy=""){
  if(own(group,"marketing"))return str(group.marketing);
  if(own(group,"marketingNama"))return str(group.marketingNama);
  return str(legacy);
}
function customerGroups(row={}){
  const legacy=str(row.marketing||row.marketingNama||row.staff||row.sales||row.employee||"");
  if(Array.isArray(row.customers)&&row.customers.length){
    return row.customers.map(g=>({...g,customer:str(g?.customer||g?.name),marketing:marketingOf(g,legacy),items:Array.isArray(g?.items)?g.items:[]}));
  }
  if(row.customer||row.item){
    return [{customer:str(row.customer),marketing:legacy,items:[{item:str(row.item),qty:row.qty??"",satuan:str(row.satuan||row.unit||"Kg"),timbangan:weights(row.timbangan||row.weights)}]}];
  }
  return [];
}
function supplierGroups(row={}){
  if(Array.isArray(row.suppliers)&&row.suppliers.length){return row.suppliers.map(g=>({...g,supplier:str(g?.supplier||g?.name),items:Array.isArray(g?.items)?g.items:[],nota_fotos:Array.isArray(g?.nota_fotos)?g.nota_fotos:(g?.nota_foto?[g.nota_foto]:[])}))}
  if(row.supplier||row.item){return [{supplier:str(row.supplier),nota_fotos:Array.isArray(row.nota_fotos)?row.nota_fotos:(row.nota_foto?[row.nota_foto]:[]),items:[{item:str(row.item),satuan:str(row.satuan||row.unit||"Kg"),timbangan:weights(row.timbangan||row.weights)}]}]}
  return [];
}
function itemWeights(item={}){return weights(item.timbangan||item.weights)}
function itemTotal(item={}){return itemWeights(item).reduce((a,b)=>a+b,0)}
function groupTotal(group={}){return (group.items||[]).reduce((s,i)=>s+itemTotal(i),0)}
function customerSearchText(c={}){return [c.name,c.nama,c.phone,c.no_hp,c.wa,c.contact,c.email].map(str).filter(Boolean).join(" ").toLowerCase()}
function supplierSearchText(s={}){return [s.name,s.nama,s.phone,s.no_hp,s.wa,s.contact,s.address,s.alamat].map(str).filter(Boolean).join(" ").toLowerCase()}
function search(list,query,textFn){const q=str(query).toLowerCase();return q?list.filter(x=>textFn(x).includes(q)):list}
window.BFDataModel={own,str,num,weights,marketingOf,customerGroups,supplierGroups,itemWeights,itemTotal,groupTotal,customerSearchText,supplierSearchText,searchCustomers:(list,q)=>search(list,q,customerSearchText),searchSuppliers:(list,q)=>search(list,q,supplierSearchText)};
})();
