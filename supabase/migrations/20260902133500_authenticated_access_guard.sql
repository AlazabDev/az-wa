-- Replace the temporary always-true authenticated policies with an explicit
-- authenticated-session guard. This preserves the intended AzWA access model
-- (any signed-in user may operate the UI) without USING (true)/WITH CHECK (true).
--
-- Sensitive credential tables are intentionally not opened here.

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

-- Legacy pages still need a tenant id as a data scope. Do not restore
-- tenant_members as an authorization gate; expose only tenant ids through a
-- SECURITY DEFINER function and require a real authenticated JWT.
create or replace function public.authenticated_tenant_scopes()
returns table (id uuid)
language sql
stable
security definer
set search_path = public, auth
as $$
  select tenant.id
  from public.tenants as tenant
  where (select auth.uid()) is not null;
$$;

revoke all on function public.authenticated_tenant_scopes() from public;
revoke all on function public.authenticated_tenant_scopes() from anon;
grant execute on function public.authenticated_tenant_scopes() to authenticated;

commit;

-- Verification queries (read-only when run after the migration):
-- select tablename, policyname, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and policyname = 'azwa_authenticated_full_access'
-- order by tablename;
--
-- select count(*) as remaining_always_true_policies
-- from pg_policies
-- where schemaname = 'public'
--   and policyname = 'azwa_authenticated_full_access'
--   and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true');
