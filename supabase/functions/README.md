# Supabase Edge Functions status

These functions were imported from the previous `az-wa` application during repository unification.

## Not production entrypoints

Do **not** deploy these legacy WhatsApp functions for the unified AzWA runtime:

- `wa-webhook`
- `wa-send`
- `wa-health`

The production WhatsApp control plane now lives in the TanStack server:

- webhook: `/api/public/webhooks/meta/whatsapp`
- media worker: `/api/public/jobs/media`
- Meta credentials: Vault-backed `meta_credentials` resolved server-side

Running the old `wa-webhook` beside the TanStack webhook would create two ingestion paths and can duplicate or diverge message state.

## Finance functions

`finance-ingest` and `finance-worker` are preserved as migration source. They still belong to the tenant-era Finance model and must not be deployed against the unified Organization schema until their authorization and foreign keys are migrated from:

```text
tenant_id / tenant_members / wa_number_id / wa_numbers
```

to:

```text
organization_id / organization permissions / whatsapp_number_id / whatsapp_numbers
```

Do not run `supabase functions deploy --all` for production.
