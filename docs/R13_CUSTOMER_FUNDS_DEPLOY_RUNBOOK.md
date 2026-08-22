# R13 Customer Funds + Nota/Dana Titipan — Deploy Runbook

Status target: deploy-ready. Production is not modified by this document.

## Non-negotiable invariants

- Kasir Pintar remains the canonical sales/POS writer.
- `bf_note_setoran_v26` remains the single canonical incoming-money/Setoran writer in R13.
- Customer Funds relational tables never create a second Setoran or Sales writer; they store reconciliation references, allocations, classifications, obligations, deposit ledger, payouts, and audit events.
- No direct authenticated-client DML to financial tables. UI uses RPC only.
- Owner approval/verification remains distinct from Admin input.
- Posted financial records are corrected through controlled correction/reversal, not destructive edit/delete.
- Production frontend must not be released before all backend migrations complete successfully.

## Production preflight — mandatory, read-only

Run immediately before migration:

```sql
select 'bf_customer_fund_cases' t,count(*) n from public.bf_customer_fund_cases
union all select 'bf_customer_fund_events',count(*) from public.bf_customer_fund_events
union all select 'bf_customer_fund_obligations',count(*) from public.bf_customer_fund_obligations
union all select 'bf_customer_fund_payments',count(*) from public.bf_customer_fund_payments
union all select 'bf_customer_fund_transfers',count(*) from public.bf_customer_fund_transfers
union all select 'bf_customer_setoran',count(*) from public.bf_customer_setoran
union all select 'bf_entrusted_notes',count(*) from public.bf_entrusted_notes;
```

Expected for the abandoned legacy CFC implementation: every count is `0`. The first migration independently repeats this check and aborts with `R13_LEGACY_CFC_NOT_EMPTY` if any legacy business row exists. Never bypass this gate.

Also verify the current production Setoran state is still in `bf_state_items` and that `bf_profiles` remains the active identity/role source.

## Migration order — automatic and manual order are identical

Apply exactly in filename order:

1. `202608220001_r13_legacy_cfc_retirement.sql`
2. `202608220010_r13_nota_dana_titipan.sql`
3. `202608220020_r13_nota_dana_titipan_hardening.sql`
4. `202608220030_r13_nota_dana_titipan_workflow_controls.sql`
5. `202608220040_r13_nota_dana_titipan_cash_hardening.sql`
6. `202608220050_r13_nota_dana_titipan_signature_hardening.sql`
7. `202608220060_r13_customer_funds_foundation.sql`
8. `202608220070_r13_customer_funds_lifecycle.sql`

Do not apply only a subset and expose the frontend. If any migration fails, stop before frontend deployment and investigate the exact failure.

## Backend verification before frontend release

Required checks after migration:

```sql
select to_regclass('public.bf_entrusted_notes') is not null as entrusted_ready,
       to_regclass('public.bf_customer_fund_cases') is not null as funds_ready,
       to_regclass('public.bf_customer_commission_obligations') is not null as commission_ready,
       to_regclass('public.bf_customer_deposit_ledger') is not null as deposit_ready,
       to_regclass('public.bf_cash_movements') is not null as cash_ready;

select proname
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (proname like 'bf_nt_%' or proname like 'bf_cf_%')
order by proname;
```

Then verify RLS is enabled on all `bf_customer_fund_*`, obligation, payout, deposit-ledger and event tables, and verify authenticated clients have no direct INSERT/UPDATE/DELETE grants on those financial tables.

## Release order

1. Confirm GitHub CI is green for the exact commit intended for release.
2. Confirm latest Vercel branch preview for the exact commit is `READY`.
3. Run production preflight and confirm legacy collision tables are empty.
4. Take a current database backup/snapshot using the platform's verified backup mechanism.
5. Apply all eight migrations in sequence.
6. Run backend verification queries and security advisors.
7. Deploy/merge the exact frontend commit only after backend verification passes.
8. Smoke test Owner and Admin workflows.
9. Keep the release under exception monitoring until the first real end-to-end Setoran has reconciled successfully.

## Mandatory smoke scenarios

### Setoran

- Admin creates Setoran using an existing Customer ID.
- Cloud ACK must complete; UI must never report success while `bf_note_setoran_v26` remains dirty.
- `bf_cf_record_case` must return a Customer Funds Case ID.
- If RPC ACK is lost/fails, Setoran remains safe and shows `PENDING`; `Retry Customer Funds` must converge idempotently without a duplicate case.

### Reconciliation and allocation

- Owner confirms Actual Received and any bank fee/difference.
- Admin proposes external POS/Nota reference; Owner validates it.
- Admin proposes allocation; Owner confirms it.
- Excess is backend-derived and cannot be classified twice.

### Customer Commission

- Admin proposes Customer Commission; Owner approves.
- Customer-borne bank fee reduces the obligation only once.
- Partial and combined payout can allocate multiple obligations.
- Recipient signature is mandatory.
- Cash movement occurs once at actual payout recording; Owner Verification must not create a second cash movement.

### Deposit

- Approved excess classification creates Deposit ledger balance.
- Pending use reserves both Deposit balance and target Nota capacity.
- Owner approval posts the use.
- Commission/Refund liability can be transferred to Deposit through Owner approval.
- Deposit refund requires signature and can be reversed without balance drift.

### Wrong-transfer refund

- Wrong transfer classification creates a refund obligation.
- Partial payout, correction-required, verification, and reversal preserve audit and cash consistency.

### Cash reconciliation

- Dana Titipan, Customer Commission, Customer Refund, and Customer Deposit Refund appear as separate cash-out categories.
- Reversed cash movements are excluded.
- A late payout/reversal marks affected reconciliation stale/correction-required according to the cash hardening workflow.

## Stop / rollback criteria

Stop release immediately if any of these occur:

- `R13_LEGACY_CFC_NOT_EMPTY`.
- Any migration error.
- Any new unauthenticated/authenticated direct financial-table write grant.
- Setoran reports success before durable cloud ACK.
- Duplicate Customer Funds Case for one Setoran ID/idempotency key.
- Duplicate cash movement for one payout source.
- Deposit or obligation available balance becomes negative.
- Owner-only action succeeds as Admin/non-Owner.
- Vercel preview/build is not READY for the exact commit.

### Rollback strategy

Before frontend release, a failed backend migration transaction should be allowed to roll back and the frontend must remain on the old production commit.

After frontend release and before real business data is created, rollback is: restore frontend to the previous production commit, then inspect whether new relational tables contain any rows. Do not destructively drop new financial tables if they contain business data.

After any real Customer Funds/Nota business record exists, do **not** perform schema-destructive rollback. Roll frontend back if necessary, preserve all relational records, disable affected entry points, and repair forward with additive correction migration. Financial data is append/correct/reverse, not delete-and-recreate.

## Evidence required to mark READY FOR DEPLOY

- Static JS safety: PASS.
- Setoran single-writer logic: PASS.
- Legacy non-empty retirement refusal: PASS.
- Legacy empty retirement cleanup: PASS.
- Nota/Dana Titipan PostgreSQL integration: PASS.
- Signature, correction, reversal, cash hardening: PASS.
- Customer Funds foundation: PASS.
- Customer Funds full lifecycle: PASS.
- Migration replay/idempotency: PASS.
- Migration filename order gate: PASS.
- Production compatibility preflight: PASS (read-only audit).
- Exact-commit Vercel preview: READY.
- PR remains unmerged until production deployment is intentionally started.
