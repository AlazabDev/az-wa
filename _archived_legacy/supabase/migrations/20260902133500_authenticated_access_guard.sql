-- Replace temporary always-true authenticated policies with an explicit
-- authenticated-session guard. Any signed-in AzWA user may operate the UI,
-- while secret-bearing backend tables remain protected separately.

begin;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename
    from pg_policies
    where schemaname = 'public'
      and policyname = 'azwa_authenticated_full_access'
  loop
    execute format(
      'alter policy azwa_authenticated_full_access on %I.%I to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null)',
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$$;

-- Compatibility scope for legacy UI code. Production uses organizations,
-- not a public.tenants table. This function is a scope selector only and is
-- not an authorization gate.
create or replace function public.authenticated_tenant_scopes()
returns table (id uuid)
language sql
stable
security invoker
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
