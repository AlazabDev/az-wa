-- AzWA production preflight — read-only.
-- Run against the production Supabase project before routing live traffic.
-- Every section marked BLOCKER must return zero rows.

-- BLOCKER 1: required tables for the unified Organization/WABA runtime and UI.
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
    ('contact_channels'),
    ('conversations'),
    ('messages'),
    ('message_status_history'),
    ('message_outbox'),
    ('media'),
    ('media_download_attempts'),
    ('templates'),
    ('template_versions'),
    ('campaigns'),
    ('campaign_recipients'),
    ('automation_rules'),
    ('automation_runs'),
    ('jobs'),
    ('dead_letter_jobs'),
    ('alerts'),
    ('api_requests'),
    ('api_errors'),
    ('health_checks'),
    ('audit_logs')
)
SELECT 'missing_table' AS issue, name AS object_name
FROM required_tables
WHERE to_regclass('public.' || name) IS NULL
ORDER BY name;

-- BLOCKER 2: required RPCs used by the TanStack production runtime.
WITH required_functions(name) AS (
  VALUES
    ('azwa_has_org_permission'),
    ('azwa_can_send_number'),
    ('backend_resolve_meta_token'),
    ('backend_store_meta_credential'),
    ('backend_list_webhook_secrets'),
    ('backend_ingest_webhook_event'),
    ('backend_ingest_inbound_message'),
    ('backend_apply_message_status'),
    ('backend_finalize_outbox_success'),
    ('backend_finalize_outbox_failure'),
    ('backend_enqueue_campaign'),
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

-- BLOCKER 3: RLS must remain active on every browser-readable operational table.
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
    'contact_channels',
    'conversations',
    'messages',
    'message_status_history',
    'message_outbox',
    'media',
    'media_download_attempts',
    'templates',
    'campaigns',
    'campaign_recipients',
    'automation_rules',
    'automation_runs',
    'jobs',
    'dead_letter_jobs',
    'alerts',
    'api_requests',
    'api_errors',
    'health_checks',
    'audit_logs'
  )
  AND c.relrowsecurity IS NOT TRUE
ORDER BY c.relname;

-- BLOCKER 4: active Meta webhook endpoints require Vault-backed secrets and
-- must advertise the stable public callback URL used by Meta.
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
    OR regexp_replace(url, '/+$', '') <> 'https://wa.alazab.com/webhooks/meta/whatsapp'
  );

-- BLOCKER 5: no WABA/number may be detached from its organization hierarchy.
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

-- BLOCKER 7: enabled senders must be active and attached to an active WABA.
SELECT
  'invalid_enabled_sender' AS issue,
  n.id,
  n.display_phone_number,
  n.status AS number_status,
  w.status AS waba_status
FROM public.whatsapp_numbers n
JOIN public.wabas w ON w.id = n.waba_id
WHERE n.is_enabled IS TRUE
  AND (n.status <> 'active' OR w.status <> 'active');

-- INFORMATIONAL: current operational counts.
SELECT
  (SELECT count(*) FROM public.organizations) AS organizations,
  (SELECT count(*) FROM public.business_portfolios) AS business_portfolios,
  (SELECT count(*) FROM public.wabas) AS wabas,
  (SELECT count(*) FROM public.whatsapp_numbers) AS whatsapp_numbers,
  (SELECT count(*) FROM public.contacts) AS contacts,
  (SELECT count(*) FROM public.conversations WHERE status = 'open') AS open_conversations,
  (SELECT count(*) FROM public.templates WHERE status = 'approved') AS approved_templates,
  (SELECT count(*) FROM public.jobs WHERE status = 'queued') AS queued_jobs,
  (SELECT count(*) FROM public.dead_letter_jobs) AS dead_letter_jobs,
  (SELECT count(*) FROM public.alerts WHERE status = 'open') AS open_alerts;
