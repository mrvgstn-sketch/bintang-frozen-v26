\set ON_ERROR_STOP on

-- Functional + permission + anti-duplicate + reversal harness on disposable PostgreSQL.
do $$
declare
  c1 public.bf_customer_fund_cases;
  c2 public.bf_customer_fund_cases;
  t1 public.bf_customer_fund_transfers;
  t2 public.bf_customer_fund_transfers;
  n1 public.bf_entrusted_notes;
  dt public.bf_customer_fund_obligations;
  cb public.bf_customer_fund_obligations;
  p1 public.bf_customer_fund_payments;
  p2 public.bf_customer_fund_payments;
  x numeric;
begin
  -- Operator cannot create a case.
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
  begin
    perform public.bf_cfc_create_case(null,'Blocked Customer','must fail',null);
    raise exception 'TEST_OPERATOR_CREATE_SHOULD_FAIL';
  exception when insufficient_privilege then null;
  end;

  -- Canonical Setoran gets backend identity and durable row.
  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
  perform public.bf_cfc_create_setoran('cust-001','CV ABC',1000000,'TRANSFER','BCA','2026-08-22','test setoran','[]'::jsonb,true);
  if not exists(select 1 from public.bf_customer_setoran where customer_id='cust-001' and amount=1000000) then
    raise exception 'TEST_SETORAN_MISSING';
  end if;

  -- Case + transfer with third-party actual sender and Rp6.500 fee.
  select * into c1 from public.bf_cfc_create_case('cust-001','CV ABC','nota titipan case',null);
  select * into t1 from public.bf_cfc_record_transfer(
    c1.id,'Restoran XYZ',7000000,'6500',6500,null,'PARTY2','BCA-001','2026-08-22','BCA','[]'::jsonb,null,null,'transfer-case1'
  );
  if t1.actual_sender <> 'Restoran XYZ' or t1.net_received <> 6993500 then raise exception 'TEST_TRANSFER_FEE_OR_SENDER'; end if;
  select * into t1 from public.bf_cfc_reconcile_transfer(t1.id,'RECONCILED','matched manually');

  -- Invalid split must fail.
  begin
    perform public.bf_cfc_create_entrusted_note(c1.id,'Restoran XYZ','BLD','BLD',100,50,49,7000000,3250000,3750000,'KP-TEST','invalid qty');
    raise exception 'TEST_INVALID_QTY_SHOULD_FAIL';
  exception when check_violation then null;
  end;

  -- Valid Nota Titipan 100 = 50 BF + 50 Party-2.
  select * into n1 from public.bf_cfc_create_entrusted_note(c1.id,'Restoran XYZ','BLD','BLD',100,50,50,7000000,3250000,3750000,'KP-TEST','valid note');

  -- Admin cannot approve.
  begin
    perform public.bf_cfc_approve_entrusted_note(n1.id,true,'admin must fail');
    raise exception 'TEST_ADMIN_APPROVE_SHOULD_FAIL';
  exception when insufficient_privilege then null;
  end;

  -- Owner approves.
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
  select * into n1 from public.bf_cfc_approve_entrusted_note(n1.id,true,'approved');
  if n1.approval_status <> 'APPROVED' then raise exception 'TEST_NOTE_NOT_APPROVED'; end if;

  -- Material edit through official RPC must make old approval STALE.
  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
  select * into n1 from public.bf_cfc_update_entrusted_note(
    n1.id,'cust-001','CV ABC','Restoran XYZ','BLD','BLD',100,60,40,7000000,3250000,3750000,'KP-TEST','material edit','adjusted BF/titipan split'
  );
  if n1.approval_status <> 'STALE' or n1.approved_by is not null then raise exception 'TEST_APPROVAL_NOT_STALE'; end if;

  -- Re-approve current material snapshot.
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
  select * into n1 from public.bf_cfc_approve_entrusted_note(n1.id,true,'re-approved');

  -- Dana Titipan: fee is borne by Party 2, BF right remains unchanged.
  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
  select * into dt from public.bf_cfc_create_entrusted_fund(n1.id,t1.id,'dt-case1');
  if dt.gross_basis <> 3750000 or dt.bank_fee_applied <> 6500 or dt.amount_due <> 3743500 then raise exception 'TEST_ENTRUSTED_FUND_AMOUNT'; end if;
  select bf_right into x from public.bf_entrusted_notes where id=n1.id;
  if x <> 3250000 then raise exception 'TEST_BF_RIGHT_REDUCED_BY_FEE'; end if;

  -- Duplicate Dana Titipan must be rejected.
  begin
    perform public.bf_cfc_create_entrusted_fund(n1.id,t1.id,'dt-case1-duplicate');
    raise exception 'TEST_DUP_DT_SHOULD_FAIL';
  exception when unique_violation then null;
  end;

  -- Pay Dana Titipan, Admin cannot verify, Owner can.
  select * into p1 from public.bf_cfc_mark_paid(dt.id,'2026-08-22','TRANSFER','BCA-OUT','[]'::jsonb,'paid dt','pay-dt-1');
  begin
    perform public.bf_cfc_verify_payment(p1.id,'VERIFY','admin verify must fail');
    raise exception 'TEST_ADMIN_VERIFY_SHOULD_FAIL';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
  select * into p1 from public.bf_cfc_verify_payment(p1.id,'VERIFY','owner verified');
  if p1.status <> 'VERIFIED' then raise exception 'TEST_PAYMENT_NOT_VERIFIED'; end if;

  -- Second independent case for Cashback and self-verify test.
  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
  select * into c2 from public.bf_cfc_create_case('cust-002','Customer Cashback','cashback case',null);
  select * into t2 from public.bf_cfc_record_transfer(c2.id,'Customer Cashback',100000,'0',0,null,'PARTY2','BCA-001','2026-08-22','BCA','[]'::jsonb,null,null,'transfer-case2');
  select * into t2 from public.bf_cfc_reconcile_transfer(t2.id,'RECONCILED','matched');
  select * into cb from public.bf_cfc_create_cashback(t2.id,90000,0,0,'over transfer','cashback-case2');
  if cb.amount_due <> 10000 then raise exception 'TEST_CASHBACK_AMOUNT'; end if;

  -- Duplicate Cashback source must fail.
  begin
    perform public.bf_cfc_create_cashback(t2.id,90000,0,0,'duplicate','cashback-case2-duplicate');
    raise exception 'TEST_DUP_CASHBACK_SHOULD_FAIL';
  exception when unique_violation then null;
  end;

  -- Owner marks paid then cannot self-verify.
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
  select * into p2 from public.bf_cfc_mark_paid(cb.id,'2026-08-22','TRANSFER','BCA-OUT','[]'::jsonb,'owner paid','pay-cb-owner');
  begin
    perform public.bf_cfc_verify_payment(p2.id,'VERIFY','self verify must fail');
    raise exception 'TEST_SELF_VERIFY_SHOULD_FAIL';
  exception when insufficient_privilege then null;
  end;

  -- Second Owner verifies.
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111112',false);
  select * into p2 from public.bf_cfc_verify_payment(p2.id,'VERIFY','owner2 verified');

  -- Verified payment reversal restores obligation to payable without deleting history.
  select * into p2 from public.bf_cfc_reverse_payment(p2.id,'wrong destination account');
  if p2.status <> 'REVERSED' then raise exception 'TEST_PAYMENT_REVERSAL_STATUS'; end if;
  if (select status from public.bf_customer_fund_obligations where id=cb.id) <> 'BELUM_DIBAYAR' then raise exception 'TEST_OBLIGATION_NOT_REOPENED'; end if;
  if not exists(select 1 from public.bf_customer_fund_events where case_id=c2.id and event_type='PAYMENT_REVERSAL_CREATED') then raise exception 'TEST_REVERSAL_AUDIT_MISSING'; end if;

  -- Payment can be recorded again after reversal; duplicate active payment cannot.
  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
  select * into p2 from public.bf_cfc_mark_paid(cb.id,'2026-08-22','TRANSFER','BCA-OUT','[]'::jsonb,'repaid','pay-cb-2');
  begin
    perform public.bf_cfc_mark_paid(cb.id,'2026-08-22','TRANSFER','BCA-OUT','[]'::jsonb,'duplicate pay','pay-cb-dup');
    raise exception 'TEST_DUP_PAYMENT_SHOULD_FAIL';
  exception when others then
    if sqlerrm not like '%CFC_OBLIGATION_NOT_PAYABLE%' and sqlstate <> '23505' then raise; end if;
  end;

  -- Complete second payment with Owner verification.
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
  perform public.bf_cfc_verify_payment(p2.id,'VERIFY','verified after correction');

  -- Transfer reversal is blocked while an active obligation exists.
  begin
    perform public.bf_cfc_reverse_transfer(t2.id,'must be blocked by active cashback');
    raise exception 'TEST_TRANSFER_REVERSAL_SHOULD_BLOCK';
  exception when others then
    if sqlerrm not like '%CFC_TRANSFER_HAS_ACTIVE_OBLIGATION%' then raise; end if;
  end;

  -- Timeline is append-only in effect: core event history remains after correction/reversal.
  if (select count(*) from public.bf_customer_fund_events where case_id=c2.id) < 6 then raise exception 'TEST_AUDIT_TOO_SHORT'; end if;
end $$;

-- RLS read test: operator should see zero Customer Funds rows.
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select (count(*)=0) as operator_hidden from public.bf_customer_fund_cases \gset
\if :operator_hidden
  \echo 'PASS: operator RLS read blocked'
\else
  \echo 'FAIL: operator can read Customer Funds'
  \quit 1
\endif
reset role;

\echo 'PASS: R13 Customer Funds PostgreSQL integration harness'
