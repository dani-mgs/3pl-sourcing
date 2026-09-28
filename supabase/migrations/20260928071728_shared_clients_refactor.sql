-- Shared-client refactor, phase 1 (database only).
-- A client (company) becomes its own shared record; each 3PL sourcing
-- engagement for that client is a three_pl_projects row (was
-- client_requirements) pointing at it via client_id.

-- ============================================================
-- 1. clients table
-- ============================================================
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Names are unique case- and surrounding-whitespace-insensitively.
create unique index clients_name_unique on clients (lower(trim(name)));

create trigger clients_set_updated_at
  before update on clients
  for each row execute function set_updated_at();

-- ============================================================
-- 2. RLS + grants
-- ============================================================
alter table clients enable row level security;

create policy "Authenticated users can view clients"
  on clients for select to authenticated
  using (true);

create policy "Authenticated users can create clients"
  on clients for insert to authenticated
  with check (true);

create policy "Admins can update clients"
  on clients for update to authenticated
  using (is_admin());

create policy "Admins can delete clients"
  on clients for delete to authenticated
  using (is_admin());

grant select, insert, update, delete on table clients to authenticated;
grant select, insert, update, delete on table clients to service_role;

-- Supabase's default privileges grant every new public table to anon too.
-- RLS already denies anon (every policy is "to authenticated"), but clients
-- has no business being reachable without a login at all.
revoke all on table clients from anon;

-- ============================================================
-- 3. client_requirements -> three_pl_projects
-- ============================================================
-- Policies, triggers, indexes and foreign keys that reference this table
-- are stored by OID and follow the rename automatically.
alter table client_requirements rename to three_pl_projects;

-- ============================================================
-- 4. three_pl_projects.client_id
-- ============================================================
alter table three_pl_projects
  add column client_id uuid references clients(id) on delete restrict;

-- ============================================================
-- 5. Backfill: one client per distinct lower(trim(client_name))
-- ============================================================
-- When several projects share a name (in any case/spacing), the earliest
-- project supplies the client's name and business_model. The name is stored
-- trimmed.
insert into clients (name, business_model)
select distinct on (lower(trim(client_name)))
  trim(client_name),
  business_model
from three_pl_projects
order by lower(trim(client_name)), date_created, id;

update three_pl_projects p
set client_id = c.id
from clients c
where lower(trim(c.name)) = lower(trim(p.client_name));

-- ============================================================
-- 6. client_id required
-- ============================================================
-- Fails the whole migration if the backfill left any project unmatched.
alter table three_pl_projects alter column client_id set not null;

-- ============================================================
-- 7. Drop columns now owned by clients (or no longer used)
-- ============================================================
alter table three_pl_projects
  drop column client_name,
  drop column business_model,
  drop column current_incumbent_3pl;

-- ============================================================
-- 8. client_requirement_id -> three_pl_project_id
-- ============================================================
alter table three_pl_providers
  rename column client_requirement_id to three_pl_project_id;

alter table recommendation
  rename column client_requirement_id to three_pl_project_id;

-- ============================================================
-- 9. Rename leftovers that still use the old wording
-- ============================================================
alter trigger client_requirements_set_updated_at on three_pl_projects
  rename to three_pl_projects_set_updated_at;

alter table three_pl_projects
  rename constraint projects_pkey to three_pl_projects_pkey;

alter table three_pl_projects
  rename constraint projects_owner_id_fkey to three_pl_projects_owner_id_fkey;

alter policy "Authenticated users can create projects" on three_pl_projects
  rename to "Authenticated users can create 3PL projects";

alter policy "Authenticated users can view all projects" on three_pl_projects
  rename to "Authenticated users can view all 3PL projects";

alter policy "Owner or admin can update client requirements" on three_pl_projects
  rename to "Owner or admin can update 3PL projects";

alter policy "Owner or admin can delete client requirements" on three_pl_projects
  rename to "Owner or admin can delete 3PL projects";

-- ============================================================
-- 10. Fix three_pl_providers.status default
-- ============================================================
-- The old default 'Potential' isn't an allowed value under
-- three_pl_providers_status_check, so any insert that omitted status failed.
alter table three_pl_providers
  alter column status set default 'Potential / Not Contacted';
