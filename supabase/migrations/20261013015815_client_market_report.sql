-- The Market Report (client dashboard plan, Phase 2c).
--
-- A Market Report is a paid-plan snapshot of a whole forwarder search: every
-- forwarder Move contacted, with shortlisted ones named and every other one
-- shown as "Partner D", "Partner E", ... The payload is built on the server
-- from an allow-list (src/lib/client-updates/build-market-report.ts).
--
-- Like client_updates, the tables are STAFF-ONLY. Row-level security can't
-- hide columns (forwarder_project_id, published_by, the expert's inputs), so
-- clients read reports only through functions that return safe columns:
--
-- 1. client_has_paid_tier(client_id): the paid-plan check, in one place.
-- 2. client_market_reports: immutable, insert-only reports (no drafts: the
--    preview stands in for one). client_id comes from the project.
-- 3. market_report_partner_labels: which forwarder is "Partner E" in a
--    project. Staff-only, never updated or deleted, so a letter always means
--    the same forwarder and is never reused (a deleted forwarder keeps its
--    letter, with forwarder_id set to null).
-- 4. assign_partner_labels(project, forwarder_ids): gives the next letters to
--    forwarders that don't have one yet (caller's own rights, so RLS applies).
-- 5. market_report_rows(client_id): internal. The latest report per project,
--    only while that client is on the paid plan.
-- 6. my_market_reports() for clients; market_reports_for_client(client_id)
--    for staff "View as client" (exactly the client's answer).
-- 7. A project's client stays fixed once a report has been published.
--
-- Supabase grants EXECUTE on new public functions to anon and authenticated
-- by default, so every grant below is explicit.

-- ---- 1. The paid-plan check ----------------------------------------------------------
-- True only for tier market_report with no end date or one in the future.
-- Anyone who isn't staff only gets an answer about their own client, so a
-- client can't probe other clients' plans.
create function public.client_has_paid_tier(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select e.tier = 'market_report' and (e.valid_until is null or e.valid_until > pg_catalog.now())
    from public.client_entitlements e
    where e.client_id = p_client_id
      and p_client_id is not null
      and (public.has_staff_role() or p_client_id = public.my_client_id())
  ), false);
$$;

revoke all on function public.client_has_paid_tier(uuid) from public, anon;
grant execute on function public.client_has_paid_tier(uuid) to authenticated, service_role;

-- ---- 2. client_market_reports ------------------------------------------------------------
-- The payload's top-level keys (the full allow-list is payload-schema.ts).
create function public.market_report_payload_ok(p_payload jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_payload) <> 'object' then false
    else p_payload ->> 'v' = '1'
      and p_payload ->> 'kind' = 'market_report'
      and not exists (
        select 1 from jsonb_object_keys(p_payload) as k(key)
        where k.key not in ('v', 'kind', 'project', 'author', 'today', 'partners'))
  end;
$$;

revoke all on function public.market_report_payload_ok(jsonb) from public, anon;
grant execute on function public.market_report_payload_ok(jsonb) to authenticated, service_role;

create table public.client_market_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  forwarder_project_id uuid not null references public.forwarder_projects (id) on delete cascade,
  payload jsonb not null constraint client_market_reports_payload_allowed
    check (public.market_report_payload_ok(payload)),
  -- The expert's form inputs (forwarder ids, profiles, Move's take), to
  -- prefill the next report. Never returned to clients.
  inputs jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs) = 'object'),
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.client_market_reports is
  'Paid Market Reports per forwarder project. Staff-only; clients read the latest one through my_market_reports() while on the paid plan.';

create index client_market_reports_project_idx
  on public.client_market_reports (forwarder_project_id, published_at desc);
create index client_market_reports_client_idx on public.client_market_reports (client_id);

-- The client is the project's, the author is the caller and the date is now.
-- Only a write with no signed-in user (the local seed) may set a past date.
-- Reports can't be changed: publish a new one.
create function public.client_market_reports_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Published Market Reports can''t be changed. Publish a new one instead.'
      using errcode = 'P0001';
  end if;
  select p.client_id into new.client_id
  from public.forwarder_projects p where p.id = new.forwarder_project_id;
  if auth.uid() is not null then
    new.published_by := auth.uid();
    new.published_at := now();
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger client_market_reports_before_write
  before insert or update on public.client_market_reports
  for each row execute function public.client_market_reports_before_write();

alter table public.client_market_reports enable row level security;

create policy "Requires a staff role" on public.client_market_reports
  as restrictive for all to authenticated
  using ((select public.has_staff_role()))
  with check ((select public.has_staff_role()));
create policy "Staff can read Market Reports" on public.client_market_reports
  for select to authenticated using (true);
create policy "Owner or admin can publish Market Reports" on public.client_market_reports
  for insert to authenticated
  with check (public.can_write_client_update(null, forwarder_project_id));
create policy "Admins can remove Market Reports" on public.client_market_reports
  for delete to authenticated using (public.is_admin());

revoke all on table public.client_market_reports from public, anon, authenticated;
grant select, insert, delete on table public.client_market_reports to authenticated;
grant select, insert, update, delete on table public.client_market_reports to service_role;

-- ---- 3. market_report_partner_labels ------------------------------------------------------
create table public.market_report_partner_labels (
  id uuid primary key default gen_random_uuid(),
  forwarder_project_id uuid not null references public.forwarder_projects (id) on delete cascade,
  forwarder_id uuid references public.forwarders (id) on delete set null,
  label text not null check (label ~ '^[A-Z]{1,2}$'),
  created_at timestamptz not null default now(),
  constraint market_report_partner_labels_one_per_forwarder unique (forwarder_project_id, forwarder_id),
  constraint market_report_partner_labels_label_unique unique (forwarder_project_id, label)
);

comment on table public.market_report_partner_labels is
  'Which forwarder is "Partner X" in a project''s Market Report. Staff-only. Never updated or deleted: letters are never reused.';

-- A label never changes. The only allowed update is the foreign key setting
-- forwarder_id to null when the forwarder is deleted.
create function public.market_report_partner_labels_fixed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.label is distinct from old.label
     or new.forwarder_project_id is distinct from old.forwarder_project_id
     or new.created_at is distinct from old.created_at
     or (new.forwarder_id is not null and new.forwarder_id is distinct from old.forwarder_id) then
    raise exception 'Partner labels can''t be changed.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger market_report_partner_labels_fixed
  before update on public.market_report_partner_labels
  for each row execute function public.market_report_partner_labels_fixed();

alter table public.market_report_partner_labels enable row level security;

create policy "Requires a staff role" on public.market_report_partner_labels
  as restrictive for all to authenticated
  using ((select public.has_staff_role()))
  with check ((select public.has_staff_role()));
create policy "Staff can read partner labels" on public.market_report_partner_labels
  for select to authenticated using (true);
create policy "Owner or admin can add partner labels" on public.market_report_partner_labels
  for insert to authenticated
  with check (public.can_write_client_update(null, forwarder_project_id));

revoke all on table public.market_report_partner_labels from public, anon, authenticated;
grant select, insert on table public.market_report_partner_labels to authenticated;
grant select, insert, update, delete on table public.market_report_partner_labels to service_role;

-- ---- 4. Handing out letters ---------------------------------------------------------------
-- The n-th label of a project (0-based): D..Z, then AA, AB, ... Must match
-- labelAt() in src/lib/client-updates/market-report-labels.ts.
create function public.market_report_label_at(p_index integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_index < 23 then pg_catalog.chr(68 + p_index)
    else pg_catalog.chr(65 + (p_index - 23) / 26) || pg_catalog.chr(65 + (p_index - 23) % 26)
  end;
$$;

revoke all on function public.market_report_label_at(integer) from public, anon;
grant execute on function public.market_report_label_at(integer) to authenticated, service_role;

-- Gives each forwarder in p_forwarder_ids that has no letter yet the next
-- one, in the order given, and returns every labelled forwarder of the
-- project. Runs with the caller's rights: only the project's owner or an
-- admin can add labels (RLS). The lock makes two publishes take turns.
create function public.assign_partner_labels(p_project uuid, p_forwarder_ids uuid[])
returns table (forwarder_id uuid, label text)
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_next integer;
begin
  if not public.can_write_client_update(null, p_project) then
    raise exception 'Only the project''s owner or an admin can publish a Market Report.'
      using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('market-report-labels:' || p_project::text));
  select pg_catalog.count(*) into v_next
  from public.market_report_partner_labels l where l.forwarder_project_id = p_project;
  foreach v_id in array coalesce(p_forwarder_ids, '{}') loop
    if not exists (
      select 1 from public.market_report_partner_labels l
      where l.forwarder_project_id = p_project and l.forwarder_id = v_id
    ) then
      if not exists (select 1 from public.forwarders f where f.id = v_id and f.forwarder_project_id = p_project) then
        raise exception 'That forwarder isn''t part of this project.' using errcode = 'P0001';
      end if;
      insert into public.market_report_partner_labels (forwarder_project_id, forwarder_id, label)
      values (p_project, v_id, public.market_report_label_at(v_next));
      v_next := v_next + 1;
    end if;
  end loop;
  return query
    select l.forwarder_id, l.label
    from public.market_report_partner_labels l
    where l.forwarder_project_id = p_project and l.forwarder_id is not null
    order by l.label;
end;
$$;

revoke all on function public.assign_partner_labels(uuid, uuid[]) from public, anon;
grant execute on function public.assign_partner_labels(uuid, uuid[]) to authenticated, service_role;

-- ---- 5. The internal query -------------------------------------------------------------------
-- The latest report of each of that client's projects, only while the client
-- is on the paid plan. The key is the same opaque key as the project's
-- client updates (so the portal can link a project to its report). Nobody
-- signed in can call it directly.
create function public.market_report_rows(p_client_id uuid)
returns table (engagement_key text, published_at timestamptz, payload jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select r.engagement_key, r.published_at, r.payload
  from (
    select distinct on (m.forwarder_project_id)
      pg_catalog.md5('client-update:' || p_client_id::text || ':' || m.forwarder_project_id::text) as engagement_key,
      m.published_at,
      m.payload
    from public.client_market_reports m
    where p_client_id is not null
      and m.client_id = p_client_id
      and exists (
        select 1 from public.client_entitlements e
        where e.client_id = p_client_id
          and e.tier = 'market_report'
          and (e.valid_until is null or e.valid_until > pg_catalog.now()))
    order by m.forwarder_project_id, m.published_at desc, m.created_at desc
  ) r
  order by r.published_at desc;
$$;

revoke all on function public.market_report_rows(uuid) from public, anon, authenticated;
grant execute on function public.market_report_rows(uuid) to service_role;

-- ---- 6. Client users, and staff "View as client" ----------------------------------------------
-- my_client_id() is null for anyone who isn't a client, and the paid-plan
-- check is the client's own (client_has_paid_tier answers clients only
-- about themselves).
create function public.my_market_reports()
returns table (engagement_key text, published_at timestamptz, payload jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select r.* from public.market_report_rows(public.my_client_id()) r
  where public.client_has_paid_tier(public.my_client_id());
$$;

revoke all on function public.my_market_reports() from public, anon;
grant execute on function public.my_market_reports() to authenticated, service_role;

-- Exactly what that client would get: nothing unless they're on the paid plan.
create function public.market_reports_for_client(p_client_id uuid)
returns table (engagement_key text, published_at timestamptz, payload jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select r.* from public.market_report_rows(p_client_id) r
  where public.has_staff_role();
$$;

revoke all on function public.market_reports_for_client(uuid) from public, anon;
grant execute on function public.market_reports_for_client(uuid) to authenticated, service_role;

-- ---- 7. A project's client is fixed once a report is published ------------------------------
create or replace function public.refuse_client_change_after_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.client_id is distinct from old.client_id and (
    exists (
      select 1 from public.client_updates u
      where not u.is_draft
        and (case when tg_table_name = 'three_pl_projects'
                  then u.three_pl_project_id else u.forwarder_project_id end) = new.id)
    or (tg_table_name = 'forwarder_projects' and exists (
      select 1 from public.client_market_reports m where m.forwarder_project_id = new.id))
  ) then
    raise exception 'Updates for this project have been shared with its client, so its client can''t be changed. If it''s linked to the wrong client, ask an admin to remove the shared updates first.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.refuse_client_change_after_publish() from public, anon, authenticated;
