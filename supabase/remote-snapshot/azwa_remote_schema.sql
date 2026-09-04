


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "private"."can_dispatch_number"("p_number_id" "uuid", "p_permission" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "private"."can_dispatch_number"("p_number_id" "uuid", "p_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_manage_number"("p_number_id" "uuid", "p_permission" "text" DEFAULT 'numbers.manage'::"text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "private"."can_manage_number"("p_number_id" "uuid", "p_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_manage_waba"("p_waba_id" "uuid", "p_permission" "text" DEFAULT 'wabas.manage'::"text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "private"."can_manage_waba"("p_waba_id" "uuid", "p_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."decrypt_secret_reference"("p_secret_reference" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
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
$_$;


ALTER FUNCTION "private"."decrypt_secret_reference"("p_secret_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enforce_whatsapp_sender_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.status <> 'active' then
    new.is_enabled := false;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."enforce_whatsapp_sender_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."ensure_contact_channel"("p_organization_id" "uuid", "p_address" "text", "p_wa_id" "text" DEFAULT NULL::"text", "p_profile_name" "text" DEFAULT NULL::"text") RETURNS TABLE("contact_id" "uuid", "channel_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "private"."ensure_contact_channel"("p_organization_id" "uuid", "p_address" "text", "p_wa_id" "text", "p_profile_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."ensure_conversation"("p_organization_id" "uuid", "p_whatsapp_number_id" "uuid", "p_contact_id" "uuid", "p_contact_channel_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "private"."ensure_conversation"("p_organization_id" "uuid", "p_whatsapp_number_id" "uuid", "p_contact_id" "uuid", "p_contact_channel_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles(id, display_name, email)
  values (
    new.id,
    pg_catalog.coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "private"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."has_org_permission"("p_org_id" "uuid", "p_permission" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "private"."has_org_permission"("p_org_id" "uuid", "p_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_org_admin"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "private"."is_org_admin"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_org_member"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_org_id
      and om.user_id = (select auth.uid())
      and om.status = 'active'
  );
$$;


ALTER FUNCTION "private"."is_org_member"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."normalize_wa_address"("p_value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select nullif(regexp_replace(coalesce(p_value,''),'[^0-9]','','g'),'');
$$;


ALTER FUNCTION "private"."normalize_wa_address"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."refresh_campaign_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "private"."refresh_campaign_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


ALTER FUNCTION "private"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."azwa_can_dispatch_number"("p_number_id" "uuid", "p_permission" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.can_dispatch_number(p_number_id,p_permission); $$;


ALTER FUNCTION "public"."azwa_can_dispatch_number"("p_number_id" "uuid", "p_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."azwa_can_manage_number"("p_number_id" "uuid", "p_permission" "text" DEFAULT 'numbers.manage'::"text") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.can_manage_number(p_number_id,p_permission); $$;


ALTER FUNCTION "public"."azwa_can_manage_number"("p_number_id" "uuid", "p_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."azwa_can_manage_waba"("p_waba_id" "uuid", "p_permission" "text" DEFAULT 'wabas.manage'::"text") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.can_manage_waba(p_waba_id,p_permission); $$;


ALTER FUNCTION "public"."azwa_can_manage_waba"("p_waba_id" "uuid", "p_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."azwa_can_send_number"("p_number_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.can_dispatch_number(p_number_id,'messages.send'); $$;


ALTER FUNCTION "public"."azwa_can_send_number"("p_number_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."azwa_has_org_permission"("p_org_id" "uuid", "p_permission" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.is_org_member(p_org_id) and private.has_org_permission(p_org_id,p_permission); $$;


ALTER FUNCTION "public"."azwa_has_org_permission"("p_org_id" "uuid", "p_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_apply_message_status"("p_organization_id" "uuid", "p_meta_phone_number_id" "text", "p_status" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
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
$_$;


ALTER FUNCTION "public"."backend_apply_message_status"("p_organization_id" "uuid", "p_meta_phone_number_id" "text", "p_status" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "queue_name" "text" NOT NULL,
    "job_type" "text" NOT NULL,
    "deduplication_key" "text",
    "priority" integer DEFAULT 100 NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "attempt" integer DEFAULT 0 NOT NULL,
    "attempts" integer GENERATED ALWAYS AS ("attempt") STORED,
    "max_attempts" integer DEFAULT 5 NOT NULL,
    "available_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "run_after" timestamp with time zone GENERATED ALWAYS AS ("available_at") STORED,
    "locked_at" timestamp with time zone,
    "locked_by" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "error" "text",
    "last_error" "text" GENERATED ALWAYS AS ("error") STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jobs_attempt_check" CHECK (("attempt" >= 0)),
    CONSTRAINT "jobs_max_attempts_check" CHECK (("max_attempts" > 0)),
    CONSTRAINT "jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_claim_jobs"("p_worker_id" "text", "p_queue_names" "text"[], "p_limit" integer DEFAULT 20) RETURNS SETOF "public"."jobs"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."backend_claim_jobs"("p_worker_id" "text", "p_queue_names" "text"[], "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_complete_job"("p_job_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  update public.jobs
  set status='completed',completed_at=now(),locked_at=null,locked_by=null,error=null,updated_at=now()
  where id=p_job_id;
$$;


ALTER FUNCTION "public"."backend_complete_job"("p_job_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_create_outbox"("p_whatsapp_number_id" "uuid", "p_recipient_address" "text", "p_message_type" "text", "p_request_payload" "jsonb", "p_idempotency_key" "text", "p_requested_by" "uuid" DEFAULT NULL::"uuid", "p_contact_id" "uuid" DEFAULT NULL::"uuid", "p_conversation_id" "uuid" DEFAULT NULL::"uuid", "p_campaign_id" "uuid" DEFAULT NULL::"uuid", "p_campaign_recipient_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."backend_create_outbox"("p_whatsapp_number_id" "uuid", "p_recipient_address" "text", "p_message_type" "text", "p_request_payload" "jsonb", "p_idempotency_key" "text", "p_requested_by" "uuid", "p_contact_id" "uuid", "p_conversation_id" "uuid", "p_campaign_id" "uuid", "p_campaign_recipient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_decrypt_secret_reference"("p_secret_reference" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select private.decrypt_secret_reference(p_secret_reference); $$;


ALTER FUNCTION "public"."backend_decrypt_secret_reference"("p_secret_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_enqueue_automation"("p_rule_id" "uuid", "p_trigger_payload" "jsonb", "p_whatsapp_number_id" "uuid" DEFAULT NULL::"uuid", "p_conversation_id" "uuid" DEFAULT NULL::"uuid", "p_message_id" "uuid" DEFAULT NULL::"uuid", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."backend_enqueue_automation"("p_rule_id" "uuid", "p_trigger_payload" "jsonb", "p_whatsapp_number_id" "uuid", "p_conversation_id" "uuid", "p_message_id" "uuid", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_enqueue_campaign"("p_campaign_id" "uuid", "p_requested_by" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."backend_enqueue_campaign"("p_campaign_id" "uuid", "p_requested_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_fail_job"("p_job_id" "uuid", "p_error" "text", "p_retry_after_seconds" integer DEFAULT 30) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."backend_fail_job"("p_job_id" "uuid", "p_error" "text", "p_retry_after_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_finalize_outbox_failure"("p_outbox_id" "uuid", "p_error" "text", "p_final" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."backend_finalize_outbox_failure"("p_outbox_id" "uuid", "p_error" "text", "p_final" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_finalize_outbox_success"("p_outbox_id" "uuid", "p_meta_message_id" "text", "p_raw_response" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."backend_finalize_outbox_success"("p_outbox_id" "uuid", "p_meta_message_id" "text", "p_raw_response" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_finalize_webhook_event"("p_event_id" "uuid", "p_success" boolean, "p_error" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."backend_finalize_webhook_event"("p_event_id" "uuid", "p_success" boolean, "p_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_ingest_inbound_message"("p_organization_id" "uuid", "p_meta_phone_number_id" "text", "p_contact_wa_id" "text", "p_contact_profile_name" "text", "p_message" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
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
$_$;


ALTER FUNCTION "public"."backend_ingest_inbound_message"("p_organization_id" "uuid", "p_meta_phone_number_id" "text", "p_contact_wa_id" "text", "p_contact_profile_name" "text", "p_message" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_ingest_webhook_event"("p_organization_id" "uuid", "p_webhook_endpoint_id" "uuid", "p_meta_app_id" "uuid", "p_meta_waba_id" "text", "p_meta_phone_number_id" "text", "p_event_type" "text", "p_meta_message_id" "text", "p_deduplication_key" "text", "p_signature_valid" boolean, "p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."backend_ingest_webhook_event"("p_organization_id" "uuid", "p_webhook_endpoint_id" "uuid", "p_meta_app_id" "uuid", "p_meta_waba_id" "text", "p_meta_phone_number_id" "text", "p_event_type" "text", "p_meta_message_id" "text", "p_deduplication_key" "text", "p_signature_valid" boolean, "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_list_webhook_secrets"() RETURNS TABLE("webhook_endpoint_id" "uuid", "organization_id" "uuid", "meta_app_id" "uuid", "verify_token" "text", "app_secret" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select we.id,we.organization_id,we.meta_app_id,
         private.decrypt_secret_reference(v.secret_reference),
         private.decrypt_secret_reference(a.secret_reference)
  from public.webhook_endpoints we
  left join public.meta_credentials v
    on v.id=we.verify_token_credential_id and v.organization_id=we.organization_id and v.status='active'
  left join public.meta_credentials a
    on a.id=we.app_secret_credential_id and a.organization_id=we.organization_id and a.status='active'
  where we.status='active';
$$;


ALTER FUNCTION "public"."backend_list_webhook_secrets"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_requeue_stale_jobs"("p_older_than_seconds" integer DEFAULT 300) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."backend_requeue_stale_jobs"("p_older_than_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_resolve_meta_token"("p_whatsapp_number_id" "uuid" DEFAULT NULL::"uuid", "p_waba_id" "uuid" DEFAULT NULL::"uuid", "p_business_portfolio_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("credential_id" "uuid", "token" "text", "credential_type" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."backend_resolve_meta_token"("p_whatsapp_number_id" "uuid", "p_waba_id" "uuid", "p_business_portfolio_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_store_meta_credential"("p_organization_id" "uuid", "p_credential_type" "text", "p_name" "text", "p_secret" "text", "p_meta_app_id" "uuid" DEFAULT NULL::"uuid", "p_business_portfolio_id" "uuid" DEFAULT NULL::"uuid", "p_waba_id" "uuid" DEFAULT NULL::"uuid", "p_whatsapp_number_id" "uuid" DEFAULT NULL::"uuid", "p_scopes" "text"[] DEFAULT '{}'::"text"[], "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
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
$_$;


ALTER FUNCTION "public"."backend_store_meta_credential"("p_organization_id" "uuid", "p_credential_type" "text", "p_name" "text", "p_secret" "text", "p_meta_app_id" "uuid", "p_business_portfolio_id" "uuid", "p_waba_id" "uuid", "p_whatsapp_number_id" "uuid", "p_scopes" "text"[], "p_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "business_portfolio_id" "uuid",
    "waba_id" "uuid",
    "whatsapp_number_id" "uuid",
    "alert_type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "source_entity_type" "text",
    "source_entity_id" "uuid",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "acknowledged_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "alerts_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'critical'::"text"]))),
    CONSTRAINT "alerts_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'acknowledged'::"text", 'resolved'::"text", 'ignored'::"text"])))
);


ALTER TABLE "public"."alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_errors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "api_request_id" "uuid",
    "whatsapp_number_id" "uuid",
    "waba_id" "uuid",
    "error_type" "text",
    "error_code" "text",
    "title" "text",
    "message" "text",
    "raw_error" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "occurrence_count" integer DEFAULT 1 NOT NULL,
    "occurrences" integer GENERATED ALWAYS AS ("occurrence_count") STORED,
    "first_occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "api_errors_occurrence_count_check" CHECK (("occurrence_count" > 0)),
    CONSTRAINT "api_errors_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'acknowledged'::"text", 'resolved'::"text", 'ignored'::"text"])))
);


ALTER TABLE "public"."api_errors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "correlation_id" "text",
    "request_id" "text",
    "meta_app_id" "uuid",
    "business_portfolio_id" "uuid",
    "waba_id" "uuid",
    "whatsapp_number_id" "uuid",
    "endpoint" "text" NOT NULL,
    "method" "text" NOT NULL,
    "http_status" integer,
    "status_code" integer GENERATED ALWAYS AS ("http_status") STORED,
    "duration_ms" integer,
    "meta_error_code" "text",
    "meta_error_message" "text",
    "error_message" "text" GENERATED ALWAYS AS ("meta_error_message") STORED,
    "success" boolean GENERATED ALWAYS AS ((("http_status" IS NOT NULL) AND (("http_status" >= 200) AND ("http_status" <= 299)) AND ("meta_error_code" IS NULL))) STORED,
    "request_meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "response_meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "api_requests_duration_ms_check" CHECK ((("duration_ms" IS NULL) OR ("duration_ms" >= 0)))
);


ALTER TABLE "public"."api_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "actor_id" "uuid" GENERATED ALWAYS AS ("actor_user_id") STORED,
    "business_portfolio_id" "uuid",
    "waba_id" "uuid",
    "whatsapp_number_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "resource_type" "text" GENERATED ALWAYS AS ("entity_type") STORED,
    "entity_id" "text",
    "resource_id" "text" GENERATED ALWAYS AS ("entity_id") STORED,
    "old_value" "jsonb",
    "new_value" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ip" "inet",
    "user_agent" "text",
    "correlation_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "trigger_type" "text" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "scope_business_portfolio_id" "uuid",
    "scope_waba_id" "uuid",
    "scope_whatsapp_number_id" "uuid",
    "conditions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "actions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."automation_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "automation_rule_id" "uuid" NOT NULL,
    "whatsapp_number_id" "uuid",
    "conversation_id" "uuid",
    "message_id" "uuid",
    "trigger_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "error" "text",
    "idempotency_key" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "automation_runs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'skipped'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."automation_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_portfolios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "meta_business_id" "text" NOT NULL,
    "name" "text",
    "verification_status" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_portfolios_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'missing_from_meta'::"text", 'requires_review'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."business_portfolios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "recipient_address" "text" NOT NULL,
    "message_id" "uuid",
    "request_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "error_code" "text",
    "error_message" "text",
    "idempotency_key" "text" NOT NULL,
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_recipients_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'submitted'::"text", 'sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."campaign_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sender_whatsapp_number_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "audience" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "rate_limit_per_minute" integer DEFAULT 60 NOT NULL,
    "stats" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaigns_rate_limit_per_minute_check" CHECK (("rate_limit_per_minute" > 0)),
    CONSTRAINT "campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'scheduled'::"text", 'running'::"text", 'paused'::"text", 'completed'::"text", 'cancelled'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "channel_type" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "address" "text" NOT NULL,
    "normalized_address" "text",
    "wa_id" "text",
    "profile_name" "text",
    "is_primary" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_channels_channel_type_check" CHECK (("channel_type" = ANY (ARRAY['whatsapp'::"text", 'phone'::"text", 'email'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."contact_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "display_name" "text",
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "company" "text",
    "source" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "assigned_user_id" "uuid",
    "assigned_team_id" "uuid",
    "notes" "text",
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "first_interaction_at" timestamp with time zone,
    "last_interaction_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contacts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'blocked'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "whatsapp_number_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "contact_channel_id" "uuid",
    "meta_conversation_id" "text",
    "category" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "assigned_user_id" "uuid",
    "assigned_team_id" "uuid",
    "unread_count" integer DEFAULT 0 NOT NULL,
    "last_message_at" timestamp with time zone,
    "last_incoming_at" timestamp with time zone,
    "last_outgoing_at" timestamp with time zone,
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversations_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "conversations_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'pending'::"text", 'waiting_customer'::"text", 'resolved'::"text", 'closed'::"text", 'spam'::"text"]))),
    CONSTRAINT "conversations_unread_count_check" CHECK (("unread_count" >= 0))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dead_letter_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "original_job_id" "uuid",
    "queue_name" "text" NOT NULL,
    "job_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "error" "text" GENERATED ALWAYS AS ("last_error") STORED,
    "failed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dead_letter_jobs_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "dead_letter_jobs_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'retried'::"text", 'discarded'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."dead_letter_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."health_checks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "business_portfolio_id" "uuid",
    "waba_id" "uuid",
    "whatsapp_number_id" "uuid",
    "component" "text" NOT NULL,
    "check_name" "text" GENERATED ALWAYS AS ("component") STORED,
    "check_type" "text" GENERATED ALWAYS AS ("component") STORED,
    "scope" "text" GENERATED ALWAYS AS (
CASE
    WHEN ("whatsapp_number_id" IS NOT NULL) THEN ('number:'::"text" || ("whatsapp_number_id")::"text")
    WHEN ("waba_id" IS NOT NULL) THEN ('waba:'::"text" || ("waba_id")::"text")
    WHEN ("business_portfolio_id" IS NOT NULL) THEN ('business:'::"text" || ("business_portfolio_id")::"text")
    ELSE ('organization:'::"text" || ("organization_id")::"text")
END) STORED,
    "status" "text" NOT NULL,
    "score" numeric(5,2),
    "latency_ms" integer,
    "message" "text",
    "detail" "text" GENERATED ALWAYS AS ("message") STORED,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "checked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "health_checks_latency_ms_check" CHECK ((("latency_ms" IS NULL) OR ("latency_ms" >= 0))),
    CONSTRAINT "health_checks_status_check" CHECK (("status" = ANY (ARRAY['healthy'::"text", 'warning'::"text", 'critical'::"text", 'offline'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."health_checks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "whatsapp_number_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "meta_media_id" "text",
    "media_type" "text" NOT NULL,
    "mime_type" "text",
    "filename" "text",
    "file_size" bigint,
    "sha256" "text",
    "storage_provider" "text" DEFAULT 'minio'::"text" NOT NULL,
    "storage_bucket" "text",
    "storage_path" "text",
    "download_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "download_attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "received_at" timestamp with time zone,
    "stored_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "media_download_attempts_check" CHECK (("download_attempts" >= 0)),
    CONSTRAINT "media_download_status_check" CHECK (("download_status" = ANY (ARRAY['pending'::"text", 'downloading'::"text", 'downloaded'::"text", 'failed'::"text", 'expired'::"text", 'deleted'::"text"]))),
    CONSTRAINT "media_file_size_check" CHECK ((("file_size" IS NULL) OR ("file_size" >= 0)))
);


ALTER TABLE "public"."media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_download_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "media_id" "uuid" NOT NULL,
    "attempt_no" integer NOT NULL,
    "status" "text" NOT NULL,
    "http_status" integer,
    "error" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "media_download_attempts_attempt_no_check" CHECK (("attempt_no" > 0)),
    CONSTRAINT "media_download_attempts_status_check" CHECK (("status" = ANY (ARRAY['started'::"text", 'stored'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."media_download_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "whatsapp_number_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "conversation_id" "uuid",
    "campaign_id" "uuid",
    "campaign_recipient_id" "uuid",
    "recipient_address" "text" NOT NULL,
    "message_type" "text" NOT NULL,
    "request_payload" "jsonb" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "meta_message_id" "text",
    "requested_by" "uuid",
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_error" "text",
    "submitted_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_outbox_attempt_count_check" CHECK (("attempt_count" >= 0)),
    CONSTRAINT "message_outbox_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'sending'::"text", 'submitted'::"text", 'sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."message_outbox" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_send_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "outbox_id" "uuid" NOT NULL,
    "api_request_id" "uuid",
    "attempt_no" integer NOT NULL,
    "status" "text" NOT NULL,
    "http_status" integer,
    "error_code" "text",
    "error_message" "text",
    "response_meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_send_attempts_attempt_no_check" CHECK (("attempt_no" > 0)),
    CONSTRAINT "message_send_attempts_status_check" CHECK (("status" = ANY (ARRAY['started'::"text", 'submitted'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."message_send_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "whatsapp_number_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "meta_timestamp" timestamp with time zone,
    "error_code" "text",
    "error_message" "text",
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "payload" "jsonb" GENERATED ALWAYS AS ("raw_payload") STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_status_history_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'queued'::"text", 'submitted'::"text", 'sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text", 'deleted'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."message_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "whatsapp_number_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "contact_channel_id" "uuid",
    "meta_message_id" "text",
    "direction" "text" NOT NULL,
    "message_type" "text" NOT NULL,
    "body" "text",
    "caption" "text",
    "reply_to_message_id" "uuid",
    "meta_reply_to_message_id" "text",
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "error_code" "text",
    "error_message" "text",
    "interactive_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "context_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "meta_timestamp" timestamp with time zone,
    "received_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "messages_direction_check" CHECK (("direction" = ANY (ARRAY['incoming'::"text", 'outgoing'::"text", 'system'::"text"]))),
    CONSTRAINT "messages_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'queued'::"text", 'submitted'::"text", 'sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text", 'deleted'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meta_app_wabas" (
    "organization_id" "uuid" NOT NULL,
    "meta_app_id" "uuid" NOT NULL,
    "waba_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "meta_app_wabas_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'pending'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."meta_app_wabas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meta_apps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "business_portfolio_id" "uuid",
    "meta_app_id" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "platform" "text" DEFAULT 'meta'::"text" NOT NULL,
    "namespace" "text",
    "app_domains" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "privacy_policy_url" "text",
    "terms_url" "text",
    "data_deletion_url" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "meta_apps_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'review'::"text", 'restricted'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."meta_apps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meta_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "meta_app_id" "uuid",
    "business_portfolio_id" "uuid",
    "meta_system_user_id" "uuid",
    "waba_id" "uuid",
    "whatsapp_number_id" "uuid",
    "credential_type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "secret_reference" "text" NOT NULL,
    "token_fingerprint" "text",
    "scopes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "expires_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "last_verified_at" timestamp with time zone,
    "last_used_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "meta_credentials_credential_type_check" CHECK (("credential_type" = ANY (ARRAY['system_user_token'::"text", 'user_token'::"text", 'app_secret'::"text", 'verify_token'::"text", 'access_token'::"text", 'app_access_token'::"text", 'other'::"text"]))),
    CONSTRAINT "meta_credentials_owner_check" CHECK ((("meta_app_id" IS NOT NULL) OR ("business_portfolio_id" IS NOT NULL) OR ("meta_system_user_id" IS NOT NULL) OR ("waba_id" IS NOT NULL) OR ("whatsapp_number_id" IS NOT NULL))),
    CONSTRAINT "meta_credentials_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'expired'::"text", 'revoked'::"text", 'invalid'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."meta_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meta_sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "business_portfolio_id" "uuid",
    "waba_id" "uuid",
    "whatsapp_number_id" "uuid",
    "sync_type" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "requested_by" "uuid",
    "stats" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "meta_sync_runs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'partial'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "meta_sync_runs_sync_type_check" CHECK (("sync_type" = ANY (ARRAY['business'::"text", 'wabas'::"text", 'numbers'::"text", 'templates'::"text", 'flows'::"text", 'subscriptions'::"text", 'number_health'::"text", 'full'::"text"])))
);


ALTER TABLE "public"."meta_sync_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meta_system_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "business_portfolio_id" "uuid" NOT NULL,
    "meta_system_user_id" "text" NOT NULL,
    "name" "text",
    "system_role" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "meta_system_users_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'disabled'::"text", 'missing_from_meta'::"text", 'requires_review'::"text"])))
);


ALTER TABLE "public"."meta_system_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "joined_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_members_status_check" CHECK (("status" = ANY (ARRAY['invited'::"text", 'active'::"text", 'suspended'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organizations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "email" "text",
    "avatar_url" "text",
    "locale" "text" DEFAULT 'ar'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'Africa/Cairo'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_system" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "organization_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "description" "text",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "organization_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_lead" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_number_access" (
    "organization_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "whatsapp_number_id" "uuid" NOT NULL,
    "can_read" boolean DEFAULT true NOT NULL,
    "can_send" boolean DEFAULT false NOT NULL,
    "can_manage" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."team_number_access" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "teams_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "waba_id" "uuid" NOT NULL,
    "meta_template_id" "text",
    "name" "text" NOT NULL,
    "category" "text",
    "language" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "quality_rating" "text",
    "parameter_format" "text",
    "components" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "rejection_reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "templates_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending'::"text", 'approved'::"text", 'rejected'::"text", 'paused'::"text", 'disabled'::"text", 'deleted'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unmapped_number_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "webhook_event_id" "uuid",
    "meta_phone_number_id" "text" NOT NULL,
    "meta_waba_id" "text",
    "display_phone_number" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occurrences" integer DEFAULT 1 NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved" boolean DEFAULT false NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_whatsapp_number_id" "uuid",
    CONSTRAINT "unmapped_number_events_occurrences_check" CHECK (("occurrences" > 0))
);


ALTER TABLE "public"."unmapped_number_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_business_access" (
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_portfolio_id" "uuid" NOT NULL,
    "can_read" boolean DEFAULT true NOT NULL,
    "can_manage" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "can_send" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."user_business_access" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_number_access" (
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "whatsapp_number_id" "uuid" NOT NULL,
    "can_read" boolean DEFAULT true NOT NULL,
    "can_send" boolean DEFAULT false NOT NULL,
    "can_manage" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_number_access" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_waba_access" (
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "waba_id" "uuid" NOT NULL,
    "can_read" boolean DEFAULT true NOT NULL,
    "can_manage" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "can_send" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."user_waba_access" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_numbers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "waba_id" "uuid" NOT NULL,
    "meta_phone_number_id" "text" NOT NULL,
    "display_phone_number" "text",
    "normalized_phone_number" "text",
    "verified_name" "text",
    "internal_name" "text",
    "department" "text",
    "country" "text",
    "purpose" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "code_verification_status" "text",
    "quality_rating" "text",
    "platform_type" "text",
    "throughput_level" "text",
    "messaging_limit" "text",
    "account_mode" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "timezone" "text",
    "default_language" "text" DEFAULT 'ar'::"text",
    "webhook_status" "text",
    "last_incoming_message_at" timestamp with time zone,
    "last_outgoing_message_at" timestamp with time zone,
    "last_api_success_at" timestamp with time zone,
    "last_api_failure_at" timestamp with time zone,
    "last_synced_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_numbers_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'missing_from_meta'::"text", 'requires_review'::"text", 'restricted'::"text", 'disconnected'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."whatsapp_numbers" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_number_message_stats_24h" WITH ("security_invoker"='true') AS
 SELECT "n"."organization_id",
    "n"."id" AS "whatsapp_number_id",
    "n"."display_phone_number",
    "count"("m"."id") FILTER (WHERE ("m"."direction" = 'incoming'::"text")) AS "incoming_24h",
    "count"("m"."id") FILTER (WHERE ("m"."direction" = 'outgoing'::"text")) AS "outgoing_24h",
    "count"("m"."id") FILTER (WHERE ("m"."status" = 'failed'::"text")) AS "failed_24h",
    "count"("m"."id") AS "total_24h"
   FROM ("public"."whatsapp_numbers" "n"
     LEFT JOIN "public"."messages" "m" ON ((("m"."organization_id" = "n"."organization_id") AND ("m"."whatsapp_number_id" = "n"."id") AND ("m"."created_at" >= ("now"() - '24:00:00'::interval)))))
  GROUP BY "n"."organization_id", "n"."id", "n"."display_phone_number";


ALTER VIEW "public"."v_number_message_stats_24h" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wabas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "business_portfolio_id" "uuid" NOT NULL,
    "meta_waba_id" "text" NOT NULL,
    "name" "text",
    "currency" "text",
    "timezone" "text",
    "account_review_status" "text",
    "business_verification_status" "text",
    "message_template_namespace" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wabas_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'missing_from_meta'::"text", 'requires_review'::"text", 'restricted'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."wabas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_whatsapp_structure" WITH ("security_invoker"='true') AS
 SELECT "o"."id" AS "organization_id",
    "o"."name" AS "organization_name",
    "bp"."id" AS "business_portfolio_id",
    "bp"."meta_business_id",
    "bp"."name" AS "business_name",
    "w"."id" AS "waba_id",
    "w"."meta_waba_id",
    "w"."name" AS "waba_name",
    "n"."id" AS "whatsapp_number_id",
    "n"."meta_phone_number_id",
    "n"."display_phone_number",
    "n"."normalized_phone_number",
    "n"."verified_name",
    "n"."internal_name",
    "n"."status",
    "n"."is_enabled",
    "n"."quality_rating",
    "n"."messaging_limit",
    "n"."webhook_status",
    "n"."last_incoming_message_at",
    "n"."last_outgoing_message_at"
   FROM ((("public"."organizations" "o"
     JOIN "public"."business_portfolios" "bp" ON (("bp"."organization_id" = "o"."id")))
     JOIN "public"."wabas" "w" ON ((("w"."organization_id" = "o"."id") AND ("w"."business_portfolio_id" = "bp"."id"))))
     JOIN "public"."whatsapp_numbers" "n" ON ((("n"."organization_id" = "o"."id") AND ("n"."waba_id" = "w"."id"))));


ALTER VIEW "public"."v_whatsapp_structure" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waba_assigned_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "waba_id" "uuid" NOT NULL,
    "meta_user_id" "text" NOT NULL,
    "local_system_user_id" "uuid",
    "name" "text",
    "tasks" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."waba_assigned_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waba_subscribed_apps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "waba_id" "uuid" NOT NULL,
    "meta_app_id" "text" NOT NULL,
    "local_meta_app_id" "uuid",
    "app_name" "text",
    "app_link" "text",
    "app_namespace" "text",
    "app_category" "text",
    "override_callback_uri" "text",
    "is_azwa" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."waba_subscribed_apps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_endpoints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "meta_app_id" "uuid" NOT NULL,
    "endpoint_type" "text" DEFAULT 'meta_whatsapp'::"text" NOT NULL,
    "url" "text" NOT NULL,
    "verify_token_credential_id" "uuid",
    "app_secret_credential_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "verification_status" "text",
    "last_event_at" timestamp with time zone,
    "last_success_at" timestamp with time zone,
    "last_failure_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "webhook_endpoints_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."webhook_endpoints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_event_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "webhook_event_id" "uuid" NOT NULL,
    "attempt_no" integer NOT NULL,
    "status" "text" NOT NULL,
    "error" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "webhook_event_attempts_attempt_no_check" CHECK (("attempt_no" > 0)),
    CONSTRAINT "webhook_event_attempts_status_check" CHECK (("status" = ANY (ARRAY['started'::"text", 'processed'::"text", 'failed'::"text", 'ignored'::"text"])))
);


ALTER TABLE "public"."webhook_event_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "webhook_endpoint_id" "uuid",
    "meta_app_id" "uuid",
    "business_portfolio_id" "uuid",
    "waba_id" "uuid",
    "whatsapp_number_id" "uuid",
    "meta_waba_id" "text",
    "meta_phone_number_id" "text",
    "event_type" "text" NOT NULL,
    "field" "text" GENERATED ALWAYS AS ("event_type") STORED,
    "meta_message_id" "text",
    "deduplication_key" "text" NOT NULL,
    "signature_valid" boolean DEFAULT false NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "attempts" integer DEFAULT 1 NOT NULL,
    "error" "text",
    "error_message" "text" GENERATED ALWAYS AS ("error") STORED,
    "last_error" "text" GENERATED ALWAYS AS ("error") STORED,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "webhook_events_attempts_check" CHECK (("attempts" > 0)),
    CONSTRAINT "webhook_events_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'processing'::"text", 'processed'::"text", 'failed'::"text", 'ignored'::"text", 'unmapped_number_event'::"text"])))
);


ALTER TABLE "public"."webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_flows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "waba_id" "uuid" NOT NULL,
    "meta_flow_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "validation_errors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "json_version" "text",
    "data_api_version" "text",
    "endpoint_uri" "text",
    "preview_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."whatsapp_flows" OWNER TO "postgres";


ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_errors"
    ADD CONSTRAINT "api_errors_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."api_errors"
    ADD CONSTRAINT "api_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_requests"
    ADD CONSTRAINT "api_requests_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."api_requests"
    ADD CONSTRAINT "api_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_portfolios"
    ADD CONSTRAINT "business_portfolios_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."business_portfolios"
    ADD CONSTRAINT "business_portfolios_organization_id_meta_business_id_key" UNIQUE ("organization_id", "meta_business_id");



ALTER TABLE ONLY "public"."business_portfolios"
    ADD CONSTRAINT "business_portfolios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_recipients"
    ADD CONSTRAINT "campaign_recipients_campaign_id_recipient_address_key" UNIQUE ("campaign_id", "recipient_address");



ALTER TABLE ONLY "public"."campaign_recipients"
    ADD CONSTRAINT "campaign_recipients_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."campaign_recipients"
    ADD CONSTRAINT "campaign_recipients_organization_id_idempotency_key_key" UNIQUE ("organization_id", "idempotency_key");



ALTER TABLE ONLY "public"."campaign_recipients"
    ADD CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_channels"
    ADD CONSTRAINT "contact_channels_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."contact_channels"
    ADD CONSTRAINT "contact_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_organization_id_whatsapp_number_id_contact_id_key" UNIQUE ("organization_id", "whatsapp_number_id", "contact_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dead_letter_jobs"
    ADD CONSTRAINT "dead_letter_jobs_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."dead_letter_jobs"
    ADD CONSTRAINT "dead_letter_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."health_checks"
    ADD CONSTRAINT "health_checks_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."health_checks"
    ADD CONSTRAINT "health_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_download_attempts"
    ADD CONSTRAINT "media_download_attempts_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."media_download_attempts"
    ADD CONSTRAINT "media_download_attempts_media_id_attempt_no_key" UNIQUE ("media_id", "attempt_no");



ALTER TABLE ONLY "public"."media_download_attempts"
    ADD CONSTRAINT "media_download_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_outbox"
    ADD CONSTRAINT "message_outbox_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."message_outbox"
    ADD CONSTRAINT "message_outbox_organization_id_idempotency_key_key" UNIQUE ("organization_id", "idempotency_key");



ALTER TABLE ONLY "public"."message_outbox"
    ADD CONSTRAINT "message_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_send_attempts"
    ADD CONSTRAINT "message_send_attempts_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."message_send_attempts"
    ADD CONSTRAINT "message_send_attempts_outbox_id_attempt_no_key" UNIQUE ("outbox_id", "attempt_no");



ALTER TABLE ONLY "public"."message_send_attempts"
    ADD CONSTRAINT "message_send_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_status_history"
    ADD CONSTRAINT "message_status_history_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."message_status_history"
    ADD CONSTRAINT "message_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meta_app_wabas"
    ADD CONSTRAINT "meta_app_wabas_pkey" PRIMARY KEY ("meta_app_id", "waba_id");



ALTER TABLE ONLY "public"."meta_apps"
    ADD CONSTRAINT "meta_apps_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."meta_apps"
    ADD CONSTRAINT "meta_apps_organization_id_meta_app_id_key" UNIQUE ("organization_id", "meta_app_id");



ALTER TABLE ONLY "public"."meta_apps"
    ADD CONSTRAINT "meta_apps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meta_credentials"
    ADD CONSTRAINT "meta_credentials_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."meta_credentials"
    ADD CONSTRAINT "meta_credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meta_sync_runs"
    ADD CONSTRAINT "meta_sync_runs_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."meta_sync_runs"
    ADD CONSTRAINT "meta_sync_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meta_system_users"
    ADD CONSTRAINT "meta_system_users_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."meta_system_users"
    ADD CONSTRAINT "meta_system_users_organization_id_meta_system_user_id_key" UNIQUE ("organization_id", "meta_system_user_id");



ALTER TABLE ONLY "public"."meta_system_users"
    ADD CONSTRAINT "meta_system_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("organization_id", "key");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id", "user_id");



ALTER TABLE ONLY "public"."team_number_access"
    ADD CONSTRAINT "team_number_access_pkey" PRIMARY KEY ("team_id", "whatsapp_number_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_waba_id_name_language_key" UNIQUE ("waba_id", "name", "language");



ALTER TABLE ONLY "public"."unmapped_number_events"
    ADD CONSTRAINT "unmapped_number_events_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."unmapped_number_events"
    ADD CONSTRAINT "unmapped_number_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_business_access"
    ADD CONSTRAINT "user_business_access_pkey" PRIMARY KEY ("user_id", "business_portfolio_id");



ALTER TABLE ONLY "public"."user_number_access"
    ADD CONSTRAINT "user_number_access_pkey" PRIMARY KEY ("user_id", "whatsapp_number_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("organization_id", "user_id", "role_id");



ALTER TABLE ONLY "public"."user_waba_access"
    ADD CONSTRAINT "user_waba_access_pkey" PRIMARY KEY ("user_id", "waba_id");



ALTER TABLE ONLY "public"."waba_assigned_users"
    ADD CONSTRAINT "waba_assigned_users_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."waba_assigned_users"
    ADD CONSTRAINT "waba_assigned_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waba_assigned_users"
    ADD CONSTRAINT "waba_assigned_users_waba_id_meta_user_id_key" UNIQUE ("waba_id", "meta_user_id");



ALTER TABLE ONLY "public"."waba_subscribed_apps"
    ADD CONSTRAINT "waba_subscribed_apps_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."waba_subscribed_apps"
    ADD CONSTRAINT "waba_subscribed_apps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waba_subscribed_apps"
    ADD CONSTRAINT "waba_subscribed_apps_waba_id_meta_app_id_key" UNIQUE ("waba_id", "meta_app_id");



ALTER TABLE ONLY "public"."wabas"
    ADD CONSTRAINT "wabas_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."wabas"
    ADD CONSTRAINT "wabas_organization_id_meta_waba_id_key" UNIQUE ("organization_id", "meta_waba_id");



ALTER TABLE ONLY "public"."wabas"
    ADD CONSTRAINT "wabas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_endpoints"
    ADD CONSTRAINT "webhook_endpoints_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."webhook_endpoints"
    ADD CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_event_attempts"
    ADD CONSTRAINT "webhook_event_attempts_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."webhook_event_attempts"
    ADD CONSTRAINT "webhook_event_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_event_attempts"
    ADD CONSTRAINT "webhook_event_attempts_webhook_event_id_attempt_no_key" UNIQUE ("webhook_event_id", "attempt_no");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_organization_id_deduplication_key_key" UNIQUE ("organization_id", "deduplication_key");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_flows"
    ADD CONSTRAINT "whatsapp_flows_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."whatsapp_flows"
    ADD CONSTRAINT "whatsapp_flows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_flows"
    ADD CONSTRAINT "whatsapp_flows_waba_id_meta_flow_id_key" UNIQUE ("waba_id", "meta_flow_id");



ALTER TABLE ONLY "public"."whatsapp_numbers"
    ADD CONSTRAINT "whatsapp_numbers_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."whatsapp_numbers"
    ADD CONSTRAINT "whatsapp_numbers_organization_id_meta_phone_number_id_key" UNIQUE ("organization_id", "meta_phone_number_id");



ALTER TABLE ONLY "public"."whatsapp_numbers"
    ADD CONSTRAINT "whatsapp_numbers_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_alerts_business" ON "public"."alerts" USING "btree" ("business_portfolio_id", "organization_id");



CREATE INDEX "idx_alerts_number" ON "public"."alerts" USING "btree" ("whatsapp_number_id", "organization_id");



CREATE INDEX "idx_alerts_open" ON "public"."alerts" USING "btree" ("organization_id", "status", "severity", "created_at" DESC);



CREATE INDEX "idx_alerts_waba" ON "public"."alerts" USING "btree" ("waba_id", "organization_id");



CREATE INDEX "idx_api_errors_number" ON "public"."api_errors" USING "btree" ("whatsapp_number_id", "organization_id");



CREATE INDEX "idx_api_errors_open" ON "public"."api_errors" USING "btree" ("organization_id", "status", "last_occurred_at" DESC);



CREATE INDEX "idx_api_errors_request" ON "public"."api_errors" USING "btree" ("api_request_id", "organization_id");



CREATE INDEX "idx_api_errors_waba" ON "public"."api_errors" USING "btree" ("waba_id", "organization_id");



CREATE INDEX "idx_api_requests_app" ON "public"."api_requests" USING "btree" ("meta_app_id", "organization_id");



CREATE INDEX "idx_api_requests_business" ON "public"."api_requests" USING "btree" ("business_portfolio_id", "organization_id");



CREATE INDEX "idx_api_requests_created" ON "public"."api_requests" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_api_requests_http" ON "public"."api_requests" USING "btree" ("http_status", "created_at" DESC);



CREATE INDEX "idx_api_requests_number" ON "public"."api_requests" USING "btree" ("whatsapp_number_id", "organization_id");



CREATE INDEX "idx_api_requests_waba" ON "public"."api_requests" USING "btree" ("waba_id", "organization_id");



CREATE INDEX "idx_audit_actor" ON "public"."audit_logs" USING "btree" ("organization_id", "actor_user_id");



CREATE INDEX "idx_audit_business" ON "public"."audit_logs" USING "btree" ("business_portfolio_id", "organization_id");



CREATE INDEX "idx_audit_created" ON "public"."audit_logs" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_audit_number" ON "public"."audit_logs" USING "btree" ("whatsapp_number_id", "organization_id");



CREATE INDEX "idx_audit_waba" ON "public"."audit_logs" USING "btree" ("waba_id", "organization_id");



CREATE INDEX "idx_automation_rules_business" ON "public"."automation_rules" USING "btree" ("scope_business_portfolio_id", "organization_id");



CREATE INDEX "idx_automation_rules_created_by" ON "public"."automation_rules" USING "btree" ("organization_id", "created_by");



CREATE INDEX "idx_automation_rules_enabled_trigger" ON "public"."automation_rules" USING "btree" ("organization_id", "is_enabled", "trigger_type", "priority");



CREATE INDEX "idx_automation_rules_number" ON "public"."automation_rules" USING "btree" ("scope_whatsapp_number_id", "organization_id");



CREATE INDEX "idx_automation_rules_waba" ON "public"."automation_rules" USING "btree" ("scope_waba_id", "organization_id");



CREATE INDEX "idx_automation_runs_conversation" ON "public"."automation_runs" USING "btree" ("conversation_id", "organization_id");



CREATE INDEX "idx_automation_runs_message" ON "public"."automation_runs" USING "btree" ("message_id", "organization_id");



CREATE INDEX "idx_automation_runs_number" ON "public"."automation_runs" USING "btree" ("whatsapp_number_id", "organization_id");



CREATE INDEX "idx_automation_runs_rule" ON "public"."automation_runs" USING "btree" ("automation_rule_id", "organization_id");



CREATE INDEX "idx_azwa_fk_credentials_app" ON "public"."meta_credentials" USING "btree" ("meta_app_id", "organization_id");



CREATE INDEX "idx_azwa_fk_credentials_number" ON "public"."meta_credentials" USING "btree" ("whatsapp_number_id", "organization_id");



CREATE INDEX "idx_azwa_fk_credentials_portfolio" ON "public"."meta_credentials" USING "btree" ("business_portfolio_id", "organization_id");



CREATE INDEX "idx_azwa_fk_credentials_system_user" ON "public"."meta_credentials" USING "btree" ("meta_system_user_id", "organization_id");



CREATE INDEX "idx_azwa_fk_credentials_waba" ON "public"."meta_credentials" USING "btree" ("waba_id", "organization_id");



CREATE INDEX "idx_azwa_fk_flows_waba" ON "public"."whatsapp_flows" USING "btree" ("waba_id", "organization_id");



CREATE INDEX "idx_azwa_fk_meta_app_wabas_app" ON "public"."meta_app_wabas" USING "btree" ("meta_app_id", "organization_id");



CREATE INDEX "idx_azwa_fk_meta_app_wabas_waba" ON "public"."meta_app_wabas" USING "btree" ("waba_id", "organization_id");



CREATE INDEX "idx_azwa_fk_meta_apps_portfolio" ON "public"."meta_apps" USING "btree" ("business_portfolio_id", "organization_id");



CREATE INDEX "idx_azwa_fk_numbers_waba" ON "public"."whatsapp_numbers" USING "btree" ("waba_id", "organization_id");



CREATE INDEX "idx_azwa_fk_role_permissions_permission" ON "public"."role_permissions" USING "btree" ("permission_id");



CREATE INDEX "idx_azwa_fk_system_users_portfolio" ON "public"."meta_system_users" USING "btree" ("business_portfolio_id", "organization_id");



CREATE INDEX "idx_azwa_fk_team_members_org_member" ON "public"."team_members" USING "btree" ("organization_id", "user_id");



CREATE INDEX "idx_azwa_fk_team_members_team" ON "public"."team_members" USING "btree" ("team_id", "organization_id");



CREATE INDEX "idx_azwa_fk_team_number_access_number" ON "public"."team_number_access" USING "btree" ("whatsapp_number_id", "organization_id");



CREATE INDEX "idx_azwa_fk_team_number_access_team" ON "public"."team_number_access" USING "btree" ("team_id", "organization_id");



CREATE INDEX "idx_azwa_fk_templates_waba" ON "public"."templates" USING "btree" ("waba_id", "organization_id");



CREATE INDEX "idx_azwa_fk_user_business_member" ON "public"."user_business_access" USING "btree" ("organization_id", "user_id");



CREATE INDEX "idx_azwa_fk_user_business_portfolio" ON "public"."user_business_access" USING "btree" ("business_portfolio_id", "organization_id");



CREATE INDEX "idx_azwa_fk_user_number_member" ON "public"."user_number_access" USING "btree" ("organization_id", "user_id");



CREATE INDEX "idx_azwa_fk_user_number_number" ON "public"."user_number_access" USING "btree" ("whatsapp_number_id", "organization_id");



CREATE INDEX "idx_azwa_fk_user_roles_role" ON "public"."user_roles" USING "btree" ("role_id");



CREATE INDEX "idx_azwa_fk_user_waba_member" ON "public"."user_waba_access" USING "btree" ("organization_id", "user_id");



CREATE INDEX "idx_azwa_fk_user_waba_waba" ON "public"."user_waba_access" USING "btree" ("waba_id", "organization_id");



CREATE INDEX "idx_azwa_fk_waba_assigned_system_user" ON "public"."waba_assigned_users" USING "btree" ("local_system_user_id", "organization_id");



CREATE INDEX "idx_azwa_fk_waba_assigned_waba" ON "public"."waba_assigned_users" USING "btree" ("waba_id", "organization_id");



CREATE INDEX "idx_azwa_fk_waba_subscribed_local_app" ON "public"."waba_subscribed_apps" USING "btree" ("local_meta_app_id", "organization_id");



CREATE INDEX "idx_azwa_fk_waba_subscribed_waba" ON "public"."waba_subscribed_apps" USING "btree" ("waba_id", "organization_id");



CREATE INDEX "idx_azwa_fk_wabas_portfolio" ON "public"."wabas" USING "btree" ("business_portfolio_id", "organization_id");



CREATE INDEX "idx_azwa_fk_webhook_app" ON "public"."webhook_endpoints" USING "btree" ("meta_app_id", "organization_id");



CREATE INDEX "idx_azwa_fk_webhook_app_secret" ON "public"."webhook_endpoints" USING "btree" ("app_secret_credential_id", "organization_id");



CREATE INDEX "idx_azwa_fk_webhook_verify_credential" ON "public"."webhook_endpoints" USING "btree" ("verify_token_credential_id", "organization_id");



CREATE INDEX "idx_business_portfolios_org_status" ON "public"."business_portfolios" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_campaign_recipients_campaign" ON "public"."campaign_recipients" USING "btree" ("campaign_id", "organization_id");



CREATE INDEX "idx_campaign_recipients_contact" ON "public"."campaign_recipients" USING "btree" ("contact_id", "organization_id");



CREATE INDEX "idx_campaign_recipients_message" ON "public"."campaign_recipients" USING "btree" ("message_id", "organization_id");



CREATE INDEX "idx_campaign_recipients_status" ON "public"."campaign_recipients" USING "btree" ("campaign_id", "status", "created_at");



CREATE INDEX "idx_campaigns_created_by" ON "public"."campaigns" USING "btree" ("organization_id", "created_by");



CREATE INDEX "idx_campaigns_sender" ON "public"."campaigns" USING "btree" ("sender_whatsapp_number_id", "organization_id");



CREATE INDEX "idx_campaigns_status_schedule" ON "public"."campaigns" USING "btree" ("organization_id", "status", "scheduled_at");



CREATE INDEX "idx_campaigns_template" ON "public"."campaigns" USING "btree" ("template_id", "organization_id");



CREATE INDEX "idx_contact_channels_contact" ON "public"."contact_channels" USING "btree" ("contact_id", "organization_id");



CREATE INDEX "idx_contacts_assigned_team" ON "public"."contacts" USING "btree" ("assigned_team_id", "organization_id");



CREATE INDEX "idx_contacts_assigned_user" ON "public"."contacts" USING "btree" ("organization_id", "assigned_user_id");



CREATE INDEX "idx_contacts_org_last_interaction" ON "public"."contacts" USING "btree" ("organization_id", "last_interaction_at" DESC);



CREATE INDEX "idx_conversations_assigned_team" ON "public"."conversations" USING "btree" ("assigned_team_id", "organization_id");



CREATE INDEX "idx_conversations_assigned_user" ON "public"."conversations" USING "btree" ("organization_id", "assigned_user_id");



CREATE INDEX "idx_conversations_channel" ON "public"."conversations" USING "btree" ("contact_channel_id", "organization_id");



CREATE INDEX "idx_conversations_contact" ON "public"."conversations" USING "btree" ("contact_id", "organization_id");



CREATE INDEX "idx_conversations_number" ON "public"."conversations" USING "btree" ("whatsapp_number_id", "organization_id");



CREATE INDEX "idx_conversations_number_status_last" ON "public"."conversations" USING "btree" ("whatsapp_number_id", "status", "last_message_at" DESC);



CREATE INDEX "idx_credentials_org_type_status" ON "public"."meta_credentials" USING "btree" ("organization_id", "credential_type", "status");



CREATE INDEX "idx_dead_letter_open" ON "public"."dead_letter_jobs" USING "btree" ("organization_id", "status", "failed_at" DESC);



CREATE INDEX "idx_dead_letter_original" ON "public"."dead_letter_jobs" USING "btree" ("original_job_id", "organization_id");



CREATE INDEX "idx_health_business" ON "public"."health_checks" USING "btree" ("business_portfolio_id", "organization_id");



CREATE INDEX "idx_health_component" ON "public"."health_checks" USING "btree" ("organization_id", "component", "checked_at" DESC);



CREATE INDEX "idx_health_number" ON "public"."health_checks" USING "btree" ("whatsapp_number_id", "organization_id");



CREATE INDEX "idx_health_waba" ON "public"."health_checks" USING "btree" ("waba_id", "organization_id");



CREATE INDEX "idx_jobs_dispatch" ON "public"."jobs" USING "btree" ("queue_name", "status", "available_at", "priority", "created_at");



CREATE INDEX "idx_media_attempt_media" ON "public"."media_download_attempts" USING "btree" ("media_id", "organization_id");



CREATE INDEX "idx_media_contact" ON "public"."media" USING "btree" ("contact_id", "organization_id");



CREATE INDEX "idx_media_message" ON "public"."media" USING "btree" ("message_id", "organization_id");



CREATE INDEX "idx_media_number" ON "public"."media" USING "btree" ("whatsapp_number_id", "organization_id");



CREATE INDEX "idx_media_number_received" ON "public"."media" USING "btree" ("whatsapp_number_id", "received_at" DESC);



CREATE INDEX "idx_messages_channel" ON "public"."messages" USING "btree" ("contact_channel_id", "organization_id");



CREATE INDEX "idx_messages_contact" ON "public"."messages" USING "btree" ("contact_id", "organization_id");



CREATE INDEX "idx_messages_conversation" ON "public"."messages" USING "btree" ("conversation_id", "organization_id");



CREATE INDEX "idx_messages_conversation_created" ON "public"."messages" USING "btree" ("conversation_id", "created_at" DESC);



CREATE INDEX "idx_messages_number" ON "public"."messages" USING "btree" ("whatsapp_number_id", "organization_id");



CREATE INDEX "idx_messages_number_created" ON "public"."messages" USING "btree" ("whatsapp_number_id", "created_at" DESC);



CREATE INDEX "idx_messages_reply" ON "public"."messages" USING "btree" ("reply_to_message_id", "organization_id");



CREATE INDEX "idx_meta_apps_org_portfolio_status" ON "public"."meta_apps" USING "btree" ("organization_id", "business_portfolio_id", "status");



CREATE INDEX "idx_meta_sync_business" ON "public"."meta_sync_runs" USING "btree" ("business_portfolio_id", "organization_id");



CREATE INDEX "idx_meta_sync_number" ON "public"."meta_sync_runs" USING "btree" ("whatsapp_number_id", "organization_id");



CREATE INDEX "idx_meta_sync_requested_by" ON "public"."meta_sync_runs" USING "btree" ("organization_id", "requested_by");



CREATE INDEX "idx_meta_sync_scope_created" ON "public"."meta_sync_runs" USING "btree" ("organization_id", "sync_type", "created_at" DESC);



CREATE INDEX "idx_meta_sync_waba" ON "public"."meta_sync_runs" USING "btree" ("waba_id", "organization_id");



CREATE INDEX "idx_meta_system_users_org_portfolio_status" ON "public"."meta_system_users" USING "btree" ("organization_id", "business_portfolio_id", "status");



CREATE INDEX "idx_numbers_org_waba_status" ON "public"."whatsapp_numbers" USING "btree" ("organization_id", "waba_id", "status");



CREATE INDEX "idx_org_members_user_status" ON "public"."organization_members" USING "btree" ("user_id", "status", "organization_id");



CREATE INDEX "idx_outbox_campaign" ON "public"."message_outbox" USING "btree" ("campaign_id", "organization_id");



CREATE INDEX "idx_outbox_campaign_recipient" ON "public"."message_outbox" USING "btree" ("campaign_recipient_id", "organization_id");



CREATE INDEX "idx_outbox_contact" ON "public"."message_outbox" USING "btree" ("contact_id", "organization_id");



CREATE INDEX "idx_outbox_conversation" ON "public"."message_outbox" USING "btree" ("conversation_id", "organization_id");



CREATE INDEX "idx_outbox_dispatch" ON "public"."message_outbox" USING "btree" ("status", "next_attempt_at", "created_at");



CREATE INDEX "idx_outbox_number" ON "public"."message_outbox" USING "btree" ("whatsapp_number_id", "organization_id");



CREATE INDEX "idx_outbox_requested_by" ON "public"."message_outbox" USING "btree" ("organization_id", "requested_by");



CREATE INDEX "idx_send_attempt_outbox" ON "public"."message_send_attempts" USING "btree" ("outbox_id", "organization_id");



CREATE INDEX "idx_send_attempt_request" ON "public"."message_send_attempts" USING "btree" ("api_request_id", "organization_id");



CREATE INDEX "idx_settings_updated_by" ON "public"."system_settings" USING "btree" ("organization_id", "updated_by");



CREATE INDEX "idx_status_history_message" ON "public"."message_status_history" USING "btree" ("message_id", "organization_id");



CREATE INDEX "idx_status_history_number" ON "public"."message_status_history" USING "btree" ("whatsapp_number_id", "organization_id");



CREATE INDEX "idx_teams_org_status" ON "public"."teams" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_templates_org_waba_status" ON "public"."templates" USING "btree" ("organization_id", "waba_id", "status");



CREATE INDEX "idx_unmapped_event" ON "public"."unmapped_number_events" USING "btree" ("webhook_event_id", "organization_id");



CREATE INDEX "idx_unmapped_resolved_number" ON "public"."unmapped_number_events" USING "btree" ("resolved_whatsapp_number_id", "organization_id");



CREATE INDEX "idx_user_roles_user_org" ON "public"."user_roles" USING "btree" ("user_id", "organization_id");



CREATE INDEX "idx_waba_assigned_users_org_waba" ON "public"."waba_assigned_users" USING "btree" ("organization_id", "waba_id");



CREATE INDEX "idx_waba_subscribed_apps_org_waba" ON "public"."waba_subscribed_apps" USING "btree" ("organization_id", "waba_id", "is_azwa");



CREATE INDEX "idx_wabas_org_portfolio_status" ON "public"."wabas" USING "btree" ("organization_id", "business_portfolio_id", "status");



CREATE INDEX "idx_webhook_attempt_event" ON "public"."webhook_event_attempts" USING "btree" ("webhook_event_id", "organization_id");



CREATE INDEX "idx_webhook_endpoints_org_app_status" ON "public"."webhook_endpoints" USING "btree" ("organization_id", "meta_app_id", "status");



CREATE INDEX "idx_webhook_events_app" ON "public"."webhook_events" USING "btree" ("meta_app_id", "organization_id");



CREATE INDEX "idx_webhook_events_business" ON "public"."webhook_events" USING "btree" ("business_portfolio_id", "organization_id");



CREATE INDEX "idx_webhook_events_endpoint" ON "public"."webhook_events" USING "btree" ("webhook_endpoint_id", "organization_id");



CREATE INDEX "idx_webhook_events_number" ON "public"."webhook_events" USING "btree" ("whatsapp_number_id", "organization_id");



CREATE INDEX "idx_webhook_events_status_received" ON "public"."webhook_events" USING "btree" ("status", "received_at" DESC);



CREATE INDEX "idx_webhook_events_waba" ON "public"."webhook_events" USING "btree" ("waba_id", "organization_id");



CREATE INDEX "idx_whatsapp_flows_org_waba_status" ON "public"."whatsapp_flows" USING "btree" ("organization_id", "waba_id", "status");



CREATE UNIQUE INDEX "uq_automation_runs_idempotency" ON "public"."automation_runs" USING "btree" ("organization_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "uq_business_portfolios_primary_per_org" ON "public"."business_portfolios" USING "btree" ("organization_id") WHERE ("is_primary" IS TRUE);



CREATE UNIQUE INDEX "uq_contact_channels_wa_id" ON "public"."contact_channels" USING "btree" ("organization_id", "wa_id") WHERE ("wa_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_contact_channels_whatsapp_address" ON "public"."contact_channels" USING "btree" ("organization_id", "channel_type", "normalized_address") WHERE ("normalized_address" IS NOT NULL);



CREATE UNIQUE INDEX "uq_conversations_meta_id" ON "public"."conversations" USING "btree" ("whatsapp_number_id", "meta_conversation_id") WHERE ("meta_conversation_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_jobs_deduplication_key" ON "public"."jobs" USING "btree" ("organization_id", "queue_name", "deduplication_key") WHERE (("deduplication_key" IS NOT NULL) AND ("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text"])));



CREATE UNIQUE INDEX "uq_media_message_media_id" ON "public"."media" USING "btree" ("message_id", "meta_media_id") WHERE ("meta_media_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_message_status_history_event" ON "public"."message_status_history" USING "btree" ("message_id", "status", "meta_timestamp") WHERE ("meta_timestamp" IS NOT NULL);



CREATE UNIQUE INDEX "uq_messages_meta_message_id" ON "public"."messages" USING "btree" ("organization_id", "meta_message_id") WHERE ("meta_message_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_templates_meta_id" ON "public"."templates" USING "btree" ("waba_id", "meta_template_id") WHERE ("meta_template_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_unmapped_number_open" ON "public"."unmapped_number_events" USING "btree" ("organization_id", "meta_phone_number_id") WHERE ("resolved" IS FALSE);



CREATE UNIQUE INDEX "uq_webhook_endpoint_per_app_type" ON "public"."webhook_endpoints" USING "btree" ("organization_id", "meta_app_id", "endpoint_type", "url");



CREATE UNIQUE INDEX "uq_whatsapp_numbers_default_per_org" ON "public"."whatsapp_numbers" USING "btree" ("organization_id") WHERE ("is_default" IS TRUE);



CREATE UNIQUE INDEX "uq_whatsapp_numbers_e164_per_org" ON "public"."whatsapp_numbers" USING "btree" ("organization_id", "normalized_phone_number") WHERE ("normalized_phone_number" IS NOT NULL);



CREATE OR REPLACE TRIGGER "trg_alerts_updated_at" BEFORE UPDATE ON "public"."alerts" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_api_errors_updated_at" BEFORE UPDATE ON "public"."api_errors" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_audit_logs_updated_at" BEFORE UPDATE ON "public"."audit_logs" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_automation_rules_updated_at" BEFORE UPDATE ON "public"."automation_rules" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_business_portfolios_updated_at" BEFORE UPDATE ON "public"."business_portfolios" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_campaign_recipient_stats_insert_delete" AFTER INSERT OR DELETE ON "public"."campaign_recipients" FOR EACH ROW EXECUTE FUNCTION "private"."refresh_campaign_stats"();



CREATE OR REPLACE TRIGGER "trg_campaign_recipient_stats_status_update" AFTER UPDATE OF "status" ON "public"."campaign_recipients" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "private"."refresh_campaign_stats"();



CREATE OR REPLACE TRIGGER "trg_campaign_recipients_updated_at" BEFORE UPDATE ON "public"."campaign_recipients" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_campaigns_updated_at" BEFORE UPDATE ON "public"."campaigns" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_contact_channels_updated_at" BEFORE UPDATE ON "public"."contact_channels" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_contacts_updated_at" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_conversations_updated_at" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_dead_letter_jobs_updated_at" BEFORE UPDATE ON "public"."dead_letter_jobs" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_jobs_updated_at" BEFORE UPDATE ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_media_updated_at" BEFORE UPDATE ON "public"."media" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_message_outbox_updated_at" BEFORE UPDATE ON "public"."message_outbox" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_messages_updated_at" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_meta_app_wabas_updated_at" BEFORE UPDATE ON "public"."meta_app_wabas" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_meta_apps_updated_at" BEFORE UPDATE ON "public"."meta_apps" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_meta_credentials_updated_at" BEFORE UPDATE ON "public"."meta_credentials" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_meta_system_users_updated_at" BEFORE UPDATE ON "public"."meta_system_users" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_organization_members_updated_at" BEFORE UPDATE ON "public"."organization_members" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_system_settings_updated_at" BEFORE UPDATE ON "public"."system_settings" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_templates_updated_at" BEFORE UPDATE ON "public"."templates" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_waba_assigned_users_updated_at" BEFORE UPDATE ON "public"."waba_assigned_users" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_waba_subscribed_apps_updated_at" BEFORE UPDATE ON "public"."waba_subscribed_apps" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_wabas_updated_at" BEFORE UPDATE ON "public"."wabas" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_webhook_endpoints_updated_at" BEFORE UPDATE ON "public"."webhook_endpoints" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_whatsapp_flows_updated_at" BEFORE UPDATE ON "public"."whatsapp_flows" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_whatsapp_numbers_sender_status" BEFORE INSERT OR UPDATE OF "status", "is_enabled" ON "public"."whatsapp_numbers" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_whatsapp_sender_status"();



CREATE OR REPLACE TRIGGER "trg_whatsapp_numbers_updated_at" BEFORE UPDATE ON "public"."whatsapp_numbers" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_business_fk" FOREIGN KEY ("business_portfolio_id", "organization_id") REFERENCES "public"."business_portfolios"("id", "organization_id") ON DELETE SET NULL ("business_portfolio_id");



ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_number_fk" FOREIGN KEY ("whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE SET NULL ("whatsapp_number_id");



ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_waba_fk" FOREIGN KEY ("waba_id", "organization_id") REFERENCES "public"."wabas"("id", "organization_id") ON DELETE SET NULL ("waba_id");



ALTER TABLE ONLY "public"."api_errors"
    ADD CONSTRAINT "api_errors_number_fk" FOREIGN KEY ("whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE SET NULL ("whatsapp_number_id");



ALTER TABLE ONLY "public"."api_errors"
    ADD CONSTRAINT "api_errors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_errors"
    ADD CONSTRAINT "api_errors_request_fk" FOREIGN KEY ("api_request_id", "organization_id") REFERENCES "public"."api_requests"("id", "organization_id") ON DELETE SET NULL ("api_request_id");



ALTER TABLE ONLY "public"."api_errors"
    ADD CONSTRAINT "api_errors_waba_fk" FOREIGN KEY ("waba_id", "organization_id") REFERENCES "public"."wabas"("id", "organization_id") ON DELETE SET NULL ("waba_id");



ALTER TABLE ONLY "public"."api_requests"
    ADD CONSTRAINT "api_requests_app_fk" FOREIGN KEY ("meta_app_id", "organization_id") REFERENCES "public"."meta_apps"("id", "organization_id") ON DELETE SET NULL ("meta_app_id");



ALTER TABLE ONLY "public"."api_requests"
    ADD CONSTRAINT "api_requests_business_fk" FOREIGN KEY ("business_portfolio_id", "organization_id") REFERENCES "public"."business_portfolios"("id", "organization_id") ON DELETE SET NULL ("business_portfolio_id");



ALTER TABLE ONLY "public"."api_requests"
    ADD CONSTRAINT "api_requests_number_fk" FOREIGN KEY ("whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE SET NULL ("whatsapp_number_id");



ALTER TABLE ONLY "public"."api_requests"
    ADD CONSTRAINT "api_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_requests"
    ADD CONSTRAINT "api_requests_waba_fk" FOREIGN KEY ("waba_id", "organization_id") REFERENCES "public"."wabas"("id", "organization_id") ON DELETE SET NULL ("waba_id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_actor_fk" FOREIGN KEY ("organization_id", "actor_user_id") REFERENCES "public"."organization_members"("organization_id", "user_id") ON DELETE SET NULL ("actor_user_id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_business_fk" FOREIGN KEY ("business_portfolio_id", "organization_id") REFERENCES "public"."business_portfolios"("id", "organization_id") ON DELETE SET NULL ("business_portfolio_id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_number_fk" FOREIGN KEY ("whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE SET NULL ("whatsapp_number_id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_waba_fk" FOREIGN KEY ("waba_id", "organization_id") REFERENCES "public"."wabas"("id", "organization_id") ON DELETE SET NULL ("waba_id");



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_business_fk" FOREIGN KEY ("scope_business_portfolio_id", "organization_id") REFERENCES "public"."business_portfolios"("id", "organization_id") ON DELETE SET NULL ("scope_business_portfolio_id");



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_created_by_fk" FOREIGN KEY ("organization_id", "created_by") REFERENCES "public"."organization_members"("organization_id", "user_id") ON DELETE SET NULL ("created_by");



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_number_fk" FOREIGN KEY ("scope_whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE SET NULL ("scope_whatsapp_number_id");



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_waba_fk" FOREIGN KEY ("scope_waba_id", "organization_id") REFERENCES "public"."wabas"("id", "organization_id") ON DELETE SET NULL ("scope_waba_id");



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_conversation_fk" FOREIGN KEY ("conversation_id", "organization_id") REFERENCES "public"."conversations"("id", "organization_id") ON DELETE SET NULL ("conversation_id");



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_message_fk" FOREIGN KEY ("message_id", "organization_id") REFERENCES "public"."messages"("id", "organization_id") ON DELETE SET NULL ("message_id");



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_number_fk" FOREIGN KEY ("whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE SET NULL ("whatsapp_number_id");



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_rule_fk" FOREIGN KEY ("automation_rule_id", "organization_id") REFERENCES "public"."automation_rules"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_portfolios"
    ADD CONSTRAINT "business_portfolios_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_recipients"
    ADD CONSTRAINT "campaign_recipients_campaign_fk" FOREIGN KEY ("campaign_id", "organization_id") REFERENCES "public"."campaigns"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_recipients"
    ADD CONSTRAINT "campaign_recipients_contact_fk" FOREIGN KEY ("contact_id", "organization_id") REFERENCES "public"."contacts"("id", "organization_id") ON DELETE SET NULL ("contact_id");



ALTER TABLE ONLY "public"."campaign_recipients"
    ADD CONSTRAINT "campaign_recipients_message_fk" FOREIGN KEY ("message_id", "organization_id") REFERENCES "public"."messages"("id", "organization_id") ON DELETE SET NULL ("message_id");



ALTER TABLE ONLY "public"."campaign_recipients"
    ADD CONSTRAINT "campaign_recipients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_created_by_fk" FOREIGN KEY ("organization_id", "created_by") REFERENCES "public"."organization_members"("organization_id", "user_id") ON DELETE SET NULL ("created_by");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_sender_fk" FOREIGN KEY ("sender_whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_template_fk" FOREIGN KEY ("template_id", "organization_id") REFERENCES "public"."templates"("id", "organization_id") ON DELETE SET NULL ("template_id");



ALTER TABLE ONLY "public"."contact_channels"
    ADD CONSTRAINT "contact_channels_contact_fk" FOREIGN KEY ("contact_id", "organization_id") REFERENCES "public"."contacts"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_channels"
    ADD CONSTRAINT "contact_channels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_assigned_team_fk" FOREIGN KEY ("assigned_team_id", "organization_id") REFERENCES "public"."teams"("id", "organization_id") ON DELETE SET NULL ("assigned_team_id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_assigned_user_fk" FOREIGN KEY ("organization_id", "assigned_user_id") REFERENCES "public"."organization_members"("organization_id", "user_id") ON DELETE SET NULL ("assigned_user_id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_assigned_team_fk" FOREIGN KEY ("assigned_team_id", "organization_id") REFERENCES "public"."teams"("id", "organization_id") ON DELETE SET NULL ("assigned_team_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_assigned_user_fk" FOREIGN KEY ("organization_id", "assigned_user_id") REFERENCES "public"."organization_members"("organization_id", "user_id") ON DELETE SET NULL ("assigned_user_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_channel_fk" FOREIGN KEY ("contact_channel_id", "organization_id") REFERENCES "public"."contact_channels"("id", "organization_id") ON DELETE SET NULL ("contact_channel_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_contact_fk" FOREIGN KEY ("contact_id", "organization_id") REFERENCES "public"."contacts"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_number_fk" FOREIGN KEY ("whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dead_letter_jobs"
    ADD CONSTRAINT "dead_letter_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dead_letter_jobs"
    ADD CONSTRAINT "dead_letter_original_job_fk" FOREIGN KEY ("original_job_id", "organization_id") REFERENCES "public"."jobs"("id", "organization_id") ON DELETE SET NULL ("original_job_id");



ALTER TABLE ONLY "public"."health_checks"
    ADD CONSTRAINT "health_business_fk" FOREIGN KEY ("business_portfolio_id", "organization_id") REFERENCES "public"."business_portfolios"("id", "organization_id") ON DELETE SET NULL ("business_portfolio_id");



ALTER TABLE ONLY "public"."health_checks"
    ADD CONSTRAINT "health_checks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."health_checks"
    ADD CONSTRAINT "health_number_fk" FOREIGN KEY ("whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE SET NULL ("whatsapp_number_id");



ALTER TABLE ONLY "public"."health_checks"
    ADD CONSTRAINT "health_waba_fk" FOREIGN KEY ("waba_id", "organization_id") REFERENCES "public"."wabas"("id", "organization_id") ON DELETE SET NULL ("waba_id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_contact_fk" FOREIGN KEY ("contact_id", "organization_id") REFERENCES "public"."contacts"("id", "organization_id") ON DELETE SET NULL ("contact_id");



ALTER TABLE ONLY "public"."media_download_attempts"
    ADD CONSTRAINT "media_download_attempts_media_fk" FOREIGN KEY ("media_id", "organization_id") REFERENCES "public"."media"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_download_attempts"
    ADD CONSTRAINT "media_download_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_message_fk" FOREIGN KEY ("message_id", "organization_id") REFERENCES "public"."messages"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_number_fk" FOREIGN KEY ("whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_outbox"
    ADD CONSTRAINT "message_outbox_campaign_fk" FOREIGN KEY ("campaign_id", "organization_id") REFERENCES "public"."campaigns"("id", "organization_id") ON DELETE SET NULL ("campaign_id");



ALTER TABLE ONLY "public"."message_outbox"
    ADD CONSTRAINT "message_outbox_campaign_recipient_fk" FOREIGN KEY ("campaign_recipient_id", "organization_id") REFERENCES "public"."campaign_recipients"("id", "organization_id") ON DELETE SET NULL ("campaign_recipient_id");



ALTER TABLE ONLY "public"."message_outbox"
    ADD CONSTRAINT "message_outbox_contact_fk" FOREIGN KEY ("contact_id", "organization_id") REFERENCES "public"."contacts"("id", "organization_id") ON DELETE SET NULL ("contact_id");



ALTER TABLE ONLY "public"."message_outbox"
    ADD CONSTRAINT "message_outbox_conversation_fk" FOREIGN KEY ("conversation_id", "organization_id") REFERENCES "public"."conversations"("id", "organization_id") ON DELETE SET NULL ("conversation_id");



ALTER TABLE ONLY "public"."message_outbox"
    ADD CONSTRAINT "message_outbox_number_fk" FOREIGN KEY ("whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."message_outbox"
    ADD CONSTRAINT "message_outbox_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_outbox"
    ADD CONSTRAINT "message_outbox_requested_by_fk" FOREIGN KEY ("organization_id", "requested_by") REFERENCES "public"."organization_members"("organization_id", "user_id") ON DELETE SET NULL ("requested_by");



ALTER TABLE ONLY "public"."message_send_attempts"
    ADD CONSTRAINT "message_send_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_send_attempts"
    ADD CONSTRAINT "message_send_attempts_outbox_fk" FOREIGN KEY ("outbox_id", "organization_id") REFERENCES "public"."message_outbox"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_send_attempts"
    ADD CONSTRAINT "message_send_attempts_request_fk" FOREIGN KEY ("api_request_id", "organization_id") REFERENCES "public"."api_requests"("id", "organization_id") ON DELETE SET NULL ("api_request_id");



ALTER TABLE ONLY "public"."message_status_history"
    ADD CONSTRAINT "message_status_history_message_fk" FOREIGN KEY ("message_id", "organization_id") REFERENCES "public"."messages"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_status_history"
    ADD CONSTRAINT "message_status_history_number_fk" FOREIGN KEY ("whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."message_status_history"
    ADD CONSTRAINT "message_status_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_channel_fk" FOREIGN KEY ("contact_channel_id", "organization_id") REFERENCES "public"."contact_channels"("id", "organization_id") ON DELETE SET NULL ("contact_channel_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_contact_fk" FOREIGN KEY ("contact_id", "organization_id") REFERENCES "public"."contacts"("id", "organization_id") ON DELETE SET NULL ("contact_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_fk" FOREIGN KEY ("conversation_id", "organization_id") REFERENCES "public"."conversations"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_number_fk" FOREIGN KEY ("whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_reply_fk" FOREIGN KEY ("reply_to_message_id", "organization_id") REFERENCES "public"."messages"("id", "organization_id") ON DELETE SET NULL ("reply_to_message_id");



ALTER TABLE ONLY "public"."meta_app_wabas"
    ADD CONSTRAINT "meta_app_wabas_app_fk" FOREIGN KEY ("meta_app_id", "organization_id") REFERENCES "public"."meta_apps"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meta_app_wabas"
    ADD CONSTRAINT "meta_app_wabas_waba_fk" FOREIGN KEY ("waba_id", "organization_id") REFERENCES "public"."wabas"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meta_apps"
    ADD CONSTRAINT "meta_apps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meta_apps"
    ADD CONSTRAINT "meta_apps_portfolio_fk" FOREIGN KEY ("business_portfolio_id", "organization_id") REFERENCES "public"."business_portfolios"("id", "organization_id") ON DELETE SET NULL ("business_portfolio_id");



ALTER TABLE ONLY "public"."meta_credentials"
    ADD CONSTRAINT "meta_credentials_app_fk" FOREIGN KEY ("meta_app_id", "organization_id") REFERENCES "public"."meta_apps"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meta_credentials"
    ADD CONSTRAINT "meta_credentials_number_fk" FOREIGN KEY ("whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meta_credentials"
    ADD CONSTRAINT "meta_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meta_credentials"
    ADD CONSTRAINT "meta_credentials_portfolio_fk" FOREIGN KEY ("business_portfolio_id", "organization_id") REFERENCES "public"."business_portfolios"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meta_credentials"
    ADD CONSTRAINT "meta_credentials_system_user_fk" FOREIGN KEY ("meta_system_user_id", "organization_id") REFERENCES "public"."meta_system_users"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meta_credentials"
    ADD CONSTRAINT "meta_credentials_waba_fk" FOREIGN KEY ("waba_id", "organization_id") REFERENCES "public"."wabas"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meta_sync_runs"
    ADD CONSTRAINT "meta_sync_business_fk" FOREIGN KEY ("business_portfolio_id", "organization_id") REFERENCES "public"."business_portfolios"("id", "organization_id") ON DELETE SET NULL ("business_portfolio_id");



ALTER TABLE ONLY "public"."meta_sync_runs"
    ADD CONSTRAINT "meta_sync_number_fk" FOREIGN KEY ("whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE SET NULL ("whatsapp_number_id");



ALTER TABLE ONLY "public"."meta_sync_runs"
    ADD CONSTRAINT "meta_sync_requested_by_fk" FOREIGN KEY ("organization_id", "requested_by") REFERENCES "public"."organization_members"("organization_id", "user_id") ON DELETE SET NULL ("requested_by");



ALTER TABLE ONLY "public"."meta_sync_runs"
    ADD CONSTRAINT "meta_sync_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meta_sync_runs"
    ADD CONSTRAINT "meta_sync_waba_fk" FOREIGN KEY ("waba_id", "organization_id") REFERENCES "public"."wabas"("id", "organization_id") ON DELETE SET NULL ("waba_id");



ALTER TABLE ONLY "public"."meta_system_users"
    ADD CONSTRAINT "meta_system_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meta_system_users"
    ADD CONSTRAINT "meta_system_users_portfolio_fk" FOREIGN KEY ("business_portfolio_id", "organization_id") REFERENCES "public"."business_portfolios"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_updated_by_fk" FOREIGN KEY ("organization_id", "updated_by") REFERENCES "public"."organization_members"("organization_id", "user_id") ON DELETE SET NULL ("updated_by");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_org_member_fk" FOREIGN KEY ("organization_id", "user_id") REFERENCES "public"."organization_members"("organization_id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_fk" FOREIGN KEY ("team_id", "organization_id") REFERENCES "public"."teams"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_number_access"
    ADD CONSTRAINT "team_number_access_number_fk" FOREIGN KEY ("whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_number_access"
    ADD CONSTRAINT "team_number_access_team_fk" FOREIGN KEY ("team_id", "organization_id") REFERENCES "public"."teams"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_waba_fk" FOREIGN KEY ("waba_id", "organization_id") REFERENCES "public"."wabas"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unmapped_number_events"
    ADD CONSTRAINT "unmapped_number_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unmapped_number_events"
    ADD CONSTRAINT "unmapped_number_events_resolved_number_fk" FOREIGN KEY ("resolved_whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE SET NULL ("resolved_whatsapp_number_id");



ALTER TABLE ONLY "public"."unmapped_number_events"
    ADD CONSTRAINT "unmapped_number_events_webhook_fk" FOREIGN KEY ("webhook_event_id", "organization_id") REFERENCES "public"."webhook_events"("id", "organization_id") ON DELETE SET NULL ("webhook_event_id");



ALTER TABLE ONLY "public"."user_business_access"
    ADD CONSTRAINT "user_business_access_member_fk" FOREIGN KEY ("organization_id", "user_id") REFERENCES "public"."organization_members"("organization_id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_business_access"
    ADD CONSTRAINT "user_business_access_portfolio_fk" FOREIGN KEY ("business_portfolio_id", "organization_id") REFERENCES "public"."business_portfolios"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_number_access"
    ADD CONSTRAINT "user_number_access_member_fk" FOREIGN KEY ("organization_id", "user_id") REFERENCES "public"."organization_members"("organization_id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_number_access"
    ADD CONSTRAINT "user_number_access_number_fk" FOREIGN KEY ("whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_member_fk" FOREIGN KEY ("organization_id", "user_id") REFERENCES "public"."organization_members"("organization_id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_waba_access"
    ADD CONSTRAINT "user_waba_access_member_fk" FOREIGN KEY ("organization_id", "user_id") REFERENCES "public"."organization_members"("organization_id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_waba_access"
    ADD CONSTRAINT "user_waba_access_waba_fk" FOREIGN KEY ("waba_id", "organization_id") REFERENCES "public"."wabas"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waba_assigned_users"
    ADD CONSTRAINT "waba_assigned_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waba_assigned_users"
    ADD CONSTRAINT "waba_assigned_users_system_user_fk" FOREIGN KEY ("local_system_user_id", "organization_id") REFERENCES "public"."meta_system_users"("id", "organization_id") ON DELETE SET NULL ("local_system_user_id");



ALTER TABLE ONLY "public"."waba_assigned_users"
    ADD CONSTRAINT "waba_assigned_users_waba_fk" FOREIGN KEY ("waba_id", "organization_id") REFERENCES "public"."wabas"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waba_subscribed_apps"
    ADD CONSTRAINT "waba_subscribed_apps_local_app_fk" FOREIGN KEY ("local_meta_app_id", "organization_id") REFERENCES "public"."meta_apps"("id", "organization_id") ON DELETE SET NULL ("local_meta_app_id");



ALTER TABLE ONLY "public"."waba_subscribed_apps"
    ADD CONSTRAINT "waba_subscribed_apps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waba_subscribed_apps"
    ADD CONSTRAINT "waba_subscribed_apps_waba_fk" FOREIGN KEY ("waba_id", "organization_id") REFERENCES "public"."wabas"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wabas"
    ADD CONSTRAINT "wabas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wabas"
    ADD CONSTRAINT "wabas_portfolio_fk" FOREIGN KEY ("business_portfolio_id", "organization_id") REFERENCES "public"."business_portfolios"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_endpoints"
    ADD CONSTRAINT "webhook_endpoints_app_fk" FOREIGN KEY ("meta_app_id", "organization_id") REFERENCES "public"."meta_apps"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_endpoints"
    ADD CONSTRAINT "webhook_endpoints_app_secret_credential_fk" FOREIGN KEY ("app_secret_credential_id", "organization_id") REFERENCES "public"."meta_credentials"("id", "organization_id") ON DELETE SET NULL ("app_secret_credential_id");



ALTER TABLE ONLY "public"."webhook_endpoints"
    ADD CONSTRAINT "webhook_endpoints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_endpoints"
    ADD CONSTRAINT "webhook_endpoints_verify_credential_fk" FOREIGN KEY ("verify_token_credential_id", "organization_id") REFERENCES "public"."meta_credentials"("id", "organization_id") ON DELETE SET NULL ("verify_token_credential_id");



ALTER TABLE ONLY "public"."webhook_event_attempts"
    ADD CONSTRAINT "webhook_event_attempts_event_fk" FOREIGN KEY ("webhook_event_id", "organization_id") REFERENCES "public"."webhook_events"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_event_attempts"
    ADD CONSTRAINT "webhook_event_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_app_fk" FOREIGN KEY ("meta_app_id", "organization_id") REFERENCES "public"."meta_apps"("id", "organization_id") ON DELETE SET NULL ("meta_app_id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_business_fk" FOREIGN KEY ("business_portfolio_id", "organization_id") REFERENCES "public"."business_portfolios"("id", "organization_id") ON DELETE SET NULL ("business_portfolio_id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_endpoint_fk" FOREIGN KEY ("webhook_endpoint_id", "organization_id") REFERENCES "public"."webhook_endpoints"("id", "organization_id") ON DELETE SET NULL ("webhook_endpoint_id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_number_fk" FOREIGN KEY ("whatsapp_number_id", "organization_id") REFERENCES "public"."whatsapp_numbers"("id", "organization_id") ON DELETE SET NULL ("whatsapp_number_id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_waba_fk" FOREIGN KEY ("waba_id", "organization_id") REFERENCES "public"."wabas"("id", "organization_id") ON DELETE SET NULL ("waba_id");



ALTER TABLE ONLY "public"."whatsapp_flows"
    ADD CONSTRAINT "whatsapp_flows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_flows"
    ADD CONSTRAINT "whatsapp_flows_waba_fk" FOREIGN KEY ("waba_id", "organization_id") REFERENCES "public"."wabas"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_numbers"
    ADD CONSTRAINT "whatsapp_numbers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_numbers"
    ADD CONSTRAINT "whatsapp_numbers_waba_fk" FOREIGN KEY ("waba_id", "organization_id") REFERENCES "public"."wabas"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE "public"."alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_errors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."automation_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."automation_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_portfolios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dead_letter_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."health_checks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media_download_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_send_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_status_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meta_app_wabas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meta_apps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meta_credentials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meta_sync_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meta_system_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "no_direct_client_access" ON "public"."alerts" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."api_errors" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."api_requests" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."audit_logs" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."automation_rules" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."automation_runs" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."business_portfolios" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."campaign_recipients" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."campaigns" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."contact_channels" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."contacts" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."conversations" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."dead_letter_jobs" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."health_checks" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."jobs" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."media" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."media_download_attempts" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."message_outbox" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."message_send_attempts" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."message_status_history" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."messages" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."meta_app_wabas" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."meta_apps" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."meta_credentials" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."meta_sync_runs" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."meta_system_users" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."organization_members" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."organizations" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."permissions" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."profiles" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."role_permissions" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."roles" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."system_settings" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."team_members" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."team_number_access" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."teams" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."templates" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."unmapped_number_events" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."user_business_access" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."user_number_access" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."user_roles" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."user_waba_access" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."waba_assigned_users" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."waba_subscribed_apps" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."wabas" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."webhook_endpoints" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."webhook_event_attempts" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."webhook_events" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."whatsapp_flows" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "no_direct_client_access" ON "public"."whatsapp_numbers" TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_number_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."unmapped_number_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_business_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_number_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_waba_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."waba_assigned_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."waba_subscribed_apps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wabas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_endpoints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_event_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_flows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_numbers" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."can_dispatch_number"("p_number_id" "uuid", "p_permission" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_dispatch_number"("p_number_id" "uuid", "p_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."can_dispatch_number"("p_number_id" "uuid", "p_permission" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."can_manage_number"("p_number_id" "uuid", "p_permission" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_manage_number"("p_number_id" "uuid", "p_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."can_manage_number"("p_number_id" "uuid", "p_permission" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."can_manage_waba"("p_waba_id" "uuid", "p_permission" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_manage_waba"("p_waba_id" "uuid", "p_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."can_manage_waba"("p_waba_id" "uuid", "p_permission" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."decrypt_secret_reference"("p_secret_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."decrypt_secret_reference"("p_secret_reference" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."enforce_whatsapp_sender_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."enforce_whatsapp_sender_status"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."ensure_contact_channel"("p_organization_id" "uuid", "p_address" "text", "p_wa_id" "text", "p_profile_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."ensure_contact_channel"("p_organization_id" "uuid", "p_address" "text", "p_wa_id" "text", "p_profile_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."ensure_conversation"("p_organization_id" "uuid", "p_whatsapp_number_id" "uuid", "p_contact_id" "uuid", "p_contact_channel_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."ensure_conversation"("p_organization_id" "uuid", "p_whatsapp_number_id" "uuid", "p_contact_id" "uuid", "p_contact_channel_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."handle_new_auth_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."handle_new_auth_user"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."has_org_permission"("p_org_id" "uuid", "p_permission" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."has_org_permission"("p_org_id" "uuid", "p_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."has_org_permission"("p_org_id" "uuid", "p_permission" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_org_admin"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_org_admin"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_org_admin"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_org_member"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_org_member"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_org_member"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."normalize_wa_address"("p_value" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."normalize_wa_address"("p_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."normalize_wa_address"("p_value" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."refresh_campaign_stats"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."azwa_can_dispatch_number"("p_number_id" "uuid", "p_permission" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."azwa_can_dispatch_number"("p_number_id" "uuid", "p_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."azwa_can_dispatch_number"("p_number_id" "uuid", "p_permission" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."azwa_can_manage_number"("p_number_id" "uuid", "p_permission" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."azwa_can_manage_number"("p_number_id" "uuid", "p_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."azwa_can_manage_number"("p_number_id" "uuid", "p_permission" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."azwa_can_manage_waba"("p_waba_id" "uuid", "p_permission" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."azwa_can_manage_waba"("p_waba_id" "uuid", "p_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."azwa_can_manage_waba"("p_waba_id" "uuid", "p_permission" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."azwa_can_send_number"("p_number_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."azwa_can_send_number"("p_number_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."azwa_can_send_number"("p_number_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."azwa_has_org_permission"("p_org_id" "uuid", "p_permission" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."azwa_has_org_permission"("p_org_id" "uuid", "p_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."azwa_has_org_permission"("p_org_id" "uuid", "p_permission" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_apply_message_status"("p_organization_id" "uuid", "p_meta_phone_number_id" "text", "p_status" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_apply_message_status"("p_organization_id" "uuid", "p_meta_phone_number_id" "text", "p_status" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."jobs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_claim_jobs"("p_worker_id" "text", "p_queue_names" "text"[], "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_claim_jobs"("p_worker_id" "text", "p_queue_names" "text"[], "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_complete_job"("p_job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_complete_job"("p_job_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_create_outbox"("p_whatsapp_number_id" "uuid", "p_recipient_address" "text", "p_message_type" "text", "p_request_payload" "jsonb", "p_idempotency_key" "text", "p_requested_by" "uuid", "p_contact_id" "uuid", "p_conversation_id" "uuid", "p_campaign_id" "uuid", "p_campaign_recipient_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_create_outbox"("p_whatsapp_number_id" "uuid", "p_recipient_address" "text", "p_message_type" "text", "p_request_payload" "jsonb", "p_idempotency_key" "text", "p_requested_by" "uuid", "p_contact_id" "uuid", "p_conversation_id" "uuid", "p_campaign_id" "uuid", "p_campaign_recipient_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_decrypt_secret_reference"("p_secret_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_decrypt_secret_reference"("p_secret_reference" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_enqueue_automation"("p_rule_id" "uuid", "p_trigger_payload" "jsonb", "p_whatsapp_number_id" "uuid", "p_conversation_id" "uuid", "p_message_id" "uuid", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_enqueue_automation"("p_rule_id" "uuid", "p_trigger_payload" "jsonb", "p_whatsapp_number_id" "uuid", "p_conversation_id" "uuid", "p_message_id" "uuid", "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_enqueue_campaign"("p_campaign_id" "uuid", "p_requested_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_enqueue_campaign"("p_campaign_id" "uuid", "p_requested_by" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_fail_job"("p_job_id" "uuid", "p_error" "text", "p_retry_after_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_fail_job"("p_job_id" "uuid", "p_error" "text", "p_retry_after_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_finalize_outbox_failure"("p_outbox_id" "uuid", "p_error" "text", "p_final" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_finalize_outbox_failure"("p_outbox_id" "uuid", "p_error" "text", "p_final" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_finalize_outbox_success"("p_outbox_id" "uuid", "p_meta_message_id" "text", "p_raw_response" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_finalize_outbox_success"("p_outbox_id" "uuid", "p_meta_message_id" "text", "p_raw_response" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_finalize_webhook_event"("p_event_id" "uuid", "p_success" boolean, "p_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_finalize_webhook_event"("p_event_id" "uuid", "p_success" boolean, "p_error" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_ingest_inbound_message"("p_organization_id" "uuid", "p_meta_phone_number_id" "text", "p_contact_wa_id" "text", "p_contact_profile_name" "text", "p_message" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_ingest_inbound_message"("p_organization_id" "uuid", "p_meta_phone_number_id" "text", "p_contact_wa_id" "text", "p_contact_profile_name" "text", "p_message" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_ingest_webhook_event"("p_organization_id" "uuid", "p_webhook_endpoint_id" "uuid", "p_meta_app_id" "uuid", "p_meta_waba_id" "text", "p_meta_phone_number_id" "text", "p_event_type" "text", "p_meta_message_id" "text", "p_deduplication_key" "text", "p_signature_valid" boolean, "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_ingest_webhook_event"("p_organization_id" "uuid", "p_webhook_endpoint_id" "uuid", "p_meta_app_id" "uuid", "p_meta_waba_id" "text", "p_meta_phone_number_id" "text", "p_event_type" "text", "p_meta_message_id" "text", "p_deduplication_key" "text", "p_signature_valid" boolean, "p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_list_webhook_secrets"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_list_webhook_secrets"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_requeue_stale_jobs"("p_older_than_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_requeue_stale_jobs"("p_older_than_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_resolve_meta_token"("p_whatsapp_number_id" "uuid", "p_waba_id" "uuid", "p_business_portfolio_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_resolve_meta_token"("p_whatsapp_number_id" "uuid", "p_waba_id" "uuid", "p_business_portfolio_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_store_meta_credential"("p_organization_id" "uuid", "p_credential_type" "text", "p_name" "text", "p_secret" "text", "p_meta_app_id" "uuid", "p_business_portfolio_id" "uuid", "p_waba_id" "uuid", "p_whatsapp_number_id" "uuid", "p_scopes" "text"[], "p_expires_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_store_meta_credential"("p_organization_id" "uuid", "p_credential_type" "text", "p_name" "text", "p_secret" "text", "p_meta_app_id" "uuid", "p_business_portfolio_id" "uuid", "p_waba_id" "uuid", "p_whatsapp_number_id" "uuid", "p_scopes" "text"[], "p_expires_at" timestamp with time zone) TO "service_role";



GRANT ALL ON TABLE "public"."alerts" TO "service_role";



GRANT ALL ON TABLE "public"."api_errors" TO "service_role";



GRANT ALL ON TABLE "public"."api_requests" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."automation_rules" TO "service_role";



GRANT ALL ON TABLE "public"."automation_runs" TO "service_role";



GRANT ALL ON TABLE "public"."business_portfolios" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."contact_channels" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."dead_letter_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."health_checks" TO "service_role";



GRANT ALL ON TABLE "public"."media" TO "service_role";



GRANT ALL ON TABLE "public"."media_download_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."message_outbox" TO "service_role";



GRANT ALL ON TABLE "public"."message_send_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."message_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."meta_app_wabas" TO "service_role";



GRANT ALL ON TABLE "public"."meta_apps" TO "service_role";



GRANT ALL ON TABLE "public"."meta_credentials" TO "service_role";



GRANT ALL ON TABLE "public"."meta_sync_runs" TO "service_role";



GRANT ALL ON TABLE "public"."meta_system_users" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."team_number_access" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."templates" TO "service_role";



GRANT ALL ON TABLE "public"."unmapped_number_events" TO "service_role";



GRANT ALL ON TABLE "public"."user_business_access" TO "service_role";



GRANT ALL ON TABLE "public"."user_number_access" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_waba_access" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_numbers" TO "service_role";



GRANT ALL ON TABLE "public"."v_number_message_stats_24h" TO "service_role";



GRANT ALL ON TABLE "public"."wabas" TO "service_role";



GRANT ALL ON TABLE "public"."v_whatsapp_structure" TO "service_role";



GRANT ALL ON TABLE "public"."waba_assigned_users" TO "service_role";



GRANT ALL ON TABLE "public"."waba_subscribed_apps" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_endpoints" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_event_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_flows" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







