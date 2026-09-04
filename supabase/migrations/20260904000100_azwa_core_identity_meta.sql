-- ============================================================================
-- AzWA — 001 Core Identity + Meta Control Plane
-- Target: Supabase PostgreSQL 15+ (validated design target: PostgreSQL 17)
-- Fresh baseline only. No DROP statements. Runs atomically.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 0) Guard: refuse to run over an existing AzWA schema
-- --------------------------------------------------------------------------
do $$
declare
  existing_count integer;
begin
  select count(*)
    into existing_count
  from pg_catalog.pg_tables
  where schemaname = 'public'
    and tablename = any (array[
      'organizations','profiles','organization_members','roles','permissions',
      'role_permissions','user_roles','teams','team_members',
      'business_portfolios','meta_apps','meta_system_users','wabas','meta_app_wabas',
      'whatsapp_numbers','meta_credentials','user_business_access','user_waba_access',
      'user_number_access','team_number_access','webhook_endpoints','templates',
      'whatsapp_flows','waba_subscribed_apps','waba_assigned_users'
    ]);

  if existing_count > 0 then
    raise exception 'AzWA baseline aborted: % target tables already exist in public schema', existing_count;
  end if;
end;
$$;

create schema if not exists private;

-- --------------------------------------------------------------------------
-- 1) Utility trigger function
-- --------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- 2) Identity / organization / RBAC
-- --------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active'
    check (status in ('active','suspended','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  locale text not null default 'ar',
  timezone text not null default 'Africa/Cairo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- Automatically create the non-sensitive application profile for new Auth users.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created_azwa
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create table public.organization_members (
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('invited','active','suspended','removed')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.user_roles (
  organization_id uuid not null,
  user_id uuid not null,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, role_id),
  constraint user_roles_member_fk
    foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id)
    on delete cascade
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active'
    check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)
);

create table public.team_members (
  organization_id uuid not null,
  team_id uuid not null,
  user_id uuid not null,
  is_lead boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id),
  constraint team_members_team_fk
    foreign key (team_id, organization_id)
    references public.teams(id, organization_id)
    on delete cascade,
  constraint team_members_org_member_fk
    foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id)
    on delete cascade
);

-- --------------------------------------------------------------------------
-- 3) Meta control plane
-- --------------------------------------------------------------------------
create table public.business_portfolios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  meta_business_id text not null,
  name text,
  verification_status text,
  status text not null default 'active'
    check (status in ('active','inactive','missing_from_meta','requires_review','archived')),
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, meta_business_id),
  unique (id, organization_id)
);

create unique index uq_business_portfolios_primary_per_org
  on public.business_portfolios(organization_id)
  where is_primary is true;

create table public.meta_apps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  business_portfolio_id uuid,
  meta_app_id text not null,
  display_name text not null,
  platform text not null default 'meta',
  namespace text,
  app_domains text[] not null default '{}',
  privacy_policy_url text,
  terms_url text,
  data_deletion_url text,
  status text not null default 'active'
    check (status in ('active','inactive','review','restricted','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, meta_app_id),
  unique (id, organization_id),
  constraint meta_apps_portfolio_fk
    foreign key (business_portfolio_id, organization_id)
    references public.business_portfolios(id, organization_id)
    on delete set null (business_portfolio_id)
);

create table public.meta_system_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  business_portfolio_id uuid not null,
  meta_system_user_id text not null,
  name text,
  system_role text,
  status text not null default 'active'
    check (status in ('active','inactive','disabled','missing_from_meta','requires_review')),
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, meta_system_user_id),
  unique (id, organization_id),
  constraint meta_system_users_portfolio_fk
    foreign key (business_portfolio_id, organization_id)
    references public.business_portfolios(id, organization_id)
    on delete cascade
);

create table public.wabas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  business_portfolio_id uuid not null,
  meta_waba_id text not null,
  name text,
  currency text,
  timezone text,
  account_review_status text,
  business_verification_status text,
  message_template_namespace text,
  status text not null default 'active'
    check (status in ('active','inactive','missing_from_meta','requires_review','restricted','archived')),
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, meta_waba_id),
  unique (id, organization_id),
  constraint wabas_portfolio_fk
    foreign key (business_portfolio_id, organization_id)
    references public.business_portfolios(id, organization_id)
    on delete cascade
);

create table public.meta_app_wabas (
  organization_id uuid not null,
  meta_app_id uuid not null,
  waba_id uuid not null,
  status text not null default 'active'
    check (status in ('active','inactive','pending','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (meta_app_id, waba_id),
  constraint meta_app_wabas_app_fk
    foreign key (meta_app_id, organization_id)
    references public.meta_apps(id, organization_id)
    on delete cascade,
  constraint meta_app_wabas_waba_fk
    foreign key (waba_id, organization_id)
    references public.wabas(id, organization_id)
    on delete cascade
);

create table public.whatsapp_numbers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  waba_id uuid not null,
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
  account_mode text,
  status text not null default 'active'
    check (status in ('active','inactive','missing_from_meta','requires_review','restricted','disconnected','archived')),
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
  unique (organization_id, meta_phone_number_id),
  unique (id, organization_id),
  constraint whatsapp_numbers_waba_fk
    foreign key (waba_id, organization_id)
    references public.wabas(id, organization_id)
    on delete cascade
);

create unique index uq_whatsapp_numbers_e164_per_org
  on public.whatsapp_numbers(organization_id, normalized_phone_number)
  where normalized_phone_number is not null;

create unique index uq_whatsapp_numbers_default_per_org
  on public.whatsapp_numbers(organization_id)
  where is_default is true;

create or replace function private.enforce_whatsapp_sender_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    new.is_enabled := false;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_whatsapp_sender_status() from public, anon, authenticated;

create trigger trg_whatsapp_numbers_sender_status
  before insert or update of status, is_enabled on public.whatsapp_numbers
  for each row execute function private.enforce_whatsapp_sender_status();

-- Sensitive secret references only. Actual secret value is NOT stored here.
create table public.meta_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  meta_app_id uuid,
  business_portfolio_id uuid,
  meta_system_user_id uuid,
  waba_id uuid,
  whatsapp_number_id uuid,
  credential_type text not null
    check (credential_type in ('system_user_token','user_token','app_secret','verify_token','access_token','app_access_token','other')),
  name text not null,
  secret_reference text not null,
  token_fingerprint text,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  status text not null default 'active'
    check (status in ('active','expired','revoked','invalid','inactive')),
  last_verified_at timestamptz,
  last_used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint meta_credentials_owner_check check (
    meta_app_id is not null
    or business_portfolio_id is not null
    or meta_system_user_id is not null
    or waba_id is not null
    or whatsapp_number_id is not null
  ),
  constraint meta_credentials_app_fk
    foreign key (meta_app_id, organization_id)
    references public.meta_apps(id, organization_id)
    on delete cascade,
  constraint meta_credentials_portfolio_fk
    foreign key (business_portfolio_id, organization_id)
    references public.business_portfolios(id, organization_id)
    on delete cascade,
  constraint meta_credentials_system_user_fk
    foreign key (meta_system_user_id, organization_id)
    references public.meta_system_users(id, organization_id)
    on delete cascade,
  constraint meta_credentials_waba_fk
    foreign key (waba_id, organization_id)
    references public.wabas(id, organization_id)
    on delete cascade,
  constraint meta_credentials_number_fk
    foreign key (whatsapp_number_id, organization_id)
    references public.whatsapp_numbers(id, organization_id)
    on delete cascade
);

-- --------------------------------------------------------------------------
-- 4) Explicit per-user / per-team scopes
-- --------------------------------------------------------------------------
create table public.user_business_access (
  organization_id uuid not null,
  user_id uuid not null,
  business_portfolio_id uuid not null,
  can_read boolean not null default true,
  can_manage boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, business_portfolio_id),
  constraint user_business_access_member_fk
    foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id)
    on delete cascade,
  constraint user_business_access_portfolio_fk
    foreign key (business_portfolio_id, organization_id)
    references public.business_portfolios(id, organization_id)
    on delete cascade
);

create table public.user_waba_access (
  organization_id uuid not null,
  user_id uuid not null,
  waba_id uuid not null,
  can_read boolean not null default true,
  can_manage boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, waba_id),
  constraint user_waba_access_member_fk
    foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id)
    on delete cascade,
  constraint user_waba_access_waba_fk
    foreign key (waba_id, organization_id)
    references public.wabas(id, organization_id)
    on delete cascade
);

create table public.user_number_access (
  organization_id uuid not null,
  user_id uuid not null,
  whatsapp_number_id uuid not null,
  can_read boolean not null default true,
  can_send boolean not null default false,
  can_manage boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, whatsapp_number_id),
  constraint user_number_access_member_fk
    foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id)
    on delete cascade,
  constraint user_number_access_number_fk
    foreign key (whatsapp_number_id, organization_id)
    references public.whatsapp_numbers(id, organization_id)
    on delete cascade
);

create table public.team_number_access (
  organization_id uuid not null,
  team_id uuid not null,
  whatsapp_number_id uuid not null,
  can_read boolean not null default true,
  can_send boolean not null default false,
  can_manage boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (team_id, whatsapp_number_id),
  constraint team_number_access_team_fk
    foreign key (team_id, organization_id)
    references public.teams(id, organization_id)
    on delete cascade,
  constraint team_number_access_number_fk
    foreign key (whatsapp_number_id, organization_id)
    references public.whatsapp_numbers(id, organization_id)
    on delete cascade
);

-- --------------------------------------------------------------------------
-- 5) Webhook control + templates + flows + Meta WABA inventory
-- --------------------------------------------------------------------------
create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  meta_app_id uuid not null,
  endpoint_type text not null default 'meta_whatsapp',
  url text not null,
  verify_token_credential_id uuid,
  app_secret_credential_id uuid,
  status text not null default 'active'
    check (status in ('active','inactive','error')),
  verification_status text,
  last_event_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint webhook_endpoints_app_fk
    foreign key (meta_app_id, organization_id)
    references public.meta_apps(id, organization_id)
    on delete cascade,
  constraint webhook_endpoints_verify_credential_fk
    foreign key (verify_token_credential_id, organization_id)
    references public.meta_credentials(id, organization_id)
    on delete set null (verify_token_credential_id),
  constraint webhook_endpoints_app_secret_credential_fk
    foreign key (app_secret_credential_id, organization_id)
    references public.meta_credentials(id, organization_id)
    on delete set null (app_secret_credential_id)
);

create unique index uq_webhook_endpoint_per_app_type
  on public.webhook_endpoints(organization_id, meta_app_id, endpoint_type, url);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  waba_id uuid not null,
  meta_template_id text,
  name text not null,
  category text,
  language text not null,
  status text not null default 'draft'
    check (status in ('draft','pending','approved','rejected','paused','disabled','deleted','unknown')),
  quality_rating text,
  parameter_format text,
  components jsonb not null default '[]'::jsonb,
  rejection_reason text,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (waba_id, name, language),
  unique (id, organization_id),
  constraint templates_waba_fk
    foreign key (waba_id, organization_id)
    references public.wabas(id, organization_id)
    on delete cascade
);

create unique index uq_templates_meta_id
  on public.templates(waba_id, meta_template_id)
  where meta_template_id is not null;

create table public.whatsapp_flows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  waba_id uuid not null,
  meta_flow_id text not null,
  name text not null,
  status text not null default 'DRAFT',
  categories text[] not null default '{}',
  validation_errors jsonb not null default '[]'::jsonb,
  json_version text,
  data_api_version text,
  endpoint_uri text,
  preview_url text,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (waba_id, meta_flow_id),
  unique (id, organization_id),
  constraint whatsapp_flows_waba_fk
    foreign key (waba_id, organization_id)
    references public.wabas(id, organization_id)
    on delete cascade
);

create table public.waba_subscribed_apps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  waba_id uuid not null,
  meta_app_id text not null,
  local_meta_app_id uuid,
  app_name text,
  app_link text,
  app_namespace text,
  app_category text,
  override_callback_uri text,
  is_azwa boolean not null default false,
  status text not null default 'active',
  raw jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (waba_id, meta_app_id),
  unique (id, organization_id),
  constraint waba_subscribed_apps_waba_fk
    foreign key (waba_id, organization_id)
    references public.wabas(id, organization_id)
    on delete cascade,
  constraint waba_subscribed_apps_local_app_fk
    foreign key (local_meta_app_id, organization_id)
    references public.meta_apps(id, organization_id)
    on delete set null (local_meta_app_id)
);

create table public.waba_assigned_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  waba_id uuid not null,
  meta_user_id text not null,
  local_system_user_id uuid,
  name text,
  tasks text[] not null default '{}',
  status text not null default 'active',
  raw jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (waba_id, meta_user_id),
  unique (id, organization_id),
  constraint waba_assigned_users_waba_fk
    foreign key (waba_id, organization_id)
    references public.wabas(id, organization_id)
    on delete cascade,
  constraint waba_assigned_users_system_user_fk
    foreign key (local_system_user_id, organization_id)
    references public.meta_system_users(id, organization_id)
    on delete set null (local_system_user_id)
);

-- --------------------------------------------------------------------------
-- 6) Core indexes
-- --------------------------------------------------------------------------
create index idx_org_members_user_status
  on public.organization_members(user_id, status, organization_id);

create index idx_user_roles_user_org
  on public.user_roles(user_id, organization_id);

create index idx_teams_org_status
  on public.teams(organization_id, status);

create index idx_business_portfolios_org_status
  on public.business_portfolios(organization_id, status);

create index idx_meta_apps_org_portfolio_status
  on public.meta_apps(organization_id, business_portfolio_id, status);

create index idx_meta_system_users_org_portfolio_status
  on public.meta_system_users(organization_id, business_portfolio_id, status);

create index idx_wabas_org_portfolio_status
  on public.wabas(organization_id, business_portfolio_id, status);

create index idx_numbers_org_waba_status
  on public.whatsapp_numbers(organization_id, waba_id, status);

create index idx_credentials_org_type_status
  on public.meta_credentials(organization_id, credential_type, status);

create index idx_webhook_endpoints_org_app_status
  on public.webhook_endpoints(organization_id, meta_app_id, status);

create index idx_templates_org_waba_status
  on public.templates(organization_id, waba_id, status);

create index idx_whatsapp_flows_org_waba_status
  on public.whatsapp_flows(organization_id, waba_id, status);

create index idx_waba_subscribed_apps_org_waba
  on public.waba_subscribed_apps(organization_id, waba_id, is_azwa);

create index idx_waba_assigned_users_org_waba
  on public.waba_assigned_users(organization_id, waba_id);

-- --------------------------------------------------------------------------
-- 7) updated_at triggers
-- --------------------------------------------------------------------------
create trigger trg_organizations_updated_at
before update on public.organizations
for each row execute function private.set_updated_at();

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger trg_organization_members_updated_at
before update on public.organization_members
for each row execute function private.set_updated_at();

create trigger trg_teams_updated_at
before update on public.teams
for each row execute function private.set_updated_at();

create trigger trg_business_portfolios_updated_at
before update on public.business_portfolios
for each row execute function private.set_updated_at();

create trigger trg_meta_apps_updated_at
before update on public.meta_apps
for each row execute function private.set_updated_at();

create trigger trg_meta_system_users_updated_at
before update on public.meta_system_users
for each row execute function private.set_updated_at();

create trigger trg_wabas_updated_at
before update on public.wabas
for each row execute function private.set_updated_at();

create trigger trg_meta_app_wabas_updated_at
before update on public.meta_app_wabas
for each row execute function private.set_updated_at();

create trigger trg_whatsapp_numbers_updated_at
before update on public.whatsapp_numbers
for each row execute function private.set_updated_at();

create trigger trg_meta_credentials_updated_at
before update on public.meta_credentials
for each row execute function private.set_updated_at();

create trigger trg_webhook_endpoints_updated_at
before update on public.webhook_endpoints
for each row execute function private.set_updated_at();

create trigger trg_templates_updated_at
before update on public.templates
for each row execute function private.set_updated_at();

create trigger trg_whatsapp_flows_updated_at
before update on public.whatsapp_flows
for each row execute function private.set_updated_at();

create trigger trg_waba_subscribed_apps_updated_at
before update on public.waba_subscribed_apps
for each row execute function private.set_updated_at();

create trigger trg_waba_assigned_users_updated_at
before update on public.waba_assigned_users
for each row execute function private.set_updated_at();

-- --------------------------------------------------------------------------
-- 8) Security-definer helpers live only in non-exposed private schema
-- --------------------------------------------------------------------------
create or replace function private.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_org_id
      and om.user_id = (select auth.uid())
      and om.status = 'active'
  );
$$;

create or replace function private.has_org_permission(p_org_id uuid, p_permission text)
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

revoke all on function private.is_org_member(uuid) from public, anon, authenticated;
revoke all on function private.has_org_permission(uuid, text) from public, anon, authenticated;

grant usage on schema public to service_role;
grant usage on schema private to authenticated, service_role;
grant execute on function private.set_updated_at() to service_role;
grant execute on function private.handle_new_auth_user() to service_role;
grant execute on function private.enforce_whatsapp_sender_status() to service_role;
grant execute on function private.is_org_member(uuid) to authenticated, service_role;
grant execute on function private.has_org_permission(uuid, text) to authenticated, service_role;

-- --------------------------------------------------------------------------
-- 9) RLS: enabled from day one. No direct browser data-plane grants yet.
--    Browser operations will be exposed deliberately via server/API contracts.
-- --------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.business_portfolios enable row level security;
alter table public.meta_apps enable row level security;
alter table public.meta_system_users enable row level security;
alter table public.wabas enable row level security;
alter table public.meta_app_wabas enable row level security;
alter table public.whatsapp_numbers enable row level security;
alter table public.meta_credentials enable row level security;
alter table public.user_business_access enable row level security;
alter table public.user_waba_access enable row level security;
alter table public.user_number_access enable row level security;
alter table public.team_number_access enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.templates enable row level security;
alter table public.whatsapp_flows enable row level security;
alter table public.waba_subscribed_apps enable row level security;
alter table public.waba_assigned_users enable row level security;

-- Deny direct Data API access by default.
revoke all privileges on table
  public.organizations,
  public.profiles,
  public.organization_members,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.user_roles,
  public.teams,
  public.team_members,
  public.business_portfolios,
  public.meta_apps,
  public.meta_system_users,
  public.wabas,
  public.meta_app_wabas,
  public.whatsapp_numbers,
  public.meta_credentials,
  public.user_business_access,
  public.user_waba_access,
  public.user_number_access,
  public.team_number_access,
  public.webhook_endpoints,
  public.templates,
  public.whatsapp_flows,
  public.waba_subscribed_apps,
  public.waba_assigned_users
from anon, authenticated;

-- Explicit server-side privileges; service_role still bypasses RLS.
grant select, insert, update, delete on table
  public.organizations,
  public.profiles,
  public.organization_members,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.user_roles,
  public.teams,
  public.team_members,
  public.business_portfolios,
  public.meta_apps,
  public.meta_system_users,
  public.wabas,
  public.meta_app_wabas,
  public.whatsapp_numbers,
  public.meta_credentials,
  public.user_business_access,
  public.user_waba_access,
  public.user_number_access,
  public.team_number_access,
  public.webhook_endpoints,
  public.templates,
  public.whatsapp_flows,
  public.waba_subscribed_apps,
  public.waba_assigned_users
to service_role;

commit;
