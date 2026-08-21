\set ON_ERROR_STOP on
create schema if not exists auth;
create role anon nologin;
create role authenticated nologin;
grant usage on schema public,auth to anon,authenticated;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

create table public.bf_profiles(id uuid primary key,email text,display_name text,role text,active boolean not null default true);
insert into public.bf_profiles values
('11111111-1111-1111-1111-111111111111','owner@test.local','Owner','owner',true),
('22222222-2222-2222-2222-222222222222','admin@test.local','Admin','admin',true),
('33333333-3333-3333-3333-333333333333','operator@test.local','Operator','operator',true);

\ir ../supabase/migrations/20260822_r13_nota_dana_titipan.sql
\ir ../supabase/migrations/20260822_r13_nota_dana_titipan_hardening.sql

-- Admin creates a mixed 100kg note: BF 50kg + Party2 50kg. Fee only on entrusted 50kg.
set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
select (public.bf_nt_create_note(
 'CUST-ABC','CV ABC','Restoran XYZ',1500,'Kesepakatan 1.500/kg','["KP-001"]'::jsonb,
 '[{"product_name":"BLD","total_qty":100,"bf_qty":50,"entrusted_qty":50,"note_unit_price":70000,"bf_sales_value":3250000}]'::jsonb,
 'note-mixed-001'
)).id as note_id \gset

select effective_note_total,effective_bf_right,bf_fee,entrusted_qty from public.bf_entrusted_note_financials where note_id=:'note_id' \gset
\if :effective_note_total != 7000000.00
 \error 'effective_note_total mismatch'
\endif
\if :effective_bf_right != 3325000.00
 \error 'BF right must be sales 3.250.000 + fee 75.000'
\endif
\if :bf_fee != 75000.00
 \error 'fee must apply only to entrusted 50kg'
\endif

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
  perform public.bf_nt_approve_note(:'note_id'::uuid,'APPROVE',null);
  raise exception 'EXPECTED_ADMIN_APPROVAL_DENIAL_NOT_RAISED';
 exception when others then
  if sqlerrm='EXPECTED_ADMIN_APPROVAL_DENIAL_NOT_RAISED' then raise; end if;
  if position('NT_OWNER_REQUIRED' in sqlerrm)=0 then raise; end if;
 end;
end$$;

-- Owner approves.
set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.bf_nt_approve_note(:'note_id'::uuid,'APPROVE','OK');

-- First installment 3m: BF right remains short 325k and payout is blocked.
set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
select (public.bf_nt_record_transfer(:'note_id'::uuid,3000000,current_date,'Restoran XYZ','[]'::jsonb,null,'tr-001')).id as tr1 \gset

-- Admin cannot confirm actual bank receipt.
do $$begin
 begin
  perform public.bf_nt_confirm_transfer(:'tr1'::uuid,3000000,'NONE',null);
  raise exception 'EXPECTED_ADMIN_CONFIRM_DENIAL_NOT_RAISED';
 exception when others then
  if sqlerrm='EXPECTED_ADMIN_CONFIRM_DENIAL_NOT_RAISED' then raise; end if;
  if position('NT_OWNER_REQUIRED' in sqlerrm)=0 then raise; end if;
 end;
end$$;

set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.bf_nt_confirm_transfer(:'tr1'::uuid,3000000,'NONE',null);
select bf_shortfall,is_paid from public.bf_entrusted_note_financials where note_id=:'note_id' \gset
\if :bf_shortfall != 325000.00
 \error 'BF shortfall after first installment must be 325.000'
\endif
\if :is_paid != f
 \error 'Note must not be paid after first installment'
\endif

set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
do $$begin
 begin
  perform public.bf_nt_create_payout(:'note_id'::uuid,100000,current_date,'Budi','Kesepakatan','data:image/png;base64,AAAAAAAAAAAAAA','[]'::jsonb,'Kas Penjualan Harian','early-pay');
  raise exception 'EXPECTED_EARLY_PAYOUT_REJECTION_NOT_RAISED';
 exception when others then
  if sqlerrm='EXPECTED_EARLY_PAYOUT_REJECTION_NOT_RAISED' then raise; end if;
  if position('NT_NOTE_NOT_PAID' in sqlerrm)=0 then raise; end if;
 end;
end$$;

-- Second installment gross 4m, actual 3,993,500 due to bank fee 6,500 borne by Party2.
select (public.bf_nt_record_transfer(:'note_id'::uuid,4000000,current_date,'Rekening Andi','[]'::jsonb,'Cicilan 2','tr-002')).id as tr2 \gset
-- Duplicate network retry must fail by idempotency key.
do $$begin
 begin
  perform public.bf_nt_record_transfer(:'note_id'::uuid,4000000,current_date,'Rekening Andi','[]'::jsonb,'retry','tr-002');
  raise exception 'EXPECTED_DUPLICATE_REJECTION_NOT_RAISED';
 exception when unique_violation then null;
 end;
end$$;

set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.bf_nt_confirm_transfer(:'tr2'::uuid,3993500,'BANK_FEE','Biaya admin bank');
select gross_confirmed,actual_confirmed,bank_fee_total,is_paid,entrusted_fund_total,payout_outstanding,bf_shortfall from public.bf_entrusted_note_financials where note_id=:'note_id' \gset
\if :gross_confirmed != 7000000.00
 \error 'Gross confirmed must be exactly 7m (no double counting)'
\endif
\if :actual_confirmed != 6993500.00
 \error 'Actual received mismatch'
\endif
\if :bank_fee_total != 6500.00
 \error 'Bank fee mismatch'
\endif
\if :is_paid != t
 \error 'Gross paid 7m must mark note paid'
\endif
\if :entrusted_fund_total != 3668500.00
 \error 'Dana Titipan must be actual received 6.9935m - BF right 3.325m'
\endif
\if :bf_shortfall != 0.00
 \error 'BF right must be full'
\endif

-- Admin pays a partial 2m cash with mandatory signature. This creates exactly one cash movement.
set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
select (public.bf_nt_create_payout(:'note_id'::uuid,2000000,current_date,'Budi','Disepakati dibayar 2 juta hari ini','data:image/png;base64,AAAAAAAAAAAAAAAAAAAA','[]'::jsonb,'Kas Penjualan Harian','payout-001')).id as payout1 \gset
select count(*) n from public.bf_cash_movements where source_ref_type='ENTRUSTED_PAYOUT' and source_ref_id=:'payout1' and status='POSTED' \gset
\if :n != 1
 \error 'Payout must create one and only one cash movement'
\endif
select payout_outstanding from public.bf_entrusted_note_financials where note_id=:'note_id' \gset
\if :payout_outstanding != 1668500.00
 \error 'Partial payout outstanding mismatch'
\endif

-- Overpaying Party2 is blocked.
do $$begin
 begin
  perform public.bf_nt_create_payout(:'note_id'::uuid,2000000,current_date,'Budi','Too much','data:image/png;base64,AAAAAAAAAAAAAAAAAAAA','[]'::jsonb,'Kas Penjualan Harian','payout-too-much');
  raise exception 'EXPECTED_PAYOUT_LIMIT_NOT_RAISED';
 exception when others then
  if sqlerrm='EXPECTED_PAYOUT_LIMIT_NOT_RAISED' then raise; end if;
  if position('NT_PAYOUT_EXCEEDS_OUTSTANDING' in sqlerrm)=0 then raise; end if;
 end;
end$$;

-- Owner verifies payout. Admin self/role verification is impossible.
set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.bf_nt_verify_payout(:'payout1'::uuid,'VERIFY','TTD diperiksa');

-- Daily cash reconciliation: POS 10m - expense 1m - entrusted payout 2m = expected 7m.
select public.bf_nt_reconcile_cash(current_date,10000000,7000000,1000000,0,0,0,0,0,'Test');
select expected_cash,difference,entrusted_payout_total from public.bf_cash_reconciliations where reconciliation_date=current_date \gset
\if :expected_cash != 7000000.00
 \error 'Expected cash mismatch'
\endif
\if :difference != 0.00
 \error 'Cash reconciliation should match exactly'
\endif
\if :entrusted_payout_total != 2000000.00
 \error 'Dana Titipan cash-out must be separated from expense but included in reconciliation'
\endif

-- Operator must not read security-invoker financial view.
set request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
set role authenticated;
select count(*) as operator_visible_rows from public.bf_entrusted_note_financials \gset
\if :operator_visible_rows != 0
 \error 'Operator must not read Nota Titipan financial view'
\endif
reset role;

-- Authenticated direct write is denied by RLS/privilege boundary.
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
