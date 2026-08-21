-- R13 Nota & Dana Titipan — security/concurrency hardening
-- Apply after 20260822_r13_nota_dana_titipan.sql. Additive/reversible functions only.
begin;

-- Views must enforce the caller's RLS context rather than view-owner privileges.
alter view public.bf_entrusted_note_base_financials set (security_invoker=true);
alter view public.bf_entrusted_note_financials set (security_invoker=true);

-- Fix confirmation status calculation: the financial view already includes the just-confirmed transfer.
create or replace function public.bf_nt_confirm_transfer(p_transfer uuid,p_actual_received numeric,p_difference_type text,p_reason text default null)
returns public.bf_entrusted_transfers language plpgsql security definer set search_path=public as $$
declare oldr public.bf_entrusted_transfers; r public.bf_entrusted_transfers; d numeric; f public.bf_entrusted_note_financials;
begin
 perform public.bf_nt_require_owner();
 select * into oldr from public.bf_entrusted_transfers where id=p_transfer for update;
 if oldr.id is null or oldr.status<>'RECORDED' then raise exception 'NT_TRANSFER_NOT_PENDING'; end if;
 if p_actual_received<0 or p_actual_received>oldr.gross_transfer then raise exception 'NT_INVALID_ACTUAL_RECEIVED'; end if;
 d:=oldr.gross_transfer-p_actual_received;
 if p_difference_type='NONE' and d<>0 then raise exception 'NT_DIFFERENCE_REQUIRES_CLASSIFICATION'; end if;
 if p_difference_type not in ('NONE','BANK_FEE','OTHER') then raise exception 'NT_INVALID_DIFFERENCE_TYPE'; end if;
 if p_difference_type='OTHER' and nullif(btrim(p_reason),'') is null then raise exception 'NT_DIFFERENCE_REASON_REQUIRED'; end if;
 update public.bf_entrusted_transfers
 set actual_received=p_actual_received,difference_amount=d,difference_type=p_difference_type,difference_reason=p_reason,status='CONFIRMED',confirmed_by=auth.uid(),confirmed_at=now()
 where id=p_transfer returning * into r;
 select * into f from public.bf_entrusted_note_financials where note_id=r.note_id;
 update public.bf_entrusted_notes
 set status=case when f.gross_confirmed>=f.effective_note_total then 'PAID' else 'PAYMENT_IN_PROGRESS' end,updated_at=now()
 where id=r.note_id;
 perform public.bf_nt_event(r.note_id,'TRANSFER_CONFIRMED',p_reason,to_jsonb(oldr),to_jsonb(r),r.id::text);
 return r;
end $$;

-- Lock canonical note row before reading financial aggregate. Aggregate views themselves are not lockable.
create or replace function public.bf_nt_create_payout(p_note uuid,p_amount numeric,p_date date,p_recipient text,p_agreement_note text,p_signature text,p_photos jsonb,p_source_cash text,p_idempotency text)
returns public.bf_entrusted_payouts language plpgsql security definer set search_path=public as $$
declare n public.bf_entrusted_notes; f public.bf_entrusted_note_financials; p public.bf_entrusted_payouts;
begin
 perform public.bf_nt_require_admin_or_owner();
 select * into n from public.bf_entrusted_notes where id=p_note for update;
 if n.id is null then raise exception 'NT_NOT_FOUND'; end if;
 select * into f from public.bf_entrusted_note_financials where note_id=p_note;
 if not f.is_paid then raise exception 'NT_NOTE_NOT_PAID'; end if;
 if f.bf_shortfall>0 then raise exception 'NT_BF_RIGHT_NOT_FULL'; end if;
 if p_amount<=0 or p_amount>f.payout_outstanding then raise exception 'NT_PAYOUT_EXCEEDS_OUTSTANDING'; end if;
 if nullif(btrim(p_recipient),'') is null or nullif(btrim(p_agreement_note),'') is null or length(coalesce(p_signature,''))<20 then raise exception 'NT_PAYOUT_RECEIPT_REQUIRED'; end if;
 if nullif(btrim(p_idempotency),'') is null then raise exception 'NT_IDEMPOTENCY_REQUIRED'; end if;
 insert into public.bf_entrusted_payouts(payout_no,note_id,amount,payment_date,recipient_name,agreement_note,signature_data,photo_urls,source_cash_label,paid_by,idempotency_key)
 values(public.bf_nt_ref('PDT',nextval('public.bf_nt_payout_seq')),p_note,p_amount,p_date,btrim(p_recipient),btrim(p_agreement_note),p_signature,coalesce(p_photos,'[]'::jsonb),coalesce(nullif(btrim(p_source_cash),''),'Kas Penjualan Harian'),auth.uid(),p_idempotency) returning * into p;
 insert into public.bf_cash_movements(movement_date,direction,movement_type,amount,source_ref_type,source_ref_id,description,created_by)
 values(p_date,'OUT','DANA_TITIPAN',p_amount,'ENTRUSTED_PAYOUT',p.id::text,'Pembayaran Dana Titipan '||p.payout_no,auth.uid());
 perform public.bf_nt_event(p_note,'PAYOUT_RECORDED',p_agreement_note,null,to_jsonb(p),p.id::text);
 return p;
end $$;

-- Require explicit idempotency keys for externally submitted financial writes.
create or replace function public.bf_nt_record_transfer(p_note uuid,p_gross numeric,p_date date,p_sender text,p_proofs jsonb,p_note_text text,p_idempotency text)
returns public.bf_entrusted_transfers language plpgsql security definer set search_path=public as $$
declare n public.bf_entrusted_notes; r public.bf_entrusted_transfers;
begin
 perform public.bf_nt_require_admin_or_owner();
 select * into n from public.bf_entrusted_notes where id=p_note for update;
 if n.status not in ('APPROVED','PAYMENT_IN_PROGRESS','PAID','CORRECTION_REQUIRED') then raise exception 'NT_NOTE_NOT_ACTIVE'; end if;
 if nullif(btrim(p_sender),'') is null or nullif(btrim(p_idempotency),'') is null then raise exception 'NT_TRANSFER_REQUIRED_FIELD'; end if;
 insert into public.bf_entrusted_transfers(note_id,gross_transfer,transfer_date,actual_sender,proof_urls,note,recorded_by,idempotency_key)
 values(p_note,p_gross,p_date,btrim(p_sender),coalesce(p_proofs,'[]'::jsonb),p_note_text,auth.uid(),p_idempotency) returning * into r;
 perform public.bf_nt_event(p_note,'TRANSFER_RECORDED',p_note_text,null,to_jsonb(r),r.id::text);
 return r;
end $$;

-- RLS policies must not depend on client EXECUTE permission for internal security helpers.
do $$ declare t text; begin
 foreach t in array array['bf_entrusted_notes','bf_entrusted_note_items','bf_entrusted_transfers','bf_entrusted_corrections','bf_entrusted_payouts','bf_cash_movements','bf_cash_reconciliations','bf_entrusted_events'] loop
  execute format('drop policy if exists nt_read_admin_owner on public.%I',t);
  execute format($p$create policy nt_read_admin_owner on public.%I for select to authenticated using (exists (select 1 from public.bf_profiles p where p.id=auth.uid() and p.active=true and lower(p.role) in ('owner','admin')))$p$,t);
 end loop;
end $$;

-- Revoke the default PUBLIC execute privilege from every internal/public bf_nt_* function.
do $$
declare r record;begin
 for r in
   select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname like 'bf_nt_%'
 loop
   execute format('revoke execute on function %I.%I(%s) from public',r.nspname,r.proname,r.args);
   begin execute format('revoke execute on function %I.%I(%s) from anon',r.nspname,r.proname,r.args); exception when undefined_object then null; end;
   begin execute format('revoke execute on function %I.%I(%s) from authenticated',r.nspname,r.proname,r.args); exception when undefined_object then null; end;
 end loop;
end $$;

-- Only these guarded RPCs are callable from the authenticated client.
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

commit;
