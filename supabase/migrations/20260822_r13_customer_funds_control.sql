-- Bintang Frozen V26 / R13 — Customer Funds Control
-- ADDITIVE ONLY. Designed for non-production validation first.
-- No legacy table/key is dropped or rewritten by this migration.

begin;

create extension if not exists pgcrypto;

create sequence if not exists public.bf_cfc_case_seq;
create sequence if not exists public.bf_cfc_setoran_seq;
create sequence if not exists public.bf_cfc_note_seq;
create sequence if not exists public.bf_cfc_obligation_seq;

create or replace function public.bf_cfc_is_owner()
returns boolean
language sql stable security definer
set search_path=public
as $$
  select exists(
    select 1 from public.bf_profiles
    where id=auth.uid() and active=true and role='owner'
  );
$$;

create or replace function public.bf_cfc_is_admin_or_owner()
returns boolean
language sql stable security definer
set search_path=public
as $$
  select exists(
    select 1 from public.bf_profiles
    where id=auth.uid() and active=true and role in ('owner','admin')
  );
$$;

create or replace function public.bf_cfc_require_admin_or_owner()
returns void
language plpgsql security definer
set search_path=public
as $$
begin
  if not public.bf_cfc_is_admin_or_owner() then
    raise exception 'CFC_PERMISSION_DENIED' using errcode='42501';
  end if;
end;
$$;

create or replace function public.bf_cfc_require_owner()
returns void
language plpgsql security definer
set search_path=public
as $$
begin
  if not public.bf_cfc_is_owner() then
    raise exception 'CFC_OWNER_REQUIRED' using errcode='42501';
  end if;
end;
$$;

create or replace function public.bf_cfc_ref(prefix text, seq_value bigint)
returns text
language sql immutable
as $$
  select upper(prefix)||'-'||to_char(current_date,'YYYY')||'-'||lpad(seq_value::text,6,'0');
$$;

create table if not exists public.bf_customer_setoran (
  id uuid primary key default gen_random_uuid(),
  setoran_no text not null unique,
  customer_id text,
  customer_name_snapshot text not null,
  amount numeric(18,2) not null check(amount>0),
  payment_method text not null,
  destination_account text,
  setoran_date date not null,
  note text,
  proof_urls jsonb not null default '[]'::jsonb check(jsonb_typeof(proof_urls)='array'),
  status text not null default 'POSTED' check(status in ('POSTED','REVERSED','CORRECTED')),
  correction_of uuid references public.bf_customer_setoran(id),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.bf_customer_fund_cases (
  id uuid primary key default gen_random_uuid(),
  case_no text not null unique,
  customer_id text,
  customer_name_snapshot text not null,
  source_setoran_id uuid references public.bf_customer_setoran(id),
  status text not null default 'OPEN' check(status in ('OPEN','CLOSED','CORRECTED','REVERSED')),
  note text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  closed_by uuid,
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists bf_cfc_one_case_per_setoran
  on public.bf_customer_fund_cases(source_setoran_id)
  where source_setoran_id is not null and status <> 'REVERSED';

create table if not exists public.bf_customer_fund_transfers (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.bf_customer_fund_cases(id),
  actual_sender text not null,
  gross_transfer numeric(18,2) not null check(gross_transfer>0),
  fee_mode text not null check(fee_mode in ('0','2500','6500','MANUAL')),
  bank_fee numeric(18,2) not null default 0 check(bank_fee>=0),
  fee_manual_reason text,
  fee_bearer text not null default 'PARTY2' check(fee_bearer in ('PARTY2','BF','THIRD_PARTY','UNKNOWN')),
  net_received numeric(18,2) generated always as (gross_transfer-bank_fee) stored,
  destination_account text,
  transfer_date date not null,
  method_bank text not null,
  proof_urls jsonb not null default '[]'::jsonb check(jsonb_typeof(proof_urls)='array'),
  source_setoran_id uuid references public.bf_customer_setoran(id),
  source_entrusted_note_id uuid,
  reconciliation_status text not null default 'RECORDED' check(reconciliation_status in ('RECORDED','RECONCILED','EXCEPTION','REVERSED')),
  reconciliation_note text,
  idempotency_key text not null unique,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  reconciled_by uuid,
  reconciled_at timestamptz,
  check(
    (fee_mode='0' and bank_fee=0) or
    (fee_mode='2500' and bank_fee=2500) or
    (fee_mode='6500' and bank_fee=6500) or
    (fee_mode='MANUAL' and bank_fee>=0 and nullif(btrim(fee_manual_reason),'') is not null)
  ),
  check(gross_transfer>=bank_fee)
);

create table if not exists public.bf_entrusted_notes (
  id uuid primary key default gen_random_uuid(),
  note_no text not null unique,
  case_id uuid not null references public.bf_customer_fund_cases(id),
  customer_id text,
  customer_name_snapshot text not null,
  third_party_name text not null,
  product_ref text,
  product_name text not null,
  total_qty numeric(18,4) not null check(total_qty>0),
  bf_qty numeric(18,4) not null check(bf_qty>=0),
  entrusted_qty numeric(18,4) not null check(entrusted_qty>=0),
  total_note_value numeric(18,2) not null check(total_note_value>=0),
  bf_right numeric(18,2) not null check(bf_right>=0),
  party2_right numeric(18,2) not null check(party2_right>=0),
  kasir_pintar_ref text,
  note text,
  approval_status text not null default 'PENDING' check(approval_status in ('PENDING','APPROVED','STALE','REJECTED','REVERSED')),
  approval_fingerprint text,
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check(total_qty = bf_qty + entrusted_qty),
  check(total_note_value = bf_right + party2_right)
);

alter table public.bf_customer_fund_transfers
  drop constraint if exists bf_customer_fund_transfers_source_entrusted_note_id_fkey;
alter table public.bf_customer_fund_transfers
  add constraint bf_customer_fund_transfers_source_entrusted_note_id_fkey
  foreign key(source_entrusted_note_id) references public.bf_entrusted_notes(id);

create table if not exists public.bf_customer_fund_obligations (
  id uuid primary key default gen_random_uuid(),
  obligation_no text not null unique,
  case_id uuid not null references public.bf_customer_fund_cases(id),
  customer_id text,
  customer_name_snapshot text not null,
  obligation_type text not null check(obligation_type in ('CASHBACK','DANA_TITIPAN')),
  source_transfer_id uuid references public.bf_customer_fund_transfers(id),
  source_entrusted_note_id uuid references public.bf_entrusted_notes(id),
  gross_basis numeric(18,2) not null check(gross_basis>=0),
  bank_fee_applied numeric(18,2) not null default 0 check(bank_fee_applied>=0),
  amount_due numeric(18,2) not null check(amount_due>0),
  calculation_snapshot jsonb not null default '{}'::jsonb check(jsonb_typeof(calculation_snapshot)='object'),
  status text not null default 'BELUM_DIBAYAR' check(status in ('BELUM_DIBAYAR','DIBAYARKAN','MENUNGGU_VERIFIKASI_OWNER','VERIFIED','REVERSED','CORRECTED')),
  idempotency_key text not null unique,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  locked_at timestamptz not null default now(),
  corrected_from uuid references public.bf_customer_fund_obligations(id),
  check(bank_fee_applied<=gross_basis)
);
create unique index if not exists bf_cfc_unique_cashback_source
  on public.bf_customer_fund_obligations(source_transfer_id)
  where obligation_type='CASHBACK' and source_transfer_id is not null and status not in ('REVERSED','CORRECTED');
create unique index if not exists bf_cfc_unique_entrusted_source
  on public.bf_customer_fund_obligations(source_entrusted_note_id)
  where obligation_type='DANA_TITIPAN' and source_entrusted_note_id is not null and status not in ('REVERSED','CORRECTED');
create unique index if not exists bf_cfc_bank_fee_once
  on public.bf_customer_fund_obligations(source_transfer_id)
  where source_transfer_id is not null and bank_fee_applied>0 and status not in ('REVERSED','CORRECTED');

create table if not exists public.bf_customer_fund_payments (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.bf_customer_fund_obligations(id),
  case_id uuid not null references public.bf_customer_fund_cases(id),
  customer_id text,
  customer_name_snapshot text not null,
  obligation_type text not null check(obligation_type in ('CASHBACK','DANA_TITIPAN')),
  amount numeric(18,2) not null check(amount>0),
  payment_date date not null,
  payment_method text not null,
  source_account text,
  proof_urls jsonb not null default '[]'::jsonb check(jsonb_typeof(proof_urls)='array'),
  note text,
  status text not null default 'MENUNGGU_VERIFIKASI_OWNER' check(status in ('MENUNGGU_VERIFIKASI_OWNER','VERIFIED','REJECTED','CORRECTION_REQUIRED','REVERSED')),
  paid_by uuid not null,
  paid_at timestamptz not null default now(),
  verified_by uuid,
  verified_at timestamptz,
  verification_note text,
  idempotency_key text not null unique
);
create unique index if not exists bf_cfc_one_active_payment_per_obligation
  on public.bf_customer_fund_payments(obligation_id)
  where status in ('MENUNGGU_VERIFIKASI_OWNER','VERIFIED');

create table if not exists public.bf_customer_fund_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.bf_customer_fund_cases(id),
  event_type text not null,
  actor_id uuid not null,
  actor_name text,
  actor_role text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  related_record_id text,
  attachment_refs jsonb not null default '[]'::jsonb check(jsonb_typeof(attachment_refs)='array'),
  created_at timestamptz not null default now()
);
create index if not exists bf_cfc_events_case_time on public.bf_customer_fund_events(case_id,created_at desc);
create index if not exists bf_cfc_cases_customer on public.bf_customer_fund_cases(customer_id,created_at desc);
create index if not exists bf_cfc_transfers_case on public.bf_customer_fund_transfers(case_id,created_at desc);
create index if not exists bf_cfc_obligations_case on public.bf_customer_fund_obligations(case_id,created_at desc);

create or replace function public.bf_cfc_actor_name()
returns text
language sql stable security definer
set search_path=public
as $$ select coalesce((select display_name from public.bf_profiles where id=auth.uid()),(select email from public.bf_profiles where id=auth.uid()),auth.uid()::text); $$;

create or replace function public.bf_cfc_actor_role()
returns text
language sql stable security definer
set search_path=public
as $$ select coalesce((select role from public.bf_profiles where id=auth.uid()),'unknown'); $$;

create or replace function public.bf_cfc_event(p_case uuid,p_type text,p_reason text,p_before jsonb,p_after jsonb,p_related text,p_attachments jsonb default '[]'::jsonb)
returns void
language plpgsql security definer
set search_path=public
as $$
begin
  insert into public.bf_customer_fund_events(case_id,event_type,actor_id,actor_name,actor_role,reason,before_data,after_data,related_record_id,attachment_refs)
  values(p_case,p_type,auth.uid(),public.bf_cfc_actor_name(),public.bf_cfc_actor_role(),p_reason,p_before,p_after,p_related,coalesce(p_attachments,'[]'::jsonb));
end;
$$;

create or replace function public.bf_cfc_note_fingerprint(
  p_customer_id text,p_customer_name text,p_product_ref text,p_product_name text,
  p_total_qty numeric,p_bf_qty numeric,p_entrusted_qty numeric,
  p_total_value numeric,p_bf_right numeric,p_party2_right numeric
) returns text
language sql immutable
as $$
  select encode(digest(concat_ws('|',coalesce(p_customer_id,''),coalesce(p_customer_name,''),coalesce(p_product_ref,''),coalesce(p_product_name,''),
    p_total_qty::text,p_bf_qty::text,p_entrusted_qty::text,p_total_value::text,p_bf_right::text,p_party2_right::text),'sha256'),'hex');
$$;

create or replace function public.bf_cfc_note_stale_guard()
returns trigger
language plpgsql security definer
set search_path=public
as $$
declare newfp text;
begin
  new.updated_at=now();
  newfp=public.bf_cfc_note_fingerprint(new.customer_id,new.customer_name_snapshot,new.product_ref,new.product_name,new.total_qty,new.bf_qty,new.entrusted_qty,new.total_note_value,new.bf_right,new.party2_right);
  if old.approval_status='APPROVED' and old.approval_fingerprint is distinct from newfp then
    new.approval_status='STALE'; new.approved_by=null; new.approved_at=null; new.approval_fingerprint=null;
  end if;
  return new;
end;
$$;
drop trigger if exists bf_cfc_note_stale_guard on public.bf_entrusted_notes;
create trigger bf_cfc_note_stale_guard before update on public.bf_entrusted_notes
for each row execute function public.bf_cfc_note_stale_guard();

create or replace function public.bf_cfc_create_case(p_customer_id text,p_customer_name text,p_note text default null,p_source_setoran uuid default null)
returns public.bf_customer_fund_cases
language plpgsql security definer
set search_path=public
as $$
declare r public.bf_customer_fund_cases;
begin
  perform public.bf_cfc_require_admin_or_owner();
  if nullif(btrim(p_customer_name),'') is null then raise exception 'CFC_CUSTOMER_REQUIRED'; end if;
  insert into public.bf_customer_fund_cases(case_no,customer_id,customer_name_snapshot,source_setoran_id,note,created_by)
  values(public.bf_cfc_ref('CFC',nextval('public.bf_cfc_case_seq')),nullif(btrim(p_customer_id),''),btrim(p_customer_name),p_source_setoran,p_note,auth.uid()) returning * into r;
  perform public.bf_cfc_event(r.id,'CASE_CREATED',p_note,null,to_jsonb(r),r.id::text);
  return r;
end;
$$;

create or replace function public.bf_cfc_create_setoran(p_customer_id text,p_customer_name text,p_amount numeric,p_method text,p_account text,p_date date,p_note text,p_proof_urls jsonb default '[]'::jsonb,p_create_case boolean default true)
returns jsonb
language plpgsql security definer
set search_path=public
as $$
declare s public.bf_customer_setoran; c public.bf_customer_fund_cases;
begin
  perform public.bf_cfc_require_admin_or_owner();
  if nullif(btrim(p_customer_name),'') is null or p_amount is null or p_amount<=0 then raise exception 'CFC_INVALID_SETORAN'; end if;
  insert into public.bf_customer_setoran(setoran_no,customer_id,customer_name_snapshot,amount,payment_method,destination_account,setoran_date,note,proof_urls,created_by)
  values(public.bf_cfc_ref('SET',nextval('public.bf_cfc_setoran_seq')),nullif(btrim(p_customer_id),''),btrim(p_customer_name),p_amount,btrim(p_method),nullif(btrim(p_account),''),p_date,p_note,coalesce(p_proof_urls,'[]'::jsonb),auth.uid()) returning * into s;
  if p_create_case then c:=public.bf_cfc_create_case(s.customer_id,s.customer_name_snapshot,'Sumber: '||s.setoran_no,s.id); end if;
  return jsonb_build_object('setoran',to_jsonb(s),'case',case when c.id is null then null else to_jsonb(c) end);
end;
$$;

create or replace function public.bf_cfc_record_transfer(p_case uuid,p_actual_sender text,p_gross numeric,p_fee_mode text,p_bank_fee numeric,p_fee_reason text,p_fee_bearer text,p_account text,p_date date,p_method_bank text,p_proofs jsonb,p_source_setoran uuid,p_source_note uuid,p_idempotency text)
returns public.bf_customer_fund_transfers
language plpgsql security definer
set search_path=public
as $$
declare r public.bf_customer_fund_transfers;
begin
  perform public.bf_cfc_require_admin_or_owner();
  if not exists(select 1 from public.bf_customer_fund_cases where id=p_case and status='OPEN') then raise exception 'CFC_CASE_NOT_OPEN'; end if;
  if nullif(btrim(p_actual_sender),'') is null or nullif(btrim(p_idempotency),'') is null then raise exception 'CFC_TRANSFER_REQUIRED_FIELD'; end if;
  insert into public.bf_customer_fund_transfers(case_id,actual_sender,gross_transfer,fee_mode,bank_fee,fee_manual_reason,fee_bearer,destination_account,transfer_date,method_bank,proof_urls,source_setoran_id,source_entrusted_note_id,idempotency_key,created_by)
  values(p_case,btrim(p_actual_sender),p_gross,p_fee_mode,p_bank_fee,p_fee_reason,p_fee_bearer,p_account,p_date,p_method_bank,coalesce(p_proofs,'[]'::jsonb),p_source_setoran,p_source_note,p_idempotency,auth.uid()) returning * into r;
  perform public.bf_cfc_event(p_case,'TRANSFER_RECORDED',null,null,to_jsonb(r),r.id::text,r.proof_urls);
  return r;
end;
$$;

create or replace function public.bf_cfc_reconcile_transfer(p_transfer uuid,p_status text,p_note text default null)
returns public.bf_customer_fund_transfers
language plpgsql security definer
set search_path=public
as $$
declare oldr public.bf_customer_fund_transfers; r public.bf_customer_fund_transfers;
begin
  perform public.bf_cfc_require_admin_or_owner();
  select * into oldr from public.bf_customer_fund_transfers where id=p_transfer for update;
  if oldr.id is null then raise exception 'CFC_TRANSFER_NOT_FOUND'; end if;
  if p_status not in ('RECONCILED','EXCEPTION') then raise exception 'CFC_INVALID_RECON_STATUS'; end if;
  update public.bf_customer_fund_transfers set reconciliation_status=p_status,reconciliation_note=p_note,reconciled_by=auth.uid(),reconciled_at=now() where id=p_transfer returning * into r;
  perform public.bf_cfc_event(r.case_id,'TRANSFER_RECONCILED',p_note,to_jsonb(oldr),to_jsonb(r),r.id::text);
  return r;
end;
$$;

create or replace function public.bf_cfc_create_entrusted_note(p_case uuid,p_third_party text,p_product_ref text,p_product_name text,p_total_qty numeric,p_bf_qty numeric,p_entrusted_qty numeric,p_total_value numeric,p_bf_right numeric,p_party2_right numeric,p_kasir_ref text,p_note text)
returns public.bf_entrusted_notes
language plpgsql security definer
set search_path=public
as $$
declare c public.bf_customer_fund_cases; r public.bf_entrusted_notes;
begin
  perform public.bf_cfc_require_admin_or_owner();
  select * into c from public.bf_customer_fund_cases where id=p_case and status='OPEN';
  if c.id is null then raise exception 'CFC_CASE_NOT_OPEN'; end if;
  insert into public.bf_entrusted_notes(note_no,case_id,customer_id,customer_name_snapshot,third_party_name,product_ref,product_name,total_qty,bf_qty,entrusted_qty,total_note_value,bf_right,party2_right,kasir_pintar_ref,note,created_by)
  values(public.bf_cfc_ref('NT',nextval('public.bf_cfc_note_seq')),p_case,c.customer_id,c.customer_name_snapshot,btrim(p_third_party),p_product_ref,btrim(p_product_name),p_total_qty,p_bf_qty,p_entrusted_qty,p_total_value,p_bf_right,p_party2_right,p_kasir_ref,p_note,auth.uid()) returning * into r;
  perform public.bf_cfc_event(p_case,'ENTRUSTED_NOTE_CREATED',p_note,null,to_jsonb(r),r.id::text);
  return r;
end;
$$;

create or replace function public.bf_cfc_approve_entrusted_note(p_note uuid,p_approve boolean,p_reason text default null)
returns public.bf_entrusted_notes
language plpgsql security definer
set search_path=public
as $$
declare oldr public.bf_entrusted_notes; r public.bf_entrusted_notes; fp text;
begin
  perform public.bf_cfc_require_owner();
  select * into oldr from public.bf_entrusted_notes where id=p_note for update;
  if oldr.id is null then raise exception 'CFC_NOTE_NOT_FOUND'; end if;
  fp:=public.bf_cfc_note_fingerprint(oldr.customer_id,oldr.customer_name_snapshot,oldr.product_ref,oldr.product_name,oldr.total_qty,oldr.bf_qty,oldr.entrusted_qty,oldr.total_note_value,oldr.bf_right,oldr.party2_right);
  update public.bf_entrusted_notes set approval_status=case when p_approve then 'APPROVED' else 'REJECTED' end,approval_fingerprint=case when p_approve then fp else null end,approved_by=auth.uid(),approved_at=now() where id=p_note returning * into r;
  perform public.bf_cfc_event(r.case_id,case when p_approve then 'ENTRUSTED_NOTE_APPROVED' else 'ENTRUSTED_NOTE_REJECTED' end,p_reason,to_jsonb(oldr),to_jsonb(r),r.id::text);
  return r;
end;
$$;

create or replace function public.bf_cfc_create_cashback(p_transfer uuid,p_allocated_payment numeric,p_entrusted_component numeric,p_other_related numeric,p_reason text,p_idempotency text)
returns public.bf_customer_fund_obligations
language plpgsql security definer
set search_path=public
as $$
declare t public.bf_customer_fund_transfers; c public.bf_customer_fund_cases; available numeric; due numeric; fee numeric; r public.bf_customer_fund_obligations;
begin
  perform public.bf_cfc_require_admin_or_owner();
  select * into t from public.bf_customer_fund_transfers where id=p_transfer and reconciliation_status='RECONCILED' for update;
  if t.id is null then raise exception 'CFC_TRANSFER_NOT_RECONCILED'; end if;
  select * into c from public.bf_customer_fund_cases where id=t.case_id;
  fee:=case when t.fee_bearer='BF' then 0 else t.bank_fee end;
  available:=t.gross_transfer-fee;
  due:=available-coalesce(p_allocated_payment,0)-coalesce(p_entrusted_component,0)-coalesce(p_other_related,0);
  if due<=0 then raise exception 'CFC_NO_CASHBACK_DUE'; end if;
  insert into public.bf_customer_fund_obligations(obligation_no,case_id,customer_id,customer_name_snapshot,obligation_type,source_transfer_id,gross_basis,bank_fee_applied,amount_due,calculation_snapshot,idempotency_key,created_by)
  values(public.bf_cfc_ref('CB',nextval('public.bf_cfc_obligation_seq')),c.id,c.customer_id,c.customer_name_snapshot,'CASHBACK',t.id,t.gross_transfer,fee,due,
    jsonb_build_object('gross_transfer',t.gross_transfer,'bank_fee',t.bank_fee,'fee_bearer',t.fee_bearer,'fee_applied',fee,'available_after_fee',available,'allocated_payment',coalesce(p_allocated_payment,0),'entrusted_component',coalesce(p_entrusted_component,0),'other_related',coalesce(p_other_related,0),'reason',p_reason),p_idempotency,auth.uid()) returning * into r;
  perform public.bf_cfc_event(c.id,'CASHBACK_CREATED',p_reason,null,to_jsonb(r),r.id::text);
  return r;
end;
$$;

create or replace function public.bf_cfc_create_entrusted_fund(p_note uuid,p_transfer uuid,p_idempotency text)
returns public.bf_customer_fund_obligations
language plpgsql security definer
set search_path=public
as $$
declare n public.bf_entrusted_notes; t public.bf_customer_fund_transfers; fee numeric:=0; due numeric; r public.bf_customer_fund_obligations;
begin
  perform public.bf_cfc_require_admin_or_owner();
  select * into n from public.bf_entrusted_notes where id=p_note and approval_status='APPROVED' for update;
  if n.id is null then raise exception 'CFC_NOTE_NOT_APPROVED'; end if;
  if p_transfer is not null then
    select * into t from public.bf_customer_fund_transfers where id=p_transfer and case_id=n.case_id and reconciliation_status='RECONCILED';
    if t.id is null then raise exception 'CFC_TRANSFER_NOT_RECONCILED'; end if;
    if t.fee_bearer='PARTY2' then fee:=t.bank_fee; end if;
  end if;
  due:=n.party2_right-fee;
  if due<=0 then raise exception 'CFC_INVALID_ENTRUSTED_FUND'; end if;
  insert into public.bf_customer_fund_obligations(obligation_no,case_id,customer_id,customer_name_snapshot,obligation_type,source_transfer_id,source_entrusted_note_id,gross_basis,bank_fee_applied,amount_due,calculation_snapshot,idempotency_key,created_by)
  values(public.bf_cfc_ref('DT',nextval('public.bf_cfc_obligation_seq')),n.case_id,n.customer_id,n.customer_name_snapshot,'DANA_TITIPAN',t.id,n.id,n.party2_right,fee,due,
    jsonb_build_object('party2_right_gross',n.party2_right,'bank_fee_applied',fee,'fee_bearer',coalesce(t.fee_bearer,'NONE'),'net_entrusted_fund',due),p_idempotency,auth.uid()) returning * into r;
  perform public.bf_cfc_event(n.case_id,'ENTRUSTED_FUND_CREATED',null,null,to_jsonb(r),r.id::text);
  return r;
end;
$$;

create or replace function public.bf_cfc_mark_paid(p_obligation uuid,p_date date,p_method text,p_source_account text,p_proofs jsonb,p_note text,p_idempotency text)
returns public.bf_customer_fund_payments
language plpgsql security definer
set search_path=public
as $$
declare o public.bf_customer_fund_obligations; r public.bf_customer_fund_payments;
begin
  perform public.bf_cfc_require_admin_or_owner();
  select * into o from public.bf_customer_fund_obligations where id=p_obligation for update;
  if o.id is null or o.status<>'BELUM_DIBAYAR' then raise exception 'CFC_OBLIGATION_NOT_PAYABLE'; end if;
  insert into public.bf_customer_fund_payments(obligation_id,case_id,customer_id,customer_name_snapshot,obligation_type,amount,payment_date,payment_method,source_account,proof_urls,note,paid_by,idempotency_key)
  values(o.id,o.case_id,o.customer_id,o.customer_name_snapshot,o.obligation_type,o.amount_due,p_date,p_method,p_source_account,coalesce(p_proofs,'[]'::jsonb),p_note,auth.uid(),p_idempotency) returning * into r;
  update public.bf_customer_fund_obligations set status='MENUNGGU_VERIFIKASI_OWNER' where id=o.id;
  perform public.bf_cfc_event(o.case_id,'MARKED_PAID',p_note,to_jsonb(o),to_jsonb(r),r.id::text,r.proof_urls);
  return r;
end;
$$;

create or replace function public.bf_cfc_verify_payment(p_payment uuid,p_action text,p_reason text default null)
returns public.bf_customer_fund_payments
language plpgsql security definer
set search_path=public
as $$
declare oldr public.bf_customer_fund_payments; r public.bf_customer_fund_payments; next_status text;
begin
  perform public.bf_cfc_require_owner();
  select * into oldr from public.bf_customer_fund_payments where id=p_payment for update;
  if oldr.id is null or oldr.status<>'MENUNGGU_VERIFIKASI_OWNER' then raise exception 'CFC_PAYMENT_NOT_PENDING'; end if;
  if oldr.paid_by=auth.uid() then raise exception 'CFC_SELF_VERIFY_DENIED' using errcode='42501'; end if;
  if p_action='VERIFY' then next_status:='VERIFIED';
  elsif p_action='REJECT' then next_status:='REJECTED';
  elsif p_action='CORRECTION_REQUIRED' then next_status:='CORRECTION_REQUIRED';
  else raise exception 'CFC_INVALID_VERIFY_ACTION'; end if;
  update public.bf_customer_fund_payments set status=next_status,verified_by=auth.uid(),verified_at=now(),verification_note=p_reason where id=p_payment returning * into r;
  if next_status='VERIFIED' then update public.bf_customer_fund_obligations set status='VERIFIED' where id=r.obligation_id;
  else update public.bf_customer_fund_obligations set status='BELUM_DIBAYAR' where id=r.obligation_id; end if;
  perform public.bf_cfc_event(r.case_id,case when next_status='VERIFIED' then 'OWNER_VERIFIED' else 'OWNER_VERIFICATION_REJECTED' end,p_reason,to_jsonb(oldr),to_jsonb(r),r.id::text);
  return r;
end;
$$;

create or replace function public.bf_cfc_reverse_obligation(p_obligation uuid,p_reason text)
returns public.bf_customer_fund_obligations
language plpgsql security definer
set search_path=public
as $$
declare oldr public.bf_customer_fund_obligations; r public.bf_customer_fund_obligations;
begin
  perform public.bf_cfc_require_owner();
  if nullif(btrim(p_reason),'') is null then raise exception 'CFC_REASON_REQUIRED'; end if;
  select * into oldr from public.bf_customer_fund_obligations where id=p_obligation for update;
  if oldr.id is null or oldr.status='VERIFIED' then raise exception 'CFC_VERIFIED_REQUIRES_PAYMENT_REVERSAL'; end if;
  update public.bf_customer_fund_obligations set status='REVERSED' where id=p_obligation returning * into r;
  perform public.bf_cfc_event(r.case_id,'REVERSAL_CREATED',p_reason,to_jsonb(oldr),to_jsonb(r),r.id::text);
  return r;
end;
$$;

-- RLS: direct writes are intentionally denied. All mutations go through guarded RPCs above.
alter table public.bf_customer_setoran enable row level security;
alter table public.bf_customer_fund_cases enable row level security;
alter table public.bf_customer_fund_transfers enable row level security;
alter table public.bf_entrusted_notes enable row level security;
alter table public.bf_customer_fund_obligations enable row level security;
alter table public.bf_customer_fund_payments enable row level security;
alter table public.bf_customer_fund_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['bf_customer_setoran','bf_customer_fund_cases','bf_customer_fund_transfers','bf_entrusted_notes','bf_customer_fund_obligations','bf_customer_fund_payments','bf_customer_fund_events'] loop
    execute format('drop policy if exists %I on public.%I','cfc_read_admin_owner',t);
    execute format('create policy %I on public.%I for select to authenticated using (public.bf_cfc_is_admin_or_owner())','cfc_read_admin_owner',t);
    execute format('revoke insert,update,delete on public.%I from authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;

grant execute on function public.bf_cfc_create_case(text,text,text,uuid) to authenticated;
grant execute on function public.bf_cfc_create_setoran(text,text,numeric,text,text,date,text,jsonb,boolean) to authenticated;
grant execute on function public.bf_cfc_record_transfer(uuid,text,numeric,text,numeric,text,text,text,date,text,jsonb,uuid,uuid,text) to authenticated;
grant execute on function public.bf_cfc_reconcile_transfer(uuid,text,text) to authenticated;
grant execute on function public.bf_cfc_create_entrusted_note(uuid,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text) to authenticated;
grant execute on function public.bf_cfc_approve_entrusted_note(uuid,boolean,text) to authenticated;
grant execute on function public.bf_cfc_create_cashback(uuid,numeric,numeric,numeric,text,text) to authenticated;
grant execute on function public.bf_cfc_create_entrusted_fund(uuid,uuid,text) to authenticated;
grant execute on function public.bf_cfc_mark_paid(uuid,date,text,text,jsonb,text,text) to authenticated;
grant execute on function public.bf_cfc_verify_payment(uuid,text,text) to authenticated;
grant execute on function public.bf_cfc_reverse_obligation(uuid,text) to authenticated;

comment on table public.bf_customer_setoran is 'Canonical R13 Setoran writer. Legacy bf_note_setoran_v26 remains read-only compatibility data.';
comment on table public.bf_customer_fund_cases is 'Parent identity for Customer Funds Control; not a POS sale.';
comment on table public.bf_entrusted_notes is 'Operational entrusted note only; must never create canonical R13 sales.';

commit;
