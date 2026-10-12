-- Client updates (client dashboard plan, Phase 2a).
--
-- A client update is a snapshot of one engagement (a 3PL or a forwarder
-- project) that an expert deliberately shares with the client: the stage,
-- a headline, "where we are", the next step and a payload of client-safe
-- figures built on the server from an allow-list (src/lib/client-updates/).
-- Every snapshot is kept; the client will see the latest published one, and
-- the history feeds "recent updates".
--
-- In this phase the table is STAFF-ONLY, like every internal table: client
-- users get 0 rows (pgTAP 28 checks every table). Opening published rows to
-- their own client is a separate migration (Phase 2b), so that change can be
-- reviewed on its own.
--
-- 1. client_updates: exactly one project, client_id always taken from the
--    project, published_by / published_at forced on publish, published rows
--    immutable, at most one draft per project, payload top-level keys
--    allow-listed.
-- 2. client_update_inputs: the form inputs behind an update (internal partner
--    ids, chart choices). Kept apart because RLS can't hide a column, and
--    these never become client-readable.
-- 3. A project's client can't be changed once an update has been published
--    to that client.

-- ---- 1. client_updates ------------------------------------------------------------

-- The payload's top-level keys must come from this list (the full allow-list
-- is payload-schema.ts; this is a cheap backstop in the database).
create function public.client_update_payload_ok(p_payload jsonb, p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_payload) <> 'object' then false
    else p_payload ->> 'v' = '1'
      and p_payload ->> 'kind' = p_kind
      and not exists (
        select 1 from jsonb_object_keys(p_payload) as k(key)
        where k.key not in ('v', 'kind', 'project', 'author', 'contact', 'milestones',
                            'funnel', 'comparison', 'recommendation'))
  end;
$$;

revoke all on function public.client_update_payload_ok(jsonb, text) from public, anon;
grant execute on function public.client_update_payload_ok(jsonb, text) to authenticated, service_role;

create table public.client_updates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  three_pl_project_id uuid references public.three_pl_projects (id) on delete cascade,
  forwarder_project_id uuid references public.forwarder_projects (id) on delete cascade,
  stage smallint not null check (stage between 1 and 7),
  headline text not null check (char_length(btrim(headline)) between 1 and 120),
  summary text not null check (char_length(btrim(summary)) between 1 and 1200),
  next_step text check (next_step is null or char_length(next_step) <= 200),
  next_step_due date,
  needs_client_action boolean not null default false,
  payload jsonb not null,
  is_draft boolean not null default true,
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_updates_one_project
    check (num_nonnulls(three_pl_project_id, forwarder_project_id) = 1),
  constraint client_updates_published_at
    check (is_draft = (published_at is null)),
  constraint client_updates_payload_allowed
    check (public.client_update_payload_ok(
      payload, case when three_pl_project_id is not null then 'three_pl' else 'forwarder' end))
);

comment on table public.client_updates is
  'Snapshots of an engagement shared with the client. Payload built server-side from an allow-list. Staff-only until Phase 2b.';

create index client_updates_three_pl_project_idx on public.client_updates (three_pl_project_id);
create index client_updates_forwarder_project_idx on public.client_updates (forwarder_project_id);
create index client_updates_client_published_idx on public.client_updates (client_id, published_at desc)
  where not is_draft;
create unique index client_updates_one_three_pl_draft on public.client_updates (three_pl_project_id)
  where is_draft;
create unique index client_updates_one_forwarder_draft on public.client_updates (forwarder_project_id)
  where is_draft;

-- Signed-in users can't choose the client, the author or the dates: the
-- client is the project's, and published_by / published_at are the caller
-- and now. Published rows can't change. Only a write with no signed-in user
-- (the local seed, using the service role) may set past dates.
create function public.client_updates_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'UPDATE' then
    if not old.is_draft then
      raise exception 'Published updates can''t be changed. Publish a new update instead.'
        using errcode = 'P0001';
    end if;
    if new.three_pl_project_id is distinct from old.three_pl_project_id
       or new.forwarder_project_id is distinct from old.forwarder_project_id then
      raise exception 'An update can''t be moved to another project.' using errcode = 'P0001';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  elsif v_uid is not null then
    new.created_by := v_uid;
    new.created_at := now();
  end if;

  if new.three_pl_project_id is not null then
    select p.client_id into new.client_id
    from public.three_pl_projects p where p.id = new.three_pl_project_id;
  else
    select p.client_id into new.client_id
    from public.forwarder_projects p where p.id = new.forwarder_project_id;
  end if;

  if new.is_draft then
    new.published_by := null;
    new.published_at := null;
  elsif v_uid is not null then
    new.published_by := v_uid;
    new.published_at := now();
  else
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

create trigger client_updates_before_write
  before insert or update on public.client_updates
  for each row execute function public.client_updates_before_write();
create trigger client_updates_set_updated_at
  before update on public.client_updates
  for each row execute function public.set_updated_at();

-- Owner of the update's project, or an admin: the same rule as every other
-- project write.
create function public.can_write_client_update(p_three_pl_project_id uuid, p_forwarder_project_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
      select 1 from public.three_pl_projects p
      where p.id = p_three_pl_project_id and (p.owner_id = auth.uid() or public.is_admin()))
    or exists (
      select 1 from public.forwarder_projects p
      where p.id = p_forwarder_project_id and (p.owner_id = auth.uid() or public.is_admin()));
$$;

revoke all on function public.can_write_client_update(uuid, uuid) from public, anon;
grant execute on function public.can_write_client_update(uuid, uuid) to authenticated, service_role;

alter table public.client_updates enable row level security;

create policy "Requires a staff role" on public.client_updates
  as restrictive for all to authenticated
  using ((select public.has_staff_role()))
  with check ((select public.has_staff_role()));
create policy "Staff can read client updates" on public.client_updates
  for select to authenticated using (true);
create policy "Owner or admin can add client updates" on public.client_updates
  for insert to authenticated
  with check (public.can_write_client_update(three_pl_project_id, forwarder_project_id));
create policy "Owner or admin can edit draft client updates" on public.client_updates
  for update to authenticated
  using (is_draft and public.can_write_client_update(three_pl_project_id, forwarder_project_id))
  with check (public.can_write_client_update(three_pl_project_id, forwarder_project_id));
-- Drafts: the owner or an admin. Published updates: admins only.
create policy "Owner or admin can remove drafts; admins any update" on public.client_updates
  for delete to authenticated
  using ((is_draft and public.can_write_client_update(three_pl_project_id, forwarder_project_id))
         or public.is_admin());

revoke all on table public.client_updates from public, anon, authenticated;
grant select, insert, update, delete on table public.client_updates to authenticated;
grant select, insert, update, delete on table public.client_updates to service_role;

-- ---- 2. client_update_inputs ------------------------------------------------------
create table public.client_update_inputs (
  client_update_id uuid primary key references public.client_updates (id) on delete cascade,
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_update_inputs is
  'Form inputs behind a client update (internal partner ids, chart choices). Staff-only, always.';

create trigger client_update_inputs_set_updated_at
  before update on public.client_update_inputs
  for each row execute function public.set_updated_at();

alter table public.client_update_inputs enable row level security;

create policy "Requires a staff role" on public.client_update_inputs
  as restrictive for all to authenticated
  using ((select public.has_staff_role()))
  with check ((select public.has_staff_role()));
create policy "Staff can read client update inputs" on public.client_update_inputs
  for select to authenticated using (true);
create policy "Owner or admin can add inputs to a draft" on public.client_update_inputs
  for insert to authenticated
  with check (exists (
    select 1 from public.client_updates u
    where u.id = client_update_id and u.is_draft
      and public.can_write_client_update(u.three_pl_project_id, u.forwarder_project_id)));
create policy "Owner or admin can edit a draft's inputs" on public.client_update_inputs
  for update to authenticated
  using (exists (
    select 1 from public.client_updates u
    where u.id = client_update_id and u.is_draft
      and public.can_write_client_update(u.three_pl_project_id, u.forwarder_project_id)))
  with check (exists (
    select 1 from public.client_updates u
    where u.id = client_update_id and u.is_draft
      and public.can_write_client_update(u.three_pl_project_id, u.forwarder_project_id)));
create policy "Owner or admin can remove a draft's inputs" on public.client_update_inputs
  for delete to authenticated
  using (exists (
    select 1 from public.client_updates u
    where u.id = client_update_id and u.is_draft
      and public.can_write_client_update(u.three_pl_project_id, u.forwarder_project_id)));

revoke all on table public.client_update_inputs from public, anon, authenticated;
grant select, insert, update, delete on table public.client_update_inputs to authenticated;
grant select, insert, update, delete on table public.client_update_inputs to service_role;

-- ---- 3. A project's client is fixed once something is published --------------------
-- Otherwise the old client would keep seeing updates about a project that is
-- no longer theirs. Runs as owner so the check can't be hidden by RLS.
create function public.refuse_client_change_after_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.client_id is distinct from old.client_id and exists (
    select 1 from public.client_updates u
    where not u.is_draft
      and (case when tg_table_name = 'three_pl_projects'
                then u.three_pl_project_id else u.forwarder_project_id end) = new.id
  ) then
    raise exception 'Updates for this project have been shared with its client, so its client can''t be changed. If it''s linked to the wrong client, ask an admin to remove the shared updates first.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.refuse_client_change_after_publish() from public, anon, authenticated;

create trigger forwarder_projects_client_fixed_after_publish
  before update of client_id on public.forwarder_projects
  for each row execute function public.refuse_client_change_after_publish();
create trigger three_pl_projects_client_fixed_after_publish
  before update of client_id on public.three_pl_projects
  for each row execute function public.refuse_client_change_after_publish();
