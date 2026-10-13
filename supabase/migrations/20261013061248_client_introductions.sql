-- Introduction requests and "Unlock the Market Report" interest (client
-- dashboard plan, Phase 3b), on the Phase 3a client_requests table.
--
-- The same rules as 3a: the table stays STAFF-ONLY; clients write only
-- through security-definer functions that force the client, the author, the
-- time and the status, and read only through my_client_requests().
--
-- 1. client_requests gains two kinds:
--    - introduction: a paid client asks Move to introduce it to a lettered
--      partner ("Partner D") of the latest Market Report of one of its
--      forwarder projects. partner_label holds the letter only; which
--      forwarder it is stays in the staff-only market_report_partner_labels.
--      decision_snapshot keeps a frozen copy of the row the client saw (the
--      column keeps its 3a name: the deployed inbox reads it by name).
--    - report_interest: a free client asks about the paid Market Report.
--      Not tied to a project; one per client.
-- 2. Shared checks for every client write (client_request_caller(),
--    client_requests_check_caps()): a client user who has chosen its own
--    password, and the 3a rate caps (10 per user per hour, 40 per client per
--    day, across all kinds). submit_client_request() keeps its signature
--    and behaviour and now uses them.
-- 3. submit_client_introduction() and submit_market_report_interest(): the
--    only ways a client writes the new kinds.
-- 4. The client read functions are dropped and recreated in this one
--    transaction with partner_label LAST (the deployed portal code reads only
--    the columns it names and leaves out kinds it doesn't know). A client
--    that isn't on the paid plan gets no introduction rows at all, so no
--    letter (and no note that might mention one) reaches the free plan.
-- 5. Who acts on a request (seen, reply, badge): the project's owner or an
--    admin; for report_interest (no project), an admin or the owner of any
--    of that client's projects.
-- 6. A reply to an introduction may not contain the partner's full name
--    (the app also checks its name words, HQ city, website and email
--    domains and contact person before it gets here).
--
-- Error codes as in 3a: CQ403 (not allowed), CQ409 (stale, already sent,
-- changed), CQ422 (invalid input), CQ429 (too many requests); new: CQ423 (a
-- staff reply names the partner).
--
-- Supabase grants EXECUTE on new public functions to anon and authenticated
-- by default, so every grant below is explicit.

-- ---- 1. The table ------------------------------------------------------------------------------
alter table public.client_requests
  add column partner_label text,
  add column client_market_report_id uuid references public.client_market_reports (id) on delete set null;

comment on column public.client_requests.partner_label is
  'Introductions only: the letter the client saw ("D" for Partner D). The forwarder behind it is in market_report_partner_labels (staff-only).';
comment on column public.client_requests.client_market_report_id is
  'Introductions only: the Market Report the letter was in when the client asked.';
comment on column public.client_requests.decision_snapshot is
  'A frozen copy of what the client acted on: the recommendation (approve, request changes) or the report row (introduction). Null for questions and Market Report interest.';

alter table public.client_requests
  drop constraint client_requests_kind_check,
  drop constraint client_requests_one_project,
  drop constraint client_requests_message,
  drop constraint client_requests_call_on_questions,
  drop constraint client_requests_snapshot_on_decisions;

alter table public.client_requests
  add constraint client_requests_kind_check
    check (kind in ('approve', 'request_changes', 'question', 'introduction', 'report_interest')),
  add constraint client_requests_one_project
    check (case kind
             when 'report_interest' then num_nonnulls(three_pl_project_id, forwarder_project_id) = 0
             when 'introduction' then forwarder_project_id is not null and three_pl_project_id is null
             else num_nonnulls(three_pl_project_id, forwarder_project_id) = 1
           end),
  add constraint client_requests_message
    check (case kind
             when 'question' then message is not null and char_length(message) between 1 and 1000
             when 'request_changes' then message is not null and char_length(message) between 1 and 500
             else message is null or char_length(message) between 1 and 500
           end),
  add constraint client_requests_call_on_questions
    check (kind in ('question', 'introduction', 'report_interest') or not wants_call),
  add constraint client_requests_snapshot_on_decisions
    check ((kind in ('question', 'report_interest')) = (decision_snapshot is null)),
  add constraint client_requests_partner_label
    check ((kind = 'introduction') = (partner_label is not null)
           and (partner_label is null or partner_label ~ '^[A-Z]{1,2}$')),
  add constraint client_requests_report_on_introductions
    check (kind = 'introduction' or client_market_report_id is null),
  add constraint client_requests_interest_has_no_update
    check (kind <> 'report_interest' or client_update_id is null);

-- One open (not yet answered) introduction request per partner letter per
-- project; one Market Report interest per client, ever.
create unique index client_requests_one_open_introduction
  on public.client_requests (forwarder_project_id, partner_label)
  where kind = 'introduction' and status <> 'answered';
create unique index client_requests_one_report_interest
  on public.client_requests (client_id)
  where kind = 'report_interest';
create index client_requests_market_report_idx on public.client_requests (client_market_report_id);

-- As in 3a, plus: a request without a project keeps the client it was
-- written with, and the letter and report never change.
create or replace function public.client_requests_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.three_pl_project_id is not null then
    select p.client_id into new.client_id from public.three_pl_projects p where p.id = new.three_pl_project_id;
  elsif new.forwarder_project_id is not null then
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
     or (new.client_market_report_id is not null and new.client_market_report_id is distinct from old.client_market_report_id)
     or new.kind is distinct from old.kind
     or new.message is distinct from old.message
     or new.wants_call is distinct from old.wants_call
     or new.decision_snapshot is distinct from old.decision_snapshot
     or new.partner_label is distinct from old.partner_label
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

-- ---- 2. Shared checks for every client write ------------------------------------------------------
-- The calling client, or CQ403: a client user only, with its own password
-- chosen (the inviter has seen the one-time one). Read live, like
-- my_client_id(). Internal: nobody signed in can call it directly.
create function public.client_request_caller()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_client uuid := public.my_client_id();
begin
  if auth.uid() is null or v_client is null or exists (
    select 1 from auth.users u where u.id = auth.uid() and u.raw_app_meta_data ? 'must_change_password'
  ) then
    raise exception 'not allowed' using errcode = 'CQ403';
  end if;
  return v_client;
end;
$$;

revoke all on function public.client_request_caller() from public, anon, authenticated;
grant execute on function public.client_request_caller() to service_role;

-- The rate caps, across every kind: 10 per user per hour, 40 per client per
-- day. Call it under the client's lock. Internal.
create function public.client_requests_check_caps(p_client uuid, p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select pg_catalog.count(*) from public.client_requests r
      where r.created_by = p_user and r.created_at > now() - interval '1 hour') >= 10
     or (select pg_catalog.count(*) from public.client_requests r
         where r.client_id = p_client and r.created_at > now() - interval '1 day') >= 40 then
    raise exception 'too many' using errcode = 'CQ429';
  end if;
end;
$$;

revoke all on function public.client_requests_check_caps(uuid, uuid) from public, anon, authenticated;
grant execute on function public.client_requests_check_caps(uuid, uuid) to service_role;

-- 3a's function, unchanged in signature and behaviour, on the shared checks.
create or replace function public.submit_client_request(
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
  v_client uuid := public.client_request_caller();
  v_three_pl uuid;
  v_forwarder uuid;
  v_update public.client_updates%rowtype;
  v_message text := nullif(pg_catalog.btrim(coalesce(p_message, '')), '');
  v_existing public.client_requests%rowtype;
  v_id uuid;
begin
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

  perform public.client_requests_check_caps(v_client, v_uid);

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

-- ---- 3. The new client writes ------------------------------------------------------------------
-- "Request introduction" on a lettered row of the paid Market Report. The
-- letter must be an anonymised partner that was quoted or asked to quote
-- (not a named one, not "Not taken forward") in the LATEST report of one of
-- the client's own forwarder projects, and the client must be on the paid
-- plan. Asking again while one is open returns the open one.
create function public.submit_client_introduction(
  p_engagement_key text,
  p_label text,
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
  v_client uuid := public.client_request_caller();
  v_forwarder uuid;
  v_report public.client_market_reports%rowtype;
  v_row jsonb;
  v_message text := nullif(pg_catalog.btrim(coalesce(p_message, '')), '');
  v_existing uuid;
  v_id uuid;
begin
  if p_label is null or p_label !~ '^[A-Z]{1,2}$' then
    raise exception 'invalid' using errcode = 'CQ422';
  end if;
  select p.id into v_forwarder from public.forwarder_projects p
  where p.client_id = v_client
    and pg_catalog.md5('client-update:' || v_client::text || ':' || p.id::text) = p_engagement_key;
  if v_forwarder is null or not public.client_has_paid_tier(v_client) then
    raise exception 'not allowed' using errcode = 'CQ403';
  end if;
  if char_length(coalesce(v_message, '')) > 500 then
    raise exception 'invalid' using errcode = 'CQ422';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('client-requests:' || v_client::text));

  select m.* into v_report from public.client_market_reports m
  where m.forwarder_project_id = v_forwarder
  order by m.published_at desc, m.created_at desc
  limit 1;
  select e.value into v_row
  from jsonb_array_elements(case when jsonb_typeof(v_report.payload -> 'partners') = 'array'
                                 then v_report.payload -> 'partners' else '[]'::jsonb end) e
  where e.value ->> 'label' = 'Partner ' || p_label
    and e.value ->> 'outcome' in ('quoted_not_selected', 'quote_expired', 'different_terms', 'didnt_quote')
  limit 1;
  if v_row is null then
    -- A letter of this project that isn't in the latest report at all: the
    -- client's page is out of date (stale). A letter the latest report
    -- shows but that can't be requested ("Not taken forward"), or no letter
    -- of this project: invalid.
    if exists (select 1 from public.market_report_partner_labels l
               where l.forwarder_project_id = v_forwarder and l.label = p_label)
       and not exists (
         select 1 from jsonb_array_elements(case when jsonb_typeof(v_report.payload -> 'partners') = 'array'
                                                 then v_report.payload -> 'partners' else '[]'::jsonb end) e
         where e.value ->> 'label' = 'Partner ' || p_label) then
      raise exception 'stale' using errcode = 'CQ409';
    end if;
    raise exception 'invalid' using errcode = 'CQ422';
  end if;

  select r.id into v_existing from public.client_requests r
  where r.kind = 'introduction' and r.forwarder_project_id = v_forwarder
    and r.partner_label = p_label and r.status <> 'answered';
  if v_existing is not null then
    return query select pg_catalog.md5('client-request:' || v_client::text || ':' || v_existing::text), true;
    return;
  end if;

  perform public.client_requests_check_caps(v_client, v_uid);

  insert into public.client_requests (
    client_id, forwarder_project_id, client_market_report_id, kind, partner_label, message, wants_call,
    decision_snapshot, created_by
  ) values (
    v_client, v_forwarder, v_report.id, 'introduction', p_label, v_message, coalesce(p_wants_call, false),
    jsonb_build_object(
      'reportPublishedAt', v_report.published_at,
      'route', v_report.payload -> 'project' -> 'route',
      'partner', jsonb_build_object(
        'label', v_row -> 'label',
        'outcome', v_row -> 'outcome',
        'priceUsd', v_row -> 'priceUsd',
        'leadMinDays', v_row -> 'leadMinDays',
        'leadMaxDays', v_row -> 'leadMaxDays',
        'likeForLike', v_row -> 'likeForLike')),
    v_uid
  ) returning id into v_id;

  return query select pg_catalog.md5('client-request:' || v_client::text || ':' || v_id::text), false;
end;
$$;

revoke all on function public.submit_client_introduction(text, text, text, boolean) from public, anon;
grant execute on function public.submit_client_introduction(text, text, text, boolean) to authenticated, service_role;

-- "Unlock the Market Report" on the free plan's locked page: one per client.
-- Asking again returns the first one. A client already on the paid plan is
-- refused (its page is out of date).
create function public.submit_market_report_interest(p_message text, p_wants_call boolean)
returns table (request_key text, already_sent boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_client uuid := public.client_request_caller();
  v_message text := nullif(pg_catalog.btrim(coalesce(p_message, '')), '');
  v_existing uuid;
  v_id uuid;
begin
  if char_length(coalesce(v_message, '')) > 500 then
    raise exception 'invalid' using errcode = 'CQ422';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('client-requests:' || v_client::text));

  select r.id into v_existing from public.client_requests r
  where r.client_id = v_client and r.kind = 'report_interest';
  if v_existing is not null then
    return query select pg_catalog.md5('client-request:' || v_client::text || ':' || v_existing::text), true;
    return;
  end if;
  if public.client_has_paid_tier(v_client) then
    raise exception 'already on the paid plan' using errcode = 'CQ409';
  end if;

  perform public.client_requests_check_caps(v_client, v_uid);

  insert into public.client_requests (client_id, kind, message, wants_call, created_by)
  values (v_client, 'report_interest', v_message, coalesce(p_wants_call, false), v_uid)
  returning id into v_id;

  return query select pg_catalog.md5('client-request:' || v_client::text || ':' || v_id::text), false;
end;
$$;

revoke all on function public.submit_market_report_interest(text, boolean) from public, anon;
grant execute on function public.submit_market_report_interest(text, boolean) to authenticated, service_role;

-- ---- 4. Reading requests: partner_label last; no introductions off the paid plan ------------
drop function public.my_client_requests();
drop function public.client_requests_for_client(uuid);
drop function public.client_requests_rows(uuid, uuid);

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
  reply_withdrawn boolean,
  partner_label text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pg_catalog.md5('client-request:' || p_client_id::text || ':' || r.id::text),
    case when r.three_pl_project_id is null and r.forwarder_project_id is null then null
         else pg_catalog.md5('client-update:' || p_client_id::text || ':'
                             || coalesce(r.three_pl_project_id, r.forwarder_project_id)::text) end,
    case when r.client_update_id is null then null
         else pg_catalog.md5('client-update-row:' || p_client_id::text || ':' || r.client_update_id::text) end,
    case when r.three_pl_project_id is not null then 'three_pl'
         when r.forwarder_project_id is not null then 'forwarder' end,
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
    r.staff_reply is null and jsonb_array_length(r.reply_history) > 0,
    r.partner_label
  from public.client_requests r
  left join public.profiles author on author.id = r.created_by
  left join public.profiles replier on replier.id = r.replied_by
  where p_client_id is not null
    and r.client_id = p_client_id
    -- Introductions only while the client is on the paid plan.
    and (r.kind <> 'introduction' or exists (
      select 1 from public.client_entitlements e
      where e.client_id = p_client_id
        and e.tier = 'market_report'
        and (e.valid_until is null or e.valid_until > pg_catalog.now())))
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
  reply_withdrawn boolean,
  partner_label text
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
  reply_withdrawn boolean,
  partner_label text
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
-- Who may act on a request (mark it seen, reply): the project's owner or an
-- admin; for a request without a project (Market Report interest), an
-- admin or the owner of any of that client's projects. Caller's rights.
create function public.can_act_on_client_request(p_three_pl uuid, p_forwarder uuid, p_client uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when p_three_pl is null and p_forwarder is null then
      public.is_admin()
      or exists (select 1 from public.three_pl_projects p where p.client_id = p_client and p.owner_id = auth.uid())
      or exists (select 1 from public.forwarder_projects p where p.client_id = p_client and p.owner_id = auth.uid())
    else public.can_write_client_update(p_three_pl, p_forwarder)
  end;
$$;

revoke all on function public.can_act_on_client_request(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_act_on_client_request(uuid, uuid, uuid) to authenticated, service_role;

create or replace function public.mark_client_request_seen(p_request_id uuid)
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
  if v.id is null or not public.can_act_on_client_request(v.three_pl_project_id, v.forwarder_project_id, v.client_id) then
    return false;
  end if;
  if v.status = 'sent' then
    update public.client_requests set status = 'seen', seen_by = auth.uid(), seen_at = now()
    where id = v.id;
  end if;
  return true;
end;
$$;

-- The owner (see above) or an admin; once. The client sees the reply. A
-- reply to an introduction may not contain the partner's full name: the
-- portal never says who a letter is.
create or replace function public.reply_to_client_request(p_request_id uuid, p_reply text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.client_requests%rowtype;
  v_reply text := nullif(pg_catalog.btrim(coalesce(p_reply, '')), '');
  v_name text;
begin
  if not public.has_staff_role() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select r.* into v from public.client_requests r where r.id = p_request_id for update;
  if v.id is null or not public.can_act_on_client_request(v.three_pl_project_id, v.forwarder_project_id, v.client_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_reply is null or char_length(v_reply) > 2000 then
    raise exception 'invalid' using errcode = 'CQ422';
  end if;
  if v.status = 'answered' then
    raise exception 'already answered' using errcode = 'CQ409';
  end if;
  if v.kind = 'introduction' then
    select pg_catalog.btrim(f.company_name) into v_name
    from public.market_report_partner_labels l
    join public.forwarders f on f.id = l.forwarder_id
    where l.forwarder_project_id = v.forwarder_project_id and l.label = v.partner_label;
    if v_name <> '' and pg_catalog.strpos(pg_catalog.lower(v_reply), pg_catalog.lower(v_name)) > 0 then
      raise exception 'names the partner' using errcode = 'CQ423';
    end if;
  end if;
  update public.client_requests
  set staff_reply = v_reply, replied_by = auth.uid(), replied_at = now(), status = 'answered',
      seen_by = coalesce(seen_by, auth.uid()), seen_at = coalesce(seen_at, now())
  where id = v.id;
end;
$$;

-- As in 3a. Withdrawing a reply to an introduction reopens it, so it is
-- refused (CQ409) while the client has another open request for the same
-- letter.
create or replace function public.withdraw_client_request_reply(p_request_id uuid)
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
  if v.kind = 'introduction' and exists (
    select 1 from public.client_requests r
    where r.kind = 'introduction' and r.id <> v.id and r.forwarder_project_id = v.forwarder_project_id
      and r.partner_label = v.partner_label and r.status <> 'answered'
  ) then
    raise exception 'another request is open' using errcode = 'CQ409';
  end if;
  update public.client_requests
  set reply_history = reply_history || jsonb_build_array(jsonb_build_object(
        'reply', v.staff_reply, 'repliedBy', v.replied_by, 'repliedAt', v.replied_at,
        'withdrawnBy', auth.uid(), 'withdrawnAt', now())),
      staff_reply = null, replied_by = null, replied_at = null, status = 'seen'
  where id = v.id;
end;
$$;

create or replace function public.my_client_request_badge()
returns integer
language sql
stable
set search_path = ''
as $$
  select pg_catalog.count(*)::integer from public.client_requests r
  where r.status = 'sent'
    and public.can_act_on_client_request(r.three_pl_project_id, r.forwarder_project_id, r.client_id);
$$;
