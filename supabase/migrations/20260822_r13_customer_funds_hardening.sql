-- Bintang Frozen V26 / R13 — Customer Funds hardening
-- ADDITIVE / REVERSIBLE BY FUNCTION DROP. Apply after 20260822_r13_customer_funds_control.sql.
-- Intended for non-production verification first.

begin;

create or replace function public.bf_cfc_update_entrusted_note(
  p_note uuid,
  p_customer_id text,
  p_customer_name text,
  p_third_party_name text,
  p_product_ref text,
  p_product_name text,
  p_total_qty numeric,
  p_bf_qty numeric,
  p_entrusted_qty numeric,
  p_total_value numeric,
  p_bf_right numeric,
  p_party2_right numeric,
  p_kasir_ref text,
  p_note_text text,
  p_reason text
)
returns public.bf_entrusted_notes
language plpgsql security definer
set search_path=public
as $$
declare
  oldr public.bf_entrusted_notes;
  r public.bf_entrusted_notes;
begin
  perform public.bf_cfc_require_admin_or_owner();
  if nullif(btrim(p_reason),'') is null then
    raise exception 'CFC_REASON_REQUIRED';
  end if;

  select * into oldr
  from public.bf_entrusted_notes
  where id=p_note
  for update;

  if oldr.id is null then raise exception 'CFC_NOTE_NOT_FOUND'; end if;
  if oldr.approval_status='REVERSED' then raise exception 'CFC_NOTE_REVERSED'; end if;
  if p_total_qty <> p_bf_qty + p_entrusted_qty then raise exception 'CFC_INVALID_QTY_SPLIT'; end if;
  if p_total_value <> p_bf_right + p_party2_right then raise exception 'CFC_INVALID_VALUE_SPLIT'; end if;

  update public.bf_entrusted_notes
     set customer_id=nullif(btrim(p_customer_id),''),
         customer_name_snapshot=btrim(p_customer_name),
         third_party_name=btrim(p_third_party_name),
         product_ref=nullif(btrim(p_product_ref),''),
         product_name=btrim(p_product_name),
         total_qty=p_total_qty,
         bf_qty=p_bf_qty,
         entrusted_qty=p_entrusted_qty,
         total_note_value=p_total_value,
         bf_right=p_bf_right,
         party2_right=p_party2_right,
         kasir_pintar_ref=nullif(btrim(p_kasir_ref),''),
         note=p_note_text,
         updated_by=auth.uid()
   where id=p_note
   returning * into r;

  perform public.bf_cfc_event(
    r.case_id,
    'ENTRUSTED_NOTE_UPDATED',
    p_reason,
    to_jsonb(oldr),
    to_jsonb(r),
    r.id::text
  );
  return r;
end;
$$;

create or replace function public.bf_cfc_reverse_payment(p_payment uuid,p_reason text)
returns public.bf_customer_fund_payments
language plpgsql security definer
set search_path=public
as $$
declare
  oldp public.bf_customer_fund_payments;
  r public.bf_customer_fund_payments;
  o public.bf_customer_fund_obligations;
begin
  perform public.bf_cfc_require_owner();
  if nullif(btrim(p_reason),'') is null then raise exception 'CFC_REASON_REQUIRED'; end if;

  select * into oldp
  from public.bf_customer_fund_payments
  where id=p_payment
  for update;

  if oldp.id is null then raise exception 'CFC_PAYMENT_NOT_FOUND'; end if;
  if oldp.status<>'VERIFIED' then raise exception 'CFC_ONLY_VERIFIED_PAYMENT_REVERSAL'; end if;

  select * into o
  from public.bf_customer_fund_obligations
  where id=oldp.obligation_id
  for update;

  if o.id is null then raise exception 'CFC_OBLIGATION_NOT_FOUND'; end if;

  update public.bf_customer_fund_payments
     set status='REVERSED',
         verification_note=concat_ws(E'\n',nullif(verification_note,''),'[REVERSAL] '||btrim(p_reason))
   where id=p_payment
   returning * into r;

  update public.bf_customer_fund_obligations
     set status='BELUM_DIBAYAR'
   where id=o.id;

  perform public.bf_cfc_event(
    r.case_id,
    'PAYMENT_REVERSAL_CREATED',
    p_reason,
    to_jsonb(oldp),
    to_jsonb(r),
    r.id::text
  );
  return r;
end;
$$;

create or replace function public.bf_cfc_reverse_transfer(p_transfer uuid,p_reason text)
returns public.bf_customer_fund_transfers
language plpgsql security definer
set search_path=public
as $$
declare
  oldr public.bf_customer_fund_transfers;
  r public.bf_customer_fund_transfers;
begin
  perform public.bf_cfc_require_owner();
  if nullif(btrim(p_reason),'') is null then raise exception 'CFC_REASON_REQUIRED'; end if;

  select * into oldr
  from public.bf_customer_fund_transfers
  where id=p_transfer
  for update;

  if oldr.id is null then raise exception 'CFC_TRANSFER_NOT_FOUND'; end if;
  if oldr.reconciliation_status='REVERSED' then raise exception 'CFC_TRANSFER_ALREADY_REVERSED'; end if;

  if exists(
    select 1
    from public.bf_customer_fund_obligations o
    where o.source_transfer_id=oldr.id
      and o.status not in ('REVERSED','CORRECTED')
  ) then
    raise exception 'CFC_TRANSFER_HAS_ACTIVE_OBLIGATION';
  end if;

  update public.bf_customer_fund_transfers
     set reconciliation_status='REVERSED',
         reconciliation_note=concat_ws(E'\n',nullif(reconciliation_note,''),'[REVERSAL] '||btrim(p_reason)),
         reconciled_by=auth.uid(),
         reconciled_at=now()
   where id=p_transfer
   returning * into r;

  perform public.bf_cfc_event(
    r.case_id,
    'TRANSFER_REVERSED',
    p_reason,
    to_jsonb(oldr),
    to_jsonb(r),
    r.id::text
  );
  return r;
end;
$$;

grant execute on function public.bf_cfc_update_entrusted_note(uuid,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text,text) to authenticated;
grant execute on function public.bf_cfc_reverse_payment(uuid,text) to authenticated;
grant execute on function public.bf_cfc_reverse_transfer(uuid,text) to authenticated;

commit;
