begin;

-- R13 integrated Setoran / Daily Cash Reconciliation hardening.
-- Existing bf_cash_reconciliations remains the single canonical daily reconciliation table.

alter table public.bf_cash_reconciliations
  add column if not exists maker_by uuid,
  add column if not exists submitted_by uuid,
  add column if not exists submitted_at timestamptz,
  add column if not exists review_note text,
  add column if not exists evidence_urls jsonb not null default '[]'::jsonb,
  add column if not exists expense_state_revision bigint,
  add column if not exists revision bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now();

alter table public.bf_cash_reconciliations alter column physical_cash drop not null;
alter table public.bf_cash_reconciliations alter column difference drop not null;
alter table public.bf_cash_reconciliations alter column verified_by drop not null;
alter table public.bf_cash_reconciliations alter column verified_at drop not null;

alter table public.bf_cash_reconciliations drop constraint if exists bf_cash_reconciliations_status_check;
alter table public.bf_cash_reconciliations add constraint bf_cash_reconciliations_status_check
  check (status in ('DRAFT','SUBMITTED','CORRECTION_REQUIRED','INVESTIGATE','VERIFIED','REVERSED'));

create table if not exists public.bf_cash_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.bf_cash_reconciliations(id),
  event_type text not null,
  actor_id uuid,
  actor_role text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.bf_cash_reconciliation_events enable row level security;
drop policy if exists bf_cash_reconciliation_events_read on public.bf_cash_reconciliation_events;
create policy bf_cash_reconciliation_events_read on public.bf_cash_reconciliation_events
for select to authenticated using (public.bf_nt_is_admin_or_owner());

create or replace function public.bf_cash_expense_entries(p_date date)
returns table(
  source_type text,
  source_id text,
  transaction_date date,
  category text,
  description text,
  amount numeric,
  source_account text,
  source_status text,
  source_reference text,
  proof_urls jsonb,
  state_revision bigint
)
language sql
security definer
set search_path=public
as $$
with state as (
  select value::jsonb as payload, revision
  from public.bf_state_items
  where store_code='BINTANG-Y70M' and state_key='bf_expenses'
  limit 1
), rows as (
  select e, state.revision
  from state cross join lateral jsonb_array_elements(case when jsonb_typeof(state.payload)='array' then state.payload else '[]'::jsonb end) e
)
select
  'EXPENSE'::text,
  coalesce(nullif(e->>'id',''), nullif(e->>'_bf_uid',''), md5(e::text))::text,
  coalesce(nullif(e->>'tanggal',''),nullif(e->>'date',''))::date,
  coalesce(nullif(e->>'kategori',''),nullif(e->>'jenis',''),'Pengeluaran')::text,
  coalesce(nullif(e->>'keterangan',''),nullif(e->>'deskripsi',''),'')::text,
  coalesce(nullif(e->>'nominal',''),nullif(e->>'jumlah',''),nullif(e->>'amount',''),'0')::numeric,
  coalesce(nullif(e->>'sumber_kas',''),nullif(e->>'source_account',''),nullif(e->>'metode',''),'Tidak tercatat')::text,
  case when nullif(e->>'deleted_at','') is null then 'ACTIVE' else 'CANCELLED' end::text,
  coalesce(nullif(e->>'reference',''),nullif(e->>'id',''),nullif(e->>'_bf_uid',''))::text,
  case
    when jsonb_typeof(e->'bukti_fotos')='array' then e->'bukti_fotos'
    when nullif(e->>'bukti_foto','') is not null then jsonb_build_array(e->>'bukti_foto')
    else '[]'::jsonb
  end,
  revision
from rows
where nullif(e->>'deleted_at','') is null
  and coalesce(nullif(e->>'tanggal',''),nullif(e->>'date',''))::date=p_date
  and coalesce(nullif(e->>'nominal',''),nullif(e->>'jumlah',''),nullif(e->>'amount',''),'0')::numeric > 0;
$$;

create or replace function public.bf_cash_reconciliation_event(
  p_reconciliation uuid,
  p_type text,
  p_reason text,
  p_before jsonb,
  p_after jsonb
) returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into public.bf_cash_reconciliation_events(reconciliation_id,event_type,actor_id,actor_role,reason,before_data,after_data)
  values(p_reconciliation,p_type,auth.uid(),coalesce((select role from public.bf_profiles where id=auth.uid()),'unknown'),p_reason,p_before,p_after);
end $$;

create or replace function public.bf_cash_reconciliation_command(
  p_action text,
  p_date date,
  p_pos_cash numeric default 0,
  p_opening numeric default 0,
  p_owner_topup numeric default 0,
  p_owner_withdrawal numeric default 0,
  p_other_in numeric default 0,
  p_other_out numeric default 0,
  p_physical numeric default null,
  p_note text default null,
  p_evidence jsonb default '[]'::jsonb,
  p_expected_revision bigint default null,
  p_reason text default null
) returns public.bf_cash_reconciliations
language plpgsql security definer set search_path=public as $$
declare
  v_action text:=upper(coalesce(p_action,''));
  v_role text:=lower(coalesce((select role from public.bf_profiles where id=auth.uid()),''));
  v_expense numeric:=0;
  v_expense_revision bigint:=0;
  v_dt numeric:=0; v_cm numeric:=0; v_rf numeric:=0; v_dr numeric:=0;
  v_expected numeric:=0;
  v_before public.bf_cash_reconciliations;
  v_row public.bf_cash_reconciliations;
  v_new_status text;
begin
  if v_role not in ('owner','admin') then raise exception 'CASH_RECON_PERMISSION_DENIED' using errcode='42501'; end if;
  if p_date is null then raise exception 'CASH_RECON_DATE_REQUIRED'; end if;
  if least(coalesce(p_pos_cash,0),coalesce(p_opening,0),coalesce(p_owner_topup,0),coalesce(p_owner_withdrawal,0),coalesce(p_other_in,0),coalesce(p_other_out,0)) < 0
    or (p_physical is not null and p_physical < 0) then raise exception 'CASH_RECON_NEGATIVE_VALUE'; end if;

  select coalesce(sum(amount),0),coalesce(max(state_revision),0) into v_expense,v_expense_revision from public.bf_cash_expense_entries(p_date);
  select coalesce(sum(amount),0) into v_dt from public.bf_cash_movements where movement_date=p_date and direction='OUT' and movement_type='DANA_TITIPAN' and status='POSTED';
  select coalesce(sum(amount),0) into v_cm from public.bf_cash_movements where movement_date=p_date and direction='OUT' and movement_type='CUSTOMER_COMMISSION' and status='POSTED';
  select coalesce(sum(amount),0) into v_rf from public.bf_cash_movements where movement_date=p_date and direction='OUT' and movement_type='CUSTOMER_REFUND' and status='POSTED';
  select coalesce(sum(amount),0) into v_dr from public.bf_cash_movements where movement_date=p_date and direction='OUT' and movement_type='CUSTOMER_DEPOSIT_REFUND' and status='POSTED';

  -- Customer Setoran is deliberately NOT included as daily cash-in here.
  v_expected:=coalesce(p_opening,0)+coalesce(p_pos_cash,0)+coalesce(p_owner_topup,0)+coalesce(p_other_in,0)
    -coalesce(p_owner_withdrawal,0)-v_expense-v_dt-v_cm-v_rf-v_dr-coalesce(p_other_out,0);

  select * into v_before from public.bf_cash_reconciliations where reconciliation_date=p_date for update;

  if v_before.id is not null and p_expected_revision is not null and v_before.revision<>p_expected_revision then
    raise exception 'CASH_RECON_STALE_REVISION';
  end if;

  if v_action in ('DRAFT','SUBMIT') then
    if v_before.id is not null and v_before.status in ('VERIFIED','REVERSED') then raise exception 'CASH_RECON_FINAL_LOCKED'; end if;
    if v_action='SUBMIT' and p_physical is null then raise exception 'CASH_RECON_PHYSICAL_REQUIRED'; end if;
    v_new_status:=case when v_action='SUBMIT' then 'SUBMITTED' else 'DRAFT' end;
    insert into public.bf_cash_reconciliations(
      reconciliation_date,pos_cash_sales,opening_cash,owner_topup,owner_withdrawal,expense_total_snapshot,
      entrusted_payout_total,commission_payout_total,refund_payout_total,deposit_refund_total,other_cash_in,other_cash_out,
      expected_cash,physical_cash,difference,note,status,maker_by,submitted_by,submitted_at,evidence_urls,expense_state_revision,
      verified_by,verified_at,revision,updated_at
    ) values(
      p_date,coalesce(p_pos_cash,0),coalesce(p_opening,0),coalesce(p_owner_topup,0),coalesce(p_owner_withdrawal,0),v_expense,
      v_dt,v_cm,v_rf,v_dr,coalesce(p_other_in,0),coalesce(p_other_out,0),v_expected,p_physical,
      case when p_physical is null then null else p_physical-v_expected end,p_note,v_new_status,auth.uid(),
      case when v_action='SUBMIT' then auth.uid() else null end,case when v_action='SUBMIT' then now() else null end,
      coalesce(p_evidence,'[]'::jsonb),v_expense_revision,null,null,1,now()
    ) on conflict(reconciliation_date) do update set
      pos_cash_sales=excluded.pos_cash_sales,opening_cash=excluded.opening_cash,owner_topup=excluded.owner_topup,
      owner_withdrawal=excluded.owner_withdrawal,expense_total_snapshot=excluded.expense_total_snapshot,
      entrusted_payout_total=excluded.entrusted_payout_total,commission_payout_total=excluded.commission_payout_total,
      refund_payout_total=excluded.refund_payout_total,deposit_refund_total=excluded.deposit_refund_total,
      other_cash_in=excluded.other_cash_in,other_cash_out=excluded.other_cash_out,expected_cash=excluded.expected_cash,
      physical_cash=excluded.physical_cash,difference=excluded.difference,note=excluded.note,status=excluded.status,
      maker_by=coalesce(public.bf_cash_reconciliations.maker_by,auth.uid()),
      submitted_by=case when v_action='SUBMIT' then auth.uid() else public.bf_cash_reconciliations.submitted_by end,
      submitted_at=case when v_action='SUBMIT' then now() else public.bf_cash_reconciliations.submitted_at end,
      evidence_urls=excluded.evidence_urls,expense_state_revision=excluded.expense_state_revision,
      review_note=null,verified_by=null,verified_at=null,revision=public.bf_cash_reconciliations.revision+1,updated_at=now()
    returning * into v_row;
    perform public.bf_cash_reconciliation_event(v_row.id,'CASH_RECON_'||v_action,p_reason,to_jsonb(v_before),to_jsonb(v_row));
    return v_row;
  end if;

  if v_role<>'owner' then raise exception 'CASH_RECON_OWNER_REQUIRED' using errcode='42501'; end if;
  if v_before.id is null then raise exception 'CASH_RECON_NOT_FOUND'; end if;

  if v_action='APPROVE' then
    if v_before.status<>'SUBMITTED' then raise exception 'CASH_RECON_NOT_SUBMITTED'; end if;
    if v_before.expense_state_revision is distinct from v_expense_revision
      or v_before.expense_total_snapshot is distinct from v_expense
      or v_before.entrusted_payout_total is distinct from v_dt
      or v_before.commission_payout_total is distinct from v_cm
      or v_before.refund_payout_total is distinct from v_rf
      or v_before.deposit_refund_total is distinct from v_dr then
      raise exception 'CASH_RECON_STALE_SOURCES';
    end if;
    update public.bf_cash_reconciliations set status='VERIFIED',verified_by=auth.uid(),verified_at=now(),review_note=p_reason,
      revision=revision+1,updated_at=now() where id=v_before.id returning * into v_row;
  elsif v_action='CORRECTION' then
    if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'CASH_RECON_REASON_REQUIRED'; end if;
    if v_before.status not in ('SUBMITTED','INVESTIGATE') then raise exception 'CASH_RECON_BAD_STATUS'; end if;
    update public.bf_cash_reconciliations set status='CORRECTION_REQUIRED',review_note=p_reason,verified_by=null,verified_at=null,
      revision=revision+1,updated_at=now() where id=v_before.id returning * into v_row;
  elsif v_action='INVESTIGATE' then
    if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'CASH_RECON_REASON_REQUIRED'; end if;
    if v_before.status not in ('SUBMITTED','CORRECTION_REQUIRED') then raise exception 'CASH_RECON_BAD_STATUS'; end if;
    update public.bf_cash_reconciliations set status='INVESTIGATE',review_note=p_reason,verified_by=null,verified_at=null,
      revision=revision+1,updated_at=now() where id=v_before.id returning * into v_row;
  elsif v_action='REOPEN' then
    if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'CASH_RECON_REASON_REQUIRED'; end if;
    if v_before.status<>'VERIFIED' then raise exception 'CASH_RECON_NOT_VERIFIED'; end if;
    update public.bf_cash_reconciliations set status='CORRECTION_REQUIRED',review_note=p_reason,verified_by=null,verified_at=null,
      revision=revision+1,updated_at=now() where id=v_before.id returning * into v_row;
  else
    raise exception 'CASH_RECON_UNKNOWN_ACTION';
  end if;

  perform public.bf_cash_reconciliation_event(v_row.id,'CASH_RECON_'||v_action,p_reason,to_jsonb(v_before),to_jsonb(v_row));
  return v_row;
end $$;

-- Legacy RPCs remain compatibility wrappers only; canonical write logic is above.
create or replace function public.bf_cf_reconcile_cash_day(
  p_date date,p_pos_cash numeric,p_opening numeric,p_owner_topup numeric,p_owner_withdrawal numeric,
  p_expense numeric,p_other_in numeric,p_other_out numeric,p_physical numeric,p_note text
) returns public.bf_cash_reconciliations
language plpgsql security definer set search_path=public as $$
begin
  return public.bf_cash_reconciliation_command('SUBMIT',p_date,p_pos_cash,p_opening,p_owner_topup,p_owner_withdrawal,p_other_in,p_other_out,p_physical,p_note,'[]'::jsonb,null,null);
end $$;

create or replace function public.bf_nt_reconcile_cash(
  p_date date,p_pos_cash numeric,p_physical numeric,p_expense_snapshot numeric,p_opening numeric default 0,p_topup numeric default 0,
  p_withdrawal numeric default 0,p_other_in numeric default 0,p_other_out numeric default 0,p_note text default null
) returns public.bf_cash_reconciliations
language plpgsql security definer set search_path=public as $$
begin
  return public.bf_cash_reconciliation_command('SUBMIT',p_date,p_pos_cash,p_opening,p_topup,p_withdrawal,p_other_in,p_other_out,p_physical,p_note,'[]'::jsonb,null,null);
end $$;

create or replace function public.bf_nt_mark_cash_reconciliation_stale(p_date date,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.bf_cash_reconciliations
  set status=case when status='VERIFIED' then 'CORRECTION_REQUIRED' else status end,
      review_note=concat_ws(E'\n',nullif(review_note,''),'[AUTO STALE] '||coalesce(p_reason,'Pergerakan kas berubah setelah rekonsiliasi.')),
      revision=revision+1,updated_at=now()
  where reconciliation_date=p_date and status in ('SUBMITTED','VERIFIED');
end $$;

-- Controlled Setoran case reversal. Pending/reversible downstream rows are reversed; posted value movement blocks reversal.
create or replace function public.bf_cf_reverse_setoran_case(p_case uuid,p_reason text,p_expected_revision bigint default null)
returns public.bf_customer_fund_cases
language plpgsql security definer set search_path=public as $$
declare c public.bf_customer_fund_cases; before_case jsonb; cnt bigint;
begin
  perform public.bf_nt_require_owner();
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'CF_REVERSAL_REASON_REQUIRED'; end if;
  select * into c from public.bf_customer_fund_cases where id=p_case for update;
  if c.id is null then raise exception 'CF_CASE_NOT_FOUND'; end if;
  if c.reconciliation_status='REVERSED' then return c; end if;
  if p_expected_revision is not null and c.revision<>p_expected_revision then raise exception 'CF_STALE_REVISION'; end if;

  select count(*) into cnt from public.bf_customer_fund_payout_allocations pa
    join public.bf_customer_fund_payouts p on p.id=pa.payout_id
    where p.status not in ('REVERSED','REJECTED') and (
      pa.obligation_id in (
        select o.id from public.bf_customer_commission_obligations o
        join public.bf_customer_fund_classifications cl on cl.id=o.classification_id where cl.case_id=c.id
      )
      or pa.obligation_id in (
        select o.id from public.bf_customer_refund_obligations o
        join public.bf_customer_fund_classifications cl on cl.id=o.classification_id where cl.case_id=c.id
      )
    );
  if cnt>0 then raise exception 'CF_REVERSAL_DOWNSTREAM_VALUE_MOVED'; end if;

  before_case:=to_jsonb(c);
  update public.bf_customer_fund_allocations set status='REVERSED',correction_reason=p_reason where case_id=c.id and status<>'REVERSED';
  update public.bf_customer_commission_obligations o set status='REVERSED'
    from public.bf_customer_fund_classifications cl where o.classification_id=cl.id and cl.case_id=c.id and o.status<>'REVERSED';
  update public.bf_customer_refund_obligations o set status='REVERSED'
    from public.bf_customer_fund_classifications cl where o.classification_id=cl.id and cl.case_id=c.id and o.status<>'REVERSED';
  update public.bf_customer_fund_classifications set status='REVERSED',decision_note=concat_ws(E'\n',decision_note,p_reason),decided_by=auth.uid(),decided_at=now()
    where case_id=c.id and status<>'REVERSED';
  update public.bf_customer_fund_cases set reconciliation_status='REVERSED',difference_reason=p_reason,updated_by=auth.uid(),updated_at=now(),revision=revision+1
    where id=c.id returning * into c;
  perform public.bf_cf_event(c.id,'SETORAN_CASE_REVERSED',p_reason,before_case,to_jsonb(c),'case',c.id::text);
  return c;
end $$;

commit;
