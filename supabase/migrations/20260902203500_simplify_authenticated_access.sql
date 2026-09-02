-- AzWA production authentication model:
-- - authenticated users share the same application permissions
-- - no manager/member/user-specific authorization gates
-- - RLS remains enabled as an authenticated-session boundary
-- - secret-bearing backend tables stay inaccessible to browser clients

begin;

do $$
declare
  table_row record;
  policy_row record;
begin
  for table_row in
    select distinct tablename
    from pg_policies
    where schemaname = 'public'
      and policyname in (
        'employee_read_access',
        'manager_full_access',
        'manager_org_access',
        'member_org_read',
        'profile_self_access',
        'manager_team_members_access',
        'member_team_members_read',
        'manager_contact_tags_access',
        'member_contact_tags_read',
        'manager_meta_app_wabas_access',
        'member_meta_app_wabas_read'
      )
      and tablename not in ('meta_credentials', 'system_settings')
  loop
    for policy_row in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = table_row.tablename
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        policy_row.policyname,
        table_row.tablename
      );
    end loop;

    execute format(
      'alter table public.%I enable row level security',
      table_row.tablename
    );

    execute format(
      'create policy azwa_authenticated_access on public.%I for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null)',
      table_row.tablename
    );
  end loop;
end
$$;

-- Credential and secret-bearing configuration remains server-side only.
do $$
declare
  protected_table text;
  policy_row record;
begin
  foreach protected_table in array array['meta_credentials', 'system_settings'] loop
    if to_regclass(format('public.%I', protected_table)) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I enable row level security',
      protected_table
    );

    for policy_row in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = protected_table
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        policy_row.policyname,
        protected_table
      );
    end loop;
  end loop;
end
$$;

create or replace function public.authenticated_tenant_scopes()
returns table (id uuid)
language sql
stable
security definer
set search_path = public, auth
as $$
  select organization.id
  from public.organizations as organization
  where (select auth.uid()) is not null;
$$;

revoke all on function public.authenticated_tenant_scopes() from public;
revoke all on function public.authenticated_tenant_scopes() from anon;
grant execute on function public.authenticated_tenant_scopes() to authenticated;

commit;
