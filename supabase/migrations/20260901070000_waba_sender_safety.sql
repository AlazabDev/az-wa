-- AzWA sender safety: a phone number can only dispatch while its parent WABA is active.
-- Forward-only hardening. Returning a WABA to active never re-enables child numbers automatically.

begin;

create or replace function private.can_dispatch_number(p_number_id uuid, p_permission text)
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
      and n.is_enabled
      and n.status = 'active'
      and w.status = 'active'
      and private.is_org_member(n.organization_id)
      and private.has_org_permission(n.organization_id, p_permission)
      and (
        private.is_org_admin(n.organization_id)
        or exists (
          select 1 from public.user_number_access una
          where una.user_id = auth.uid()
            and una.whatsapp_number_id = n.id
            and (una.can_send or una.can_manage)
        )
        or exists (
          select 1 from public.user_waba_access uwa
          where uwa.user_id = auth.uid()
            and uwa.waba_id = n.waba_id
            and (uwa.can_send or uwa.can_manage)
        )
        or exists (
          select 1 from public.user_business_access uba
          where uba.user_id = auth.uid()
            and uba.business_portfolio_id = w.business_portfolio_id
            and (uba.can_send or uba.can_manage)
        )
        or exists (
          select 1
          from public.team_members tm
          join public.team_number_access tna on tna.team_id = tm.team_id
          where tm.user_id = auth.uid()
            and tna.whatsapp_number_id = n.id
            and (tna.can_send or tna.can_manage)
        )
      )
  );
$$;

revoke all on function private.can_dispatch_number(uuid,text) from public, anon;
grant execute on function private.can_dispatch_number(uuid,text) to authenticated, service_role;

-- Defense in depth: whenever a WABA becomes non-active, disable every child sender.
-- This preserves the phone row/status for history and reconciliation; it only removes send capability.
create or replace function private.disable_senders_for_inactive_waba()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.status <> 'active' then
    update public.whatsapp_numbers
       set is_enabled = false,
           updated_at = now()
     where waba_id = new.id
       and is_enabled is true;
  end if;
  return new;
end;
$$;

revoke all on function private.disable_senders_for_inactive_waba() from public, anon, authenticated;
grant execute on function private.disable_senders_for_inactive_waba() to service_role;

drop trigger if exists trg_wabas_disable_child_senders on public.wabas;
create trigger trg_wabas_disable_child_senders
  after update of status on public.wabas
  for each row
  when (new.status <> 'active')
  execute function private.disable_senders_for_inactive_waba();

-- Repair any pre-existing unsafe state without changing phone lifecycle status.
update public.whatsapp_numbers n
   set is_enabled = false,
       updated_at = now()
  from public.wabas w
 where w.id = n.waba_id
   and w.status <> 'active'
   and n.is_enabled is true;

commit;
