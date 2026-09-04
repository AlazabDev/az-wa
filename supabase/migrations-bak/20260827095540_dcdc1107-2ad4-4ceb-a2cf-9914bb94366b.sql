DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname NOT IN ('hub_dispatch_targets')
  LOOP
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t.relname);
    IF EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.relname) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t.relname);
    END IF;
  END LOOP;
END $$;

GRANT ALL ON public.hub_dispatch_targets TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.hub_dispatch_targets TO authenticated;
GRANT SELECT (id, tenant_id, name, url, events_filter, numbers_filter, is_active, retry_count, timeout_ms, last_delivery_at, last_error, success_rate, created_at, updated_at, has_secret) ON public.hub_dispatch_targets TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;