-- R13 Nota & Dana Titipan — correction/reversal workflow controls
-- UAT ONLY until explicitly approved for production.
begin;

alter table public.bf_entrusted_corrections
  add column if not exists old_snapshot jsonb;

-- Approved corrections are applied to canonical note/items by Owner.
-- Therefore financials must read current canonical values and must not re-add correction deltas.
create or replace view public.bf_entrusted_note_financials
with (security_invoker=true) as
with tr as (
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
 b.base_note_total::numeric(18,2) effective_note_total,
 b.base_bf_right::numeric(18,2) effective_bf_right,
 coalesce(t.gross_confirmed,0)::numeric(18,2) gross_confirmed,
 coalesce(t.actual_confirmed,0)::numeric(18,2) actual_confirmed,
 coalesce(t.bank_fee_total,0)::numeric(18,2) bank_fee_total,
 greatest(b.base_note_total-coalesce(t.gross_confirmed,0),0)::numeric(18,2) note_outstanding,
 greatest(b.base_bf_right-coalesce(t.actual_confirmed,0),0)::numeric(18,2) bf_shortfall,
 greatest(coalesce(t.actual_confirmed,0)-b.base_bf_right,0)::numeric(18,2) entrusted_fund_total,
 coalesce(pay.payout_committed,0)::numeric(18,2) payout_committed,
 coalesce(pay.payout_verified,0)::numeric(18,2) payout_verified,
 greatest(greatest(coalesce(t.actual_confirmed,0)-b.base_bf_right,0)-coalesce(pay.payout_committed,0),0)::numeric(18,2) payout_outstanding,
 greatest(coalesce(pay.payout_committed,0)-greatest(coalesce(t.actual_confirmed,0)-b.base_bf_right,0),0)::numeric(18,2) payout_excess,
 greatest(coalesce(t.gross_confirmed,0)-b.base_note_total,0)::numeric(18,2) overpayment,
 (coalesce(t.gross_confirmed,0)>=b.base_note_total) as is_paid
from public.bf_entrusted_notes n
join public.bf_entrusted_note_base_financials b on b.note_id=n.id
left join tr t on t.note_id=n.id
left join pay on pay.note_id=n.id;

grant select on public.bf_entrusted_note_financials to authenticated;

-- Replace narrow old correction request with full material snapshot request.
drop function if exists public.bf_nt_request_correction(uuid,numeric,jsonb,text);
create function public.bf_nt_request_correction(
  p_note uuid,
  p_customer_id text,
  p_customer_name text,
  p_buyer_name text,
  p_new_fee_per_kg numeric,
  p_fee_note text,
  p_pos_refs jsonb,
  p_items jsonb,
  p_reason text
) returns public.bf_entrusted_corrections
language plpgsql security definer set search_path=public as $$
declare
 n public.bf_entrusted_notes; f public.bf_entrusted_note_financials; x jsonb;
 nt numeric:=0; bfr numeric:=0; tq numeric:=0; bq numeric:=0; eq numeric:=0;
 c public.bf_entrusted_corrections; old_items jsonb; old_snap jsonb; new_snap jsonb;
begin
 perform public.bf_nt_require_admin_or_owner();
 if nullif(btrim(p_reason),'') is null then raise exception 'NT_REASON_REQUIRED'; end if;
 if nullif(btrim(p_customer_name),'') is null or nullif(btrim(p_buyer_name),'') is null then raise exception 'NT_REQUIRED_FIELD'; end if;
 select * into n from public.bf_entrusted_notes where id=p_note for update;
 if n.id is null then raise exception 'NT_NOT_FOUND'; end if;
 if n.status in ('DRAFT','PENDING_APPROVAL','REVERSED') then raise exception 'NT_CORRECTION_NOT_ALLOWED'; end if;
 if exists(select 1 from public.bf_entrusted_corrections where note_id=p_note and status='PENDING_OWNER') then raise exception 'NT_CORRECTION_ALREADY_PENDING'; end if;
 select * into f from public.bf_entrusted_note_financials where note_id=p_note;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'NT_ITEMS_REQUIRED'; end if;
 for x in select * from jsonb_array_elements(p_items) loop
   if nullif(btrim(x->>'product_name'),'') is null then raise exception 'NT_PRODUCT_REQUIRED'; end if;
   if (x->>'total_qty')::numeric <> (x->>'bf_qty')::numeric+(x->>'entrusted_qty')::numeric then raise exception 'NT_INVALID_QTY_SPLIT'; end if;
   tq:=tq+(x->>'total_qty')::numeric; bq:=bq+(x->>'bf_qty')::numeric; eq:=eq+(x->>'entrusted_qty')::numeric;
   nt:=nt+((x->>'total_qty')::numeric*(x->>'note_unit_price')::numeric);
   bfr:=bfr+coalesce(nullif(x->>'bf_sales_value','')::numeric,0);
 end loop;
 bfr:=bfr+(eq*coalesce(p_new_fee_per_kg,0));
 if eq<=0 then raise exception 'NT_ENTRUSTED_QTY_REQUIRED'; end if;
 if bq=0 and coalesce(p_new_fee_per_kg,0)<=0 then raise exception 'NT_PURE_ENTRUSTED_FEE_REQUIRED'; end if;
 if nt<bfr then raise exception 'NT_NOTE_BELOW_BF_RIGHT'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'product_ref',product_ref,'product_name',product_name,'total_qty',total_qty,'bf_qty',bf_qty,
   'entrusted_qty',entrusted_qty,'note_unit_price',note_unit_price,'bf_sales_value',bf_sales_value
 ) order by line_no),'[]'::jsonb) into old_items from public.bf_entrusted_note_items where note_id=p_note;
 old_snap:=jsonb_build_object('customer_id',n.customer_id,'customer_name',n.customer_name_snapshot,'buyer_name',n.buyer_name,
   'fee_per_kg',n.fee_per_kg,'fee_note',n.fee_agreement_note,'pos_refs',n.pos_refs,'items',old_items,
   'note_total',f.effective_note_total,'bf_right',f.effective_bf_right);
 new_snap:=jsonb_build_object('customer_id',nullif(btrim(p_customer_id),''),'customer_name',btrim(p_customer_name),'buyer_name',btrim(p_buyer_name),
   'fee_per_kg',coalesce(p_new_fee_per_kg,0),'fee_note',p_fee_note,'pos_refs',coalesce(p_pos_refs,'[]'::jsonb),'items',p_items,
   'total_qty',tq,'bf_qty',bq,'entrusted_qty',eq,'note_total',nt,'bf_right',bfr);
 insert into public.bf_entrusted_corrections(correction_no,note_id,reason,old_snapshot,proposed_snapshot,old_note_total,new_note_total,old_bf_right,new_bf_right,delta_note_total,delta_bf_right,created_by)
 values(public.bf_nt_ref('KNT',nextval('public.bf_nt_correction_seq')),p_note,btrim(p_reason),old_snap,new_snap,
   f.effective_note_total,nt,f.effective_bf_right,bfr,nt-f.effective_note_total,bfr-f.effective_bf_right,auth.uid()) returning * into c;
 update public.bf_entrusted_notes set status='CORRECTION_REQUIRED',approval_status='STALE',updated_by=auth.uid(),updated_at=now() where id=p_note;
 perform public.bf_nt_event(p_note,'CORRECTION_REQUESTED',p_reason,old_snap,new_snap,c.id::text);
 return c;
end $$;

create or replace function public.bf_nt_decide_correction(p_correction uuid,p_action text,p_note_text text default null)
returns public.bf_entrusted_corrections
language plpgsql security definer set search_path=public as $$
declare c0 public.bf_entrusted_corrections; c public.bf_entrusted_corrections; n public.bf_entrusted_notes;
 snap jsonb; x jsonb; ln int:=0; f public.bf_entrusted_note_financials; fp text; payload text;
begin
 perform public.bf_nt_require_owner();
 select * into c0 from public.bf_entrusted_corrections where id=p_correction for update;
 if c0.id is null or c0.status<>'PENDING_OWNER' then raise exception 'NT_CORRECTION_NOT_PENDING'; end if;
 if p_action not in ('APPROVE','REJECT') then raise exception 'NT_INVALID_ACTION'; end if;
 select * into n from public.bf_entrusted_notes where id=c0.note_id for update;
 if n.id is null then raise exception 'NT_NOT_FOUND'; end if;
 if p_action='APPROVE' then
   snap:=c0.proposed_snapshot;
   update public.bf_entrusted_notes set
     customer_id=nullif(btrim(snap->>'customer_id'),''),customer_name_snapshot=btrim(snap->>'customer_name'),buyer_name=btrim(snap->>'buyer_name'),
     fee_per_kg=(snap->>'fee_per_kg')::numeric,fee_agreement_note=snap->>'fee_note',pos_refs=coalesce(snap->'pos_refs','[]'::jsonb),
     updated_by=auth.uid(),updated_at=now()
   where id=n.id;
   delete from public.bf_entrusted_note_items where note_id=n.id;
   for x in select * from jsonb_array_elements(snap->'items') loop
     ln:=ln+1;
     insert into public.bf_entrusted_note_items(note_id,line_no,product_ref,product_name,total_qty,bf_qty,entrusted_qty,note_unit_price,bf_sales_value)
     values(n.id,ln,nullif(btrim(x->>'product_ref'),''),btrim(x->>'product_name'),(x->>'total_qty')::numeric,(x->>'bf_qty')::numeric,(x->>'entrusted_qty')::numeric,(x->>'note_unit_price')::numeric,coalesce(nullif(x->>'bf_sales_value','')::numeric,0));
   end loop;
   perform public.bf_nt_validate_note(n.id);
   select * into n from public.bf_entrusted_notes where id=c0.note_id;
   payload:=concat_ws('|',n.customer_id,n.customer_name_snapshot,n.buyer_name,n.fee_per_kg::text,coalesce(n.fee_agreement_note,''),n.pos_refs::text,
      (select coalesce(jsonb_agg(to_jsonb(i) order by i.line_no),'[]'::jsonb)::text from public.bf_entrusted_note_items i where i.note_id=n.id));
   fp:=encode(digest(payload,'sha256'),'hex');
   select * into f from public.bf_entrusted_note_financials where note_id=n.id;
   update public.bf_entrusted_notes set
     status=case when f.gross_confirmed>=f.effective_note_total then 'PAID' when f.gross_confirmed>0 then 'PAYMENT_IN_PROGRESS' else 'APPROVED' end,
     approval_status='APPROVED',approval_fingerprint=fp,approved_by=auth.uid(),approved_at=now(),updated_by=auth.uid(),updated_at=now()
   where id=n.id;
 else
   select * into f from public.bf_entrusted_note_financials where note_id=n.id;
   update public.bf_entrusted_notes set
     status=case when f.gross_confirmed>=f.effective_note_total then 'PAID' when f.gross_confirmed>0 then 'PAYMENT_IN_PROGRESS' else 'APPROVED' end,
     approval_status='APPROVED',updated_by=auth.uid(),updated_at=now()
   where id=n.id;
 end if;
 update public.bf_entrusted_corrections set status=case when p_action='APPROVE' then 'APPROVED' else 'REJECTED' end,
   decided_by=auth.uid(),decided_at=now(),decision_note=p_note_text where id=p_correction returning * into c;
 perform public.bf_nt_event(c.note_id,case when p_action='APPROVE' then 'CORRECTION_APPROVED' else 'CORRECTION_REJECTED' end,
   p_note_text,c.old_snapshot,c.proposed_snapshot,c.id::text);
 return c;
end $$;

create or replace function public.bf_nt_reverse_transfer(p_transfer uuid,p_reason text)
returns public.bf_entrusted_transfers
language plpgsql security definer set search_path=public as $$
declare t0 public.bf_entrusted_transfers; t public.bf_entrusted_transfers; n public.bf_entrusted_notes; f public.bf_entrusted_note_financials;
begin
 perform public.bf_nt_require_owner();
 if nullif(btrim(p_reason),'') is null then raise exception 'NT_REASON_REQUIRED'; end if;
 select * into t0 from public.bf_entrusted_transfers where id=p_transfer for update;
 if t0.id is null or t0.status='REVERSED' then raise exception 'NT_TRANSFER_NOT_REVERSIBLE'; end if;
 select * into n from public.bf_entrusted_notes where id=t0.note_id for update;
 if exists(select 1 from public.bf_entrusted_payouts where note_id=t0.note_id and status<>'REVERSED') then
   raise exception 'NT_REVERSE_PAYOUTS_FIRST';
 end if;
 update public.bf_entrusted_transfers set status='REVERSED',difference_reason=concat_ws(E'\n',nullif(difference_reason,''),'[REVERSAL] '||btrim(p_reason))
 where id=p_transfer returning * into t;
 select * into f from public.bf_entrusted_note_financials where note_id=t.note_id;
 update public.bf_entrusted_notes set status=case when f.gross_confirmed>=f.effective_note_total then 'PAID' when f.gross_confirmed>0 then 'PAYMENT_IN_PROGRESS' else 'APPROVED' end,updated_at=now() where id=t.note_id;
 perform public.bf_nt_event(t.note_id,'TRANSFER_REVERSED',p_reason,to_jsonb(t0),to_jsonb(t),t.id::text);
 return t;
end $$;

revoke execute on function public.bf_nt_request_correction(uuid,text,text,text,numeric,text,jsonb,jsonb,text) from public,anon;
revoke execute on function public.bf_nt_reverse_transfer(uuid,text) from public,anon;
grant execute on function public.bf_nt_request_correction(uuid,text,text,text,numeric,text,jsonb,jsonb,text) to authenticated;
grant execute on function public.bf_nt_decide_correction(uuid,text,text) to authenticated;
grant execute on function public.bf_nt_reverse_transfer(uuid,text) to authenticated;

commit;
