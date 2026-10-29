# AzWA clean Supabase project setup

This document records the newly provisioned Supabase project. It does **not** declare the project production-ready and does not authorize applying SQL.

## Project

- Project name: `azwa-clean-db`
- Project ref: `jijajanwnbdsxekngeve`
- Region: `eu-central-1` (Frankfurt)
- API URL: `https://jijajanwnbdsxekngeve.supabase.co`
- Organization: `az-whatsapp`
- Provisioning status: `ACTIVE_HEALTHY`

## Current database state (checked after provisioning)

- Public tables: 0
- Public routines: 0
- Recorded migrations: 0

The project is currently an empty database. Do not point production traffic at it until the reviewed clean-backend schema, grants, RLS policies, required RPCs, and non-secret inventory baseline have been installed and verified.

## Environment configuration

Configure these values in the deployment environment's ignored `.env` file or deployment secret store. Do not commit actual environment files or secret keys.

```dotenv
VITE_SUPABASE_URL=https://jijajanwnbdsxekngeve.supabase.co
VITE_SUPABASE_PROJECT_ID=jijajanwnbdsxekngeve
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key-from-Supabase-Dashboard>

SUPABASE_URL=https://jijajanwnbdsxekngeve.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-key-from-Supabase-Dashboard>
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-or-compatible-secret-key>
```

- `VITE_SUPABASE_PUBLISHABLE_KEY` is public by design; access to data must still be protected with grants and RLS.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and bypasses RLS. Never prefix it with `VITE_`, commit it, put it in browser code, or share it in chat.
- Retrieve keys from the project's Supabase Dashboard. Do not use the legacy `anon` key when the publishable key is available.
- Keep Meta credentials, Verify Tokens, cron secrets, and Vault secret values out of Git. Store Meta credentials through AzWA's reviewed backend/Vault flow.

## Schema and migration gate

Follow [`supabase/MIGRATIONS.md`](../../supabase/MIGRATIONS.md) and [`PRODUCTION.md`](../../PRODUCTION.md).

**Never run `supabase db push` against the historical `supabase/migrations/` lineage.** The new project has no schema yet, so application readiness checks are expected to fail until a reviewed clean baseline is installed.

Do not use `supabase/sql/schema.sql` as executable setup: it is marked context-only and contains the older tenant-era schema. Treat `supabase/sql/reference/azwa_foundation.sql` as a review artifact, not an approved one-shot bootstrap; its embedded Meta inventory seed must be reconciled with the current inventory before any use. The production preflight is read-only and is a verification gate, not a schema installer.

Before enabling traffic:

1. Identify or prepare the complete, reviewed clean-backend SQL baseline for the 2026-09-04 generation, including identity/RBAC, explicit server-only RLS, runtime/webhook persistence, outbox/jobs, and required RPCs.
2. Reconcile the non-secret Meta inventory seed with the current audited inventory; import secrets separately through Vault and never commit them.
3. Apply only reviewed forward-only SQL to this new project, in documented order, with RLS enabled for every public data table and fixed `search_path` plus explicit grants for each `SECURITY DEFINER` function.
4. Run `supabase/sql/production_preflight.sql`; every BLOCKER query must return zero rows.
5. Run the application's build, typecheck, lint, readiness, authentication, webhook, and sender-safety smoke tests.
6. Only after all gates pass, explicitly switch the intended deployment environment to this project. Do not silently replace the existing production project reference.

## Provisioning audit

The project was created in the `az-whatsapp` organization in Frankfurt. At the time of this check, the Supabase API reported `ACTIVE_HEALTHY`, with no public tables, no public routines, and no recorded migrations. No SQL migration or schema change was applied as part of provisioning.
