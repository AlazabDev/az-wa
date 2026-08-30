# AzWA production deployment runbook

This runbook applies to the unified TanStack Start application in this repository.

## Production sources of truth

- Web/server runtime: TanStack Start + Nitro `node-server`
- Runtime Node version: Node.js 24
- Dependency/build manager: Bun using `bun.lock`
- Supabase project: `pmhuylckjwrongxlrgrx`
- Canonical web host: `https://wa.alazab.com`
- Meta webhook: `https://wa.alazab.com/api/public/webhooks/meta/whatsapp`
- Media worker: `https://wa.alazab.com/api/public/jobs/media`

The old Supabase Edge `wa-webhook`, `wa-send`, and `wa-health` functions are legacy code and are not production entrypoints.

## 1. Create production environment

On the server, create `.env.production` from `.env.example`. It is intentionally ignored by Git.

Required values:

```bash
VITE_SUPABASE_URL=https://pmhuylckjwrongxlrgrx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY='<publishable-key>'
VITE_SUPABASE_PROJECT_ID=pmhuylckjwrongxlrgrx

SUPABASE_URL=https://pmhuylckjwrongxlrgrx.supabase.co
SUPABASE_PUBLISHABLE_KEY='<publishable-key>'
SUPABASE_SERVICE_ROLE_KEY='<service-role-or-secret-key>'

META_WEBHOOK_PUBLIC_URL=https://wa.alazab.com/api/public/webhooks/meta/whatsapp
LOVABLE_CRON_SECRET='<long-random-secret>'
LOVABLE_CRON_SECRET_PREVIOUS=

VITE_ENABLE_LEGACY_UI=false
```

`SUPABASE_SERVICE_ROLE_KEY`, cron secrets and Meta secrets are server-side values. Never prefix them with `VITE_`.

Meta App Secret, Verify Token and System User Token should normally be configured from **Meta App** inside AzWA. They are stored through the backend credential RPC/Vault path and are not returned to the browser.

## 2. Database gate

The repository still contains mixed historical migration lineages from before the application merge. Therefore:

```text
DO NOT run supabase db push in production yet.
```

Read `supabase/MIGRATIONS.md`.

Before deployment, run this read-only file in the production SQL editor:

```text
supabase/sql/production_preflight.sql
```

Every section marked `BLOCKER` must return zero rows. The final count query is informational.

The current application expects, among others, the following RPCs to already exist:

```text
azwa_has_org_permission
backend_resolve_meta_token
backend_store_meta_credential
backend_list_webhook_secrets
backend_ingest_webhook_event
backend_ingest_inbound_message
backend_apply_message_status
backend_claim_jobs
backend_complete_job
backend_fail_job
```

## 3. Meta configuration

In AzWA → **Meta App**, save:

- App ID
- Verify Token
- App Secret
- System User Token

Then configure Meta's WhatsApp webhook callback as:

```text
https://wa.alazab.com/api/public/webhooks/meta/whatsapp
```

The GET verification token is resolved from the stored webhook credential. POST requests are accepted only with a valid `X-Hub-Signature-256` signature matching a configured App Secret.

Do not configure the old Supabase Edge Function URL as a second webhook.

## 4. Local release validation

Use Bun, because `bun.lock` is the single dependency lockfile:

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run build
```

The GitHub **Production CI** workflow runs the same validation on `main`, release branches and pull requests to `main`.

## 5. Container deployment

Server prerequisites:

- Docker Engine
- Docker Compose plugin
- Nginx
- certbot
- DNS A/AAAA records for `wa.alazab.com`

First deployment:

```bash
git clone https://github.com/AlazabDev/az-wa.git /opt/az-wa
cd /opt/az-wa
cp .env.example .env.production
# fill .env.production
./deploy/deploy.sh
```

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

## 6. Host Nginx

Install the supplied reverse proxy config:

```bash
sudo cp deploy/wa.alazab.com.conf /etc/nginx/sites-available/wa.alazab.com
sudo ln -sfn /etc/nginx/sites-available/wa.alazab.com /etc/nginx/sites-enabled/wa.alazab.com
sudo certbot --nginx -d wa.alazab.com
sudo nginx -t
sudo systemctl reload nginx
```

## 7. Media worker schedule

Webhook ingestion immediately attempts to drain the media queue. The protected worker endpoint is the retry/safety net.

Example system cron every minute:

```bash
* * * * * curl -fsS -X POST -H "Authorization: Bearer $LOVABLE_CRON_SECRET" https://wa.alazab.com/api/public/jobs/media >/dev/null
```

Use a secret-injection mechanism appropriate for the server rather than committing the secret into a repository file.

## 8. Post-deployment smoke checks

```bash
curl -fsS https://wa.alazab.com/healthz
curl -fsS https://wa.alazab.com/readyz
curl -sS -o /dev/null -w '%{http_code}\n' https://wa.alazab.com/auth
```

Then validate through the application:

1. Sign-in works for an authorized organization member.
2. Business Portfolio/WABA/Phone Number data loads from the production project.
3. Meta App page reports configured credentials and the canonical webhook URL.
4. Meta webhook verification succeeds.
5. A signed inbound message creates/updates webhook, contact, conversation and message state.
6. Delivery/read status callbacks update the message.
7. An unknown Meta phone number creates an open `alerts` record rather than being ingested silently.
8. Media ingestion queues and downloads an attachment; `/api/public/jobs/media` rejects a missing/wrong cron token.
9. Templates sync from Meta for the selected WABA.
10. Creating a template submits it to Meta and records lowercase local status.
11. Deleting a template deletes it on Meta first and marks the local record deleted.
12. No production user can enter `/legacy/*` while `VITE_ENABLE_LEGACY_UI=false`.

## 9. Release gate

Do not merge/deploy when any of these are true:

- Production CI is not green.
- `production_preflight.sql` returns a blocker.
- `/readyz` is not HTTP 200.
- Meta webhook URL is not the canonical TanStack route.
- Meta App credentials are incomplete.
- the old Supabase `wa-webhook` is still configured in Meta.
- `VITE_ENABLE_LEGACY_UI` is enabled unintentionally.

After these gates pass, deploy with:

```bash
cd /opt/az-wa
./deploy/deploy.sh
```
