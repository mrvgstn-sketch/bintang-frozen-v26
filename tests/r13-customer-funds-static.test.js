"use strict";
const fs=require("fs"),vm=require("vm"),assert=require("assert"),path=require("path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const js=read("assets/js/customer-funds-control.js"),core=read("assets/js/core.js"),menu=read("assets/js/menu.js"),sql=read("supabase/migrations/20260822_r13_customer_funds_control.sql"),hard=read("supabase/migrations/20260822_r13_customer_funds_hardening.sql");
for(const [name,src] of [["customer-funds-control.js",js],["core.js",core],["menu.js",menu]])new vm.Script(src,{filename:name});
assert(core.includes('READ_ONLY_LEGACY_KEYS=new Set(["bf_note_setoran_v26"])'),"legacy Setoran must stay read-only");
assert(js.includes("window.BFOpenFinanceDeposit=openSetoran"),"canonical Setoran must own menu entry");
assert(js.includes("FAIL CLOSED")&&js.includes("GAGAL / BELUM TERSINKRON"),"sensitive flow must fail closed");
assert(!/localStorage\.setItem\s*\(\s*["']bf_note_setoran_v26/.test(js),"new module must not write legacy Setoran");
assert(!/bf_keluar_v26|BFOpenTransactionsOut|inventory_movements/.test(js),"Customer Funds must be reference-only to Barang Keluar/Tally");
const required=[
"bf_customer_setoran","bf_customer_fund_cases","bf_customer_fund_transfers","bf_entrusted_notes","bf_customer_fund_obligations","bf_customer_fund_payments","bf_customer_fund_events",
"bf_cfc_create_case","bf_cfc_create_setoran","bf_cfc_record_transfer","bf_cfc_reconcile_transfer","bf_cfc_create_entrusted_note","bf_cfc_approve_entrusted_note","bf_cfc_create_cashback","bf_cfc_create_entrusted_fund","bf_cfc_mark_paid","bf_cfc_verify_payment","bf_cfc_reverse_obligation"
];required.forEach(x=>assert(sql.includes(x),`missing ${x}`));
["bf_cfc_update_entrusted_note","bf_cfc_reverse_payment","bf_cfc_reverse_transfer"].forEach(x=>assert(hard.includes(x),`missing hardening RPC ${x}`));
["bf_cfc_update_entrusted_note","bf_cfc_reverse_payment","bf_cfc_reverse_transfer"].forEach(x=>assert(js.includes(x),`UI is not wired to ${x}`));
assert(js.includes("data-editnote")&&js.includes("data-payrev")&&js.includes("data-trrev"),"hardening UI controls missing");
assert(sql.includes("check(total_qty = bf_qty + entrusted_qty)"),"qty split constraint missing");
assert(sql.includes("check(total_note_value = bf_right + party2_right)"),"note value split constraint missing");
assert(sql.includes("bf_cfc_unique_cashback_source"),"cashback duplicate guard missing");
assert(sql.includes("bf_cfc_unique_entrusted_source"),"entrusted fund duplicate guard missing");
assert(sql.includes("bf_cfc_one_active_payment_per_obligation"),"payment duplicate guard missing");
assert(sql.includes("bf_cfc_bank_fee_once"),"bank fee duplicate guard missing");
assert(sql.includes("CFC_SELF_VERIFY_DENIED"),"self verification guard missing");
assert(sql.includes("for update")&&hard.includes("for update"),"concurrency row locking missing");
assert(sql.includes("approval_status='STALE'"),"stale approval guard missing");
assert(hard.includes("ENTRUSTED_NOTE_UPDATED"),"material-edit audit event missing");
assert(hard.includes("PAYMENT_REVERSAL_CREATED"),"payment reversal audit event missing");
assert(hard.includes("CFC_TRANSFER_HAS_ACTIVE_OBLIGATION"),"transfer reversal dependency guard missing");
assert(sql.includes("revoke insert,update,delete")&&sql.includes("grant select"),"direct mutation must be denied");
assert(sql.includes("security definer")&&hard.includes("security definer"),"guarded RPC boundary missing");
assert(!/insert\s+into\s+public\.(?:bf_keluar|bf_masuk|bf_state_items)/i.test(sql+hard),"migration must not become sales/inventory writer");
console.log("PASS: R13 Customer Funds static safety harness");
