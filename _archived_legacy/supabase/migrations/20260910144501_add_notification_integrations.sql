create table public.notification_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  webhook_secret text not null default encode(gen_random_bytes(16), 'hex'),
  sender_number_id uuid not null references public.whatsapp_numbers(id) on delete restrict,
  recipient_numbers text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  constraint notification_integrations_org_name_key unique (organization_id, name)
);

create index idx_notification_integrations_org on public.notification_integrations(organization_id);
create index idx_notification_integrations_secret on public.notification_integrations(webhook_secret);

create trigger trg_notification_integrations_updated_at
before update on public.notification_integrations
for each row execute function public.update_updated_at_column();

alter table public.notification_integrations enable row level security;

create policy "Users can view notification integrations of their organization"
  on public.notification_integrations for select
  using (
    public.azwa_has_org_permission(organization_id, 'integrations.read')
    or
    exists (
      select 1 from public.organization_members
      where organization_members.organization_id = notification_integrations.organization_id
      and organization_members.user_id = auth.uid()
      and organization_members.status = 'active'
    )
  );

create policy "Users can insert notification integrations to their organization"
  on public.notification_integrations for insert
  with check (
    public.azwa_has_org_permission(organization_id, 'integrations.manage')
  );

create policy "Users can update notification integrations in their organization"
  on public.notification_integrations for update
  using (
    public.azwa_has_org_permission(organization_id, 'integrations.manage')
  );

create policy "Users can delete notification integrations in their organization"
  on public.notification_integrations for delete
  using (
    public.azwa_has_org_permission(organization_id, 'integrations.manage')
  );
