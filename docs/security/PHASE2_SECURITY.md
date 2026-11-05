# AzWA Phase 2 — Security & Data Integrity

## Verified code remediation

- `supabase/functions/wa_webhook_inbound/index.ts`: removed signature bypass; unconfigured GET challenge fails with 503.
- `supabase/functions/whatsapp_webhook/index.ts`: removed signature bypass when the app secret is unset.
- `supabase/functions/_shared/meta-signature.mjs`: shared HMAC-SHA256 verifier for raw HTTP bytes, strict `sha256=` syntax and equal-length byte comparison.
- `scripts/meta-signature.test.mjs`: tests correct signature, changed payload, malformed or missing signature/secret, ArrayBuffer and sliced arrays.
- `scripts/security-contract.test.mjs`: regression checks for fail-closed webhook integration and quality-gate coverage.
- `scripts/security-scan.mjs`: added a left token boundary so embedded base64 and minified-code substrings are not mistaken for standalone Meta tokens. Secret detection remains enabled.
- `.github/workflows/quality-gate.yml`: security tests and scan added to CI.
- Both legacy Webhook handlers now constrain message status updates to the set of tenants belonging to the receiving phone number; cross-tenant end-to-end behavior still requires testing against the actual schema.
- `supabase/functions/DEPLOYMENT.md`: removed blanket advice to deploy privileged Edge Functions with disabled JWT verification.
- `deploy/deploy.sh`: explicitly refuses migration flags and contains no `supabase db push`, because the migrations directory is historical.

## Confirmed hazard: distinct historical database generations

`supabase/MIGRATIONS.md` explicitly states that `supabase/migrations/` is a **historical deleted-backend lineage** and must never be pushed into the clean project. The alternative `supabase/sql/schema.sql` is also context-only and reflects tenant-era tables. Phase 2 blocks `--apply-migrations` in `deploy/deploy.sh`, which previously had a `supabase db push` branch. Any future schema change needs a reviewed forward-only clean-generation migration, never automatic historical push.

`supabase/functions/api_keys_manage/index.ts:44-151` assumes `tenant_members`, `tenant_id`, and `disabled_at` and constructs keys with prefix `sk_live_`. In contrast, historical `supabase/migrations/026_api_keys.sql:41-54` defines `api_keys.account_id`, `revoked_at`, `expires_at`; the account API uses the `wacrm_live_` key contract. **Do not assume these two models share one live schema or deploy the function until the actual target project is verified.** No migration has been generated because the target database was not inspected.

## Confirmed unresolved risk: webhook processing durability

`supabase/functions/whatsapp_webhook/index.ts` acknowledges a valid event with HTTP 200 while processing may be deferred to `EdgeRuntime.waitUntil()`. Verify persistence of the event and idempotent queueing *before* acknowledging in the selected production receiver. The primary `supabase/functions/wa-webhook` already has a separate implementation; discover the actual Meta Callback URL, ingress route and duplicate processors before consolidation.

## Other unverified concerns

- Multiple competing `src/app` Next.js routes, TanStack routes and multiple Supabase webhook receivers. Route registration and deployment state require runtime verification.
- Migration collection contains 71 mixed legacy and timestamped files; inventory checks do not prove applicability against a remote DB.
- Some RLS policies in migrations may be replaced by later migrations, so a static grep alone does not reveal final effective privileges. Run `phase2-database-readonly.sql` against the chosen target and review results before remediation.
- Authentication/session, every user-facing server function, and cross-account isolation need integration tests with two test identities and separate accounts.
- `bun install`, production build, TypeScript, deployed integrations, and actual Meta signature ingress cannot be validated in this container without Node 24/Bun and authorized connections.

## Stop-ship conditions

1. Any unsigned Meta event reaches a privileged handler.
2. Multiple live receiver paths can process the same delivery without durable idempotency.
3. API key schema/API contract mismatch remains callable.
4. Any authenticated user can read or mutate a different account's data.
5. Migration history and RLS policy state are not confirmed on the target DB.
6. CI build/typecheck/lint/security tests and staging integration tests are not green.

No production data, secrets, or Supabase migrations were modified in this phase.
