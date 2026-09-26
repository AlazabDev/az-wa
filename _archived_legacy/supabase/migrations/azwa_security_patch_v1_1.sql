-- AzWA Security Hardening Patch v1.1
-- Fixes Supabase Security Advisor warnings:
-- 0011 function_search_path_mutable
-- 0014 extension_in_public
-- 0028 anon_security_definer_function_executable
-- 0029 authenticated_security_definer_function_executable

begin;

-- -----------------------------------------------------------------------------
-- 1) Private schema for internal SECURITY DEFINER helpers
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;
grant usage on schema private to service_role;

-- -----------------------------------------------------------------------------
-- 2) Harden trigger utility search_path
-- -----------------------------------------------------------------------------
alter function public.set_updated_at()
  set search_path = pg_catalog;

-- -----------------------------------------------------------------------------
-- 3) Move pg_trgm out of public into the standard extensions schema
-- -----------------------------------------------------------------------------
create schema if not exists extensions;

do $do$
declare
  current_schema_name text;
begin
  select n.nspname
    into current_schema_name
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  if current_schema_name = 'public' then
    execute 'alter extension pg_trgm set schema extensions';
  end if;
end
$do$;

-- -----------------------------------------------------------------------------
-- 4) Move SECURITY DEFINER functions out of exposed public schema
--    ALTER ... SET SCHEMA preserves OID dependencies used by policies/triggers.
-- -----------------------------------------------------------------------------
alter function public.handle_new_auth_user() set schema private;
alter function public.is_org_member(uuid) set schema private;
alter function public.has_org_permission(uuid, text) set schema private;
alter function public.is_org_admin(uuid) set schema private;
alter function public.can_read_waba(uuid, text) set schema private;
alter function public.can_read_number(uuid, text) set schema private;

-- -----------------------------------------------------------------------------
-- 5) Recreate/harden function bodies with fully-qualified objects and safe path
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.profiles(id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function private.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$$;

create or replace function private.has_org_permission(p_org_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.organization_id = p_org_id
      and ur.user_id = auth.uid()
      and p.code = p_permission
  );
$$;

create or replace function private.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.organization_id = p_org_id
      and ur.user_id = auth.uid()
      and r.code in ('super_admin','admin')
  );
$$;

create or replace function private.can_read_waba(
  p_waba_id uuid,
  p_permission text default 'wabas.read'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.wabas w
    where w.id = p_waba_id
      and private.is_org_member(w.organization_id)
      and private.has_org_permission(w.organization_id, p_permission)
      and (
        private.is_org_admin(w.organization_id)
        or exists (
          select 1
          from public.user_waba_access uwa
          where uwa.user_id = auth.uid()
            and uwa.waba_id = w.id
            and uwa.can_read
        )
        or exists (
          select 1
          from public.user_business_access uba
          where uba.user_id = auth.uid()
            and uba.business_portfolio_id = w.business_portfolio_id
            and uba.can_read
        )
      )
  );
$$;

create or replace function private.can_read_number(
  p_number_id uuid,
  p_permission text default 'numbers.read'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.whatsapp_numbers n
    join public.wabas w on w.id = n.waba_id
    where n.id = p_number_id
      and private.is_org_member(n.organization_id)
      and private.has_org_permission(n.organization_id, p_permission)
      and (
        private.is_org_admin(n.organization_id)
        or exists (
          select 1
          from public.user_number_access una
          where una.user_id = auth.uid()
            and una.whatsapp_number_id = n.id
            and una.can_read
        )
        or exists (
          select 1
          from public.user_waba_access uwa
          where uwa.user_id = auth.uid()
            and uwa.waba_id = n.waba_id
            and uwa.can_read
        )
        or exists (
          select 1
          from public.user_business_access uba
          where uba.user_id = auth.uid()
            and uba.business_portfolio_id = w.business_portfolio_id
            and uba.can_read
        )
        or exists (
          select 1
          from public.team_members tm
          join public.team_number_access tna on tna.team_id = tm.team_id
          where tm.user_id = auth.uid()
            and tna.whatsapp_number_id = n.id
            and tna.can_read
        )
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- 6) Explicit execution privileges
--    Trigger-only function is not callable by clients.
--    RLS helpers remain callable by authenticated SQL sessions, but private is
--    not an exposed PostgREST schema, so they are not /rest/v1/rpc endpoints.
-- -----------------------------------------------------------------------------
revoke all on function private.handle_new_auth_user() from public;
revoke all on function private.handle_new_auth_user() from anon;
revoke all on function private.handle_new_auth_user() from authenticated;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.has_org_permission(uuid, text) from public;
revoke all on function private.is_org_admin(uuid) from public;
revoke all on function private.can_read_waba(uuid, text) from public;
revoke all on function private.can_read_number(uuid, text) from public;

revoke all on function private.is_org_member(uuid) from anon;
revoke all on function private.has_org_permission(uuid, text) from anon;
revoke all on function private.is_org_admin(uuid) from anon;
revoke all on function private.can_read_waba(uuid, text) from anon;
revoke all on function private.can_read_number(uuid, text) from anon;

grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_permission(uuid, text) to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;
grant execute on function private.can_read_waba(uuid, text) to authenticated;
grant execute on function private.can_read_number(uuid, text) to authenticated;

grant execute on function private.is_org_member(uuid) to service_role;
grant execute on function private.has_org_permission(uuid, text) to service_role;
grant execute on function private.is_org_admin(uuid) to service_role;
grant execute on function private.can_read_waba(uuid, text) to service_role;
grant execute on function private.can_read_number(uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- 7) Recreate auth trigger explicitly against private function
-- -----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

commit;
