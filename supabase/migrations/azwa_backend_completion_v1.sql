-- AzWA Backend Completion v1
-- Generated from the reviewed backend migrations.
-- IMPORTANT: Apply ONLY after the approved AzWA baseline + security patch already executed.
-- This is a consolidated review/execution copy. The canonical migration history remains in azwa-backend/supabase/migrations/.


-- ====================================================================
-- BEGIN: 20260826090000_azwa_backend_runtime.sql
-- ====================================================================
-- AzWA backend runtime hardening + operational primitives
-- Apply AFTER azwa_supabase_schema_v1_1.sql + azwa_security_patch_v1_1.sql

begin;

create schema if not exists private;
create extension if not exists supabase_vault;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1) Access granularity improvements
-- -----------------------------------------------------------------------------
alter table public.user_business_access
  add column if not exists can_send boolean not null default false;

alter table public.user_waba_access
  add column if not exists can_send boolean not null default false;

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

create or replace function private.can_send_number(p_number_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select private.can_dispatch_number(p_number_id,'messages.send');
$$;

create or replace function private.can_manage_number(p_number_id uuid, p_permission text default 'numbers.manage')
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
      and private.has_org_permission(n.organization_id,p_permission)
      and (
        private.is_org_admin(n.organization_id)
        or exists (select 1 from public.user_number_access a where a.user_id=auth.uid() and a.whatsapp_number_id=n.id and a.can_manage)
        or exists (select 1 from public.user_waba_access a where a.user_id=auth.uid() and a.waba_id=n.waba_id and a.can_manage)
        or exists (select 1 from public.user_business_access a where a.user_id=auth.uid() and a.business_portfolio_id=w.business_portfolio_id and a.can_manage)
        or exists (
          select 1 from public.team_members tm
          join public.team_number_access tna on tna.team_id=tm.team_id
          where tm.user_id=auth.uid() and tna.whatsapp_number_id=n.id and tna.can_manage
        )
      )
  );
$$;

create or replace function private.can_manage_waba(p_waba_id uuid, p_permission text default 'wabas.manage')
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
          select 1 from public.user_waba_access uwa
          where uwa.user_id = auth.uid() and uwa.waba_id = w.id and uwa.can_manage
        )
        or exists (
          select 1 from public.user_business_access uba
          where uba.user_id = auth.uid()
            and uba.business_portfolio_id = w.business_portfolio_id
            and uba.can_manage
        )
      )
  );
$$;

revoke all on function private.can_dispatch_number(uuid,text) from public, anon;
revoke all on function private.can_send_number(uuid) from public, anon;
revoke all on function private.can_manage_number(uuid,text) from public, anon;
revoke all on function private.can_manage_waba(uuid,text) from public, anon;
grant execute on function private.can_dispatch_number(uuid,text) to authenticated, service_role;
grant execute on function private.can_send_number(uuid) to authenticated, service_role;
grant execute on function private.can_manage_number(uuid,text) to authenticated, service_role;
grant execute on function private.can_manage_waba(uuid,text) to authenticated, service_role;

-- Safe API wrappers. These are SECURITY INVOKER, never SECURITY DEFINER.
create or replace function public.azwa_can_send_number(p_number_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select private.can_send_number(p_number_id); $$;

create or replace function public.azwa_can_dispatch_number(p_number_id uuid, p_permission text)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select private.can_dispatch_number(p_number_id,p_permission); $$;

create or replace function public.azwa_can_manage_number(p_number_id uuid, p_permission text default 'numbers.manage')
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select private.can_manage_number(p_number_id,p_permission); $$;

create or replace function public.azwa_can_manage_waba(p_waba_id uuid, p_permission text default 'wabas.manage')
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select private.can_manage_waba(p_waba_id, p_permission); $$;

create or replace function public.azwa_has_org_permission(p_org_id uuid, p_permission text)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select private.is_org_member(p_org_id) and private.has_org_permission(p_org_id, p_permission);
$$;

revoke all on function public.azwa_can_send_number(uuid) from public, anon;
revoke all on function public.azwa_can_dispatch_number(uuid,text) from public, anon;
revoke all on function public.azwa_can_manage_number(uuid,text) from public, anon;
revoke all on function public.azwa_can_manage_waba(uuid,text) from public, anon;
revoke all on function public.azwa_has_org_permission(uuid,text) from public, anon;
grant execute on function public.azwa_can_send_number(uuid) to authenticated, service_role;
grant execute on function public.azwa_can_dispatch_number(uuid,text) to authenticated, service_role;
grant execute on function public.azwa_can_manage_number(uuid,text) to authenticated, service_role;
grant execute on function public.azwa_can_manage_waba(uuid,text) to authenticated, service_role;
grant execute on function public.azwa_has_org_permission(uuid,text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) Runtime operational tables
-- -----------------------------------------------------------------------------
create table if not exists public.meta_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_portfolio_id uuid references public.business_portfolios(id) on delete set null,
  waba_id uuid references public.wabas(id) on delete set null,
  whatsapp_number_id uuid references public.whatsapp_numbers(id) on delete set null,
  sync_type text not null check (sync_type in ('business','wabas','numbers','templates','number_health','full')),
  status text not null default 'queued' check (status in ('queued','running','completed','partial','failed','cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  stats jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_meta_sync_runs_scope_created
  on public.meta_sync_runs(organization_id, sync_type, created_at desc);

create table if not exists public.message_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_number_id uuid not null references public.whatsapp_numbers(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  campaign_recipient_id uuid references public.campaign_recipients(id) on delete set null,
  recipient_address text not null,
  message_type text not null,
  request_payload jsonb not null,
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued','sending','submitted','sent','delivered','read','failed','cancelled')),
  meta_message_id text,
  requested_by uuid references auth.users(id) on delete set null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create index if not exists idx_message_outbox_dispatch
  on public.message_outbox(status, next_attempt_at, created_at);
create index if not exists idx_message_outbox_number_created
  on public.message_outbox(whatsapp_number_id, created_at desc);

create table if not exists public.message_send_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  outbox_id uuid not null references public.message_outbox(id) on delete cascade,
  api_request_id uuid references public.api_requests(id) on delete set null,
  attempt_no integer not null,
  status text not null check (status in ('started','submitted','failed')),
  http_status integer,
  error_code text,
  error_message text,
  response_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (outbox_id, attempt_no)
);

create table if not exists public.webhook_event_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webhook_event_id uuid not null references public.webhook_events(id) on delete cascade,
  attempt_no integer not null,
  status text not null check (status in ('started','processed','failed','ignored')),
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (webhook_event_id, attempt_no)
);

create table if not exists public.media_download_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete cascade,
  attempt_no integer not null,
  status text not null check (status in ('started','stored','failed')),
  http_status integer,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (media_id, attempt_no)
);

-- Avoid duplicate status history when Meta retries the same delivery event.
create unique index if not exists uq_message_status_history_event
  on public.message_status_history(message_id, status, meta_timestamp)
  where meta_timestamp is not null;

-- One logical conversation per contact + owned WhatsApp number when data is clean.
do $$
begin
  if not exists (
    select 1
    from public.conversations
    group by organization_id, whatsapp_number_id, contact_id
    having count(*) > 1
  ) then
    create unique index if not exists uq_conversations_number_contact
      on public.conversations(organization_id, whatsapp_number_id, contact_id);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3) Private helpers for contacts/conversations
-- -----------------------------------------------------------------------------
create or replace function private.normalize_wa_address(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(regexp_replace(coalesce(p_value,''), '[^0-9]', '', 'g'), '');
$$;

create or replace function private.ensure_contact_channel(
  p_organization_id uuid,
  p_address text,
  p_wa_id text default null,
  p_profile_name text default null
)
returns table(contact_id uuid, channel_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_norm text := private.normalize_wa_address(coalesce(p_wa_id, p_address));
  v_contact uuid;
  v_channel uuid;
begin
  if v_norm is null then
    raise exception 'invalid WhatsApp address';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':wa:' || v_norm, 0));

  select cc.contact_id, cc.id
    into v_contact, v_channel
  from public.contact_channels cc
  where cc.organization_id = p_organization_id
    and cc.channel_type = 'whatsapp'
    and (
      (p_wa_id is not null and cc.wa_id = private.normalize_wa_address(p_wa_id))
      or cc.normalized_address = v_norm
    )
  order by (cc.wa_id is not null) desc, cc.created_at asc
  limit 1;

  if v_channel is null then
    insert into public.contacts(
      organization_id, display_name, source, first_interaction_at, last_interaction_at
    ) values (
      p_organization_id, nullif(p_profile_name,''), 'whatsapp', now(), now()
    ) returning id into v_contact;

    insert into public.contact_channels(
      organization_id, contact_id, channel_type, address, normalized_address, wa_id, profile_name, is_primary
    ) values (
      p_organization_id, v_contact, 'whatsapp', coalesce(p_address, v_norm), v_norm,
      private.normalize_wa_address(p_wa_id), nullif(p_profile_name,''), true
    ) returning id into v_channel;
  else
    update public.contact_channels
       set profile_name = coalesce(nullif(p_profile_name,''), profile_name),
           wa_id = coalesce(wa_id, private.normalize_wa_address(p_wa_id)),
           normalized_address = coalesce(normalized_address, v_norm),
           updated_at = now()
     where id = v_channel;

    update public.contacts
       set display_name = coalesce(display_name, nullif(p_profile_name,'')),
           last_interaction_at = now(),
           first_interaction_at = coalesce(first_interaction_at, now()),
           updated_at = now()
     where id = v_contact;
  end if;

  return query select v_contact, v_channel;
end;
$$;

create or replace function private.ensure_conversation(
  p_organization_id uuid,
  p_whatsapp_number_id uuid,
  p_contact_id uuid,
  p_contact_channel_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_whatsapp_number_id::text || ':' || p_contact_id::text, 0));

  select c.id into v_id
  from public.conversations c
  where c.organization_id = p_organization_id
    and c.whatsapp_number_id = p_whatsapp_number_id
    and c.contact_id = p_contact_id
  order by c.created_at asc
  limit 1;

  if v_id is null then
    insert into public.conversations(
      organization_id, whatsapp_number_id, contact_id, contact_channel_id, status, opened_at
    ) values (
      p_organization_id, p_whatsapp_number_id, p_contact_id, p_contact_channel_id, 'open', now()
    ) returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function private.ensure_contact_channel(uuid,text,text,text) from public, anon, authenticated;
revoke all on function private.ensure_conversation(uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function private.normalize_wa_address(text) from public, anon;
grant execute on function private.ensure_contact_channel(uuid,text,text,text) to service_role;
grant execute on function private.ensure_conversation(uuid,uuid,uuid,uuid) to service_role;
grant execute on function private.normalize_wa_address(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Vault-backed Meta credential operations. Service role only.
-- -----------------------------------------------------------------------------
create or replace function private.decrypt_secret_reference(p_secret_reference text)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_secret text;
  v_id uuid;
begin
  if p_secret_reference is null or p_secret_reference = '' then
    return null;
  end if;

  begin
    v_id := replace(p_secret_reference, 'vault:', '')::uuid;
  exception when others then
    raise exception 'Unsupported secret reference format';
  end;

  execute 'select decrypted_secret from vault.decrypted_secrets where id = $1'
    into v_secret using v_id;
  return v_secret;
end;
$$;

revoke all on function private.decrypt_secret_reference(text) from public, anon, authenticated;
grant execute on function private.decrypt_secret_reference(text) to service_role;

create or replace function public.backend_store_meta_credential(
  p_organization_id uuid,
  p_credential_type text,
  p_name text,
  p_secret text,
  p_meta_app_id uuid default null,
  p_business_portfolio_id uuid default null,
  p_waba_id uuid default null,
  p_whatsapp_number_id uuid default null,
  p_scopes text[] default '{}',
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_vault_id uuid;
  v_credential_id uuid;
  v_vault_name text := 'azwa_' || replace(gen_random_uuid()::text, '-', '');
begin
  if p_secret is null or length(p_secret) < 1 then
    raise exception 'secret is required';
  end if;

  execute 'select vault.create_secret($1,$2,$3)'
    into v_vault_id
    using p_secret, v_vault_name, 'AzWA ' || p_credential_type || ' / ' || p_name;

  insert into public.meta_credentials(
    organization_id, meta_app_id, business_portfolio_id, waba_id, whatsapp_number_id,
    credential_type, name, secret_reference, scopes, expires_at, status, last_verified_at
  ) values (
    p_organization_id, p_meta_app_id, p_business_portfolio_id, p_waba_id, p_whatsapp_number_id,
    p_credential_type, p_name, 'vault:' || v_vault_id::text, coalesce(p_scopes,'{}'::text[]), p_expires_at,
    'active', now()
  ) returning id into v_credential_id;

  return v_credential_id;
end;
$$;

create or replace function public.backend_resolve_meta_token(
  p_whatsapp_number_id uuid,
  p_waba_id uuid,
  p_business_portfolio_id uuid
)
returns table(credential_id uuid, token text, credential_type text)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid;
  v_waba uuid := p_waba_id;
  v_business uuid := p_business_portfolio_id;
  v_cred public.meta_credentials%rowtype;
begin
  if p_whatsapp_number_id is not null then
    select n.organization_id, n.waba_id, w.business_portfolio_id
      into v_org, v_waba, v_business
    from public.whatsapp_numbers n
    join public.wabas w on w.id = n.waba_id
    where n.id = p_whatsapp_number_id;
  elsif p_waba_id is not null then
    select w.organization_id, w.business_portfolio_id
      into v_org, v_business
    from public.wabas w where w.id = p_waba_id;
  elsif p_business_portfolio_id is not null then
    select b.organization_id into v_org
    from public.business_portfolios b where b.id = p_business_portfolio_id;
  else
    raise exception 'credential scope is required';
  end if;

  select c.* into v_cred
  from public.meta_credentials c
  where c.organization_id = v_org
    and c.status = 'active'
    and (c.expires_at is null or c.expires_at > now())
    and c.credential_type in ('access_token','system_user_token','user_token')
    and (
      (p_whatsapp_number_id is not null and c.whatsapp_number_id = p_whatsapp_number_id)
      or (v_waba is not null and c.whatsapp_number_id is null and c.waba_id = v_waba)
      or (v_business is not null and c.whatsapp_number_id is null and c.waba_id is null and c.business_portfolio_id = v_business)
      or (c.whatsapp_number_id is null and c.waba_id is null and c.business_portfolio_id is null)
    )
  order by
    case
      when p_whatsapp_number_id is not null and c.whatsapp_number_id = p_whatsapp_number_id then 1
      when v_waba is not null and c.waba_id = v_waba then 2
      when v_business is not null and c.business_portfolio_id = v_business then 3
      else 4
    end,
    c.created_at desc
  limit 1;

  if v_cred.id is null then
    return;
  end if;

  update public.meta_credentials set last_used_at = now() where id = v_cred.id;

  credential_id := v_cred.id;
  credential_type := v_cred.credential_type;
  token := private.decrypt_secret_reference(v_cred.secret_reference);
  return next;
end;
$$;

create or replace function public.backend_list_webhook_secrets()
returns table(
  webhook_endpoint_id uuid,
  organization_id uuid,
  meta_app_id uuid,
  verify_token text,
  app_secret text
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    we.id,
    we.organization_id,
    we.meta_app_id,
    private.decrypt_secret_reference(v.secret_reference),
    private.decrypt_secret_reference(a.secret_reference)
  from public.webhook_endpoints we
  left join public.meta_credentials v on v.id = we.verify_token_credential_id and v.status = 'active'
  left join public.meta_credentials a on a.id = we.app_secret_credential_id and a.status = 'active'
  where we.status = 'active';
$$;

create or replace function public.backend_decrypt_secret_reference(p_secret_reference text)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$ select private.decrypt_secret_reference(p_secret_reference); $$;

revoke all on function public.backend_store_meta_credential(uuid,text,text,text,uuid,uuid,uuid,uuid,text[],timestamptz) from public, anon, authenticated;
revoke all on function public.backend_resolve_meta_token(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.backend_list_webhook_secrets() from public, anon, authenticated;
revoke all on function public.backend_decrypt_secret_reference(text) from public, anon, authenticated;
grant execute on function public.backend_store_meta_credential(uuid,text,text,text,uuid,uuid,uuid,uuid,text[],timestamptz) to service_role;
grant execute on function public.backend_resolve_meta_token(uuid,uuid,uuid) to service_role;
grant execute on function public.backend_list_webhook_secrets() to service_role;
grant execute on function public.backend_decrypt_secret_reference(text) to service_role;

-- -----------------------------------------------------------------------------
-- 5) Durable job queue primitives (Postgres SKIP LOCKED)
-- -----------------------------------------------------------------------------
create or replace function public.backend_claim_jobs(
  p_worker_id text,
  p_queue_names text[],
  p_limit integer default 20
)
returns setof public.jobs
language sql
security definer
set search_path = pg_catalog
as $$
  with candidates as (
    select j.id
    from public.jobs j
    where j.status = 'queued'
      and j.available_at <= now()
      and (p_queue_names is null or cardinality(p_queue_names) = 0 or j.queue_name = any(p_queue_names))
    order by j.priority asc, j.available_at asc, j.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,20),100))
  )
  update public.jobs j
     set status = 'running',
         attempt = j.attempt + 1,
         locked_at = now(),
         locked_by = p_worker_id,
         started_at = coalesce(j.started_at, now()),
         updated_at = now()
  from candidates c
  where j.id = c.id
  returning j.*;
$$;

create or replace function public.backend_complete_job(p_job_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog
as $$
  update public.jobs
     set status = 'completed', completed_at = now(), locked_at = null, locked_by = null,
         error = null, updated_at = now()
   where id = p_job_id;
$$;

create or replace function public.backend_fail_job(
  p_job_id uuid,
  p_error text,
  p_retry_after_seconds integer default 30
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_job public.jobs%rowtype;
  v_status text;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if v_job.id is null then return 'missing'; end if;

  if v_job.attempt >= v_job.max_attempts then
    update public.jobs
       set status = 'failed', failed_at = now(), error = p_error,
           locked_at = null, locked_by = null, updated_at = now()
     where id = p_job_id;

    insert into public.dead_letter_jobs(
      organization_id, original_job_id, queue_name, job_type, payload, attempts, last_error, failed_at, status
    ) values (
      v_job.organization_id, v_job.id, v_job.queue_name, v_job.job_type, v_job.payload,
      v_job.attempt, p_error, now(), 'open'
    ) on conflict do nothing;
    v_status := 'dead';
  else
    update public.jobs
       set status = 'queued',
           available_at = now() + make_interval(secs => greatest(1, coalesce(p_retry_after_seconds,30))),
           error = p_error, locked_at = null, locked_by = null, updated_at = now()
     where id = p_job_id;
    v_status := 'retry';
  end if;

  return v_status;
end;
$$;

create or replace function public.backend_requeue_stale_jobs(p_older_than_seconds integer default 300)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_count integer;
begin
  update public.jobs
     set status = 'queued', locked_at = null, locked_by = null,
         available_at = now(), error = coalesce(error,'') || ' [stale lock recovered]', updated_at = now()
   where status = 'running'
     and locked_at < now() - make_interval(secs => greatest(60, coalesce(p_older_than_seconds,300)));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.backend_claim_jobs(text,text[],integer) from public, anon, authenticated;
revoke all on function public.backend_complete_job(uuid) from public, anon, authenticated;
revoke all on function public.backend_fail_job(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.backend_requeue_stale_jobs(integer) from public, anon, authenticated;
grant execute on function public.backend_claim_jobs(text,text[],integer) to service_role;
grant execute on function public.backend_complete_job(uuid) to service_role;
grant execute on function public.backend_fail_job(uuid,text,integer) to service_role;
grant execute on function public.backend_requeue_stale_jobs(integer) to service_role;

-- -----------------------------------------------------------------------------
-- 6) Webhook ingest RPC: event + queue atomically
-- -----------------------------------------------------------------------------
create or replace function public.backend_ingest_webhook_event(
  p_organization_id uuid,
  p_webhook_endpoint_id uuid,
  p_meta_app_id uuid,
  p_meta_waba_id text,
  p_meta_phone_number_id text,
  p_event_type text,
  p_meta_message_id text,
  p_deduplication_key text,
  p_signature_valid boolean,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event_id uuid;
  v_job_id uuid;
  v_waba_id uuid;
  v_number_id uuid;
  v_business_id uuid;
  v_status text := 'queued';
begin
  select w.id, w.business_portfolio_id into v_waba_id, v_business_id
  from public.wabas w
  where w.organization_id = p_organization_id and w.meta_waba_id = p_meta_waba_id
  limit 1;

  select n.id into v_number_id
  from public.whatsapp_numbers n
  where n.organization_id = p_organization_id and n.meta_phone_number_id = p_meta_phone_number_id
  limit 1;

  if p_meta_phone_number_id is not null and v_number_id is null then
    v_status := 'unmapped_number_event';
  end if;

  insert into public.webhook_events(
    organization_id, webhook_endpoint_id, meta_app_id, business_portfolio_id, waba_id, whatsapp_number_id,
    meta_waba_id, meta_phone_number_id, event_type, meta_message_id, deduplication_key,
    signature_valid, payload, status, queued_at
  ) values (
    p_organization_id, p_webhook_endpoint_id, p_meta_app_id, v_business_id, v_waba_id, v_number_id,
    p_meta_waba_id, p_meta_phone_number_id, coalesce(p_event_type,'unknown'), p_meta_message_id,
    p_deduplication_key, p_signature_valid, p_payload, v_status,
    case when v_status = 'queued' then now() else null end
  )
  on conflict (organization_id, deduplication_key) do update
    set signature_valid = excluded.signature_valid
  returning id into v_event_id;

  if v_status = 'queued' then
    insert into public.jobs(
      organization_id, queue_name, job_type, deduplication_key, priority, payload, status, max_attempts
    ) values (
      p_organization_id, 'webhook-events', 'process_webhook_event', 'webhook:' || v_event_id::text,
      10, jsonb_build_object('webhook_event_id', v_event_id), 'queued', 8
    ) on conflict do nothing
    returning id into v_job_id;

    if v_job_id is null then
      select id into v_job_id from public.jobs
      where organization_id = p_organization_id
        and queue_name = 'webhook-events'
        and deduplication_key = 'webhook:' || v_event_id::text
      order by created_at desc limit 1;
    end if;
  else
    insert into public.alerts(
      organization_id, waba_id, alert_type, severity, title, message, status, details
    ) values (
      p_organization_id, v_waba_id, 'unknown_whatsapp_number', 'critical',
      'Unknown WhatsApp Phone Number',
      'Webhook received for unmapped Meta phone_number_id ' || coalesce(p_meta_phone_number_id,'NULL'),
      'open', jsonb_build_object('meta_phone_number_id', p_meta_phone_number_id, 'webhook_event_id', v_event_id)
    );
  end if;

  update public.webhook_endpoints
     set last_event_at = now(), updated_at = now()
   where id = p_webhook_endpoint_id;

  return jsonb_build_object('event_id',v_event_id,'job_id',v_job_id,'status',v_status);
end;
$$;

revoke all on function public.backend_ingest_webhook_event(uuid,uuid,uuid,text,text,text,text,text,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.backend_ingest_webhook_event(uuid,uuid,uuid,text,text,text,text,text,boolean,jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 7) Inbound message/status processing RPCs
-- -----------------------------------------------------------------------------
create or replace function public.backend_ingest_inbound_message(
  p_organization_id uuid,
  p_meta_phone_number_id text,
  p_contact_wa_id text,
  p_contact_profile_name text,
  p_message jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
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
  where n.organization_id = p_organization_id
    and n.meta_phone_number_id = p_meta_phone_number_id
  limit 1;

  if v_number.id is null then
    return jsonb_build_object('status','unmapped_number','meta_phone_number_id',p_meta_phone_number_id);
  end if;

  if v_meta_message_id is null then
    raise exception 'Meta message id is required';
  end if;

  if coalesce(p_message->>'timestamp','') ~ '^[0-9]+$' then
    v_meta_ts := to_timestamp((p_message->>'timestamp')::double precision);
  else
    v_meta_ts := now();
  end if;

  select e.contact_id, e.channel_id into v_contact_id, v_channel_id
  from private.ensure_contact_channel(
    v_number.organization_id,
    coalesce(p_contact_wa_id, p_message->>'from'),
    coalesce(p_contact_wa_id, p_message->>'from'),
    p_contact_profile_name
  ) e;

  v_conversation_id := private.ensure_conversation(
    v_number.organization_id, v_number.id, v_contact_id, v_channel_id
  );

  select m.id into v_message_id
  from public.messages m
  where m.organization_id = v_number.organization_id
    and m.meta_message_id = v_meta_message_id
  limit 1;

  if v_message_id is null then
    v_body := case v_type
      when 'text' then p_message #>> '{text,body}'
      when 'button' then p_message #>> '{button,text}'
      when 'reaction' then p_message #>> '{reaction,emoji}'
      when 'interactive' then coalesce(
        p_message #>> '{interactive,button_reply,title}',
        p_message #>> '{interactive,list_reply,title}'
      )
      else null
    end;

    v_caption := coalesce(
      p_message #>> '{image,caption}',
      p_message #>> '{video,caption}',
      p_message #>> '{document,caption}'
    );

    insert into public.messages(
      organization_id, conversation_id, whatsapp_number_id, contact_id, contact_channel_id,
      meta_message_id, direction, message_type, body, caption, meta_reply_to_message_id,
      status, interactive_payload, context_payload, raw_payload, meta_timestamp, received_at
    ) values (
      v_number.organization_id, v_conversation_id, v_number.id, v_contact_id, v_channel_id,
      v_meta_message_id, 'incoming', v_type, v_body, v_caption, v_context_meta_id,
      'received', coalesce(p_message->'interactive','{}'::jsonb), coalesce(p_message->'context','{}'::jsonb),
      p_message, v_meta_ts, now()
    ) returning id into v_message_id;
    v_inserted := true;

    insert into public.message_status_history(
      organization_id, message_id, whatsapp_number_id, status, meta_timestamp, raw_payload
    ) values (
      v_number.organization_id, v_message_id, v_number.id, 'received', v_meta_ts, p_message
    ) on conflict do nothing;

    update public.conversations
       set last_message_at = greatest(coalesce(last_message_at, v_meta_ts), v_meta_ts),
           last_incoming_at = greatest(coalesce(last_incoming_at, v_meta_ts), v_meta_ts),
           unread_count = unread_count + 1,
           status = case when status in ('resolved','closed') then 'open' else status end,
           updated_at = now()
     where id = v_conversation_id;

    update public.contacts
       set first_interaction_at = coalesce(first_interaction_at, v_meta_ts),
           last_interaction_at = greatest(coalesce(last_interaction_at, v_meta_ts), v_meta_ts),
           updated_at = now()
     where id = v_contact_id;

    update public.whatsapp_numbers
       set last_incoming_message_at = greatest(coalesce(last_incoming_message_at, v_meta_ts), v_meta_ts),
           updated_at = now()
     where id = v_number.id;
  end if;

  if v_type in ('image','video','audio','document','sticker') then
    v_media_id := p_message #>> array[v_type,'id'];
    v_mime_type := p_message #>> array[v_type,'mime_type'];
    if v_type = 'document' then v_filename := p_message #>> '{document,filename}'; end if;

    if v_media_id is not null then
      insert into public.media(
        organization_id, whatsapp_number_id, message_id, contact_id, meta_media_id,
        media_type, mime_type, filename, download_status, received_at, metadata
      ) values (
        v_number.organization_id, v_number.id, v_message_id, v_contact_id, v_media_id,
        v_type, v_mime_type, v_filename, 'pending', v_meta_ts, p_message->v_type
      )
      on conflict (message_id, meta_media_id) where meta_media_id is not null
      do update set mime_type = coalesce(public.media.mime_type, excluded.mime_type),
                    filename = coalesce(public.media.filename, excluded.filename)
      returning id into v_media_record_id;

      if v_media_record_id is null then
        select id into v_media_record_id from public.media
        where message_id = v_message_id and meta_media_id = v_media_id limit 1;
      end if;

      insert into public.jobs(
        organization_id, queue_name, job_type, deduplication_key, priority, payload, status, max_attempts
      ) values (
        v_number.organization_id, 'media-downloads', 'download_whatsapp_media',
        'media:' || v_media_record_id::text, 20,
        jsonb_build_object('media_id',v_media_record_id), 'queued', 8
      ) on conflict do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'status', case when v_inserted then 'inserted' else 'duplicate' end,
    'organization_id', v_number.organization_id,
    'whatsapp_number_id', v_number.id,
    'contact_id', v_contact_id,
    'conversation_id', v_conversation_id,
    'message_id', v_message_id,
    'media_id', v_media_record_id,
    'message_type', v_type
  );
end;
$$;

create or replace function public.backend_apply_message_status(
  p_organization_id uuid,
  p_meta_phone_number_id text,
  p_status jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_number public.whatsapp_numbers%rowtype;
  v_message public.messages%rowtype;
  v_status text := coalesce(p_status->>'status','unknown');
  v_meta_ts timestamptz;
  v_error_code text := p_status #>> '{errors,0,code}';
  v_error_message text := coalesce(p_status #>> '{errors,0,title}', p_status #>> '{errors,0,message}');
  v_current_rank integer;
  v_new_rank integer;
begin
  select * into v_number from public.whatsapp_numbers
  where organization_id = p_organization_id and meta_phone_number_id = p_meta_phone_number_id
  limit 1;
  if v_number.id is null then return jsonb_build_object('status','unmapped_number'); end if;

  select * into v_message
  from public.messages
  where organization_id = v_number.organization_id
    and meta_message_id = p_status->>'id'
  limit 1;

  if v_message.id is null then
    return jsonb_build_object('status','message_not_found','meta_message_id',p_status->>'id');
  end if;

  if coalesce(p_status->>'timestamp','') ~ '^[0-9]+$' then
    v_meta_ts := to_timestamp((p_status->>'timestamp')::double precision);
  else
    v_meta_ts := now();
  end if;

  if v_status not in ('received','queued','submitted','sent','delivered','read','failed','deleted','unknown') then
    v_status := 'unknown';
  end if;

  insert into public.message_status_history(
    organization_id, message_id, whatsapp_number_id, status, meta_timestamp,
    error_code, error_message, raw_payload
  ) values (
    v_number.organization_id, v_message.id, v_number.id, v_status, v_meta_ts,
    v_error_code, v_error_message, p_status
  ) on conflict do nothing;

  v_current_rank := case v_message.status
    when 'received' then 1 when 'queued' then 2 when 'submitted' then 3 when 'sent' then 4
    when 'delivered' then 5 when 'read' then 6 when 'failed' then 7 when 'deleted' then 8 else 0 end;
  v_new_rank := case v_status
    when 'received' then 1 when 'queued' then 2 when 'submitted' then 3 when 'sent' then 4
    when 'delivered' then 5 when 'read' then 6 when 'failed' then 7 when 'deleted' then 8 else 0 end;

  if v_status = 'failed' or v_new_rank >= v_current_rank then
    update public.messages set status = v_status, updated_at = now() where id = v_message.id;
  end if;

  update public.message_outbox
     set status = case when v_status in ('sent','delivered','read','failed') then v_status else status end,
         completed_at = case when v_status in ('read','failed') then now() else completed_at end,
         last_error = case when v_status = 'failed' then coalesce(v_error_message,v_error_code) else last_error end,
         updated_at = now()
   where meta_message_id = v_message.meta_message_id;

  update public.campaign_recipients
     set status = case when v_status in ('sent','delivered','read','failed') then v_status else status end,
         sent_at = case when v_status = 'sent' then coalesce(sent_at,v_meta_ts) else sent_at end,
         delivered_at = case when v_status = 'delivered' then coalesce(delivered_at,v_meta_ts) else delivered_at end,
         read_at = case when v_status = 'read' then coalesce(read_at,v_meta_ts) else read_at end,
         failed_at = case when v_status = 'failed' then coalesce(failed_at,v_meta_ts) else failed_at end,
         error_code = case when v_status = 'failed' then v_error_code else error_code end,
         error_message = case when v_status = 'failed' then v_error_message else error_message end,
         updated_at = now()
   where message_id = v_message.id;

  return jsonb_build_object('status','applied','message_id',v_message.id,'message_status',v_status);
end;
$$;

revoke all on function public.backend_ingest_inbound_message(uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.backend_apply_message_status(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.backend_ingest_inbound_message(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.backend_apply_message_status(uuid,text,jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 8) Outbox RPCs
-- -----------------------------------------------------------------------------
create or replace function public.backend_create_outbox(
  p_whatsapp_number_id uuid,
  p_recipient_address text,
  p_message_type text,
  p_request_payload jsonb,
  p_idempotency_key text,
  p_requested_by uuid default null,
  p_contact_id uuid default null,
  p_conversation_id uuid default null,
  p_campaign_id uuid default null,
  p_campaign_recipient_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_number public.whatsapp_numbers%rowtype;
  v_outbox_id uuid;
  v_job_id uuid;
begin
  select * into v_number from public.whatsapp_numbers where id = p_whatsapp_number_id;
  if v_number.id is null then raise exception 'WhatsApp number not found'; end if;
  if not v_number.is_enabled or v_number.status <> 'active' then raise exception 'WhatsApp number is not active'; end if;
  if nullif(private.normalize_wa_address(p_recipient_address),'') is null then raise exception 'Invalid recipient address'; end if;
  if nullif(p_idempotency_key,'') is null then raise exception 'idempotency_key is required'; end if;

  insert into public.message_outbox(
    organization_id, whatsapp_number_id, contact_id, conversation_id, campaign_id, campaign_recipient_id,
    recipient_address, message_type, request_payload, idempotency_key, requested_by, status
  ) values (
    v_number.organization_id, v_number.id, p_contact_id, p_conversation_id, p_campaign_id, p_campaign_recipient_id,
    private.normalize_wa_address(p_recipient_address), p_message_type, p_request_payload, p_idempotency_key,
    p_requested_by, 'queued'
  )
  on conflict (organization_id, idempotency_key) do update set idempotency_key = excluded.idempotency_key
  returning id into v_outbox_id;

  insert into public.jobs(
    organization_id, queue_name, job_type, deduplication_key, priority, payload, status, max_attempts
  ) values (
    v_number.organization_id, 'message-send', 'send_whatsapp_message',
    'outbox:' || v_outbox_id::text, 20, jsonb_build_object('outbox_id',v_outbox_id), 'queued', 6
  ) on conflict do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select id into v_job_id from public.jobs
    where organization_id = v_number.organization_id
      and queue_name = 'message-send'
      and deduplication_key = 'outbox:' || v_outbox_id::text
    order by created_at desc limit 1;
  end if;

  return jsonb_build_object('outbox_id',v_outbox_id,'job_id',v_job_id,'status','queued');
end;
$$;

create or replace function public.backend_finalize_outbox_success(
  p_outbox_id uuid,
  p_meta_message_id text,
  p_raw_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_o public.message_outbox%rowtype;
  v_number public.whatsapp_numbers%rowtype;
  v_contact_id uuid;
  v_channel_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_now timestamptz := now();
begin
  select * into v_o from public.message_outbox where id = p_outbox_id for update;
  if v_o.id is null then raise exception 'Outbox row not found'; end if;

  select * into v_number from public.whatsapp_numbers where id = v_o.whatsapp_number_id;

  select e.contact_id, e.channel_id into v_contact_id, v_channel_id
  from private.ensure_contact_channel(v_o.organization_id, v_o.recipient_address, v_o.recipient_address, null) e;

  v_conversation_id := coalesce(v_o.conversation_id,
    private.ensure_conversation(v_o.organization_id, v_o.whatsapp_number_id, v_contact_id, v_channel_id));

  select id into v_message_id from public.messages
  where organization_id = v_o.organization_id and meta_message_id = p_meta_message_id limit 1;

  if v_message_id is null then
    insert into public.messages(
      organization_id, conversation_id, whatsapp_number_id, contact_id, contact_channel_id,
      meta_message_id, direction, message_type, body, caption, status, interactive_payload,
      context_payload, raw_payload, sent_at, meta_timestamp
    ) values (
      v_o.organization_id, v_conversation_id, v_o.whatsapp_number_id, v_contact_id, v_channel_id,
      p_meta_message_id, 'outgoing', v_o.message_type,
      case when v_o.message_type = 'text' then v_o.request_payload #>> '{text,body}' else null end,
      coalesce(v_o.request_payload #>> '{image,caption}',v_o.request_payload #>> '{video,caption}',v_o.request_payload #>> '{document,caption}'),
      'submitted', coalesce(v_o.request_payload->'interactive','{}'::jsonb),
      coalesce(v_o.request_payload->'context','{}'::jsonb), p_raw_response, v_now, v_now
    ) returning id into v_message_id;

    insert into public.message_status_history(
      organization_id, message_id, whatsapp_number_id, status, meta_timestamp, raw_payload
    ) values (v_o.organization_id,v_message_id,v_o.whatsapp_number_id,'submitted',v_now,p_raw_response)
    on conflict do nothing;
  end if;

  update public.message_outbox
     set contact_id = v_contact_id, conversation_id = v_conversation_id,
         meta_message_id = p_meta_message_id, status = 'submitted', submitted_at = v_now,
         attempt_count = attempt_count + 1, last_error = null, updated_at = now()
   where id = v_o.id;

  update public.conversations
     set last_message_at = greatest(coalesce(last_message_at,v_now),v_now),
         last_outgoing_at = greatest(coalesce(last_outgoing_at,v_now),v_now), updated_at = now()
   where id = v_conversation_id;

  update public.contacts
     set first_interaction_at = coalesce(first_interaction_at,v_now),
         last_interaction_at = greatest(coalesce(last_interaction_at,v_now),v_now), updated_at = now()
   where id = v_contact_id;

  update public.whatsapp_numbers
     set last_outgoing_message_at = greatest(coalesce(last_outgoing_message_at,v_now),v_now),
         last_api_success_at = v_now, updated_at = now()
   where id = v_o.whatsapp_number_id;

  if v_o.campaign_recipient_id is not null then
    update public.campaign_recipients
       set message_id = v_message_id, status = 'submitted', sent_at = coalesce(sent_at,v_now), updated_at = now()
     where id = v_o.campaign_recipient_id;
  end if;

  return jsonb_build_object('message_id',v_message_id,'conversation_id',v_conversation_id,'contact_id',v_contact_id);
end;
$$;

create or replace function public.backend_finalize_outbox_failure(
  p_outbox_id uuid,
  p_error text,
  p_final boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_o public.message_outbox%rowtype;
begin
  select * into v_o from public.message_outbox where id = p_outbox_id for update;
  if v_o.id is null then return; end if;

  update public.message_outbox
     set status = case when p_final then 'failed' else 'queued' end,
         attempt_count = attempt_count + 1,
         next_attempt_at = case when p_final then next_attempt_at else now() + interval '30 seconds' end,
         last_error = p_error,
         completed_at = case when p_final then now() else completed_at end,
         updated_at = now()
   where id = p_outbox_id;

  update public.whatsapp_numbers set last_api_failure_at = now(), updated_at = now()
   where id = v_o.whatsapp_number_id;

  if p_final and v_o.campaign_recipient_id is not null then
    update public.campaign_recipients
       set status = 'failed', error_message = p_error, failed_at = now(), updated_at = now()
     where id = v_o.campaign_recipient_id;
  end if;
end;
$$;

revoke all on function public.backend_create_outbox(uuid,text,text,jsonb,text,uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.backend_finalize_outbox_success(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.backend_finalize_outbox_failure(uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.backend_create_outbox(uuid,text,text,jsonb,text,uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.backend_finalize_outbox_success(uuid,text,jsonb) to service_role;
grant execute on function public.backend_finalize_outbox_failure(uuid,text,boolean) to service_role;

-- -----------------------------------------------------------------------------
-- 9) Campaign queueing
-- -----------------------------------------------------------------------------
create or replace function public.backend_enqueue_campaign(p_campaign_id uuid, p_requested_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_template public.templates%rowtype;
  v_count integer := 0;
  r record;
  v_payload jsonb;
  v_result jsonb;
begin
  select * into v_campaign from public.campaigns where id = p_campaign_id for update;
  if v_campaign.id is null then raise exception 'Campaign not found'; end if;
  if v_campaign.status not in ('draft','scheduled','paused') then raise exception 'Campaign cannot be started from status %', v_campaign.status; end if;
  if v_campaign.template_id is null then raise exception 'Campaign template is required'; end if;

  select * into v_template from public.templates where id = v_campaign.template_id;
  if v_template.id is null or v_template.status <> 'approved' then raise exception 'Approved template is required'; end if;

  update public.campaigns set status='running', started_at=coalesce(started_at,now()), updated_at=now() where id=p_campaign_id;

  for r in
    select cr.* from public.campaign_recipients cr
    where cr.campaign_id = p_campaign_id and cr.status in ('queued','failed')
    order by cr.created_at asc
  loop
    v_payload := jsonb_build_object(
      'messaging_product','whatsapp',
      'to', private.normalize_wa_address(r.recipient_address),
      'type','template',
      'template', jsonb_build_object(
        'name',v_template.name,
        'language',jsonb_build_object('code',v_template.language),
        'components',coalesce(r.template_variables->'components','[]'::jsonb)
      )
    );

    v_result := public.backend_create_outbox(
      v_campaign.sender_whatsapp_number_id,
      r.recipient_address,
      'template',
      v_payload,
      'campaign:' || p_campaign_id::text || ':recipient:' || r.id::text,
      p_requested_by,
      r.contact_id,
      null,
      p_campaign_id,
      r.id
    );

    update public.campaign_recipients set status='processing', updated_at=now() where id=r.id;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('campaign_id',p_campaign_id,'queued_recipients',v_count);
end;
$$;

revoke all on function public.backend_enqueue_campaign(uuid,uuid) from public, anon, authenticated;
grant execute on function public.backend_enqueue_campaign(uuid,uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 10) RLS/grants for runtime tables. Writes remain backend/service_role only.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['meta_sync_runs','message_outbox','message_send_attempts','webhook_event_attempts','media_download_attempts']
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon',t);
    execute format('revoke insert, update, delete on public.%I from authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;

-- Drop in case migration is reapplied during controlled rebuild.
drop policy if exists meta_sync_runs_read_scope on public.meta_sync_runs;
create policy meta_sync_runs_read_scope on public.meta_sync_runs
for select to authenticated using (
  private.is_org_member(organization_id)
  and private.has_org_permission(organization_id,'logs.read')
);

drop policy if exists message_outbox_read_scope on public.message_outbox;
create policy message_outbox_read_scope on public.message_outbox
for select to authenticated using (
  private.can_read_number(whatsapp_number_id,'messages.read')
);

drop policy if exists message_send_attempts_read_scope on public.message_send_attempts;
create policy message_send_attempts_read_scope on public.message_send_attempts
for select to authenticated using (
  exists (
    select 1 from public.message_outbox o
    where o.id = outbox_id and private.can_read_number(o.whatsapp_number_id,'logs.read')
  )
);

drop policy if exists webhook_event_attempts_read_scope on public.webhook_event_attempts;
create policy webhook_event_attempts_read_scope on public.webhook_event_attempts
for select to authenticated using (
  private.is_org_member(organization_id)
  and private.has_org_permission(organization_id,'logs.read')
);

drop policy if exists media_download_attempts_read_scope on public.media_download_attempts;
create policy media_download_attempts_read_scope on public.media_download_attempts
for select to authenticated using (
  exists (
    select 1 from public.media m
    where m.id = media_id and private.can_read_number(m.whatsapp_number_id,'logs.read')
  )
);

-- -----------------------------------------------------------------------------
-- 11) Runtime configuration + webhook endpoint bootstrap
-- -----------------------------------------------------------------------------
insert into public.system_settings(organization_id,key,value,is_secret)
select o.id,'meta.graph_version','{"value":"v26.0"}'::jsonb,false
from public.organizations o where o.slug='alazab-group'
on conflict (organization_id,key) do nothing;

insert into public.system_settings(organization_id,key,value,is_secret)
select o.id,'backend.worker','{"batch_size":20,"stale_lock_seconds":300}'::jsonb,false
from public.organizations o where o.slug='alazab-group'
on conflict (organization_id,key) do nothing;

insert into public.webhook_endpoints(organization_id,meta_app_id,endpoint_type,url,status,verification_status)
select a.organization_id,a.id,'meta_whatsapp','https://wa.alazab.com/webhooks/meta/whatsapp','active','pending_credentials'
from public.meta_apps a
where a.meta_app_id='1061494059972503'
  and not exists (
    select 1 from public.webhook_endpoints we
    where we.meta_app_id=a.id and we.endpoint_type='meta_whatsapp'
  );

-- Realtime additions if publication exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='message_outbox') then
      alter publication supabase_realtime add table public.message_outbox;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='meta_sync_runs') then
      alter publication supabase_realtime add table public.meta_sync_runs;
    end if;
  end if;
end $$;

-- updated_at trigger for outbox
DROP TRIGGER IF EXISTS trg_message_outbox_updated_at ON public.message_outbox;
CREATE TRIGGER trg_message_outbox_updated_at
BEFORE UPDATE ON public.message_outbox
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

commit;

-- ====================================================================
-- END: 20260826090000_azwa_backend_runtime.sql
-- ====================================================================

-- ====================================================================
-- BEGIN: 20260826090500_azwa_worker_primitives.sql
-- ====================================================================
-- AzWA worker support primitives
-- Apply after 20260826090000_azwa_backend_runtime.sql

begin;

create or replace function public.backend_defer_job(
  p_job_id uuid,
  p_seconds integer default 60
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update public.jobs
     set status = 'queued',
         available_at = now() + make_interval(secs => greatest(1, least(coalesce(p_seconds,60),86400))),
         locked_at = null,
         locked_by = null,
         started_at = null,
         updated_at = now()
   where id = p_job_id and status = 'running';
end;
$$;

revoke all on function public.backend_defer_job(uuid,integer) from public, anon, authenticated;
grant execute on function public.backend_defer_job(uuid,integer) to service_role;

-- Used by the worker to atomically create an outgoing webhook delivery + durable job.
create or replace function public.backend_enqueue_outgoing_webhook(
  p_organization_id uuid,
  p_outgoing_webhook_id uuid,
  p_event_type text,
  p_event_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_webhook public.outgoing_webhooks%rowtype;
  v_delivery_id uuid;
  v_job_id uuid;
begin
  select * into v_webhook
  from public.outgoing_webhooks
  where id = p_outgoing_webhook_id
    and organization_id = p_organization_id
    and is_enabled;

  if v_webhook.id is null then
    return jsonb_build_object('status','ignored','reason','webhook_not_enabled');
  end if;

  if not (p_event_type = any(v_webhook.event_types)) then
    return jsonb_build_object('status','ignored','reason','event_not_subscribed');
  end if;

  insert into public.outgoing_webhook_deliveries(
    organization_id, outgoing_webhook_id, event_type, event_id, payload, status, attempt
  ) values (
    p_organization_id, p_outgoing_webhook_id, p_event_type, p_event_id, p_payload, 'queued', 0
  ) returning id into v_delivery_id;

  insert into public.jobs(
    organization_id, queue_name, job_type, deduplication_key, priority, payload, status, max_attempts
  ) values (
    p_organization_id, 'outgoing-webhooks', 'deliver_outgoing_webhook',
    'outgoing-webhook:' || v_delivery_id::text, 50,
    jsonb_build_object('delivery_id',v_delivery_id), 'queued', 8
  ) on conflict do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select id into v_job_id
    from public.jobs
    where organization_id = p_organization_id
      and queue_name = 'outgoing-webhooks'
      and deduplication_key = 'outgoing-webhook:' || v_delivery_id::text
    order by created_at desc
    limit 1;
  end if;

  return jsonb_build_object('status','queued','delivery_id',v_delivery_id,'job_id',v_job_id);
end;
$$;

revoke all on function public.backend_enqueue_outgoing_webhook(uuid,uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.backend_enqueue_outgoing_webhook(uuid,uuid,text,uuid,jsonb) to service_role;

create or replace function public.backend_store_secret(
  p_name text,
  p_secret text,
  p_description text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_id uuid;
  v_name text := 'azwa_' || replace(gen_random_uuid()::text,'-','');
begin
  if nullif(p_secret,'') is null then raise exception 'secret is required'; end if;
  execute 'select vault.create_secret($1,$2,$3)'
    into v_id using p_secret, v_name, coalesce(p_description,p_name);
  return 'vault:' || v_id::text;
end;
$$;

revoke all on function public.backend_store_secret(text,text,text) from public, anon, authenticated;
grant execute on function public.backend_store_secret(text,text,text) to service_role;

create or replace function public.backend_bootstrap_owner(
  p_organization_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role_id uuid;
begin
  if not exists (select 1 from auth.users u where u.id=p_user_id) then
    raise exception 'Auth user not found';
  end if;
  if not exists (select 1 from public.organizations o where o.id=p_organization_id) then
    raise exception 'Organization not found';
  end if;
  select id into v_role_id from public.roles where code='super_admin' limit 1;
  if v_role_id is null then raise exception 'super_admin role not found'; end if;

  insert into public.organization_members(organization_id,user_id,status,joined_at)
  values (p_organization_id,p_user_id,'active',now())
  on conflict (organization_id,user_id)
  do update set status='active', joined_at=coalesce(public.organization_members.joined_at,excluded.joined_at), updated_at=now();

  insert into public.user_roles(organization_id,user_id,role_id)
  values (p_organization_id,p_user_id,v_role_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.backend_bootstrap_owner(uuid,uuid) from public, anon, authenticated;
grant execute on function public.backend_bootstrap_owner(uuid,uuid) to service_role;

commit;

-- ====================================================================
-- END: 20260826090500_azwa_worker_primitives.sql
-- ====================================================================

-- ====================================================================
-- BEGIN: 20260826091000_azwa_backend_rls_hardening.sql
-- ====================================================================
-- AzWA row-level authorization hardening
-- Replaces broad organization-member read policies with explicit permission gates.

begin;

create or replace function private.can_read_contact(
  p_contact_id uuid,
  p_permission text default 'contacts.read'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.contacts c
    where c.id = p_contact_id
      and private.is_org_member(c.organization_id)
      and private.has_org_permission(c.organization_id,p_permission)
      and (
        private.is_org_admin(c.organization_id)
        or exists (
          select 1
          from public.conversations cv
          where cv.contact_id = c.id
            and private.can_read_number(cv.whatsapp_number_id,'contacts.read')
        )
        or exists (
          select 1
          from public.user_business_access uba
          where uba.organization_id = c.organization_id
            and uba.user_id = auth.uid()
            and uba.can_read
        )
      )
  );
$$;

revoke all on function private.can_read_contact(uuid,text) from public, anon;
grant execute on function private.can_read_contact(uuid,text) to authenticated, service_role;

-- Control-plane tables.
drop policy if exists read_org_scope on public.business_portfolios;
drop policy if exists business_portfolios_read_permission on public.business_portfolios;
create policy business_portfolios_read_permission on public.business_portfolios
for select to authenticated using (
  private.is_org_member(organization_id)
  and private.has_org_permission(organization_id,'business.read')
);

drop policy if exists read_org_scope on public.meta_apps;
drop policy if exists meta_apps_read_permission on public.meta_apps;
create policy meta_apps_read_permission on public.meta_apps
for select to authenticated using (
  private.is_org_member(organization_id)
  and private.has_org_permission(organization_id,'business.read')
);

drop policy if exists read_org_scope on public.meta_credentials;
drop policy if exists meta_credentials_read_permission on public.meta_credentials;
create policy meta_credentials_read_permission on public.meta_credentials
for select to authenticated using (
  private.is_org_member(organization_id)
  and private.has_org_permission(organization_id,'credentials.manage')
);

-- Identity/access administration.
do $$
declare t text;
begin
  foreach t in array array['organization_members','user_roles','teams','user_business_access','user_waba_access','user_number_access','team_number_access']
  loop
    execute format('drop policy if exists read_org_scope on public.%I',t);
    execute format('drop policy if exists users_manage_read on public.%I',t);
    execute format(
      'create policy users_manage_read on public.%I for select to authenticated using (private.is_org_member(organization_id) and private.has_org_permission(organization_id,''users.manage''))',
      t
    );
  end loop;
end $$;

-- CRM. Contacts are limited to accessible number interactions, business-wide access, or org admin.
drop policy if exists read_org_scope on public.contacts;
drop policy if exists contacts_read_scope on public.contacts;
create policy contacts_read_scope on public.contacts
for select to authenticated using (private.can_read_contact(id,'contacts.read'));

drop policy if exists read_org_scope on public.contact_channels;
drop policy if exists contact_channels_read_scope on public.contact_channels;
create policy contact_channels_read_scope on public.contact_channels
for select to authenticated using (private.can_read_contact(contact_id,'contacts.read'));

drop policy if exists read_org_scope on public.contact_consents;
drop policy if exists contact_consents_read_scope on public.contact_consents;
create policy contact_consents_read_scope on public.contact_consents
for select to authenticated using (private.can_read_contact(contact_id,'contacts.read'));

drop policy if exists read_org_scope on public.tags;
drop policy if exists tags_read_scope on public.tags;
create policy tags_read_scope on public.tags
for select to authenticated using (
  private.is_org_member(organization_id)
  and private.has_org_permission(organization_id,'contacts.read')
);

-- Conversation collaboration rows must inherit conversation/number scope.
drop policy if exists read_org_scope on public.conversation_assignments;
drop policy if exists conversation_assignments_read_scope on public.conversation_assignments;
create policy conversation_assignments_read_scope on public.conversation_assignments
for select to authenticated using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and private.can_read_number(c.whatsapp_number_id,'messages.read')
  )
);

drop policy if exists read_org_scope on public.conversation_notes;
drop policy if exists conversation_notes_read_scope on public.conversation_notes;
create policy conversation_notes_read_scope on public.conversation_notes
for select to authenticated using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and private.can_read_number(c.whatsapp_number_id,'messages.read')
  )
);

-- Automation.
drop policy if exists read_org_scope on public.automation_rules;
drop policy if exists automation_rules_read_permission on public.automation_rules;
create policy automation_rules_read_permission on public.automation_rules
for select to authenticated using (
  private.is_org_member(organization_id)
  and private.has_org_permission(organization_id,'automation.read')
  and (scope_waba_id is null or private.can_read_waba(scope_waba_id,'wabas.read'))
  and (scope_whatsapp_number_id is null or private.can_read_number(scope_whatsapp_number_id,'numbers.read'))
);

drop policy if exists read_org_scope on public.automation_runs;
drop policy if exists automation_runs_read_permission on public.automation_runs;
create policy automation_runs_read_permission on public.automation_runs
for select to authenticated using (
  private.is_org_member(organization_id)
  and private.has_org_permission(organization_id,'automation.read')
  and (whatsapp_number_id is null or private.can_read_number(whatsapp_number_id,'messages.read'))
);

-- Webhook/admin operational configuration.
drop policy if exists read_org_scope on public.webhook_endpoints;
drop policy if exists webhook_endpoints_read_permission on public.webhook_endpoints;
create policy webhook_endpoints_read_permission on public.webhook_endpoints
for select to authenticated using (
  private.is_org_member(organization_id)
  and private.has_org_permission(organization_id,'webhooks.read')
);

drop policy if exists read_org_scope on public.api_requests;
drop policy if exists api_requests_read_permission on public.api_requests;
create policy api_requests_read_permission on public.api_requests
for select to authenticated using (
  private.is_org_member(organization_id)
  and private.has_org_permission(organization_id,'logs.read')
  and (whatsapp_number_id is null or private.can_read_number(whatsapp_number_id,'logs.read'))
);

drop policy if exists read_org_scope on public.api_errors;
drop policy if exists api_errors_read_permission on public.api_errors;
create policy api_errors_read_permission on public.api_errors
for select to authenticated using (
  private.is_org_member(organization_id)
  and private.has_org_permission(organization_id,'errors.read')
  and (whatsapp_number_id is null or private.can_read_number(whatsapp_number_id,'errors.read'))
);

drop policy if exists read_org_scope on public.health_checks;
drop policy if exists health_checks_read_permission on public.health_checks;
create policy health_checks_read_permission on public.health_checks
for select to authenticated using (
  private.is_org_member(organization_id)
  and private.has_org_permission(organization_id,'health.read')
  and (whatsapp_number_id is null or private.can_read_number(whatsapp_number_id,'health.read'))
);

drop policy if exists read_org_scope on public.alerts;
drop policy if exists alerts_read_permission on public.alerts;
create policy alerts_read_permission on public.alerts
for select to authenticated using (
  private.is_org_member(organization_id)
  and (private.has_org_permission(organization_id,'health.read') or private.has_org_permission(organization_id,'errors.read'))
  and (whatsapp_number_id is null or private.can_read_number(whatsapp_number_id,'health.read') or private.can_read_number(whatsapp_number_id,'errors.read'))
);

do $$
declare t text;
begin
  foreach t in array array['jobs','dead_letter_jobs','audit_logs']
  loop
    execute format('drop policy if exists read_org_scope on public.%I',t);
    execute format('drop policy if exists logs_read_permission on public.%I',t);
    execute format(
      'create policy logs_read_permission on public.%I for select to authenticated using (private.is_org_member(organization_id) and private.has_org_permission(organization_id,''logs.read''))',
      t
    );
  end loop;
end $$;

-- Integration/system configuration.
do $$
declare t text;
begin
  foreach t in array array['integrations','system_settings']
  loop
    execute format('drop policy if exists read_org_scope on public.%I',t);
    execute format('drop policy if exists settings_read_permission on public.%I',t);
    execute format(
      'create policy settings_read_permission on public.%I for select to authenticated using (private.is_org_member(organization_id) and private.has_org_permission(organization_id,''settings.manage''))',
      t
    );
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['outgoing_webhooks','outgoing_webhook_deliveries']
  loop
    execute format('drop policy if exists read_org_scope on public.%I',t);
    execute format('drop policy if exists outgoing_webhooks_read_permission on public.%I',t);
    execute format(
      'create policy outgoing_webhooks_read_permission on public.%I for select to authenticated using (private.is_org_member(organization_id) and private.has_org_permission(organization_id,''webhooks.read''))',
      t
    );
  end loop;
end $$;

-- New runtime tables are already scoped, but require explicit permission for sync runs.
drop policy if exists meta_sync_runs_read_scope on public.meta_sync_runs;
create policy meta_sync_runs_read_scope on public.meta_sync_runs
for select to authenticated using (
  private.is_org_member(organization_id)
  and private.has_org_permission(organization_id,'logs.read')
);

-- Junction/detail policies that cannot use direct organization_id alone.
drop policy if exists contact_tags_read_scope on public.contact_tags;
drop policy if exists contact_tags_read_permission on public.contact_tags;
create policy contact_tags_read_permission on public.contact_tags
for select to authenticated using (private.can_read_contact(contact_id,'contacts.read'));

drop policy if exists read_org_scope on public.template_versions;
drop policy if exists template_versions_read_scope on public.template_versions;
create policy template_versions_read_scope on public.template_versions
for select to authenticated using (
  exists (
    select 1 from public.templates t
    where t.id=template_id and private.can_read_waba(t.waba_id,'templates.read')
  )
);

drop policy if exists team_members_read_scope on public.team_members;
drop policy if exists team_members_users_manage on public.team_members;
create policy team_members_users_manage on public.team_members
for select to authenticated using (
  exists (
    select 1 from public.teams t
    where t.id=team_id
      and private.is_org_member(t.organization_id)
      and private.has_org_permission(t.organization_id,'users.manage')
  )
);

-- A user always sees their own profile; user managers can see profiles of members in organizations they manage.
drop policy if exists profiles_read_managed_members on public.profiles;
create policy profiles_read_managed_members on public.profiles
for select to authenticated using (
  id=auth.uid()
  or exists (
    select 1
    from public.organization_members om
    where om.user_id=profiles.id
      and private.is_org_member(om.organization_id)
      and private.has_org_permission(om.organization_id,'users.manage')
  )
);

commit;

-- ====================================================================
-- END: 20260826091000_azwa_backend_rls_hardening.sql
-- ====================================================================

-- ====================================================================
-- BEGIN: 20260826091500_azwa_campaign_and_ops.sql
-- ====================================================================
-- AzWA campaign lifecycle, dead-letter observability, and search performance

begin;

create unique index if not exists uq_dead_letter_jobs_original
  on public.dead_letter_jobs(original_job_id)
  where original_job_id is not null;

create index if not exists idx_message_send_attempts_outbox_created
  on public.message_send_attempts(outbox_id, created_at desc);
create index if not exists idx_webhook_event_attempts_event_started
  on public.webhook_event_attempts(webhook_event_id, started_at desc);
create index if not exists idx_media_download_attempts_media_started
  on public.media_download_attempts(media_id, started_at desc);
create index if not exists idx_meta_sync_runs_status_created
  on public.meta_sync_runs(status, created_at desc);

-- Global-search indexes. pg_trgm is intentionally installed in extensions schema.
create index if not exists idx_contacts_display_name_trgm
  on public.contacts using gin (display_name extensions.gin_trgm_ops)
  where display_name is not null;
create index if not exists idx_contacts_company_trgm
  on public.contacts using gin (company extensions.gin_trgm_ops)
  where company is not null;
create index if not exists idx_messages_body_trgm
  on public.messages using gin (body extensions.gin_trgm_ops)
  where body is not null;
create index if not exists idx_media_filename_trgm
  on public.media using gin (filename extensions.gin_trgm_ops)
  where filename is not null;

create or replace function private.refresh_campaign_aggregate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_campaign_id uuid := coalesce(new.campaign_id, old.campaign_id);
  v_stats jsonb;
  v_pending bigint;
begin
  select jsonb_build_object(
    'total', count(*),
    'queued', count(*) filter (where status='queued'),
    'processing', count(*) filter (where status='processing'),
    'submitted', count(*) filter (where status='submitted'),
    'sent', count(*) filter (where status='sent'),
    'delivered', count(*) filter (where status='delivered'),
    'read', count(*) filter (where status='read'),
    'failed', count(*) filter (where status='failed'),
    'skipped', count(*) filter (where status='skipped'),
    'cancelled', count(*) filter (where status='cancelled')
  ),
  count(*) filter (where status in ('queued','processing'))
  into v_stats, v_pending
  from public.campaign_recipients
  where campaign_id=v_campaign_id;

  update public.campaigns
     set stats=v_stats,
         status=case when status='running' and v_pending=0 then 'completed' else status end,
         completed_at=case when status='running' and v_pending=0 then coalesce(completed_at,now()) else completed_at end,
         updated_at=now()
   where id=v_campaign_id;

  if TG_OP='DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.refresh_campaign_aggregate() from public, anon, authenticated;

drop trigger if exists trg_campaign_recipient_aggregate on public.campaign_recipients;
create trigger trg_campaign_recipient_aggregate
after insert or update or delete on public.campaign_recipients
for each row execute function private.refresh_campaign_aggregate();

create or replace function private.alert_on_dead_job()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.status='failed' and old.status is distinct from new.status then
    insert into public.alerts(
      organization_id,alert_type,severity,title,message,status,source_entity_type,source_entity_id,details
    ) values (
      new.organization_id,'dead_letter_job','critical','Background job exhausted retries',
      'Queue ' || new.queue_name || ' / ' || new.job_type || ' exhausted its retry budget.',
      'open','job',new.id,
      jsonb_build_object('queue_name',new.queue_name,'job_type',new.job_type,'attempt',new.attempt,'error',new.error)
    );
  end if;
  return new;
end;
$$;

revoke all on function private.alert_on_dead_job() from public, anon, authenticated;

drop trigger if exists trg_alert_on_dead_job on public.jobs;
create trigger trg_alert_on_dead_job
after update of status on public.jobs
for each row execute function private.alert_on_dead_job();

commit;

-- ====================================================================
-- END: 20260826091500_azwa_campaign_and_ops.sql
-- ====================================================================
