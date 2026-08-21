-- R13 legacy Customer Funds Control retirement gate
-- MUST run before the new Nota/Dana Titipan + Customer Funds migrations.
-- Production audit 2026-08-22 found these legacy tables empty, but this migration
-- independently re-checks at deploy time and aborts if ANY legacy business row exists.
begin;

do $$
declare r record; n bigint; total bigint:=0;
begin
  for r in
    select unnest(array[
      'bf_customer_fund_cases','bf_customer_fund_events','bf_customer_fund_obligations',
      'bf_customer_fund_payments','bf_customer_fund_transfers','bf_customer_setoran','bf_entrusted_notes'
    ]) as tbl
  loop
    if to_regclass('public.'||r.tbl) is not null then
      execute format('select count(*) from public.%I',r.tbl) into n;
      total:=total+n;
      if n>0 then
        raise exception 'R13_LEGACY_CFC_NOT_EMPTY: public.% contains % row(s). Automatic retirement refused.',r.tbl,n using errcode='P0001';
      end if;
    end if;
  end loop;
  if total<>0 then raise exception 'R13_LEGACY_CFC_NOT_EMPTY';end if;
end $$;

-- Functions from the abandoned legacy implementation are not referenced by the
-- rolled-back R13 frontend. Remove them before replacing colliding table names.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'bf_cfc_%'
  loop
    execute format('drop function if exists %s cascade',r.signature);
  end loop;
end $$;

-- Drop only the explicitly audited empty legacy data model. CASCADE removes only
-- dependent legacy indexes/policies/FKs/views; no canonical bf_state_items data is touched.
drop table if exists public.bf_customer_fund_payments cascade;
drop table if exists public.bf_customer_fund_obligations cascade;
drop table if exists public.bf_customer_fund_transfers cascade;
drop table if exists public.bf_customer_fund_events cascade;
drop table if exists public.bf_entrusted_notes cascade;
drop table if exists public.bf_customer_setoran cascade;
drop table if exists public.bf_customer_fund_cases cascade;

-- Known abandoned legacy sequences may survive table removal.
drop sequence if exists public.bf_cfc_case_seq cascade;
drop sequence if exists public.bf_cfc_note_seq cascade;
drop sequence if exists public.bf_cfc_obligation_seq cascade;
drop sequence if exists public.bf_cfc_setoran_seq cascade;

commit;