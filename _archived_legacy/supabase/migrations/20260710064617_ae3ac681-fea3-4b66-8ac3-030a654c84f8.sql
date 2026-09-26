
-- Restrict hub_dispatch_targets SELECT to tenant admins (contains plaintext webhook secrets)
DROP POLICY IF EXISTS hub_targets_select ON public.hub_dispatch_targets;
CREATE POLICY hub_targets_select ON public.hub_dispatch_targets
  FOR SELECT TO authenticated
  USING (public.has_tenant_role(tenant_id, 'admin'));

-- Tighten user_profiles self-update: forbid changing role/permissions via RLS
DROP POLICY IF EXISTS user_profiles_update_self ON public.user_profiles;
CREATE POLICY user_profiles_update_self ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role IS NOT DISTINCT FROM (SELECT p.role FROM public.user_profiles p WHERE p.id = auth.uid())
    AND permissions IS NOT DISTINCT FROM (SELECT p.permissions FROM public.user_profiles p WHERE p.id = auth.uid())
  );
