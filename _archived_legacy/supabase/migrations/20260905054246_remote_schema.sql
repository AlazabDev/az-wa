drop extension if exists "pg_net";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.can_dispatch_number(p_number_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.whatsapp_numbers n
    join public.wabas w on w.id=n.waba_id and w.organization_id=n.organization_id
    where n.id=p_number_id
      and n.is_enabled
      and n.status='active'
      and private.is_org_member(n.organization_id)
      and private.has_org_permission(n.organization_id,p_permission)
      and (
        private.is_org_admin(n.organization_id)
        or exists (
          select 1 from public.user_number_access a
          where a.organization_id=n.organization_id
            and a.user_id=(select auth.uid())
            and a.whatsapp_number_id=n.id
            and (a.can_send or a.can_manage)
        )
        or exists (
          select 1 from public.user_waba_access a
          where a.organization_id=n.organization_id
            and a.user_id=(select auth.uid())
            and a.waba_id=n.waba_id
            and (a.can_send or a.can_manage)
        )
        or exists (
          select 1 from public.user_business_access a
          where a.organization_id=n.organization_id
            and a.user_id=(select auth.uid())
            and a.business_portfolio_id=w.business_portfolio_id
            and (a.can_send or a.can_manage)
        )
        or exists (
          select 1
          from public.team_members tm
          join public.team_number_access tna
            on tna.organization_id=tm.organization_id and tna.team_id=tm.team_id
          where tm.organization_id=n.organization_id
            and tm.user_id=(select auth.uid())
            and tna.whatsapp_number_id=n.id
            and (tna.can_send or tna.can_manage)
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION private.can_manage_number(p_number_id uuid, p_permission text DEFAULT 'numbers.manage'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.whatsapp_numbers n
    join public.wabas w on w.id=n.waba_id and w.organization_id=n.organization_id
    where n.id=p_number_id
      and private.is_org_member(n.organization_id)
      and private.has_org_permission(n.organization_id,p_permission)
      and (
        private.is_org_admin(n.organization_id)
        or exists (
          select 1 from public.user_number_access a
          where a.organization_id=n.organization_id and a.user_id=(select auth.uid())
            and a.whatsapp_number_id=n.id and a.can_manage
        )
        or exists (
          select 1 from public.user_waba_access a
          where a.organization_id=n.organization_id and a.user_id=(select auth.uid())
            and a.waba_id=n.waba_id and a.can_manage
        )
        or exists (
          select 1 from public.user_business_access a
          where a.organization_id=n.organization_id and a.user_id=(select auth.uid())
            and a.business_portfolio_id=w.business_portfolio_id and a.can_manage
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION private.can_manage_waba(p_waba_id uuid, p_permission text DEFAULT 'wabas.manage'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.wabas w
    where w.id=p_waba_id
      and private.is_org_member(w.organization_id)
      and private.has_org_permission(w.organization_id,p_permission)
      and (
        private.is_org_admin(w.organization_id)
        or exists (
          select 1 from public.user_waba_access a
          where a.organization_id=w.organization_id and a.user_id=(select auth.uid())
            and a.waba_id=w.id and a.can_manage
        )
        or exists (
          select 1 from public.user_business_access a
          where a.organization_id=w.organization_id and a.user_id=(select auth.uid())
            and a.business_portfolio_id=w.business_portfolio_id and a.can_manage
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION private.decrypt_secret_reference(p_secret_reference text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_secret text; v_id uuid;
begin
  if p_secret_reference is null or p_secret_reference='' then return null; end if;
  if p_secret_reference !~ '^vault:[0-9a-fA-F-]{36}$' then
    raise exception 'Unsupported secret reference format';
  end if;

  v_id := replace(p_secret_reference,'vault:','')::uuid;
  execute 'select decrypted_secret from vault.decrypted_secrets where id=$1'
    into v_secret using v_id;
  return v_secret;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.enforce_whatsapp_sender_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status <> 'active' then
    new.is_enabled := false;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.ensure_contact_channel(p_organization_id uuid, p_address text, p_wa_id text DEFAULT NULL::text, p_profile_name text DEFAULT NULL::text)
 RETURNS TABLE(contact_id uuid, channel_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_norm text := private.normalize_wa_address(coalesce(p_wa_id,p_address));
  v_contact uuid;
  v_channel uuid;
begin
  if v_norm is null then raise exception 'invalid WhatsApp address'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':wa:' || v_norm,0)
  );

  select cc.contact_id,cc.id into v_contact,v_channel
  from public.contact_channels cc
  where cc.organization_id=p_organization_id
    and cc.channel_type='whatsapp'
    and (
      (p_wa_id is not null and cc.wa_id=private.normalize_wa_address(p_wa_id))
      or cc.normalized_address=v_norm
    )
  order by (cc.wa_id is not null) desc,cc.created_at asc
  limit 1;

  if v_channel is null then
    insert into public.contacts(
      organization_id,display_name,source,first_interaction_at,last_interaction_at
    ) values (
      p_organization_id,nullif(p_profile_name,''),'whatsapp',now(),now()
    ) returning id into v_contact;

    insert into public.contact_channels(
      organization_id,contact_id,channel_type,address,normalized_address,wa_id,profile_name,is_primary
    ) values (
      p_organization_id,v_contact,'whatsapp',coalesce(p_address,v_norm),v_norm,
      private.normalize_wa_address(p_wa_id),nullif(p_profile_name,''),true
    ) returning id into v_channel;
  else
    update public.contact_channels
    set profile_name=coalesce(nullif(p_profile_name,''),profile_name),
        wa_id=coalesce(wa_id,private.normalize_wa_address(p_wa_id)),
        normalized_address=coalesce(normalized_address,v_norm),
        updated_at=now()
    where id=v_channel;

    update public.contacts
    set display_name=coalesce(display_name,nullif(p_profile_name,'')),
        last_interaction_at=now(),
        first_interaction_at=coalesce(first_interaction_at,now()),
        updated_at=now()
    where id=v_contact;
  end if;

  return query select v_contact,v_channel;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.ensure_conversation(p_organization_id uuid, p_whatsapp_number_id uuid, p_contact_id uuid, p_contact_channel_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_whatsapp_number_id::text || ':' || p_contact_id::text,0)
  );

  select c.id into v_id
  from public.conversations c
  where c.organization_id=p_organization_id
    and c.whatsapp_number_id=p_whatsapp_number_id
    and c.contact_id=p_contact_id
  limit 1;

  if v_id is null then
    insert into public.conversations(
      organization_id,whatsapp_number_id,contact_id,contact_channel_id,status,opened_at
    ) values (
      p_organization_id,p_whatsapp_number_id,p_contact_id,p_contact_channel_id,'open',now()
    ) returning id into v_id;
  end if;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION private.has_org_permission(p_org_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_members om
    join public.user_roles ur
      on ur.organization_id = om.organization_id
     and ur.user_id = om.user_id
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where om.organization_id = p_org_id
      and om.user_id = (select auth.uid())
      and om.status = 'active'
      and p.code = p_permission
  );
$function$
;

CREATE OR REPLACE FUNCTION private.is_org_admin(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_members om
    join public.user_roles ur
      on ur.organization_id=om.organization_id and ur.user_id=om.user_id
    join public.roles r on r.id=ur.role_id
    where om.organization_id=p_org_id
      and om.user_id=(select auth.uid())
      and om.status='active'
      and r.code in ('owner','admin')
  );
$function$
;

CREATE OR REPLACE FUNCTION private.is_org_member(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_org_id
      and om.user_id = (select auth.uid())
      and om.status = 'active'
  );
$function$
;

CREATE OR REPLACE FUNCTION private.normalize_wa_address(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select nullif(regexp_replace(coalesce(p_value,''),'[^0-9]','','g'),'');
$function$
;

CREATE OR REPLACE FUNCTION private.refresh_campaign_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_campaign_id uuid;
begin
  if tg_op='DELETE' then
    v_campaign_id:=old.campaign_id;
  else
    v_campaign_id:=new.campaign_id;
  end if;

  update public.campaigns c
  set stats=(
      select jsonb_build_object(
        'total',count(*),
        'queued',count(*) filter(where status='queued'),
        'submitted',count(*) filter(where status='submitted'),
        'sent',count(*) filter(where status='sent'),
        'delivered',count(*) filter(where status='delivered'),
        'read',count(*) filter(where status='read'),
        'failed',count(*) filter(where status='failed'),
        'cancelled',count(*) filter(where status='cancelled')
      )
      from public.campaign_recipients cr where cr.campaign_id=v_campaign_id
    ),
    status=case
      when c.status='running' and not exists (
        select 1 from public.campaign_recipients cr
        where cr.campaign_id=v_campaign_id and cr.status in ('queued','submitted','sent','delivered')
      ) then 'completed'
      else c.status
    end,
    completed_at=case
      when c.status='running' and not exists (
        select 1 from public.campaign_recipients cr
        where cr.campaign_id=v_campaign_id and cr.status in ('queued','submitted','sent','delivered')
      ) then coalesce(c.completed_at,now())
      else c.completed_at
    end,
    updated_at=now()
  where c.id=v_campaign_id;

  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backend_apply_message_status(p_organization_id uuid, p_meta_phone_number_id text, p_status jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_number public.whatsapp_numbers%rowtype;
  v_message public.messages%rowtype;
  v_status text := coalesce(p_status->>'status','unknown');
  v_meta_ts timestamptz;
  v_error_code text := p_status #>> '{errors,0,code}';
  v_error_message text := coalesce(
    p_status #>> '{errors,0,title}',p_status #>> '{errors,0,message}'
  );
  v_current_rank integer;
  v_new_rank integer;
begin
  select * into v_number
  from public.whatsapp_numbers
  where organization_id=p_organization_id and meta_phone_number_id=p_meta_phone_number_id
  limit 1;

  if v_number.id is null then return jsonb_build_object('status','unmapped_number'); end if;

  select * into v_message
  from public.messages
  where organization_id=v_number.organization_id and meta_message_id=p_status->>'id'
  limit 1;

  if v_message.id is null then
    return jsonb_build_object('status','message_not_found','meta_message_id',p_status->>'id');
  end if;

  if coalesce(p_status->>'timestamp','') ~ '^[0-9]+$' then
    v_meta_ts:=to_timestamp((p_status->>'timestamp')::double precision);
  else
    v_meta_ts:=now();
  end if;

  if v_status not in ('received','queued','submitted','sent','delivered','read','failed','deleted','unknown') then
    v_status:='unknown';
  end if;

  insert into public.message_status_history(
    organization_id,message_id,whatsapp_number_id,status,meta_timestamp,
    error_code,error_message,raw_payload
  ) values (
    v_number.organization_id,v_message.id,v_number.id,v_status,v_meta_ts,
    v_error_code,v_error_message,p_status
  ) on conflict do nothing;

  v_current_rank:=case v_message.status
    when 'received' then 1 when 'queued' then 2 when 'submitted' then 3
    when 'sent' then 4 when 'delivered' then 5 when 'read' then 6
    when 'failed' then 7 when 'deleted' then 8 else 0 end;
  v_new_rank:=case v_status
    when 'received' then 1 when 'queued' then 2 when 'submitted' then 3
    when 'sent' then 4 when 'delivered' then 5 when 'read' then 6
    when 'failed' then 7 when 'deleted' then 8 else 0 end;

  if v_status='failed' or v_new_rank>=v_current_rank then
    update public.messages
    set status=v_status,
        error_code=case when v_status='failed' then v_error_code else error_code end,
        error_message=case when v_status='failed' then v_error_message else error_message end,
        sent_at=case when v_status='sent' then coalesce(sent_at,v_meta_ts) else sent_at end,
        delivered_at=case when v_status='delivered' then coalesce(delivered_at,v_meta_ts) else delivered_at end,
        read_at=case when v_status='read' then coalesce(read_at,v_meta_ts) else read_at end,
        failed_at=case when v_status='failed' then coalesce(failed_at,v_meta_ts) else failed_at end,
        updated_at=now()
    where id=v_message.id;
  end if;

  update public.message_outbox
  set status=case when v_status in ('sent','delivered','read','failed') then v_status else status end,
      completed_at=case when v_status in ('read','failed') then now() else completed_at end,
      last_error=case when v_status='failed' then coalesce(v_error_message,v_error_code) else last_error end,
      updated_at=now()
  where organization_id=v_number.organization_id
    and meta_message_id=v_message.meta_message_id;

  update public.campaign_recipients
  set status=case when v_status in ('sent','delivered','read','failed') then v_status else status end,
      sent_at=case when v_status='sent' then coalesce(sent_at,v_meta_ts) else sent_at end,
      delivered_at=case when v_status='delivered' then coalesce(delivered_at,v_meta_ts) else delivered_at end,
      read_at=case when v_status='read' then coalesce(read_at,v_meta_ts) else read_at end,
      failed_at=case when v_status='failed' then coalesce(failed_at,v_meta_ts) else failed_at end,
      error_code=case when v_status='failed' then v_error_code else error_code end,
      error_message=case when v_status='failed' then v_error_message else error_message end,
      updated_at=now()
  where organization_id=v_number.organization_id and message_id=v_message.id;

  return jsonb_build_object('status','applied','message_id',v_message.id,'message_status',v_status);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backend_claim_jobs(p_worker_id text, p_queue_names text[], p_limit integer DEFAULT 20)
 RETURNS SETOF public.jobs
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with candidates as (
    select j.id
    from public.jobs j
    where j.status='queued'
      and j.available_at<=now()
      and (p_queue_names is null or cardinality(p_queue_names)=0 or j.queue_name=any(p_queue_names))
    order by j.priority asc,j.available_at asc,j.created_at asc
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),100))
  )
  update public.jobs j
  set status='running',attempt=j.attempt+1,locked_at=now(),locked_by=p_worker_id,
      started_at=coalesce(j.started_at,now()),updated_at=now()
  from candidates c
  where j.id=c.id
  returning j.*;
$function$
;

CREATE OR REPLACE FUNCTION public.backend_complete_job(p_job_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.jobs
  set status='completed',completed_at=now(),locked_at=null,locked_by=null,error=null,updated_at=now()
  where id=p_job_id;
$function$
;

CREATE OR REPLACE FUNCTION public.backend_create_outbox(p_whatsapp_number_id uuid, p_recipient_address text, p_message_type text, p_request_payload jsonb, p_idempotency_key text, p_requested_by uuid DEFAULT NULL::uuid, p_contact_id uuid DEFAULT NULL::uuid, p_conversation_id uuid DEFAULT NULL::uuid, p_campaign_id uuid DEFAULT NULL::uuid, p_campaign_recipient_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_number public.whatsapp_numbers%rowtype;
  v_outbox_id uuid;
  v_job_id uuid;
  v_recipient text;
begin
  select * into v_number from public.whatsapp_numbers where id=p_whatsapp_number_id;
  if v_number.id is null then raise exception 'WhatsApp number not found'; end if;
  if not v_number.is_enabled or v_number.status<>'active' then
    raise exception 'WhatsApp number is not active';
  end if;

  v_recipient:=private.normalize_wa_address(p_recipient_address);
  if v_recipient is null then raise exception 'Invalid recipient address'; end if;
  if nullif(p_idempotency_key,'') is null then raise exception 'idempotency_key is required'; end if;

  insert into public.message_outbox(
    organization_id,whatsapp_number_id,contact_id,conversation_id,campaign_id,campaign_recipient_id,
    recipient_address,message_type,request_payload,idempotency_key,requested_by,status
  ) values (
    v_number.organization_id,v_number.id,p_contact_id,p_conversation_id,p_campaign_id,p_campaign_recipient_id,
    v_recipient,p_message_type,p_request_payload,p_idempotency_key,p_requested_by,'queued'
  )
  on conflict (organization_id,idempotency_key) do update
    set idempotency_key=excluded.idempotency_key
  returning id into v_outbox_id;

  insert into public.jobs(
    organization_id,queue_name,job_type,deduplication_key,priority,payload,status,max_attempts
  ) values (
    v_number.organization_id,'message-send','send_whatsapp_message',
    'outbox:' || v_outbox_id::text,20,jsonb_build_object('outbox_id',v_outbox_id),'queued',6
  ) on conflict do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select id into v_job_id
    from public.jobs
    where organization_id=v_number.organization_id
      and queue_name='message-send'
      and deduplication_key='outbox:' || v_outbox_id::text
    order by created_at desc limit 1;
  end if;

  return jsonb_build_object('outbox_id',v_outbox_id,'job_id',v_job_id,'status','queued');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backend_enqueue_automation(p_rule_id uuid, p_trigger_payload jsonb, p_whatsapp_number_id uuid DEFAULT NULL::uuid, p_conversation_id uuid DEFAULT NULL::uuid, p_message_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rule public.automation_rules%rowtype;
  v_run_id uuid;
  v_job_id uuid;
begin
  select * into v_rule from public.automation_rules where id=p_rule_id;
  if v_rule.id is null then raise exception 'Automation rule not found'; end if;
  if not v_rule.is_enabled then return jsonb_build_object('status','disabled'); end if;

  insert into public.automation_runs(
    organization_id,automation_rule_id,whatsapp_number_id,conversation_id,message_id,
    trigger_payload,status,idempotency_key
  ) values (
    v_rule.organization_id,v_rule.id,p_whatsapp_number_id,p_conversation_id,p_message_id,
    coalesce(p_trigger_payload,'{}'::jsonb),'queued',p_idempotency_key
  )
  on conflict (organization_id,idempotency_key) where idempotency_key is not null
  do update set idempotency_key=excluded.idempotency_key
  returning id into v_run_id;

  insert into public.jobs(
    organization_id,queue_name,job_type,deduplication_key,priority,payload,status,max_attempts
  ) values (
    v_rule.organization_id,'automation','execute_automation',
    'automation:' || v_run_id::text,v_rule.priority,
    jsonb_build_object('automation_run_id',v_run_id),'queued',5
  ) on conflict do nothing
  returning id into v_job_id;

  return jsonb_build_object('status','queued','run_id',v_run_id,'job_id',v_job_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backend_enqueue_campaign(p_campaign_id uuid, p_requested_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_campaign public.campaigns%rowtype;
  v_template public.templates%rowtype;
  r public.campaign_recipients%rowtype;
  v_payload jsonb;
  v_result jsonb;
  v_count integer:=0;
begin
  select * into v_campaign from public.campaigns where id=p_campaign_id for update;
  if v_campaign.id is null then raise exception 'Campaign not found'; end if;
  if v_campaign.status not in ('draft','scheduled','paused') then
    raise exception 'Campaign cannot start from status %',v_campaign.status;
  end if;
  if v_campaign.template_id is null then raise exception 'Campaign template is required'; end if;

  select * into v_template from public.templates
  where id=v_campaign.template_id and organization_id=v_campaign.organization_id;
  if v_template.id is null or v_template.status<>'approved' then
    raise exception 'Approved template is required';
  end if;

  update public.campaigns
  set status='running',started_at=coalesce(started_at,now()),updated_at=now()
  where id=p_campaign_id;

  for r in
    select *
    from public.campaign_recipients
    where campaign_id=p_campaign_id and status in ('queued','failed')
    order by created_at
  loop
    v_payload:=case
      when r.request_payload <> '{}'::jsonb then r.request_payload
      else jsonb_build_object(
        'messaging_product','whatsapp',
        'to',private.normalize_wa_address(r.recipient_address),
        'type','template',
        'template',jsonb_build_object(
          'name',v_template.name,
          'language',jsonb_build_object('code',v_template.language)
        )
      )
    end;

    v_result:=public.backend_create_outbox(
      v_campaign.sender_whatsapp_number_id,
      r.recipient_address,
      'template',
      v_payload,
      r.idempotency_key,
      p_requested_by,
      r.contact_id,
      null,
      v_campaign.id,
      r.id
    );
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object('campaign_id',p_campaign_id,'queued',v_count,'status','running');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backend_fail_job(p_job_id uuid, p_error text, p_retry_after_seconds integer DEFAULT 30)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_job public.jobs%rowtype; v_result text;
begin
  select * into v_job from public.jobs where id=p_job_id for update;
  if v_job.id is null then return 'missing'; end if;

  if v_job.attempt>=v_job.max_attempts then
    update public.jobs
    set status='failed',failed_at=now(),error=p_error,locked_at=null,locked_by=null,updated_at=now()
    where id=p_job_id;

    insert into public.dead_letter_jobs(
      organization_id,original_job_id,queue_name,job_type,payload,attempts,last_error,failed_at,status
    ) values (
      v_job.organization_id,v_job.id,v_job.queue_name,v_job.job_type,v_job.payload,
      v_job.attempt,p_error,now(),'open'
    );
    v_result:='dead';
  else
    update public.jobs
    set status='queued',
        available_at=now()+make_interval(secs=>greatest(1,coalesce(p_retry_after_seconds,30))),
        error=p_error,locked_at=null,locked_by=null,updated_at=now()
    where id=p_job_id;
    v_result:='retry';
  end if;
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backend_finalize_outbox_failure(p_outbox_id uuid, p_error text, p_final boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_o public.message_outbox%rowtype;
begin
  select * into v_o from public.message_outbox where id=p_outbox_id for update;
  if v_o.id is null then return; end if;

  update public.message_outbox
  set status=case when p_final then 'failed' else 'queued' end,
      attempt_count=attempt_count+1,
      next_attempt_at=case when p_final then next_attempt_at else now()+interval '30 seconds' end,
      last_error=p_error,
      completed_at=case when p_final then now() else completed_at end,
      updated_at=now()
  where id=p_outbox_id;

  update public.whatsapp_numbers
  set last_api_failure_at=now(),updated_at=now()
  where id=v_o.whatsapp_number_id;

  if p_final and v_o.campaign_recipient_id is not null then
    update public.campaign_recipients
    set status='failed',error_message=p_error,failed_at=now(),updated_at=now()
    where id=v_o.campaign_recipient_id and organization_id=v_o.organization_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backend_finalize_outbox_success(p_outbox_id uuid, p_meta_message_id text, p_raw_response jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_o public.message_outbox%rowtype;
  v_contact_id uuid;
  v_channel_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_now timestamptz:=now();
begin
  select * into v_o from public.message_outbox where id=p_outbox_id for update;
  if v_o.id is null then raise exception 'Outbox row not found'; end if;

  select e.contact_id,e.channel_id into v_contact_id,v_channel_id
  from private.ensure_contact_channel(
    v_o.organization_id,v_o.recipient_address,v_o.recipient_address,null
  ) e;

  v_conversation_id:=coalesce(
    v_o.conversation_id,
    private.ensure_conversation(v_o.organization_id,v_o.whatsapp_number_id,v_contact_id,v_channel_id)
  );

  select id into v_message_id
  from public.messages
  where organization_id=v_o.organization_id and meta_message_id=p_meta_message_id
  limit 1;

  if v_message_id is null then
    insert into public.messages(
      organization_id,conversation_id,whatsapp_number_id,contact_id,contact_channel_id,
      meta_message_id,direction,message_type,body,caption,status,interactive_payload,
      context_payload,raw_payload,sent_at,meta_timestamp
    ) values (
      v_o.organization_id,v_conversation_id,v_o.whatsapp_number_id,v_contact_id,v_channel_id,
      p_meta_message_id,'outgoing',v_o.message_type,
      case when v_o.message_type='text' then v_o.request_payload #>> '{text,body}' else null end,
      coalesce(
        v_o.request_payload #>> '{image,caption}',
        v_o.request_payload #>> '{video,caption}',
        v_o.request_payload #>> '{document,caption}'
      ),
      'submitted',coalesce(v_o.request_payload->'interactive','{}'::jsonb),
      coalesce(v_o.request_payload->'context','{}'::jsonb),coalesce(p_raw_response,'{}'::jsonb),
      v_now,v_now
    ) returning id into v_message_id;

    insert into public.message_status_history(
      organization_id,message_id,whatsapp_number_id,status,meta_timestamp,raw_payload
    ) values (
      v_o.organization_id,v_message_id,v_o.whatsapp_number_id,'submitted',v_now,
      coalesce(p_raw_response,'{}'::jsonb)
    ) on conflict do nothing;
  end if;

  update public.message_outbox
  set contact_id=v_contact_id,conversation_id=v_conversation_id,
      meta_message_id=p_meta_message_id,status='submitted',submitted_at=v_now,
      attempt_count=attempt_count+1,last_error=null,updated_at=now()
  where id=v_o.id;

  update public.conversations
  set last_message_at=greatest(coalesce(last_message_at,v_now),v_now),
      last_outgoing_at=greatest(coalesce(last_outgoing_at,v_now),v_now),updated_at=now()
  where id=v_conversation_id;

  update public.contacts
  set first_interaction_at=coalesce(first_interaction_at,v_now),
      last_interaction_at=greatest(coalesce(last_interaction_at,v_now),v_now),updated_at=now()
  where id=v_contact_id;

  update public.whatsapp_numbers
  set last_outgoing_message_at=greatest(coalesce(last_outgoing_message_at,v_now),v_now),
      last_api_success_at=v_now,updated_at=now()
  where id=v_o.whatsapp_number_id;

  if v_o.campaign_recipient_id is not null then
    update public.campaign_recipients
    set message_id=v_message_id,status='submitted',sent_at=coalesce(sent_at,v_now),updated_at=now()
    where id=v_o.campaign_recipient_id and organization_id=v_o.organization_id;
  end if;

  return jsonb_build_object(
    'message_id',v_message_id,'conversation_id',v_conversation_id,'contact_id',v_contact_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backend_finalize_webhook_event(p_event_id uuid, p_success boolean, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_event public.webhook_events%rowtype;
begin
  select * into v_event from public.webhook_events where id=p_event_id for update;
  if v_event.id is null then return; end if;

  if v_event.status='unmapped_number_event' then return; end if;

  update public.webhook_events
  set status=case when p_success then 'processed' else 'failed' end,
      error=case when p_success then null else p_error end,
      processed_at=case when p_success then now() else processed_at end
  where id=p_event_id;

  update public.webhook_event_attempts
  set status=case when p_success then 'processed' else 'failed' end,
      error=case when p_success then null else p_error end,
      completed_at=now()
  where webhook_event_id=p_event_id and attempt_no=v_event.attempts;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backend_ingest_inbound_message(p_organization_id uuid, p_meta_phone_number_id text, p_contact_wa_id text, p_contact_profile_name text, p_message jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_number public.whatsapp_numbers%rowtype;
  v_contact_id uuid;
  v_channel_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_meta_message_id text := p_message->>'id';
  v_type text := coalesce(p_message->>'type','unknown');
  v_body text;
  v_caption text;
  v_context_meta_id text := p_message #>> '{context,id}';
  v_meta_ts timestamptz;
  v_media_id text;
  v_mime_type text;
  v_filename text;
  v_media_record_id uuid;
  v_inserted boolean := false;
begin
  select * into v_number
  from public.whatsapp_numbers n
  where n.organization_id=p_organization_id
    and n.meta_phone_number_id=p_meta_phone_number_id
  limit 1;

  if v_number.id is null then
    return jsonb_build_object('status','unmapped_number','meta_phone_number_id',p_meta_phone_number_id);
  end if;

  if v_meta_message_id is null then raise exception 'Meta message id is required'; end if;

  if coalesce(p_message->>'timestamp','') ~ '^[0-9]+$' then
    v_meta_ts:=to_timestamp((p_message->>'timestamp')::double precision);
  else
    v_meta_ts:=now();
  end if;

  select e.contact_id,e.channel_id into v_contact_id,v_channel_id
  from private.ensure_contact_channel(
    v_number.organization_id,
    coalesce(p_contact_wa_id,p_message->>'from'),
    coalesce(p_contact_wa_id,p_message->>'from'),
    p_contact_profile_name
  ) e;

  v_conversation_id:=private.ensure_conversation(
    v_number.organization_id,v_number.id,v_contact_id,v_channel_id
  );

  select m.id into v_message_id
  from public.messages m
  where m.organization_id=v_number.organization_id
    and m.meta_message_id=v_meta_message_id
  limit 1;

  if v_message_id is null then
    v_body:=case v_type
      when 'text' then p_message #>> '{text,body}'
      when 'button' then p_message #>> '{button,text}'
      when 'reaction' then p_message #>> '{reaction,emoji}'
      when 'interactive' then coalesce(
        p_message #>> '{interactive,button_reply,title}',
        p_message #>> '{interactive,list_reply,title}'
      )
      else null
    end;

    v_caption:=coalesce(
      p_message #>> '{image,caption}',
      p_message #>> '{video,caption}',
      p_message #>> '{document,caption}'
    );

    insert into public.messages(
      organization_id,conversation_id,whatsapp_number_id,contact_id,contact_channel_id,
      meta_message_id,direction,message_type,body,caption,meta_reply_to_message_id,
      status,interactive_payload,context_payload,raw_payload,meta_timestamp,received_at
    ) values (
      v_number.organization_id,v_conversation_id,v_number.id,v_contact_id,v_channel_id,
      v_meta_message_id,'incoming',v_type,v_body,v_caption,v_context_meta_id,
      'received',coalesce(p_message->'interactive','{}'::jsonb),
      coalesce(p_message->'context','{}'::jsonb),p_message,v_meta_ts,now()
    ) returning id into v_message_id;
    v_inserted:=true;

    insert into public.message_status_history(
      organization_id,message_id,whatsapp_number_id,status,meta_timestamp,raw_payload
    ) values (
      v_number.organization_id,v_message_id,v_number.id,'received',v_meta_ts,p_message
    ) on conflict do nothing;

    update public.conversations
    set last_message_at=greatest(coalesce(last_message_at,v_meta_ts),v_meta_ts),
        last_incoming_at=greatest(coalesce(last_incoming_at,v_meta_ts),v_meta_ts),
        unread_count=unread_count+1,
        status=case when status in ('resolved','closed') then 'open' else status end,
        updated_at=now()
    where id=v_conversation_id;

    update public.contacts
    set first_interaction_at=coalesce(first_interaction_at,v_meta_ts),
        last_interaction_at=greatest(coalesce(last_interaction_at,v_meta_ts),v_meta_ts),
        updated_at=now()
    where id=v_contact_id;

    update public.whatsapp_numbers
    set last_incoming_message_at=greatest(coalesce(last_incoming_message_at,v_meta_ts),v_meta_ts),
        updated_at=now()
    where id=v_number.id;
  end if;

  if v_type in ('image','video','audio','document','sticker') then
    v_media_id:=p_message #>> array[v_type,'id'];
    v_mime_type:=p_message #>> array[v_type,'mime_type'];
    if v_type='document' then v_filename:=p_message #>> '{document,filename}'; end if;

    if v_media_id is not null then
      insert into public.media(
        organization_id,whatsapp_number_id,message_id,contact_id,meta_media_id,
        media_type,mime_type,filename,download_status,received_at,metadata
      ) values (
        v_number.organization_id,v_number.id,v_message_id,v_contact_id,v_media_id,
        v_type,v_mime_type,v_filename,'pending',v_meta_ts,p_message->v_type
      )
      on conflict (message_id,meta_media_id) where meta_media_id is not null
      do update set
        mime_type=coalesce(public.media.mime_type,excluded.mime_type),
        filename=coalesce(public.media.filename,excluded.filename)
      returning id into v_media_record_id;

      if v_media_record_id is null then
        select id into v_media_record_id
        from public.media
        where message_id=v_message_id and meta_media_id=v_media_id
        limit 1;
      end if;

      insert into public.jobs(
        organization_id,queue_name,job_type,deduplication_key,priority,payload,status,max_attempts
      ) values (
        v_number.organization_id,'media-downloads','download_whatsapp_media',
        'media:' || v_media_record_id::text,20,
        jsonb_build_object('media_id',v_media_record_id),'queued',8
      ) on conflict do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'status',case when v_inserted then 'inserted' else 'duplicate' end,
    'organization_id',v_number.organization_id,
    'whatsapp_number_id',v_number.id,
    'contact_id',v_contact_id,
    'conversation_id',v_conversation_id,
    'message_id',v_message_id,
    'media_id',v_media_record_id,
    'message_type',v_type
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backend_ingest_webhook_event(p_organization_id uuid, p_webhook_endpoint_id uuid, p_meta_app_id uuid, p_meta_waba_id text, p_meta_phone_number_id text, p_event_type text, p_meta_message_id text, p_deduplication_key text, p_signature_valid boolean, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event_id uuid;
  v_waba_id uuid;
  v_number_id uuid;
  v_business_id uuid;
  v_status text := 'processing';
  v_attempt integer;
begin
  if p_deduplication_key is null or p_deduplication_key='' then
    raise exception 'deduplication key is required';
  end if;

  select w.id,w.business_portfolio_id into v_waba_id,v_business_id
  from public.wabas w
  where w.organization_id=p_organization_id and w.meta_waba_id=p_meta_waba_id
  limit 1;

  select n.id into v_number_id
  from public.whatsapp_numbers n
  where n.organization_id=p_organization_id
    and n.meta_phone_number_id=p_meta_phone_number_id
  limit 1;

  if p_meta_phone_number_id is not null and v_number_id is null then
    v_status:='unmapped_number_event';
  end if;

  insert into public.webhook_events(
    organization_id,webhook_endpoint_id,meta_app_id,business_portfolio_id,waba_id,whatsapp_number_id,
    meta_waba_id,meta_phone_number_id,event_type,meta_message_id,deduplication_key,
    signature_valid,payload,status,attempts
  ) values (
    p_organization_id,p_webhook_endpoint_id,p_meta_app_id,v_business_id,v_waba_id,v_number_id,
    p_meta_waba_id,p_meta_phone_number_id,coalesce(nullif(p_event_type,''),'unknown'),p_meta_message_id,
    p_deduplication_key,p_signature_valid,coalesce(p_payload,'{}'::jsonb),v_status,1
  )
  on conflict (organization_id,deduplication_key) do update
  set signature_valid=excluded.signature_valid,
      attempts=public.webhook_events.attempts+1,
      status=case
        when public.webhook_events.status='processed' then 'processed'
        when public.webhook_events.status='unmapped_number_event' then 'unmapped_number_event'
        else excluded.status
      end,
      error=null
  returning id,attempts into v_event_id,v_attempt;

  insert into public.webhook_event_attempts(
    organization_id,webhook_event_id,attempt_no,status
  ) values (
    p_organization_id,v_event_id,v_attempt,
    case when v_status='unmapped_number_event' then 'ignored' else 'started' end
  )
  on conflict (webhook_event_id,attempt_no) do nothing;

  if v_status='unmapped_number_event' then
    insert into public.unmapped_number_events(
      organization_id,webhook_event_id,meta_phone_number_id,meta_waba_id,
      display_phone_number,payload,occurrences,received_at,first_seen_at,last_seen_at,resolved
    ) values (
      p_organization_id,v_event_id,p_meta_phone_number_id,p_meta_waba_id,
      p_payload #>> '{change,value,metadata,display_phone_number}',
      p_payload,1,now(),now(),now(),false
    )
    on conflict (organization_id,meta_phone_number_id) where resolved is false
    do update set
      webhook_event_id=excluded.webhook_event_id,
      meta_waba_id=coalesce(excluded.meta_waba_id,public.unmapped_number_events.meta_waba_id),
      display_phone_number=coalesce(excluded.display_phone_number,public.unmapped_number_events.display_phone_number),
      payload=excluded.payload,
      occurrences=public.unmapped_number_events.occurrences+1,
      last_seen_at=now(),
      received_at=now();

    if not exists (
      select 1 from public.alerts
      where organization_id=p_organization_id
        and alert_type='unknown_whatsapp_number'
        and status='open'
        and details @> jsonb_build_object('meta_phone_number_id',p_meta_phone_number_id)
    ) then
      insert into public.alerts(
        organization_id,waba_id,alert_type,severity,title,message,status,details
      ) values (
        p_organization_id,v_waba_id,'unknown_whatsapp_number','critical',
        'Unknown WhatsApp Phone Number',
        'Webhook received for unmapped Meta phone_number_id ' || coalesce(p_meta_phone_number_id,'NULL'),
        'open',jsonb_build_object('meta_phone_number_id',p_meta_phone_number_id,'webhook_event_id',v_event_id)
      );
    end if;
  end if;

  update public.webhook_endpoints
  set last_event_at=now(),updated_at=now()
  where id=p_webhook_endpoint_id and organization_id=p_organization_id;

  return jsonb_build_object(
    'event_id',v_event_id,'attempt',v_attempt,'status',v_status,
    'whatsapp_number_id',v_number_id,'waba_id',v_waba_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backend_list_webhook_secrets()
 RETURNS TABLE(webhook_endpoint_id uuid, organization_id uuid, meta_app_id uuid, verify_token text, app_secret text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select we.id,we.organization_id,we.meta_app_id,
         private.decrypt_secret_reference(v.secret_reference),
         private.decrypt_secret_reference(a.secret_reference)
  from public.webhook_endpoints we
  left join public.meta_credentials v
    on v.id=we.verify_token_credential_id and v.organization_id=we.organization_id and v.status='active'
  left join public.meta_credentials a
    on a.id=we.app_secret_credential_id and a.organization_id=we.organization_id and a.status='active'
  where we.status='active';
$function$
;

CREATE OR REPLACE FUNCTION public.backend_requeue_stale_jobs(p_older_than_seconds integer DEFAULT 300)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count integer;
begin
  update public.jobs
  set status='queued',locked_at=null,locked_by=null,available_at=now(),
      error=trim(coalesce(error,'') || ' [stale lock recovered]'),updated_at=now()
  where status='running'
    and locked_at<now()-make_interval(secs=>greatest(60,coalesce(p_older_than_seconds,300)));
  get diagnostics v_count=row_count;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backend_resolve_meta_token(p_whatsapp_number_id uuid DEFAULT NULL::uuid, p_waba_id uuid DEFAULT NULL::uuid, p_business_portfolio_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(credential_id uuid, token text, credential_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_waba uuid := p_waba_id;
  v_business uuid := p_business_portfolio_id;
  v_cred public.meta_credentials%rowtype;
begin
  if p_whatsapp_number_id is not null then
    select n.organization_id,n.waba_id,w.business_portfolio_id
    into v_org,v_waba,v_business
    from public.whatsapp_numbers n
    join public.wabas w on w.id=n.waba_id and w.organization_id=n.organization_id
    where n.id=p_whatsapp_number_id;
  elsif p_waba_id is not null then
    select w.organization_id,w.business_portfolio_id into v_org,v_business
    from public.wabas w where w.id=p_waba_id;
  elsif p_business_portfolio_id is not null then
    select b.organization_id into v_org
    from public.business_portfolios b where b.id=p_business_portfolio_id;
  else
    raise exception 'credential scope is required';
  end if;

  if v_org is null then return; end if;

  select c.* into v_cred
  from public.meta_credentials c
  where c.organization_id=v_org
    and c.status='active'
    and (c.expires_at is null or c.expires_at>now())
    and c.credential_type in ('access_token','system_user_token','user_token')
    and (
      (p_whatsapp_number_id is not null and c.whatsapp_number_id=p_whatsapp_number_id)
      or (v_waba is not null and c.whatsapp_number_id is null and c.waba_id=v_waba)
      or (v_business is not null and c.whatsapp_number_id is null and c.waba_id is null
          and c.business_portfolio_id=v_business)
      or (c.whatsapp_number_id is null and c.waba_id is null and c.business_portfolio_id is null)
    )
  order by
    case
      when p_whatsapp_number_id is not null and c.whatsapp_number_id=p_whatsapp_number_id then 1
      when v_waba is not null and c.waba_id=v_waba then 2
      when v_business is not null and c.business_portfolio_id=v_business then 3
      else 4
    end,
    c.created_at desc
  limit 1;

  if v_cred.id is null then return; end if;

  update public.meta_credentials set last_used_at=now() where id=v_cred.id;
  credential_id:=v_cred.id;
  credential_type:=v_cred.credential_type;
  token:=private.decrypt_secret_reference(v_cred.secret_reference);
  return next;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backend_store_meta_credential(p_organization_id uuid, p_credential_type text, p_name text, p_secret text, p_meta_app_id uuid DEFAULT NULL::uuid, p_business_portfolio_id uuid DEFAULT NULL::uuid, p_waba_id uuid DEFAULT NULL::uuid, p_whatsapp_number_id uuid DEFAULT NULL::uuid, p_scopes text[] DEFAULT '{}'::text[], p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_vault_id uuid;
  v_credential_id uuid;
  v_vault_name text := 'azwa_' || replace(gen_random_uuid()::text,'-','');
  v_fingerprint text;
begin
  if p_secret is null or length(p_secret)<1 then raise exception 'secret is required'; end if;

  execute 'select vault.create_secret($1,$2,$3)'
    into v_vault_id
    using p_secret,v_vault_name,'AzWA ' || p_credential_type || ' / ' || p_name;

  v_fingerprint := substring(encode(sha256(convert_to(p_secret,'UTF8')),'hex') from 1 for 16);

  insert into public.meta_credentials(
    organization_id,meta_app_id,business_portfolio_id,waba_id,whatsapp_number_id,
    credential_type,name,secret_reference,token_fingerprint,scopes,expires_at,status,last_verified_at
  ) values (
    p_organization_id,p_meta_app_id,p_business_portfolio_id,p_waba_id,p_whatsapp_number_id,
    p_credential_type,p_name,'vault:' || v_vault_id::text,v_fingerprint,
    coalesce(p_scopes,'{}'::text[]),p_expires_at,'active',now()
  ) returning id into v_credential_id;

  return v_credential_id;
end;
$function$
;


