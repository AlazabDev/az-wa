-- Run after migrations and before production traffic.
-- Expected result: every query returns zero rows except the summary query.

-- 1) No tenant-sensitive policy may depend on the global role helper.
SELECT schemaname, tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('contacts', 'messages')
  AND (
    COALESCE(qual, '') ILIKE '%get_user_role%'
    OR COALESCE(with_check, '') ILIKE '%get_user_role%'
  );

-- 2) Intentionally private tables must not have permissive client policies.
SELECT schemaname, tablename, policyname, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('contact_tag', 'message_template', 'user_permissions')
  AND (
    COALESCE(qual, '') NOT IN ('false', '(false)')
    OR COALESCE(with_check, '') NOT IN ('false', '(false)')
  );

-- 3) Worker internals must not be granted to anon/authenticated.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'finance_worker_state'
  AND grantee IN ('anon', 'authenticated');

-- 4) Confirm RLS is active on core tenant tables.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('contacts','messages','finance_batches','finance_documents','finance_batch_currency_totals')
  AND c.relrowsecurity IS NOT TRUE;

-- 5) Current finance queue summary (informational).
SELECT tenant_id, status, count(*) AS documents
FROM public.finance_documents
GROUP BY tenant_id, status
ORDER BY tenant_id, status;
