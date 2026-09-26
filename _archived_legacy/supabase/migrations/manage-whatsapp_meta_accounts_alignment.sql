-- Meta accounts alignment — pre-production

alter table public.wa_accounts
  add column if not exists business_manager_id text,
  add column if not exists business_name text,
  add column if not exists currency text,
  add column if not exists timezone_id text,
  add column if not exists template_namespace text,
  add column if not exists app_bindings jsonb not null default '[]'::jsonb,
  add column if not exists webhook_subscriptions jsonb not null default '[]'::jsonb,
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table public.wa_numbers
  add column if not exists display_phone_number text,
  add column if not exists verified_name text,
  add column if not exists quality_rating text,
  add column if not exists account_mode text,
  add column if not exists platform_type text,
  add column if not exists throughput jsonb,
  add column if not exists meta jsonb not null default '{}'::jsonb;

update public.wa_numbers
set display_phone_number = coalesce(display_phone_number, phone_e164)
where display_phone_number is null;

create index if not exists idx_wa_accounts_business_manager_id on public.wa_accounts (business_manager_id);
create index if not exists idx_wa_numbers_status on public.wa_numbers (tenant_id, status);
create index if not exists idx_wa_numbers_display_phone on public.wa_numbers (tenant_id, display_phone_number);
