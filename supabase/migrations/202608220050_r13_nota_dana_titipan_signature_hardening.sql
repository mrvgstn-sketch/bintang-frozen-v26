-- R13 Nota & Dana Titipan — mandatory real signature hardening
-- UAT ONLY until explicitly approved for production.
begin;

alter table public.bf_entrusted_payouts
  add column if not exists signature_stroke_count integer not null default 0 check(signature_stroke_count>=0);

create or replace function public.bf_nt_create_payout_v2(
 p_note uuid,p_amount numeric,p_date date,p_recipient text,p_agreement_note text,
 p_signature text,p_signature_strokes integer,p_photos jsonb,p_source_cash text,p_idempotency text
) returns public.bf_entrusted_payouts
language plpgsql security definer set search_path=public as $$
declare n public.bf_entrusted_notes; f public.bf_entrusted_note_financials; p public.bf_entrusted_payouts;
begin
 perform public.bf_nt_require_admin_or_owner();
 select * into n from public.bf_entrusted_notes where id=p_note for update;
 if n.id is null then raise exception 'NT_NOT_FOUND'; end if;
 select * into f from public.bf_entrusted_note_financials where note_id=p_note;
 if not f.is_paid then raise exception 'NT_NOTE_NOT_PAID'; end if;
 if f.bf_shortfall>0 then raise exception 'NT_BF_RIGHT_NOT_FULL'; end if;
 if p_amount<=0 or p_amount>f.payout_outstanding then raise exception 'NT_PAYOUT_EXCEEDS_OUTSTANDING'; end if;
 if nullif(btrim(p_recipient),'') is null or nullif(btrim(p_agreement_note),'') is null then raise exception 'NT_PAYOUT_RECEIPT_REQUIRED'; end if;
 if coalesce(p_signature_strokes,0)<=0 then raise exception 'NT_SIGNATURE_STROKES_REQUIRED'; end if;
 if length(coalesce(p_signature,''))<20 then raise exception 'NT_PAYOUT_RECEIPT_REQUIRED'; end if;
 if nullif(btrim(p_idempotency),'') is null then raise exception 'NT_IDEMPOTENCY_REQUIRED'; end if;
 insert into public.bf_entrusted_payouts(
   payout_no,note_id,amount,payment_date,recipient_name,agreement_note,signature_data,signature_stroke_count,
   photo_urls,source_cash_label,paid_by,idempotency_key
 ) values(
   public.bf_nt_ref('PDT',nextval('public.bf_nt_payout_seq')),p_note,p_amount,p_date,btrim(p_recipient),btrim(p_agreement_note),
   p_signature,p_signature_strokes,coalesce(p_photos,'[]'::jsonb),coalesce(nullif(btrim(p_source_cash),''),'Kas Penjualan Harian'),auth.uid(),p_idempotency
 ) returning * into p;
 insert into public.bf_cash_movements(movement_date,direction,movement_type,amount,source_ref_type,source_ref_id,description,created_by)
 values(p_date,'OUT','DANA_TITIPAN',p_amount,'ENTRUSTED_PAYOUT',p.id::text,'Pembayaran Dana Titipan '||p.payout_no,auth.uid());
 perform public.bf_nt_mark_cash_reconciliation_stale(p_date,'Pembayaran Dana Titipan '||p.payout_no||' ditambahkan.');
 perform public.bf_nt_event(p_note,'PAYOUT_RECORDED',p_agreement_note,null,to_jsonb(p),p.id::text);
 return p;
end $$;

-- Old payout RPC is kept only as historical/internal compatibility but cannot be called by client.
revoke execute on function public.bf_nt_create_payout(uuid,numeric,date,text,text,text,jsonb,text,text) from public,anon,authenticated;
revoke execute on function public.bf_nt_create_payout_v2(uuid,numeric,date,text,text,text,integer,jsonb,text,text) from public,anon;
grant execute on function public.bf_nt_create_payout_v2(uuid,numeric,date,text,text,text,integer,jsonb,text,text) to authenticated;

commit;
