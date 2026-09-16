-- Audit every inbound Meta webhook HTTP request without storing raw secrets/payloads.
-- POST requests record X-Hub-Signature-256 verification; GET requests record
-- hub.verify_token verification. Raw request bodies and tokens are never stored.

create table if not exists public.meta_webhook_request_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  webhook_endpoint_id uuid,
  method text not null check (method in ('GET', 'POST')),
  received_at timestamptz not null default now(),
  verification_type text not null check (verification_type in ('verify_token', 'signature')),
  verification_valid boolean not null default false,
  http_status integer not null,
  event_type text,
  meta_waba_id text,
  meta_phone_number_id text,
  request_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists meta_webhook_request_audit_org_received_idx
  on public.meta_webhook_request_audit (organization_id, received_at desc);

create index if not exists meta_webhook_request_audit_type_idx
  on public.meta_webhook_request_audit (organization_id, verification_type, verification_valid);

alter table public.meta_webhook_request_audit enable row level security;

comment on table public.meta_webhook_request_audit is
  'Server-written audit trail for every Meta webhook HTTP request; never stores raw secrets or payloads.';
