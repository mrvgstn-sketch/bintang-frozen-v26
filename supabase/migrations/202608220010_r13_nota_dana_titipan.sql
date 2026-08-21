-- Bintang Frozen V26 / R13 — Nota & Dana Titipan
-- ADDITIVE ONLY. DO NOT apply to production automatically.
-- Kasir Pintar remains the canonical sales/POS writer. This module never writes sales, inventory, Barang Keluar or Tally.

begin;
create extension if not exists pgcrypto;

create sequence if not exists public.bf_nt_note_seq;
create sequence if not exists public.bf_nt_payout_seq;
create sequence if not exists public.bf_nt_correction_seq;

create or replace function public.bf_nt_is_owner()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.bf_profiles where id=auth.uid() and active=true and lower(role)='owner');
$$;
create or replace function public.bf_nt_is_admin_or_owner()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.bf_profiles where id=auth.uid() and active=true and lower(role) in ('owner','admin'));
$$;
create or replace function public.bf_nt_require_owner()
returns void language plpgsql security definer set search_path=public as $$ begin
  if not public.bf_nt_is_owner() then raise exception 'NT_OWNER_REQUIRED' using errcode='42501'; end if;
end $$;
create or replace function public.bf_nt_require_admin_or_owner()
returns void language plpgsql security definer set search_path=public as $$ begin
  if not public.bf_nt_is_admin_or_owner() then raise exception 'NT_PERMISSION_DENIED' using errcode='42501'; end if;
end $$;
create or replace function public.bf_nt_ref(p_prefix text,p_seq bigint)
returns text language sql stable as $$ select upper(p_prefix)||'-'||to_char(current_date,'YYYY')||'-'||lpad(p_seq::text,6,'0') $$;

create table if not exists public.bf_entrusted_notes(
  id uuid primary key default gen_random_uuid(),
  note_no text not null unique,
  customer_id text,
  customer_name_snapshot text not null,
  buyer_name text not null,
  fee_per_kg numeric(18,2) not null default 0 check(fee_per_kg>=0),
  fee_agreement_note text,
  pos_refs jsonb not null default '[]'::jsonb check(jsonb_typeof(pos_refs)='array'),
  status text not null default 'DRAFT' check(status in ('DRAFT','PENDING_APPROVAL','APPROVED','PAYMENT_IN_PROGRESS','PAID','CORRECTION_REQUIRED','REVERSED')),
  approval_status text not null default 'PENDING' check(approval_status in ('PENDING','APPROVED','REJECTED','STALE')),
  approval_fingerprint text,
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  idempotency_key text not null unique
);

create table if not exists public.bf_entrusted_note_items(
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.bf_entrusted_notes(id) on delete restrict,
  line_no integer not null check(line_no>0),
  product_ref text,
  product_name text not null,
  total_qty numeric(18,4) not null check(total_qty>0),
  bf_qty numeric(18,4) not null check(bf_qty>=0),
  entrusted_qty numeric(18,4) not null check(entrusted_qty>=0),
  note_unit_price numeric(18,2) not null check(note_unit_price>=0),
  bf_sales_value numeric(18,2) not null default 0 check(bf_sales_value>=0),
  created_at timestamptz not null default now(),
  unique(note_id,line_no),
  check(total_qty=bf_qty+entrusted_qty),
  check((bf_qty>0) or bf_sales_value=0)
);

create table if not exists public.bf_entrusted_transfers(
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.bf_entrusted_notes(id) on delete restrict,
  gross_transfer numeric(18,2) not null check(gross_transfer>0),
  transfer_date date not null,
  actual_sender text not null,
  proof_urls jsonb not null default '[]'::jsonb check(jsonb_typeof(proof_urls)='array'),
  note text,
  status text not null default 'RECORDED' check(status in ('RECORDED','CONFIRMED','EXCEPTION','REVERSED')),
  actual_received numeric(18,2) check(actual_received>=0),
  difference_amount numeric(18,2) not null default 0 check(difference_amount>=0),
  difference_type text not null default 'NONE' check(difference_type in ('NONE','BANK_FEE','OTHER')),
  difference_reason text,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  idempotency_key text not null unique,
  check(actual_received is null or actual_received<=gross_transfer)
);

create table if not exists public.bf_entrusted_corrections(
  id uuid primary key default gen_random_uuid(),
  correction_no text not null unique,
  note_id uuid not null references public.bf_entrusted_notes(id) on delete restrict,
  reason text not null,
  proposed_snapshot jsonb not null check(jsonb_typeof(proposed_snapshot)='object'),
  old_note_total numeric(18,2) not null,
  new_note_total numeric(18,2) not null check(new_note_total>=0),
  old_bf_right numeric(18,2) not null,
  new_bf_right numeric(18,2) not null check(new_bf_right>=0),
  delta_note_total numeric(18,2) not null,
  delta_bf_right numeric(18,2) not null,
  status text not null default 'PENDING_OWNER' check(status in ('PENDING_OWNER','APPROVED','REJECTED','REVERSED')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text
);
create unique index if not exists bf_nt_one_pending_correction on public.bf_entrusted_corrections(note_id) where status='PENDING_OWNER';

create table if not exists public.bf_entrusted_payouts(
  id uuid primary key default gen_random_uuid(),
  payout_no text not null unique,
  note_id uuid not null references public.bf_entrusted_notes(id) on delete restrict,
  amount numeric(18,2) not null check(amount>0),
  payment_date date not null,
  recipient_name text not null,
  agreement_note text not null,
  signature_data text not null,
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

create table if not exists public.bf_cash_movements(
  id uuid primary key default gen_random_uuid(),
  movement_date date not null,
  direction text not null check(direction in ('IN','OUT')),
  movement_type text not null check(movement_type in ('DANA_TITIPAN','PENGELUARAN','OWNER_WITHDRAWAL','OWNER_TOPUP','OTHER')),
  amount numeric(18,2) not null check(amount>0),
  source_ref_type text,
  source_ref_id text,
  description text,
  status text not null default 'POSTED' check(status in ('POSTED','REVERSED')),
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create unique index if not exists bf_cash_one_active_source on public.bf_cash_movements(source_ref_type,source_ref_id) where source_ref_id is not null and status='POSTED';

create table if not exists public.bf_cash_reconciliations(
  id uuid primary key default gen_random_uuid(),
  reconciliation_date date not null unique,
  pos_cash_sales numeric(18,2) not null check(pos_cash_sales>=0),
  opening_cash numeric(18,2) not null default 0 check(opening_cash>=0),
  owner_topup numeric(18,2) not null default 0 check(owner_topup>=0),
  owner_withdrawal numeric(18,2) not null default 0 check(owner_withdrawal>=0),
  expense_total_snapshot numeric(18,2) not null default 0 check(expense_total_snapshot>=0),
  entrusted_payout_total numeric(18,2) not null default 0 check(entrusted_payout_total>=0),
  other_cash_in numeric(18,2) not null default 0 check(other_cash_in>=0),
  other_cash_out numeric(18,2) not null default 0 check(other_cash_out>=0),
  expected_cash numeric(18,2) not null,
  physical_cash numeric(18,2) not null check(physical_cash>=0),
  difference numeric(18,2) not null,
  note text,
  status text not null default 'VERIFIED' check(status in ('VERIFIED','CORRECTION_REQUIRED','REVERSED')),
  verified_by uuid not null,
  verified_at timestamptz not null default now()
);

create table if not exists public.bf_entrusted_events(
  id bigint generated always as identity primary key,
  note_id uuid references public.bf_entrusted_notes(id) on delete restrict,
  event_type text not null,
  actor_id uuid not null,
  actor_role text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  related_record_id text,
  created_at timestamptz not null default now()
);
create index if not exists bf_nt_events_note_time on public.bf_entrusted_events(note_id,created_at desc);
create index if not exists bf_nt_notes_customer on public.bf_entrusted_notes(customer_id,created_at desc);
create index if not exists bf_nt_transfers_note on public.bf_entrusted_transfers(note_id,recorded_at desc);
create index if not exists bf_nt_payouts_note on public.bf_entrusted_payouts(note_id,paid_at desc);

create or replace function public.bf_nt_event(p_note uuid,p_type text,p_reason text,p_before jsonb,p_after jsonb,p_related text)
returns void language plpgsql security definer set search_path=public as $$ begin
  insert into public.bf_entrusted_events(note_id,event_type,actor_id,actor_role,reason,before_data,after_data,related_record_id)
  values(p_note,p_type,auth.uid(),coalesce((select role from public.bf_profiles where id=auth.uid()),'unknown'),p_reason,p_before,p_after,p_related);
end $$;

create or replace view public.bf_entrusted_note_base_financials as
select n.id note_id,
  coalesce(sum(i.total_qty),0)::numeric(18,4) total_qty,
  coalesce(sum(i.bf_qty),0)::numeric(18,4) bf_qty,
  coalesce(sum(i.entrusted_qty),0)::numeric(18,4) entrusted_qty,
  coalesce(sum(i.total_qty*i.note_unit_price),0)::numeric(18,2) base_note_total,
  coalesce(sum(i.bf_sales_value),0)::numeric(18,2) bf_sales_value,
  (coalesce(sum(i.entrusted_qty),0)*n.fee_per_kg)::numeric(18,2) bf_fee,
  (coalesce(sum(i.bf_sales_value),0)+(coalesce(sum(i.entrusted_qty),0)*n.fee_per_kg))::numeric(18,2) base_bf_right
from public.bf_entrusted_notes n
left join public.bf_entrusted_note_items i on i.note_id=n.id
group by n.id,n.fee_per_kg;

create or replace view public.bf_entrusted_note_financials as
with corr as (
 select note_id,coalesce(sum(delta_note_total),0)::numeric(18,2) d_note,coalesce(sum(delta_bf_right),0)::numeric(18,2) d_bf
 from public.bf_entrusted_corrections where status='APPROVED' group by note_id
), tr as (
 select note_id,
  coalesce(sum(gross_transfer) filter(where status='CONFIRMED'),0)::numeric(18,2) gross_confirmed,
  coalesce(sum(actual_received) filter(where status='CONFIRMED'),0)::numeric(18,2) actual_confirmed,
  coalesce(sum(difference_amount) filter(where status='CONFIRMED' and difference_type='BANK_FEE'),0)::numeric(18,2) bank_fee_total
 from public.bf_entrusted_transfers group by note_id
), pay as (
 select note_id,
  coalesce(sum(amount) filter(where status in ('PENDING_OWNER','VERIFIED','CORRECTION_REQUIRED')),0)::numeric(18,2) payout_committed,
  coalesce(sum(amount) filter(where status='VERIFIED'),0)::numeric(18,2) payout_verified
 from public.bf_entrusted_payouts group by note_id
)
select n.id note_id,n.note_no,n.customer_id,n.customer_name_snapshot,n.buyer_name,n.status,n.approval_status,n.fee_per_kg,
 b.total_qty,b.bf_qty,b.entrusted_qty,b.bf_sales_value,b.bf_fee,
 (b.base_note_total+coalesce(c.d_note,0))::numeric(18,2) effective_note_total,
 (b.base_bf_right+coalesce(c.d_bf,0))::numeric(18,2) effective_bf_right,
 coalesce(t.gross_confirmed,0)::numeric(18,2) gross_confirmed,
 coalesce(t.actual_confirmed,0)::numeric(18,2) actual_confirmed,
 coalesce(t.bank_fee_total,0)::numeric(18,2) bank_fee_total,
 greatest((b.base_note_total+coalesce(c.d_note,0))-coalesce(t.gross_confirmed,0),0)::numeric(18,2) note_outstanding,
 greatest((b.base_bf_right+coalesce(c.d_bf,0))-coalesce(t.actual_confirmed,0),0)::numeric(18,2) bf_shortfall,
 greatest(coalesce(t.actual_confirmed,0)-(b.base_bf_right+coalesce(c.d_bf,0)),0)::numeric(18,2) entrusted_fund_total,
 coalesce(pay.payout_committed,0)::numeric(18,2) payout_committed,
 coalesce(pay.payout_verified,0)::numeric(18,2) payout_verified,
 greatest(greatest(coalesce(t.actual_confirmed,0)-(b.base_bf_right+coalesce(c.d_bf,0)),0)-coalesce(pay.payout_committed,0),0)::numeric(18,2) payout_outstanding,
 greatest(coalesce(t.gross_confirmed,0)-(b.base_note_total+coalesce(c.d_note,0)),0)::numeric(18,2) overpayment,
 (coalesce(t.gross_confirmed,0)>=(b.base_note_total+coalesce(c.d_note,0))) as is_paid
from public.bf_entrusted_notes n
join public.bf_entrusted_note_base_financials b on b.note_id=n.id
left join corr c on c.note_id=n.id
left join tr t on t.note_id=n.id
left join pay on pay.note_id=n.id;

create or replace function public.bf_nt_validate_note(p_note uuid)
returns void language plpgsql security definer set search_path=public as $$
declare f public.bf_entrusted_note_base_financials; n public.bf_entrusted_notes;
begin
 select * into n from public.bf_entrusted_notes where id=p_note;
 select * into f from public.bf_entrusted_note_base_financials where note_id=p_note;
 if n.id is null then raise exception 'NT_NOT_FOUND'; end if;
 if f.total_qty<=0 or f.entrusted_qty<=0 then raise exception 'NT_ENTRUSTED_QTY_REQUIRED'; end if;
 if f.bf_qty=0 and n.fee_per_kg<=0 then raise exception 'NT_PURE_ENTRUSTED_FEE_REQUIRED'; end if;
 if f.base_note_total<f.base_bf_right then raise exception 'NT_NOTE_BELOW_BF_RIGHT'; end if;
end $$;

create or replace function public.bf_nt_create_note(p_customer_id text,p_customer_name text,p_buyer_name text,p_fee_per_kg numeric,p_fee_note text,p_pos_refs jsonb,p_items jsonb,p_idempotency text)
returns public.bf_entrusted_notes language plpgsql security definer set search_path=public as $$
declare n public.bf_entrusted_notes; x jsonb; ln int:=0;
begin
 perform public.bf_nt_require_admin_or_owner();
 if nullif(btrim(p_customer_name),'') is null or nullif(btrim(p_buyer_name),'') is null or nullif(btrim(p_idempotency),'') is null then raise exception 'NT_REQUIRED_FIELD'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'NT_ITEMS_REQUIRED'; end if;
 insert into public.bf_entrusted_notes(note_no,customer_id,customer_name_snapshot,buyer_name,fee_per_kg,fee_agreement_note,pos_refs,created_by,idempotency_key)
 values(public.bf_nt_ref('NT',nextval('public.bf_nt_note_seq')),nullif(btrim(p_customer_id),''),btrim(p_customer_name),btrim(p_buyer_name),coalesce(p_fee_per_kg,0),p_fee_note,coalesce(p_pos_refs,'[]'::jsonb),auth.uid(),p_idempotency) returning * into n;
 for x in select * from jsonb_array_elements(p_items) loop
  ln:=ln+1;
  insert into public.bf_entrusted_note_items(note_id,line_no,product_ref,product_name,total_qty,bf_qty,entrusted_qty,note_unit_price,bf_sales_value)
  values(n.id,ln,nullif(btrim(x->>'product_ref'),''),btrim(x->>'product_name'),(x->>'total_qty')::numeric,(x->>'bf_qty')::numeric,(x->>'entrusted_qty')::numeric,(x->>'note_unit_price')::numeric,coalesce((x->>'bf_sales_value')::numeric,0));
 end loop;
 perform public.bf_nt_validate_note(n.id);
 perform public.bf_nt_event(n.id,'NOTE_CREATED',null,null,to_jsonb(n),n.id::text);
 return n;
end $$;

create or replace function public.bf_nt_update_draft(p_note uuid,p_customer_id text,p_customer_name text,p_buyer_name text,p_fee_per_kg numeric,p_fee_note text,p_pos_refs jsonb,p_items jsonb,p_reason text)
returns public.bf_entrusted_notes language plpgsql security definer set search_path=public as $$
declare oldn public.bf_entrusted_notes; n public.bf_entrusted_notes; x jsonb; ln int:=0;
begin
 perform public.bf_nt_require_admin_or_owner();
 select * into oldn from public.bf_entrusted_notes where id=p_note for update;
 if oldn.id is null then raise exception 'NT_NOT_FOUND'; end if;
 if oldn.status not in ('DRAFT','PENDING_APPROVAL') then raise exception 'NT_LOCKED_USE_CORRECTION'; end if;
 update public.bf_entrusted_notes set customer_id=nullif(btrim(p_customer_id),''),customer_name_snapshot=btrim(p_customer_name),buyer_name=btrim(p_buyer_name),fee_per_kg=coalesce(p_fee_per_kg,0),fee_agreement_note=p_fee_note,pos_refs=coalesce(p_pos_refs,'[]'::jsonb),status='DRAFT',approval_status='STALE',approval_fingerprint=null,approved_by=null,approved_at=null,updated_by=auth.uid(),updated_at=now() where id=p_note returning * into n;
 delete from public.bf_entrusted_note_items where note_id=p_note;
 for x in select * from jsonb_array_elements(p_items) loop
  ln:=ln+1;
  insert into public.bf_entrusted_note_items(note_id,line_no,product_ref,product_name,total_qty,bf_qty,entrusted_qty,note_unit_price,bf_sales_value)
  values(n.id,ln,nullif(btrim(x->>'product_ref'),''),btrim(x->>'product_name'),(x->>'total_qty')::numeric,(x->>'bf_qty')::numeric,(x->>'entrusted_qty')::numeric,(x->>'note_unit_price')::numeric,coalesce((x->>'bf_sales_value')::numeric,0));
 end loop;
 perform public.bf_nt_validate_note(n.id);
 perform public.bf_nt_event(n.id,'NOTE_DRAFT_UPDATED',p_reason,to_jsonb(oldn),to_jsonb(n),n.id::text);
 return n;
end $$;

create or replace function public.bf_nt_submit_note(p_note uuid)
returns public.bf_entrusted_notes language plpgsql security definer set search_path=public as $$
declare oldn public.bf_entrusted_notes; n public.bf_entrusted_notes;
begin
 perform public.bf_nt_require_admin_or_owner(); perform public.bf_nt_validate_note(p_note);
 select * into oldn from public.bf_entrusted_notes where id=p_note for update;
 if oldn.status<>'DRAFT' then raise exception 'NT_NOT_DRAFT'; end if;
 update public.bf_entrusted_notes set status='PENDING_APPROVAL',approval_status='PENDING',updated_by=auth.uid(),updated_at=now() where id=p_note returning * into n;
 perform public.bf_nt_event(n.id,'NOTE_SUBMITTED',null,to_jsonb(oldn),to_jsonb(n),n.id::text); return n;
end $$;

create or replace function public.bf_nt_approve_note(p_note uuid,p_action text,p_reason text default null)
returns public.bf_entrusted_notes language plpgsql security definer set search_path=public as $$
declare oldn public.bf_entrusted_notes; n public.bf_entrusted_notes; fp text; payload text;
begin
 perform public.bf_nt_require_owner(); perform public.bf_nt_validate_note(p_note);
 select * into oldn from public.bf_entrusted_notes where id=p_note for update;
 if oldn.status<>'PENDING_APPROVAL' then raise exception 'NT_NOT_PENDING_APPROVAL'; end if;
 if p_action not in ('APPROVE','REJECT') then raise exception 'NT_INVALID_ACTION'; end if;
 payload:=concat_ws('|',oldn.customer_id,oldn.customer_name_snapshot,oldn.buyer_name,oldn.fee_per_kg::text,coalesce(oldn.fee_agreement_note,''),oldn.pos_refs::text,(select coalesce(jsonb_agg(to_jsonb(i) order by i.line_no),'[]'::jsonb)::text from public.bf_entrusted_note_items i where i.note_id=p_note));
 fp:=encode(digest(payload,'sha256'),'hex');
 update public.bf_entrusted_notes set status=case when p_action='APPROVE' then 'APPROVED' else 'DRAFT' end,approval_status=case when p_action='APPROVE' then 'APPROVED' else 'REJECTED' end,approval_fingerprint=case when p_action='APPROVE' then fp else null end,approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=p_note returning * into n;
 perform public.bf_nt_event(n.id,case when p_action='APPROVE' then 'NOTE_APPROVED' else 'NOTE_REJECTED' end,p_reason,to_jsonb(oldn),to_jsonb(n),n.id::text); return n;
end $$;

create or replace function public.bf_nt_record_transfer(p_note uuid,p_gross numeric,p_date date,p_sender text,p_proofs jsonb,p_note_text text,p_idempotency text)
returns public.bf_entrusted_transfers language plpgsql security definer set search_path=public as $$
declare n public.bf_entrusted_notes; r public.bf_entrusted_transfers;
begin
 perform public.bf_nt_require_admin_or_owner(); select * into n from public.bf_entrusted_notes where id=p_note for update;
 if n.status not in ('APPROVED','PAYMENT_IN_PROGRESS','PAID','CORRECTION_REQUIRED') then raise exception 'NT_NOTE_NOT_ACTIVE'; end if;
 insert into public.bf_entrusted_transfers(note_id,gross_transfer,transfer_date,actual_sender,proof_urls,note,recorded_by,idempotency_key)
 values(p_note,p_gross,p_date,btrim(p_sender),coalesce(p_proofs,'[]'::jsonb),p_note_text,auth.uid(),p_idempotency) returning * into r;
 perform public.bf_nt_event(p_note,'TRANSFER_RECORDED',p_note_text,null,to_jsonb(r),r.id::text); return r;
end $$;

create or replace function public.bf_nt_confirm_transfer(p_transfer uuid,p_actual_received numeric,p_difference_type text,p_reason text default null)
returns public.bf_entrusted_transfers language plpgsql security definer set search_path=public as $$
declare oldr public.bf_entrusted_transfers; r public.bf_entrusted_transfers; d numeric; f public.bf_entrusted_note_financials;
begin
 perform public.bf_nt_require_owner(); select * into oldr from public.bf_entrusted_transfers where id=p_transfer for update;
 if oldr.id is null or oldr.status<>'RECORDED' then raise exception 'NT_TRANSFER_NOT_PENDING'; end if;
 if p_actual_received<0 or p_actual_received>oldr.gross_transfer then raise exception 'NT_INVALID_ACTUAL_RECEIVED'; end if;
 d:=oldr.gross_transfer-p_actual_received;
 if p_difference_type='NONE' and d<>0 then raise exception 'NT_DIFFERENCE_REQUIRES_CLASSIFICATION'; end if;
 if p_difference_type not in ('NONE','BANK_FEE','OTHER') then raise exception 'NT_INVALID_DIFFERENCE_TYPE'; end if;
 if p_difference_type='OTHER' and nullif(btrim(p_reason),'') is null then raise exception 'NT_DIFFERENCE_REASON_REQUIRED'; end if;
 update public.bf_entrusted_transfers set actual_received=p_actual_received,difference_amount=d,difference_type=p_difference_type,difference_reason=p_reason,status='CONFIRMED',confirmed_by=auth.uid(),confirmed_at=now() where id=p_transfer returning * into r;
 select * into f from public.bf_entrusted_note_financials where note_id=r.note_id;
 update public.bf_entrusted_notes set status=case when (f.gross_confirmed+r.gross_transfer)>=f.effective_note_total then 'PAID' else 'PAYMENT_IN_PROGRESS' end,updated_at=now() where id=r.note_id;
 perform public.bf_nt_event(r.note_id,'TRANSFER_CONFIRMED',p_reason,to_jsonb(oldr),to_jsonb(r),r.id::text); return r;
end $$;

create or replace function public.bf_nt_request_correction(p_note uuid,p_new_fee_per_kg numeric,p_items jsonb,p_reason text)
returns public.bf_entrusted_corrections language plpgsql security definer set search_path=public as $$
declare f public.bf_entrusted_note_financials; x jsonb; nt numeric:=0; bfr numeric:=0; tq numeric:=0; bq numeric:=0; eq numeric:=0; c public.bf_entrusted_corrections; snap jsonb;
begin
 perform public.bf_nt_require_admin_or_owner(); if nullif(btrim(p_reason),'') is null then raise exception 'NT_REASON_REQUIRED'; end if;
 select * into f from public.bf_entrusted_note_financials where note_id=p_note; if f.note_id is null then raise exception 'NT_NOT_FOUND'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'NT_ITEMS_REQUIRED'; end if;
 for x in select * from jsonb_array_elements(p_items) loop
   if (x->>'total_qty')::numeric <> (x->>'bf_qty')::numeric+(x->>'entrusted_qty')::numeric then raise exception 'NT_INVALID_QTY_SPLIT'; end if;
   tq:=tq+(x->>'total_qty')::numeric; bq:=bq+(x->>'bf_qty')::numeric; eq:=eq+(x->>'entrusted_qty')::numeric;
   nt:=nt+((x->>'total_qty')::numeric*(x->>'note_unit_price')::numeric);
   bfr:=bfr+coalesce((x->>'bf_sales_value')::numeric,0);
 end loop;
 bfr:=bfr+(eq*coalesce(p_new_fee_per_kg,0));
 if eq<=0 then raise exception 'NT_ENTRUSTED_QTY_REQUIRED'; end if;
 if bq=0 and coalesce(p_new_fee_per_kg,0)<=0 then raise exception 'NT_PURE_ENTRUSTED_FEE_REQUIRED'; end if;
 if nt<bfr then raise exception 'NT_NOTE_BELOW_BF_RIGHT'; end if;
 snap:=jsonb_build_object('fee_per_kg',p_new_fee_per_kg,'items',p_items,'total_qty',tq,'bf_qty',bq,'entrusted_qty',eq,'note_total',nt,'bf_right',bfr);
 insert into public.bf_entrusted_corrections(correction_no,note_id,reason,proposed_snapshot,old_note_total,new_note_total,old_bf_right,new_bf_right,delta_note_total,delta_bf_right,created_by)
 values(public.bf_nt_ref('KNT',nextval('public.bf_nt_correction_seq')),p_note,btrim(p_reason),snap,f.effective_note_total,nt,f.effective_bf_right,bfr,nt-f.effective_note_total,bfr-f.effective_bf_right,auth.uid()) returning * into c;
 update public.bf_entrusted_notes set status='CORRECTION_REQUIRED',approval_status='STALE',updated_at=now() where id=p_note;
 perform public.bf_nt_event(p_note,'CORRECTION_REQUESTED',p_reason,null,to_jsonb(c),c.id::text); return c;
end $$;

create or replace function public.bf_nt_decide_correction(p_correction uuid,p_action text,p_note_text text default null)
returns public.bf_entrusted_corrections language plpgsql security definer set search_path=public as $$
declare oldc public.bf_entrusted_corrections; c public.bf_entrusted_corrections; f public.bf_entrusted_note_financials;
begin
 perform public.bf_nt_require_owner(); select * into oldc from public.bf_entrusted_corrections where id=p_correction for update;
 if oldc.id is null or oldc.status<>'PENDING_OWNER' then raise exception 'NT_CORRECTION_NOT_PENDING'; end if;
 if p_action not in ('APPROVE','REJECT') then raise exception 'NT_INVALID_ACTION'; end if;
 update public.bf_entrusted_corrections set status=case when p_action='APPROVE' then 'APPROVED' else 'REJECTED' end,decided_by=auth.uid(),decided_at=now(),decision_note=p_note_text where id=p_correction returning * into c;
 select * into f from public.bf_entrusted_note_financials where note_id=c.note_id;
 update public.bf_entrusted_notes set status=case when p_action='APPROVE' and f.gross_confirmed>=f.effective_note_total then 'PAID' when p_action='APPROVE' and f.gross_confirmed>0 then 'PAYMENT_IN_PROGRESS' else 'APPROVED' end,approval_status=case when p_action='APPROVE' then 'APPROVED' else 'APPROVED' end,updated_at=now() where id=c.note_id;
 perform public.bf_nt_event(c.note_id,case when p_action='APPROVE' then 'CORRECTION_APPROVED' else 'CORRECTION_REJECTED' end,p_note_text,to_jsonb(oldc),to_jsonb(c),c.id::text); return c;
end $$;

create or replace function public.bf_nt_create_payout(p_note uuid,p_amount numeric,p_date date,p_recipient text,p_agreement_note text,p_signature text,p_photos jsonb,p_source_cash text,p_idempotency text)
returns public.bf_entrusted_payouts language plpgsql security definer set search_path=public as $$
declare f public.bf_entrusted_note_financials; p public.bf_entrusted_payouts;
begin
 perform public.bf_nt_require_admin_or_owner(); select * into f from public.bf_entrusted_note_financials where note_id=p_note for update;
 if f.note_id is null then raise exception 'NT_NOT_FOUND'; end if;
 if not f.is_paid then raise exception 'NT_NOTE_NOT_PAID'; end if;
 if f.bf_shortfall>0 then raise exception 'NT_BF_RIGHT_NOT_FULL'; end if;
 if p_amount<=0 or p_amount>f.payout_outstanding then raise exception 'NT_PAYOUT_EXCEEDS_OUTSTANDING'; end if;
 if nullif(btrim(p_recipient),'') is null or nullif(btrim(p_agreement_note),'') is null or length(coalesce(p_signature,''))<20 then raise exception 'NT_PAYOUT_RECEIPT_REQUIRED'; end if;
 insert into public.bf_entrusted_payouts(payout_no,note_id,amount,payment_date,recipient_name,agreement_note,signature_data,photo_urls,source_cash_label,paid_by,idempotency_key)
 values(public.bf_nt_ref('PDT',nextval('public.bf_nt_payout_seq')),p_note,p_amount,p_date,btrim(p_recipient),btrim(p_agreement_note),p_signature,coalesce(p_photos,'[]'::jsonb),coalesce(nullif(btrim(p_source_cash),''),'Kas Penjualan Harian'),auth.uid(),p_idempotency) returning * into p;
 insert into public.bf_cash_movements(movement_date,direction,movement_type,amount,source_ref_type,source_ref_id,description,created_by)
 values(p_date,'OUT','DANA_TITIPAN',p_amount,'ENTRUSTED_PAYOUT',p.id::text,'Pembayaran Dana Titipan '||p.payout_no,auth.uid());
 perform public.bf_nt_event(p_note,'PAYOUT_RECORDED',p_agreement_note,null,to_jsonb(p),p.id::text); return p;
end $$;

create or replace function public.bf_nt_verify_payout(p_payout uuid,p_action text,p_reason text default null)
returns public.bf_entrusted_payouts language plpgsql security definer set search_path=public as $$
declare oldp public.bf_entrusted_payouts; p public.bf_entrusted_payouts;
begin
 perform public.bf_nt_require_owner(); select * into oldp from public.bf_entrusted_payouts where id=p_payout for update;
 if oldp.id is null or oldp.status not in ('PENDING_OWNER','CORRECTION_REQUIRED') then raise exception 'NT_PAYOUT_NOT_PENDING'; end if;
 if oldp.paid_by=auth.uid() then raise exception 'NT_SELF_VERIFY_DENIED' using errcode='42501'; end if;
 if p_action not in ('VERIFY','CORRECTION_REQUIRED') then raise exception 'NT_INVALID_ACTION'; end if;
 update public.bf_entrusted_payouts set status=case when p_action='VERIFY' then 'VERIFIED' else 'CORRECTION_REQUIRED' end,verified_by=auth.uid(),verified_at=now(),verification_note=p_reason where id=p_payout returning * into p;
 perform public.bf_nt_event(p.note_id,case when p_action='VERIFY' then 'PAYOUT_VERIFIED' else 'PAYOUT_CORRECTION_REQUIRED' end,p_reason,to_jsonb(oldp),to_jsonb(p),p.id::text); return p;
end $$;

create or replace function public.bf_nt_reverse_payout(p_payout uuid,p_reason text)
returns public.bf_entrusted_payouts language plpgsql security definer set search_path=public as $$
declare oldp public.bf_entrusted_payouts; p public.bf_entrusted_payouts;
begin
 perform public.bf_nt_require_owner(); if nullif(btrim(p_reason),'') is null then raise exception 'NT_REASON_REQUIRED'; end if;
 select * into oldp from public.bf_entrusted_payouts where id=p_payout for update; if oldp.id is null or oldp.status='REVERSED' then raise exception 'NT_INVALID_PAYOUT_REVERSAL'; end if;
 update public.bf_entrusted_payouts set status='REVERSED',verification_note=concat_ws(E'\n',verification_note,'[REVERSAL] '||btrim(p_reason)),verified_by=auth.uid(),verified_at=now() where id=p_payout returning * into p;
 update public.bf_cash_movements set status='REVERSED' where source_ref_type='ENTRUSTED_PAYOUT' and source_ref_id=p_payout::text and status='POSTED';
 perform public.bf_nt_event(p.note_id,'PAYOUT_REVERSED',p_reason,to_jsonb(oldp),to_jsonb(p),p.id::text); return p;
end $$;

create or replace function public.bf_nt_reconcile_cash(p_date date,p_pos_cash numeric,p_physical numeric,p_expense_snapshot numeric,p_opening numeric default 0,p_topup numeric default 0,p_withdrawal numeric default 0,p_other_in numeric default 0,p_other_out numeric default 0,p_note text default null)
returns public.bf_cash_reconciliations language plpgsql security definer set search_path=public as $$
declare payout_total numeric; expected numeric; r public.bf_cash_reconciliations;
begin
 perform public.bf_nt_require_owner();
 select coalesce(sum(amount),0) into payout_total from public.bf_cash_movements where movement_date=p_date and direction='OUT' and movement_type='DANA_TITIPAN' and status='POSTED';
 expected:=coalesce(p_opening,0)+coalesce(p_pos_cash,0)+coalesce(p_topup,0)+coalesce(p_other_in,0)-coalesce(p_expense_snapshot,0)-payout_total-coalesce(p_withdrawal,0)-coalesce(p_other_out,0);
 insert into public.bf_cash_reconciliations(reconciliation_date,pos_cash_sales,opening_cash,owner_topup,owner_withdrawal,expense_total_snapshot,entrusted_payout_total,other_cash_in,other_cash_out,expected_cash,physical_cash,difference,note,verified_by)
 values(p_date,p_pos_cash,coalesce(p_opening,0),coalesce(p_topup,0),coalesce(p_withdrawal,0),coalesce(p_expense_snapshot,0),payout_total,coalesce(p_other_in,0),coalesce(p_other_out,0),expected,p_physical,p_physical-expected,p_note,auth.uid())
 on conflict(reconciliation_date) do update set pos_cash_sales=excluded.pos_cash_sales,opening_cash=excluded.opening_cash,owner_topup=excluded.owner_topup,owner_withdrawal=excluded.owner_withdrawal,expense_total_snapshot=excluded.expense_total_snapshot,entrusted_payout_total=excluded.entrusted_payout_total,other_cash_in=excluded.other_cash_in,other_cash_out=excluded.other_cash_out,expected_cash=excluded.expected_cash,physical_cash=excluded.physical_cash,difference=excluded.difference,note=excluded.note,status='VERIFIED',verified_by=auth.uid(),verified_at=now()
 returning * into r; return r;
end $$;

-- RLS: authenticated users may read only when role is Admin/Owner. Direct mutations are denied; RPCs above are the only writers.
do $$ declare t text; begin
 foreach t in array array['bf_entrusted_notes','bf_entrusted_note_items','bf_entrusted_transfers','bf_entrusted_corrections','bf_entrusted_payouts','bf_cash_movements','bf_cash_reconciliations','bf_entrusted_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists nt_read_admin_owner on public.%I',t);
  execute format('create policy nt_read_admin_owner on public.%I for select to authenticated using (public.bf_nt_is_admin_or_owner())',t);
  execute format('revoke insert,update,delete on public.%I from authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
grant select on public.bf_entrusted_note_base_financials,public.bf_entrusted_note_financials to authenticated;

grant execute on function public.bf_nt_create_note(text,text,text,numeric,text,jsonb,jsonb,text) to authenticated;
grant execute on function public.bf_nt_update_draft(uuid,text,text,text,numeric,text,jsonb,jsonb,text) to authenticated;
grant execute on function public.bf_nt_submit_note(uuid) to authenticated;
grant execute on function public.bf_nt_approve_note(uuid,text,text) to authenticated;
grant execute on function public.bf_nt_record_transfer(uuid,numeric,date,text,jsonb,text,text) to authenticated;
grant execute on function public.bf_nt_confirm_transfer(uuid,numeric,text,text) to authenticated;
grant execute on function public.bf_nt_request_correction(uuid,numeric,jsonb,text) to authenticated;
grant execute on function public.bf_nt_decide_correction(uuid,text,text) to authenticated;
grant execute on function public.bf_nt_create_payout(uuid,numeric,date,text,text,text,jsonb,text,text) to authenticated;
grant execute on function public.bf_nt_verify_payout(uuid,text,text) to authenticated;
grant execute on function public.bf_nt_reverse_payout(uuid,text) to authenticated;
grant execute on function public.bf_nt_reconcile_cash(date,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) to authenticated;

comment on table public.bf_entrusted_notes is 'Operational Nota Titipan. Never a canonical BF sale/invoice.';
comment on table public.bf_cash_movements is 'Cash movements for reconciliation; DANA_TITIPAN is not an operating expense.';
commit;
