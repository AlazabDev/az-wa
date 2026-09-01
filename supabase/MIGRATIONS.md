# AzWA database migration policy

The repository currently contains two historical database lineages after the `az-wa` / `azwa-os` merge:

1. tenant-era migrations (`tenant_id`, `tenant_members`, `wa_numbers`, legacy Finance), and
2. the unified AzWA schema (`organizations`, `organization_members`, `business_portfolios`, `wabas`, `whatsapp_numbers`).

The production project configured at the repository root is:

```text
pmhuylckjwrongxlrgrx
```

## Production rule

**Do not run `supabase db push` from this repository until the live migration history has been baselined and the tenant-era migrations have been archived outside `supabase/migrations/`.**

A normal application deployment does not require `db push`. The running TanStack application must target the already-provisioned production schema and must pass `supabase/sql/production_preflight.sql` before traffic is switched.

## Reviewed forward migrations after preflight

Until migration history is baselined, production schema changes remain manual and ordered. The currently required reviewed forward migrations are:

```text
1. supabase/migrations/20260831130000_meta_inventory_completion.sql
2. supabase/migrations/20260901070000_waba_sender_safety.sql
```

Apply them in that order only after reviewing `supabase/sql/production_preflight.sql`. The second migration makes parent-WABA state part of dispatch authorization and disables child senders whenever a WABA becomes non-active; it never re-enables numbers automatically.

## Before enabling automated migrations

1. Export the live schema and migration history from `pmhuylckjwrongxlrgrx`.
2. Compare it against the required tables/RPCs in `production_preflight.sql`.
3. Create one reviewed baseline representing the live Organization/WABA schema.
4. Move old tenant-era SQL to an archival directory that Supabase CLI does not execute.
5. Add all future schema changes as timestamped, forward-only migrations from that baseline.
6. Validate the baseline on a disposable database before production use.

Until those steps are complete, the database migration gate remains intentionally manual.
