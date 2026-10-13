-- Client requests (client dashboard plan, Phase 3a): approve a
-- recommendation, request changes, ask a question; staff see them in an
-- inbox and reply.
--
-- Same rule as client updates and Market Reports: the table is STAFF-ONLY.
-- Clients never write or read it directly:
--
-- 1. The portal functions gain an opaque update_key per update (so a client
--    can say which update it is deciding on). They are dropped and recreated
--    in this one transaction with the new column LAST; the portal code
--    already deployed reads only the columns it names, so it keeps working
--    between "db push" and the code deploy.
-- 2. client_requests: who, which project and update, what, a frozen copy of
--    the recommendation decided on, and Move's reply. Client-written columns
--    never change; a reply can't be edited, only withdrawn by an admin (kept
--    in a staff-only history); there is no delete.
-- 3. submit_client_request(): the ONLY way a client writes. It forces the
--    client, the author, the time and the status, and refuses (with a
--    generic error code) a client that must still change its password,
--    another client's project, a stale or second decision, bad lengths, and
--    more than 10 requests per user per hour or 40 per client per day.
-- 4. my_client_requests() for clients; client_requests_for_client() for
--    staff "View as client" (the same rows). Safe columns only: no ids.
-- 5. Staff: mark_client_request_seen(), reply_to_client_request() (project
--    owner or admin), withdraw_client_request_reply() (admins only), and
--    my_client_request_badge() for the inbox badge.
--
-- Error codes the app maps to friendly text: CQ403 (not allowed), CQ409
-- (stale, already decided, already answered), CQ422 (invalid input), CQ429
-- (too many requests).
--
-- Supabase grants EXECUTE on new public functions to anon and authenticated
-- by default, so every grant below is explicit.

-- ---- 1. Portal functions with update_key ---------------------------------------------------
drop function public.my_portal_updates();
drop function public.portal_updates_for_client(uuid);
drop function public.portal_updates_rows(uuid);

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
  payload jsonb,
  update_key text
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Both keys hash the client with the project or the update, so they can't
  -- be compared across clients or turned back into ids.
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
    u.payload,
    pg_catalog.md5('client-update-row:' || p_client_id::text || ':' || u.id::text)
  from public.client_updates u
  where p_client_id is not null
    and u.client_id = p_client_id
    and not u.is_draft
  order by u.published_at desc;
$$;

revoke all on function public.portal_updates_rows(uuid) from public, anon, authenticated;
grant execute on function public.portal_updates_rows(uuid) to service_role;

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
  payload jsonb,
  update_key text
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
  payload jsonb,
  update_key text
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

-- ---- 2. client_requests --------------------------------------------------------------------
create table public.client_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  three_pl_project_id uuid references public.three_pl_projects (id) on delete cascade,
  forwarder_project_id uuid references public.forwarder_projects (id) on delete cascade,
  -- The update decided on (decisions), or the latest one when the question
  -- was asked. Null if an admin later removed that update.
  client_update_id uuid references public.client_updates (id) on delete set null,
  kind text not null check (kind in ('approve', 'request_changes', 'question')),
  message text,
  wants_call boolean not null default false,
  -- Decisions only: a frozen copy of what was decided on.
  decision_snapshot jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  status text not null default 'sent' check (status in ('sent', 'seen', 'answered')),
  seen_by uuid references auth.users (id) on delete set null,
  seen_at timestamptz,
  staff_reply text,
  replied_by uuid references auth.users (id) on delete set null,
  replied_at timestamptz,
  -- Staff-only audit of withdrawn replies: [{reply, repliedBy, repliedAt,
  -- withdrawnBy, withdrawnAt}]. Never returned to a client.
  reply_history jsonb not null default '[]'::jsonb check (jsonb_typeof(reply_history) = 'array'),
  constraint client_requests_one_project
    check (num_nonnulls(three_pl_project_id, forwarder_project_id) = 1),
  constraint client_requests_message
    check (case kind
             when 'question' then message is not null and char_length(message) between 1 and 1000
             when 'request_changes' then message is not null and char_length(message) between 1 and 500
             else message is null or char_length(message) between 1 and 500
           end),
  constraint client_requests_call_on_questions check (kind = 'question' or not wants_call),
  constraint client_requests_snapshot_on_decisions check ((kind = 'question') = (decision_snapshot is null)),
  constraint client_requests_reply
    check (staff_reply is null or char_length(staff_reply) between 1 and 2000),
  constraint client_requests_answered
    check ((status = 'answered') = (staff_reply is not null)
           and (staff_reply is null) = (replied_at is null))
);

comment on table public.client_requests is
  'Approvals, change requests and questions from client users, and Move''s replies. Staff-only; clients write through submit_client_request() and read through my_client_requests().';

create index client_requests_client_idx on public.client_requests (client_id, created_at desc);
create index client_requests_author_idx on public.client_requests (created_by, created_at desc);
create index client_requests_status_idx on public.client_requests (status);
create index client_requests_three_pl_project_idx on public.client_requests (three_pl_project_id);
create index client_requests_forwarder_project_idx on public.client_requests (forwarder_project_id);
-- One decision (approve or request changes) per update.
create unique index client_requests_one_decision_per_update on public.client_requests (client_update_id)
  where kind in ('approve', 'request_changes') and client_update_id is not null;

-- The client is the project's. What the client wrote never changes. A reply
-- is set once; it can only be cleared by withdrawing it, which appends it to
-- reply_history. Only a write with no signed-in user (the local seed) may
-- set past dates and a status other than 'sent'.
create function public.client_requests_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.three_pl_project_id is not null then
    select p.client_id into new.client_id from public.three_pl_projects p where p.id = new.three_pl_project_id;
  else
    select p.client_id into new.client_id from public.forwarder_projects p where p.id = new.forwarder_project_id;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_at := now();
      new.status := 'sent';
      new.seen_by := null;
      new.seen_at := null;
      new.staff_reply := null;
      new.replied_by := null;
      new.replied_at := null;
      new.reply_history := '[]'::jsonb;
    end if;
    return new;
  end if;

  if new.client_id is distinct from old.client_id
     or new.three_pl_project_id is distinct from old.three_pl_project_id
     or new.forwarder_project_id is distinct from old.forwarder_project_id
     or (new.client_update_id is not null and new.client_update_id is distinct from old.client_update_id)
     or new.kind is distinct from old.kind
     or new.message is distinct from old.message
     or new.wants_call is distinct from old.wants_call
     or new.decision_snapshot is distinct from old.decision_snapshot
     or (new.created_by is not null and new.created_by is distinct from old.created_by)
     or new.created_at is distinct from old.created_at then
    raise exception 'What a client sent can''t be changed.' using errcode = 'P0001';
  end if;
  if new.reply_history is distinct from old.reply_history
     and not (jsonb_array_length(new.reply_history) = jsonb_array_length(old.reply_history) + 1
              and new.reply_history - (jsonb_array_length(new.reply_history) - 1) = old.reply_history) then
    raise exception 'Withdrawn replies can''t be changed.' using errcode = 'P0001';
  end if;
  if old.staff_reply is not null and new.staff_reply is distinct from old.staff_reply
     and not (new.staff_reply is null
              and jsonb_array_length(new.reply_history) = jsonb_array_length(old.reply_history) + 1) then
    raise exception 'A reply can''t be edited. An admin can withdraw it.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger client_requests_guard
  before insert or update on public.client_requests
  for each row execute function public.client_requests_guard();

alter table public.client_requests enable row level security;

create policy "Requires a staff role" on public.client_requests
  as restrictive for all to authenticated
  using ((select public.has_staff_role()))
  with check ((select public.has_staff_role()));
create policy "Staff can read client requests" on public.client_requests
  for select to authenticated using (true);

-- Reads only: every write goes through the functions below.
revoke all on table public.client_requests from public, anon, authenticated;
grant select on table public.client_requests to authenticated;
grant select, insert, update, delete on table public.client_requests to service_role;

-- ---- 3. A client writes ------------------------------------------------------------------------
create function public.submit_client_request(
  p_kind text,
  p_engagement_key text,
  p_update_key text,
  p_message text,
  p_wants_call boolean
)
returns table (request_key text, already_sent boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_client uuid := public.my_client_id();
  v_three_pl uuid;
  v_forwarder uuid;
  v_update public.client_updates%rowtype;
  v_message text := nullif(pg_catalog.btrim(coalesce(p_message, '')), '');
  v_existing public.client_requests%rowtype;
  v_id uuid;
begin
  -- A client only, with its own password chosen (the inviter has seen the
  -- one-time one). Read live, like my_client_id().
  if v_uid is null or v_client is null or exists (
    select 1 from auth.users u where u.id = v_uid and u.raw_app_meta_data ? 'must_change_password'
  ) then
    raise exception 'not allowed' using errcode = 'CQ403';
  end if;
  if p_kind is null or p_kind not in ('approve', 'request_changes', 'question') then
    raise exception 'invalid' using errcode = 'CQ422';
  end if;

  -- One of this client's own projects.
  select p.id into v_three_pl from public.three_pl_projects p
  where p.client_id = v_client
    and pg_catalog.md5('client-update:' || v_client::text || ':' || p.id::text) = p_engagement_key;
  if v_three_pl is null then
    select p.id into v_forwarder from public.forwarder_projects p
    where p.client_id = v_client
      and pg_catalog.md5('client-update:' || v_client::text || ':' || p.id::text) = p_engagement_key;
  end if;
  if v_three_pl is null and v_forwarder is null then
    raise exception 'not allowed' using errcode = 'CQ403';
  end if;
  -- Lengths only after the project is known to be the client's own, so an
  -- outsider learns nothing from the error.
  if (p_kind = 'question' and (v_message is null or char_length(v_message) > 1000))
     or (p_kind = 'request_changes' and (v_message is null or char_length(v_message) > 500))
     or (p_kind = 'approve' and char_length(coalesce(v_message, '')) > 500) then
    raise exception 'invalid' using errcode = 'CQ422';
  end if;

  -- One request at a time per client: the caps and "one decision" hold.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('client-requests:' || v_client::text));

  select u.* into v_update from public.client_updates u
  where not u.is_draft
    and (u.three_pl_project_id = v_three_pl or u.forwarder_project_id = v_forwarder)
  order by u.published_at desc, u.created_at desc
  limit 1;

  if p_kind in ('approve', 'request_changes') then
    -- Only on the latest published update, and only if it has a recommendation.
    if v_update.id is null
       or pg_catalog.md5('client-update-row:' || v_client::text || ':' || v_update.id::text) is distinct from p_update_key
       or jsonb_typeof(v_update.payload -> 'recommendation') is distinct from 'object' then
      raise exception 'stale' using errcode = 'CQ409';
    end if;
    select r.* into v_existing from public.client_requests r
    where r.client_update_id = v_update.id and r.kind in ('approve', 'request_changes');
    if v_existing.id is not null then
      -- Approving twice returns the first approval; anything else is refused.
      if v_existing.kind = 'approve' and p_kind = 'approve' then
        return query select pg_catalog.md5('client-request:' || v_client::text || ':' || v_existing.id::text), true;
        return;
      end if;
      raise exception 'already decided' using errcode = 'CQ409';
    end if;
  end if;

  if (select pg_catalog.count(*) from public.client_requests r
      where r.created_by = v_uid and r.created_at > now() - interval '1 hour') >= 10
     or (select pg_catalog.count(*) from public.client_requests r
         where r.client_id = v_client and r.created_at > now() - interval '1 day') >= 40 then
    raise exception 'too many' using errcode = 'CQ429';
  end if;

  insert into public.client_requests (
    client_id, three_pl_project_id, forwarder_project_id, client_update_id, kind, message, wants_call,
    decision_snapshot, created_by
  ) values (
    v_client, v_three_pl, v_forwarder, v_update.id, p_kind, v_message,
    p_kind = 'question' and coalesce(p_wants_call, false),
    case when p_kind = 'question' then null else jsonb_build_object(
      'headline', v_update.headline,
      'publishedAt', v_update.published_at,
      'projectKind', case when v_three_pl is not null then 'three_pl' else 'forwarder' end,
      'route', v_update.payload -> 'project' -> 'route',
      'recommendation', v_update.payload -> 'recommendation') end,
    v_uid
  ) returning id into v_id;

  return query select pg_catalog.md5('client-request:' || v_client::text || ':' || v_id::text), false;
end;
$$;

revoke all on function public.submit_client_request(text, text, text, text, boolean) from public, anon;
grant execute on function public.submit_client_request(text, text, text, text, boolean) to authenticated, service_role;

-- ---- 4. Reading requests --------------------------------------------------------------------
-- Internal: a client's requests with safe columns only. Names are first
-- words of profiles.first_name; a withdrawn reply is never returned.
create function public.client_requests_rows(p_client_id uuid, p_viewer uuid)
returns table (
  request_key text,
  engagement_key text,
  update_key text,
  project_kind text,
  kind text,
  message text,
  wants_call boolean,
  status text,
  created_at timestamptz,
  from_first_name text,
  from_me boolean,
  decision_name text,
  reply text,
  replied_at timestamptz,
  replier_first_name text,
  reply_withdrawn boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pg_catalog.md5('client-request:' || p_client_id::text || ':' || r.id::text),
    pg_catalog.md5('client-update:' || p_client_id::text || ':'
                   || coalesce(r.three_pl_project_id, r.forwarder_project_id)::text),
    case when r.client_update_id is null then null
         else pg_catalog.md5('client-update-row:' || p_client_id::text || ':' || r.client_update_id::text) end,
    case when r.three_pl_project_id is not null then 'three_pl' else 'forwarder' end,
    r.kind,
    r.message,
    r.wants_call,
    r.status,
    r.created_at,
    nullif(pg_catalog.split_part(pg_catalog.btrim(coalesce(author.first_name, '')), ' ', 1), ''),
    p_viewer is not null and r.created_by = p_viewer,
    r.decision_snapshot -> 'recommendation' ->> 'name',
    r.staff_reply,
    r.replied_at,
    case when r.staff_reply is null then null
         else nullif(pg_catalog.split_part(pg_catalog.btrim(coalesce(replier.first_name, '')), ' ', 1), '') end,
    r.staff_reply is null and jsonb_array_length(r.reply_history) > 0
  from public.client_requests r
  left join public.profiles author on author.id = r.created_by
  left join public.profiles replier on replier.id = r.replied_by
  where p_client_id is not null
    and r.client_id = p_client_id
  order by r.created_at desc;
$$;

revoke all on function public.client_requests_rows(uuid, uuid) from public, anon, authenticated;
grant execute on function public.client_requests_rows(uuid, uuid) to service_role;

create function public.my_client_requests()
returns table (
  request_key text,
  engagement_key text,
  update_key text,
  project_kind text,
  kind text,
  message text,
  wants_call boolean,
  status text,
  created_at timestamptz,
  from_first_name text,
  from_me boolean,
  decision_name text,
  reply text,
  replied_at timestamptz,
  replier_first_name text,
  reply_withdrawn boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.client_requests_rows(public.my_client_id(), auth.uid());
$$;

revoke all on function public.my_client_requests() from public, anon;
grant execute on function public.my_client_requests() to authenticated, service_role;

-- Staff "View as client": the same rows, nothing marked as the viewer's.
create function public.client_requests_for_client(p_client_id uuid)
returns table (
  request_key text,
  engagement_key text,
  update_key text,
  project_kind text,
  kind text,
  message text,
  wants_call boolean,
  status text,
  created_at timestamptz,
  from_first_name text,
  from_me boolean,
  decision_name text,
  reply text,
  replied_at timestamptz,
  replier_first_name text,
  reply_withdrawn boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.* from public.client_requests_rows(p_client_id, null) r
  where public.has_staff_role();
$$;

revoke all on function public.client_requests_for_client(uuid) from public, anon;
grant execute on function public.client_requests_for_client(uuid) to authenticated, service_role;

-- ---- 5. Staff ----------------------------------------------------------------------------------
-- "Seen" when the project's owner or an admin opens the request (called by
-- an explicit action, never by a page render). Anyone else: nothing.
create function public.mark_client_request_seen(p_request_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.client_requests%rowtype;
begin
  if not public.has_staff_role() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select r.* into v from public.client_requests r where r.id = p_request_id;
  if v.id is null or not public.can_write_client_update(v.three_pl_project_id, v.forwarder_project_id) then
    return false;
  end if;
  if v.status = 'sent' then
    update public.client_requests set status = 'seen', seen_by = auth.uid(), seen_at = now()
    where id = v.id;
  end if;
  return true;
end;
$$;

revoke all on function public.mark_client_request_seen(uuid) from public, anon;
grant execute on function public.mark_client_request_seen(uuid) to authenticated, service_role;

-- The project's owner or an admin; once. The client sees the reply.
create function public.reply_to_client_request(p_request_id uuid, p_reply text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.client_requests%rowtype;
  v_reply text := nullif(pg_catalog.btrim(coalesce(p_reply, '')), '');
begin
  if not public.has_staff_role() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select r.* into v from public.client_requests r where r.id = p_request_id for update;
  if v.id is null or not public.can_write_client_update(v.three_pl_project_id, v.forwarder_project_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_reply is null or char_length(v_reply) > 2000 then
    raise exception 'invalid' using errcode = 'CQ422';
  end if;
  if v.status = 'answered' then
    raise exception 'already answered' using errcode = 'CQ409';
  end if;
  update public.client_requests
  set staff_reply = v_reply, replied_by = auth.uid(), replied_at = now(), status = 'answered',
      seen_by = coalesce(seen_by, auth.uid()), seen_at = coalesce(seen_at, now())
  where id = v.id;
end;
$$;

revoke all on function public.reply_to_client_request(uuid, text) from public, anon;
grant execute on function public.reply_to_client_request(uuid, text) to authenticated, service_role;

-- Admins only: take back a reply that was wrong or shared too much. The
-- client then sees "Move withdrew this reply; a new one is coming"; the
-- text and who withdrew it stay in the staff-only history; the owner can
-- reply again.
create function public.withdraw_client_request_reply(p_request_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.client_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select r.* into v from public.client_requests r where r.id = p_request_id for update;
  if v.id is null or v.status <> 'answered' then
    raise exception 'nothing to withdraw' using errcode = 'CQ409';
  end if;
  update public.client_requests
  set reply_history = reply_history || jsonb_build_array(jsonb_build_object(
        'reply', v.staff_reply, 'repliedBy', v.replied_by, 'repliedAt', v.replied_at,
        'withdrawnBy', auth.uid(), 'withdrawnAt', now())),
      staff_reply = null, replied_by = null, replied_at = null, status = 'seen'
  where id = v.id;
end;
$$;

revoke all on function public.withdraw_client_request_reply(uuid) from public, anon;
grant execute on function public.withdraw_client_request_reply(uuid) to authenticated, service_role;

-- The inbox badge: requests not yet seen on projects the caller owns (all
-- projects for admins). Caller's rights: staff only through RLS.
create function public.my_client_request_badge()
returns integer
language sql
stable
set search_path = ''
as $$
  select pg_catalog.count(*)::integer from public.client_requests r
  where r.status = 'sent'
    and public.can_write_client_update(r.three_pl_project_id, r.forwarder_project_id);
$$;

revoke all on function public.my_client_request_badge() from public, anon;
grant execute on function public.my_client_request_badge() to authenticated, service_role;
