-- AzWA production: complete the automation rule definition/write contract.
-- The 20260904 runtime schema created automation_rules but the current UI/engine
-- also requires description + trigger_config and authenticated management RPCs.

begin;

alter table public.automation_rules
  add column if not exists description text,
  add column if not exists trigger_config jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.automation_rules'::regclass
      and conname = 'automation_rules_trigger_config_object_check'
  ) then
    alter table public.automation_rules
      add constraint automation_rules_trigger_config_object_check
      check (jsonb_typeof(trigger_config) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.automation_rules'::regclass
      and conname = 'automation_rules_conditions_array_check'
  ) then
    alter table public.automation_rules
      add constraint automation_rules_conditions_array_check
      check (jsonb_typeof(conditions) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.automation_rules'::regclass
      and conname = 'automation_rules_actions_array_check'
  ) then
    alter table public.automation_rules
      add constraint automation_rules_actions_array_check
      check (jsonb_typeof(actions) = 'array');
  end if;
end
$$;

create or replace function public.backend_create_automation_rule(
  p_organization_id uuid,
  p_name text,
  p_description text,
  p_trigger_type text,
  p_trigger_config jsonb,
  p_conditions jsonb,
  p_actions jsonb,
  p_scope_business_portfolio_id uuid,
  p_scope_waba_id uuid,
  p_scope_whatsapp_number_id uuid,
  p_priority integer,
  p_is_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_rule_id uuid;
  v_allowed_triggers text[] := array[
    'message_received',
    'keyword_received',
    'media_received',
    'new_contact',
    'message_delivered',
    'message_read',
    'message_failed'
  ];
  v_conditions jsonb := coalesce(p_conditions, '[]'::jsonb);
  v_actions jsonb := coalesce(p_actions, '[]'::jsonb);
  v_trigger_config jsonb := coalesce(p_trigger_config, '{}'::jsonb);
begin
  if not (
    private.is_org_member(p_organization_id)
    and private.has_org_permission(p_organization_id, 'automation.manage')
  ) then
    raise exception 'insufficient permission to manage automation rules';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'rule name is required';
  end if;

  if p_trigger_type is null or not (p_trigger_type = any(v_allowed_triggers)) then
    raise exception 'unsupported trigger_type: %', coalesce(p_trigger_type, '<null>');
  end if;

  if jsonb_typeof(v_trigger_config) <> 'object' then
    raise exception 'trigger_config must be a JSON object';
  end if;

  if jsonb_typeof(v_conditions) <> 'array' then
    raise exception 'conditions must be a JSON array';
  end if;

  if jsonb_typeof(v_actions) <> 'array' or jsonb_array_length(v_actions) = 0 then
    raise exception 'actions must be a non-empty JSON array';
  end if;

  if coalesce(p_priority, 100) < 0 or coalesce(p_priority, 100) > 100000 then
    raise exception 'priority is outside the supported range';
  end if;

  insert into public.automation_rules(
    organization_id,
    name,
    description,
    trigger_type,
    trigger_config,
    conditions,
    actions,
    scope_business_portfolio_id,
    scope_waba_id,
    scope_whatsapp_number_id,
    is_enabled,
    priority,
    created_by
  ) values (
    p_organization_id,
    btrim(p_name),
    nullif(btrim(coalesce(p_description, '')), ''),
    p_trigger_type,
    v_trigger_config,
    v_conditions,
    v_actions,
    p_scope_business_portfolio_id,
    p_scope_waba_id,
    p_scope_whatsapp_number_id,
    coalesce(p_is_enabled, true),
    coalesce(p_priority, 100),
    auth.uid()
  )
  returning id into v_rule_id;

  insert into public.audit_logs(
    actor_user_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    new_value
  ) values (
    auth.uid(),
    p_organization_id,
    'automation_rule.created',
    'automation_rule',
    v_rule_id::text,
    jsonb_build_object(
      'name', btrim(p_name),
      'trigger_type', p_trigger_type,
      'is_enabled', coalesce(p_is_enabled, true)
    )
  );

  return v_rule_id;
end;
$$;

create or replace function public.backend_set_automation_rule_enabled(
  p_rule_id uuid,
  p_is_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_rule public.automation_rules%rowtype;
begin
  if p_is_enabled is null then
    raise exception 'is_enabled is required';
  end if;

  select * into v_rule
  from public.automation_rules
  where id = p_rule_id;

  if v_rule.id is null then
    raise exception 'automation rule not found';
  end if;

  if not (
    private.is_org_member(v_rule.organization_id)
    and private.has_org_permission(v_rule.organization_id, 'automation.manage')
  ) then
    raise exception 'insufficient permission to manage automation rules';
  end if;

  update public.automation_rules
  set is_enabled = p_is_enabled,
      updated_at = now()
  where id = p_rule_id;

  insert into public.audit_logs(
    actor_user_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    old_value,
    new_value
  ) values (
    auth.uid(),
    v_rule.organization_id,
    'automation_rule.enabled_changed',
    'automation_rule',
    p_rule_id::text,
    jsonb_build_object('is_enabled', v_rule.is_enabled),
    jsonb_build_object('is_enabled', p_is_enabled)
  );
end;
$$;

create or replace function public.backend_delete_automation_rule(
  p_rule_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_rule public.automation_rules%rowtype;
begin
  select * into v_rule
  from public.automation_rules
  where id = p_rule_id;

  if v_rule.id is null then
    raise exception 'automation rule not found';
  end if;

  if not (
    private.is_org_member(v_rule.organization_id)
    and private.has_org_permission(v_rule.organization_id, 'automation.manage')
  ) then
    raise exception 'insufficient permission to manage automation rules';
  end if;

  delete from public.automation_rules
  where id = p_rule_id;

  insert into public.audit_logs(
    actor_user_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    old_value
  ) values (
    auth.uid(),
    v_rule.organization_id,
    'automation_rule.deleted',
    'automation_rule',
    p_rule_id::text,
    jsonb_build_object(
      'name', v_rule.name,
      'trigger_type', v_rule.trigger_type,
      'is_enabled', v_rule.is_enabled
    )
  );
end;
$$;

revoke all on function public.backend_create_automation_rule(uuid,text,text,text,jsonb,jsonb,jsonb,uuid,uuid,uuid,integer,boolean) from public, anon;
revoke all on function public.backend_set_automation_rule_enabled(uuid,boolean) from public, anon;
revoke all on function public.backend_delete_automation_rule(uuid) from public, anon;

grant execute on function public.backend_create_automation_rule(uuid,text,text,text,jsonb,jsonb,jsonb,uuid,uuid,uuid,integer,boolean) to authenticated, service_role;
grant execute on function public.backend_set_automation_rule_enabled(uuid,boolean) to authenticated, service_role;
grant execute on function public.backend_delete_automation_rule(uuid) to authenticated, service_role;

commit;
