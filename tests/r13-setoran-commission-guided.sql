\set ON_ERROR_STOP on
create or replace function public.guided_assert(ok boolean,msg text) returns void language plpgsql as $$begin if not ok then raise exception 'GUIDED_ASSERT: %',msg;end if;end$$;

set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_record_case('SET-GUIDED-001','CUST-G','Customer G',1100000,current_date,null,'TRANSFER','[]'::jsonb,'guided','guided-case-001')).id as guided_case \gset
select public.bf_cf_submit_setoran_flow(:'guided_case'::uuid,'CUST-G','Customer G',1100000,current_date,'TRANSFER','BCA','[600000,400000]'::jsonb,true,'Disepakati sebagai komisi','guided-flow-001') as flow \gset
select public.guided_assert((select settled_note_total=1000000 and reconciliation_status='COMMISSION_PENDING_OWNER' and actual_sender is null from public.bf_customer_fund_cases where id=:'guided_case'::uuid),'guided case note total/status');
select public.guided_assert((select count(*)=1 and gross_amount=100000 and status='PENDING_OWNER' and source_mode='SETORAN_GUIDED' from public.bf_customer_fund_classifications where case_id=:'guided_case'::uuid),'system-derived commission proposal');
select public.bf_cf_submit_setoran_flow(:'guided_case'::uuid,'CUST-G','Customer G',1100000,current_date,'TRANSFER','BCA','[600000,400000]'::jsonb,true,'Disepakati sebagai komisi','guided-flow-001');
select public.guided_assert((select count(*)=1 from public.bf_customer_fund_classifications where case_id=:'guided_case'::uuid and source_mode='SETORAN_GUIDED' and status in ('PENDING_OWNER','CORRECTION_REQUIRED','APPROVED')),'retry does not duplicate commission');

reset role; set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select id as guided_class from public.bf_customer_fund_classifications where case_id=:'guided_case'::uuid and source_mode='SETORAN_GUIDED' \gset
select public.bf_cf_decide_setoran_commission(:'guided_class'::uuid,'APPROVE',6500,'CUSTOMER','Potongan bank dikonfirmasi Owner');
select public.guided_assert((select obligation_amount=93500 and bank_fee_amount=6500 from public.bf_customer_commission_obligations where classification_id=:'guided_class'::uuid),'customer-borne fee reduces commission once');
select public.guided_assert((select reconciliation_status='COMMISSION_APPROVED' and fee_bearer='CUSTOMER' from public.bf_customer_fund_cases where id=:'guided_case'::uuid),'owner approval updates case');

reset role; set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_record_case('SET-GUIDED-002','CUST-G','Customer G',1000000,current_date,null,'TUNAI','[]'::jsonb,'normal','guided-case-002')).id as normal_case \gset
select public.bf_cf_submit_setoran_flow(:'normal_case'::uuid,'CUST-G','Customer G',1000000,current_date,'TUNAI',null,'[600000,400000]'::jsonb,false,null,'guided-flow-002');
select public.guided_assert((select reconciliation_status='NO_OWNER_REQUIRED' and settled_note_total=1000000 from public.bf_customer_fund_cases where id=:'normal_case'::uuid),'normal Setoran needs no Owner');
select public.guided_assert((select count(*)=0 from public.bf_customer_fund_classifications where case_id=:'normal_case'::uuid),'normal Setoran has no commission classification');

select (public.bf_cf_record_case('SET-GUIDED-003','CUST-G','Customer G',1200000,current_date,null,'TRANSFER','[]'::jsonb,'correction','guided-case-003')).id as correction_case \gset
select public.bf_cf_submit_setoran_flow(:'correction_case'::uuid,'CUST-G','Customer G',1200000,current_date,'TRANSFER','BNI','[1000000]'::jsonb,true,'Awal','guided-flow-003');
reset role; set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select id as correction_class from public.bf_customer_fund_classifications where case_id=:'correction_case'::uuid and source_mode='SETORAN_GUIDED' \gset
select public.bf_cf_decide_setoran_commission(:'correction_class'::uuid,'CORRECTION_REQUIRED',0,'NONE','Nilai nota perlu diperbaiki');
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select public.bf_cf_submit_setoran_flow(:'correction_case'::uuid,'CUST-G','Customer G',1200000,current_date,'TRANSFER','BNI','[1100000]'::jsonb,true,'Sudah dikoreksi','guided-flow-003');
select public.guided_assert((select count(*)=1 and max(gross_amount)=100000 and max(status)='PENDING_OWNER' from public.bf_customer_fund_classifications where case_id=:'correction_case'::uuid and source_mode='SETORAN_GUIDED'),'correction reuses one classification and recalculates');

reset role;
select 'R13 guided Setoran commission PostgreSQL harness PASS' result;
