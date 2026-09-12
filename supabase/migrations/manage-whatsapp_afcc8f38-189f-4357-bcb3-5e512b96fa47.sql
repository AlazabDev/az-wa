
-- Auto-create profile + tenant + membership on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id uuid;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));

  -- Create default tenant
  INSERT INTO public.tenants (id, name)
  VALUES (gen_random_uuid(), COALESCE(NEW.raw_user_meta_data->>'company', split_part(NEW.email, '@', 1) || ' Workspace'))
  RETURNING id INTO _tenant_id;

  -- Make user admin of their tenant
  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (_tenant_id, NEW.id, 'admin');

  RETURN NEW;
END;
$$;

-- Trigger on auth.users insert
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Allow authenticated users to read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Allow authenticated users to update own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());
