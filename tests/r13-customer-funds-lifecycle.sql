\set ON_ERROR_STOP on
create or replace function public.cfl_assert(ok boolean,msg text) returns void language plpgsql as $$begin if not ok then raise exception 'CFL_ASSERT: %',msg;end if;end$$;

-- Foundation test leaves CUST-ABC with commission 93,500 and deposit 100,000.
-- Create a second commission so one payout can allocate multiple obligations.
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

-- Admin records a combined partial payout: cash movement happens now because cash physically leaves.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_create_payout('CUSTOMER_COMMISSION','CUST-ABC','CV ABC',75000,current_date,'Budi','Pembayaran gabungan','data:image/png;base64,abcdefghijklmnop',2,'[]'::jsonb,'Kas Penjualan Harian',jsonb_build_array(jsonb_build_object('obligation_id',:'comm1','amount',50000),jsonb_build_object('obligation_id',:'comm2','amount',25000)),'life-pay-1')).id pay1 \gset
select public.cfl_assert((select count(*)=2 from public.bf_customer_fund_payout_allocations where payout_id=:'pay1'::uuid),'combined payout allocations');
select public.cfl_assert((select status='OUTSTANDING' from public.bf_customer_commission_obligations where id=:'comm1'::uuid),'pending payout does not falsely settle obligation');
select public.cfl_assert((select available_amount=43500 from public.bf_customer_commission_balances where obligation_id=:'comm1'::uuid),'pending payout reserves first obligation');
select public.cfl_assert((select available_amount=25000 from public.bf_customer_commission_balances where obligation_id=:'comm2'::uuid),'pending payout reserves second obligation');
select public.cfl_assert((select count(*)=1 from public.bf_cash_movements where source_ref_type='CUSTOMER_FUND_PAYOUT' and source_ref_id=:'pay1' and amount=75000 and movement_type='CUSTOMER_COMMISSION' and status='POSTED'),'cash movement recorded exactly once at payment time');

-- Cannot overcommit while payout awaits Owner.
select set_config('cfl.comm2',:'comm2',false);
do $$begin begin
 perform public.bf_cf_create_payout('CUSTOMER_COMMISSION','CUST-ABC','CV ABC',30000,current_date,'Budi','too much','data:image/png;base64,abcdefghijklmnop',1,'[]'::jsonb,'Kas',jsonb_build_array(jsonb_build_object('obligation_id',current_setting('cfl.comm2')::uuid,'amount',30000)),'life-over-2');
 raise exception 'expected CF_PAYOUT_EXCEEDS_OBLIGATION';exception when others then if position('CF_PAYOUT_EXCEEDS_OBLIGATION' in sqlerrm)=0 then raise;end if;end;end$$;

-- Owner verification settles business obligation but does not create a second cash movement.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.bf_cf_review_payout(:'pay1'::uuid,'VERIFY','cash verified');
select public.cfl_assert((select count(*)=1 from public.bf_cash_movements where source_ref_id=:'pay1'),'verification is idempotent with cash writer');
select public.cfl_assert((select status='PARTIALLY_PAID' from public.bf_customer_commission_obligations where id=:'comm1'::uuid),'first commission partial after verify');
select public.cfl_assert((select status='PARTIALLY_PAID' from public.bf_customer_commission_obligations where id=:'comm2'::uuid),'second commission partial after verify');

-- Liability transfer reserves remaining second commission, but status remains partial until Owner approval.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_propose_liability_transfer('CUST-ABC','CUSTOMER_COMMISSION',:'comm2'::uuid,25000,'Jadikan deposit','life-transfer')).id transfer1 \gset
select public.cfl_assert((select available_amount=0 from public.bf_customer_commission_balances where obligation_id=:'comm2'::uuid),'pending transfer reserves obligation');
select public.cfl_assert((select status='PARTIALLY_PAID' from public.bf_customer_commission_obligations where id=:'comm2'::uuid),'pending transfer not falsely posted');
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.bf_cf_decide_liability_transfer(:'transfer1'::uuid,'APPROVE','approved');
select public.cfl_assert((select available_amount=125000 from public.bf_customer_deposit_balances where customer_id='CUST-ABC'),'transfer increases deposit');
select public.cfl_assert((select status='FULLY_PAID' from public.bf_customer_commission_obligations where id=:'comm2'::uuid),'approved transfer settles obligation');

-- Deposit use must respect a validated note's remaining amount.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_propose_sales_ref('CUST-ABC','CV ABC','KP-LIFE-DEP',current_date,70000,'life-sales-dep')).id depref \gset
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);select public.bf_cf_validate_sales_ref(:'depref'::uuid,1);
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_propose_deposit_use('CUST-ABC',:'depref'::uuid,40000,'Pakai deposit ke nota','life-use')).id use1 \gset
select public.cfl_assert((select available_amount=85000 from public.bf_customer_deposit_balances where customer_id='CUST-ABC'),'pending use reserves deposit');
select public.cfl_assert((select remaining_amount=30000 from public.bf_customer_sales_settlements where sales_ref_id=:'depref'::uuid),'pending use reserves note capacity');
select set_config('cfl.depref',:'depref',false);
do $$begin begin perform public.bf_cf_propose_deposit_use('CUST-ABC',current_setting('cfl.depref')::uuid,40000,'over note','life-use-over-2');raise exception 'expected CF_DEPOSIT_USE_EXCEEDS_NOTE';exception when others then if position('CF_DEPOSIT_USE_EXCEEDS_NOTE' in sqlerrm)=0 then raise;end if;end;end$$;
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);select public.bf_cf_decide_deposit_use(:'use1'::uuid,'APPROVE','approved');
select public.cfl_assert((select deposit_used=40000 and remaining_amount=30000 from public.bf_customer_sales_settlements where sales_ref_id=:'depref'::uuid),'posted deposit use linked to note');

-- Wrong-transfer refund obligation and partial payout with Owner correction then verification.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_record_case('SET-LIFE-REF','CUST-ABC','CV ABC',80000,current_date,'SALAH KIRIM','TRANSFER','[]'::jsonb,'wrong transfer','life-ref-case')).id refcase \gset
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);select public.bf_cf_confirm_case(:'refcase'::uuid,80000,'NONE','NONE','ok',1);
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);select (public.bf_cf_propose_classification(:'refcase'::uuid,'WRONG_TRANSFER_REFUND',80000,0,'refund salah transfer','life-ref-class')).id refclass \gset
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);select public.bf_cf_decide_classification(:'refclass'::uuid,'APPROVE','ok');select id refund1 from public.bf_customer_refund_obligations where classification_id=:'refclass'::uuid \gset
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);select (public.bf_cf_create_payout('CUSTOMER_REFUND','CUST-ABC','CV ABC',20000,current_date,'Budi','Refund parsial','data:image/png;base64,abcdefghijklmnop',2,'[]'::jsonb,'Kas Penjualan Harian',jsonb_build_array(jsonb_build_object('obligation_id',:'refund1','amount',20000)),'life-ref-pay')).id refpay \gset
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);select public.bf_cf_review_payout(:'refpay'::uuid,'CORRECTION','cek penerima');select public.cfl_assert((select status='CORRECTION_REQUIRED' from public.bf_customer_fund_payouts where id=:'refpay'::uuid),'Owner can flag correction without deleting cash event');select public.bf_cf_review_payout(:'refpay'::uuid,'VERIFY','verified after check');
select public.cfl_assert((select status='PARTIALLY_PAID' from public.bf_customer_refund_obligations where id=:'refund1'::uuid),'refund partial verified');

-- Deposit refund reserves balance at payment time; reversal restores it and reverses cash movement.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);select (public.bf_cf_create_payout('CUSTOMER_DEPOSIT_REFUND','CUST-ABC','CV ABC',30000,current_date,'Budi','Refund deposit','data:image/png;base64,abcdefghijklmnop',2,'[]'::jsonb,'Kas Penjualan Harian','[]'::jsonb,'life-dep-refund')).id depay \gset
select public.cfl_assert((select available_amount=55000 from public.bf_customer_deposit_balances where customer_id='CUST-ABC'),'pending deposit refund reserves balance');
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);select public.bf_cf_review_payout(:'depay'::uuid,'VERIFY','verified');select public.bf_cf_reverse_payout(:'depay'::uuid,'cash returned');
select public.cfl_assert((select available_amount=85000 from public.bf_customer_deposit_balances where customer_id='CUST-ABC'),'reversal restores deposit');select public.cfl_assert((select status='REVERSED' from public.bf_cash_movements where source_ref_id=:'depay'),'reversal reverses cash movement');

-- Keep one active deposit refund for reconciliation category coverage.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);select (public.bf_cf_create_payout('CUSTOMER_DEPOSIT_REFUND','CUST-ABC','CV ABC',10000,current_date,'Budi','Refund deposit kecil','data:image/png;base64,abcdefghijklmnop',2,'[]'::jsonb,'Kas Penjualan Harian','[]'::jsonb,'life-dep-refund-active')).id depay2 \gset
reset role;set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);select public.bf_cf_review_payout(:'depay2'::uuid,'VERIFY','verified');

-- Cash reconciliation separates all payout categories and uses only POSTED cash movements.
select public.bf_cf_reconcile_cash_day(current_date,1000000,0,0,0,0,0,0,0,'lifecycle reconciliation');
select public.cfl_assert((select commission_payout_total=75000 from public.bf_cash_reconciliations where reconciliation_date=current_date),'commission payout separated');
select public.cfl_assert((select refund_payout_total=20000 from public.bf_cash_reconciliations where reconciliation_date=current_date),'refund payout separated');
select public.cfl_assert((select deposit_refund_total=10000 from public.bf_cash_reconciliations where reconciliation_date=current_date),'deposit refund separated and reversed payout excluded');
select public.cfl_assert((select expected_cash=1000000-entrusted_payout_total-commission_payout_total-refund_payout_total-deposit_refund_total from public.bf_cash_reconciliations where reconciliation_date=current_date),'cash formula consistent');

-- Direct lifecycle DML and non-owner review are denied.
reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);select set_config('cfl.pay1',:'pay1',false);
do $$begin begin update public.bf_customer_fund_payouts set amount=1 where id=current_setting('cfl.pay1')::uuid;raise exception 'expected denied';exception when insufficient_privilege then null;end;end$$;
do $$begin begin perform public.bf_cf_review_payout(current_setting('cfl.pay1')::uuid,'VERIFY','illegal');raise exception 'expected owner required';exception when others then if position('NT_OWNER_REQUIRED' in sqlerrm)=0 then raise;end if;end;end$$;

reset role;select 'R13 Customer Funds lifecycle PostgreSQL harness PASS' result;