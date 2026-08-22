-- R13 integrated Setoran split payment + daily cash reconciliation.
-- Existing-base-first: extends bf_customer_fund_cases and bf_cash_reconciliations.
-- No second Setoran writer, no second cash balance, no Customer Setoran cash-in.

begin;

-- ================================================================
-- A. SETORAN PAYMENT COMPONENTS (derived financial snapshot only)
-- ================================================================

alter table public.bf_customer_fund_cases
  add column if not exists payment_components jsonb not null default '[]'::jsonb;

alter table public.bf_customer_fund_cases
  drop constraint if exists bf_cf_payment_components_array;
alter table public.bf_customer_fund_cases
  add constraint bf_cf_payment_components_array
  check (jsonb_typeof(payment_components)='array');

create or replace function public.bf_cf_payment_components_total(p_components jsonb)
returns numeric
language plpgsql immutable
set search_path=public
as $$
declare
  item jsonb;
  amount_value numeric;
  method_value text;
  total_value numeric:=0;
begin
  if p_components is null or jsonb_typeof(p_components)<>'array' or jsonb_array_length(p_components)=0 then
    raise exception 'CF_PAYMENT_COMPONENTS_REQUIRED';
  end if;
  for item in select value from jsonb_array_elements(p_components)
  loop
    method_value:=upper(coalesce(nullif(btrim(item->>'method'),''),''));
    if method_value not in ('TUNAI','TRANSFER','QRIS') then
      raise exception 'CF_INVALID_PAYMENT_COMPONENT_METHOD';
    end if;
    begin
      amount_value:=(item->>'amount')::numeric;
    exception when others then
      raise exception 'CF_INVALID_PAYMENT_COMPONENT_AMOUNT';
    end;
    if coalesce(amount_value,0)<=0 then
      raise exception 'CF_INVALID_PAYMENT_COMPONENT_AMOUNT';
    end if;
    if method_value='TRANSFER' and nullif(btrim(item->>'destination_account'),'') is null then
      raise exception 'CF_PAYMENT_COMPONENT_ACCOUNT_REQUIRED';
    end if;
    total_value:=total_value+amount_value;
  end loop;
  return total_value;
end $$;

-- New canonical backend financial submit. Old bf_cf_submit_setoran_flow below
-- becomes a compatibility wrapper and no longer owns a separate write path.
create or replace function public.bf_cf_submit_setoran(
  p_case uuid,
  p_customer_id text,
  p_customer_name text,
  p_gross numeric,
  p_transfer_date date,
  p_payment_components jsonb,
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
  component_total numeric;
  diff numeric;
  component_count integer;
  method_code text;
  destination text;
begin
  perform public.bf_nt_require_admin_or_owner();
  select * into c0 from public.bf_customer_fund_cases where id=p_case for update;
  if c0.id is null then raise exception 'CF_CASE_NOT_FOUND'; end if;
  if c0.reconciliation_status in ('REVERSED','COMMISSION_APPROVED') then raise exception 'CF_CASE_LOCKED'; end if;
  if exists(
    select 1 from public.bf_customer_commission_obligations o
    join public.bf_customer_fund_classifications q on q.id=o.classification_id
    where q.case_id=p_case and o.status<>'REVERSED'
  ) then raise exception 'CF_CASE_HAS_COMMISSION_OBLIGATION'; end if;
  if nullif(btrim(p_customer_id),'') is null or nullif(btrim(p_customer_name),'') is null or coalesce(p_gross,0)<=0 then
    raise exception 'CF_REQUIRED_FIELD';
  end if;

  component_total:=public.bf_cf_payment_components_total(p_payment_components);
  if component_total<>p_gross then raise exception 'CF_PAYMENT_COMPONENT_TOTAL_MISMATCH'; end if;
  note_total:=public.bf_cf_note_amount_total(p_note_amounts);
  diff:=p_gross-note_total;
  component_count:=jsonb_array_length(p_payment_components);
  if component_count=1 then
    method_code:=upper(p_payment_components->0->>'method');
    destination:=nullif(btrim(p_payment_components->0->>'destination_account'),'');
  else
    method_code:='MIXED';
    destination:=null;
  end if;

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
      payment_method=method_code,
      payment_method_code=method_code,
      destination_account=destination,
      payment_components=p_payment_components,
      settled_note_amounts=p_note_amounts,
      settled_note_total=note_total,
      flow_mode='SETORAN_GUIDED',
      reconciliation_status=case when coalesce(p_request_commission,false) then 'COMMISSION_PENDING_OWNER' else 'NO_OWNER_REQUIRED' end,
      difference_amount=greatest(diff,0),
      difference_type='NONE',fee_bearer='NONE',
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
    'payment_components',c.payment_components,
    'classification_id',case when x.id is null then null else x.id end,
    'classification_status',case when x.id is null then null else x.status end
  );
end $$;

-- Backward-compatible existing RPC. It delegates to the canonical function above.
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
begin
  return public.bf_cf_submit_setoran(
    p_case,p_customer_id,p_customer_name,p_gross,p_transfer_date,
    jsonb_build_array(jsonb_build_object(
      'method',upper(coalesce(nullif(btrim(p_payment_method),''),'TUNAI')),
      'amount',p_gross,
      'destination_account',nullif(btrim(p_destination_account),'')
    )),
    p_note_amounts,p_request_commission,p_agreement,p_idempotency
  );
end $$;

-- Owner controlled Setoran cancellation. No hard delete and no silent orphaning.
create or replace function public.bf_cf_cancel_setoran(
  p_source_setoran_id text,
  p_reason text,
  p_expected_revision bigint default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  c0 public.bf_customer_fund_cases;
  c public.bf_customer_fund_cases;
begin
  perform public.bf_nt_require_owner();
  if nullif(btrim(p_source_setoran_id),'') is null or nullif(btrim(p_reason),'') is null then
    raise exception 'CF_CANCEL_REASON_REQUIRED';
  end if;
  select * into c0 from public.bf_customer_fund_cases where source_setoran_id=p_source_setoran_id for update;
  if c0.id is null then
    return jsonb_build_object('status','NO_CASE','source_setoran_id',p_source_setoran_id);
  end if;
  if c0.reconciliation_status='REVERSED' then
    return jsonb_build_object('status','REVERSED','case_id',c0.id,'case_revision',c0.revision);
  end if;
  if p_expected_revision is not null and c0.revision<>p_expected_revision then
    raise exception 'CF_STALE_REVISION';
  end if;

  if exists(select 1 from public.bf_customer_fund_allocations where case_id=c0.id and status='CONFIRMED') then
    raise exception 'CF_CANCEL_REVERSE_CONFIRMED_ALLOCATIONS_FIRST';
  end if;
  if exists(select 1 from public.bf_customer_fund_classifications where case_id=c0.id and status='APPROVED') then
    raise exception 'CF_CANCEL_REVERSE_APPROVED_CLASSIFICATION_FIRST';
  end if;
  if exists(
    select 1 from public.bf_customer_commission_obligations o
    join public.bf_customer_fund_classifications x on x.id=o.classification_id
    where x.case_id=c0.id and o.status<>'REVERSED'
  ) then raise exception 'CF_CANCEL_REVERSE_COMMISSION_FIRST'; end if;
  if exists(
    select 1 from public.bf_customer_refund_obligations o
    join public.bf_customer_fund_classifications x on x.id=o.classification_id
    where x.case_id=c0.id and o.status<>'REVERSED'
  ) then raise exception 'CF_CANCEL_REVERSE_REFUND_FIRST'; end if;
  if exists(
    select 1 from public.bf_customer_deposit_ledger d
    join public.bf_customer_fund_classifications x on x.id=d.classification_id
    where x.case_id=c0.id and d.status='POSTED'
  ) then raise exception 'CF_CANCEL_REVERSE_DEPOSIT_FIRST'; end if;

  update public.bf_customer_fund_allocations
    set status='REVERSED',revision=revision+1,correction_reason=btrim(p_reason)
    where case_id=c0.id and status in ('PROPOSED','CORRECTION_REQUIRED');
  update public.bf_customer_fund_classifications
    set status='REVERSED',decision_note=btrim(p_reason),decided_by=auth.uid(),decided_at=now()
    where case_id=c0.id and status in ('PENDING_OWNER','CORRECTION_REQUIRED','REJECTED');

  update public.bf_customer_fund_cases
  set reconciliation_status='REVERSED',
      difference_amount=0,difference_type='NONE',fee_bearer='NONE',
      note=concat_ws(E'\n',nullif(note,''),'[SETORAN DIBATALKAN] '||btrim(p_reason)),
      revision=revision+1,updated_by=auth.uid(),updated_at=now()
  where id=c0.id returning * into c;

  perform public.bf_cf_event(c.id,'SETORAN_REVERSED',p_reason,to_jsonb(c0),to_jsonb(c),'case',c.id::text);
  return jsonb_build_object('status','REVERSED','case_id',c.id,'case_revision',c.revision);
end $$;

-- ================================================================
-- B. ONE DAILY CASH RECONCILIATION ON EXISTING TABLE
-- ================================================================

alter table public.bf_cash_reconciliations
  add column if not exists store_code text,
  add column if not exists expense_source_revision bigint,
  add column if not exists expense_source_items jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists submitted_by uuid,
  add column if not exists submitted_at timestamptz,
  add column if not exists review_note text,
  add column if not exists revision bigint not null default 1;

update public.bf_cash_reconciliations
set created_by=coalesce(created_by,verified_by),
    submitted_by=coalesce(submitted_by,verified_by),
    submitted_at=coalesce(submitted_at,verified_at),
    store_code=coalesce(store_code,'BINTANG-Y70M')
where created_by is null or submitted_by is null or submitted_at is null or store_code is null;

alter table public.bf_cash_reconciliations
  alter column verified_by drop not null,
  alter column verified_at drop not null,
  alter column verified_at drop default;

alter table public.bf_cash_reconciliations
  drop constraint if exists bf_cash_reconciliations_status_check;
alter table public.bf_cash_reconciliations
  add constraint bf_cash_reconciliations_status_check
  check (status in ('DRAFT','SUBMITTED','VERIFIED','CORRECTION_REQUIRED','INVESTIGATION','REVERSED'));

alter table public.bf_cash_reconciliations
  drop constraint if exists bf_cash_reconciliations_revision_check;
alter table public.bf_cash_reconciliations
  add constraint bf_cash_reconciliations_revision_check check(revision>0);

create or replace function public.bf_cash_expense_snapshot(p_date date,p_store_code text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  raw_value text;
  source_revision bigint;
  arr jsonb;
  item jsonb;
  result_items jsonb:='[]'::jsonb;
  item_date date;
  amount_value numeric;
  total_value numeric:=0;
  source_id text;
begin
  perform public.bf_nt_require_admin_or_owner();
  if p_date is null or nullif(btrim(p_store_code),'') is null then raise exception 'CASH_INVALID_SOURCE'; end if;
  -- Existing application source is explicitly BINTANG-Y70M in cloud-sync.js.
  -- Refuse arbitrary store-code access from SECURITY DEFINER RPC.
  if p_store_code<>'BINTANG-Y70M' then raise exception 'CASH_STORE_SCOPE_DENIED'; end if;
  select value,revision into raw_value,source_revision
  from public.bf_state_items where store_code=p_store_code and state_key='bf_expenses';
  if raw_value is null then
    return jsonb_build_object('store_code',p_store_code,'revision',null,'date',p_date,'total',0,'items','[]'::jsonb);
  end if;
  begin arr:=raw_value::jsonb; exception when others then raise exception 'CASH_EXPENSE_SOURCE_INVALID_JSON'; end;
  if jsonb_typeof(arr)<>'array' then raise exception 'CASH_EXPENSE_SOURCE_NOT_ARRAY'; end if;

  for item in select value from jsonb_array_elements(arr)
  loop
    if nullif(item->>'deleted_at','') is not null then continue; end if;
    begin item_date:=coalesce(nullif(item->>'tanggal',''),nullif(item->>'date',''))::date;
    exception when others then continue; end;
    if item_date<>p_date then continue; end if;
    begin amount_value:=coalesce(nullif(item->>'nominal',''),nullif(item->>'jumlah',''),nullif(item->>'amount',''))::numeric;
    exception when others then continue; end;
    if coalesce(amount_value,0)<=0 then continue; end if;
    source_id:=coalesce(nullif(item->>'id',''),nullif(item->>'_bf_uid',''),md5(item::text));
    result_items:=result_items||jsonb_build_array(jsonb_build_object(
      'source_type','CATATAN_PENGELUARAN','source_id',source_id,'date',item_date,
      'category',coalesce(item->>'kategori',item->>'category','Pengeluaran'),
      'description',coalesce(item->>'keterangan',item->>'deskripsi',item->>'description',''),
      'amount',amount_value,'method',coalesce(item->>'metode',item->>'payment_method','')
    ));
    total_value:=total_value+amount_value;
  end loop;
  return jsonb_build_object('store_code',p_store_code,'revision',source_revision,'date',p_date,'total',total_value,'items',result_items);
end $$;

create or replace function public.bf_cash_get_expense_snapshot(p_date date,p_store_code text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  return public.bf_cash_expense_snapshot(p_date,p_store_code);
end $$;

create or replace function public.bf_cash_submit_reconciliation(
  p_date date,
  p_store_code text,
  p_pos_cash numeric,
  p_opening numeric,
  p_owner_topup numeric,
  p_owner_withdrawal numeric,
  p_other_in numeric,
  p_other_out numeric,
  p_physical numeric,
  p_note text,
  p_expected_revision bigint default null
) returns public.bf_cash_reconciliations
language plpgsql
security definer
set search_path=public
as $$
declare
  expense jsonb;
  expense_total numeric;
  expense_revision bigint;
  dt numeric; cm numeric; rf numeric; dr numeric;
  expected numeric;
  r0 public.bf_cash_reconciliations;
  r public.bf_cash_reconciliations;
begin
  perform public.bf_nt_require_admin_or_owner();
  if p_date is null or least(coalesce(p_pos_cash,0),coalesce(p_opening,0),coalesce(p_owner_topup,0),coalesce(p_owner_withdrawal,0),coalesce(p_other_in,0),coalesce(p_other_out,0),coalesce(p_physical,0))<0 then
    raise exception 'CASH_INVALID_RECONCILIATION';
  end if;
  expense:=public.bf_cash_expense_snapshot(p_date,p_store_code);
  expense_total:=coalesce((expense->>'total')::numeric,0);
  expense_revision:=nullif(expense->>'revision','')::bigint;

  -- Customer Setoran is intentionally NOT included as cash-in.
  select coalesce(sum(amount),0) into dt from public.bf_cash_movements where movement_date=p_date and direction='OUT' and movement_type='DANA_TITIPAN' and status='POSTED';
  select coalesce(sum(amount),0) into cm from public.bf_cash_movements where movement_date=p_date and direction='OUT' and movement_type='CUSTOMER_COMMISSION' and status='POSTED';
  select coalesce(sum(amount),0) into rf from public.bf_cash_movements where movement_date=p_date and direction='OUT' and movement_type='CUSTOMER_REFUND' and status='POSTED';
  select coalesce(sum(amount),0) into dr from public.bf_cash_movements where movement_date=p_date and direction='OUT' and movement_type='CUSTOMER_DEPOSIT_REFUND' and status='POSTED';
  expected:=coalesce(p_opening,0)+coalesce(p_pos_cash,0)+coalesce(p_owner_topup,0)+coalesce(p_other_in,0)
            -coalesce(p_owner_withdrawal,0)-expense_total-dt-cm-rf-dr-coalesce(p_other_out,0);

  select * into r0 from public.bf_cash_reconciliations where reconciliation_date=p_date for update;
  if r0.id is not null then
    if r0.status='VERIFIED' then raise exception 'CASH_RECONCILIATION_FINAL_LOCKED'; end if;
    if p_expected_revision is not null and r0.revision<>p_expected_revision then raise exception 'CASH_STALE_REVISION'; end if;
    update public.bf_cash_reconciliations
      set store_code=p_store_code,pos_cash_sales=coalesce(p_pos_cash,0),opening_cash=coalesce(p_opening,0),
          owner_topup=coalesce(p_owner_topup,0),owner_withdrawal=coalesce(p_owner_withdrawal,0),
          expense_total_snapshot=expense_total,expense_source_revision=expense_revision,expense_source_items=expense->'items',
          entrusted_payout_total=dt,commission_payout_total=cm,refund_payout_total=rf,deposit_refund_total=dr,
          other_cash_in=coalesce(p_other_in,0),other_cash_out=coalesce(p_other_out,0),expected_cash=expected,
          physical_cash=coalesce(p_physical,0),difference=coalesce(p_physical,0)-expected,note=p_note,
          status='SUBMITTED',submitted_by=auth.uid(),submitted_at=now(),verified_by=null,verified_at=null,review_note=null,
          revision=revision+1
      where id=r0.id returning * into r;
  else
    insert into public.bf_cash_reconciliations(
      reconciliation_date,store_code,pos_cash_sales,opening_cash,owner_topup,owner_withdrawal,
      expense_total_snapshot,expense_source_revision,expense_source_items,
      entrusted_payout_total,commission_payout_total,refund_payout_total,deposit_refund_total,
      other_cash_in,other_cash_out,expected_cash,physical_cash,difference,note,status,
      created_by,submitted_by,submitted_at,verified_by,verified_at,revision
    ) values(
      p_date,p_store_code,coalesce(p_pos_cash,0),coalesce(p_opening,0),coalesce(p_owner_topup,0),coalesce(p_owner_withdrawal,0),
      expense_total,expense_revision,expense->'items',dt,cm,rf,dr,
      coalesce(p_other_in,0),coalesce(p_other_out,0),expected,coalesce(p_physical,0),coalesce(p_physical,0)-expected,p_note,'SUBMITTED',
      auth.uid(),auth.uid(),now(),null,null,1
    ) returning * into r;
  end if;
  return r;
end $$;

create or replace function public.bf_cash_review_reconciliation(
  p_reconciliation uuid,
  p_action text,
  p_note text,
  p_expected_revision bigint
) returns public.bf_cash_reconciliations
language plpgsql
security definer
set search_path=public
as $$
declare r0 public.bf_cash_reconciliations;r public.bf_cash_reconciliations;action_value text:=upper(coalesce(p_action,''));
begin
  perform public.bf_nt_require_owner();
  select * into r0 from public.bf_cash_reconciliations where id=p_reconciliation for update;
  if r0.id is null then raise exception 'CASH_RECONCILIATION_NOT_FOUND'; end if;
  if r0.revision<>p_expected_revision then raise exception 'CASH_STALE_REVISION'; end if;
  if r0.status not in ('SUBMITTED','CORRECTION_REQUIRED','INVESTIGATION') then raise exception 'CASH_RECONCILIATION_NOT_REVIEWABLE'; end if;
  if action_value not in ('APPROVE','CORRECTION','INVESTIGATE') then raise exception 'CASH_INVALID_REVIEW_ACTION'; end if;
  if action_value in ('CORRECTION','INVESTIGATE') and nullif(btrim(p_note),'') is null then raise exception 'CASH_REVIEW_NOTE_REQUIRED'; end if;
  update public.bf_cash_reconciliations
    set status=case action_value when 'APPROVE' then 'VERIFIED' when 'CORRECTION' then 'CORRECTION_REQUIRED' else 'INVESTIGATION' end,
        verified_by=case when action_value='APPROVE' then auth.uid() else null end,
        verified_at=case when action_value='APPROVE' then now() else null end,
        review_note=p_note,revision=revision+1
    where id=r0.id returning * into r;
  return r;
end $$;

-- Any posted cash movement change makes a submitted/final reconciliation stale.
create or replace function public.bf_nt_mark_cash_reconciliation_stale(p_date date,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
begin
 update public.bf_cash_reconciliations
 set status='CORRECTION_REQUIRED',
     review_note=concat_ws(E'\n',nullif(review_note,''),'[PERUBAHAN SUMBER] '||coalesce(p_reason,'Pergerakan kas berubah setelah rekonsiliasi.')),
     verified_by=null,verified_at=null,revision=revision+1
 where reconciliation_date=p_date and status in ('VERIFIED','SUBMITTED');
end $$;

-- Legacy RPCs remain callable for backward compatibility but delegate to one
-- canonical reconciliation writer and ignore the old manual expense argument.
create or replace function public.bf_cf_reconcile_cash_day(
 p_date date,p_pos_cash numeric,p_opening numeric,p_owner_topup numeric,p_owner_withdrawal numeric,
 p_expense numeric,p_other_in numeric,p_other_out numeric,p_physical numeric,p_note text
) returns public.bf_cash_reconciliations
language plpgsql security definer set search_path=public as $$
declare r public.bf_cash_reconciliations;
begin
 perform public.bf_nt_require_owner();
 r:=public.bf_cash_submit_reconciliation(p_date,'BINTANG-Y70M',p_pos_cash,p_opening,p_owner_topup,p_owner_withdrawal,p_other_in,p_other_out,p_physical,p_note,null);
 return public.bf_cash_review_reconciliation(r.id,'APPROVE','Legacy RPC delegated to canonical daily reconciliation',r.revision);
end $$;

create or replace function public.bf_nt_reconcile_cash(
 p_date date,p_pos_cash numeric,p_physical numeric,p_expense_snapshot numeric,
 p_opening numeric default 0,p_topup numeric default 0,p_withdrawal numeric default 0,
 p_other_in numeric default 0,p_other_out numeric default 0,p_note text default null
) returns public.bf_cash_reconciliations
language plpgsql security definer set search_path=public as $$
declare r public.bf_cash_reconciliations;
begin
 perform public.bf_nt_require_owner();
 r:=public.bf_cash_submit_reconciliation(p_date,'BINTANG-Y70M',p_pos_cash,p_opening,p_topup,p_withdrawal,p_other_in,p_other_out,p_physical,p_note,null);
 return public.bf_cash_review_reconciliation(r.id,'APPROVE','Legacy RPC delegated to canonical daily reconciliation',r.revision);
end $$;

commit;
