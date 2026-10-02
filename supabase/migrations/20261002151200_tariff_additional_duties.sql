-- Additional duties for the Tariff Calculator (PR 2a: origin-based programs).
--
--   additional_duties      one row per Chapter 99 heading and period: adds a
--                          rate, sets a minimum total rate, or exempts
--   additional_duty_scope  the HTS prefixes a row is limited to (when
--                          hts_scope = 'listed'), optionally limited further
--                          by an article description
--   duty_program_reviews   "mark reviewed" log; only reviewed programs count
--                          toward estimate totals
--   tariff_data_history    every change to duties, scope and fees (trigger)
--   hts_chapter99_changes  heading-level diff of chapter 99 between HTS
--                          releases, written when a release is activated
--
-- A program's review status is derived (duty_program_review_status): it is
-- reviewed only if its latest review is newer than every change to its rows,
-- so any edit puts it back to pending review. Rates are never edited in
-- place: to change a rate, end-date the row and add a new one.
-- Signed-in users read everything; tariff editors (and admins) write
-- duties, scope and reviews (is_tariff_editor()); nobody writes history or
-- chapter 99 changes directly.

-- ============================================================
-- additional_duties
-- ============================================================
create table additional_duties (
  id uuid primary key default gen_random_uuid(),
  program_key text not null references duty_programs(key) on delete restrict,
  authority text not null
    constraint additional_duties_authority_check
    check (authority in ('section_301', 'section_232', 'section_338', 'section_201', 'other')),
  chapter99_heading text not null
    constraint additional_duties_heading_check check (chapter99_heading ~ '^9903\.[0-9]{2}\.[0-9]{2}$'),
  -- minimum_total only: the heading reported when the base rate already
  -- meets the minimum (no additional duty), e.g. 9903.05.38 beside .39.
  chapter99_heading_at_minimum text
    constraint additional_duties_heading_at_minimum_check
    check (chapter99_heading_at_minimum ~ '^9903\.[0-9]{2}\.[0-9]{2}$'),
  -- Who or what the row is for, as shown: "Vietnam", "EU member states",
  -- "USMCA goods of Canada".
  label text not null,
  --   add            rate_pct of the customs value, on top of other duties
  --   minimum_total  column 1 rate + additional = at least rate_pct (U.S.
  --                  note 52(k)); nothing added when the base rate meets it
  --   exempt         the program's duties don't apply (subject to
  --                  condition_text / scope descriptions when set)
  rate_type text not null
    constraint additional_duties_rate_type_check check (rate_type in ('add', 'minimum_total', 'exempt')),
  rate_pct numeric(7,4)
    constraint additional_duties_rate_pct_check check (rate_pct > 0 and rate_pct <= 1000),
  -- ISO alpha-2; NULL = every origin the program covers (exemptions).
  origin_countries text[]
    constraint additional_duties_origins_check
    check (origin_countries is null or array_to_string(origin_countries, ',') ~ '^[A-Z]{2}(,[A-Z]{2})*$'),
  -- 'listed': only HTS codes matching additional_duty_scope rows.
  hts_scope text not null default 'all'
    constraint additional_duties_hts_scope_check check (hts_scope in ('all', 'listed')),
  -- Exemptions that depend on facts the calculator can't check (a USMCA
  -- claim, an end use): shown as "may be exempt if …", never applied.
  condition_text text,
  -- The row doesn't apply when any of these programs' duties apply (e.g.
  -- forced-labour 301 and Section 232, U.S. note 52(f)); exclusion_heading
  -- is the heading claimed then.
  excludes_programs text[] not null default '{}',
  exclusion_heading text
    constraint additional_duties_exclusion_heading_check
    check (exclusion_heading ~ '^9903\.[0-9]{2}\.[0-9]{2}$'),
  -- CBP's reporting order (Section 301 first, then 122, 232, 201).
  filing_order smallint not null default 100,
  effective_from date not null,
  -- Last day the row applies (inclusive); NULL while in force.
  effective_to date,
  legal_status text not null default 'in_force'
    constraint additional_duties_legal_status_check
    check (legal_status in ('in_force', 'in_force_under_litigation', 'enjoined', 'expired')),
  source_label text not null,
  source_url text not null
    constraint additional_duties_source_url_check check (source_url ~ '^https://'),
  source_checked_on date not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),

  constraint additional_duties_dates_check
    check (effective_to is null or effective_to >= effective_from),
  constraint additional_duties_rate_shape_check check (
    (rate_type = 'exempt' and rate_pct is null and chapter99_heading_at_minimum is null)
    or (rate_type = 'add' and rate_pct is not null and chapter99_heading_at_minimum is null
        and condition_text is null)
    or (rate_type = 'minimum_total' and rate_pct is not null and chapter99_heading_at_minimum is not null
        and condition_text is null)
  ),
  constraint additional_duties_exclusion_check
    check ((cardinality(excludes_programs) = 0) = (exclusion_heading is null)),
  -- A heading has one row in force on any given day.
  constraint additional_duties_no_overlap
    exclude using gist (chapter99_heading with =, daterange(effective_from, effective_to, '[]') with &&)
);

create index additional_duties_program_key_idx on additional_duties (program_key);

create trigger additional_duties_audit
  before insert or update on additional_duties
  for each row execute function set_admin_audit_fields();

-- Rates are never edited in place: what a row charges, to whom and from when
-- is fixed once saved. To change it, end-date the row and add a new one.
create function additional_duties_protect_rates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.program_key is distinct from old.program_key
    or new.authority is distinct from old.authority
    or new.chapter99_heading is distinct from old.chapter99_heading
    or new.chapter99_heading_at_minimum is distinct from old.chapter99_heading_at_minimum
    or new.rate_type is distinct from old.rate_type
    or new.rate_pct is distinct from old.rate_pct
    or new.origin_countries is distinct from old.origin_countries
    or new.hts_scope is distinct from old.hts_scope
    or new.excludes_programs is distinct from old.excludes_programs
    or new.exclusion_heading is distinct from old.exclusion_heading
    or new.effective_from is distinct from old.effective_from then
    raise exception 'Rates are not edited in place: end-date this row and add a new one.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger additional_duties_rates_fixed
  before update on additional_duties
  for each row execute function additional_duties_protect_rates();

-- ============================================================
-- additional_duty_scope
-- ============================================================
create table additional_duty_scope (
  id uuid primary key default gen_random_uuid(),
  duty_id uuid not null references additional_duties(id) on delete cascade,
  hts_prefix text not null
    constraint additional_duty_scope_prefix_check check (hts_prefix ~ '^[0-9]{4,10}$'),
  -- Set when the source limits the line to a particular article within the
  -- subheading ("Etrogs (classifiable in subheading 0805.90.01)"): a match is
  -- then only "may be exempt if the article is …".
  article_description text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create unique index additional_duty_scope_unique_idx
  on additional_duty_scope (duty_id, hts_prefix, coalesce(article_description, ''));

create trigger additional_duty_scope_audit
  before insert or update on additional_duty_scope
  for each row execute function set_admin_audit_fields();

-- ============================================================
-- duty_program_reviews
-- ============================================================
create table duty_program_reviews (
  id uuid primary key default gen_random_uuid(),
  program_key text not null references duty_programs(key) on delete restrict,
  reviewed_by uuid not null default auth.uid() references auth.users(id),
  -- clock_timestamp so a change and a review in one transaction still order.
  reviewed_at timestamptz not null default clock_timestamp(),
  -- The HTS release current when reviewed, and its chapter 99 fingerprint.
  hts_release_name text,
  chapter99_digest text,
  note text
    constraint duty_program_reviews_note_check check (char_length(note) <= 1000)
);

create index duty_program_reviews_program_idx on duty_program_reviews (program_key, reviewed_at desc);

-- ============================================================
-- tariff_data_history (written only by trigger)
-- ============================================================
create table tariff_data_history (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid not null,
  program_key text,
  operation text not null
    constraint tariff_data_history_operation_check check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  old_row jsonb,
  new_row jsonb,
  changed_by uuid,
  changed_at timestamptz not null default clock_timestamp()
);

create index tariff_data_history_program_idx on tariff_data_history (program_key, changed_at desc);
create index tariff_data_history_row_idx on tariff_data_history (table_name, row_id, changed_at desc);

-- Security definer so it can write history whatever the caller's grants.
create function record_tariff_data_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_program text;
begin
  if tg_table_name = 'additional_duties' then
    v_program := v_row ->> 'program_key';
  elsif tg_table_name = 'additional_duty_scope' then
    select program_key into v_program
      from public.additional_duties where id = (v_row ->> 'duty_id')::uuid;
  end if;

  insert into public.tariff_data_history (table_name, row_id, program_key, operation, old_row, new_row, changed_by)
  values (
    tg_table_name,
    (v_row ->> 'id')::uuid,
    v_program,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

revoke all on function record_tariff_data_history() from public, anon, authenticated;

create trigger additional_duties_history
  after insert or update or delete on additional_duties
  for each row execute function record_tariff_data_history();
create trigger additional_duty_scope_history
  after insert or update or delete on additional_duty_scope
  for each row execute function record_tariff_data_history();
create trigger customs_fees_history
  after insert or update or delete on customs_fees
  for each row execute function record_tariff_data_history();

-- ============================================================
-- Review status (derived)
-- ============================================================
create view duty_program_review_status
  with (security_invoker = true)
  as
  select
    p.key as program_key,
    (select count(*)::int from public.additional_duties d where d.program_key = p.key) as row_count,
    r.reviewed_at as last_reviewed_at,
    r.reviewed_by as last_reviewed_by,
    r.hts_release_name as reviewed_release_name,
    r.chapter99_digest as reviewed_chapter99_digest,
    c.last_changed_at,
    case
      when not exists (select 1 from public.additional_duties d where d.program_key = p.key) then 'not_loaded'
      when r.reviewed_at is not null and r.reviewed_at >= coalesce(c.last_changed_at, '-infinity'::timestamptz)
        then 'reviewed'
      else 'pending_review'
    end as review_status
  from public.duty_programs p
  left join lateral (
    select x.reviewed_at, x.reviewed_by, x.hts_release_name, x.chapter99_digest
    from public.duty_program_reviews x
    where x.program_key = p.key
    order by x.reviewed_at desc
    limit 1
  ) r on true
  left join lateral (
    select max(h.changed_at) as last_changed_at
    from public.tariff_data_history h
    where h.program_key = p.key
  ) c on true;

-- ============================================================
-- hts_chapter99_changes + activation that records them
-- ============================================================
create table hts_chapter99_changes (
  id bigint generated always as identity primary key,
  release_id uuid not null references hts_releases(id),
  release_name text not null,
  hts_code text not null,
  change text not null
    constraint hts_chapter99_changes_change_check check (change in ('added', 'removed', 'changed')),
  old_description text,
  new_description text,
  old_rate text,
  new_rate text,
  detected_at timestamptz not null default now()
);

create index hts_chapter99_changes_detected_idx on hts_chapter99_changes (detected_at desc);

-- Same rules as before, plus: before the previous release's lines are
-- deleted, record every chapter 99 heading added, removed or changed
-- (description or rate) against it.
create or replace function activate_hts_release(p_release_id uuid, p_expected_rows integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_release public.hts_releases%rowtype;
  v_previous uuid;
  v_stored integer;
begin
  select * into v_release from public.hts_releases where id = p_release_id for update;
  if not found then
    raise exception 'HTS release % not found', p_release_id;
  end if;
  if v_release.status <> 'importing' then
    raise exception 'HTS release % is %, not importing', v_release.name, v_release.status;
  end if;
  if v_release.next_chapter <> 100 then
    raise exception 'HTS release % is incomplete (next chapter %)', v_release.name, v_release.next_chapter;
  end if;

  select count(*) into v_stored from public.hts_lines where release_id = p_release_id;
  if v_stored <> p_expected_rows or v_stored <> v_release.row_count then
    raise exception 'HTS release % has % stored rows; expected %', v_release.name, v_stored, p_expected_rows;
  end if;

  select id into v_previous from public.hts_releases where status = 'current';
  if v_previous is not null then
    insert into public.hts_chapter99_changes
      (release_id, release_name, hts_code, change, old_description, new_description, old_rate, new_rate)
    select p_release_id, v_release.name, coalesce(n.hts_code, o.hts_code),
      case when o.hts_code is null then 'added' when n.hts_code is null then 'removed' else 'changed' end,
      o.description, n.description, o.general_rate, n.general_rate
    from (select * from public.hts_lines where release_id = v_previous and chapter = '99') o
    full join (select * from public.hts_lines where release_id = p_release_id and chapter = '99') n
      on n.hts_code = o.hts_code
    where o.hts_code is null or n.hts_code is null
      or n.description is distinct from o.description
      or n.general_rate is distinct from o.general_rate;
  end if;

  update public.hts_releases set status = 'superseded' where status = 'current';
  update public.hts_releases
    set status = 'current', activated_at = now(), completed_at = coalesce(completed_at, now()),
        lease_until = null, last_error = null
    where id = p_release_id;

  delete from public.hts_lines
    where release_id in (
      select id from public.hts_releases where status in ('superseded', 'failed')
    );
end;
$$;

revoke all on function activate_hts_release(uuid, integer) from public, anon, authenticated;
grant execute on function activate_hts_release(uuid, integer) to service_role;

-- ============================================================
-- duty_estimates: additional duties and the review snapshot
-- ============================================================
-- Existing rows keep total = base + fees (additional defaults to 0). Adding
-- columns with defaults doesn't fire the lock trigger.
alter table duty_estimates
  add column additional_duties_usd numeric(14,2) not null default 0
    constraint duty_estimates_additional_duties_check check (additional_duties_usd >= 0),
  -- [{ programKey, name, status, reviewedAt, reviewedBy, stale... }] as shown.
  add column duty_reviews jsonb not null default '[]'
    constraint duty_estimates_duty_reviews_check check (jsonb_typeof(duty_reviews) = 'array');

alter table duty_estimates drop constraint duty_estimates_total_check;
alter table duty_estimates add constraint duty_estimates_total_check
  check (total_usd = base_duty_usd + additional_duties_usd + fees_usd);

-- ============================================================
-- RLS and grants
-- ============================================================
alter table additional_duties enable row level security;
alter table additional_duty_scope enable row level security;
alter table duty_program_reviews enable row level security;
alter table tariff_data_history enable row level security;
alter table hts_chapter99_changes enable row level security;

create policy "Authenticated users can read additional duties"
  on additional_duties for select to authenticated using (true);
create policy "Tariff editors can insert additional duties"
  on additional_duties for insert to authenticated with check (is_tariff_editor());
create policy "Tariff editors can update additional duties"
  on additional_duties for update to authenticated using (is_tariff_editor()) with check (is_tariff_editor());
create policy "Tariff editors can delete additional duties"
  on additional_duties for delete to authenticated using (is_tariff_editor());

create policy "Authenticated users can read additional duty scope"
  on additional_duty_scope for select to authenticated using (true);
create policy "Tariff editors can insert additional duty scope"
  on additional_duty_scope for insert to authenticated with check (is_tariff_editor());
create policy "Tariff editors can update additional duty scope"
  on additional_duty_scope for update to authenticated using (is_tariff_editor()) with check (is_tariff_editor());
create policy "Tariff editors can delete additional duty scope"
  on additional_duty_scope for delete to authenticated using (is_tariff_editor());

create policy "Authenticated users can read duty program reviews"
  on duty_program_reviews for select to authenticated using (true);
create policy "Tariff editors can record a review in their own name"
  on duty_program_reviews for insert to authenticated
  with check (is_tariff_editor() and reviewed_by = auth.uid());

create policy "Authenticated users can read tariff data history"
  on tariff_data_history for select to authenticated using (true);

create policy "Authenticated users can read chapter 99 changes"
  on hts_chapter99_changes for select to authenticated using (true);

revoke all on table additional_duties from anon, authenticated;
revoke all on table additional_duty_scope from anon, authenticated;
revoke all on table duty_program_reviews from anon, authenticated;
revoke all on table tariff_data_history from anon, authenticated;
revoke all on table hts_chapter99_changes from anon, authenticated;
revoke all on duty_program_review_status from anon, authenticated;

grant select, insert, update, delete on table additional_duties to authenticated;
grant select, insert, update, delete on table additional_duty_scope to authenticated;
grant select, insert on table duty_program_reviews to authenticated;
grant select on table tariff_data_history to authenticated;
grant select on table hts_chapter99_changes to authenticated;
grant select on duty_program_review_status to authenticated;
-- The activation function (run by the cron's service role) writes changes.
grant select, insert on table hts_chapter99_changes to service_role;
