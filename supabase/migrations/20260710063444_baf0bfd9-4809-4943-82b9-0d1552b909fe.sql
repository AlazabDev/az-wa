
-- 1. Drop legacy empty broadcast tables (superseded by broadcasts/broadcast_messages)
DROP TABLE IF EXISTS public.broadcast_contact CASCADE;
DROP TABLE IF EXISTS public.broadcast_batch CASCADE;
DROP TABLE IF EXISTS public.broadcast CASCADE;

-- 2. Prevent users from self-updating role/permissions on user_profiles
CREATE OR REPLACE FUNCTION public.prevent_user_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.permissions IS DISTINCT FROM OLD.permissions THEN
      RAISE EXCEPTION 'Not allowed to modify role or permissions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_prevent_priv_escalation ON public.user_profiles;
CREATE TRIGGER user_profiles_prevent_priv_escalation
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_profile_privilege_escalation();

-- 3. Restrict ai_analysis_cache service policy to service_role only
DROP POLICY IF EXISTS cache_service_role ON public.ai_analysis_cache;
CREATE POLICY cache_service_role ON public.ai_analysis_cache
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);
