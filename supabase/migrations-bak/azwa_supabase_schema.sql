-- AzWA WhatsApp Business Operations OS
-- Supabase / PostgreSQL 17 compatible schema
-- Production multi-tenant, multi-Business, multi-WABA, multi-number design

begin;

-- ============================================================
-- 0) Extensions
-- ============================================================
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ============================================================
-- 1) Utility functions
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 2) Identity / organization / RBAC
-- ============================================================
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  locale text not null default 'ar',
  timezone text not null default 'Africa/Cairo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('invited','active','suspended','removed')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, role_id)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_lead boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- ============================================================
-- 3) Meta / WhatsApp control plane
-- ============================================================
create table if not exists public.business_portfolios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meta_business_id text not null,
  name text,
  status text not null default 'active' check (status in ('active','inactive','missing_from_meta','requires_review','archived')),
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, meta_business_id)
);

create unique index if not exists uq_business_portfolios_primary_per_org
  on public.business_portfolios(organization_id)
  where is_primary;

create table if not exists public.meta_apps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_portfolio_id uuid references public.business_portfolios(id) on delete set null,
  meta_app_id text not null,
  display_name text not null,
  namespace text,
  app_domains text[] not null default '{}',
  privacy_policy_url text,
  terms_url text,
  data_deletion_url text,
  status text not null default 'active' check (status in ('active','inactive','review','restricted','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, meta_app_id)
);

create table if not exists public.wabas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_portfolio_id uuid not null references public.business_portfolios(id) on delete cascade,
  meta_waba_id text not null,
  name text,
  currency text,
  timezone text,
  account_review_status text,
  business_verification_status text,
  status text not null default 'active' check (status in ('active','inactive','missing_from_meta','requires_review','restricted','archived')),
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, meta_waba_id)
);

create table if not exists public.meta_app_wabas (
  meta_app_id uuid not null references public.meta_apps(id) on delete cascade,
  waba_id uuid not null references public.wabas(id) on delete cascade,
  status text not null default 'active' check (status in ('active','inactive','pending','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (meta_app_id, waba_id)
);

create table if not exists public.whatsapp_numbers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  waba_id uuid not null references public.wabas(id) on delete cascade,
  meta_phone_number_id text not null,
  display_phone_number text,
  normalized_phone_number text,
  verified_name text,
  internal_name text,
  department text,
  country text,
  purpose text,
  tags text[] not null default '{}',
  code_verification_status text,
  quality_rating text,
  platform_type text,
  throughput_level text,
  messaging_limit text,
  status text not null default 'active' check (status in ('active','inactive','missing_from_meta','requires_review','restricted','disconnected','archived')),
  is_enabled boolean not null default true,
  is_default boolean not null default false,
  timezone text,
  default_language text default 'ar',
  webhook_status text,
  last_incoming_message_at timestamptz,
  last_outgoing_message_at timestamptz,
  last_api_success_at timestamptz,
  last_api_failure_at timestamptz,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, meta_phone_number_id)
);

create unique index if not exists uq_whatsapp_numbers_e164_per_org
  on public.whatsapp_numbers(organization_id, normalized_phone_number)
  where normalized_phone_number is not null;

create unique index if not exists uq_whatsapp_numbers_default_per_org
  on public.whatsapp_numbers(organization_id)
  where is_default;

create table if not exists public.meta_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meta_app_id uuid references public.meta_apps(id) on delete cascade,
  business_portfolio_id uuid references public.business_portfolios(id) on delete cascade,
  waba_id uuid references public.wabas(id) on delete cascade,
  whatsapp_number_id uuid references public.whatsapp_numbers(id) on delete cascade,
  credential_type text not null check (credential_type in ('system_user_token','user_token','app_secret','verify_token','access_token','other')),
  name text not null,
  secret_reference text not null,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active','expired','revoked','invalid','inactive')),
  last_verified_at timestamptz,
  last_used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Scope access tables
create table if not exists public.user_business_access (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  business_portfolio_id uuid not null references public.business_portfolios(id) on delete cascade,
  can_read boolean not null default true,
  can_manage boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, business_portfolio_id)
);

create table if not exists public.user_waba_access (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  waba_id uuid not null references public.wabas(id) on delete cascade,
  can_read boolean not null default true,
  can_manage boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, waba_id)
);

create table if not exists public.user_number_access (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  whatsapp_number_id uuid not null references public.whatsapp_numbers(id) on delete cascade,
  can_read boolean not null default true,
  can_send boolean not null default false,
  can_manage boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, whatsapp_number_id)
);

create table if not exists public.team_number_access (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  whatsapp_number_id uuid not null references public.whatsapp_numbers(id) on delete cascade,
  can_read boolean not null default true,
  can_send boolean not null default false,
  can_manage boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (team_id, whatsapp_number_id)
);

-- ============================================================
-- 4) Contacts / CRM
-- ============================================================
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text,
  first_name text,
  last_name text,
  email text,
  company text,
  source text,
  status text not null default 'active' check (status in ('active','blocked','archived')),
  assigned_user_id uuid references auth.users(id) on delete set null,
  assigned_team_id uuid references public.teams(id) on delete set null,
  notes text,
  custom_fields jsonb not null default '{}'::jsonb,
  first_interaction_at timestamptz,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel_type text not null default 'whatsapp' check (channel_type in ('whatsapp','phone','email','other')),
  address text not null,
  normalized_address text,
  wa_id text,
  profile_name text,
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_contact_channels_whatsapp_address
  on public.contact_channels(organization_id, channel_type, normalized_address)
  where normalized_address is not null;

create unique index if not exists uq_contact_channels_wa_id
  on public.contact_channels(organization_id, wa_id)
  where wa_id is not null;

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color_key text,
  category text,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.contact_tags (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag_id)
);

create table if not exists public.contact_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  whatsapp_number_id uuid references public.whatsapp_numbers(id) on delete set null,
  consent_type text not null check (consent_type in ('marketing','service','transactional','other')),
  status text not null check (status in ('opt_in','opt_out','unknown')),
  source text,
  evidence jsonb not null default '{}'::jsonb,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 5) Conversations / messages
-- ============================================================
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_number_id uuid not null references public.whatsapp_numbers(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  contact_channel_id uuid references public.contact_channels(id) on delete set null,
  meta_conversation_id text,
  category text,
  status text not null default 'open' check (status in ('open','pending','waiting_customer','resolved','closed','spam')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_user_id uuid references auth.users(id) on delete set null,
  assigned_team_id uuid references public.teams(id) on delete set null,
  last_message_at timestamptz,
  last_incoming_at timestamptz,
  last_outgoing_at timestamptz,
  unread_count integer not null default 0 check (unread_count >= 0),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversations_number_status_last
  on public.conversations(whatsapp_number_id, status, last_message_at desc);
create index if not exists idx_conversations_contact
  on public.conversations(contact_id, last_message_at desc);
create unique index if not exists uq_conversations_meta_id
  on public.conversations(whatsapp_number_id, meta_conversation_id)
  where meta_conversation_id is not null;

create table if not exists public.conversation_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  assigned_user_id uuid references auth.users(id) on delete set null,
  assigned_team_id uuid references public.teams(id) on delete set null,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  reason text
);

create table if not exists public.conversation_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  whatsapp_number_id uuid not null references public.whatsapp_numbers(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  contact_channel_id uuid references public.contact_channels(id) on delete set null,
  meta_message_id text,
  direction text not null check (direction in ('incoming','outgoing','system')),
  message_type text not null,
  body text,
  caption text,
  reply_to_message_id uuid references public.messages(id) on delete set null,
  meta_reply_to_message_id text,
  status text not null default 'received' check (status in ('received','queued','submitted','sent','delivered','read','failed','deleted','unknown')),
  interactive_payload jsonb not null default '{}'::jsonb,
  context_payload jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  meta_timestamp timestamptz,
  received_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_messages_meta_message_id
  on public.messages(organization_id, meta_message_id)
  where meta_message_id is not null;
create index if not exists idx_messages_conversation_created
  on public.messages(conversation_id, created_at desc);
create index if not exists idx_messages_number_created
  on public.messages(whatsapp_number_id, created_at desc);
create index if not exists idx_messages_contact_created
  on public.messages(contact_id, created_at desc);
create index if not exists idx_messages_raw_payload_gin
  on public.messages using gin(raw_payload);

create table if not exists public.message_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  whatsapp_number_id uuid not null references public.whatsapp_numbers(id) on delete cascade,
  status text not null check (status in ('received','queued','submitted','sent','delivered','read','failed','deleted','unknown')),
  meta_timestamp timestamptz,
  error_code text,
  error_message text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_message_status_history_message
  on public.message_status_history(message_id, created_at);

-- ============================================================
-- 6) Media
-- ============================================================
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_number_id uuid not null references public.whatsapp_numbers(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  meta_media_id text,
  media_type text not null,
  mime_type text,
  filename text,
  file_size bigint check (file_size is null or file_size >= 0),
  sha256 text,
  storage_provider text not null default 'supabase',
  storage_bucket text not null default 'azwa-whatsapp-media',
  storage_path text,
  download_status text not null default 'pending' check (download_status in ('pending','downloading','stored','failed','expired','deleted')),
  download_attempts integer not null default 0 check (download_attempts >= 0),
  last_error text,
  received_at timestamptz,
  stored_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_media_message_media_id
  on public.media(message_id, meta_media_id)
  where meta_media_id is not null;
create index if not exists idx_media_number_received
  on public.media(whatsapp_number_id, received_at desc);
create index if not exists idx_media_sha256
  on public.media(sha256) where sha256 is not null;

-- ============================================================
-- 7) Templates
-- ============================================================
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  waba_id uuid not null references public.wabas(id) on delete cascade,
  meta_template_id text,
  name text not null,
  category text,
  language text not null,
  status text not null default 'draft' check (status in ('draft','pending','approved','rejected','paused','disabled','deleted','unknown')),
  quality_rating text,
  components jsonb not null default '[]'::jsonb,
  rejection_reason text,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (waba_id, name, language)
);

create unique index if not exists uq_templates_meta_id
  on public.templates(waba_id, meta_template_id)
  where meta_template_id is not null;

create table if not exists public.template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.templates(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  snapshot jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id, version_no)
);

-- ============================================================
-- 8) Campaigns
-- ============================================================
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sender_whatsapp_number_id uuid not null references public.whatsapp_numbers(id) on delete restrict,
  template_id uuid references public.templates(id) on delete set null,
  name text not null,
  description text,
  audience_filter jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','scheduled','running','paused','completed','cancelled','failed')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campaigns_number_status
  on public.campaigns(sender_whatsapp_number_id, status, scheduled_at);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  contact_channel_id uuid references public.contact_channels(id) on delete set null,
  recipient_address text not null,
  template_variables jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','submitted','sent','delivered','read','failed','skipped','cancelled')),
  message_id uuid references public.messages(id) on delete set null,
  error_code text,
  error_message text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, recipient_address)
);

create index if not exists idx_campaign_recipients_status
  on public.campaign_recipients(campaign_id, status);

-- ============================================================
-- 9) Automation
-- ============================================================
create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  trigger_type text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  scope_business_portfolio_id uuid references public.business_portfolios(id) on delete cascade,
  scope_waba_id uuid references public.wabas(id) on delete cascade,
  scope_whatsapp_number_id uuid references public.whatsapp_numbers(id) on delete cascade,
  is_enabled boolean not null default true,
  priority integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  automation_rule_id uuid not null references public.automation_rules(id) on delete cascade,
  trigger_event_id uuid,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  whatsapp_number_id uuid references public.whatsapp_numbers(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','skipped','cancelled')),
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 10) Webhooks / API / operations
-- ============================================================
create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meta_app_id uuid references public.meta_apps(id) on delete cascade,
  endpoint_type text not null default 'meta_whatsapp',
  url text not null,
  verify_token_credential_id uuid references public.meta_credentials(id) on delete set null,
  app_secret_credential_id uuid references public.meta_credentials(id) on delete set null,
  status text not null default 'active' check (status in ('active','inactive','error')),
  verification_status text,
  last_event_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webhook_endpoint_id uuid references public.webhook_endpoints(id) on delete set null,
  meta_app_id uuid references public.meta_apps(id) on delete set null,
  business_portfolio_id uuid references public.business_portfolios(id) on delete set null,
  waba_id uuid references public.wabas(id) on delete set null,
  whatsapp_number_id uuid references public.whatsapp_numbers(id) on delete set null,
  meta_waba_id text,
  meta_phone_number_id text,
  event_type text not null,
  meta_message_id text,
  deduplication_key text not null,
  signature_valid boolean,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received','queued','processing','processed','failed','ignored','unmapped_number_event')),
  attempts integer not null default 0 check (attempts >= 0),
  error text,
  received_at timestamptz not null default now(),
  queued_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, deduplication_key)
);

create index if not exists idx_webhook_events_number_received
  on public.webhook_events(whatsapp_number_id, received_at desc);
create index if not exists idx_webhook_events_status_received
  on public.webhook_events(status, received_at);
create index if not exists idx_webhook_events_payload_gin
  on public.webhook_events using gin(payload);

create table if not exists public.api_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  correlation_id text,
  request_id text,
  meta_app_id uuid references public.meta_apps(id) on delete set null,
  business_portfolio_id uuid references public.business_portfolios(id) on delete set null,
  waba_id uuid references public.wabas(id) on delete set null,
  whatsapp_number_id uuid references public.whatsapp_numbers(id) on delete set null,
  endpoint text not null,
  method text not null,
  http_status integer,
  duration_ms integer,
  meta_error_code text,
  meta_error_message text,
  request_meta jsonb not null default '{}'::jsonb,
  response_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_requests_number_created
  on public.api_requests(whatsapp_number_id, created_at desc);
create index if not exists idx_api_requests_http_status
  on public.api_requests(http_status, created_at desc);

create table if not exists public.api_errors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  api_request_id uuid references public.api_requests(id) on delete set null,
  whatsapp_number_id uuid references public.whatsapp_numbers(id) on delete set null,
  waba_id uuid references public.wabas(id) on delete set null,
  error_type text,
  error_code text,
  title text,
  message text,
  raw_error jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','acknowledged','resolved','ignored')),
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_occurred_at timestamptz not null default now(),
  last_occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.health_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_portfolio_id uuid references public.business_portfolios(id) on delete cascade,
  waba_id uuid references public.wabas(id) on delete cascade,
  whatsapp_number_id uuid references public.whatsapp_numbers(id) on delete cascade,
  component text not null,
  status text not null check (status in ('healthy','warning','critical','offline','unknown')),
  score numeric(5,2),
  message text,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_health_checks_number_component
  on public.health_checks(whatsapp_number_id, component, checked_at desc);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_portfolio_id uuid references public.business_portfolios(id) on delete set null,
  waba_id uuid references public.wabas(id) on delete set null,
  whatsapp_number_id uuid references public.whatsapp_numbers(id) on delete set null,
  alert_type text not null,
  severity text not null check (severity in ('info','warning','critical')),
  title text not null,
  message text,
  status text not null default 'open' check (status in ('open','acknowledged','resolved','ignored')),
  source_entity_type text,
  source_entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 11) Queue / jobs
-- ============================================================
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  queue_name text not null,
  job_type text not null,
  deduplication_key text,
  priority integer not null default 100,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  attempt integer not null default 0 check (attempt >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_jobs_deduplication_key
  on public.jobs(organization_id, queue_name, deduplication_key)
  where deduplication_key is not null and status in ('queued','running','completed');
create index if not exists idx_jobs_dispatch
  on public.jobs(queue_name, status, available_at, priority, created_at);

create table if not exists public.dead_letter_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  original_job_id uuid references public.jobs(id) on delete set null,
  queue_name text not null,
  job_type text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  last_error text,
  failed_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open','retried','discarded','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 12) Integrations / outgoing webhooks / settings / audit
-- ============================================================
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_type text not null,
  name text not null,
  status text not null default 'active' check (status in ('active','inactive','error')),
  config jsonb not null default '{}'::jsonb,
  secret_reference text,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, integration_type, name)
);

create table if not exists public.outgoing_webhooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  target_url text not null,
  event_types text[] not null,
  secret_reference text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outgoing_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  outgoing_webhook_id uuid not null references public.outgoing_webhooks(id) on delete cascade,
  event_type text not null,
  event_id uuid,
  payload jsonb not null,
  attempt integer not null default 0,
  http_status integer,
  response_excerpt text,
  status text not null default 'queued' check (status in ('queued','sending','delivered','failed')),
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  is_secret boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  business_portfolio_id uuid references public.business_portfolios(id) on delete set null,
  waba_id uuid references public.wabas(id) on delete set null,
  whatsapp_number_id uuid references public.whatsapp_numbers(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  ip inet,
  user_agent text,
  correlation_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_org_created
  on public.audit_logs(organization_id, created_at desc);

-- ============================================================
-- 13) Useful views
-- ============================================================
create or replace view public.v_whatsapp_structure
with (security_invoker = true) as
select
  o.id as organization_id,
  o.name as organization_name,
  bp.id as business_portfolio_id,
  bp.meta_business_id,
  bp.name as business_name,
  w.id as waba_id,
  w.meta_waba_id,
  w.name as waba_name,
  n.id as whatsapp_number_id,
  n.meta_phone_number_id,
  n.display_phone_number,
  n.normalized_phone_number,
  n.verified_name,
  n.internal_name,
  n.status,
  n.quality_rating,
  n.messaging_limit,
  n.webhook_status,
  n.last_incoming_message_at,
  n.last_outgoing_message_at
from public.organizations o
join public.business_portfolios bp on bp.organization_id = o.id
join public.wabas w on w.business_portfolio_id = bp.id
join public.whatsapp_numbers n on n.waba_id = w.id;

create or replace view public.v_number_message_stats_24h
with (security_invoker = true) as
select
  n.organization_id,
  n.id as whatsapp_number_id,
  n.display_phone_number,
  count(m.id) filter (where m.direction = 'incoming') as incoming_24h,
  count(m.id) filter (where m.direction = 'outgoing') as outgoing_24h,
  count(m.id) filter (where m.status = 'failed') as failed_24h,
  count(m.id) as total_24h
from public.whatsapp_numbers n
left join public.messages m
  on m.whatsapp_number_id = n.id
 and m.created_at >= now() - interval '24 hours'
group by n.organization_id, n.id, n.display_phone_number;

-- ============================================================
-- 14) Auth profile trigger
-- ============================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ============================================================
-- 15) updated_at triggers
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations','profiles','organization_members','teams','business_portfolios','meta_apps','wabas',
    'meta_app_wabas','whatsapp_numbers','meta_credentials','contacts','contact_channels','conversations',
    'conversation_notes','messages','media','templates','campaigns','campaign_recipients','automation_rules',
    'webhook_endpoints','api_errors','alerts','jobs','dead_letter_jobs','integrations','outgoing_webhooks','system_settings'
  ]
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ============================================================
-- 16) RBAC helper functions for RLS
-- ============================================================
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$$;

create or replace function public.has_org_permission(p_org_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.organization_id = p_org_id
      and ur.user_id = auth.uid()
      and p.code = p_permission
  );
$$;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.organization_id = p_org_id
      and ur.user_id = auth.uid()
      and r.code in ('super_admin','admin')
  );
$$;

create or replace function public.can_read_waba(p_waba_id uuid, p_permission text default 'wabas.read')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.wabas w
    where w.id = p_waba_id
      and public.is_org_member(w.organization_id)
      and public.has_org_permission(w.organization_id, p_permission)
      and (
        public.is_org_admin(w.organization_id)
        or exists (
          select 1 from public.user_waba_access uwa
          where uwa.user_id = auth.uid() and uwa.waba_id = w.id and uwa.can_read
        )
        or exists (
          select 1 from public.user_business_access uba
          where uba.user_id = auth.uid() and uba.business_portfolio_id = w.business_portfolio_id and uba.can_read
        )
      )
  );
$$;

create or replace function public.can_read_number(p_number_id uuid, p_permission text default 'numbers.read')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.whatsapp_numbers n
    join public.wabas w on w.id = n.waba_id
    where n.id = p_number_id
      and public.is_org_member(n.organization_id)
      and public.has_org_permission(n.organization_id, p_permission)
      and (
        public.is_org_admin(n.organization_id)
        or exists (
          select 1 from public.user_number_access una
          where una.user_id = auth.uid() and una.whatsapp_number_id = n.id and una.can_read
        )
        or exists (
          select 1 from public.user_waba_access uwa
          where uwa.user_id = auth.uid() and uwa.waba_id = n.waba_id and uwa.can_read
        )
        or exists (
          select 1 from public.user_business_access uba
          where uba.user_id = auth.uid() and uba.business_portfolio_id = w.business_portfolio_id and uba.can_read
        )
        or exists (
          select 1
          from public.team_members tm
          join public.team_number_access tna on tna.team_id = tm.team_id
          where tm.user_id = auth.uid() and tna.whatsapp_number_id = n.id and tna.can_read
        )
      )
  );
$$;

-- ============================================================
-- 17) Row Level Security
-- Frontend is read-oriented; writes should go through the trusted backend/service role.
-- ============================================================

-- Global reference tables
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists roles_read_authenticated on public.roles;
create policy roles_read_authenticated on public.roles for select to authenticated using (true);
drop policy if exists permissions_read_authenticated on public.permissions;
create policy permissions_read_authenticated on public.permissions for select to authenticated using (true);
drop policy if exists role_permissions_read_authenticated on public.role_permissions;
create policy role_permissions_read_authenticated on public.role_permissions for select to authenticated using (true);

-- Profiles
alter table public.profiles enable row level security;
drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles for select to authenticated using (id = auth.uid());

-- Organization-scoped tables with direct organization_id read isolation
-- (Mutations intentionally have no client policies; service_role/backend performs writes.)
do $$
declare
  t text;
begin
  foreach t in array array[
    'organization_members','user_roles','teams','business_portfolios','meta_apps',
    'meta_credentials','user_business_access','user_waba_access','user_number_access','team_number_access',
    'contacts','contact_channels','tags','contact_consents','conversation_assignments','conversation_notes',
    'template_versions','automation_rules','automation_runs','webhook_endpoints','api_requests','api_errors',
    'health_checks','alerts','jobs','dead_letter_jobs','integrations','outgoing_webhooks','outgoing_webhook_deliveries',
    'system_settings','audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'read_org_scope', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_member(organization_id))', 'read_org_scope', t);
  end loop;
end $$;

-- Organizations
alter table public.organizations enable row level security;
drop policy if exists organizations_read_scope on public.organizations;
create policy organizations_read_scope on public.organizations
  for select to authenticated using (public.is_org_member(id));

-- Team membership
alter table public.team_members enable row level security;
drop policy if exists team_members_read_scope on public.team_members;
create policy team_members_read_scope on public.team_members
  for select to authenticated using (
    exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_member(t.organization_id)
    )
  );

-- WABAs
alter table public.wabas enable row level security;
drop policy if exists wabas_read_scope on public.wabas;
create policy wabas_read_scope on public.wabas
  for select to authenticated
  using (public.can_read_waba(id, 'wabas.read'));

-- Meta app WABA links
alter table public.meta_app_wabas enable row level security;
drop policy if exists meta_app_wabas_read_scope on public.meta_app_wabas;
create policy meta_app_wabas_read_scope on public.meta_app_wabas
  for select to authenticated
  using (public.can_read_waba(waba_id, 'wabas.read'));

-- WhatsApp numbers
alter table public.whatsapp_numbers enable row level security;
drop policy if exists whatsapp_numbers_read_scope on public.whatsapp_numbers;
create policy whatsapp_numbers_read_scope on public.whatsapp_numbers
  for select to authenticated
  using (public.can_read_number(id, 'numbers.read'));

-- Number-scoped operational tables
alter table public.conversations enable row level security;
drop policy if exists conversations_read_scope on public.conversations;
create policy conversations_read_scope on public.conversations
  for select to authenticated using (public.can_read_number(whatsapp_number_id, 'messages.read'));

alter table public.messages enable row level security;
drop policy if exists messages_read_scope on public.messages;
create policy messages_read_scope on public.messages
  for select to authenticated using (public.can_read_number(whatsapp_number_id, 'messages.read'));

alter table public.message_status_history enable row level security;
drop policy if exists message_status_history_read_scope on public.message_status_history;
create policy message_status_history_read_scope on public.message_status_history
  for select to authenticated using (public.can_read_number(whatsapp_number_id, 'messages.read'));

alter table public.media enable row level security;
drop policy if exists media_read_scope on public.media;
create policy media_read_scope on public.media
  for select to authenticated using (public.can_read_number(whatsapp_number_id, 'media.read'));

alter table public.campaigns enable row level security;
drop policy if exists campaigns_read_scope on public.campaigns;
create policy campaigns_read_scope on public.campaigns
  for select to authenticated using (public.can_read_number(sender_whatsapp_number_id, 'campaigns.read'));

alter table public.campaign_recipients enable row level security;
drop policy if exists campaign_recipients_read_scope on public.campaign_recipients;
create policy campaign_recipients_read_scope on public.campaign_recipients
  for select to authenticated using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and public.can_read_number(c.sender_whatsapp_number_id, 'campaigns.read')
    )
  );

-- WABA-scoped templates
alter table public.templates enable row level security;
drop policy if exists templates_read_scope on public.templates;
create policy templates_read_scope on public.templates
  for select to authenticated using (public.can_read_waba(waba_id, 'templates.read'));

-- Webhook events can be number-mapped or unmapped
alter table public.webhook_events enable row level security;
drop policy if exists webhook_events_read_scope on public.webhook_events;
create policy webhook_events_read_scope on public.webhook_events
  for select to authenticated
  using (
    case
      when whatsapp_number_id is not null then public.can_read_number(whatsapp_number_id, 'webhooks.read')
      else public.is_org_member(organization_id) and public.has_org_permission(organization_id, 'webhooks.read')
    end
  );

-- Junction tables without organization_id
alter table public.contact_tags enable row level security;
drop policy if exists contact_tags_read_scope on public.contact_tags;
create policy contact_tags_read_scope on public.contact_tags
  for select to authenticated using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_id and public.is_org_member(c.organization_id)
    )
  );

-- ============================================================
-- 18) Seed roles and permissions
-- ============================================================
insert into public.roles(code, name, is_system) values
  ('super_admin','Super Admin',true),
  ('admin','Admin',true),
  ('supervisor','Supervisor',true),
  ('agent','Agent',true),
  ('marketing','Marketing',true),
  ('developer','Developer',true),
  ('viewer','Viewer',true)
on conflict (code) do update set name = excluded.name;

insert into public.permissions(code, description) values
  ('business.read','Read business portfolios'),
  ('business.manage','Manage business portfolios'),
  ('wabas.read','Read WABAs'),
  ('wabas.manage','Manage WABAs'),
  ('numbers.read','Read WhatsApp numbers'),
  ('numbers.manage','Manage WhatsApp numbers'),
  ('messages.read','Read conversations and messages'),
  ('messages.send','Send WhatsApp messages'),
  ('contacts.read','Read contacts'),
  ('contacts.manage','Manage contacts'),
  ('media.read','Read media metadata'),
  ('templates.read','Read templates'),
  ('templates.manage','Manage templates'),
  ('campaigns.read','Read campaigns'),
  ('campaigns.create','Create campaigns'),
  ('campaigns.send','Send campaigns'),
  ('automation.read','Read automations'),
  ('automation.manage','Manage automations'),
  ('webhooks.read','Read webhook events'),
  ('webhooks.manage','Manage webhooks'),
  ('credentials.manage','Manage credential references'),
  ('health.read','Read health checks'),
  ('errors.read','Read operational errors'),
  ('logs.read','Read API/audit logs'),
  ('users.manage','Manage users and access'),
  ('settings.manage','Manage system settings')
on conflict (code) do update set description = excluded.description;

-- Super Admin: all permissions
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.code = 'super_admin'
on conflict do nothing;

-- Admin: all permissions
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.code = 'admin'
on conflict do nothing;

-- Supervisor
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r join public.permissions p on p.code = any(array[
  'business.read','wabas.read','numbers.read','messages.read','messages.send','contacts.read','contacts.manage',
  'media.read','templates.read','campaigns.read','automation.read','webhooks.read','health.read','errors.read','logs.read'
])
where r.code = 'supervisor'
on conflict do nothing;

-- Agent
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r join public.permissions p on p.code = any(array[
  'numbers.read','messages.read','messages.send','contacts.read','contacts.manage','media.read','templates.read'
])
where r.code = 'agent'
on conflict do nothing;

-- Marketing
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r join public.permissions p on p.code = any(array[
  'numbers.read','contacts.read','media.read','templates.read','templates.manage','campaigns.read','campaigns.create','campaigns.send'
])
where r.code = 'marketing'
on conflict do nothing;

-- Developer
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r join public.permissions p on p.code = any(array[
  'business.read','wabas.read','numbers.read','messages.read','contacts.read','media.read','templates.read','campaigns.read',
  'automation.read','automation.manage','webhooks.read','webhooks.manage','credentials.manage','health.read','errors.read','logs.read','settings.manage'
])
where r.code = 'developer'
on conflict do nothing;

-- Viewer
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r join public.permissions p on p.code = any(array[
  'business.read','wabas.read','numbers.read','messages.read','contacts.read','media.read','templates.read','campaigns.read','health.read'
])
where r.code = 'viewer'
on conflict do nothing;

-- ============================================================
-- 19) Initial AzWA production structure seed
-- ============================================================
insert into public.organizations(slug, name, status)
values ('alazab-group','Alazab Group','active')
on conflict (slug) do update set name = excluded.name, status = excluded.status;

insert into public.business_portfolios(organization_id, meta_business_id, name, status, is_primary)
select id, '31443701205', 'Alazab Group Primary Business Portfolio', 'active', true
from public.organizations where slug = 'alazab-group'
on conflict (organization_id, meta_business_id)
do update set name = excluded.name, status = excluded.status, is_primary = true;

insert into public.meta_apps(
  organization_id, business_portfolio_id, meta_app_id, display_name, namespace,
  app_domains, privacy_policy_url, terms_url, data_deletion_url, status
)
select
  o.id, bp.id, '1061494059972503', 'AzWA', 'azwhatsapp',
  array['alazab.com','wa.alazab.com'],
  'https://alazab.com/privacy-policy',
  'https://alazab.com/terms-of-service',
  'https://alazab.com/data-deletion',
  'active'
from public.organizations o
join public.business_portfolios bp on bp.organization_id = o.id and bp.meta_business_id = '31443701205'
where o.slug = 'alazab-group'
on conflict (organization_id, meta_app_id)
do update set
  display_name = excluded.display_name,
  namespace = excluded.namespace,
  app_domains = excluded.app_domains,
  privacy_policy_url = excluded.privacy_policy_url,
  terms_url = excluded.terms_url,
  data_deletion_url = excluded.data_deletion_url,
  status = excluded.status;

with seed(meta_waba_id) as (
  values
    ('922964860845619'),
    ('2154838801923462'),
    ('1527103499063250'),
    ('1303965001665007'),
    ('2144651456337012'),
    ('1458856398934130'),
    ('459851797218855')
)
insert into public.wabas(organization_id, business_portfolio_id, meta_waba_id, status)
select o.id, bp.id, s.meta_waba_id, 'active'
from seed s
cross join public.organizations o
join public.business_portfolios bp on bp.organization_id = o.id and bp.meta_business_id = '31443701205'
where o.slug = 'alazab-group'
on conflict (organization_id, meta_waba_id)
do update set status = 'active';

insert into public.meta_app_wabas(meta_app_id, waba_id, status)
select a.id, w.id, 'active'
from public.meta_apps a
join public.wabas w on w.organization_id = a.organization_id
where a.meta_app_id = '1061494059972503'
on conflict (meta_app_id, waba_id)
do update set status = 'active';

with numbers(meta_waba_id, meta_phone_number_id, display_phone_number, normalized_phone_number) as (
  values
    ('922964860845619','1328521857002632','+201115723930','+201115723930'),
    ('2154838801923462','1011864912017679','+201092750351','+201092750351'),
    ('1527103499063250','1197837903405393','+201146395966','+201146395966'),
    ('1303965001665007','1061490140383829','+201146397010','+201146397010'),
    ('2144651456337012','1020054711186921','+12054605650','+12054605650'),
    ('1458856398934130','1032441389943808','+12064795608','+12064795608'),
    ('1458856398934130','952530191273396','+12083799564','+12083799564'),
    ('459851797218855','644995285354639','+15557285727','+15557285727'),
    ('459851797218855','527697617099639','+15557245001','+15557245001')
)
insert into public.whatsapp_numbers(
  organization_id, waba_id, meta_phone_number_id, display_phone_number, normalized_phone_number, status, is_enabled
)
select w.organization_id, w.id, n.meta_phone_number_id, n.display_phone_number, n.normalized_phone_number, 'active', true
from numbers n
join public.wabas w on w.meta_waba_id = n.meta_waba_id
join public.organizations o on o.id = w.organization_id and o.slug = 'alazab-group'
on conflict (organization_id, meta_phone_number_id)
do update set
  waba_id = excluded.waba_id,
  display_phone_number = excluded.display_phone_number,
  normalized_phone_number = excluded.normalized_phone_number,
  status = 'active',
  is_enabled = true;

-- ============================================================
-- 20) Storage bucket for WhatsApp media (private; backend/service-role only)
-- ============================================================
insert into storage.buckets(id, name, public, file_size_limit)
values ('azwa-whatsapp-media', 'azwa-whatsapp-media', false, 104857600)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Intentionally no public/authenticated storage.objects policies.
-- Media upload/download should be brokered by trusted backend/service-role and signed URLs.

-- ============================================================
-- 21) Realtime publication for operational UI
-- ============================================================
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'conversations','messages','message_status_history','alerts','health_checks','webhook_events','campaigns','campaign_recipients'
    ]
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ============================================================
-- 22) Helpful indexes for search / filters
-- ============================================================
create index if not exists idx_contacts_org_last_interaction
  on public.contacts(organization_id, last_interaction_at desc);
create index if not exists idx_contacts_display_name_trgm
  on public.contacts using gin(display_name gin_trgm_ops);
create index if not exists idx_contact_channels_address_trgm
  on public.contact_channels using gin(address gin_trgm_ops);
create index if not exists idx_templates_waba_status
  on public.templates(waba_id, status, updated_at desc);
create index if not exists idx_alerts_org_status_severity
  on public.alerts(organization_id, status, severity, created_at desc);
create index if not exists idx_api_errors_org_status
  on public.api_errors(organization_id, status, last_occurred_at desc);

commit;

-- ============================================================
-- POST-MIGRATION REQUIRED ACTIONS
-- 1) Add the first auth user to organization_members.
-- 2) Assign super_admin role in user_roles.
-- 3) Store Meta secrets in Supabase Vault / external secret manager and write ONLY references to meta_credentials.
-- 4) Backend/service_role handles writes and Meta API calls. Browser clients use RLS-protected reads/realtime.
-- ============================================================
