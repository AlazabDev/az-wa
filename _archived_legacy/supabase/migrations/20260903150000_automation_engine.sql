-- Automation Engine: rule management RPCs.
--
-- The `automation_rules` / `automation_runs` tables already exist (see
-- azwa-schema.sql) with a read-only RLS policy. No write path existed at
-- all prior to this migration -- there was no way to create, enable/disable,
-- or delete a rule except direct SQL. This migration adds the write path
-- following the same convention used everywhere else in this codebase:
-- SECURITY DEFINER RPCs that check org membership + permission internally,
-- rather than raw table RLS policies for INSERT/UPDATE/DELETE.
--
-- Trigger matching and action execution themselves live in application code
-- (src/lib/automation/engine.server.ts), not in SQL, because they need to
-- call the Meta Graph API -- these RPCs only manage rule *definitions*.

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
    'message_received','keyword_received','media_received','new_contact',
    'message_delivered','message_read','message_failed'
  ];
begin
  if not (private.is_org_member(p_organization_id)
          and private.has_org_permission(p_organization_id, 'automation.manage')) then
    raise exception 'insufficient permission to manage automation rules';
  end if;

  if p_trigger_type is null or not (p_trigger_type = any(v_allowed_triggers)) then
    raise exception 'unsupported trigger_type: %. must be one of %', p_trigger_type, v_allowed_triggers;
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'rule name is required';
  end if;

  insert into public.automation_rules(
    organization_id, name, description, trigger_type, trigger_config,
    conditions, actions, scope_business_portfolio_id, scope_waba_id,
    scope_whatsapp_number_id, is_enabled, priority, created_by
  ) values (
    p_organization_id, trim(p_name), p_description, p_trigger_type,
    coalesce(p_trigger_config, '{}'::jsonb), coalesce(p_conditions, '[]'::jsonb),
    coalesce(p_actions, '[]'::jsonb), p_scope_business_portfolio_id, p_scope_waba_id,
    p_scope_whatsapp_number_id, coalesce(p_is_enabled, true), coalesce(p_priority, 100),
    auth.uid()
  ) returning id into v_rule_id;

  insert into public.audit_logs(
    actor_user_id, organization_id, action, entity_type, entity_id, new_value
  ) values (
    auth.uid(), p_organization_id, 'automation_rule.created', 'automation_rule', v_rule_id,
    jsonb_build_object('name', p_name, 'trigger_type', p_trigger_type, 'is_enabled', p_is_enabled)
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
  select * into v_rule from public.automation_rules where id = p_rule_id;
  if v_rule.id is null then
    raise exception 'automation rule not found';
  end if;
  if not (private.is_org_member(v_rule.organization_id)
          and private.has_org_permission(v_rule.organization_id, 'automation.manage')) then
    raise exception 'insufficient permission to manage automation rules';
  end if;

  update public.automation_rules
     set is_enabled = p_is_enabled, updated_at = now()
   where id = p_rule_id;

  insert into public.audit_logs(
    actor_user_id, organization_id, action, entity_type, entity_id, old_value, new_value
  ) values (
    auth.uid(), v_rule.organization_id, 'automation_rule.enabled_changed', 'automation_rule', p_rule_id,
    jsonb_build_object('is_enabled', v_rule.is_enabled), jsonb_build_object('is_enabled', p_is_enabled)
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
  select * into v_rule from public.automation_rules where id = p_rule_id;
  if v_rule.id is null then
    raise exception 'automation rule not found';
  end if;
  if not (private.is_org_member(v_rule.organization_id)
          and private.has_org_permission(v_rule.organization_id, 'automation.manage')) then
    raise exception 'insufficient permission to manage automation rules';
  end if;

  delete from public.automation_rules where id = p_rule_id;

  insert into public.audit_logs(
    actor_user_id, organization_id, action, entity_type, entity_id, old_value
  ) values (
    auth.uid(), v_rule.organization_id, 'automation_rule.deleted', 'automation_rule', p_rule_id,
    jsonb_build_object('name', v_rule.name, 'trigger_type', v_rule.trigger_type)
  );
end;
$$;

revoke all on function public.backend_create_automation_rule(uuid,text,text,text,jsonb,jsonb,jsonb,uuid,uuid,uuid,integer,boolean) from public, anon;
revoke all on function public.backend_set_automation_rule_enabled(uuid,boolean) from public, anon;
revoke all on function public.backend_delete_automation_rule(uuid) from public, anon;

grant execute on function public.backend_create_automation_rule(uuid,text,text,text,jsonb,jsonb,jsonb,uuid,uuid,uuid,integer,boolean) to authenticated, service_role;
grant execute on function public.backend_set_automation_rule_enabled(uuid,boolean) to authenticated, service_role;
grant execute on function public.backend_delete_automation_rule(uuid) to authenticated, service_role;
