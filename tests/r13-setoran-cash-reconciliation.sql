\set ON_ERROR_STOP on

create or replace function public.r13_cash_assert(ok boolean,msg text) returns void language plpgsql as $$begin if not ok then raise exception 'R13_CASH_ASSERT: %',msg;end if;end$$;

create table if not exists public.bf_state_items(
  store_code text not null,
  state_key text not null,
  value text not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key(store_code,state_key)
);

-- ----------------------------------------------------------------
-- Split Setoran: one business event, multiple payment components.
-- ----------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (public.bf_cf_record_case('SET-SPLIT-001','CUST-S','Customer Split',500000,current_date,null,'MIXED','[]'::jsonb,'split','split-case-001')).id as split_case \gset
select public.bf_cf_submit_setoran(
  :'split_case'::uuid,'CUST-S','Customer Split',500000,current_date,
  '[{"method":"TRANSFER","amount":300000,"destination_account":"KALBAR"},{"method":"TUNAI","amount":200000}]'::jsonb,
  '[500000]'::jsonb,false,null,'split-flow-001'
) as split_result \gset
select public.r13_cash_assert((select payment_method_code='MIXED' and jsonb_array_length(payment_components)=2 and settled_note_total=500000 from public.bf_customer_fund_cases where id=:'split_case'::uuid),'split components stored on existing case');
select public.r13_cash_assert((select public.bf_cf_payment_components_total(payment_components)=500000 from public.bf_customer_fund_cases where id=:'split_case'::uuid),'split component total equals Setoran');

-- Existing compatibility RPC delegates to the same canonical backend writer.
select (public.bf_cf_record_case('SET-COMPAT-001','CUST-S','Customer Split',100000,current_date,null,'TUNAI','[]'::jsonb,'compat','compat-case-001')).id as compat_case \gset
select public.bf_cf_submit_setoran_flow(:'compat_case'::uuid,'CUST-S','Customer Split',100000,current_date,'TUNAI',null,'[100000]'::jsonb,false,null,'compat-flow-001');
select public.r13_cash_assert((select jsonb_array_length(payment_components)=1 and payment_components->0->>'method'='TUNAI' from public.bf_customer_fund_cases where id=:'compat_case'::uuid),'legacy submit delegates to one component');

do $$begin
  begin
    perform public.bf_cf_submit_setoran(
      :'split_case'::uuid,'CUST-S','Customer Split',500000,current_date,
      '[{"method":"TRANSFER","amount":300000,"destination_account":"KALBAR"},{"method":"TUNAI","amount":100000}]'::jsonb,
      '[500000]'::jsonb,false,null,'split-bad-total'
    );
    raise exception 'expected CF_PAYMENT_COMPONENT_TOTAL_MISMATCH';
  exception when others then
    if sqlerrm not like '%CF_PAYMENT_COMPONENT_TOTAL_MISMATCH%' then raise; end if;
  end;
end$$;

do $$begin
  begin
    perform public.bf_cf_payment_components_total('[{"method":"TRANSFER","amount":100000}]'::jsonb);
    raise exception 'expected CF_PAYMENT_COMPONENT_ACCOUNT_REQUIRED';
  exception when others then
    if sqlerrm not like '%CF_PAYMENT_COMPONENT_ACCOUNT_REQUIRED%' then raise; end if;
  end;
end$$;

-- Admin cannot cancel; Owner can controlled-reverse when no downstream financial effect.
do $$begin
  begin
    perform public.bf_cf_cancel_setoran('SET-SPLIT-001','admin must not cancel',null);
    raise exception 'expected permission denied';
  exception when sqlstate '42501' then null; end;
end$$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.bf_cf_cancel_setoran('SET-SPLIT-001','Salah input untuk test',null) as cancel_result \gset
select public.r13_cash_assert((select reconciliation_status='REVERSED' from public.bf_customer_fund_cases where id=:'split_case'::uuid),'owner cancellation reverses case');
select public.bf_cf_cancel_setoran('SET-SPLIT-001','retry reversal',null);
select public.r13_cash_assert((select count(*)=1 from public.bf_customer_fund_cases where source_setoran_id='SET-SPLIT-001'),'reversal retry does not duplicate case');

-- ----------------------------------------------------------------
-- Daily cash reconciliation: expense is server-derived from bf_expenses.
-- Customer Setoran is intentionally not included as cash-in.
-- ----------------------------------------------------------------
reset role;
insert into public.bf_state_items(store_code,state_key,value,revision)
values('BINTANG-Y70M','bf_expenses',jsonb_build_array(
  jsonb_build_object('id','EXP-001','tanggal',current_date::text,'kategori','BBM','nominal',100000,'keterangan','Test tunai'),
  jsonb_build_object('id','EXP-DEL','tanggal',current_date::text,'kategori','Hapus','nominal',50000,'deleted_at',now()::text),
  jsonb_build_object('id','EXP-OLD','tanggal',(current_date-1)::text,'kategori','Kemarin','nominal',90000)
)::text,7)
on conflict(store_code,state_key) do update set value=excluded.value,revision=excluded.revision;

-- A fake Customer Setoran cash movement must not become cash-in.
insert into public.bf_cash_movements(movement_date,direction,movement_type,amount,source_ref_type,source_ref_id,description,created_by)
values(current_date,'IN','CUSTOMER_SETORAN',999999,'TEST','SETORAN-NOT-CASH-IN','must be ignored','11111111-1111-1111-1111-111111111111');

set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select public.bf_cash_get_expense_snapshot(current_date,'BINTANG-Y70M') as exp_snapshot \gset
select public.r13_cash_assert((:'exp_snapshot'::jsonb->>'total')::numeric=100000,'expense snapshot excludes deleted/other dates');
select public.r13_cash_assert(jsonb_array_length(:'exp_snapshot'::jsonb->'items')=1,'expense snapshot keeps traceable source item');
select (public.bf_cash_submit_reconciliation(current_date,'BINTANG-Y70M',500000,1000000,0,0,0,0,1300000,'Admin submit',null)).id as recon_id \gset
select revision as recon_rev from public.bf_cash_reconciliations where id=:'recon_id'::uuid \gset
select public.r13_cash_assert((select status='SUBMITTED' and expense_total_snapshot=100000 and expected_cash=1400000 and physical_cash=1300000 and difference=-100000 and verified_by is null from public.bf_cash_reconciliations where id=:'recon_id'::uuid),'admin submits server-derived reconciliation');
select public.r13_cash_assert((select expense_source_revision=7 and jsonb_array_length(expense_source_items)=1 from public.bf_cash_reconciliations where id=:'recon_id'::uuid),'reconciliation stores expense source revision and references');

do $$begin
  begin
    perform public.bf_cash_review_reconciliation(:'recon_id'::uuid,'APPROVE',null,:'recon_rev'::bigint);
    raise exception 'expected owner permission';
  exception when sqlstate '42501' then null; end;
end$$;

-- Stale revision protects concurrent resubmit.
select public.bf_cash_submit_reconciliation(current_date,'BINTANG-Y70M',500000,1000000,0,0,0,0,1300000,'Admin resubmit',:'recon_rev'::bigint) as resubmit \gset
select revision as recon_rev2 from public.bf_cash_reconciliations where id=:'recon_id'::uuid \gset
do $$begin
  begin
    perform public.bf_cash_submit_reconciliation(current_date,'BINTANG-Y70M',500000,1000000,0,0,0,0,1300000,'stale',:'recon_rev'::bigint);
    raise exception 'expected CASH_STALE_REVISION';
  exception when others then
    if sqlerrm not like '%CASH_STALE_REVISION%' then raise; end if;
  end;
end$$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.bf_cash_review_reconciliation(:'recon_id'::uuid,'APPROVE','Sudah diperiksa',:'recon_rev2'::bigint);
select public.r13_cash_assert((select status='VERIFIED' and verified_by='11111111-1111-1111-1111-111111111111'::uuid from public.bf_cash_reconciliations where id=:'recon_id'::uuid),'Owner final approval');

do $$begin
  begin
    perform public.bf_cash_submit_reconciliation(current_date,'BINTANG-Y70M',500000,1000000,0,0,0,0,1300000,'must remain locked',null);
    raise exception 'expected final lock';
  exception when others then
    if sqlerrm not like '%CASH_RECONCILIATION_FINAL_LOCKED%' then raise; end if;
  end;
end$$;

-- Legacy RPC ignores the manual expense argument and derives expense from canonical bf_expenses.
reset role;
insert into public.bf_state_items(store_code,state_key,value,revision)
values('BINTANG-Y70M','bf_expenses',jsonb_build_array(
  jsonb_build_object('id','EXP-LEGACY','tanggal',(current_date+1)::text,'kategori','Legacy day','nominal',200000)
)::text,8)
on conflict(store_code,state_key) do update set value=excluded.value,revision=excluded.revision;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.bf_cf_reconcile_cash_day(current_date+1,0,1000000,0,0,9999999,0,0,800000,'legacy delegate');
select public.r13_cash_assert((select expense_total_snapshot=200000 and status='VERIFIED' from public.bf_cash_reconciliations where reconciliation_date=current_date+1),'legacy RPC delegates and ignores manual expense');

reset role;
select 'R13 Setoran + Daily Cash Reconciliation PostgreSQL harness PASS' result;
