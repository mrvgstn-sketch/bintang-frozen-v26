-- Explicitly remove anonymous execution from R13 Setoran + cash reconciliation RPCs.
-- Previous ACL hardening revoked PUBLIC but production already carried explicit anon grants.

begin;

revoke execute on function public.bf_cf_payment_components_total(jsonb) from anon;
revoke execute on function public.bf_cf_submit_setoran(uuid,text,text,numeric,date,jsonb,jsonb,boolean,text,text) from anon;
revoke execute on function public.bf_cf_submit_setoran_flow(uuid,text,text,numeric,date,text,text,jsonb,boolean,text,text) from anon;
revoke execute on function public.bf_cf_cancel_setoran(text,text,bigint) from anon;
revoke execute on function public.bf_cash_expense_snapshot(date,text) from anon;
revoke execute on function public.bf_cash_get_expense_snapshot(date,text) from anon;
revoke execute on function public.bf_cash_submit_reconciliation(date,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,bigint) from anon;
revoke execute on function public.bf_cash_review_reconciliation(uuid,text,text,bigint) from anon;
revoke execute on function public.bf_nt_mark_cash_reconciliation_stale(date,text) from anon;
revoke execute on function public.bf_cf_reconcile_cash_day(date,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) from anon;
revoke execute on function public.bf_nt_reconcile_cash(date,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) from anon;

-- Preserve intended signed-in access. Each SECURITY DEFINER RPC performs its own role guard.
grant execute on function public.bf_cf_payment_components_total(jsonb) to authenticated;
grant execute on function public.bf_cf_submit_setoran(uuid,text,text,numeric,date,jsonb,jsonb,boolean,text,text) to authenticated;
grant execute on function public.bf_cf_submit_setoran_flow(uuid,text,text,numeric,date,text,text,jsonb,boolean,text,text) to authenticated;
grant execute on function public.bf_cf_cancel_setoran(text,text,bigint) to authenticated;
grant execute on function public.bf_cash_expense_snapshot(date,text) to authenticated;
grant execute on function public.bf_cash_get_expense_snapshot(date,text) to authenticated;
grant execute on function public.bf_cash_submit_reconciliation(date,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,bigint) to authenticated;
grant execute on function public.bf_cash_review_reconciliation(uuid,text,text,bigint) to authenticated;
grant execute on function public.bf_nt_mark_cash_reconciliation_stale(date,text) to authenticated;
grant execute on function public.bf_cf_reconcile_cash_day(date,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) to authenticated;
grant execute on function public.bf_nt_reconcile_cash(date,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) to authenticated;

commit;
