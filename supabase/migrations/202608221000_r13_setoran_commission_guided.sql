-- R13 guided Setoran -> Customer Commission flow.
-- Existing-base-first: extends existing case/classification/obligation records; no second Setoran or commission writer.

alter table public.bf_customer_fund_cases
  add column if not exists settled_note_amounts jsonb not null default '[]'::jsonb,
  add column if not exists settled_note_total numeric(18,2) not null default 0,
  add column if not exists payment_method_code text,
  add column if not exists destination_account text,
  add column if not exists flow_mode text not null default 'LEGACY';

alter table public.bf_customer_fund_classifications
  add column if not exists source_mode text not null default 'ALLOCATED_EXCESS',
  add column if not exists owner_bank_fee_amount numeric(18,2) not null default 0,
  add column if not exists owner_bank_fee_bearer text not null default 'NONE';

alter table public.bf_customer_fund_cases
  drop constraint if exists bf_customer_fund_cases_reconciliation_status_check;
alter table public.bf_customer_fund_cases
  add constraint bf_customer_fund_cases_reconciliation_status_check
  check (reconciliation_status in (
    'RECORDED','CONFIRMED','EXCEPTION','CORRECTION_REQUIRED','REVERSED',
    'NO_OWNER_REQUIRED','COMMISSION_PENDING_OWNER','COMMISSION_APPROVED'
  ));

alter table public.bf_customer_fund_cases
  drop constraint if exists bf_cf_settled_notes_array;
alter table public.bf_customer_fund_cases
  add constraint bf_cf_settled_notes_array
  check (jsonb_typeof(settled_note_amounts)='array' and settled_note_total>=0);

alter table public.bf_customer_fund_classifications
  drop constraint if exists bf_cf_owner_fee_check;
alter table public.bf_customer_fund_classifications
  add constraint bf_cf_owner_fee_check
  check (owner_bank_fee_amount>=0 and owner_bank_fee_bearer in ('NONE','CUSTOMER','BF'));

create unique index if not exists bf_cf_one_guided_commission_per_case
on public.bf_customer_fund_classifications(case_id)
where source_mode='SETORAN_GUIDED' and classification_type='CUSTOMER_COMMISSION'
and status in ('PENDING_OWNER','APPROVED','CORRECTION_REQUIRED');

create or replace function public.bf_cf_note_amount_total(p_values jsonb)
returns numeric
language plpgsql immutable
set search_path=public
as $$
declare v jsonb; total numeric:=0; n numeric;
begin
  if p_values is null or jsonb_typeof(p_values)<>'array' or jsonb_array_length(p_values)=0 then
    raise exception 'CF_NOTE_AMOUNTS_REQUIRED';
  end if;
  for v in select value from jsonb_array_elements(p_values)
  loop
    begin n := (v #>> '{}')::numeric; exception when others then raise exception 'CF_INVALID_NOTE_AMOUNT'; end;
    if n<=0 then raise exception 'CF_INVALID_NOTE_AMOUNT'; end if;
    total:=total+n;
  end loop;
  return total;
end $$;

create or replace function public.bf_cf_submit_setoran_flow(
  p_case uuid,
  p_customer_id text,
  p_customer_name text,
  p_gross numeric,
  p_transfer_date date,
  p_payment_method text,
  p_destination_account text,
  p_note_amounts jsonb,
  p_request_commission boolean,
  p_agreement text,
  p_idempotency text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  c0 public.bf_customer_fund_cases;
  c public.bf_customer_fund_cases;
  x public.bf_customer_fund_classifications;
  note_total numeric;
  diff numeric;
begin
  perform public.bf_nt_require_admin_or_owner();
  select * into c0 from public.bf_customer_fund_cases where id=p_case for update;
  if c0.id is null then raise exception 'CF_CASE_NOT_FOUND'; end if;
  if c0.reconciliation_status in ('REVERSED','COMMISSION_APPROVED') then raise exception 'CF_CASE_LOCKED'; end if;
  if exists(select 1 from public.bf_customer_commission_obligations o join public.bf_customer_fund_classifications q on q.id=o.classification_id where q.case_id=p_case and o.status<>'REVERSED') then
    raise exception 'CF_CASE_HAS_COMMISSION_OBLIGATION';
  end if;
  if nullif(btrim(p_customer_id),'') is null or nullif(btrim(p_customer_name),'') is null or coalesce(p_gross,0)<=0 then
    raise exception 'CF_REQUIRED_FIELD';
  end if;
  note_total:=public.bf_cf_note_amount_total(p_note_amounts);
  diff:=p_gross-note_total;

  select * into x
  from public.bf_customer_fund_classifications
  where case_id=p_case and source_mode='SETORAN_GUIDED'
    and classification_type='CUSTOMER_COMMISSION'
    and status in ('PENDING_OWNER','CORRECTION_REQUIRED')
  order by proposed_at desc limit 1
  for update;

  if coalesce(p_request_commission,false) then
    if diff<=0 then raise exception 'CF_COMMISSION_REQUIRES_POSITIVE_DIFFERENCE'; end if;
    if nullif(btrim(p_agreement),'') is null then raise exception 'CF_AGREEMENT_REQUIRED'; end if;
    if x.id is null then
      insert into public.bf_customer_fund_classifications(
        case_id,classification_type,gross_amount,customer_bank_fee_amount,agreement_note,
        proposed_by,idempotency_key,source_mode,owner_bank_fee_amount,owner_bank_fee_bearer
      ) values(
        p_case,'CUSTOMER_COMMISSION',diff,0,btrim(p_agreement),
        auth.uid(),p_idempotency,'SETORAN_GUIDED',0,'NONE'
      ) returning * into x;
    else
      update public.bf_customer_fund_classifications
      set gross_amount=diff,customer_bank_fee_amount=0,
          agreement_note=btrim(p_agreement),status='PENDING_OWNER',
          proposed_by=auth.uid(),proposed_at=now(),decided_by=null,decided_at=null,
          decision_note=null,owner_bank_fee_amount=0,owner_bank_fee_bearer='NONE'
      where id=x.id returning * into x;
    end if;
  else
    if x.id is not null then
      update public.bf_customer_fund_classifications
      set status='REVERSED',decision_note='Pengajuan Komisi dibatalkan saat koreksi Setoran',
          decided_at=now(),decided_by=auth.uid()
      where id=x.id returning * into x;
    end if;
    x:=null;
  end if;

  update public.bf_customer_fund_cases
  set customer_id=btrim(p_customer_id),
      customer_name_snapshot=btrim(p_customer_name),
      gross_transfer=p_gross,
      transfer_date=p_transfer_date,
      actual_sender=null,
      payment_method=nullif(btrim(p_payment_method),''),
      payment_method_code=nullif(btrim(p_payment_method),''),
      destination_account=nullif(btrim(p_destination_account),''),
      settled_note_amounts=p_note_amounts,
      settled_note_total=note_total,
      flow_mode='SETORAN_GUIDED',
      reconciliation_status=case when coalesce(p_request_commission,false) then 'COMMISSION_PENDING_OWNER' else 'NO_OWNER_REQUIRED' end,
      difference_amount=greatest(diff,0),
      difference_type='NONE',
      fee_bearer='NONE',
      confirmed_by=null,confirmed_at=null,
      revision=revision+1,updated_by=auth.uid(),updated_at=now()
  where id=p_case returning * into c;

  perform public.bf_cf_event(
    c.id,
    case when coalesce(p_request_commission,false) then 'SETORAN_COMMISSION_PROPOSED' else 'SETORAN_NO_COMMISSION_COMPLETED' end,
    p_agreement,to_jsonb(c0),to_jsonb(c),'case',c.id::text
  );

  return jsonb_build_object(
    'case_id',c.id,'case_no',c.case_no,'case_revision',c.revision,
    'business_status',c.reconciliation_status,
    'note_total',note_total,'difference',diff,
    'classification_id',case when x.id is null then null else x.id end,
    'classification_status',case when x.id is null then null else x.status end
  );
end $$;

create or replace function public.bf_cf_decide_setoran_commission(
  p_classification uuid,
  p_action text,
  p_bank_fee numeric,
  p_fee_bearer text,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  x0 public.bf_customer_fund_classifications;
  x public.bf_customer_fund_classifications;
  c public.bf_customer_fund_cases;
  calc numeric;
  fee numeric:=coalesce(p_bank_fee,0);
  bearer text:=coalesce(nullif(btrim(p_fee_bearer),''),'NONE');
  net numeric;
begin
  perform public.bf_nt_require_owner();
  select * into x0 from public.bf_customer_fund_classifications where id=p_classification for update;
  if x0.id is null or x0.source_mode<>'SETORAN_GUIDED' or x0.classification_type<>'CUSTOMER_COMMISSION' then
    raise exception 'CF_GUIDED_COMMISSION_NOT_FOUND';
  end if;
  if x0.status<>'PENDING_OWNER' then raise exception 'CF_CLASSIFICATION_NOT_PENDING'; end if;
  select * into c from public.bf_customer_fund_cases where id=x0.case_id for update;
  calc:=c.gross_transfer-c.settled_note_total;
  if calc<=0 or calc<>x0.gross_amount then raise exception 'CF_STALE_COMMISSION_CALCULATION'; end if;

  if p_action='CORRECTION_REQUIRED' then
    if nullif(btrim(p_note),'') is null then raise exception 'CF_REASON_REQUIRED'; end if;
    update public.bf_customer_fund_classifications
      set status='CORRECTION_REQUIRED',decision_note=btrim(p_note),decided_by=auth.uid(),decided_at=now()
      where id=x0.id returning * into x;
    update public.bf_customer_fund_cases
      set reconciliation_status='CORRECTION_REQUIRED',revision=revision+1,updated_by=auth.uid(),updated_at=now()
      where id=c.id;
    perform public.bf_cf_event(c.id,'SETORAN_COMMISSION_CORRECTION_REQUIRED',p_note,to_jsonb(x0),to_jsonb(x),'classification',x.id::text);
    return jsonb_build_object('status',x.status,'classification_id',x.id,'commission_final',null);
  elsif p_action='REJECT' then
    update public.bf_customer_fund_classifications
      set status='REJECTED',decision_note=p_note,decided_by=auth.uid(),decided_at=now()
      where id=x0.id returning * into x;
    update public.bf_customer_fund_cases
      set reconciliation_status='NO_OWNER_REQUIRED',revision=revision+1,updated_by=auth.uid(),updated_at=now()
      where id=c.id;
    perform public.bf_cf_event(c.id,'SETORAN_COMMISSION_REJECTED',p_note,to_jsonb(x0),to_jsonb(x),'classification',x.id::text);
    return jsonb_build_object('status',x.status,'classification_id',x.id,'commission_final',0);
  elsif p_action<>'APPROVE' then
    raise exception 'CF_INVALID_ACTION';
  end if;

  if fee<0 or fee>calc then raise exception 'CF_INVALID_BANK_FEE'; end if;
  if fee=0 then bearer:='NONE'; end if;
  if fee>0 and bearer not in ('CUSTOMER','BF') then raise exception 'CF_INVALID_BANK_FEE_BEARER'; end if;
  net:=case when bearer='CUSTOMER' then calc-fee else calc end;

  update public.bf_customer_fund_classifications
    set gross_amount=calc,
        customer_bank_fee_amount=case when bearer='CUSTOMER' then fee else 0 end,
        owner_bank_fee_amount=fee,
        owner_bank_fee_bearer=bearer,
        status='APPROVED',decision_note=p_note,decided_by=auth.uid(),decided_at=now()
    where id=x0.id returning * into x;

  insert into public.bf_customer_commission_obligations(
    commission_no,classification_id,customer_id,customer_name_snapshot,
    gross_amount,bank_fee_amount,obligation_amount,created_by
  ) values(
    public.bf_nt_ref('KOM',nextval('public.bf_cf_commission_seq')),
    x.id,c.customer_id,c.customer_name_snapshot,
    calc,case when bearer='CUSTOMER' then fee else 0 end,net,auth.uid()
  ) on conflict (classification_id) do nothing;

  update public.bf_customer_fund_cases
    set reconciliation_status='COMMISSION_APPROVED',
        difference_amount=fee,
        difference_type=case when fee>0 then 'BANK_FEE' else 'NONE' end,
        fee_bearer=bearer,
        confirmed_by=auth.uid(),confirmed_at=now(),
        revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where id=c.id;

  perform public.bf_cf_event(c.id,'SETORAN_COMMISSION_APPROVED',p_note,to_jsonb(x0),to_jsonb(x),'classification',x.id::text);
  return jsonb_build_object(
    'status','APPROVED','classification_id',x.id,
    'commission_gross',calc,'bank_fee',fee,'fee_bearer',bearer,'commission_final',net
  );
end $$;

create or replace view public.bf_customer_fund_case_financials
with (security_invoker=true)
as
select
  c.id case_id,c.case_no,c.customer_id,c.customer_name_snapshot,c.gross_transfer,
  c.actual_received,c.difference_amount,c.difference_type,c.fee_bearer,c.reconciliation_status,
  (case when c.flow_mode='SETORAN_GUIDED' then c.settled_note_total
        else coalesce((select sum(a.amount) from public.bf_customer_fund_allocations a where a.case_id=c.id and a.status='CONFIRMED'),0) end)::numeric(18,2) allocated_confirmed,
  coalesce((select sum(x.gross_amount) from public.bf_customer_fund_classifications x where x.case_id=c.id and x.status in ('PENDING_OWNER','APPROVED','CORRECTION_REQUIRED')),0)::numeric(18,2) excess_committed,
  greatest(c.gross_transfer-(case when c.flow_mode='SETORAN_GUIDED' then c.settled_note_total
        else coalesce((select sum(a.amount) from public.bf_customer_fund_allocations a where a.case_id=c.id and a.status='CONFIRMED'),0) end),0)::numeric(18,2) gross_excess,
  greatest(c.gross_transfer-(case when c.flow_mode='SETORAN_GUIDED' then c.settled_note_total
        else coalesce((select sum(a.amount) from public.bf_customer_fund_allocations a where a.case_id=c.id and a.status='CONFIRMED'),0) end)
        -coalesce((select sum(x.gross_amount) from public.bf_customer_fund_classifications x where x.case_id=c.id and x.status in ('PENDING_OWNER','APPROVED','CORRECTION_REQUIRED')),0),0)::numeric(18,2) unclassified_excess
from public.bf_customer_fund_cases c;

revoke all on function public.bf_cf_submit_setoran_flow(uuid,text,text,numeric,date,text,text,jsonb,boolean,text,text) from public,anon;
revoke all on function public.bf_cf_decide_setoran_commission(uuid,text,numeric,text,text) from public,anon;
grant execute on function public.bf_cf_submit_setoran_flow(uuid,text,text,numeric,date,text,text,jsonb,boolean,text,text) to authenticated;
grant execute on function public.bf_cf_decide_setoran_commission(uuid,text,numeric,text,text) to authenticated;
