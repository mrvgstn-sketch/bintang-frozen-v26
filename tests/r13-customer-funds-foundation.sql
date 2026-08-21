\set ON_ERROR_STOP on

create or replace function public.cf_assert(ok boolean,msg text) returns void language plpgsql as $$begin if not ok then raise exception 'CF_ASSERT: %',msg;end if;end$$;

-- Admin records one canonical Setoran reference. Replaying same idempotency key must return same case.
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_record_case('SET-TEST-001','CUST-ABC','CV ABC',1200000,current_date,'PT PEMBAYAR','TRANSFER','[]'::jsonb,'Test commission','cf-case-001')).id as case_id \gset
select public.cf_assert((select count(*)=1 from public.bf_customer_fund_cases where idempotency_key='cf-case-001'),'idempotent case create');
select public.cf_assert((select customer_id='CUST-ABC' and gross_transfer=1200000 from public.bf_customer_fund_cases where id=:'case_id'::uuid),'case snapshot');

-- Owner confirms actual bank receipt and Customer bears Rp6.500 fee.
reset role;set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.bf_cf_confirm_case(:'case_id'::uuid,1193500,'BANK_FEE','CUSTOMER','Biaya admin bank',1);
select public.cf_assert((select reconciliation_status='CONFIRMED' and difference_amount=6500 and fee_bearer='CUSTOMER' from public.bf_customer_fund_cases where id=:'case_id'::uuid),'owner reconciliation');

-- Admin proposes external POS note; Owner validates it.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_propose_sales_ref('CUST-ABC','CV ABC','KP-CF-001',current_date,1000000,'cf-ref-001')).id as ref_id \gset
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.bf_cf_validate_sales_ref(:'ref_id'::uuid,1);

-- Admin proposes allocation, Owner confirms. Excess is Rp200.000.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_propose_allocation(:'case_id'::uuid,:'ref_id'::uuid,1000000,'cf-alloc-001')).id as alloc_id \gset
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.bf_cf_confirm_allocation(:'alloc_id'::uuid,1);
select public.cf_assert((select gross_excess=200000 and unclassified_excess=200000 from public.bf_customer_fund_case_financials where case_id=:'case_id'::uuid),'excess after allocation');

-- Admin proposes Rp100.000 commission; bank fee Rp6.500 is allocated once. Owner approves => net Rp93.500.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_propose_classification(:'case_id'::uuid,'CUSTOMER_COMMISSION',100000,6500,'Komisi sesuai kesepakatan','cf-class-001')).id as class_id \gset
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.bf_cf_decide_classification(:'class_id'::uuid,'APPROVE','Disetujui Owner');
select public.cf_assert((select obligation_amount=93500 and bank_fee_amount=6500 from public.bf_customer_commission_obligations where classification_id=:'class_id'::uuid),'net commission obligation');
select public.cf_assert((select count(*)=1 and sum(amount)=6500 from public.bf_customer_fund_fee_allocations where case_id=:'case_id'::uuid and status='POSTED'),'single bank fee allocation');
select public.cf_assert((select unclassified_excess=100000 from public.bf_customer_fund_case_financials where case_id=:'case_id'::uuid),'remaining unclassified excess');

-- The same Rp6.500 fee cannot be allocated again to the remaining excess.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$begin
 begin
   perform public.bf_cf_propose_classification(current_setting('cf.case_id',true)::uuid,'CUSTOMER_DEPOSIT',100000,6500,'Simpan deposit','cf-class-dupfee');
   raise exception 'expected CF_BANK_FEE_DOUBLE_ALLOCATION';
 exception when others then
   if position('CF_BANK_FEE_DOUBLE_ALLOCATION' in sqlerrm)=0 then raise;end if;
 end;
end$$;

-- Since DO cannot see psql variables, set the case id and retry the exact negative scenario.
select set_config('cf.case_id',:'case_id',false);
do $$begin
 begin
   perform public.bf_cf_propose_classification(current_setting('cf.case_id')::uuid,'CUSTOMER_DEPOSIT',100000,6500,'Simpan deposit','cf-class-dupfee-2');
   raise exception 'expected CF_BANK_FEE_DOUBLE_ALLOCATION';
 exception when others then
   if position('CF_BANK_FEE_DOUBLE_ALLOCATION' in sqlerrm)=0 then raise;end if;
 end;
end$$;

-- Propose remaining Rp100.000 as deposit with no second fee; Owner approves => balance Rp100.000.
select (public.bf_cf_propose_classification(:'case_id'::uuid,'CUSTOMER_DEPOSIT',100000,0,'Simpan sebagai deposit','cf-class-deposit')).id as dep_class_id \gset
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.bf_cf_decide_classification(:'dep_class_id'::uuid,'APPROVE','Deposit disetujui');
select public.cf_assert((select available_amount=100000 from public.bf_customer_deposit_balances where customer_id='CUST-ABC'),'deposit balance derived from ledger');
select public.cf_assert((select unclassified_excess=0 from public.bf_customer_fund_case_financials where case_id=:'case_id'::uuid),'all excess classified exactly once');

-- Direct DML by authenticated client is denied.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$begin
 begin
   insert into public.bf_customer_commission_obligations(commission_no,classification_id,customer_id,customer_name_snapshot,gross_amount,obligation_amount,created_by)
   values('ILLEGAL',gen_random_uuid(),'X','X',1,1,auth.uid());
   raise exception 'expected direct DML denied';
 exception when insufficient_privilege then null;
 end;
end$$;

-- Non Admin/Owner cannot read Customer Funds tables through RLS.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select public.cf_assert((select count(*)=0 from public.bf_customer_fund_cases),'RLS hides funds from non admin/owner');

reset role;
select 'R13 Customer Funds foundation PostgreSQL harness PASS' as result;
