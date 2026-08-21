\set ON_ERROR_STOP on
create or replace function public.cfl_assert(ok boolean,msg text) returns void language plpgsql as $$begin if not ok then raise exception 'CFL_ASSERT: %',msg;end if;end$$;

-- Foundation test already created CUST-ABC: commission 93,500 and deposit 100,000.
-- Create a second commission so one payout can allocate across multiple obligations.
set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_record_case('SET-LIFE-002','CUST-ABC','CV ABC',50000,current_date,'PT X','TRANSFER','[]'::jsonb,'second commission','life-case-2')).id case2 \gset
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.bf_cf_confirm_case(:'case2'::uuid,50000,'NONE','NONE','ok',1);
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_propose_classification(:'case2'::uuid,'CUSTOMER_COMMISSION',50000,0,'second commission','life-class-2')).id class2 \gset
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.bf_cf_decide_classification(:'class2'::uuid,'APPROVE','ok');
select id comm1 from public.bf_customer_commission_obligations where obligation_amount=93500 and customer_id='CUST-ABC' order by created_at limit 1 \gset
select id comm2 from public.bf_customer_commission_obligations where classification_id=:'class2'::uuid \gset

-- Admin records combined partial payout: 50k from first + 25k from second. Signature mandatory.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_create_payout('CUST-ABC','CV ABC','CUSTOMER_COMMISSION',75000,current_date,'Budi','Pembayaran gabungan','data:image/png;base64,abcdefghijklmnop',2,'[]'::jsonb,'Kas Penjualan Harian',jsonb_build_array(jsonb_build_object('obligation_id',:'comm1','amount',50000),jsonb_build_object('obligation_id',:'comm2','amount',25000)),'life-pay-1')).id pay1 \gset
select public.cfl_assert((select count(*)=2 from public.bf_customer_fund_payout_allocations where payout_id=:'pay1'::uuid),'combined payout allocations');
select public.cfl_assert((select status='PARTIALLY_PAID' from public.bf_customer_commission_obligations where id=:'comm1'::uuid),'first partial committed');
select public.cfl_assert((select status='PARTIALLY_PAID' from public.bf_customer_commission_obligations where id=:'comm2'::uuid),'second partial committed');

-- Cannot overcommit same obligation while payout awaits Owner.
do $$begin begin perform public.bf_cf_create_payout('CUST-ABC','CV ABC','CUSTOMER_COMMISSION',50000,current_date,'Budi','too much','data:image/png;base64,abcdefghijklmnop',1,'[]'::jsonb,'Kas',jsonb_build_array(jsonb_build_object('obligation_id',current_setting('cfl.comm2')::uuid,'amount',50000)),'life-over');raise exception 'expected CF_PAYOUT_EXCEEDS_OUTSTANDING';exception when others then if position('CF_PAYOUT_EXCEEDS_OUTSTANDING' in sqlerrm)=0 then raise;end if;end;end$$;
-- Set GUC then repeat deterministic negative test.
select set_config('cfl.comm2',:'comm2',false);
do $$begin begin perform public.bf_cf_create_payout('CUST-ABC','CV ABC','CUSTOMER_COMMISSION',50000,current_date,'Budi','too much','data:image/png;base64,abcdefghijklmnop',1,'[]'::jsonb,'Kas',jsonb_build_array(jsonb_build_object('obligation_id',current_setting('cfl.comm2')::uuid,'amount',50000)),'life-over-2');raise exception 'expected CF_PAYOUT_EXCEEDS_OUTSTANDING';exception when others then if position('CF_PAYOUT_EXCEEDS_OUTSTANDING' in sqlerrm)=0 then raise;end if;end;end$$;

-- Owner verifies: exactly one shared cash movement.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.bf_cf_verify_payout(:'pay1'::uuid,'cash verified');
select public.cfl_assert((select count(*)=1 from public.bf_cash_movements where source_ref_type='CUSTOMER_FUND_PAYOUT' and source_ref_id=:'pay1'),'one cash movement');
select public.cfl_assert((select movement_type='CUSTOMER_COMMISSION' and amount=75000 and status='POSTED' from public.bf_cash_movements where source_ref_id=:'pay1'),'cash movement semantics');

-- Transfer remaining second commission 25k into Deposit; maker-checker and no double-spend.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_propose_liability_transfer('CUST-ABC','CUSTOMER_COMMISSION',:'comm2'::uuid,25000,'Jadikan deposit','life-transfer')).id transfer1 \gset
select public.cfl_assert(public.bf_cf_obligation_remaining('CUSTOMER_COMMISSION',:'comm2'::uuid)=0,'pending transfer reserves obligation');
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.bf_cf_decide_liability_transfer(:'transfer1'::uuid,'APPROVE','approved');
select public.cfl_assert((select available_amount=125000 from public.bf_customer_deposit_balances where customer_id='CUST-ABC'),'transfer increases deposit');
select public.cfl_assert((select status='FULLY_PAID' from public.bf_customer_commission_obligations where id=:'comm2'::uuid),'transferred obligation settled');

-- Deposit can be proposed against validated POS reference, Owner approves; balance reserved immediately.
select id salesref from public.bf_customer_fund_sales_refs where customer_id='CUST-ABC' and status='VALIDATED' order by proposed_at limit 1 \gset
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_use_deposit('CUST-ABC','CV ABC',:'salesref'::uuid,40000,'Pakai deposit ke nota','life-use')).id use1 \gset
select public.cfl_assert((select available_amount=85000 from public.bf_customer_deposit_balances where customer_id='CUST-ABC'),'pending use reserves deposit');
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.bf_cf_decide_deposit_use(:'use1'::uuid,'APPROVE','approved');
select public.cfl_assert((select available_amount=85000 from public.bf_customer_deposit_balances where customer_id='CUST-ABC'),'posted use stable balance');

-- Deposit refund requires signature and reserves balance; Owner verification posts shared cash movement.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_create_payout('CUST-ABC','CV ABC','CUSTOMER_DEPOSIT_REFUND',30000,current_date,'Budi','Refund deposit','data:image/png;base64,abcdefghijklmnop',2,'[]'::jsonb,'Kas Penjualan Harian','[]'::jsonb,'life-dep-refund')).id depay \gset
select public.cfl_assert((select available_amount=55000 from public.bf_customer_deposit_balances where customer_id='CUST-ABC'),'pending deposit refund reserves balance');
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.bf_cf_verify_payout(:'depay'::uuid,'verified');
select public.cfl_assert((select movement_type='CUSTOMER_DEPOSIT_REFUND' and amount=30000 from public.bf_cash_movements where source_ref_id=:'depay'),'deposit refund cash movement');

-- Reversal restores deposit and reverses cash movement, never deletes history.
select public.bf_cf_reverse_payout(:'depay'::uuid,'cash returned');
select public.cfl_assert((select available_amount=85000 from public.bf_customer_deposit_balances where customer_id='CUST-ABC'),'reversal restores deposit');
select public.cfl_assert((select status='REVERSED' from public.bf_cash_movements where source_ref_id=:'depay'),'cash movement reversed');
select public.cfl_assert((select status='REVERSED' from public.bf_customer_fund_payouts where id=:'depay'::uuid),'payout retained as reversed history');

-- Direct payout DML remains denied.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$begin begin update public.bf_customer_fund_payouts set amount=1 where id=current_setting('cfl.pay1',true)::uuid;raise exception 'expected denied';exception when insufficient_privilege then null;end;end$$;

reset role;select 'R13 Customer Funds lifecycle PostgreSQL harness PASS' result;
