-- R13 Customer Funds Control foundation
-- UAT ONLY. ADDITIVE / REVERSIBLE. DO NOT APPLY TO PRODUCTION AUTOMATICALLY.
-- bf_note_setoran_v26 remains the one canonical incoming-money writer.
-- Kasir Pintar remains the canonical sales/POS writer; sales references below are reconciliation snapshots only.
begin;

create sequence if not exists public.bf_cf_case_seq;
create sequence if not exists public.bf_cf_commission_seq;
create sequence if not exists public.bf_cf_refund_seq;
create sequence if not exists public.bf_cf_payout_seq;

-- Extend the already-shared cash movement ledger instead of creating another cash-out writer.
alter table public.bf_cash_movements drop constraint if exists bf_cash_movements_movement_type_check;
alter table public.bf_cash_movements add constraint bf_cash_movements_movement_type_check
  check(movement_type in ('DANA_TITIPAN','CUSTOMER_COMMISSION','CUSTOMER_REFUND','CUSTOMER_DEPOSIT_REFUND','PENGELUARAN','OWNER_WITHDRAWAL','OWNER_TOPUP','OTHER'));
alter table public.bf_cash_reconciliations add column if not exists commission_payout_total numeric(18,2) not null default 0 check(commission_payout_total>=0);
alter table public.bf_cash_reconciliations add column if not exists refund_payout_total numeric(18,2) not null default 0 check(refund_payout_total>=0);
alter table public.bf_cash_reconciliations add column if not exists deposit_refund_total numeric(18,2) not null default 0 check(deposit_refund_total>=0);

create table if not exists public.bf_customer_fund_cases(
  id uuid primary key default gen_random_uuid(),
  case_no text not null unique,
  source_setoran_id text not null unique,
  customer_id text not null,
  customer_name_snapshot text not null,
  gross_transfer numeric(18,2) not null check(gross_transfer>0),
  transfer_date date not null,
  actual_sender text,
  payment_method text,
  proof_urls jsonb not null default '[]'::jsonb check(jsonb_typeof(proof_urls)='array'),
  note text,
  reconciliation_status text not null default 'RECORDED' check(reconciliation_status in ('RECORDED','CONFIRMED','EXCEPTION','CORRECTION_REQUIRED','REVERSED')),
  actual_received numeric(18,2) check(actual_received>=0),
  difference_amount numeric(18,2) not null default 0 check(difference_amount>=0),
  difference_type text not null default 'NONE' check(difference_type in ('NONE','BANK_FEE','OTHER')),
  fee_bearer text not null default 'PENDING' check(fee_bearer in ('PENDING','NONE','CUSTOMER','BF')),
  difference_reason text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  revision bigint not null default 1 check(revision>0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  idempotency_key text not null unique,
  check(actual_received is null or actual_received<=gross_transfer)
);
create index if not exists bf_cf_cases_customer_time on public.bf_customer_fund_cases(customer_id,created_at desc);

create table if not exists public.bf_customer_fund_sales_refs(
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  customer_name_snapshot text not null,
  external_ref text not null,
  note_date date,
  note_amount numeric(18,2) not null check(note_amount>0),
  status text not null default 'PENDING_OWNER' check(status in ('PENDING_OWNER','VALIDATED','CORRECTION_REQUIRED','REVERSED')),
  revision bigint not null default 1 check(revision>0),
  proposed_by uuid not null,
  proposed_at timestamptz not null default now(),
  validated_by uuid,
  validated_at timestamptz,
  idempotency_key text not null unique,
  unique(customer_id,external_ref)
);

create table if not exists public.bf_customer_fund_allocations(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.bf_customer_fund_cases(id) on delete restrict,
  sales_ref_id uuid not null references public.bf_customer_fund_sales_refs(id) on delete restrict,
  amount numeric(18,2) not null check(amount>0),
  status text not null default 'PROPOSED' check(status in ('PROPOSED','CONFIRMED','CORRECTION_REQUIRED','REVERSED')),
  revision bigint not null default 1 check(revision>0),
  proposed_by uuid not null,
  proposed_at timestamptz not null default now(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  correction_reason text,
  idempotency_key text not null unique
);
create unique index if not exists bf_cf_one_active_case_note_allocation
  on public.bf_customer_fund_allocations(case_id,sales_ref_id) where status<>'REVERSED';

create table if not exists public.bf_customer_fund_classifications(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.bf_customer_fund_cases(id) on delete restrict,
  classification_type text not null check(classification_type in ('CUSTOMER_COMMISSION','CUSTOMER_DEPOSIT','WRONG_TRANSFER_REFUND')),
  gross_amount numeric(18,2) not null check(gross_amount>0),
  customer_bank_fee_amount numeric(18,2) not null default 0 check(customer_bank_fee_amount>=0),
  net_amount numeric(18,2) generated always as (gross_amount-customer_bank_fee_amount) stored,
  agreement_note text not null,
  status text not null default 'PENDING_OWNER' check(status in ('PENDING_OWNER','APPROVED','REJECTED','CORRECTION_REQUIRED','REVERSED')),
  proposed_by uuid not null,
  proposed_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  idempotency_key text not null unique,
  check(customer_bank_fee_amount<=gross_amount)
);
create index if not exists bf_cf_class_case on public.bf_customer_fund_classifications(case_id,status);

create table if not exists public.bf_customer_fund_fee_allocations(
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.bf_customer_fund_cases(id) on delete restrict,
  classification_id uuid not null unique references public.bf_customer_fund_classifications(id) on delete restrict,
  target_type text not null check(target_type in ('CUSTOMER_COMMISSION','CUSTOMER_DEPOSIT','WRONG_TRANSFER_REFUND')),
  amount numeric(18,2) not null check(amount>0),
  status text not null default 'POSTED' check(status in ('POSTED','REVERSED')),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bf_customer_commission_obligations(
  id uuid primary key default gen_random_uuid(),
  commission_no text not null unique,
  classification_id uuid not null unique references public.bf_customer_fund_classifications(id) on delete restrict,
  customer_id text not null,
  customer_name_snapshot text not null,
  gross_amount numeric(18,2) not null check(gross_amount>0),
  bank_fee_amount numeric(18,2) not null default 0 check(bank_fee_amount>=0),
  obligation_amount numeric(18,2) not null check(obligation_amount>=0),
  status text not null default 'OUTSTANDING' check(status in ('OUTSTANDING','PARTIALLY_PAID','FULLY_PAID','CORRECTION_REQUIRED','REVERSED')),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bf_customer_refund_obligations(
  id uuid primary key default gen_random_uuid(),
  refund_no text not null unique,
  classification_id uuid not null unique references public.bf_customer_fund_classifications(id) on delete restrict,
  customer_id text not null,
  customer_name_snapshot text not null,
  gross_amount numeric(18,2) not null check(gross_amount>0),
  bank_fee_amount numeric(18,2) not null default 0 check(bank_fee_amount>=0),
  obligation_amount numeric(18,2) not null check(obligation_amount>=0),
  status text not null default 'OUTSTANDING' check(status in ('OUTSTANDING','PARTIALLY_PAID','FULLY_PAID','CORRECTION_REQUIRED','REVERSED')),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bf_customer_deposit_ledger(
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  customer_name_snapshot text not null,
  entry_type text not null check(entry_type in ('CREATED','USED','REFUNDED','TRANSFER_IN','TRANSFER_OUT','CORRECTION')),
  amount numeric(18,2) not null check(amount>0),
  classification_id uuid references public.bf_customer_fund_classifications(id) on delete restrict,
  target_sales_ref_id uuid references public.bf_customer_fund_sales_refs(id) on delete restrict,
  source_ref_type text,
  source_ref_id text,
  agreement_note text,
  status text not null default 'POSTED' check(status in ('PENDING_OWNER','POSTED','CORRECTION_REQUIRED','REVERSED')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  idempotency_key text not null unique
);
create index if not exists bf_cf_deposit_customer on public.bf_customer_deposit_ledger(customer_id,created_at);

create table if not exists public.bf_customer_fund_payouts(
  id uuid primary key default gen_random_uuid(),
  payout_no text not null unique,
  customer_id text not null,
  customer_name_snapshot text not null,
  payout_type text not null check(payout_type in ('CUSTOMER_COMMISSION','CUSTOMER_REFUND','CUSTOMER_DEPOSIT_REFUND')),
  amount numeric(18,2) not null check(amount>0),
  payment_date date not null,
  recipient_name text not null,
  agreement_note text not null,
  signature_data text not null,
  signature_strokes integer not null check(signature_strokes>0),
  photo_urls jsonb not null default '[]'::jsonb check(jsonb_typeof(photo_urls)='array'),
  source_cash_label text not null default 'Kas Penjualan Harian',
  status text not null default 'PENDING_OWNER' check(status in ('PENDING_OWNER','VERIFIED','CORRECTION_REQUIRED','REVERSED')),
  paid_by uuid not null,
  paid_at timestamptz not null default now(),
  verified_by uuid,
  verified_at timestamptz,
  verification_note text,
  idempotency_key text not null unique,
  check(length(signature_data)>=20)
);

create table if not exists public.bf_customer_fund_payout_allocations(
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.bf_customer_fund_payouts(id) on delete restrict,
  obligation_type text not null check(obligation_type in ('CUSTOMER_COMMISSION','CUSTOMER_REFUND')),
  obligation_id uuid not null,
  amount numeric(18,2) not null check(amount>0),
  unique(payout_id,obligation_type,obligation_id)
);

create table if not exists public.bf_customer_fund_liability_transfers(
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  source_type text not null check(source_type in ('CUSTOMER_COMMISSION','CUSTOMER_REFUND','DANA_TITIPAN')),
  source_ref_id text not null,
  destination_type text not null default 'CUSTOMER_DEPOSIT' check(destination_type='CUSTOMER_DEPOSIT'),
  amount numeric(18,2) not null check(amount>0),
  agreement_note text not null,
  status text not null default 'PENDING_OWNER' check(status in ('PENDING_OWNER','POSTED','REJECTED','CORRECTION_REQUIRED','REVERSED')),
  proposed_by uuid not null,
  proposed_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  idempotency_key text not null unique
);

create table if not exists public.bf_customer_fund_events(
  id bigint generated always as identity primary key,
  case_id uuid references public.bf_customer_fund_cases(id) on delete restrict,
  event_type text not null,
  actor_id uuid not null,
  actor_role text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  related_record_type text,
  related_record_id text,
  created_at timestamptz not null default now()
);
create index if not exists bf_cf_events_case_time on public.bf_customer_fund_events(case_id,created_at desc);

create or replace view public.bf_customer_deposit_balances with (security_invoker=true) as
select customer_id,max(customer_name_snapshot) customer_name_snapshot,
  coalesce(sum(case when status in ('POSTED','PENDING_OWNER','CORRECTION_REQUIRED') then
    case when entry_type in ('CREATED','TRANSFER_IN','CORRECTION') then amount else -amount end else 0 end),0)::numeric(18,2) available_amount
from public.bf_customer_deposit_ledger
group by customer_id;

create or replace view public.bf_customer_fund_case_financials with (security_invoker=true) as
select c.id case_id,c.case_no,c.customer_id,c.customer_name_snapshot,c.gross_transfer,c.actual_received,c.difference_amount,c.difference_type,c.fee_bearer,c.reconciliation_status,
  coalesce((select sum(a.amount) from public.bf_customer_fund_allocations a where a.case_id=c.id and a.status='CONFIRMED'),0)::numeric(18,2) allocated_confirmed,
  coalesce((select sum(x.gross_amount) from public.bf_customer_fund_classifications x where x.case_id=c.id and x.status in ('PENDING_OWNER','APPROVED','CORRECTION_REQUIRED')),0)::numeric(18,2) excess_committed,
  greatest(c.gross_transfer-coalesce((select sum(a.amount) from public.bf_customer_fund_allocations a where a.case_id=c.id and a.status='CONFIRMED'),0),0)::numeric(18,2) gross_excess,
  greatest(c.gross_transfer-coalesce((select sum(a.amount) from public.bf_customer_fund_allocations a where a.case_id=c.id and a.status='CONFIRMED'),0)-coalesce((select sum(x.gross_amount) from public.bf_customer_fund_classifications x where x.case_id=c.id and x.status in ('PENDING_OWNER','APPROVED','CORRECTION_REQUIRED')),0),0)::numeric(18,2) unclassified_excess
from public.bf_customer_fund_cases c;

create or replace function public.bf_cf_event(p_case uuid,p_type text,p_reason text,p_before jsonb,p_after jsonb,p_record_type text,p_record_id text)
returns void language plpgsql security definer set search_path=public as $$ begin
 insert into public.bf_customer_fund_events(case_id,event_type,actor_id,actor_role,reason,before_data,after_data,related_record_type,related_record_id)
 values(p_case,p_type,auth.uid(),coalesce((select role from public.bf_profiles where id=auth.uid()),'unknown'),p_reason,p_before,p_after,p_record_type,p_record_id);
end $$;

create or replace function public.bf_cf_record_case(
 p_source_setoran_id text,p_customer_id text,p_customer_name text,p_gross numeric,p_transfer_date date,p_actual_sender text,p_method text,p_proofs jsonb,p_note text,p_idempotency text
) returns public.bf_customer_fund_cases language plpgsql security definer set search_path=public as $$
declare c public.bf_customer_fund_cases;
begin
 perform public.bf_nt_require_admin_or_owner();
 if nullif(btrim(p_source_setoran_id),'') is null or nullif(btrim(p_customer_id),'') is null or nullif(btrim(p_customer_name),'') is null then raise exception 'CF_REQUIRED_FIELD'; end if;
 if coalesce(p_gross,0)<=0 then raise exception 'CF_INVALID_GROSS'; end if;
 select * into c from public.bf_customer_fund_cases where idempotency_key=p_idempotency;
 if c.id is not null then return c; end if;
 insert into public.bf_customer_fund_cases(case_no,source_setoran_id,customer_id,customer_name_snapshot,gross_transfer,transfer_date,actual_sender,payment_method,proof_urls,note,created_by,idempotency_key)
 values(public.bf_nt_ref('CFC',nextval('public.bf_cf_case_seq')),btrim(p_source_setoran_id),btrim(p_customer_id),btrim(p_customer_name),p_gross,p_transfer_date,nullif(btrim(p_actual_sender),''),nullif(btrim(p_method),''),coalesce(p_proofs,'[]'::jsonb),p_note,auth.uid(),p_idempotency)
 returning * into c;
 perform public.bf_cf_event(c.id,'CASE_CREATED',null,null,to_jsonb(c),'case',c.id::text);
 return c;
end $$;

create or replace function public.bf_cf_confirm_case(p_case uuid,p_actual_received numeric,p_difference_type text,p_fee_bearer text,p_reason text,p_expected_revision bigint)
returns public.bf_customer_fund_cases language plpgsql security definer set search_path=public as $$
declare c0 public.bf_customer_fund_cases;c public.bf_customer_fund_cases;d numeric;
begin
 perform public.bf_nt_require_owner();
 select * into c0 from public.bf_customer_fund_cases where id=p_case for update;
 if c0.id is null then raise exception 'CF_CASE_NOT_FOUND'; end if;
 if c0.revision<>p_expected_revision then raise exception 'CF_STALE_REVISION'; end if;
 if c0.reconciliation_status='REVERSED' then raise exception 'CF_CASE_REVERSED'; end if;
 if p_actual_received<0 or p_actual_received>c0.gross_transfer then raise exception 'CF_INVALID_ACTUAL_RECEIVED'; end if;
 d:=c0.gross_transfer-p_actual_received;
 if p_difference_type='NONE' and d<>0 then raise exception 'CF_DIFFERENCE_REQUIRES_CLASSIFICATION'; end if;
 if p_difference_type not in ('NONE','BANK_FEE','OTHER') then raise exception 'CF_INVALID_DIFFERENCE_TYPE'; end if;
 if p_difference_type='BANK_FEE' and (d<=0 or p_fee_bearer not in ('CUSTOMER','BF')) then raise exception 'CF_INVALID_BANK_FEE'; end if;
 if p_difference_type='OTHER' and nullif(btrim(p_reason),'') is null then raise exception 'CF_REASON_REQUIRED'; end if;
 update public.bf_customer_fund_cases set actual_received=p_actual_received,difference_amount=d,difference_type=p_difference_type,
   fee_bearer=case when d=0 then 'NONE' else p_fee_bearer end,difference_reason=p_reason,reconciliation_status=case when p_difference_type='OTHER' then 'EXCEPTION' else 'CONFIRMED' end,
   confirmed_by=auth.uid(),confirmed_at=now(),revision=revision+1,updated_by=auth.uid(),updated_at=now()
 where id=p_case returning * into c;
 perform public.bf_cf_event(c.id,'TRANSFER_RECONCILED',p_reason,to_jsonb(c0),to_jsonb(c),'case',c.id::text);
 return c;
end $$;

create or replace function public.bf_cf_propose_sales_ref(p_customer_id text,p_customer_name text,p_external_ref text,p_note_date date,p_amount numeric,p_idempotency text)
returns public.bf_customer_fund_sales_refs language plpgsql security definer set search_path=public as $$
declare r public.bf_customer_fund_sales_refs;
begin
 perform public.bf_nt_require_admin_or_owner();
 if nullif(btrim(p_customer_id),'') is null or nullif(btrim(p_external_ref),'') is null or coalesce(p_amount,0)<=0 then raise exception 'CF_INVALID_SALES_REF'; end if;
 select * into r from public.bf_customer_fund_sales_refs where idempotency_key=p_idempotency;if r.id is not null then return r;end if;
 insert into public.bf_customer_fund_sales_refs(customer_id,customer_name_snapshot,external_ref,note_date,note_amount,proposed_by,idempotency_key)
 values(btrim(p_customer_id),btrim(p_customer_name),btrim(p_external_ref),p_note_date,p_amount,auth.uid(),p_idempotency) returning * into r;return r;
end $$;

create or replace function public.bf_cf_validate_sales_ref(p_ref uuid,p_expected_revision bigint)
returns public.bf_customer_fund_sales_refs language plpgsql security definer set search_path=public as $$
declare r0 public.bf_customer_fund_sales_refs;r public.bf_customer_fund_sales_refs;
begin
 perform public.bf_nt_require_owner();select * into r0 from public.bf_customer_fund_sales_refs where id=p_ref for update;
 if r0.id is null then raise exception 'CF_SALES_REF_NOT_FOUND';end if;if r0.revision<>p_expected_revision then raise exception 'CF_STALE_REVISION';end if;
 update public.bf_customer_fund_sales_refs set status='VALIDATED',validated_by=auth.uid(),validated_at=now(),revision=revision+1 where id=p_ref returning * into r;return r;
end $$;

create or replace function public.bf_cf_propose_allocation(p_case uuid,p_sales_ref uuid,p_amount numeric,p_idempotency text)
returns public.bf_customer_fund_allocations language plpgsql security definer set search_path=public as $$
declare c public.bf_customer_fund_cases;s public.bf_customer_fund_sales_refs;a public.bf_customer_fund_allocations;case_used numeric;note_used numeric;
begin
 perform public.bf_nt_require_admin_or_owner();
 select * into c from public.bf_customer_fund_cases where id=p_case for update;select * into s from public.bf_customer_fund_sales_refs where id=p_sales_ref for update;
 if c.id is null or s.id is null then raise exception 'CF_SOURCE_NOT_FOUND';end if;if c.customer_id<>s.customer_id then raise exception 'CF_CUSTOMER_MISMATCH';end if;if s.status<>'VALIDATED' then raise exception 'CF_SALES_REF_NOT_VALIDATED';end if;
 if c.reconciliation_status not in ('CONFIRMED','EXCEPTION') then raise exception 'CF_TRANSFER_NOT_CONFIRMED';end if;if coalesce(p_amount,0)<=0 then raise exception 'CF_INVALID_ALLOCATION';end if;
 select coalesce(sum(amount),0) into case_used from public.bf_customer_fund_allocations where case_id=p_case and status in ('PROPOSED','CONFIRMED','CORRECTION_REQUIRED');
 select coalesce(sum(amount),0) into note_used from public.bf_customer_fund_allocations where sales_ref_id=p_sales_ref and status in ('PROPOSED','CONFIRMED','CORRECTION_REQUIRED');
 if case_used+p_amount>c.gross_transfer then raise exception 'CF_ALLOCATION_EXCEEDS_TRANSFER';end if;if note_used+p_amount>s.note_amount then raise exception 'CF_ALLOCATION_EXCEEDS_NOTE';end if;
 select * into a from public.bf_customer_fund_allocations where idempotency_key=p_idempotency;if a.id is not null then return a;end if;
 insert into public.bf_customer_fund_allocations(case_id,sales_ref_id,amount,proposed_by,idempotency_key) values(p_case,p_sales_ref,p_amount,auth.uid(),p_idempotency) returning * into a;
 perform public.bf_cf_event(p_case,'ALLOCATION_PROPOSED',null,null,to_jsonb(a),'allocation',a.id::text);return a;
end $$;

create or replace function public.bf_cf_confirm_allocation(p_allocation uuid,p_expected_revision bigint)
returns public.bf_customer_fund_allocations language plpgsql security definer set search_path=public as $$
declare a0 public.bf_customer_fund_allocations;a public.bf_customer_fund_allocations;
begin
 perform public.bf_nt_require_owner();select * into a0 from public.bf_customer_fund_allocations where id=p_allocation for update;
 if a0.id is null then raise exception 'CF_ALLOCATION_NOT_FOUND';end if;if a0.revision<>p_expected_revision then raise exception 'CF_STALE_REVISION';end if;if a0.status<>'PROPOSED' then raise exception 'CF_ALLOCATION_NOT_PROPOSED';end if;
 update public.bf_customer_fund_allocations set status='CONFIRMED',confirmed_by=auth.uid(),confirmed_at=now(),revision=revision+1 where id=p_allocation returning * into a;
 perform public.bf_cf_event(a.case_id,'ALLOCATION_CONFIRMED',null,to_jsonb(a0),to_jsonb(a),'allocation',a.id::text);return a;
end $$;

create or replace function public.bf_cf_propose_classification(p_case uuid,p_type text,p_gross numeric,p_customer_fee numeric,p_agreement text,p_idempotency text)
returns public.bf_customer_fund_classifications language plpgsql security definer set search_path=public as $$
declare c public.bf_customer_fund_cases;f public.bf_customer_fund_case_financials;x public.bf_customer_fund_classifications;fee_committed numeric;
begin
 perform public.bf_nt_require_admin_or_owner();select * into c from public.bf_customer_fund_cases where id=p_case for update;select * into f from public.bf_customer_fund_case_financials where case_id=p_case;
 if c.id is null then raise exception 'CF_CASE_NOT_FOUND';end if;if c.reconciliation_status<>'CONFIRMED' then raise exception 'CF_CASE_NOT_READY_FOR_CLASSIFICATION';end if;
 if p_type not in ('CUSTOMER_COMMISSION','CUSTOMER_DEPOSIT','WRONG_TRANSFER_REFUND') or coalesce(p_gross,0)<=0 then raise exception 'CF_INVALID_CLASSIFICATION';end if;
 if nullif(btrim(p_agreement),'') is null then raise exception 'CF_AGREEMENT_REQUIRED';end if;if p_gross>f.unclassified_excess then raise exception 'CF_CLASSIFICATION_EXCEEDS_EXCESS';end if;
 if coalesce(p_customer_fee,0)>0 and c.fee_bearer<>'CUSTOMER' then raise exception 'CF_FEE_NOT_CUSTOMER_BORNE';end if;
 select coalesce(sum(amount),0) into fee_committed from public.bf_customer_fund_fee_allocations where case_id=p_case and status='POSTED';
 if fee_committed+coalesce(p_customer_fee,0)>c.difference_amount then raise exception 'CF_BANK_FEE_DOUBLE_ALLOCATION';end if;
 select * into x from public.bf_customer_fund_classifications where idempotency_key=p_idempotency;if x.id is not null then return x;end if;
 insert into public.bf_customer_fund_classifications(case_id,classification_type,gross_amount,customer_bank_fee_amount,agreement_note,proposed_by,idempotency_key)
 values(p_case,p_type,p_gross,coalesce(p_customer_fee,0),btrim(p_agreement),auth.uid(),p_idempotency) returning * into x;
 perform public.bf_cf_event(p_case,'CLASSIFICATION_PROPOSED',p_agreement,null,to_jsonb(x),'classification',x.id::text);return x;
end $$;

create or replace function public.bf_cf_decide_classification(p_classification uuid,p_action text,p_note text)
returns public.bf_customer_fund_classifications language plpgsql security definer set search_path=public as $$
declare x0 public.bf_customer_fund_classifications;x public.bf_customer_fund_classifications;c public.bf_customer_fund_cases;f public.bf_customer_fund_case_financials;fee_used numeric;
begin
 perform public.bf_nt_require_owner();select * into x0 from public.bf_customer_fund_classifications where id=p_classification for update;
 if x0.id is null or x0.status<>'PENDING_OWNER' then raise exception 'CF_CLASSIFICATION_NOT_PENDING';end if;if p_action not in ('APPROVE','REJECT') then raise exception 'CF_INVALID_ACTION';end if;
 select * into c from public.bf_customer_fund_cases where id=x0.case_id for update;select * into f from public.bf_customer_fund_case_financials where case_id=x0.case_id;
 if p_action='APPROVE' then
   if x0.gross_amount>f.gross_excess-coalesce((select sum(gross_amount) from public.bf_customer_fund_classifications where case_id=x0.case_id and status in ('APPROVED','CORRECTION_REQUIRED') and id<>x0.id),0) then raise exception 'CF_CLASSIFICATION_EXCEEDS_EXCESS';end if;
   select coalesce(sum(amount),0) into fee_used from public.bf_customer_fund_fee_allocations where case_id=x0.case_id and status='POSTED';if fee_used+x0.customer_bank_fee_amount>c.difference_amount then raise exception 'CF_BANK_FEE_DOUBLE_ALLOCATION';end if;
   if x0.customer_bank_fee_amount>0 then insert into public.bf_customer_fund_fee_allocations(case_id,classification_id,target_type,amount,created_by) values(c.id,x0.id,x0.classification_type,x0.customer_bank_fee_amount,auth.uid());end if;
   if x0.classification_type='CUSTOMER_COMMISSION' then
     insert into public.bf_customer_commission_obligations(commission_no,classification_id,customer_id,customer_name_snapshot,gross_amount,bank_fee_amount,obligation_amount,created_by)
     values(public.bf_nt_ref('KOM',nextval('public.bf_cf_commission_seq')),x0.id,c.customer_id,c.customer_name_snapshot,x0.gross_amount,x0.customer_bank_fee_amount,x0.net_amount,auth.uid());
   elsif x0.classification_type='WRONG_TRANSFER_REFUND' then
     insert into public.bf_customer_refund_obligations(refund_no,classification_id,customer_id,customer_name_snapshot,gross_amount,bank_fee_amount,obligation_amount,created_by)
     values(public.bf_nt_ref('REF',nextval('public.bf_cf_refund_seq')),x0.id,c.customer_id,c.customer_name_snapshot,x0.gross_amount,x0.customer_bank_fee_amount,x0.net_amount,auth.uid());
   elsif x0.classification_type='CUSTOMER_DEPOSIT' then
     insert into public.bf_customer_deposit_ledger(customer_id,customer_name_snapshot,entry_type,amount,classification_id,agreement_note,status,created_by,idempotency_key)
     values(c.customer_id,c.customer_name_snapshot,'CREATED',x0.net_amount,x0.id,x0.agreement_note,'POSTED',auth.uid(),'class:'||x0.id::text);
   end if;
 end if;
 update public.bf_customer_fund_classifications set status=case when p_action='APPROVE' then 'APPROVED' else 'REJECTED' end,decided_by=auth.uid(),decided_at=now(),decision_note=p_note where id=x0.id returning * into x;
 perform public.bf_cf_event(c.id,case when p_action='APPROVE' then 'CLASSIFICATION_APPROVED' else 'CLASSIFICATION_REJECTED' end,p_note,to_jsonb(x0),to_jsonb(x),'classification',x.id::text);return x;
end $$;

-- Backend-only mutation. Authenticated clients read through RLS and mutate only through guarded RPCs.
alter table public.bf_customer_fund_cases enable row level security;
alter table public.bf_customer_fund_sales_refs enable row level security;
alter table public.bf_customer_fund_allocations enable row level security;
alter table public.bf_customer_fund_classifications enable row level security;
alter table public.bf_customer_fund_fee_allocations enable row level security;
alter table public.bf_customer_commission_obligations enable row level security;
alter table public.bf_customer_refund_obligations enable row level security;
alter table public.bf_customer_deposit_ledger enable row level security;
alter table public.bf_customer_fund_payouts enable row level security;
alter table public.bf_customer_fund_payout_allocations enable row level security;
alter table public.bf_customer_fund_liability_transfers enable row level security;
alter table public.bf_customer_fund_events enable row level security;

do $$ declare t text;begin
 foreach t in array array['bf_customer_fund_cases','bf_customer_fund_sales_refs','bf_customer_fund_allocations','bf_customer_fund_classifications','bf_customer_fund_fee_allocations','bf_customer_commission_obligations','bf_customer_refund_obligations','bf_customer_deposit_ledger','bf_customer_fund_payouts','bf_customer_fund_payout_allocations','bf_customer_fund_liability_transfers','bf_customer_fund_events'] loop
   execute format('drop policy if exists cf_read_admin_owner on public.%I',t);
   execute format('create policy cf_read_admin_owner on public.%I for select to authenticated using (public.bf_nt_is_admin_or_owner())',t);
   execute format('revoke insert,update,delete on public.%I from authenticated',t);
   execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
grant select on public.bf_customer_deposit_balances,public.bf_customer_fund_case_financials to authenticated;

revoke execute on function public.bf_cf_event(uuid,text,text,jsonb,jsonb,text,text) from public,anon,authenticated;
revoke execute on function public.bf_cf_record_case(text,text,text,numeric,date,text,text,jsonb,text,text) from public,anon;
revoke execute on function public.bf_cf_confirm_case(uuid,numeric,text,text,text,bigint) from public,anon;
revoke execute on function public.bf_cf_propose_sales_ref(text,text,text,date,numeric,text) from public,anon;
revoke execute on function public.bf_cf_validate_sales_ref(uuid,bigint) from public,anon;
revoke execute on function public.bf_cf_propose_allocation(uuid,uuid,numeric,text) from public,anon;
revoke execute on function public.bf_cf_confirm_allocation(uuid,bigint) from public,anon;
revoke execute on function public.bf_cf_propose_classification(uuid,text,numeric,numeric,text,text) from public,anon;
revoke execute on function public.bf_cf_decide_classification(uuid,text,text) from public,anon;
grant execute on function public.bf_cf_record_case(text,text,text,numeric,date,text,text,jsonb,text,text) to authenticated;
grant execute on function public.bf_cf_confirm_case(uuid,numeric,text,text,text,bigint) to authenticated;
grant execute on function public.bf_cf_propose_sales_ref(text,text,text,date,numeric,text) to authenticated;
grant execute on function public.bf_cf_validate_sales_ref(uuid,bigint) to authenticated;
grant execute on function public.bf_cf_propose_allocation(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.bf_cf_confirm_allocation(uuid,bigint) to authenticated;
grant execute on function public.bf_cf_propose_classification(uuid,text,numeric,numeric,text,text) to authenticated;
grant execute on function public.bf_cf_decide_classification(uuid,text,text) to authenticated;

commit;
