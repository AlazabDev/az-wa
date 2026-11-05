create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create type public.app_role as enum ('admin','moderator','user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles read" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'user') on conflict do nothing;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  phone text not null,
  whatsapp_id text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.contacts to authenticated;
grant all on public.contacts to service_role;
alter table public.contacts enable row level security;
create policy "own contacts" on public.contacts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_contacts_user on public.contacts(user_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'active',
  unread_count integer not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;
create policy "own conversations" on public.conversations for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_conversations_user on public.conversations(user_id);
create index idx_conversations_contact on public.conversations(contact_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  content text,
  direction text not null default 'outbound',
  status text not null default 'sent',
  media_url text,
  media_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "own messages" on public.messages for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_messages_conversation on public.messages(conversation_id);
create index idx_messages_user on public.messages(user_id);

create trigger t_profiles_updated before update on public.profiles for each row execute function public.update_updated_at_column();
create trigger t_contacts_updated before update on public.contacts for each row execute function public.update_updated_at_column();
create trigger t_conversations_updated before update on public.conversations for each row execute function public.update_updated_at_column();
create trigger t_messages_updated before update on public.messages for each row execute function public.update_updated_at_column();