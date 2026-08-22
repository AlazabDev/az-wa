# Production deployment runbook

## 1. Frontend environment

Create `.env.production` outside Git using `.env.example` as the template:

```bash
VITE_SUPABASE_URL=https://uwkdtbodoglbptiediea.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<SUPABASE_ANON_KEY>
```

Never put service-role, Meta, MinIO, Azure or Foundry secrets in `VITE_*` variables.

## 2. Supabase secrets

Set server-side secrets with Supabase CLI or the dashboard:

```bash
supabase secrets set \
  WA_ACCESS_TOKEN='<...>' \
  WA_FINANCE_TOKEN='<...>' \
  WA_APP_SECRET='<...>' \
  WA_WEBHOOK_VERIFY_TOKEN='<...>' \
  WA_API_VERSION='v21.0' \
  WA_FINANCE_PHONE_NUMBER_ID='<...>' \
  MINIO_ENDPOINT='<...>' \
  MINIO_ACCESS_KEY='<...>' \
  MINIO_SECRET_KEY='<...>' \
  MINIO_REGION='us-east-1' \
  MINIO_BUCKET='<...>' \
  FINANCE_STORAGE_PREFIX='finance' \
  FINANCE_PIPELINE_ENABLED='true' \
  AZURE_VISION_ENDPOINT='<...>' \
  AZURE_VISION_KEY='<...>' \
  FOUNDRY_PROJECT_ENDPOINT='<...>' \
  FOUNDRY_AGENT_ID='<...>' \
  FOUNDRY_API_VERSION='v1' \
  AZURE_TENANT_ID='<...>' \
  FOUNDRY_CLIENT_ID='<...>' \
  FOUNDRY_CLIENT_SECRET='<...>' \
  FINANCE_ALLOW_AI_FALLBACK='false'
```

Use `FOUNDRY_API_KEY` only when the deployed Foundry endpoint explicitly requires API-key authentication.

## 3. Database

```bash
supabase link --project-ref uwkdtbodoglbptiediea
supabase db push
```

Then run `supabase/sql/production_preflight.sql` in SQL Editor. The first four queries must return zero rows.

Run the Supabase/Lovable database security scanner again. No Critical/Warning cross-tenant issue is acceptable.

## 4. Edge Functions

```bash
supabase functions deploy wa-webhook --no-verify-jwt
supabase functions deploy wa-send
supabase functions deploy wa-health
supabase functions deploy finance-ingest
supabase functions deploy finance-worker --no-verify-jwt
```

`finance-worker` has platform JWT verification disabled intentionally because it accepts either a signed-in operator/admin JWT or the service-role token and performs tenant authorization internally.

## 5. Meta webhook

Set the callback URL to:

```text
https://uwkdtbodoglbptiediea.supabase.co/functions/v1/wa-webhook
```

The verify token must exactly match `WA_WEBHOOK_VERIFY_TOKEN`.

Production POST requests without `X-Hub-Signature-256` or without configured `WA_APP_SECRET` are rejected.

## 6. Validation

```bash
npm ci
npm run check
```

Validate in this order:

1. Login succeeds for an authorized tenant member.
2. Viewer can read but cannot send or process finance batches.
3. Operator/admin can send a WhatsApp test message.
4. Meta delivery/read callbacks update the message.
5. An inbound image on the finance number creates a `finance_documents` row automatically.
6. Finance Console processes a batch and preserves the original in Milano.
7. Azure Vision OCR text is stored.
8. Foundry extraction is stored with provider `foundry`.
9. Cross-tenant queries return zero rows.
10. `finance_worker_state` is inaccessible to client roles.

## 7. Release gate

Do not merge/deploy unless GitHub CI passes `typecheck`, `lint`, `test`, and `build` and the database preflight is clean.

## 8. النشر على السيرفر الخاص (wa.alazab.cloud)

المتطلبات على السيرفر: Docker + Docker Compose plugin + Nginx + certbot، و DNS سجل `A` لـ `wa.alazab.cloud` يشير لـ IP السيرفر.

```bash
git clone <repo-url> /opt/az-wa && cd /opt/az-wa
cp .env.production.example .env.production   # ثم املأ VITE_SUPABASE_PUBLISHABLE_KEY
./deploy/deploy.sh
```

الحاوية تستمع على `127.0.0.1:8085` فقط، و Nginx على المضيف ينهي TLS:

```bash
sudo cp deploy/wa.alazab.cloud.conf /etc/nginx/sites-available/wa.alazab.cloud
sudo ln -sf /etc/nginx/sites-available/wa.alazab.cloud /etc/nginx/sites-enabled/
sudo certbot --nginx -d wa.alazab.cloud
sudo nginx -t && sudo systemctl reload nginx
```

فحوصات ما بعد النشر:

```bash
curl -sf https://wa.alazab.cloud/healthz     # يجب أن يرجع ok
curl -sI https://wa.alazab.cloud/inbox       # يجب 200 (SPA fallback)
```

لأي تحديث لاحق: `cd /opt/az-wa && ./deploy/deploy.sh` (يسحب الكود، يبني، يعيد التشغيل، ويتحقق من الصحة).

### روابط ثابتة يجب ألا تتغير
- Meta webhook: `https://uwkdtbodoglbptiediea.supabase.co/functions/v1/wa-webhook`
- واجهة الويب: `https://wa.alazab.cloud`
