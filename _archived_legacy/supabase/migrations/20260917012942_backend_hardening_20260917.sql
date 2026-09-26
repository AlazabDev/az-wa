-- Backend hardening: Meta webhook request audit, FK indexes, and RLS-safe views.

create table if not exists public.meta_webhook_request_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  webhook_endpoint_id uuid,
  method text not null check (method in ('GET','POST')),
  received_at timestamptz not null default now(),
  verification_type text not null check (verification_type in ('verify_token','signature')),
  verification_valid boolean not null default false,
  http_status integer not null,
  event_type text,
  meta_waba_id text,
  meta_phone_number_id text,
  request_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint meta_webhook_request_audit_org_fk foreign key (organization_id) references public.organizations(id) on delete cascade,
  constraint meta_webhook_request_audit_endpoint_fk foreign key (webhook_endpoint_id, organization_id) references public.webhook_endpoints(id, organization_id) on delete set null
);

create index if not exists meta_webhook_request_audit_org_received_idx
  on public.meta_webhook_request_audit (organization_id, received_at desc);
create index if not exists meta_webhook_request_audit_type_idx
  on public.meta_webhook_request_audit (organization_id, verification_type, verification_valid);
create index if not exists meta_webhook_request_audit_endpoint_idx
  on public.meta_webhook_request_audit (webhook_endpoint_id, organization_id);

alter table public.meta_webhook_request_audit enable row level security;

drop policy if exists no_direct_client_access on public.meta_webhook_request_audit;
create policy no_direct_client_access on public.meta_webhook_request_audit
  for all to anon, authenticated using (false) with check (false);

create index if not exists media_organization_id_idx on public.media (organization_id);
create index if not exists media_download_attempts_organization_id_idx on public.media_download_attempts (organization_id);
create index if not exists message_send_attempts_organization_id_idx on public.message_send_attempts (organization_id);
create index if not exists message_status_history_organization_id_idx on public.message_status_history (organization_id);
create index if not exists webhook_event_attempts_organization_id_idx on public.webhook_event_attempts (organization_id);

alter view public.v_number_message_stats_24h set (security_invoker = true);
alter view public.v_whatsapp_structure set (security_invoker = true);

comment on table public.meta_webhook_request_audit is
  'Server-written audit trail for inbound Meta webhook HTTP requests; never stores raw secrets or payloads.';
