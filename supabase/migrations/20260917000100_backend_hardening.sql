-- Backend hardening applied after the Meta webhook request audit.

create index if not exists media_organization_id_idx
  on public.media (organization_id);

create index if not exists media_download_attempts_organization_id_idx
  on public.media_download_attempts (organization_id);

create index if not exists message_send_attempts_organization_id_idx
  on public.message_send_attempts (organization_id);

create index if not exists message_status_history_organization_id_idx
  on public.message_status_history (organization_id);

create index if not exists webhook_event_attempts_organization_id_idx
  on public.webhook_event_attempts (organization_id);

alter table public.meta_webhook_request_audit
  add constraint meta_webhook_request_audit_org_fk
  foreign key (organization_id) references public.organizations(id) on delete cascade;

alter table public.meta_webhook_request_audit
  add constraint meta_webhook_request_audit_endpoint_fk
  foreign key (webhook_endpoint_id, organization_id)
  references public.webhook_endpoints(id, organization_id) on delete set null;

create index if not exists meta_webhook_request_audit_endpoint_idx
  on public.meta_webhook_request_audit (webhook_endpoint_id, organization_id);

alter table public.meta_webhook_request_audit enable row level security;

drop policy if exists no_direct_client_access on public.meta_webhook_request_audit;
create policy no_direct_client_access on public.meta_webhook_request_audit
  for all to anon, authenticated
  using (false)
  with check (false);

-- PostgreSQL 17: reporting views must use caller permissions so base-table RLS applies.
alter view public.v_number_message_stats_24h set (security_invoker = true);
alter view public.v_whatsapp_structure set (security_invoker = true);
