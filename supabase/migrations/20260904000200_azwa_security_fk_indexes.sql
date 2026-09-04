-- ============================================================================
-- AzWA — 001A Security + FK Index Patch
-- Target: existing CLEAN 001 baseline already created successfully.
-- Safe patch: NO DROP TABLE, NO column/type changes, NO data mutation.
-- Purpose:
--   1) Make the server-only RLS intent explicit with policies.
--   2) Add covering indexes for every FK flagged by Supabase Performance Advisor.
-- ============================================================================
begin;

-- --------------------------------------------------------------------------
-- 0) Guard: this patch belongs only to the AzWA 001 baseline
-- --------------------------------------------------------------------------
do $$
declare
  expected_tables constant text[] := array[
    'organizations','profiles','organization_members','roles','permissions',
    'role_permissions','user_roles','teams','team_members',
    'business_portfolios','meta_apps','meta_system_users','wabas','meta_app_wabas',
    'whatsapp_numbers','meta_credentials','user_business_access','user_waba_access',
    'user_number_access','team_number_access','webhook_endpoints','templates',
    'whatsapp_flows','waba_subscribed_apps','waba_assigned_users'
  ];
  missing_tables text[];
begin
  select array_agg(t order by t)
    into missing_tables
  from unnest(expected_tables) as t
  where to_regclass(format('public.%I', t)) is null;

  if missing_tables is not null then
    raise exception
      'AzWA 001A patch aborted. Missing expected 001 tables: %',
      array_to_string(missing_tables, ', ');
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- 0A) Re-assert server-only table privileges (idempotent defense-in-depth)
-- --------------------------------------------------------------------------
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

-- --------------------------------------------------------------------------
-- 1) Explicit server-only RLS policies
--
-- IMPORTANT:
-- 001 intentionally REVOKED all direct anon/authenticated table privileges.
-- These policies make the intent explicit and remove "RLS enabled no policy"
-- advisor notices, while continuing to deny direct Data API access.
--
-- service_role is not targeted by these policies and bypasses RLS.
--
-- Policy is intentionally PERMISSIVE + false:
--   - today: direct client access remains denied;
--   - later: when a table is deliberately exposed, a real policy can be added
--            without a restrictive-false policy blocking it permanently.
-- --------------------------------------------------------------------------
do $$
declare
  t text;
  tables_to_protect constant text[] := array[
    'organizations','profiles','organization_members','roles','permissions',
    'role_permissions','user_roles','teams','team_members',
    'business_portfolios','meta_apps','meta_system_users','wabas','meta_app_wabas',
    'whatsapp_numbers','meta_credentials','user_business_access','user_waba_access',
    'user_number_access','team_number_access','webhook_endpoints','templates',
    'whatsapp_flows','waba_subscribed_apps','waba_assigned_users'
  ];
begin
  foreach t in array tables_to_protect
  loop
    if not exists (
      select 1
      from pg_catalog.pg_policies p
      where p.schemaname = 'public'
        and p.tablename = t
        and p.policyname = 'no_direct_client_access'
    ) then
      execute format(
        'create policy no_direct_client_access
           on public.%I
           as permissive
           for all
           to anon, authenticated
           using (false)
           with check (false)',
        t
      );
    end if;
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- 2) Covering indexes for every FK reported by Supabase Advisor
--
-- Index column order follows the FK child-side columns.
-- Normal CREATE INDEX is intentional: the database is fresh and this patch
-- remains transaction-safe. CREATE INDEX CONCURRENTLY cannot run in BEGIN.
-- --------------------------------------------------------------------------

-- meta_app_wabas
create index if not exists idx_azwa_fk_meta_app_wabas_app
  on public.meta_app_wabas(meta_app_id, organization_id);

create index if not exists idx_azwa_fk_meta_app_wabas_waba
  on public.meta_app_wabas(waba_id, organization_id);

-- meta_apps
create index if not exists idx_azwa_fk_meta_apps_portfolio
  on public.meta_apps(business_portfolio_id, organization_id);

-- meta_credentials
create index if not exists idx_azwa_fk_credentials_app
  on public.meta_credentials(meta_app_id, organization_id);

create index if not exists idx_azwa_fk_credentials_number
  on public.meta_credentials(whatsapp_number_id, organization_id);

create index if not exists idx_azwa_fk_credentials_portfolio
  on public.meta_credentials(business_portfolio_id, organization_id);

create index if not exists idx_azwa_fk_credentials_system_user
  on public.meta_credentials(meta_system_user_id, organization_id);

create index if not exists idx_azwa_fk_credentials_waba
  on public.meta_credentials(waba_id, organization_id);

-- meta_system_users
create index if not exists idx_azwa_fk_system_users_portfolio
  on public.meta_system_users(business_portfolio_id, organization_id);

-- role_permissions
create index if not exists idx_azwa_fk_role_permissions_permission
  on public.role_permissions(permission_id);

-- team_members
create index if not exists idx_azwa_fk_team_members_org_member
  on public.team_members(organization_id, user_id);

create index if not exists idx_azwa_fk_team_members_team
  on public.team_members(team_id, organization_id);

-- team_number_access
create index if not exists idx_azwa_fk_team_number_access_number
  on public.team_number_access(whatsapp_number_id, organization_id);

create index if not exists idx_azwa_fk_team_number_access_team
  on public.team_number_access(team_id, organization_id);

-- templates
create index if not exists idx_azwa_fk_templates_waba
  on public.templates(waba_id, organization_id);

-- user_business_access
create index if not exists idx_azwa_fk_user_business_member
  on public.user_business_access(organization_id, user_id);

create index if not exists idx_azwa_fk_user_business_portfolio
  on public.user_business_access(business_portfolio_id, organization_id);

-- user_number_access
create index if not exists idx_azwa_fk_user_number_member
  on public.user_number_access(organization_id, user_id);

create index if not exists idx_azwa_fk_user_number_number
  on public.user_number_access(whatsapp_number_id, organization_id);

-- user_roles
create index if not exists idx_azwa_fk_user_roles_role
  on public.user_roles(role_id);

-- user_waba_access
create index if not exists idx_azwa_fk_user_waba_member
  on public.user_waba_access(organization_id, user_id);

create index if not exists idx_azwa_fk_user_waba_waba
  on public.user_waba_access(waba_id, organization_id);

-- waba_assigned_users
create index if not exists idx_azwa_fk_waba_assigned_system_user
  on public.waba_assigned_users(local_system_user_id, organization_id);

create index if not exists idx_azwa_fk_waba_assigned_waba
  on public.waba_assigned_users(waba_id, organization_id);

-- waba_subscribed_apps
create index if not exists idx_azwa_fk_waba_subscribed_local_app
  on public.waba_subscribed_apps(local_meta_app_id, organization_id);

create index if not exists idx_azwa_fk_waba_subscribed_waba
  on public.waba_subscribed_apps(waba_id, organization_id);

-- wabas
create index if not exists idx_azwa_fk_wabas_portfolio
  on public.wabas(business_portfolio_id, organization_id);

-- webhook_endpoints
create index if not exists idx_azwa_fk_webhook_app
  on public.webhook_endpoints(meta_app_id, organization_id);

create index if not exists idx_azwa_fk_webhook_app_secret
  on public.webhook_endpoints(app_secret_credential_id, organization_id);

create index if not exists idx_azwa_fk_webhook_verify_credential
  on public.webhook_endpoints(verify_token_credential_id, organization_id);

-- whatsapp_flows
create index if not exists idx_azwa_fk_flows_waba
  on public.whatsapp_flows(waba_id, organization_id);

-- whatsapp_numbers
create index if not exists idx_azwa_fk_numbers_waba
  on public.whatsapp_numbers(waba_id, organization_id);

commit;

-- ============================================================================
-- Verification queries
-- ============================================================================

-- Expected: 25
select count(*) as azwa_explicit_rls_policy_count
from pg_catalog.pg_policies
where schemaname = 'public'
  and policyname = 'no_direct_client_access'
  and tablename = any (array[
    'organizations','profiles','organization_members','roles','permissions',
    'role_permissions','user_roles','teams','team_members',
    'business_portfolios','meta_apps','meta_system_users','wabas','meta_app_wabas',
    'whatsapp_numbers','meta_credentials','user_business_access','user_waba_access',
    'user_number_access','team_number_access','webhook_endpoints','templates',
    'whatsapp_flows','waba_subscribed_apps','waba_assigned_users'
  ]);

-- Expected: 32
select count(*) as azwa_fk_patch_index_count
from pg_catalog.pg_indexes
where schemaname = 'public'
  and indexname like 'idx_azwa_fk_%';

-- Expected: 0 rows.
-- This verifies that anon/authenticated still have no table privileges.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name = any (array[
    'organizations','profiles','organization_members','roles','permissions',
    'role_permissions','user_roles','teams','team_members',
    'business_portfolios','meta_apps','meta_system_users','wabas','meta_app_wabas',
    'whatsapp_numbers','meta_credentials','user_business_access','user_waba_access',
    'user_number_access','team_number_access','webhook_endpoints','templates',
    'whatsapp_flows','waba_subscribed_apps','waba_assigned_users'
  ])
order by table_name, grantee, privilege_type;
