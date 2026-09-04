-- ============================================================================
-- AzWA — 002 Complete Messaging Runtime
-- Requires: 001 Core + 001A Security/FK patch
-- Compatible with: 001B Meta inventory seed
--
-- Creates the operational backend used by the current AzWA server runtime:
-- CRM, conversations/messages, media, webhook persistence, API/health/audit,
-- durable outbox, jobs/DLQ, campaigns and automation execution records.
-- ============================================================================
begin;

-- --------------------------------------------------------------------------
-- 0) Guard + required extensions
-- --------------------------------------------------------------------------
do $$
declare
  missing text[];
begin
  select array_agg(x order by x)
  into missing
  from unnest(array[
    'organizations','organization_members','roles','permissions',
    'business_portfolios','meta_apps','wabas','whatsapp_numbers',
    'meta_credentials','webhook_endpoints','templates','whatsapp_flows'
  ]) x
  where to_regclass(format('public.%I',x)) is null;

  if missing is not null then
    raise exception 'AzWA 002 aborted. Missing 001 tables: %', array_to_string(missing,', ');
  end if;

  if exists (
    select 1 from pg_catalog.pg_tables
    where schemaname='public'
      and tablename = any(array[
        'contacts','contact_channels','conversations','messages','message_status_history',
        'media','campaigns','campaign_recipients','automation_rules','automation_runs',
        'webhook_events','unmapped_number_events','api_requests','api_errors','alerts',
        'health_checks','jobs','dead_letter_jobs','meta_sync_runs','message_outbox',
        'message_send_attempts','webhook_event_attempts','media_download_attempts',
        'audit_logs','system_settings'
      ])
  ) then
    raise exception 'AzWA 002 aborted: one or more runtime tables already exist';
  end if;
end;
$$;

create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;

-- Existing scope tables gain explicit send inheritance.
alter table public.user_business_access
  add column if not exists can_send boolean not null default false;

alter table public.user_waba_access
  add column if not exists can_send boolean not null default false;

-- --------------------------------------------------------------------------
-- 1) CRM
-- --------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text,
  first_name text,
  last_name text,
  email text,
  company text,
  source text,
  status text not null default 'active'
    check (status in ('active','blocked','archived')),
  assigned_user_id uuid,
  assigned_team_id uuid,
  notes text,
  custom_fields jsonb not null default '{}'::jsonb,
  first_interaction_at timestamptz,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,organization_id),
  constraint contacts_assigned_user_fk
    foreign key (organization_id,assigned_user_id)
    references public.organization_members(organization_id,user_id)
    on delete set null (assigned_user_id),
  constraint contacts_assigned_team_fk
    foreign key (assigned_team_id,organization_id)
    references public.teams(id,organization_id)
    on delete set null (assigned_team_id)
);

create table public.contact_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null,
  channel_type text not null default 'whatsapp'
    check (channel_type in ('whatsapp','phone','email','other')),
  address text not null,
  normalized_address text,
  wa_id text,
  profile_name text,
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,organization_id),
  constraint contact_channels_contact_fk
    foreign key (contact_id,organization_id)
    references public.contacts(id,organization_id)
    on delete cascade
);

create unique index uq_contact_channels_whatsapp_address
  on public.contact_channels(organization_id,channel_type,normalized_address)
  where normalized_address is not null;

create unique index uq_contact_channels_wa_id
  on public.contact_channels(organization_id,wa_id)
  where wa_id is not null;

-- --------------------------------------------------------------------------
-- 2) Conversations + messages
-- --------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_number_id uuid not null,
  contact_id uuid not null,
  contact_channel_id uuid,
  meta_conversation_id text,
  category text,
  status text not null default 'open'
    check (status in ('open','pending','waiting_customer','resolved','closed','spam')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  assigned_user_id uuid,
  assigned_team_id uuid,
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  last_incoming_at timestamptz,
  last_outgoing_at timestamptz,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,organization_id),
  unique (organization_id,whatsapp_number_id,contact_id),
  constraint conversations_number_fk
    foreign key (whatsapp_number_id,organization_id)
    references public.whatsapp_numbers(id,organization_id)
    on delete restrict,
  constraint conversations_contact_fk
    foreign key (contact_id,organization_id)
    references public.contacts(id,organization_id)
    on delete restrict,
  constraint conversations_channel_fk
    foreign key (contact_channel_id,organization_id)
    references public.contact_channels(id,organization_id)
    on delete set null (contact_channel_id),
  constraint conversations_assigned_user_fk
    foreign key (organization_id,assigned_user_id)
    references public.organization_members(organization_id,user_id)
    on delete set null (assigned_user_id),
  constraint conversations_assigned_team_fk
    foreign key (assigned_team_id,organization_id)
    references public.teams(id,organization_id)
    on delete set null (assigned_team_id)
);

create unique index uq_conversations_meta_id
  on public.conversations(whatsapp_number_id,meta_conversation_id)
  where meta_conversation_id is not null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null,
  whatsapp_number_id uuid not null,
  contact_id uuid,
  contact_channel_id uuid,
  meta_message_id text,
  direction text not null check (direction in ('incoming','outgoing','system')),
  message_type text not null,
  body text,
  caption text,
  reply_to_message_id uuid,
  meta_reply_to_message_id text,
  status text not null default 'received'
    check (status in ('received','queued','submitted','sent','delivered','read','failed','deleted','unknown')),
  error_code text,
  error_message text,
  interactive_payload jsonb not null default '{}'::jsonb,
  context_payload jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  meta_timestamp timestamptz,
  received_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,organization_id),
  constraint messages_conversation_fk
    foreign key (conversation_id,organization_id)
    references public.conversations(id,organization_id)
    on delete cascade,
  constraint messages_number_fk
    foreign key (whatsapp_number_id,organization_id)
    references public.whatsapp_numbers(id,organization_id)
    on delete restrict,
  constraint messages_contact_fk
    foreign key (contact_id,organization_id)
    references public.contacts(id,organization_id)
    on delete set null (contact_id),
  constraint messages_channel_fk
    foreign key (contact_channel_id,organization_id)
    references public.contact_channels(id,organization_id)
    on delete set null (contact_channel_id),
  constraint messages_reply_fk
    foreign key (reply_to_message_id,organization_id)
    references public.messages(id,organization_id)
    on delete set null (reply_to_message_id)
);

create unique index uq_messages_meta_message_id
  on public.messages(organization_id,meta_message_id)
  where meta_message_id is not null;

create table public.message_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id uuid not null,
  whatsapp_number_id uuid not null,
  status text not null
    check (status in ('received','queued','submitted','sent','delivered','read','failed','deleted','unknown')),
  meta_timestamp timestamptz,
  error_code text,
  error_message text,
  raw_payload jsonb not null default '{}'::jsonb,
  payload jsonb generated always as (raw_payload) stored,
  created_at timestamptz not null default now(),
  unique (id,organization_id),
  constraint message_status_history_message_fk
    foreign key (message_id,organization_id)
    references public.messages(id,organization_id)
    on delete cascade,
  constraint message_status_history_number_fk
    foreign key (whatsapp_number_id,organization_id)
    references public.whatsapp_numbers(id,organization_id)
    on delete restrict
);

create unique index uq_message_status_history_event
  on public.message_status_history(message_id,status,meta_timestamp)
  where meta_timestamp is not null;

-- --------------------------------------------------------------------------
-- 3) Media archive
-- --------------------------------------------------------------------------
create table public.media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_number_id uuid not null,
  message_id uuid not null,
  contact_id uuid,
  meta_media_id text,
  media_type text not null,
  mime_type text,
  filename text,
  file_size bigint check (file_size is null or file_size >= 0),
  sha256 text,
  storage_provider text not null default 'minio',
  storage_bucket text,
  storage_path text,
  download_status text not null default 'pending'
    check (download_status in ('pending','downloading','downloaded','failed','expired','deleted')),
  download_attempts integer not null default 0 check (download_attempts >= 0),
  last_error text,
  received_at timestamptz,
  stored_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,organization_id),
  constraint media_number_fk
    foreign key (whatsapp_number_id,organization_id)
    references public.whatsapp_numbers(id,organization_id)
    on delete restrict,
  constraint media_message_fk
    foreign key (message_id,organization_id)
    references public.messages(id,organization_id)
    on delete cascade,
  constraint media_contact_fk
    foreign key (contact_id,organization_id)
    references public.contacts(id,organization_id)
    on delete set null (contact_id)
);

create unique index uq_media_message_media_id
  on public.media(message_id,meta_media_id)
  where meta_media_id is not null;

-- --------------------------------------------------------------------------
-- 4) Campaigns
-- --------------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sender_whatsapp_number_id uuid not null,
  template_id uuid,
  audience jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft','scheduled','running','paused','completed','cancelled','failed')),
  rate_limit_per_minute integer not null default 60 check (rate_limit_per_minute > 0),
  stats jsonb not null default '{}'::jsonb,
  created_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,organization_id),
  constraint campaigns_sender_fk
    foreign key (sender_whatsapp_number_id,organization_id)
    references public.whatsapp_numbers(id,organization_id)
    on delete restrict,
  constraint campaigns_template_fk
    foreign key (template_id,organization_id)
    references public.templates(id,organization_id)
    on delete set null (template_id),
  constraint campaigns_created_by_fk
    foreign key (organization_id,created_by)
    references public.organization_members(organization_id,user_id)
    on delete set null (created_by)
);

create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null,
  contact_id uuid,
  recipient_address text not null,
  message_id uuid,
  request_payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued','submitted','sent','delivered','read','failed','cancelled')),
  error_code text,
  error_message text,
  idempotency_key text not null,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,organization_id),
  unique (organization_id,idempotency_key),
  unique (campaign_id,recipient_address),
  constraint campaign_recipients_campaign_fk
    foreign key (campaign_id,organization_id)
    references public.campaigns(id,organization_id)
    on delete cascade,
  constraint campaign_recipients_contact_fk
    foreign key (contact_id,organization_id)
    references public.contacts(id,organization_id)
    on delete set null (contact_id),
  constraint campaign_recipients_message_fk
    foreign key (message_id,organization_id)
    references public.messages(id,organization_id)
    on delete set null (message_id)
);

-- --------------------------------------------------------------------------
-- 5) Automation
-- --------------------------------------------------------------------------
create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  trigger_type text not null,
  is_enabled boolean not null default true,
  priority integer not null default 100,
  scope_business_portfolio_id uuid,
  scope_waba_id uuid,
  scope_whatsapp_number_id uuid,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,organization_id),
  constraint automation_rules_business_fk
    foreign key (scope_business_portfolio_id,organization_id)
    references public.business_portfolios(id,organization_id)
    on delete set null (scope_business_portfolio_id),
  constraint automation_rules_waba_fk
    foreign key (scope_waba_id,organization_id)
    references public.wabas(id,organization_id)
    on delete set null (scope_waba_id),
  constraint automation_rules_number_fk
    foreign key (scope_whatsapp_number_id,organization_id)
    references public.whatsapp_numbers(id,organization_id)
    on delete set null (scope_whatsapp_number_id),
  constraint automation_rules_created_by_fk
    foreign key (organization_id,created_by)
    references public.organization_members(organization_id,user_id)
    on delete set null (created_by)
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  automation_rule_id uuid not null,
  whatsapp_number_id uuid,
  conversation_id uuid,
  message_id uuid,
  trigger_payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued','running','completed','failed','skipped','cancelled')),
  error text,
  idempotency_key text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id,organization_id),
  constraint automation_runs_rule_fk
    foreign key (automation_rule_id,organization_id)
    references public.automation_rules(id,organization_id)
    on delete cascade,
  constraint automation_runs_number_fk
    foreign key (whatsapp_number_id,organization_id)
    references public.whatsapp_numbers(id,organization_id)
    on delete set null (whatsapp_number_id),
  constraint automation_runs_conversation_fk
    foreign key (conversation_id,organization_id)
    references public.conversations(id,organization_id)
    on delete set null (conversation_id),
  constraint automation_runs_message_fk
    foreign key (message_id,organization_id)
    references public.messages(id,organization_id)
    on delete set null (message_id)
);

create unique index uq_automation_runs_idempotency
  on public.automation_runs(organization_id,idempotency_key)
  where idempotency_key is not null;

-- --------------------------------------------------------------------------
-- 6) Webhook persistence
-- --------------------------------------------------------------------------
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webhook_endpoint_id uuid,
  meta_app_id uuid,
  business_portfolio_id uuid,
  waba_id uuid,
  whatsapp_number_id uuid,
  meta_waba_id text,
  meta_phone_number_id text,
  event_type text not null,
  field text generated always as (event_type) stored,
  meta_message_id text,
  deduplication_key text not null,
  signature_valid boolean not null default false,
  payload jsonb not null,
  status text not null default 'received'
    check (status in ('received','processing','processed','failed','ignored','unmapped_number_event')),
  attempts integer not null default 1 check (attempts > 0),
  error text,
  error_message text generated always as (error) stored,
  last_error text generated always as (error) stored,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id,deduplication_key),
  unique (id,organization_id),
  constraint webhook_events_endpoint_fk
    foreign key (webhook_endpoint_id,organization_id)
    references public.webhook_endpoints(id,organization_id)
    on delete set null (webhook_endpoint_id),
  constraint webhook_events_app_fk
    foreign key (meta_app_id,organization_id)
    references public.meta_apps(id,organization_id)
    on delete set null (meta_app_id),
  constraint webhook_events_business_fk
    foreign key (business_portfolio_id,organization_id)
    references public.business_portfolios(id,organization_id)
    on delete set null (business_portfolio_id),
  constraint webhook_events_waba_fk
    foreign key (waba_id,organization_id)
    references public.wabas(id,organization_id)
    on delete set null (waba_id),
  constraint webhook_events_number_fk
    foreign key (whatsapp_number_id,organization_id)
    references public.whatsapp_numbers(id,organization_id)
    on delete set null (whatsapp_number_id)
);

create table public.unmapped_number_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webhook_event_id uuid,
  meta_phone_number_id text not null,
  meta_waba_id text,
  display_phone_number text,
  payload jsonb not null default '{}'::jsonb,
  occurrences integer not null default 1 check (occurrences > 0),
  received_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_whatsapp_number_id uuid,
  unique (id,organization_id),
  constraint unmapped_number_events_webhook_fk
    foreign key (webhook_event_id,organization_id)
    references public.webhook_events(id,organization_id)
    on delete set null (webhook_event_id),
  constraint unmapped_number_events_resolved_number_fk
    foreign key (resolved_whatsapp_number_id,organization_id)
    references public.whatsapp_numbers(id,organization_id)
    on delete set null (resolved_whatsapp_number_id)
);

create unique index uq_unmapped_number_open
  on public.unmapped_number_events(organization_id,meta_phone_number_id)
  where resolved is false;

-- --------------------------------------------------------------------------
-- 7) API / errors / health / alerts
-- --------------------------------------------------------------------------
create table public.api_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  correlation_id text,
  request_id text,
  meta_app_id uuid,
  business_portfolio_id uuid,
  waba_id uuid,
  whatsapp_number_id uuid,
  endpoint text not null,
  method text not null,
  http_status integer,
  status_code integer generated always as (http_status) stored,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  meta_error_code text,
  meta_error_message text,
  error_message text generated always as (meta_error_message) stored,
  success boolean generated always as (
    http_status is not null and http_status between 200 and 299 and meta_error_code is null
  ) stored,
  request_meta jsonb not null default '{}'::jsonb,
  response_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id,organization_id),
  constraint api_requests_app_fk
    foreign key (meta_app_id,organization_id)
    references public.meta_apps(id,organization_id)
    on delete set null (meta_app_id),
  constraint api_requests_business_fk
    foreign key (business_portfolio_id,organization_id)
    references public.business_portfolios(id,organization_id)
    on delete set null (business_portfolio_id),
  constraint api_requests_waba_fk
    foreign key (waba_id,organization_id)
    references public.wabas(id,organization_id)
    on delete set null (waba_id),
  constraint api_requests_number_fk
    foreign key (whatsapp_number_id,organization_id)
    references public.whatsapp_numbers(id,organization_id)
    on delete set null (whatsapp_number_id)
);

create table public.api_errors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  api_request_id uuid,
  whatsapp_number_id uuid,
  waba_id uuid,
  error_type text,
  error_code text,
  title text,
  message text,
  raw_error jsonb not null default '{}'::jsonb,
  status text not null default 'open'
    check (status in ('open','acknowledged','resolved','ignored')),
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  occurrences integer generated always as (occurrence_count) stored,
  first_occurred_at timestamptz not null default now(),
  last_occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,organization_id),
  constraint api_errors_request_fk
    foreign key (api_request_id,organization_id)
    references public.api_requests(id,organization_id)
    on delete set null (api_request_id),
  constraint api_errors_number_fk
    foreign key (whatsapp_number_id,organization_id)
    references public.whatsapp_numbers(id,organization_id)
    on delete set null (whatsapp_number_id),
  constraint api_errors_waba_fk
    foreign key (waba_id,organization_id)
    references public.wabas(id,organization_id)
    on delete set null (waba_id)
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_portfolio_id uuid,
  waba_id uuid,
  whatsapp_number_id uuid,
  alert_type text not null,
  severity text not null check (severity in ('info','warning','critical')),
  title text not null,
  message text,
  status text not null default 'open'
    check (status in ('open','acknowledged','resolved','ignored')),
  source_entity_type text,
  source_entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id,organization_id),
  constraint alerts_business_fk
    foreign key (business_portfolio_id,organization_id)
    references public.business_portfolios(id,organization_id)
    on delete set null (business_portfolio_id),
  constraint alerts_waba_fk
    foreign key (waba_id,organization_id)
    references public.wabas(id,organization_id)
    on delete set null (waba_id),
  constraint alerts_number_fk
    foreign key (whatsapp_number_id,organization_id)
    references public.whatsapp_numbers(id,organization_id)
    on delete set null (whatsapp_number_id)
);

create table public.health_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_portfolio_id uuid,
  waba_id uuid,
  whatsapp_number_id uuid,
  component text not null,
  check_name text generated always as (component) stored,
  check_type text generated always as (component) stored,
  scope text generated always as (
    case
      when whatsapp_number_id is not null then 'number:' || whatsapp_number_id::text
      when waba_id is not null then 'waba:' || waba_id::text
      when business_portfolio_id is not null then 'business:' || business_portfolio_id::text
      else 'organization:' || organization_id::text
    end
  ) stored,
  status text not null
    check (status in ('healthy','warning','critical','offline','unknown')),
  score numeric(5,2),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  message text,
  detail text generated always as (message) stored,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id,organization_id),
  constraint health_business_fk
    foreign key (business_portfolio_id,organization_id)
    references public.business_portfolios(id,organization_id)
    on delete set null (business_portfolio_id),
  constraint health_waba_fk
    foreign key (waba_id,organization_id)
    references public.wabas(id,organization_id)
    on delete set null (waba_id),
  constraint health_number_fk
    foreign key (whatsapp_number_id,organization_id)
    references public.whatsapp_numbers(id,organization_id)
    on delete set null (whatsapp_number_id)
);

-- --------------------------------------------------------------------------
-- 8) Durable jobs / DLQ
-- --------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  queue_name text not null,
  job_type text not null,
  deduplication_key text,
  priority integer not null default 100,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued','running','completed','failed','cancelled')),
  attempt integer not null default 0 check (attempt >= 0),
  attempts integer generated always as (attempt) stored,
  max_attempts integer not null default 5 check (max_attempts > 0),
  available_at timestamptz not null default now(),
  run_after timestamptz generated always as (available_at) stored,
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error text,
  last_error text generated always as (error) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,organization_id)
);

create unique index uq_jobs_deduplication_key
  on public.jobs(organization_id,queue_name,deduplication_key)
  where deduplication_key is not null and status in ('queued','running','completed');

create table public.dead_letter_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  original_job_id uuid,
  queue_name text not null,
  job_type text not null,
  payload jsonb not null,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  error text generated always as (last_error) stored,
  failed_at timestamptz not null default now(),
  status text not null default 'open'
    check (status in ('open','retried','discarded','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,organization_id),
  constraint dead_letter_original_job_fk
    foreign key (original_job_id,organization_id)
    references public.jobs(id,organization_id)
    on delete set null (original_job_id)
);

-- --------------------------------------------------------------------------
-- 9) Meta sync runs
-- --------------------------------------------------------------------------
create table public.meta_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_portfolio_id uuid,
  waba_id uuid,
  whatsapp_number_id uuid,
  sync_type text not null
    check (sync_type in ('business','wabas','numbers','templates','flows','subscriptions','number_health','full')),
  status text not null default 'queued'
    check (status in ('queued','running','completed','partial','failed','cancelled')),
  requested_by uuid,
  stats jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id,organization_id),
  constraint meta_sync_business_fk
    foreign key (business_portfolio_id,organization_id)
    references public.business_portfolios(id,organization_id)
    on delete set null (business_portfolio_id),
  constraint meta_sync_waba_fk
    foreign key (waba_id,organization_id)
    references public.wabas(id,organization_id)
    on delete set null (waba_id),
  constraint meta_sync_number_fk
    foreign key (whatsapp_number_id,organization_id)
    references public.whatsapp_numbers(id,organization_id)
    on delete set null (whatsapp_number_id),
  constraint meta_sync_requested_by_fk
    foreign key (organization_id,requested_by)
    references public.organization_members(organization_id,user_id)
    on delete set null (requested_by)
);

-- --------------------------------------------------------------------------
-- 10) Durable outbound messaging
-- --------------------------------------------------------------------------
create table public.message_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_number_id uuid not null,
  contact_id uuid,
  conversation_id uuid,
  campaign_id uuid,
  campaign_recipient_id uuid,
  recipient_address text not null,
  message_type text not null,
  request_payload jsonb not null,
  idempotency_key text not null,
  status text not null default 'queued'
    check (status in ('queued','sending','submitted','sent','delivered','read','failed','cancelled')),
  meta_message_id text,
  requested_by uuid,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,idempotency_key),
  unique (id,organization_id),
  constraint message_outbox_number_fk
    foreign key (whatsapp_number_id,organization_id)
    references public.whatsapp_numbers(id,organization_id)
    on delete restrict,
  constraint message_outbox_contact_fk
    foreign key (contact_id,organization_id)
    references public.contacts(id,organization_id)
    on delete set null (contact_id),
  constraint message_outbox_conversation_fk
    foreign key (conversation_id,organization_id)
    references public.conversations(id,organization_id)
    on delete set null (conversation_id),
  constraint message_outbox_campaign_fk
    foreign key (campaign_id,organization_id)
    references public.campaigns(id,organization_id)
    on delete set null (campaign_id),
  constraint message_outbox_campaign_recipient_fk
    foreign key (campaign_recipient_id,organization_id)
    references public.campaign_recipients(id,organization_id)
    on delete set null (campaign_recipient_id),
  constraint message_outbox_requested_by_fk
    foreign key (organization_id,requested_by)
    references public.organization_members(organization_id,user_id)
    on delete set null (requested_by)
);

create table public.message_send_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  outbox_id uuid not null,
  api_request_id uuid,
  attempt_no integer not null check (attempt_no > 0),
  status text not null check (status in ('started','submitted','failed')),
  http_status integer,
  error_code text,
  error_message text,
  response_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (outbox_id,attempt_no),
  unique (id,organization_id),
  constraint message_send_attempts_outbox_fk
    foreign key (outbox_id,organization_id)
    references public.message_outbox(id,organization_id)
    on delete cascade,
  constraint message_send_attempts_request_fk
    foreign key (api_request_id,organization_id)
    references public.api_requests(id,organization_id)
    on delete set null (api_request_id)
);

create table public.webhook_event_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webhook_event_id uuid not null,
  attempt_no integer not null check (attempt_no > 0),
  status text not null check (status in ('started','processed','failed','ignored')),
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (webhook_event_id,attempt_no),
  unique (id,organization_id),
  constraint webhook_event_attempts_event_fk
    foreign key (webhook_event_id,organization_id)
    references public.webhook_events(id,organization_id)
    on delete cascade
);

create table public.media_download_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  media_id uuid not null,
  attempt_no integer not null check (attempt_no > 0),
  status text not null check (status in ('started','stored','failed')),
  http_status integer,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (media_id,attempt_no),
  unique (id,organization_id),
  constraint media_download_attempts_media_fk
    foreign key (media_id,organization_id)
    references public.media(id,organization_id)
    on delete cascade
);

-- --------------------------------------------------------------------------
-- 11) Audit + settings
-- --------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid,
  actor_id uuid generated always as (actor_user_id) stored,
  business_portfolio_id uuid,
  waba_id uuid,
  whatsapp_number_id uuid,
  action text not null,
  entity_type text not null,
  resource_type text generated always as (entity_type) stored,
  entity_id text,
  resource_id text generated always as (entity_id) stored,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  user_agent text,
  correlation_id text,
  created_at timestamptz not null default now(),
  unique (id,organization_id),
  constraint audit_actor_fk
    foreign key (organization_id,actor_user_id)
    references public.organization_members(organization_id,user_id)
    on delete set null (actor_user_id),
  constraint audit_business_fk
    foreign key (business_portfolio_id,organization_id)
    references public.business_portfolios(id,organization_id)
    on delete set null (business_portfolio_id),
  constraint audit_waba_fk
    foreign key (waba_id,organization_id)
    references public.wabas(id,organization_id)
    on delete set null (waba_id),
  constraint audit_number_fk
    foreign key (whatsapp_number_id,organization_id)
    references public.whatsapp_numbers(id,organization_id)
    on delete set null (whatsapp_number_id)
);

create table public.system_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,key),
  constraint system_settings_updated_by_fk
    foreign key (organization_id,updated_by)
    references public.organization_members(organization_id,user_id)
    on delete set null (updated_by)
);

-- --------------------------------------------------------------------------
-- 12) Covering indexes for every FK / hot operational path
-- --------------------------------------------------------------------------
create index idx_contacts_assigned_user on public.contacts(organization_id,assigned_user_id);
create index idx_contacts_assigned_team on public.contacts(assigned_team_id,organization_id);
create index idx_contacts_org_last_interaction on public.contacts(organization_id,last_interaction_at desc);

create index idx_contact_channels_contact on public.contact_channels(contact_id,organization_id);

create index idx_conversations_number on public.conversations(whatsapp_number_id,organization_id);
create index idx_conversations_contact on public.conversations(contact_id,organization_id);
create index idx_conversations_channel on public.conversations(contact_channel_id,organization_id);
create index idx_conversations_assigned_user on public.conversations(organization_id,assigned_user_id);
create index idx_conversations_assigned_team on public.conversations(assigned_team_id,organization_id);
create index idx_conversations_number_status_last on public.conversations(whatsapp_number_id,status,last_message_at desc);

create index idx_messages_conversation on public.messages(conversation_id,organization_id);
create index idx_messages_number on public.messages(whatsapp_number_id,organization_id);
create index idx_messages_contact on public.messages(contact_id,organization_id);
create index idx_messages_channel on public.messages(contact_channel_id,organization_id);
create index idx_messages_reply on public.messages(reply_to_message_id,organization_id);
create index idx_messages_conversation_created on public.messages(conversation_id,created_at desc);
create index idx_messages_number_created on public.messages(whatsapp_number_id,created_at desc);

create index idx_status_history_message on public.message_status_history(message_id,organization_id);
create index idx_status_history_number on public.message_status_history(whatsapp_number_id,organization_id);

create index idx_media_number on public.media(whatsapp_number_id,organization_id);
create index idx_media_message on public.media(message_id,organization_id);
create index idx_media_contact on public.media(contact_id,organization_id);
create index idx_media_number_received on public.media(whatsapp_number_id,received_at desc);

create index idx_campaigns_sender on public.campaigns(sender_whatsapp_number_id,organization_id);
create index idx_campaigns_template on public.campaigns(template_id,organization_id);
create index idx_campaigns_created_by on public.campaigns(organization_id,created_by);
create index idx_campaigns_status_schedule on public.campaigns(organization_id,status,scheduled_at);

create index idx_campaign_recipients_campaign on public.campaign_recipients(campaign_id,organization_id);
create index idx_campaign_recipients_contact on public.campaign_recipients(contact_id,organization_id);
create index idx_campaign_recipients_message on public.campaign_recipients(message_id,organization_id);
create index idx_campaign_recipients_status on public.campaign_recipients(campaign_id,status,created_at);

create index idx_automation_rules_business on public.automation_rules(scope_business_portfolio_id,organization_id);
create index idx_automation_rules_waba on public.automation_rules(scope_waba_id,organization_id);
create index idx_automation_rules_number on public.automation_rules(scope_whatsapp_number_id,organization_id);
create index idx_automation_rules_created_by on public.automation_rules(organization_id,created_by);
create index idx_automation_rules_enabled_trigger on public.automation_rules(organization_id,is_enabled,trigger_type,priority);

create index idx_automation_runs_rule on public.automation_runs(automation_rule_id,organization_id);
create index idx_automation_runs_number on public.automation_runs(whatsapp_number_id,organization_id);
create index idx_automation_runs_conversation on public.automation_runs(conversation_id,organization_id);
create index idx_automation_runs_message on public.automation_runs(message_id,organization_id);

create index idx_webhook_events_endpoint on public.webhook_events(webhook_endpoint_id,organization_id);
create index idx_webhook_events_app on public.webhook_events(meta_app_id,organization_id);
create index idx_webhook_events_business on public.webhook_events(business_portfolio_id,organization_id);
create index idx_webhook_events_waba on public.webhook_events(waba_id,organization_id);
create index idx_webhook_events_number on public.webhook_events(whatsapp_number_id,organization_id);
create index idx_webhook_events_status_received on public.webhook_events(status,received_at desc);

create index idx_unmapped_event on public.unmapped_number_events(webhook_event_id,organization_id);
create index idx_unmapped_resolved_number on public.unmapped_number_events(resolved_whatsapp_number_id,organization_id);

create index idx_api_requests_app on public.api_requests(meta_app_id,organization_id);
create index idx_api_requests_business on public.api_requests(business_portfolio_id,organization_id);
create index idx_api_requests_waba on public.api_requests(waba_id,organization_id);
create index idx_api_requests_number on public.api_requests(whatsapp_number_id,organization_id);
create index idx_api_requests_created on public.api_requests(organization_id,created_at desc);
create index idx_api_requests_http on public.api_requests(http_status,created_at desc);

create index idx_api_errors_request on public.api_errors(api_request_id,organization_id);
create index idx_api_errors_number on public.api_errors(whatsapp_number_id,organization_id);
create index idx_api_errors_waba on public.api_errors(waba_id,organization_id);
create index idx_api_errors_open on public.api_errors(organization_id,status,last_occurred_at desc);

create index idx_alerts_business on public.alerts(business_portfolio_id,organization_id);
create index idx_alerts_waba on public.alerts(waba_id,organization_id);
create index idx_alerts_number on public.alerts(whatsapp_number_id,organization_id);
create index idx_alerts_open on public.alerts(organization_id,status,severity,created_at desc);

create index idx_health_business on public.health_checks(business_portfolio_id,organization_id);
create index idx_health_waba on public.health_checks(waba_id,organization_id);
create index idx_health_number on public.health_checks(whatsapp_number_id,organization_id);
create index idx_health_component on public.health_checks(organization_id,component,checked_at desc);

create index idx_jobs_dispatch on public.jobs(queue_name,status,available_at,priority,created_at);
create index idx_dead_letter_original on public.dead_letter_jobs(original_job_id,organization_id);
create index idx_dead_letter_open on public.dead_letter_jobs(organization_id,status,failed_at desc);

create index idx_meta_sync_business on public.meta_sync_runs(business_portfolio_id,organization_id);
create index idx_meta_sync_waba on public.meta_sync_runs(waba_id,organization_id);
create index idx_meta_sync_number on public.meta_sync_runs(whatsapp_number_id,organization_id);
create index idx_meta_sync_requested_by on public.meta_sync_runs(organization_id,requested_by);
create index idx_meta_sync_scope_created on public.meta_sync_runs(organization_id,sync_type,created_at desc);

create index idx_outbox_number on public.message_outbox(whatsapp_number_id,organization_id);
create index idx_outbox_contact on public.message_outbox(contact_id,organization_id);
create index idx_outbox_conversation on public.message_outbox(conversation_id,organization_id);
create index idx_outbox_campaign on public.message_outbox(campaign_id,organization_id);
create index idx_outbox_campaign_recipient on public.message_outbox(campaign_recipient_id,organization_id);
create index idx_outbox_requested_by on public.message_outbox(organization_id,requested_by);
create index idx_outbox_dispatch on public.message_outbox(status,next_attempt_at,created_at);

create index idx_send_attempt_outbox on public.message_send_attempts(outbox_id,organization_id);
create index idx_send_attempt_request on public.message_send_attempts(api_request_id,organization_id);
create index idx_webhook_attempt_event on public.webhook_event_attempts(webhook_event_id,organization_id);
create index idx_media_attempt_media on public.media_download_attempts(media_id,organization_id);

create index idx_audit_actor on public.audit_logs(organization_id,actor_user_id);
create index idx_audit_business on public.audit_logs(business_portfolio_id,organization_id);
create index idx_audit_waba on public.audit_logs(waba_id,organization_id);
create index idx_audit_number on public.audit_logs(whatsapp_number_id,organization_id);
create index idx_audit_created on public.audit_logs(organization_id,created_at desc);

create index idx_settings_updated_by on public.system_settings(organization_id,updated_by);

-- --------------------------------------------------------------------------
-- 13) updated_at triggers
-- --------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'contacts','contact_channels','conversations','messages','media',
    'campaigns','campaign_recipients','automation_rules',
    'api_errors','alerts','jobs','dead_letter_jobs','message_outbox','audit_logs','system_settings'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      'trg_' || t || '_updated_at', t
    );
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- 14) Permission helpers
-- --------------------------------------------------------------------------
create or replace function private.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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

create or replace function private.can_dispatch_number(p_number_id uuid,p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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

create or replace function private.can_manage_number(
  p_number_id uuid,p_permission text default 'numbers.manage'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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

create or replace function private.can_manage_waba(
  p_waba_id uuid,p_permission text default 'wabas.manage'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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

create or replace function public.azwa_can_send_number(p_number_id uuid)
returns boolean language sql stable security invoker set search_path=''
as $$ select private.can_dispatch_number(p_number_id,'messages.send'); $$;

create or replace function public.azwa_can_dispatch_number(p_number_id uuid,p_permission text)
returns boolean language sql stable security invoker set search_path=''
as $$ select private.can_dispatch_number(p_number_id,p_permission); $$;

create or replace function public.azwa_can_manage_number(
  p_number_id uuid,p_permission text default 'numbers.manage'
)
returns boolean language sql stable security invoker set search_path=''
as $$ select private.can_manage_number(p_number_id,p_permission); $$;

create or replace function public.azwa_can_manage_waba(
  p_waba_id uuid,p_permission text default 'wabas.manage'
)
returns boolean language sql stable security invoker set search_path=''
as $$ select private.can_manage_waba(p_waba_id,p_permission); $$;

create or replace function public.azwa_has_org_permission(p_org_id uuid,p_permission text)
returns boolean language sql stable security invoker set search_path=''
as $$ select private.is_org_member(p_org_id) and private.has_org_permission(p_org_id,p_permission); $$;

-- --------------------------------------------------------------------------
-- 15) Contact / conversation helpers
-- --------------------------------------------------------------------------
create or replace function private.normalize_wa_address(p_value text)
returns text
language sql
immutable
set search_path=''
as $$
  select nullif(regexp_replace(coalesce(p_value,''),'[^0-9]','','g'),'');
$$;

create or replace function private.ensure_contact_channel(
  p_organization_id uuid,
  p_address text,
  p_wa_id text default null,
  p_profile_name text default null
)
returns table(contact_id uuid,channel_id uuid)
language plpgsql
security definer
set search_path=''
as $$
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

create or replace function private.ensure_conversation(
  p_organization_id uuid,
  p_whatsapp_number_id uuid,
  p_contact_id uuid,
  p_contact_channel_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
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

-- --------------------------------------------------------------------------
-- 16) Vault-backed credentials
-- --------------------------------------------------------------------------
create or replace function private.decrypt_secret_reference(p_secret_reference text)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
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
$$;

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
set search_path=''
as $$
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
$$;

create or replace function public.backend_resolve_meta_token(
  p_whatsapp_number_id uuid default null,
  p_waba_id uuid default null,
  p_business_portfolio_id uuid default null
)
returns table(credential_id uuid,token text,credential_type text)
language plpgsql
security definer
set search_path=''
as $$
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
set search_path=''
as $$
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

create or replace function public.backend_decrypt_secret_reference(p_secret_reference text)
returns text
language sql
stable
security definer
set search_path=''
as $$ select private.decrypt_secret_reference(p_secret_reference); $$;

-- --------------------------------------------------------------------------
-- 17) Job queue RPCs
-- --------------------------------------------------------------------------
create or replace function public.backend_claim_jobs(
  p_worker_id text,p_queue_names text[],p_limit integer default 20
)
returns setof public.jobs
language sql
security definer
set search_path=''
as $$
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

create or replace function public.backend_complete_job(p_job_id uuid)
returns void
language sql
security definer
set search_path=''
as $$
  update public.jobs
  set status='completed',completed_at=now(),locked_at=null,locked_by=null,error=null,updated_at=now()
  where id=p_job_id;
$$;

create or replace function public.backend_fail_job(
  p_job_id uuid,p_error text,p_retry_after_seconds integer default 30
)
returns text
language plpgsql
security definer
set search_path=''
as $$
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

create or replace function public.backend_requeue_stale_jobs(
  p_older_than_seconds integer default 300
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
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

-- --------------------------------------------------------------------------
-- 18) Webhook RPCs
-- --------------------------------------------------------------------------
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
set search_path=''
as $$
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

create or replace function public.backend_finalize_webhook_event(
  p_event_id uuid,p_success boolean,p_error text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
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

-- --------------------------------------------------------------------------
-- 19) Inbound message + status RPCs
-- --------------------------------------------------------------------------
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
set search_path=''
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
$$;

create or replace function public.backend_apply_message_status(
  p_organization_id uuid,
  p_meta_phone_number_id text,
  p_status jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
$$;

-- --------------------------------------------------------------------------
-- 20) Outbox RPCs
-- --------------------------------------------------------------------------
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
set search_path=''
as $$
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

create or replace function public.backend_finalize_outbox_success(
  p_outbox_id uuid,
  p_meta_message_id text,
  p_raw_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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

create or replace function public.backend_finalize_outbox_failure(
  p_outbox_id uuid,p_error text,p_final boolean default false
)
returns void
language plpgsql
security definer
set search_path=''
as $$
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

-- --------------------------------------------------------------------------
-- 21) Campaign enqueue
-- --------------------------------------------------------------------------
create or replace function public.backend_enqueue_campaign(
  p_campaign_id uuid,p_requested_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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

create or replace function private.refresh_campaign_stats()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
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

create trigger trg_campaign_recipient_stats_insert_delete
after insert or delete on public.campaign_recipients
for each row execute function private.refresh_campaign_stats();

create trigger trg_campaign_recipient_stats_status_update
after update of status on public.campaign_recipients
for each row
when (old.status is distinct from new.status)
execute function private.refresh_campaign_stats();

-- --------------------------------------------------------------------------
-- 22) Automation queue primitive
-- --------------------------------------------------------------------------
create or replace function public.backend_enqueue_automation(
  p_rule_id uuid,
  p_trigger_payload jsonb,
  p_whatsapp_number_id uuid default null,
  p_conversation_id uuid default null,
  p_message_id uuid default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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

-- --------------------------------------------------------------------------
-- 23) Security: RLS + explicit server-only data-plane access
-- --------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'contacts','contact_channels','conversations','messages','message_status_history','media',
    'campaigns','campaign_recipients','automation_rules','automation_runs',
    'webhook_events','unmapped_number_events','api_requests','api_errors','alerts','health_checks',
    'jobs','dead_letter_jobs','meta_sync_runs','message_outbox','message_send_attempts',
    'webhook_event_attempts','media_download_attempts','audit_logs','system_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all privileges on table public.%I from anon, authenticated',t);
    execute format('grant select,insert,update,delete on table public.%I to service_role',t);
    execute format(
      'create policy no_direct_client_access on public.%I as permissive for all to anon, authenticated using (false) with check (false)',
      t
    );
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- 24) Function grants
-- --------------------------------------------------------------------------
revoke all on function private.is_org_admin(uuid) from public,anon,authenticated;
revoke all on function private.can_dispatch_number(uuid,text) from public,anon,authenticated;
revoke all on function private.can_manage_number(uuid,text) from public,anon,authenticated;
revoke all on function private.can_manage_waba(uuid,text) from public,anon,authenticated;
revoke all on function private.normalize_wa_address(text) from public,anon;
revoke all on function private.ensure_contact_channel(uuid,text,text,text) from public,anon,authenticated;
revoke all on function private.ensure_conversation(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function private.decrypt_secret_reference(text) from public,anon,authenticated;
revoke all on function private.refresh_campaign_stats() from public,anon,authenticated;

grant execute on function private.is_org_admin(uuid) to authenticated,service_role;
grant execute on function private.can_dispatch_number(uuid,text) to authenticated,service_role;
grant execute on function private.can_manage_number(uuid,text) to authenticated,service_role;
grant execute on function private.can_manage_waba(uuid,text) to authenticated,service_role;
grant execute on function private.normalize_wa_address(text) to authenticated,service_role;
grant execute on function private.ensure_contact_channel(uuid,text,text,text) to service_role;
grant execute on function private.ensure_conversation(uuid,uuid,uuid,uuid) to service_role;
grant execute on function private.decrypt_secret_reference(text) to service_role;

revoke all on function public.azwa_can_send_number(uuid) from public,anon;
revoke all on function public.azwa_can_dispatch_number(uuid,text) from public,anon;
revoke all on function public.azwa_can_manage_number(uuid,text) from public,anon;
revoke all on function public.azwa_can_manage_waba(uuid,text) from public,anon;
revoke all on function public.azwa_has_org_permission(uuid,text) from public,anon;

grant execute on function public.azwa_can_send_number(uuid) to authenticated,service_role;
grant execute on function public.azwa_can_dispatch_number(uuid,text) to authenticated,service_role;
grant execute on function public.azwa_can_manage_number(uuid,text) to authenticated,service_role;
grant execute on function public.azwa_can_manage_waba(uuid,text) to authenticated,service_role;
grant execute on function public.azwa_has_org_permission(uuid,text) to authenticated,service_role;

revoke all on function public.backend_store_meta_credential(uuid,text,text,text,uuid,uuid,uuid,uuid,text[],timestamptz) from public,anon,authenticated;
revoke all on function public.backend_resolve_meta_token(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.backend_list_webhook_secrets() from public,anon,authenticated;
revoke all on function public.backend_decrypt_secret_reference(text) from public,anon,authenticated;
revoke all on function public.backend_claim_jobs(text,text[],integer) from public,anon,authenticated;
revoke all on function public.backend_complete_job(uuid) from public,anon,authenticated;
revoke all on function public.backend_fail_job(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.backend_requeue_stale_jobs(integer) from public,anon,authenticated;
revoke all on function public.backend_ingest_webhook_event(uuid,uuid,uuid,text,text,text,text,text,boolean,jsonb) from public,anon,authenticated;
revoke all on function public.backend_finalize_webhook_event(uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.backend_ingest_inbound_message(uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.backend_apply_message_status(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.backend_create_outbox(uuid,text,text,jsonb,text,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.backend_finalize_outbox_success(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.backend_finalize_outbox_failure(uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.backend_enqueue_campaign(uuid,uuid) from public,anon,authenticated;
revoke all on function public.backend_enqueue_automation(uuid,jsonb,uuid,uuid,uuid,text) from public,anon,authenticated;

grant execute on function public.backend_store_meta_credential(uuid,text,text,text,uuid,uuid,uuid,uuid,text[],timestamptz) to service_role;
grant execute on function public.backend_resolve_meta_token(uuid,uuid,uuid) to service_role;
grant execute on function public.backend_list_webhook_secrets() to service_role;
grant execute on function public.backend_decrypt_secret_reference(text) to service_role;
grant execute on function public.backend_claim_jobs(text,text[],integer) to service_role;
grant execute on function public.backend_complete_job(uuid) to service_role;
grant execute on function public.backend_fail_job(uuid,text,integer) to service_role;
grant execute on function public.backend_requeue_stale_jobs(integer) to service_role;
grant execute on function public.backend_ingest_webhook_event(uuid,uuid,uuid,text,text,text,text,text,boolean,jsonb) to service_role;
grant execute on function public.backend_finalize_webhook_event(uuid,boolean,text) to service_role;
grant execute on function public.backend_ingest_inbound_message(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.backend_apply_message_status(uuid,text,jsonb) to service_role;
grant execute on function public.backend_create_outbox(uuid,text,text,jsonb,text,uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.backend_finalize_outbox_success(uuid,text,jsonb) to service_role;
grant execute on function public.backend_finalize_outbox_failure(uuid,text,boolean) to service_role;
grant execute on function public.backend_enqueue_campaign(uuid,uuid) to service_role;
grant execute on function public.backend_enqueue_automation(uuid,jsonb,uuid,uuid,uuid,text) to service_role;

-- --------------------------------------------------------------------------
-- 25) Settings + operational views
-- --------------------------------------------------------------------------
insert into public.system_settings(organization_id,key,value,description)
select o.id,'messaging_runtime',
       jsonb_build_object(
         'webhook_mode','synchronous_ingest',
         'message_queue','message-send',
         'media_queue','media-downloads',
         'automation_queue','automation'
       ),
       'AzWA operational runtime queues'
from public.organizations o
where o.slug='alazab-group'
on conflict (organization_id,key) do update
set value=excluded.value,description=excluded.description,updated_at=now();

create or replace view public.v_whatsapp_structure
with (security_invoker=true) as
select
  o.id organization_id,o.name organization_name,
  bp.id business_portfolio_id,bp.meta_business_id,bp.name business_name,
  w.id waba_id,w.meta_waba_id,w.name waba_name,
  n.id whatsapp_number_id,n.meta_phone_number_id,n.display_phone_number,
  n.normalized_phone_number,n.verified_name,n.internal_name,n.status,n.is_enabled,
  n.quality_rating,n.messaging_limit,n.webhook_status,
  n.last_incoming_message_at,n.last_outgoing_message_at
from public.organizations o
join public.business_portfolios bp on bp.organization_id=o.id
join public.wabas w on w.organization_id=o.id and w.business_portfolio_id=bp.id
join public.whatsapp_numbers n on n.organization_id=o.id and n.waba_id=w.id;

create or replace view public.v_number_message_stats_24h
with (security_invoker=true) as
select
  n.organization_id,n.id whatsapp_number_id,n.display_phone_number,
  count(m.id) filter(where m.direction='incoming') incoming_24h,
  count(m.id) filter(where m.direction='outgoing') outgoing_24h,
  count(m.id) filter(where m.status='failed') failed_24h,
  count(m.id) total_24h
from public.whatsapp_numbers n
left join public.messages m
  on m.organization_id=n.organization_id and m.whatsapp_number_id=n.id
 and m.created_at>=now()-interval '24 hours'
group by n.organization_id,n.id,n.display_phone_number;

revoke all on public.v_whatsapp_structure from anon,authenticated;
revoke all on public.v_number_message_stats_24h from anon,authenticated;
grant select on public.v_whatsapp_structure to service_role;
grant select on public.v_number_message_stats_24h to service_role;

commit;

-- ============================================================================
-- Verification: expected runtime_tables=25, policies=25
-- ============================================================================
select count(*) as runtime_tables
from pg_catalog.pg_tables
where schemaname='public'
  and tablename=any(array[
    'contacts','contact_channels','conversations','messages','message_status_history','media',
    'campaigns','campaign_recipients','automation_rules','automation_runs',
    'webhook_events','unmapped_number_events','api_requests','api_errors','alerts','health_checks',
    'jobs','dead_letter_jobs','meta_sync_runs','message_outbox','message_send_attempts',
    'webhook_event_attempts','media_download_attempts','audit_logs','system_settings'
  ]);

select count(*) as runtime_deny_policies
from pg_catalog.pg_policies
where schemaname='public'
  and policyname='no_direct_client_access'
  and tablename=any(array[
    'contacts','contact_channels','conversations','messages','message_status_history','media',
    'campaigns','campaign_recipients','automation_rules','automation_runs',
    'webhook_events','unmapped_number_events','api_requests','api_errors','alerts','health_checks',
    'jobs','dead_letter_jobs','meta_sync_runs','message_outbox','message_send_attempts',
    'webhook_event_attempts','media_download_attempts','audit_logs','system_settings'
  ]);

select grantee,table_name,privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and grantee in ('anon','authenticated')
  and table_name=any(array[
    'contacts','contact_channels','conversations','messages','message_status_history','media',
    'campaigns','campaign_recipients','automation_rules','automation_runs',
    'webhook_events','unmapped_number_events','api_requests','api_errors','alerts','health_checks',
    'jobs','dead_letter_jobs','meta_sync_runs','message_outbox','message_send_attempts',
    'webhook_event_attempts','media_download_attempts','audit_logs','system_settings'
  ])
order by table_name,grantee,privilege_type;
