
-- 1) Fix function search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 2) Change 'public' role policies to 'authenticated' on sensitive tables
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('chatbot_rules','media_folders','hub_webhook_numbers','hub_events','hub_dispatch_targets','hub_deliveries','hub_stats_hourly','ai_extractions')
      AND 'public' = ANY(roles)
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 3) permissions table: explicit read-only for authenticated, no writes
CREATE POLICY permissions_read_authenticated ON public.permissions
  FOR SELECT TO authenticated USING (true);

-- 4) user_profiles policies (self-access)
CREATE POLICY user_profiles_select_self ON public.user_profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY user_profiles_update_self ON public.user_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY user_profiles_insert_self ON public.user_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- 5) user_roles privilege escalation fix:
-- Drop self-referential admin-all policy; restrict client to SELECT own row only.
-- All role mutations must go through service_role (edge functions / backend).
DROP POLICY IF EXISTS "Enable all for admin users only on user_roles" ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select_own ON public.user_roles;
CREATE POLICY user_roles_select_own ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Explicitly: no INSERT/UPDATE/DELETE policies for authenticated => denied.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated, anon;

-- 6) Storage: media bucket tenant-scoped policies (folder = tenant_id)
DROP POLICY IF EXISTS "Give download permission to authenticated user 1ps738_0" ON storage.objects;

CREATE POLICY media_select_tenant_members ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'media' AND
    CASE WHEN ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      THEN public.is_tenant_member(((storage.foldername(name))[1])::uuid)
      ELSE false END
  );
CREATE POLICY media_insert_tenant_operators ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'media' AND
    CASE WHEN ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      THEN public.has_tenant_role(((storage.foldername(name))[1])::uuid, 'operator'::member_role)
      ELSE false END
  );
CREATE POLICY media_update_tenant_operators ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'media' AND
    CASE WHEN ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      THEN public.has_tenant_role(((storage.foldername(name))[1])::uuid, 'operator'::member_role)
      ELSE false END
  ) WITH CHECK (
    bucket_id = 'media' AND
    CASE WHEN ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      THEN public.has_tenant_role(((storage.foldername(name))[1])::uuid, 'operator'::member_role)
      ELSE false END
  );
CREATE POLICY media_delete_tenant_operators ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'media' AND
    CASE WHEN ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      THEN public.has_tenant_role(((storage.foldername(name))[1])::uuid, 'operator'::member_role)
      ELSE false END
  );

-- 7) Realtime channel authorization: restrict realtime.messages to authenticated users
--    with topic that starts with their tenant id. Postgres_changes subscriptions
--    enforce table RLS separately and are unaffected.
DROP POLICY IF EXISTS realtime_authenticated_tenant_topic ON realtime.messages;
CREATE POLICY realtime_authenticated_tenant_topic ON realtime.messages
  FOR SELECT TO authenticated USING (
    auth.uid() IS NOT NULL AND (
      realtime.topic() IS NULL OR
      EXISTS (
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = auth.uid()
          AND (realtime.topic() LIKE tm.tenant_id::text || '%' OR realtime.topic() NOT LIKE '%:%')
      )
    )
  );
