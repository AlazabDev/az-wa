-- AzWA Meta inventory completion — Graph API v26
-- Additive only. Apply after the approved AzWA baseline/security/runtime migrations.
-- No historical row is deleted; live Meta reconciliation marks missing assets instead.

begin;

alter table public.wabas
  add column if not exists message_template_namespace text;

alter table public.whatsapp_numbers
  add column if not exists account_mode text;

create table if not exists public.whatsapp_flows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  waba_id uuid not null references public.wabas(id) on delete cascade,
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
  unique (waba_id, meta_flow_id)
);

create index if not exists idx_whatsapp_flows_org_waba_status
  on public.whatsapp_flows(organization_id, waba_id, status);

create table if not exists public.waba_subscribed_apps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  waba_id uuid not null references public.wabas(id) on delete cascade,
  meta_app_id text not null,
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
  unique (waba_id, meta_app_id)
);

create index if not exists idx_waba_subscribed_apps_org_waba
  on public.waba_subscribed_apps(organization_id, waba_id, is_azwa);

create table if not exists public.waba_assigned_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  waba_id uuid not null references public.wabas(id) on delete cascade,
  meta_user_id text not null,
  name text,
  tasks text[] not null default '{}',
  status text not null default 'active',
  raw jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (waba_id, meta_user_id)
);

create index if not exists idx_waba_assigned_users_org_waba
  on public.waba_assigned_users(organization_id, waba_id);

-- Keep updated_at semantics identical to the existing control-plane tables.
drop trigger if exists trg_whatsapp_flows_updated_at on public.whatsapp_flows;
create trigger trg_whatsapp_flows_updated_at
  before update on public.whatsapp_flows
  for each row execute function public.set_updated_at();

drop trigger if exists trg_waba_subscribed_apps_updated_at on public.waba_subscribed_apps;
create trigger trg_waba_subscribed_apps_updated_at
  before update on public.waba_subscribed_apps
  for each row execute function public.set_updated_at();

drop trigger if exists trg_waba_assigned_users_updated_at on public.waba_assigned_users;
create trigger trg_waba_assigned_users_updated_at
  before update on public.waba_assigned_users
  for each row execute function public.set_updated_at();

-- Browser reads inherit WABA scope. All writes remain backend/service-role only.
alter table public.whatsapp_flows enable row level security;
drop policy if exists whatsapp_flows_read_scope on public.whatsapp_flows;
create policy whatsapp_flows_read_scope on public.whatsapp_flows
  for select to authenticated
  using (private.can_read_waba(waba_id, 'wabas.read'));

alter table public.waba_subscribed_apps enable row level security;
drop policy if exists waba_subscribed_apps_read_scope on public.waba_subscribed_apps;
create policy waba_subscribed_apps_read_scope on public.waba_subscribed_apps
  for select to authenticated
  using (private.can_read_waba(waba_id, 'wabas.read'));

alter table public.waba_assigned_users enable row level security;
drop policy if exists waba_assigned_users_read_scope on public.waba_assigned_users;
create policy waba_assigned_users_read_scope on public.waba_assigned_users
  for select to authenticated
  using (private.can_read_waba(waba_id, 'wabas.read'));

-- Correct the historical seed typo when that exact legacy ID exists.
-- The live inventory on 2026-08-31 reports Meta Business ID 314437023701205.
do $do$
begin
  if exists (
    select 1 from public.business_portfolios
    where meta_business_id = '31443701205'
  ) and not exists (
    select 1 from public.business_portfolios
    where meta_business_id = '314437023701205'
  ) then
    update public.business_portfolios
      set meta_business_id = '314437023701205', updated_at = now()
    where meta_business_id = '31443701205';
  end if;
end
$do$;

commit;
