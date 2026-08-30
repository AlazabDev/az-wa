-- AzWA production preflight — read-only.
-- Run against the linked production project before routing traffic.
-- Every section marked BLOCKER must return zero rows.

-- BLOCKER 1: required tables for the unified Organization/WABA runtime.
WITH required_tables(name) AS (
  VALUES
    ('organizations'),
    ('organization_members'),
    ('business_portfolios'),
    ('wabas'),
    ('whatsapp_numbers'),
    ('meta_apps'),
    ('meta_credentials'),
    ('webhook_endpoints'),
    ('webhook_events'),
    ('contacts'),
    ('conversations'),
    ('messages'),
    ('media'),
    ('media_download_attempts'),
    ('templates'),
    ('template_versions'),
    ('jobs'),
    ('alerts'),
    ('api_requests')
)
SELECT 'missing_table' AS issue, name AS object_name
FROM required_tables
WHERE to_regclass('public.' || name) IS NULL
ORDER BY name;

-- BLOCKER 2: required RPCs used by the TanStack server runtime.
WITH required_functions(name) AS (
  VALUES
    ('azwa_has_org_permission'),
    ('backend_resolve_meta_token'),
    ('backend_store_meta_credential'),
    ('backend_list_webhook_secrets'),
    ('backend_ingest_webhook_event'),
    ('backend_ingest_inbound_message'),
    ('backend_apply_message_status'),
    ('backend_claim_jobs'),
    ('backend_complete_job'),
    ('backend_fail_job')
)
SELECT 'missing_function' AS issue, name AS object_name
FROM required_functions rf
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = rf.name
)
ORDER BY name;

-- BLOCKER 3: RLS must remain active on browser-readable operational tables.
SELECT 'rls_disabled' AS issue, c.relname AS object_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'organization_members',
    'business_portfolios',
    'wabas',
    'whatsapp_numbers',
    'contacts',
    'conversations',
    'messages',
    'templates'
  )
  AND c.relrowsecurity IS NOT TRUE
ORDER BY c.relname;

-- BLOCKER 4: active Meta webhook endpoints require both Vault-backed secrets
-- and must point to the TanStack public webhook route.
SELECT
  'invalid_meta_webhook' AS issue,
  id,
  organization_id,
  url,
  verify_token_credential_id,
  app_secret_credential_id,
  status
FROM public.webhook_endpoints
WHERE endpoint_type = 'meta_whatsapp'
  AND status = 'active'
  AND (
    verify_token_credential_id IS NULL
    OR app_secret_credential_id IS NULL
    OR url NOT LIKE '%/api/public/webhooks/meta/whatsapp'
  );

-- BLOCKER 5: no active WABA/number may be detached from its organization hierarchy.
SELECT 'orphan_waba' AS issue, w.id, w.organization_id
FROM public.wabas w
LEFT JOIN public.organizations o ON o.id = w.organization_id
LEFT JOIN public.business_portfolios bp ON bp.id = w.business_portfolio_id
WHERE o.id IS NULL OR bp.id IS NULL;

SELECT 'orphan_whatsapp_number' AS issue, n.id, n.organization_id, n.waba_id
FROM public.whatsapp_numbers n
LEFT JOIN public.organizations o ON o.id = n.organization_id
LEFT JOIN public.wabas w ON w.id = n.waba_id
WHERE o.id IS NULL OR w.id IS NULL;

-- BLOCKER 6: the private WhatsApp media bucket must exist before media traffic.
SELECT 'missing_media_bucket' AS issue, 'azwa-whatsapp-media' AS object_name
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'azwa-whatsapp-media'
);

-- INFORMATIONAL: current operational counts.
SELECT
  (SELECT count(*) FROM public.organizations) AS organizations,
  (SELECT count(*) FROM public.business_portfolios) AS business_portfolios,
  (SELECT count(*) FROM public.wabas) AS wabas,
  (SELECT count(*) FROM public.whatsapp_numbers) AS whatsapp_numbers,
  (SELECT count(*) FROM public.templates WHERE status = 'approved') AS approved_templates,
  (SELECT count(*) FROM public.jobs WHERE status IN ('queued', 'retry')) AS queued_jobs,
  (SELECT count(*) FROM public.alerts WHERE status = 'open') AS open_alerts;
