# AzWA production deployment runbook

This runbook applies to the unified TanStack Start application in this repository.

## Production sources of truth

- Web/server runtime: TanStack Start + Nitro `node-server`
- Runtime Node version: Node.js 24
- Dependency/build manager: Bun using `bun.lock`
- Supabase project: `pmhuylckjwrongxlrgrx`
- Canonical web host: `https://wa.alazab.com`
- Canonical public Meta webhook: `https://wa.alazab.com/webhooks/meta/whatsapp`
- Internal application webhook route: `/api/public/webhooks/meta/whatsapp`
- Media worker: `https://wa.alazab.com/api/public/jobs/media`
- Meta Graph API: `v26.0`
- Server checkout: `/mnt/apps/az-wa`

The old Supabase Edge `wa-webhook`, `wa-send`, and `wa-health` functions are legacy code and are not production entrypoints.

## 1. Create production environment

On the server, create `.env` from `.env.example`. It is intentionally ignored by Git.

Required values:

```bash
VITE_SUPABASE_URL=https://pmhuylckjwrongxlrgrx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY='<publishable-key>'
VITE_SUPABASE_PROJECT_ID=pmhuylckjwrongxlrgrx

SUPABASE_URL=https://pmhuylckjwrongxlrgrx.supabase.co
SUPABASE_PUBLISHABLE_KEY='<publishable-key>'
SUPABASE_SERVICE_ROLE_KEY='<service-role-or-secret-key>'

META_GRAPH_VERSION=v26.0
META_WEBHOOK_PUBLIC_URL=https://wa.alazab.com/webhooks/meta/whatsapp
AZWA_CRON_SECRET='<long-random-secret>'
AZWA_CRON_SECRET_PREVIOUS=

VITE_ENABLE_LEGACY_UI=false
```

`SUPABASE_SERVICE_ROLE_KEY`, cron secrets and Meta secrets are server-side values. Never prefix them with `VITE_`.

Meta credentials should normally be configured from **AzWA → Meta App** and stored through the backend credential RPC/Vault path. The browser never receives the secret values.

Required Meta credentials for the initial production setup:

- App ID
- Verify Token
- App Secret
- App Access Token
- System User Token

`META_SYSTEM_USER_TOKEN` in `.env` is an emergency/fallback resolver only. It may remain empty after the scoped Vault credential is configured and verified.

## 2. Database gate

The repository still contains mixed historical migration lineages from before the application merge. Therefore:

```text
DO NOT run supabase db push blindly in production.
```

Read `supabase/MIGRATIONS.md`.

Before deployment, run this read-only file against the production database:

```text
supabase/sql/production_preflight.sql
```

Every section marked `BLOCKER` must return zero rows. The final count query is informational.

The inventory-completion schema also requires the additive migration:

```text
supabase/migrations/20260831130000_meta_inventory_completion.sql
```

Apply it only after the preflight has been reviewed. It adds the Graph v26 inventory entities and sender-safety enforcement; it does not hard-delete historical Meta assets.

The current application expects, among others, the following RPCs to already exist:

```text
azwa_has_org_permission
backend_resolve_meta_token
backend_store_meta_credential
backend_decrypt_secret_reference
backend_list_webhook_secrets
backend_ingest_webhook_event
backend_ingest_inbound_message
backend_apply_message_status
backend_claim_jobs
backend_complete_job
backend_fail_job
```

The application also expects these inventory tables/fields after the inventory-completion migration:

```text
wabas.message_template_namespace
whatsapp_numbers.account_mode
whatsapp_flows
waba_subscribed_apps
waba_assigned_users
```

## 3. Meta configuration

In AzWA → **Meta App**, save all five values:

- App ID
- Verify Token
- App Secret
- App Access Token
- System User Token

The canonical callback entered in Meta is:

```text
https://wa.alazab.com/webhooks/meta/whatsapp
```

The supplied Nginx site `deploy/wa.alazab.com` maps that public route internally to:

```text
/api/public/webhooks/meta/whatsapp
```

Do not configure the internal route as a second callback and do not configure the old Supabase Edge Function URL.

The GET verification token is resolved from the stored webhook credential. POST requests are accepted only with a valid `X-Hub-Signature-256` signature matching a configured App Secret.

After saving credentials:

1. Reconcile the Meta App webhook subscription.
2. Sync the Business Portfolio.
3. Allow discovery to reconcile owned/client WABAs and phone numbers.
4. Allow the sync to reconcile templates, flows, subscribed apps and assigned users.
5. Historical assets that disappear from Meta are marked missing/inactive rather than deleted.
6. A disconnected/restricted/missing phone number must never remain an enabled sender.

## 4. Audited inventory baseline

The 2026-08-31 Graph v26 inventory is stored in code only as a **non-secret comparison baseline**. Runtime discovery remains authoritative.

Audited snapshot:

```text
Business Portfolio: 314437023701205
AzWA App:            1061494059972503
WABAs:               6
Phone Numbers:       8
Templates:           94
WhatsApp Flows:      21
Subscribed Apps:     17
```

Do not use these counts or IDs to route messages. They exist only to detect drift between the audited inventory and the live Meta control plane.

The previous WABA `922964860845619` / phone `1328521857002632` is absent from the current inventory; if it exists historically in PostgreSQL it must be marked missing by reconciliation, not hard-deleted.

## 5. Local release validation

Use Bun, because `bun.lock` is the single dependency lockfile:

```bash
bun install --frozen-lockfile
bun audit
bun run build
bun run typecheck
bun run lint
```

The GitHub **Production CI** workflow performs build, TypeScript and lint validation on pull requests and release changes.

A remaining audit item in a build-only/dev dependency must be evaluated by dependency path and runtime exposure; do not force incompatible package overrides merely to suppress an audit result.

## 6. Container deployment

Server prerequisites:

- Docker Engine
- Docker Compose plugin
- Nginx
- certbot
- DNS A/AAAA records for `wa.alazab.com`

Production checkout:

```bash
cd /mnt/apps/az-wa
git pull --ff-only
chmod 600 .env
./deploy/deploy.sh
```

`deploy/deploy.sh` and `docker-compose.yml` both consume the existing `.env` file. Do not create `.env.production`.

The container runs the generated Nitro Node server on port `3000` and is bound only to:

```text
127.0.0.1:8085
```

Liveness:

```text
GET /healthz
```

Readiness validates access to the production Supabase schema:

```text
GET /readyz
```

## 7. Host Nginx

The only repository Nginx site file for this application is:

```text
deploy/wa.alazab.com
```

Install exactly that file:

```bash
sudo cp deploy/wa.alazab.com /etc/nginx/sites-available/wa.alazab.com
sudo ln -sfn /etc/nginx/sites-available/wa.alazab.com /etc/nginx/sites-enabled/wa.alazab.com
sudo nginx -t
sudo systemctl reload nginx
```

If the certificate does not yet exist, issue it before installing an SSL configuration that references the certificate paths. Do not create an alternate `.conf` file for this application.

## 8. Media worker schedule

Webhook ingestion immediately attempts to drain the media queue. The protected worker endpoint is the retry/safety net.

The worker must source `/mnt/apps/az-wa/.env` at runtime and send:

```text
Authorization: Bearer $AZWA_CRON_SECRET
```

to:

```text
POST https://wa.alazab.com/api/public/jobs/media
```

Never place the actual cron secret in Git or in the system crontab command line.

## 9. Inventory-driven production readiness

Open:

```text
AzWA → Health & Diagnostics → Meta production readiness
```

The gate compares the live database state with the audited inventory while keeping runtime discovery authoritative. It checks:

- Graph API v26
- AzWA Meta App identity
- Business Portfolio identity
- Verify Token / App Secret / App Access Token / System User Token in Vault
- active webhook endpoint
- WABA discovery
- phone-number discovery and inventory drift
- sender safety for disconnected/restricted/missing numbers
- template inventory
- WhatsApp Flow inventory
- AzWA subscription on every active WABA

Do not release while this panel reports a critical failure.

## 10. Post-deployment smoke checks

```bash
curl -fsS https://wa.alazab.com/healthz
curl -fsS https://wa.alazab.com/readyz
curl -sS -o /dev/null -w '%{http_code}\n' https://wa.alazab.com/auth
```

Then validate through the application and Meta:

1. Sign-in works for an authorized organization member.
2. Meta App reports all four stored secret classes plus the App ID.
3. The public webhook callback verifies at `https://wa.alazab.com/webhooks/meta/whatsapp`.
4. App webhook subscription reconciliation succeeds.
5. Business Portfolio sync discovers the current WABAs and phone numbers.
6. The disconnected phone remains disabled for sending.
7. Templates synchronize for every WABA.
8. WhatsApp Flows synchronize for every WABA and lifecycle actions are correctly scoped.
9. WABA subscribed-app inventory is visible and AzWA is subscribed to every active WABA.
10. A signed inbound text message creates/updates webhook, contact, conversation and message state.
11. A real outbound text message is sent from the selected active number.
12. An approved template is sent from a number belonging to the same WABA.
13. Delivery/read callbacks transition the message status history.
14. An inbound media message is permanently downloaded by the media pipeline.
15. `/api/public/jobs/media` rejects a missing/wrong cron token.
16. An unknown Meta phone number raises an alert rather than being discarded.
17. No production user can enter `/legacy/*` while `VITE_ENABLE_LEGACY_UI=false`.
18. Health → Meta production readiness has zero critical failures.

## 11. Release gate

Do not merge/deploy when any of these are true:

- Production CI is not green.
- `production_preflight.sql` returns a blocker.
- the inventory-completion migration has not been reviewed/applied where required.
- `/readyz` is not HTTP 200.
- Meta webhook URL is not the canonical public `/webhooks/meta/whatsapp` route.
- any required Meta credential is incomplete.
- AzWA is not subscribed to every active WABA.
- a non-active phone number is enabled as a sender.
- Health → Meta production readiness reports a critical failure.
- the old Supabase `wa-webhook` is still configured in Meta.
- `VITE_ENABLE_LEGACY_UI` is enabled unintentionally.

After every gate passes, deploy with:

```bash
cd /mnt/apps/az-wa
./deploy/deploy.sh
```
