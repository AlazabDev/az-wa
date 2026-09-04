# AzWA clean database migration policy

## Current database generation

The previous AzWA Supabase backend was intentionally deleted on 2026-09-04.
The current backend was rebuilt from a clean database and validated in ordered stages:

1. `001` — identity / RBAC / Meta control plane.
2. `001A` — explicit server-only RLS policies + covering FK indexes.
3. `001B` — audited Meta inventory seed.
4. `002` — messaging runtime / webhook persistence / outbox / jobs / campaigns / automation / audit.
5. `002A` — Vault credential import. **Secret-bearing and never committed to Git.**

Validated current inventory:

```text
Business Portfolio: 1
Meta Apps: 9
WABAs: 7
WhatsApp Numbers: 9
Templates: 94
Flows: 21
Observed WABA/App subscriptions: 17
```

Current Business Portfolio Meta ID:

```text
314437023701205
```

## Critical rule

**Do not run `supabase db push` from the historical files currently under `supabase/migrations/`.**

Those files belong to the deleted backend lineage and are not the source of truth for the clean database.
They contain tenant-era and intermediate schemas that conflict with the current Organization/WABA runtime.

Application deployment (`deploy/deploy.sh`) must never execute those historical migrations.

## Production source of truth

The live clean database plus the reviewed clean-backend SQL set are authoritative.
Before live traffic is enabled, run:

```text
supabase/sql/production_preflight.sql
```

Every BLOCKER query must return zero rows.

## Rules for all future schema work

1. Never restore a historical tenant-era table or RPC merely because an old migration contains it.
2. Never edit the live database with an unreviewed `db push`.
3. Create forward-only migrations from the clean 2026-09-04 baseline.
4. Never commit Vault secrets, Meta tokens, App Secrets, Verify Tokens or service-role keys.
5. `meta_credentials.secret_reference` stores only Vault references; browser clients never receive decrypted values.
6. Browser table access remains denied. Authenticated UI reads/writes go through reviewed server contracts/RPCs.
7. Every new foreign key requires a covering index unless there is a documented reason not to create one.
8. Every new public data table must enable RLS before deployment.
9. Every `SECURITY DEFINER` function must use an empty/fixed `search_path` and explicit EXECUTE grants.
10. Webhook processing follows: verify → persist → deduplicate → queue → HTTP 200 → async worker.

## Historical migration directory

The current `supabase/migrations/` directory is retained only as historical repository evidence until it is archived in a dedicated cleanup commit. It must not be executed against the clean AzWA project.

Any automation that attempts to apply it to production is a deployment blocker.
