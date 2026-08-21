\set ON_ERROR_STOP on
create schema if not exists auth;
create role anon nologin;
create role authenticated nologin;
grant usage on schema public,auth to anon,authenticated;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create or replace function public.test_assert(p_ok boolean,p_msg text) returns void language plpgsql as $$begin if not coalesce(p_ok,false) then raise exception 'ASSERT_FAIL: %',p_msg; end if; end$$;

create table public.bf_profiles(id uuid primary key,email text,display_name text,role text,active boolean not null default true);
insert into public.bf_profiles values
('11111111-1111-1111-1111-111111111111','owner@test.local','Owner','owner',true),
('22222222-2222-2222-2222-222222222222','admin@test.local','Admin','admin',true),
('33333333-3333-3333-3333-333333333333','operator@test.local','Operator','operator',true);

\ir ../supabase/migrations/20260822_r13_nota_dana_titipan.sql
\ir ../supabase/migrations/20260822_r13_nota_dana_titipan_hardening.sql

set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
select (public.bf_nt_create_note(
 'CUST-ABC','CV ABC','Restoran XYZ',1500,'Kesepakatan 1.500/kg','["KP-001"]'::jsonb,
 '[{"product_name":"BLD","total_qty":100,"bf_qty":50,"entrusted_qty":50,"note_unit_price":70000,"bf_sales_value":3250000}]'::jsonb,
 'note-mixed-001'
)).id as note_id \gset
select set_config('test.note_id', :'note_id', false);
select public.test_assert(effective_note_total=7000000,'effective_note_total mismatch') from public.bf_entrusted_note_financials where note_id=:'note_id';
select public.test_assert(effective_bf_right=3325000,'BF right must be 3.325.000') from public.bf_entrusted_note_financials where note_id=:'note_id';
select public.test_assert(bf_fee=75000,'fee must apply only to entrusted 50kg') from public.bf_entrusted_note_financials where note_id=:'note_id';

-- Pure entrusted note with zero fee must fail.
do $$begin
 begin
  perform public.bf_nt_create_note('C2','Pure Customer','Pure Buyer',0,null,'[]'::jsonb,
   '[{"product_name":"BLD","total_qty":100,"bf_qty":0,"entrusted_qty":100,"note_unit_price":70000,"bf_sales_value":0}]'::jsonb,'pure-zero-fee');
  raise exception 'EXPECTED_PURE_FEE_REJECTION_NOT_RAISED';
 exception when others then
  if sqlerrm='EXPECTED_PURE_FEE_REJECTION_NOT_RAISED' then raise; end if;
  if position('NT_PURE_ENTRUSTED_FEE_REQUIRED' in sqlerrm)=0 then raise; end if;
 end;
end$$;

select public.bf_nt_submit_note(:'note_id'::uuid);
-- Admin cannot approve.
do $$begin
 begin
  perform public.bf_nt_approve_note(current_setting('test.note_id')::uuid,'APPROVE',null);
  raise exception 'EXPECTED_ADMIN_APPROVAL_DENIAL_NOT_RAISED';
 exception when others then
  if sqlerrm='EXPECTED_ADMIN_APPROVAL_DENIAL_NOT_RAISED' then raise; end if;
  if position('NT_OWNER_REQUIRED' in sqlerrm)=0 then raise; end if;
 end;
end$$;

set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.bf_nt_approve_note(:'note_id'::uuid,'APPROVE','OK');

set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
select (public.bf_nt_record_transfer(:'note_id'::uuid,3000000,current_date,'Restoran XYZ','[]'::jsonb,null,'tr-001')).id as tr1 \gset
select set_config('test.tr1', :'tr1', false);
-- Admin cannot confirm bank receipt.
do $$begin
 begin
  perform public.bf_nt_confirm_transfer(current_setting('test.tr1')::uuid,3000000,'NONE',null);
  raise exception 'EXPECTED_ADMIN_CONFIRM_DENIAL_NOT_RAISED';
 exception when others then
  if sqlerrm='EXPECTED_ADMIN_CONFIRM_DENIAL_NOT_RAISED' then raise; end if;
  if position('NT_OWNER_REQUIRED' in sqlerrm)=0 then raise; end if;
 end;
end$$;

set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.bf_nt_confirm_transfer(:'tr1'::uuid,3000000,'NONE',null);
select public.test_assert(bf_shortfall=325000,'BF shortfall after first installment must be 325.000') from public.bf_entrusted_note_financials where note_id=:'note_id';
select public.test_assert(not is_paid,'Note must not be paid after first installment') from public.bf_entrusted_note_financials where note_id=:'note_id';

set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
do $$begin
 begin
  perform public.bf_nt_create_payout(current_setting('test.note_id')::uuid,100000,current_date,'Budi','Kesepakatan','data:image/png;base64,AAAAAAAAAAAAAA','[]'::jsonb,'Kas Penjualan Harian','early-pay');
  raise exception 'EXPECTED_EARLY_PAYOUT_REJECTION_NOT_RAISED';
 exception when others then
  if sqlerrm='EXPECTED_EARLY_PAYOUT_REJECTION_NOT_RAISED' then raise; end if;
  if position('NT_NOTE_NOT_PAID' in sqlerrm)=0 then raise; end if;
 end;
end$$;

select (public.bf_nt_record_transfer(:'note_id'::uuid,4000000,current_date,'Rekening Andi','[]'::jsonb,'Cicilan 2','tr-002')).id as tr2 \gset
-- Duplicate retry must fail by idempotency key.
do $$begin
 begin
  perform public.bf_nt_record_transfer(current_setting('test.note_id')::uuid,4000000,current_date,'Rekening Andi','[]'::jsonb,'retry','tr-002');
  raise exception 'EXPECTED_DUPLICATE_REJECTION_NOT_RAISED';
 exception when unique_violation then null;
 end;
end$$;

set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.bf_nt_confirm_transfer(:'tr2'::uuid,3993500,'BANK_FEE','Biaya admin bank');
select public.test_assert(gross_confirmed=7000000,'Gross confirmed must be exactly 7m') from public.bf_entrusted_note_financials where note_id=:'note_id';
select public.test_assert(actual_confirmed=6993500,'Actual received mismatch') from public.bf_entrusted_note_financials where note_id=:'note_id';
select public.test_assert(bank_fee_total=6500,'Bank fee mismatch') from public.bf_entrusted_note_financials where note_id=:'note_id';
select public.test_assert(is_paid,'Gross 7m must mark note paid') from public.bf_entrusted_note_financials where note_id=:'note_id';
select public.test_assert(entrusted_fund_total=3668500,'Dana Titipan must be 3.668.500') from public.bf_entrusted_note_financials where note_id=:'note_id';
select public.test_assert(bf_shortfall=0,'BF right must be full') from public.bf_entrusted_note_financials where note_id=:'note_id';

set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
select (public.bf_nt_create_payout(:'note_id'::uuid,2000000,current_date,'Budi','Disepakati dibayar 2 juta hari ini','data:image/png;base64,AAAAAAAAAAAAAAAAAAAA','[]'::jsonb,'Kas Penjualan Harian','payout-001')).id as payout1 \gset
select public.test_assert(count(*)=1,'Payout must create exactly one cash movement') from public.bf_cash_movements where source_ref_type='ENTRUSTED_PAYOUT' and source_ref_id=:'payout1' and status='POSTED';
select public.test_assert(payout_outstanding=1668500,'Partial payout outstanding mismatch') from public.bf_entrusted_note_financials where note_id=:'note_id';

-- Overpaying Party2 is blocked.
do $$begin
 begin
  perform public.bf_nt_create_payout(current_setting('test.note_id')::uuid,2000000,current_date,'Budi','Too much','data:image/png;base64,AAAAAAAAAAAAAAAAAAAA','[]'::jsonb,'Kas Penjualan Harian','payout-too-much');
  raise exception 'EXPECTED_PAYOUT_LIMIT_NOT_RAISED';
 exception when others then
  if sqlerrm='EXPECTED_PAYOUT_LIMIT_NOT_RAISED' then raise; end if;
  if position('NT_PAYOUT_EXCEEDS_OUTSTANDING' in sqlerrm)=0 then raise; end if;
 end;
end$$;

set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.bf_nt_verify_payout(:'payout1'::uuid,'VERIFY','TTD diperiksa');
select public.bf_nt_reconcile_cash(current_date,10000000,7000000,1000000,0,0,0,0,0,'Test');
select public.test_assert(expected_cash=7000000,'Expected cash mismatch') from public.bf_cash_reconciliations where reconciliation_date=current_date;
select public.test_assert(difference=0,'Cash reconciliation should match exactly') from public.bf_cash_reconciliations where reconciliation_date=current_date;
select public.test_assert(entrusted_payout_total=2000000,'Dana Titipan must be separate from expense but included in reconciliation') from public.bf_cash_reconciliations where reconciliation_date=current_date;

-- Operator cannot read security-invoker financial view.
set request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
set role authenticated;
select count(*) as operator_visible_rows from public.bf_entrusted_note_financials \gset
reset role;
select public.test_assert(:operator_visible_rows::integer=0,'Operator must not read financial view');

-- Authenticated direct write denied.
set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
set role authenticated;
do $$begin
 begin
  insert into public.bf_entrusted_notes(note_no,customer_name_snapshot,buyer_name,created_by,idempotency_key) values('HACK','X','Y','22222222-2222-2222-2222-222222222222','hack');
  raise exception 'EXPECTED_DIRECT_WRITE_DENIAL_NOT_RAISED';
 exception when insufficient_privilege then null;
 end;
end$$;
reset role;

select 'R13 Nota & Dana Titipan PostgreSQL harness PASS' as result;
