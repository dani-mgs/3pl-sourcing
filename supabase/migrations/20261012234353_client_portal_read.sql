-- Client portal reads (client dashboard plan, Phase 2b).
--
-- Clients read their published client updates through functions, never the
-- table: row-level security can't hide columns, and client_updates also holds
-- staff ids (published_by, created_by) and project ids. So client_updates
-- stays STAFF-ONLY (its restrictive staff policy is unchanged), and:
--
-- 1. portal_updates_rows(client_id): internal. The one query for "what this
--    client sees": published rows only, client-safe columns only, and an
--    opaque engagement_key instead of the project id. Nobody signed in can
--    call it directly.
-- 2. my_portal_updates(): for client users. No arguments: the client is
--    always the caller's own (my_client_id(), read live from app_metadata;
--    null for anyone who isn't a client, which returns nothing).
-- 3. portal_updates_for_client(client_id): for staff ("View as client"), so
--    the preview runs exactly the client's query. Nothing for non-staff.
-- 4. my_move_contact_names(): the first names (first word only) of the staff
--    who own the caller's client's projects, for the portal before the
--    first update. No emails, ids or last names.
--
-- Supabase grants EXECUTE on new public functions to anon and authenticated
-- by default, so every grant below is explicit.

-- ---- 1. The internal query ---------------------------------------------------------
create function public.portal_updates_rows(p_client_id uuid)
returns table (
  engagement_key text,
  project_kind text,
  stage smallint,
  headline text,
  summary text,
  next_step text,
  next_step_due date,
  needs_client_action boolean,
  published_at timestamptz,
  payload jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  -- The key hashes the client together with the project, so it can't be
  -- compared across clients or turned back into a project id.
  select
    pg_catalog.md5('client-update:' || p_client_id::text || ':'
                   || coalesce(u.three_pl_project_id, u.forwarder_project_id)::text),
    case when u.three_pl_project_id is not null then 'three_pl' else 'forwarder' end,
    u.stage,
    u.headline,
    u.summary,
    u.next_step,
    u.next_step_due,
    u.needs_client_action,
    u.published_at,
    u.payload
  from public.client_updates u
  where p_client_id is not null
    and u.client_id = p_client_id
    and not u.is_draft
  order by u.published_at desc;
$$;

revoke all on function public.portal_updates_rows(uuid) from public, anon, authenticated;
grant execute on function public.portal_updates_rows(uuid) to service_role;

-- ---- 2. Client users ---------------------------------------------------------------------
create function public.my_portal_updates()
returns table (
  engagement_key text,
  project_kind text,
  stage smallint,
  headline text,
  summary text,
  next_step text,
  next_step_due date,
  needs_client_action boolean,
  published_at timestamptz,
  payload jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.portal_updates_rows(public.my_client_id());
$$;

revoke all on function public.my_portal_updates() from public, anon;
grant execute on function public.my_portal_updates() to authenticated, service_role;

-- ---- 3. Staff: View as client ----------------------------------------------------------------
create function public.portal_updates_for_client(p_client_id uuid)
returns table (
  engagement_key text,
  project_kind text,
  stage smallint,
  headline text,
  summary text,
  next_step text,
  next_step_due date,
  needs_client_action boolean,
  published_at timestamptz,
  payload jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.* from public.portal_updates_rows(p_client_id) r
  where public.has_staff_role();
$$;

revoke all on function public.portal_updates_for_client(uuid) from public, anon;
grant execute on function public.portal_updates_for_client(uuid) to authenticated, service_role;

-- ---- 4. Who at Move works on my projects -------------------------------------------------------
-- First word of profiles.first_name only (it can hold a full name), and only
-- for owners who still have a staff role.
create function public.my_move_contact_names()
returns table (first_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct pg_catalog.split_part(pg_catalog.btrim(p.first_name), ' ', 1)
  from public.profiles p
  where public.my_client_id() is not null
    and pg_catalog.btrim(coalesce(p.first_name, '')) <> ''
    and public.has_staff_role_user(p.id)
    and p.id in (
      select tp.owner_id from public.three_pl_projects tp where tp.client_id = public.my_client_id()
      union
      select fp.owner_id from public.forwarder_projects fp where fp.client_id = public.my_client_id())
  order by 1;
$$;

revoke all on function public.my_move_contact_names() from public, anon;
grant execute on function public.my_move_contact_names() to authenticated, service_role;
