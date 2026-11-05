-- AzWA phase 2: READ-ONLY introspection. Does not change schema, data, or privileges.
-- Run only against the *confirmed* target project as an authorized DBA.
-- Review project identity separately in the Supabase dashboard / CLI.

-- 1. Available public objects and row level security status.
SELECT n.nspname AS schema_name, c.relname AS object_name,
       c.relkind AS object_type, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v')
ORDER BY 1, 2;

-- 2. Every RLS policy, including to whom it applies.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. Direct grants on tables that hold authorization or secrets.
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('api_keys', 'accounts', 'tenant_members', 'meta_credentials',
                     'whatsapp_account_secrets', 'messages', 'conversations', 'contacts',
                     'organizations', 'organization_members', 'whatsapp_numbers', 'wabas')
ORDER BY table_name, grantee, privilege_type;

-- 4. Which API-key contract exists? (Column names only, never key values.)
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('api_keys', 'accounts', 'tenant_members', 'profiles',
                     'organizations', 'organization_members', 'whatsapp_numbers')
ORDER BY table_name, ordinal_position;

-- 5. SECURITY DEFINER public functions and their public invocation grants.
SELECT n.nspname AS schema_name, p.proname AS function_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY p.proname;

-- 6. Clean-generation contract checks: the authoritative preflight is
-- supabase/sql/production_preflight.sql; every BLOCKER result must be empty.
-- 7. Migration history, if Supabase CLI migration table exists.
SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_history_table;
-- If it exists, perform a separate authorized read-only SELECT of its version list.
