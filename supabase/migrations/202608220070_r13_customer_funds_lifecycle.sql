-- R13 Customer Funds Control — payout / deposit / cash lifecycle
-- UAT ONLY. ADDITIVE / REVERSIBLE. DO NOT APPLY TO PRODUCTION AUTOMATICALLY.
-- Depends on 20260822_r13_customer_funds_foundation.sql and Nota/Dana Titipan cash core.
begin;

create or replace view public.bf_customer_commission_balances with (security_invoker=true) as
select o.id obligation_id,o.commission_no,o.customer_id,o.customer_name_snapshot,o.obligation_amount,o.status,
  coalesce((select sum(a.amount) from public.bf_customer_fund_payout_allocations a join public.bf_customer_fund_payouts p on p.id=a.payout_id where a.obligation_type='CUSTOMER_COMMISSION' and a.obligation_id=o.id and p.status in ('PENDING_OWNER','VERIFIED','CORRECTION_REQUIRED')),0)::numeric(18,2) payout_committed,
  coalesce((select sum(t.amount) from public.bf_customer_fund_liability_transfers t where t.source_type='CUSTOMER_COMMISSION' and t.source_ref_id=o.id::text and t.status in ('PENDING_OWNER','POSTED','CORRECTION_REQUIRED')),0)::numeric(18,2) transfer_committed,
  greatest(o.obligation_amount-
    coalesce((select sum(a.amount) from public.bf_customer_fund_payout_allocations a join public.bf_customer_fund_payouts p on p.id=a.payout_id where a.obligation_type='CUSTOMER_COMMISSION' and a.obligation_id=o.id and p.status in ('PENDING_OWNER','VERIFIED','CORRECTION_REQUIRED')),0)-
    coalesce((select sum(t.amount) from public.bf_customer_fund_liability_transfers t where t.source_type='CUSTOMER_COMMISSION' and t.source_ref_id=o.id::text and t.status in ('PENDING_OWNER','POSTED','CORRECTION_REQUIRED')),0),0)::numeric(18,2) available_amount
from public.bf_customer_commission_obligations o where o.status<>'REVERSED';

create or replace view public.bf_customer_refund_balances with (security_invoker=true) as
select o.id obligation_id,o.refund_no,o.customer_id,o.customer_name_snapshot,o.obligation_amount,o.status,
  coalesce((select sum(a.amount) from public.bf_customer_fund_payout_allocations a join public.bf_customer_fund_payouts p on p.id=a.payout_id where a.obligation_type='CUSTOMER_REFUND' and a.obligation_id=o.id and p.status in ('PENDING_OWNER','VERIFIED','CORRECTION_REQUIRED')),0)::numeric(18,2) payout_committed,
  coalesce((select sum(t.amount) from public.bf_customer_fund_liability_transfers t where t.source_type='CUSTOMER_REFUND' and t.source_ref_id=o.id::text and t.status in ('PENDING_OWNER','POSTED','CORRECTION_REQUIRED')),0)::numeric(18,2) transfer_committed,
  greatest(o.obligation_amount-
    coalesce((select sum(a.amount) from public.bf_customer_fund_payout_allocations a join public.bf_customer_fund_payouts p on p.id=a.payout_id where a.obligation_type='CUSTOMER_REFUND' and a.obligation_id=o.id and p.status in ('PENDING_OWNER','VERIFIED','CORRECTION_REQUIRED')),0)-
    coalesce((select sum(t.amount) from public.bf_customer_fund_liability_transfers t where t.source_type='CUSTOMER_REFUND' and t.source_ref_id=o.id::text and t.status in ('PENDING_OWNER','POSTED','CORRECTION_REQUIRED')),0),0)::numeric(18,2) available_amount
from public.bf_customer_refund_obligations o where o.status<>'REVERSED';

create or replace view public.bf_customer_sales_settlements with (security_invoker=true) as
select s.id sales_ref_id,s.customer_id,s.customer_name_snapshot,s.external_ref,s.note_amount,s.status,
  coalesce((select sum(a.amount) from public.bf_customer_fund_allocations a where a.sales_ref_id=s.id and a.status='CONFIRMED'),0)::numeric(18,2) transfer_allocated,
  coalesce((select sum(d.amount) from public.bf_customer_deposit_ledger d where d.target_sales_ref_id=s.id and d.entry_type='USED' and d.status='POSTED'),0)::numeric(18,2) deposit_used,
  greatest(s.note_amount-
    coalesce((select sum(a.amount) from public.bf_customer_fund_allocations a where a.sales_ref_id=s.id and a.status='CONFIRMED'),0)-
    coalesce((select sum(d.amount) from public.bf_customer_deposit_ledger d where d.target_sales_ref_id=s.id and d.entry_type='USED' and d.status in ('PENDING_OWNER','POSTED','CORRECTION_REQUIRED')),0),0)::numeric(18,2) remaining_amount
from public.bf_customer_fund_sales_refs s where s.status<>'REVERSED';

create or replace function public.bf_cf_refresh_obligation_status(p_type text,p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare total numeric;settled numeric;
begin
 if p_type='CUSTOMER_COMMISSION' then
   select obligation_amount into total from public.bf_customer_commission_obligations where id=p_id for update;
   if total is null then raise exception 'CF_OBLIGATION_NOT_FOUND';end if;
   select coalesce(sum(a.amount) filter(where p.status='VERIFIED'),0)+coalesce((select sum(t.amount) from public.bf_customer_fund_liability_transfers t where t.source_type='CUSTOMER_COMMISSION' and t.source_ref_id=p_id::text and t.status='POSTED'),0)
   into settled from public.bf_customer_fund_payout_allocations a join public.bf_customer_fund_payouts p on p.id=a.payout_id where a.obligation_type='CUSTOMER_COMMISSION' and a.obligation_id=p_id;
   update public.bf_customer_commission_obligations set status=case when settled<=0 then 'OUTSTANDING' when settled>=total then 'FULLY_PAID' else 'PARTIALLY_PAID' end where id=p_id and status<>'REVERSED';
 elsif p_type='CUSTOMER_REFUND' then
   select obligation_amount into total from public.bf_customer_refund_obligations where id=p_id for update;
   if total is null then raise exception 'CF_OBLIGATION_NOT_FOUND';end if;
   select coalesce(sum(a.amount) filter(where p.status='VERIFIED'),0)+coalesce((select sum(t.amount) from public.bf_customer_fund_liability_transfers t where t.source_type='CUSTOMER_REFUND' and t.source_ref_id=p_id::text and t.status='POSTED'),0)
   into settled from public.bf_customer_fund_payout_allocations a join public.bf_customer_fund_payouts p on p.id=a.payout_id where a.obligation_type='CUSTOMER_REFUND' and a.obligation_id=p_id;
   update public.bf_customer_refund_obligations set status=case when settled<=0 then 'OUTSTANDING' when settled>=total then 'FULLY_PAID' else 'PARTIALLY_PAID' end where id=p_id and status<>'REVERSED';
 else raise exception 'CF_INVALID_OBLIGATION_TYPE';end if;
end $$;

create or replace function public.bf_cf_create_payout(
 p_type text,p_customer_id text,p_customer_name text,p_amount numeric,p_date date,p_recipient text,p_agreement text,p_signature text,p_signature_strokes integer,p_photos jsonb,p_source_cash text,p_allocations jsonb,p_idempotency text
) returns public.bf_customer_fund_payouts language plpgsql security definer set search_path=public as $$
declare p public.bf_customer_fund_payouts;item jsonb;oid uuid;a numeric;sum_alloc numeric:=0;avail numeric;dep numeric;
begin
 perform public.bf_nt_require_admin_or_owner();
 if p_type not in ('CUSTOMER_COMMISSION','CUSTOMER_REFUND','CUSTOMER_DEPOSIT_REFUND') then raise exception 'CF_INVALID_PAYOUT_TYPE';end if;
 if nullif(btrim(p_customer_id),'') is null or nullif(btrim(p_customer_name),'') is null or coalesce(p_amount,0)<=0 or p_date is null then raise exception 'CF_INVALID_PAYOUT';end if;
 if nullif(btrim(p_recipient),'') is null or nullif(btrim(p_agreement),'') is null or length(coalesce(p_signature,''))<20 or coalesce(p_signature_strokes,0)<=0 then raise exception 'CF_PAYOUT_RECEIPT_REQUIRED';end if;
 if nullif(btrim(p_idempotency),'') is null then raise exception 'CF_IDEMPOTENCY_REQUIRED';end if;
 select * into p from public.bf_customer_fund_payouts where idempotency_key=p_idempotency;if p.id is not null then return p;end if;
 if p_type='CUSTOMER_DEPOSIT_REFUND' then
   if jsonb_typeof(coalesce(p_allocations,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_allocations,'[]'::jsonb))<>0 then raise exception 'CF_DEPOSIT_REFUND_NO_OBLIGATION_ALLOCATIONS';end if;
   select coalesce(available_amount,0) into dep from public.bf_customer_deposit_balances where customer_id=p_customer_id;if coalesce(dep,0)<p_amount then raise exception 'CF_DEPOSIT_REFUND_EXCEEDS_BALANCE';end if;
 else
   if jsonb_typeof(coalesce(p_allocations,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_allocations,'[]'::jsonb))=0 then raise exception 'CF_PAYOUT_ALLOCATIONS_REQUIRED';end if;
   for item in select value from jsonb_array_elements(p_allocations) loop
     oid:=nullif(item->>'obligation_id','')::uuid;a:=coalesce((item->>'amount')::numeric,0);if oid is null or a<=0 then raise exception 'CF_INVALID_PAYOUT_ALLOCATION';end if;
     if p_type='CUSTOMER_COMMISSION' then select available_amount into avail from public.bf_customer_commission_balances where obligation_id=oid and customer_id=p_customer_id;else select available_amount into avail from public.bf_customer_refund_balances where obligation_id=oid and customer_id=p_customer_id;end if;
     if avail is null then raise exception 'CF_OBLIGATION_CUSTOMER_MISMATCH';end if;if a>avail then raise exception 'CF_PAYOUT_EXCEEDS_OBLIGATION';end if;sum_alloc:=sum_alloc+a;
   end loop;if sum_alloc<>p_amount then raise exception 'CF_PAYOUT_ALLOCATION_TOTAL_MISMATCH';end if;
 end if;
 insert into public.bf_customer_fund_payouts(payout_no,customer_id,customer_name_snapshot,payout_type,amount,payment_date,recipient_name,agreement_note,signature_data,signature_strokes,photo_urls,source_cash_label,paid_by,idempotency_key)
 values(public.bf_nt_ref('CFP',nextval('public.bf_cf_payout_seq')),btrim(p_customer_id),btrim(p_customer_name),p_type,p_amount,p_date,btrim(p_recipient),btrim(p_agreement),p_signature,p_signature_strokes,coalesce(p_photos,'[]'::jsonb),coalesce(nullif(btrim(p_source_cash),''),'Kas Penjualan Harian'),auth.uid(),p_idempotency) returning * into p;
 if p_type='CUSTOMER_DEPOSIT_REFUND' then
   insert into public.bf_customer_deposit_ledger(customer_id,customer_name_snapshot,entry_type,amount,source_ref_type,source_ref_id,agreement_note,status,created_by,idempotency_key)
   values(p.customer_id,p.customer_name_snapshot,'REFUNDED',p.amount,'CUSTOMER_FUND_PAYOUT',p.id::text,p.agreement_note,'PENDING_OWNER',auth.uid(),'payout:'||p.id::text||':deposit-refund');
 else
   for item in select value from jsonb_array_elements(p_allocations) loop insert into public.bf_customer_fund_payout_allocations(payout_id,obligation_type,obligation_id,amount) values(p.id,p_type,nullif(item->>'obligation_id','')::uuid,(item->>'amount')::numeric);end loop;
 end if;
 insert into public.bf_cash_movements(movement_date,direction,movement_type,amount,source_ref_type,source_ref_id,description,created_by)
 values(p_date,'OUT',p_type,p_amount,'CUSTOMER_FUND_PAYOUT',p.id::text,'Customer Funds payout '||p.payout_no,auth.uid());
 perform public.bf_nt_mark_cash_reconciliation_stale(p_date,'Customer Funds payout '||p.payout_no||' ditambahkan.');perform public.bf_cf_event(null,'PAYOUT_RECORDED',p_agreement,null,to_jsonb(p),'payout',p.id::text);return p;
end $$;

create or replace function public.bf_cf_review_payout(p_payout uuid,p_action text,p_note text)
returns public.bf_customer_fund_payouts language plpgsql security definer set search_path=public as $$
declare oldp public.bf_customer_fund_payouts;p public.bf_customer_fund_payouts;r record;
begin
 perform public.bf_nt_require_owner();select * into oldp from public.bf_customer_fund_payouts where id=p_payout for update;if oldp.id is null or oldp.status not in ('PENDING_OWNER','CORRECTION_REQUIRED') then raise exception 'CF_PAYOUT_NOT_REVIEWABLE';end if;
 if p_action not in ('VERIFY','CORRECTION') then raise exception 'CF_INVALID_ACTION';end if;if p_action='CORRECTION' and nullif(btrim(p_note),'') is null then raise exception 'CF_REASON_REQUIRED';end if;
 update public.bf_customer_fund_payouts set status=case when p_action='VERIFY' then 'VERIFIED' else 'CORRECTION_REQUIRED' end,verified_by=auth.uid(),verified_at=now(),verification_note=p_note where id=p_payout returning * into p;
 if p.payout_type='CUSTOMER_DEPOSIT_REFUND' and p_action='VERIFY' then update public.bf_customer_deposit_ledger set status='POSTED' where source_ref_type='CUSTOMER_FUND_PAYOUT' and source_ref_id=p.id::text and entry_type='REFUNDED' and status='PENDING_OWNER';end if;
 for r in select distinct obligation_type,obligation_id from public.bf_customer_fund_payout_allocations where payout_id=p.id loop perform public.bf_cf_refresh_obligation_status(r.obligation_type,r.obligation_id);end loop;
 perform public.bf_cf_event(null,case when p_action='VERIFY' then 'PAYOUT_VERIFIED' else 'PAYOUT_CORRECTION_REQUIRED' end,p_note,to_jsonb(oldp),to_jsonb(p),'payout',p.id::text);return p;
end $$;

create or replace function public.bf_cf_reverse_payout(p_payout uuid,p_reason text)
returns public.bf_customer_fund_payouts language plpgsql security definer set search_path=public as $$
declare oldp public.bf_customer_fund_payouts;p public.bf_customer_fund_payouts;r record;
begin
 perform public.bf_nt_require_owner();if nullif(btrim(p_reason),'') is null then raise exception 'CF_REASON_REQUIRED';end if;select * into oldp from public.bf_customer_fund_payouts where id=p_payout for update;if oldp.id is null or oldp.status='REVERSED' then raise exception 'CF_INVALID_PAYOUT_REVERSAL';end if;
 update public.bf_customer_fund_payouts set status='REVERSED',verified_by=auth.uid(),verified_at=now(),verification_note=concat_ws(E'\n',nullif(verification_note,''),'[REVERSAL] '||btrim(p_reason)) where id=p_payout returning * into p;
 update public.bf_cash_movements set status='REVERSED' where source_ref_type='CUSTOMER_FUND_PAYOUT' and source_ref_id=p.id::text and status='POSTED';update public.bf_customer_deposit_ledger set status='REVERSED' where source_ref_type='CUSTOMER_FUND_PAYOUT' and source_ref_id=p.id::text and entry_type='REFUNDED' and status<>'REVERSED';
 for r in select distinct obligation_type,obligation_id from public.bf_customer_fund_payout_allocations where payout_id=p.id loop perform public.bf_cf_refresh_obligation_status(r.obligation_type,r.obligation_id);end loop;
 perform public.bf_nt_mark_cash_reconciliation_stale(oldp.payment_date,'Reversal Customer Funds payout '||oldp.payout_no||'.');perform public.bf_cf_event(null,'PAYOUT_REVERSED',p_reason,to_jsonb(oldp),to_jsonb(p),'payout',p.id::text);return p;
end $$;

create or replace function public.bf_cf_propose_deposit_use(p_customer_id text,p_sales_ref uuid,p_amount numeric,p_agreement text,p_idempotency text)
returns public.bf_customer_deposit_ledger language plpgsql security definer set search_path=public as $$
declare s public.bf_customer_fund_sales_refs;d public.bf_customer_deposit_ledger;bal numeric;remain numeric;
begin
 perform public.bf_nt_require_admin_or_owner();if coalesce(p_amount,0)<=0 or nullif(btrim(p_agreement),'') is null then raise exception 'CF_INVALID_DEPOSIT_USE';end if;select * into d from public.bf_customer_deposit_ledger where idempotency_key=p_idempotency;if d.id is not null then return d;end if;
 select * into s from public.bf_customer_fund_sales_refs where id=p_sales_ref for update;if s.id is null or s.status<>'VALIDATED' then raise exception 'CF_SALES_REF_NOT_VALIDATED';end if;if s.customer_id<>p_customer_id then raise exception 'CF_CUSTOMER_MISMATCH';end if;
 select coalesce(available_amount,0) into bal from public.bf_customer_deposit_balances where customer_id=p_customer_id;select remaining_amount into remain from public.bf_customer_sales_settlements where sales_ref_id=p_sales_ref;if coalesce(bal,0)<p_amount then raise exception 'CF_DEPOSIT_USE_EXCEEDS_BALANCE';end if;if coalesce(remain,0)<p_amount then raise exception 'CF_DEPOSIT_USE_EXCEEDS_NOTE';end if;
 insert into public.bf_customer_deposit_ledger(customer_id,customer_name_snapshot,entry_type,amount,target_sales_ref_id,source_ref_type,source_ref_id,agreement_note,status,created_by,idempotency_key) values(s.customer_id,s.customer_name_snapshot,'USED',p_amount,s.id,'DEPOSIT_USE',s.id::text,btrim(p_agreement),'PENDING_OWNER',auth.uid(),p_idempotency) returning * into d;return d;
end $$;

create or replace function public.bf_cf_decide_deposit_use(p_entry uuid,p_action text,p_note text)
returns public.bf_customer_deposit_ledger language plpgsql security definer set search_path=public as $$
declare d0 public.bf_customer_deposit_ledger;d public.bf_customer_deposit_ledger;
begin
 perform public.bf_nt_require_owner();select * into d0 from public.bf_customer_deposit_ledger where id=p_entry for update;if d0.id is null or d0.entry_type<>'USED' or d0.status<>'PENDING_OWNER' then raise exception 'CF_DEPOSIT_USE_NOT_PENDING';end if;if p_action not in ('APPROVE','REJECT') then raise exception 'CF_INVALID_ACTION';end if;
 update public.bf_customer_deposit_ledger set status=case when p_action='APPROVE' then 'POSTED' else 'REVERSED' end,agreement_note=concat_ws(E'\n',nullif(agreement_note,''),nullif(p_note,'')) where id=p_entry returning * into d;return d;
end $$;

create or replace function public.bf_cf_propose_liability_transfer(p_customer_id text,p_source_type text,p_source_id uuid,p_amount numeric,p_agreement text,p_idempotency text)
returns public.bf_customer_fund_liability_transfers language plpgsql security definer set search_path=public as $$
declare t public.bf_customer_fund_liability_transfers;avail numeric;cid text;
begin
 perform public.bf_nt_require_admin_or_owner();if p_source_type not in ('CUSTOMER_COMMISSION','CUSTOMER_REFUND') then raise exception 'CF_UNSUPPORTED_TRANSFER_SOURCE';end if;if coalesce(p_amount,0)<=0 or nullif(btrim(p_agreement),'') is null then raise exception 'CF_INVALID_LIABILITY_TRANSFER';end if;select * into t from public.bf_customer_fund_liability_transfers where idempotency_key=p_idempotency;if t.id is not null then return t;end if;
 if p_source_type='CUSTOMER_COMMISSION' then select customer_id,available_amount into cid,avail from public.bf_customer_commission_balances where obligation_id=p_source_id;else select customer_id,available_amount into cid,avail from public.bf_customer_refund_balances where obligation_id=p_source_id;end if;if cid is null or cid<>p_customer_id then raise exception 'CF_CUSTOMER_MISMATCH';end if;if p_amount>coalesce(avail,0) then raise exception 'CF_TRANSFER_EXCEEDS_OBLIGATION';end if;
 insert into public.bf_customer_fund_liability_transfers(customer_id,source_type,source_ref_id,amount,agreement_note,proposed_by,idempotency_key) values(p_customer_id,p_source_type,p_source_id::text,p_amount,btrim(p_agreement),auth.uid(),p_idempotency) returning * into t;return t;
end $$;

create or replace function public.bf_cf_decide_liability_transfer(p_transfer uuid,p_action text,p_note text)
returns public.bf_customer_fund_liability_transfers language plpgsql security definer set search_path=public as $$
declare t0 public.bf_customer_fund_liability_transfers;t public.bf_customer_fund_liability_transfers;nm text;
begin
 perform public.bf_nt_require_owner();select * into t0 from public.bf_customer_fund_liability_transfers where id=p_transfer for update;if t0.id is null or t0.status<>'PENDING_OWNER' then raise exception 'CF_TRANSFER_NOT_PENDING';end if;if p_action not in ('APPROVE','REJECT') then raise exception 'CF_INVALID_ACTION';end if;
 update public.bf_customer_fund_liability_transfers set status=case when p_action='APPROVE' then 'POSTED' else 'REJECTED' end,decided_by=auth.uid(),decided_at=now(),agreement_note=concat_ws(E'\n',agreement_note,nullif(p_note,'')) where id=p_transfer returning * into t;
 if p_action='APPROVE' then if t.source_type='CUSTOMER_COMMISSION' then select customer_name_snapshot into nm from public.bf_customer_commission_obligations where id=t.source_ref_id::uuid;else select customer_name_snapshot into nm from public.bf_customer_refund_obligations where id=t.source_ref_id::uuid;end if;insert into public.bf_customer_deposit_ledger(customer_id,customer_name_snapshot,entry_type,amount,source_ref_type,source_ref_id,agreement_note,status,created_by,idempotency_key) values(t.customer_id,coalesce(nm,t.customer_id),'TRANSFER_IN',t.amount,t.source_type,t.source_ref_id,t.agreement_note,'POSTED',auth.uid(),'liability-transfer:'||t.id::text);perform public.bf_cf_refresh_obligation_status(t.source_type,t.source_ref_id::uuid);end if;return t;
end $$;

create or replace function public.bf_cf_reverse_liability_transfer(p_transfer uuid,p_reason text)
returns public.bf_customer_fund_liability_transfers language plpgsql security definer set search_path=public as $$
declare t0 public.bf_customer_fund_liability_transfers;t public.bf_customer_fund_liability_transfers;
begin
 perform public.bf_nt_require_owner();if nullif(btrim(p_reason),'') is null then raise exception 'CF_REASON_REQUIRED';end if;select * into t0 from public.bf_customer_fund_liability_transfers where id=p_transfer for update;if t0.id is null or t0.status<>'POSTED' then raise exception 'CF_TRANSFER_NOT_REVERSIBLE';end if;
 update public.bf_customer_fund_liability_transfers set status='REVERSED',decided_by=auth.uid(),decided_at=now(),agreement_note=concat_ws(E'\n',agreement_note,'[REVERSAL] '||btrim(p_reason)) where id=p_transfer returning * into t;update public.bf_customer_deposit_ledger set status='REVERSED' where idempotency_key='liability-transfer:'||t.id::text and status='POSTED';perform public.bf_cf_refresh_obligation_status(t.source_type,t.source_ref_id::uuid);return t;
end $$;

create or replace function public.bf_cf_reconcile_cash_day(p_date date,p_pos_cash numeric,p_opening numeric,p_owner_topup numeric,p_owner_withdrawal numeric,p_expense numeric,p_other_in numeric,p_other_out numeric,p_physical numeric,p_note text)
returns public.bf_cash_reconciliations language plpgsql security definer set search_path=public as $$
declare dt numeric;cm numeric;rf numeric;dr numeric;expected numeric;r public.bf_cash_reconciliations;
begin
 perform public.bf_nt_require_owner();if p_date is null or least(coalesce(p_pos_cash,0),coalesce(p_opening,0),coalesce(p_owner_topup,0),coalesce(p_owner_withdrawal,0),coalesce(p_expense,0),coalesce(p_other_in,0),coalesce(p_other_out,0),coalesce(p_physical,0))<0 then raise exception 'CF_INVALID_CASH_RECONCILIATION';end if;
 select coalesce(sum(amount),0) into dt from public.bf_cash_movements where movement_date=p_date and direction='OUT' and movement_type='DANA_TITIPAN' and status='POSTED';select coalesce(sum(amount),0) into cm from public.bf_cash_movements where movement_date=p_date and direction='OUT' and movement_type='CUSTOMER_COMMISSION' and status='POSTED';select coalesce(sum(amount),0) into rf from public.bf_cash_movements where movement_date=p_date and direction='OUT' and movement_type='CUSTOMER_REFUND' and status='POSTED';select coalesce(sum(amount),0) into dr from public.bf_cash_movements where movement_date=p_date and direction='OUT' and movement_type='CUSTOMER_DEPOSIT_REFUND' and status='POSTED';
 expected:=coalesce(p_opening,0)+coalesce(p_pos_cash,0)+coalesce(p_owner_topup,0)+coalesce(p_other_in,0)-coalesce(p_owner_withdrawal,0)-coalesce(p_expense,0)-dt-cm-rf-dr-coalesce(p_other_out,0);
 insert into public.bf_cash_reconciliations(reconciliation_date,pos_cash_sales,opening_cash,owner_topup,owner_withdrawal,expense_total_snapshot,entrusted_payout_total,commission_payout_total,refund_payout_total,deposit_refund_total,other_cash_in,other_cash_out,expected_cash,physical_cash,difference,note,status,verified_by,verified_at)
 values(p_date,coalesce(p_pos_cash,0),coalesce(p_opening,0),coalesce(p_owner_topup,0),coalesce(p_owner_withdrawal,0),coalesce(p_expense,0),dt,cm,rf,dr,coalesce(p_other_in,0),coalesce(p_other_out,0),expected,p_physical,p_physical-expected,p_note,'VERIFIED',auth.uid(),now())
 on conflict(reconciliation_date) do update set pos_cash_sales=excluded.pos_cash_sales,opening_cash=excluded.opening_cash,owner_topup=excluded.owner_topup,owner_withdrawal=excluded.owner_withdrawal,expense_total_snapshot=excluded.expense_total_snapshot,entrusted_payout_total=excluded.entrusted_payout_total,commission_payout_total=excluded.commission_payout_total,refund_payout_total=excluded.refund_payout_total,deposit_refund_total=excluded.deposit_refund_total,other_cash_in=excluded.other_cash_in,other_cash_out=excluded.other_cash_out,expected_cash=excluded.expected_cash,physical_cash=excluded.physical_cash,difference=excluded.difference,note=excluded.note,status='VERIFIED',verified_by=auth.uid(),verified_at=now() returning * into r;return r;
end $$;

grant select on public.bf_customer_commission_balances,public.bf_customer_refund_balances,public.bf_customer_sales_settlements to authenticated;
revoke execute on function public.bf_cf_refresh_obligation_status(text,uuid) from public,anon,authenticated;
revoke execute on function public.bf_cf_create_payout(text,text,text,numeric,date,text,text,text,integer,jsonb,text,jsonb,text) from public,anon;
revoke execute on function public.bf_cf_review_payout(uuid,text,text) from public,anon;revoke execute on function public.bf_cf_reverse_payout(uuid,text) from public,anon;revoke execute on function public.bf_cf_propose_deposit_use(text,uuid,numeric,text,text) from public,anon;revoke execute on function public.bf_cf_decide_deposit_use(uuid,text,text) from public,anon;revoke execute on function public.bf_cf_propose_liability_transfer(text,text,uuid,numeric,text,text) from public,anon;revoke execute on function public.bf_cf_decide_liability_transfer(uuid,text,text) from public,anon;revoke execute on function public.bf_cf_reverse_liability_transfer(uuid,text) from public,anon;revoke execute on function public.bf_cf_reconcile_cash_day(date,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) from public,anon;
grant execute on function public.bf_cf_create_payout(text,text,text,numeric,date,text,text,text,integer,jsonb,text,jsonb,text) to authenticated;grant execute on function public.bf_cf_review_payout(uuid,text,text),public.bf_cf_reverse_payout(uuid,text),public.bf_cf_propose_deposit_use(text,uuid,numeric,text,text),public.bf_cf_decide_deposit_use(uuid,text,text),public.bf_cf_propose_liability_transfer(text,text,uuid,numeric,text,text),public.bf_cf_decide_liability_transfer(uuid,text,text),public.bf_cf_reverse_liability_transfer(uuid,text),public.bf_cf_reconcile_cash_day(date,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) to authenticated;

commit;