\set ON_ERROR_STOP on
create or replace function public.test_assert(p_ok boolean,p_msg text) returns void language plpgsql as $$begin if not coalesce(p_ok,false) then raise exception 'ASSERT_FAIL: %',p_msg; end if; end$$;

-- Base harness leaves NT-2026-000001 fully paid with one verified 2m payout and a verified cash reconciliation.
set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
select id as note_id from public.bf_entrusted_notes where note_no='NT-2026-000001' \gset
select set_config('test.note_id', :'note_id', false);

-- Admin requests material correction: 100kg -> 90kg, BF still 50kg, entrusted 40kg, same fee 1.500/kg.
select (public.bf_nt_request_correction(
 :'note_id'::uuid,'CUST-ABC','CV ABC','Restoran XYZ',1500,'Koreksi sesuai kesepakatan','["KP-001"]'::jsonb,
 '[{"product_name":"BLD","total_qty":90,"bf_qty":50,"entrusted_qty":40,"note_unit_price":70000,"bf_sales_value":3250000}]'::jsonb,
 'Pembeli mengurangi barang 10kg'
)).id as correction_id \gset
select set_config('test.correction_id', :'correction_id', false);
select public.test_assert(approval_status='STALE' and status='CORRECTION_REQUIRED','Correction request must stale old approval') from public.bf_entrusted_notes where id=:'note_id';
select public.test_assert(old_snapshot is not null,'Correction must preserve old material snapshot') from public.bf_entrusted_corrections where id=:'correction_id';

-- Admin cannot approve correction.
do $$begin
 begin
  perform public.bf_nt_decide_correction(current_setting('test.correction_id')::uuid,'APPROVE','illegal');
  raise exception 'EXPECTED_ADMIN_CORRECTION_APPROVAL_DENIAL_NOT_RAISED';
 exception when others then
  if sqlerrm='EXPECTED_ADMIN_CORRECTION_APPROVAL_DENIAL_NOT_RAISED' then raise; end if;
  if position('NT_OWNER_REQUIRED' in sqlerrm)=0 then raise; end if;
 end;
end$$;

set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.bf_nt_decide_correction(:'correction_id'::uuid,'APPROVE','Disetujui Owner');
select public.test_assert(effective_note_total=6300000,'Corrected note total must be 6.300.000') from public.bf_entrusted_note_financials where note_id=:'note_id';
select public.test_assert(effective_bf_right=3310000,'Corrected BF right must be 3.250.000 + 40kg x 1.500') from public.bf_entrusted_note_financials where note_id=:'note_id';
select public.test_assert(overpayment=700000,'Correction must expose 700.000 gross overpayment') from public.bf_entrusted_note_financials where note_id=:'note_id';
select public.test_assert(payout_outstanding=1683500,'Corrected payout outstanding mismatch') from public.bf_entrusted_note_financials where note_id=:'note_id';
select public.test_assert(approval_status='APPROVED','Owner-approved correction must create a fresh approval') from public.bf_entrusted_notes where id=:'note_id';

-- Transfer reversal is blocked while payout exists.
select id as tr2 from public.bf_entrusted_transfers where idempotency_key='tr-002' \gset
select set_config('test.tr2', :'tr2', false);
do $$begin
 begin
  perform public.bf_nt_reverse_transfer(current_setting('test.tr2')::uuid,'Salah transfer');
  raise exception 'EXPECTED_TRANSFER_REVERSAL_BLOCK_NOT_RAISED';
 exception when others then
  if sqlerrm='EXPECTED_TRANSFER_REVERSAL_BLOCK_NOT_RAISED' then raise; end if;
  if position('NT_REVERSE_PAYOUTS_FIRST' in sqlerrm)=0 then raise; end if;
 end;
end$$;

-- Reverse payout first. Linked cash movement must reverse and prior cash reconciliation must become stale.
select id as payout1 from public.bf_entrusted_payouts where idempotency_key='payout-001' \gset
select public.bf_nt_reverse_payout(:'payout1'::uuid,'Pembayaran dibatalkan dan uang kembali ke kas');
select public.test_assert(status='REVERSED','Payout reversal failed') from public.bf_entrusted_payouts where id=:'payout1';
select public.test_assert(status='REVERSED','Linked cash movement must reverse with payout') from public.bf_cash_movements where source_ref_type='ENTRUSTED_PAYOUT' and source_ref_id=:'payout1';
select public.test_assert(status='CORRECTION_REQUIRED','Cash reconciliation must become stale after payout reversal') from public.bf_cash_reconciliations where reconciliation_date=current_date;

-- Now transfer reversal is allowed and recalculates paid status/outstanding from remaining confirmed transfers.
select public.bf_nt_reverse_transfer(:'tr2'::uuid,'Transfer kedua dikoreksi');
select public.test_assert(status='REVERSED','Transfer reversal failed') from public.bf_entrusted_transfers where id=:'tr2';
select public.test_assert(gross_confirmed=3000000,'Only first 3m transfer should remain confirmed') from public.bf_entrusted_note_financials where note_id=:'note_id';
select public.test_assert(not is_paid,'Note must return to unpaid after reversal') from public.bf_entrusted_note_financials where note_id=:'note_id';
select public.test_assert(status='PAYMENT_IN_PROGRESS','Canonical note status must return to PAYMENT_IN_PROGRESS') from public.bf_entrusted_notes where id=:'note_id';

select 'R13 correction/reversal workflow harness PASS' as result;
