-- AzWA production: separate media read access from media-management actions.
-- Viewer remains read-only. Owner/Admin/Operator may retry/archive media.

begin;

insert into public.permissions(code, description)
values ('media.manage', 'Manage archived media and retry failed archival')
on conflict (code) do update
set description = excluded.description;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code in ('owner', 'admin', 'operator')
  and p.code = 'media.manage'
on conflict (role_id, permission_id) do nothing;

commit;
