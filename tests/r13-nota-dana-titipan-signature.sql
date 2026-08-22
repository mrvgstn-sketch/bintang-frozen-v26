\set ON_ERROR_STOP on
create or replace function public.test_assert(p_ok boolean,p_msg text) returns void language plpgsql as $$begin if not coalesce(p_ok,false) then raise exception 'ASSERT_FAIL: %',p_msg; end if; end$$;

select id as note_id from public.bf_entrusted_notes where note_no='NT-2026-000001' \gset
select set_config('test.note_id', :'note_id', false);

select public.test_assert(
  not has_function_privilege('authenticated','public.bf_nt_create_payout(uuid,numeric,date,text,text,text,jsonb,text,text)','EXECUTE'),
  'Legacy payout RPC must not remain callable by authenticated clients'
);
select public.test_assert(
  has_function_privilege('authenticated','public.bf_nt_create_payout_v2(uuid,numeric,date,text,text,text,integer,jsonb,text,text)','EXECUTE'),
  'Stroke-aware payout RPC must be callable by authenticated clients'
);

set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
do $$begin
 begin
  perform public.bf_nt_create_payout_v2(
    current_setting('test.note_id')::uuid,1000,current_date,'Budi','Tes TTD kosong',
    'data:image/png;base64,AAAAAAAAAAAAAAAAAAAA',0,'[]'::jsonb,'Kas Penjualan Harian','blank-signature-test'
  );
  raise exception 'EXPECTED_BLANK_SIGNATURE_REJECTION_NOT_RAISED';
 exception when others then
  if sqlerrm='EXPECTED_BLANK_SIGNATURE_REJECTION_NOT_RAISED' then raise; end if;
  if position('NT_SIGNATURE_STROKES_REQUIRED' in sqlerrm)=0 then raise; end if;
 end;
end$$;

select public.test_assert(count(*)=0,'Rejected blank signature must create no payout')
from public.bf_entrusted_payouts where idempotency_key='blank-signature-test';
select public.test_assert(count(*)=0,'Rejected blank signature must create no cash movement')
from public.bf_cash_movements where description like '%blank-signature-test%';

select 'R13 mandatory signature stroke harness PASS' as result;
