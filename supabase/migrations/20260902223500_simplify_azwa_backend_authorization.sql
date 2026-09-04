-- AzWA production authorization compatibility layer.
-- Final model: every authenticated user has full application access.
-- Sender safety remains enforced by requiring an enabled/active number and active WABA.

begin;

create or replace function public.azwa_has_org_permission(
  p_org_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, auth
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.organizations o
      where o.id = p_org_id
    );
$$;

create or replace function public.azwa_can_send_number(
  p_number_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, auth
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.whatsapp_numbers n
      join public.wabas w on w.id = n.waba_id
      where n.id = p_number_id
        and n.is_enabled
        and n.status = 'active'
        and w.status = 'active'
    );
$$;

create or replace function public.azwa_can_dispatch_number(
  p_number_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, auth
as $$
  select public.azwa_can_send_number(p_number_id);
$$;

create or replace function public.azwa_can_manage_number(
  p_number_id uuid,
  p_permission text default 'numbers.manage'
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, auth
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.whatsapp_numbers n
      where n.id = p_number_id
    );
$$;

revoke all on function public.azwa_has_org_permission(uuid,text) from public, anon;
revoke all on function public.azwa_can_send_number(uuid) from public, anon;
revoke all on function public.azwa_can_dispatch_number(uuid,text) from public, anon;
revoke all on function public.azwa_can_manage_number(uuid,text) from public, anon;

grant execute on function public.azwa_has_org_permission(uuid,text) to authenticated, service_role;
grant execute on function public.azwa_can_send_number(uuid) to authenticated, service_role;
grant execute on function public.azwa_can_dispatch_number(uuid,text) to authenticated, service_role;
grant execute on function public.azwa_can_manage_number(uuid,text) to authenticated, service_role;

commit;
