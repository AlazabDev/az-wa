-- AzWA clean-backend production preflight — READ ONLY.
-- Every BLOCKER query must return zero rows before live traffic is enabled.

-- ============================================================================
-- BLOCKER 1: complete 001 + 002 schema must exist.
-- ============================================================================
WITH required_tables(name) AS (
  VALUES
    -- 001 core / access / Meta control plane
    ('organizations'),('profiles'),('organization_members'),('roles'),('permissions'),
    ('role_permissions'),('user_roles'),('teams'),('team_members'),
    ('business_portfolios'),('meta_apps'),('meta_system_users'),('wabas'),('meta_app_wabas'),
    ('whatsapp_numbers'),('meta_credentials'),('user_business_access'),('user_waba_access'),
    ('user_number_access'),('team_number_access'),('webhook_endpoints'),('templates'),
    ('whatsapp_flows'),('waba_subscribed_apps'),('waba_assigned_users'),
    -- 002 runtime
    ('contacts'),('contact_channels'),('conversations'),('messages'),('message_status_history'),
    ('media'),('campaigns'),('campaign_recipients'),('automation_rules'),('automation_runs'),
    ('webhook_events'),('unmapped_number_events'),('api_requests'),('api_errors'),('alerts'),
    ('health_checks'),('jobs'),('dead_letter_jobs'),('meta_sync_runs'),('message_outbox'),
    ('message_send_attempts'),('webhook_event_attempts'),('media_download_attempts'),
    ('audit_logs'),('system_settings')
)
SELECT 'missing_table' AS issue, name AS object_name
FROM required_tables
WHERE to_regclass('public.' || name) IS NULL
ORDER BY name;

-- ============================================================================
-- BLOCKER 2: runtime RPC contract used by the TanStack server must exist.
-- ============================================================================
WITH required_functions(name) AS (
  VALUES
    ('azwa_has_org_permission'),
    ('azwa_can_send_number'),
    ('azwa_can_dispatch_number'),
    ('azwa_can_manage_number'),
    ('azwa_can_manage_waba'),
    ('backend_store_meta_credential'),
    ('backend_resolve_meta_token'),
    ('backend_list_webhook_secrets'),
    ('backend_decrypt_secret_reference'),
    ('backend_claim_jobs'),
    ('backend_complete_job'),
    ('backend_fail_job'),
    ('backend_requeue_stale_jobs'),
    ('backend_ingest_webhook_event'),
    ('backend_finalize_webhook_event'),
    ('backend_ingest_inbound_message'),
    ('backend_apply_message_status'),
    ('backend_create_outbox'),
    ('backend_finalize_outbox_success'),
    ('backend_finalize_outbox_failure'),
    ('backend_enqueue_campaign'),
    ('backend_enqueue_automation')
)
SELECT 'missing_function' AS issue, name AS object_name
FROM required_functions rf
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = rf.name
)
ORDER BY name;

-- ============================================================================
-- BLOCKER 3: RLS must be enabled on every AzWA data table.
-- ============================================================================
WITH required_tables(name) AS (
  VALUES
    ('organizations'),('profiles'),('organization_members'),('roles'),('permissions'),
    ('role_permissions'),('user_roles'),('teams'),('team_members'),
    ('business_portfolios'),('meta_apps'),('meta_system_users'),('wabas'),('meta_app_wabas'),
    ('whatsapp_numbers'),('meta_credentials'),('user_business_access'),('user_waba_access'),
    ('user_number_access'),('team_number_access'),('webhook_endpoints'),('templates'),
    ('whatsapp_flows'),('waba_subscribed_apps'),('waba_assigned_users'),
    ('contacts'),('contact_channels'),('conversations'),('messages'),('message_status_history'),
    ('media'),('campaigns'),('campaign_recipients'),('automation_rules'),('automation_runs'),
    ('webhook_events'),('unmapped_number_events'),('api_requests'),('api_errors'),('alerts'),
    ('health_checks'),('jobs'),('dead_letter_jobs'),('meta_sync_runs'),('message_outbox'),
    ('message_send_attempts'),('webhook_event_attempts'),('media_download_attempts'),
    ('audit_logs'),('system_settings')
)
SELECT 'rls_disabled' AS issue, r.name AS object_name
FROM required_tables r
JOIN pg_class c ON c.oid = to_regclass('public.' || r.name)
WHERE c.relrowsecurity IS NOT TRUE
ORDER BY r.name;

-- ============================================================================
-- BLOCKER 4: browser roles must have no direct AzWA table privileges.
-- ============================================================================
SELECT
  'unexpected_client_table_grant' AS issue,
  grantee,
  table_name AS object_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon','authenticated')
  AND table_name IN (
    'organizations','profiles','organization_members','roles','permissions',
    'role_permissions','user_roles','teams','team_members',
    'business_portfolios','meta_apps','meta_system_users','wabas','meta_app_wabas',
    'whatsapp_numbers','meta_credentials','user_business_access','user_waba_access',
    'user_number_access','team_number_access','webhook_endpoints','templates',
    'whatsapp_flows','waba_subscribed_apps','waba_assigned_users',
    'contacts','contact_channels','conversations','messages','message_status_history',
    'media','campaigns','campaign_recipients','automation_rules','automation_runs',
    'webhook_events','unmapped_number_events','api_requests','api_errors','alerts',
    'health_checks','jobs','dead_letter_jobs','meta_sync_runs','message_outbox',
    'message_send_attempts','webhook_event_attempts','media_download_attempts',
    'audit_logs','system_settings'
  )
ORDER BY grantee, table_name, privilege_type;

-- ============================================================================
-- BLOCKER 5: backend_* SECURITY DEFINER RPCs are service-role only.
-- ============================================================================
SELECT
  'backend_rpc_exposed_to_client' AS issue,
  p.proname AS object_name,
  CASE
    WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'anon'
    ELSE 'authenticated'
  END AS exposed_role
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'backend\_%' ESCAPE '\'
  AND (
    has_function_privilege('anon', p.oid, 'EXECUTE')
    OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )
ORDER BY p.proname;

-- ============================================================================
-- BLOCKER 6: central Meta webhook must be active and Vault-backed.
-- ============================================================================
SELECT
  'invalid_meta_webhook' AS issue,
  we.id,
  we.organization_id,
  we.url,
  we.verification_status,
  we.verify_token_credential_id,
  we.app_secret_credential_id
FROM public.webhook_endpoints we
WHERE we.endpoint_type = 'meta_whatsapp'
  AND we.status = 'active'
  AND (
    we.verify_token_credential_id IS NULL
    OR we.app_secret_credential_id IS NULL
    OR regexp_replace(we.url, '/+$', '') <> 'https://wa.alazab.com/webhooks/meta/whatsapp'
  );

SELECT 'missing_active_meta_webhook' AS issue, 'meta_whatsapp' AS object_name
WHERE NOT EXISTS (
  SELECT 1 FROM public.webhook_endpoints
  WHERE endpoint_type='meta_whatsapp' AND status='active'
);

-- ============================================================================
-- BLOCKER 7: every Vault credential reference must point to an existing secret.
-- ============================================================================
SELECT
  'broken_vault_reference' AS issue,
  c.id,
  c.name AS object_name,
  c.secret_reference
FROM public.meta_credentials c
WHERE c.secret_reference LIKE 'vault:%'
  AND NOT EXISTS (
    SELECT 1
    FROM vault.secrets s
    WHERE s.id = replace(c.secret_reference,'vault:','')::uuid
  );

-- ============================================================================
-- BLOCKER 8: organization hierarchy must be intact.
-- ============================================================================
SELECT 'orphan_business_portfolio' AS issue, bp.id, bp.organization_id
FROM public.business_portfolios bp
LEFT JOIN public.organizations o ON o.id=bp.organization_id
WHERE o.id IS NULL;

SELECT 'orphan_waba' AS issue, w.id, w.organization_id
FROM public.wabas w
LEFT JOIN public.organizations o ON o.id=w.organization_id
LEFT JOIN public.business_portfolios bp
  ON bp.id=w.business_portfolio_id AND bp.organization_id=w.organization_id
WHERE o.id IS NULL OR bp.id IS NULL;

SELECT 'orphan_whatsapp_number' AS issue, n.id, n.organization_id, n.waba_id
FROM public.whatsapp_numbers n
LEFT JOIN public.organizations o ON o.id=n.organization_id
LEFT JOIN public.wabas w ON w.id=n.waba_id AND w.organization_id=n.organization_id
WHERE o.id IS NULL OR w.id IS NULL;

-- ============================================================================
-- BLOCKER 9: enabled senders must be active and attached to an active WABA.
-- ============================================================================
SELECT
  'invalid_enabled_sender' AS issue,
  n.id,
  n.display_phone_number,
  n.status AS number_status,
  w.status AS waba_status
FROM public.whatsapp_numbers n
JOIN public.wabas w ON w.id=n.waba_id AND w.organization_id=n.organization_id
WHERE n.is_enabled IS TRUE
  AND (n.status <> 'active' OR w.status <> 'active');

-- ============================================================================
-- BLOCKER 10: central AzWA inventory expected from 001B.
-- ============================================================================
SELECT 'inventory_business_count' AS issue, count(*)::text AS object_name
FROM public.business_portfolios
WHERE meta_business_id='314437023701205'
HAVING count(*) <> 1;

SELECT 'inventory_waba_count' AS issue, count(*)::text AS object_name
FROM public.wabas
WHERE organization_id=(SELECT id FROM public.organizations WHERE slug='alazab-group')
HAVING count(*) <> 7;

SELECT 'inventory_number_count' AS issue, count(*)::text AS object_name
FROM public.whatsapp_numbers
WHERE organization_id=(SELECT id FROM public.organizations WHERE slug='alazab-group')
HAVING count(*) <> 9;

SELECT 'inventory_template_count' AS issue, count(*)::text AS object_name
FROM public.templates
WHERE organization_id=(SELECT id FROM public.organizations WHERE slug='alazab-group')
HAVING count(*) <> 94;

SELECT 'inventory_flow_count' AS issue, count(*)::text AS object_name
FROM public.whatsapp_flows
WHERE organization_id=(SELECT id FROM public.organizations WHERE slug='alazab-group')
HAVING count(*) <> 21;

-- ============================================================================
-- BLOCKER 11: stale locked jobs require recovery before live traffic.
-- ============================================================================
SELECT
  'stale_running_job' AS issue,
  id::text AS object_name,
  queue_name,
  locked_by,
  locked_at
FROM public.jobs
WHERE status='running'
  AND locked_at < now()-interval '15 minutes'
ORDER BY locked_at;

-- ============================================================================
-- INFORMATIONAL ONLY.
-- ============================================================================
SELECT
  (SELECT count(*) FROM public.organizations) AS organizations,
  (SELECT count(*) FROM public.business_portfolios) AS business_portfolios,
  (SELECT count(*) FROM public.meta_apps) AS meta_apps,
  (SELECT count(*) FROM public.wabas) AS wabas,
  (SELECT count(*) FROM public.whatsapp_numbers) AS whatsapp_numbers,
  (SELECT count(*) FROM public.whatsapp_numbers WHERE status='active' AND is_enabled) AS active_senders,
  (SELECT count(*) FROM public.templates WHERE status='approved') AS approved_templates,
  (SELECT count(*) FROM public.whatsapp_flows) AS whatsapp_flows,
  (SELECT count(*) FROM public.contacts) AS contacts,
  (SELECT count(*) FROM public.conversations WHERE status='open') AS open_conversations,
  (SELECT count(*) FROM public.jobs WHERE status='queued') AS queued_jobs,
  (SELECT count(*) FROM public.dead_letter_jobs WHERE status='open') AS open_dead_letters,
  (SELECT count(*) FROM public.alerts WHERE status='open') AS open_alerts;
