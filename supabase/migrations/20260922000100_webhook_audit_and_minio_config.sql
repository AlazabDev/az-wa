-- =============================================================================
-- AzWA — Webhook Audit Table + MinIO Storage Tracking
-- Depends on: 001 Core Identity, 002 Messaging Runtime
-- Purpose:
--   1. Create meta_webhook_request_audit for complete inbound request logging
--   2. Add media.storage_provider='minio' tracking fields (if not present)
--   3. Seed/update the production webhook_endpoint with correct callback URL
--   4. Ensure the 'integrations.manage' permission exists (needed by notifications)
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) meta_webhook_request_audit
--    Logs every inbound request from Meta (GET challenges + POST events)
--    before any business logic runs. No secrets are stored here.
-- ---------------------------------------------------------------------------

create table if not exists public.meta_webhook_request_audit (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  webhook_endpoint_id uuid,
  -- HTTP basics
  method           text not null check (method in ('GET','POST')),
  received_at      timestamptz not null default now(),
  -- Verification
  verification_type  text check (verification_type in ('verify_token','signature')),
  verification_valid boolean not null default false,
  http_status        integer not null default 200,
  -- Meta event fields (extracted from payload, NOT the raw payload)
  event_type         text,
  meta_waba_id       text,
  meta_phone_number_id text,
  request_id         text,
  -- Audit
  created_at         timestamptz not null default now()
);

-- Soft FK — webhook_endpoints may not exist yet in minimal installs
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meta_webhook_request_audit'::regclass
      and conname  = 'mwra_endpoint_fk'
  ) then
    alter table public.meta_webhook_request_audit
      add constraint mwra_endpoint_fk
      foreign key (webhook_endpoint_id, organization_id)
      references public.webhook_endpoints(id, organization_id)
      on delete set null (webhook_endpoint_id);
  end if;
exception when others then null;
end $$;

-- Indexes for the UI query patterns
create index if not exists idx_mwra_org_received
  on public.meta_webhook_request_audit(organization_id, received_at desc);

create index if not exists idx_mwra_endpoint_received
  on public.meta_webhook_request_audit(webhook_endpoint_id, received_at desc);

create index if not exists idx_mwra_event_type
  on public.meta_webhook_request_audit(organization_id, event_type, received_at desc);

create index if not exists idx_mwra_phone_number
  on public.meta_webhook_request_audit(organization_id, meta_phone_number_id, received_at desc);

-- RLS — service_role only (no browser access)
alter table public.meta_webhook_request_audit enable row level security;
revoke all on public.meta_webhook_request_audit from anon, authenticated;
grant select, insert, update on public.meta_webhook_request_audit to service_role;


-- ---------------------------------------------------------------------------
-- 2) Ensure media table has all MinIO tracking columns
-- ---------------------------------------------------------------------------

alter table public.media
  add column if not exists storage_provider text,
  add column if not exists storage_bucket   text,
  add column if not exists storage_path     text,
  add column if not exists download_status  text not null default 'pending'
    check (download_status in ('pending','downloading','downloaded','failed')),
  add column if not exists download_attempts integer not null default 0,
  add column if not exists last_error       text,
  add column if not exists stored_at        timestamptz,
  add column if not exists sha256           text;

-- Index for media worker drain query
create index if not exists idx_media_download_status_org
  on public.media(organization_id, download_status, created_at asc)
  where download_status in ('pending','failed');

create index if not exists idx_media_minio_path
  on public.media(organization_id, storage_provider, storage_path)
  where storage_provider = 'minio';


-- ---------------------------------------------------------------------------
-- 3) Update the production webhook_endpoint with status = 'active'
--    The seed (migration 003) inserts it as pending_credentials.
--    Once secrets are in Vault this should be active.
-- ---------------------------------------------------------------------------

update public.webhook_endpoints we
set
  status                = 'active',
  url                   = 'https://wa.alazab.com/webhooks/meta/whatsapp',
  updated_at            = now()
from public.organizations o
where o.slug = 'alazab-group'
  and we.organization_id = o.id
  and we.endpoint_type   = 'meta_whatsapp'
  and we.url             = 'https://wa.alazab.com/webhooks/meta/whatsapp';


-- ---------------------------------------------------------------------------
-- 4) Ensure integrations.manage permission exists (used by notifications page)
-- ---------------------------------------------------------------------------

insert into public.permissions(code, description)
values
  ('integrations.manage', 'Manage notification and third-party integrations')
on conflict (code) do nothing;

-- Grant to owner and admin roles
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code in ('owner', 'admin')
  and p.code  = 'integrations.manage'
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- 5) Ensure media.manage permission exists (used by retryStoredFile)
-- ---------------------------------------------------------------------------

insert into public.permissions(code, description)
values
  ('media.manage', 'Manage and re-process archived WhatsApp media')
on conflict (code) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code in ('owner', 'admin', 'operator')
  and p.code  = 'media.manage'
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- 6) Function: record one Meta webhook request (called from TanStack Start)
-- ---------------------------------------------------------------------------

create or replace function public.backend_audit_webhook_request(
  p_organization_id     uuid,
  p_webhook_endpoint_id uuid,
  p_method              text,
  p_verification_type   text,
  p_verification_valid  boolean,
  p_http_status         integer,
  p_event_type          text   default null,
  p_meta_waba_id        text   default null,
  p_meta_phone_number_id text  default null,
  p_request_id          text   default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.meta_webhook_request_audit(
    organization_id, webhook_endpoint_id, method,
    verification_type, verification_valid, http_status,
    event_type, meta_waba_id, meta_phone_number_id, request_id,
    received_at, created_at
  ) values (
    p_organization_id, p_webhook_endpoint_id, p_method,
    p_verification_type, p_verification_valid, p_http_status,
    p_event_type, p_meta_waba_id, p_meta_phone_number_id, p_request_id,
    now(), now()
  );
$$;

revoke all on function public.backend_audit_webhook_request(uuid,uuid,text,text,boolean,integer,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.backend_audit_webhook_request(uuid,uuid,text,text,boolean,integer,text,text,text,text)
  to service_role;


-- ---------------------------------------------------------------------------
-- 7) Keep webhook_endpoints.last_event_at up to date (already in runtime 002,
--    but ensure column exists in minimal deployments)
-- ---------------------------------------------------------------------------

alter table public.webhook_endpoints
  add column if not exists last_event_at   timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_failure_at timestamptz,
  add column if not exists verification_status text;

commit;
