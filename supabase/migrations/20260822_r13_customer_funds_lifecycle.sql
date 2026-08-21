-- R13 Customer Funds lifecycle controls
-- UAT ONLY. ADDITIVE. No production deployment.
-- Extends Customer Funds foundation; does not create a Setoran or sales writer.
begin;

create or replace function public.bf_cf_obligation_remaining(p_type text,p_id uuid)
returns numeric language plpgsql security definer set search_path=public as $$
declare total_amount numeric; committed numeric; transferred numeric;
begin
 if p_type='CUSTOMER_COMMISSION' then
   select obligation_amount into total_amount from public.bf_customer_commission_obligations where id=p_id and status<>'REVERSED';
 elsif p_type='CUSTOMER_REFUND' then
   select obligation_amount into total_amount from public.bf_customer_refund_obligations where id=p_id and status<>'REVERSED';
 else raise exception 'CF_INVALID_OBLIGATION_TYPE'; end if;
 if total_amount is null then raise exception 'CF_OBLIGATION_NOT_FOUND'; end if;
 select coalesce(sum(a.amount),0) into committed
 from public.bf_customer_fund_payout_allocations a join public.bf_customer_fund_payouts p on p.id=a.payout_id
 where a.obligation_type=p_type and a.obligation_id=p_id and p.status in ('PENDING_OWNER','VERIFIED','CORRECTION_REQUIRED');
 select coalesce(sum(t.amount),0) into transferred from public.bf_customer_fund_liability_transfers t
 where t.source_type=p_type and t.source_ref_id=p_id::text and t.status in ('PENDING_OWNER','POSTED','CORRECTION_REQUIRED');
 return greatest(total_amount-committed-transferred,0);
end $$;

create or replace function public.bf_cf_refresh_obligation(p_type text,p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare total_amount numeric; remaining numeric;
begin
 remaining:=public.bf_cf_obligation_remaining(p_type,p_id);
 if p_type='CUSTOMER_COMMISSION' then
   select obligation_amount into total_amount from public.bf_customer_commission_obligations where id=p_id;
   update public.bf_customer_commission_obligations set status=case when remaining<=0 then 'FULLY_PAID' when remaining<total_amount then 'PARTIALLY_PAID' else 'OUTSTANDING' end where id=p_id and status<>'REVERSED';
 else
   select obligation_amount into total_amount from public.bf_customer_refund_obligations where id=p_id;
   update public.bf_customer_refund_obligations set status=case when remaining<=0 then 'FULLY_PAID' when remaining<total_amount then 'PARTIALLY_PAID' else 'OUTSTANDING' end where id=p_id and status<>'REVERSED';
 end if;
end $$;

create or replace function public.bf_cf_create_payout(
 p_customer_id text,p_customer_name text,p_type text,p_amount numeric,p_payment_date date,p_recipient text,p_agreement text,p_signature text,p_signature_strokes integer,p_photos jsonb,p_source_cash text,p_allocations jsonb,p_idempotency text
) returns public.bf_customer_fund_payouts language plpgsql security definer set search_path=public as $$
declare p public.bf_customer_fund_payouts; x jsonb; oid uuid; oa numeric; rem numeric; sum_alloc numeric:=0; dep numeric;
begin
 perform public.bf_nt_require_admin_or_owner();
 if p_type not in ('CUSTOMER_COMMISSION','CUSTOMER_REFUND','CUSTOMER_DEPOSIT_REFUND') then raise exception 'CF_INVALID_PAYOUT_TYPE'; end if;
 if coalesce(p_amount,0)<=0 or nullif(btrim(p_customer_id),'') is null or nullif(btrim(p_recipient),'') is null or nullif(btrim(p_agreement),'') is null then raise exception 'CF_REQUIRED_FIELD'; end if;
 if coalesce(p_signature_strokes,0)<=0 or length(coalesce(p_signature,''))<20 then raise exception 'CF_SIGNATURE_REQUIRED'; end if;
 select * into p from public.bf_customer_fund_payouts where idempotency_key=p_idempotency;if p.id is not null then return p;end if;
 if p_type='CUSTOMER_DEPOSIT_REFUND' then
   select coalesce(available_amount,0) into dep from public.bf_customer_deposit_balances where customer_id=p_customer_id;
   if coalesce(dep,0)<p_amount then raise exception 'CF_DEPOSIT_INSUFFICIENT'; end if;
   if coalesce(jsonb_array_length(coalesce(p_allocations,'[]'::jsonb)),0)<>0 then raise exception 'CF_DEPOSIT_REFUND_NO_OBLIGATION_ALLOCATION'; end if;
 else
   if jsonb_typeof(coalesce(p_allocations,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_allocations,'[]'::jsonb))=0 then raise exception 'CF_PAYOUT_ALLOCATION_REQUIRED'; end if;
   for x in select * from jsonb_array_elements(p_allocations) loop
     oid:=(x->>'obligation_id')::uuid;oa:=(x->>'amount')::numeric;
     if coalesce(oa,0)<=0 then raise exception 'CF_INVALID_ALLOCATION'; end if;
     if p_type='CUSTOMER_COMMISSION' and not exists(select 1 from public.bf_customer_commission_obligations where id=oid and customer_id=p_customer_id and status<>'REVERSED') then raise exception 'CF_OBLIGATION_CUSTOMER_MISMATCH'; end if;
     if p_type='CUSTOMER_REFUND' and not exists(select 1 from public.bf_customer_refund_obligations where id=oid and customer_id=p_customer_id and status<>'REVERSED') then raise exception 'CF_OBLIGATION_CUSTOMER_MISMATCH'; end if;
     rem:=public.bf_cf_obligation_remaining(p_type,oid);if oa>rem then raise exception 'CF_PAYOUT_EXCEEDS_OUTSTANDING';end if;sum_alloc:=sum_alloc+oa;
   end loop;
   if sum_alloc<>p_amount then raise exception 'CF_PAYOUT_ALLOCATION_MISMATCH'; end if;
 end if;
 insert into public.bf_customer_fund_payouts(payout_no,customer_id,customer_name_snapshot,payout_type,amount,payment_date,recipient_name,agreement_note,signature_data,signature_strokes,photo_urls,source_cash_label,paid_by,idempotency_key)
 values(public.bf_nt_ref('CFP',nextval('public.bf_cf_payout_seq')),p_customer_id,p_customer_name,p_type,p_amount,p_payment_date,p_recipient,p_agreement,p_signature,p_signature_strokes,coalesce(p_photos,'[]'::jsonb),coalesce(nullif(btrim(p_source_cash),''),'Kas Penjualan Harian'),auth.uid(),p_idempotency) returning * into p;
 if p_type='CUSTOMER_DEPOSIT_REFUND' then
   insert into public.bf_customer_deposit_ledger(customer_id,customer_name_snapshot,entry_type,amount,source_ref_type,source_ref_id,agreement_note,status,created_by,idempotency_key)
   values(p_customer_id,p_customer_name,'REFUNDED',p_amount,'CUSTOMER_DEPOSIT_REFUND',p.id::text,p_agreement,'PENDING_OWNER',auth.uid(),'payout-ledger:'||p.id);
 else
   for x in select * from jsonb_array_elements(p_allocations) loop
     oid:=(x->>'obligation_id')::uuid;oa:=(x->>'amount')::numeric;
     insert into public.bf_customer_fund_payout_allocations(payout_id,obligation_type,obligation_id,amount) values(p.id,p_type,oid,oa);
     perform public.bf_cf_refresh_obligation(p_type,oid);
   end loop;
 end if;
 perform public.bf_cf_event(null,'PAYOUT_RECORDED',p_agreement,null,to_jsonb(p),'payout',p.id::text);return p;
end $$;

create or replace function public.bf_cf_verify_payout(p_payout uuid,p_note text)
returns public.bf_customer_fund_payouts language plpgsql security definer set search_path=public as $$
declare p public.bf_customer_fund_payouts; a record;
begin
 perform public.bf_nt_require_owner();select * into p from public.bf_customer_fund_payouts where id=p_payout for update;
 if p.id is null then raise exception 'CF_PAYOUT_NOT_FOUND';end if;if p.status='VERIFIED' then return p;end if;if p.status<>'PENDING_OWNER' then raise exception 'CF_PAYOUT_NOT_PENDING';end if;
 update public.bf_customer_fund_payouts set status='VERIFIED',verified_by=auth.uid(),verified_at=now(),verification_note=p_note where id=p.id returning * into p;
 update public.bf_customer_deposit_ledger set status='POSTED' where source_ref_type='CUSTOMER_DEPOSIT_REFUND' and source_ref_id=p.id::text and status='PENDING_OWNER';
 insert into public.bf_cash_movements(movement_date,direction,movement_type,amount,source_ref_type,source_ref_id,description,status,created_by)
 values(p.payment_date,'OUT',p.payout_type,p.amount,'CUSTOMER_FUND_PAYOUT',p.id::text,'Customer Funds payout '||p.payout_no,'POSTED',auth.uid());
 for a in select obligation_type,obligation_id from public.bf_customer_fund_payout_allocations where payout_id=p.id loop perform public.bf_cf_refresh_obligation(a.obligation_type,a.obligation_id);end loop;
 perform public.bf_cf_event(null,'PAYOUT_VERIFIED',p_note,null,to_jsonb(p),'payout',p.id::text);return p;
end $$;

create or replace function public.bf_cf_reverse_payout(p_payout uuid,p_reason text)
returns public.bf_customer_fund_payouts language plpgsql security definer set search_path=public as $$
declare p public.bf_customer_fund_payouts; a record;
begin
 perform public.bf_nt_require_owner();if nullif(btrim(p_reason),'') is null then raise exception 'CF_REASON_REQUIRED';end if;
 select * into p from public.bf_customer_fund_payouts where id=p_payout for update;if p.id is null then raise exception 'CF_PAYOUT_NOT_FOUND';end if;if p.status='REVERSED' then return p;end if;
 update public.bf_customer_fund_payouts set status='REVERSED',verification_note=concat_ws(' | ',verification_note,'REVERSAL: '||p_reason) where id=p.id returning * into p;
 update public.bf_cash_movements set status='REVERSED' where source_ref_type='CUSTOMER_FUND_PAYOUT' and source_ref_id=p.id::text and status='POSTED';
 update public.bf_customer_deposit_ledger set status='REVERSED' where source_ref_type='CUSTOMER_DEPOSIT_REFUND' and source_ref_id=p.id::text and status in ('PENDING_OWNER','POSTED','CORRECTION_REQUIRED');
 for a in select obligation_type,obligation_id from public.bf_customer_fund_payout_allocations where payout_id=p.id loop perform public.bf_cf_refresh_obligation(a.obligation_type,a.obligation_id);end loop;
 perform public.bf_cf_event(null,'PAYOUT_REVERSED',p_reason,null,to_jsonb(p),'payout',p.id::text);return p;
end $$;

create or replace function public.bf_cf_use_deposit(p_customer_id text,p_customer_name text,p_sales_ref uuid,p_amount numeric,p_note text,p_idempotency text)
returns public.bf_customer_deposit_ledger language plpgsql security definer set search_path=public as $$
declare l public.bf_customer_deposit_ledger; bal numeric; sr public.bf_customer_fund_sales_refs;
begin
 perform public.bf_nt_require_admin_or_owner();select * into l from public.bf_customer_deposit_ledger where idempotency_key=p_idempotency;if l.id is not null then return l;end if;
 select * into sr from public.bf_customer_fund_sales_refs where id=p_sales_ref and status='VALIDATED';if sr.id is null or sr.customer_id<>p_customer_id then raise exception 'CF_VALIDATED_SALES_REF_REQUIRED';end if;
 select coalesce(available_amount,0) into bal from public.bf_customer_deposit_balances where customer_id=p_customer_id;if coalesce(p_amount,0)<=0 or coalesce(bal,0)<p_amount then raise exception 'CF_DEPOSIT_INSUFFICIENT';end if;
 insert into public.bf_customer_deposit_ledger(customer_id,customer_name_snapshot,entry_type,amount,target_sales_ref_id,source_ref_type,source_ref_id,agreement_note,status,created_by,idempotency_key)
 values(p_customer_id,p_customer_name,'USED',p_amount,p_sales_ref,'SALES_REF',p_sales_ref::text,p_note,'PENDING_OWNER',auth.uid(),p_idempotency) returning * into l;return l;
end $$;

create or replace function public.bf_cf_decide_deposit_use(p_ledger uuid,p_decision text,p_note text)
returns public.bf_customer_deposit_ledger language plpgsql security definer set search_path=public as $$
declare l public.bf_customer_deposit_ledger;
begin
 perform public.bf_nt_require_owner();select * into l from public.bf_customer_deposit_ledger where id=p_ledger for update;if l.id is null or l.entry_type<>'USED' or l.status<>'PENDING_OWNER' then raise exception 'CF_DEPOSIT_USE_NOT_PENDING';end if;
 if upper(p_decision)='APPROVE' then update public.bf_customer_deposit_ledger set status='POSTED',agreement_note=concat_ws(' | ',agreement_note,p_note) where id=l.id returning * into l;
 elsif upper(p_decision)='REJECT' then update public.bf_customer_deposit_ledger set status='REVERSED',agreement_note=concat_ws(' | ',agreement_note,'REJECTED: '||p_note) where id=l.id returning * into l;
 else raise exception 'CF_INVALID_DECISION';end if;return l;
end $$;

create or replace function public.bf_cf_propose_liability_transfer(p_customer_id text,p_source_type text,p_source_id uuid,p_amount numeric,p_note text,p_idempotency text)
returns public.bf_customer_fund_liability_transfers language plpgsql security definer set search_path=public as $$
declare t public.bf_customer_fund_liability_transfers; rem numeric; ok boolean;
begin
 perform public.bf_nt_require_admin_or_owner();if p_source_type not in ('CUSTOMER_COMMISSION','CUSTOMER_REFUND') then raise exception 'CF_TRANSFER_SOURCE_UNSUPPORTED';end if;
 if p_source_type='CUSTOMER_COMMISSION' then select exists(select 1 from public.bf_customer_commission_obligations where id=p_source_id and customer_id=p_customer_id and status<>'REVERSED') into ok;else select exists(select 1 from public.bf_customer_refund_obligations where id=p_source_id and customer_id=p_customer_id and status<>'REVERSED') into ok;end if;
 if not ok then raise exception 'CF_OBLIGATION_CUSTOMER_MISMATCH';end if;rem:=public.bf_cf_obligation_remaining(p_source_type,p_source_id);if coalesce(p_amount,0)<=0 or p_amount>rem then raise exception 'CF_TRANSFER_EXCEEDS_OUTSTANDING';end if;
 select * into t from public.bf_customer_fund_liability_transfers where idempotency_key=p_idempotency;if t.id is not null then return t;end if;
 insert into public.bf_customer_fund_liability_transfers(customer_id,source_type,source_ref_id,amount,agreement_note,proposed_by,idempotency_key) values(p_customer_id,p_source_type,p_source_id::text,p_amount,p_note,auth.uid(),p_idempotency) returning * into t;
 perform public.bf_cf_refresh_obligation(p_source_type,p_source_id);return t;
end $$;

create or replace function public.bf_cf_decide_liability_transfer(p_transfer uuid,p_decision text,p_note text)
returns public.bf_customer_fund_liability_transfers language plpgsql security definer set search_path=public as $$
declare t public.bf_customer_fund_liability_transfers; cname text;
begin
 perform public.bf_nt_require_owner();select * into t from public.bf_customer_fund_liability_transfers where id=p_transfer for update;if t.id is null or t.status<>'PENDING_OWNER' then raise exception 'CF_TRANSFER_NOT_PENDING';end if;
 if upper(p_decision)='APPROVE' then
   if t.source_type='CUSTOMER_COMMISSION' then select customer_name_snapshot into cname from public.bf_customer_commission_obligations where id=t.source_ref_id::uuid;else select customer_name_snapshot into cname from public.bf_customer_refund_obligations where id=t.source_ref_id::uuid;end if;
   update public.bf_customer_fund_liability_transfers set status='POSTED',decided_by=auth.uid(),decided_at=now(),agreement_note=concat_ws(' | ',agreement_note,p_note) where id=t.id returning * into t;
   insert into public.bf_customer_deposit_ledger(customer_id,customer_name_snapshot,entry_type,amount,source_ref_type,source_ref_id,agreement_note,status,created_by,idempotency_key)
   values(t.customer_id,cname,'TRANSFER_IN',t.amount,t.source_type,t.source_ref_id,t.agreement_note,'POSTED',auth.uid(),'liability-transfer:'||t.id);
 elsif upper(p_decision)='REJECT' then update public.bf_customer_fund_liability_transfers set status='REJECTED',decided_by=auth.uid(),decided_at=now(),agreement_note=concat_ws(' | ',agreement_note,'REJECTED: '||p_note) where id=t.id returning * into t;
 else raise exception 'CF_INVALID_DECISION';end if;
 perform public.bf_cf_refresh_obligation(t.source_type,t.source_ref_id::uuid);return t;
end $$;

-- Only controlled RPCs may mutate lifecycle tables.
revoke all on public.bf_customer_fund_payouts,public.bf_customer_fund_payout_allocations,public.bf_customer_fund_liability_transfers from authenticated;
grant select on public.bf_customer_fund_payouts,public.bf_customer_fund_payout_allocations,public.bf_customer_fund_liability_transfers to authenticated;
grant execute on function public.bf_cf_create_payout(text,text,text,numeric,date,text,text,text,integer,jsonb,text,jsonb,text) to authenticated;
grant execute on function public.bf_cf_verify_payout(uuid,text),public.bf_cf_reverse_payout(uuid,text),public.bf_cf_use_deposit(text,text,uuid,numeric,text,text),public.bf_cf_decide_deposit_use(uuid,text,text),public.bf_cf_propose_liability_transfer(text,text,uuid,numeric,text,text),public.bf_cf_decide_liability_transfer(uuid,text,text) to authenticated;

commit;
