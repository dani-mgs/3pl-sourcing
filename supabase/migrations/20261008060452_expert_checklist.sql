-- Expert to-do checklist (/admin/checklist): a progress tracker for the tariff
-- experts. Ticking an item changes nothing else: it does not mark a program
-- reviewed, change a rate or touch any calculation. Real reviews stay in the
-- duty-data review flow.
--
-- Tariff editors and admins read; nobody writes the tables directly. The one
-- way to tick, untick or add a note is set_checklist_item(), which checks the
-- caller's role per item (admin-only items need an admin), uses auth.uid()
-- (never a passed-in user), and writes the history row. Items can't be added
-- or removed from the API: there is no insert/delete grant or policy.

create table expert_checklist_items (
  id uuid primary key default gen_random_uuid(),
  key text not null unique
    constraint expert_checklist_items_key_check check (key ~ '^[a-z0-9_]+$'),
  group_key text not null
    constraint expert_checklist_items_group_check check (group_key in ('A', 'B', 'C', 'D', 'E', 'F')),
  sort_order integer not null,
  title text not null,
  description text not null,
  -- 'decision' items are business decisions, not expert-only tasks.
  kind text not null default 'task'
    constraint expert_checklist_items_kind_check check (kind in ('task', 'decision')),
  -- Who may tick it: tariff editors and admins, or admins only.
  editable_by text not null default 'editor'
    constraint expert_checklist_items_editable_by_check check (editable_by in ('editor', 'admin')),
  -- An internal page to open (never an external URL).
  link_href text
    constraint expert_checklist_items_link_check check (link_href is null or link_href ~ '^/[a-z0-9/_-]*$'),
  -- An optional read-only live status shown beside the tick (the app builds
  -- the text from its own data; the tick never follows it).
  hint_kind text
    constraint expert_checklist_items_hint_kind_check check (hint_kind in ('program_review', 'program_rows', 'duty_row_rate')),
  hint_ref text,
  done boolean not null default false,
  done_by uuid references auth.users(id) on delete set null,
  done_at timestamptz,
  note text
    constraint expert_checklist_items_note_check check (char_length(note) <= 500),
  -- Bumped on every change; set_checklist_item() refuses a stale one.
  version integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz,

  constraint expert_checklist_items_hint_check check ((hint_kind is null) = (hint_ref is null)),
  constraint expert_checklist_items_done_check check (done or (done_by is null and done_at is null))
);

create table expert_checklist_events (
  id bigint generated always as identity primary key,
  item_id uuid not null references expert_checklist_items(id) on delete restrict,
  action text not null
    constraint expert_checklist_events_action_check check (action in ('ticked', 'unticked', 'note')),
  actor uuid references auth.users(id) on delete set null,
  at timestamptz not null default clock_timestamp(),
  note text
);

create index expert_checklist_events_item_idx on expert_checklist_events (item_id, at desc);

alter table expert_checklist_items enable row level security;
alter table expert_checklist_events enable row level security;

revoke all on table expert_checklist_items from anon, authenticated;
revoke all on table expert_checklist_events from anon, authenticated;
grant select on table expert_checklist_items to authenticated;
grant select on table expert_checklist_events to authenticated;

create policy "Tariff editors can read checklist items"
  on expert_checklist_items for select to authenticated using (is_tariff_editor());
create policy "Tariff editors can read checklist events"
  on expert_checklist_events for select to authenticated using (is_tariff_editor());

-- Returns the item's new version. Errors are generic on purpose: an unknown
-- item and a missing permission look the same.
create function set_checklist_item(p_item uuid, p_done boolean, p_note text, p_expected_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.expert_checklist_items;
  v_note text := nullif(btrim(p_note), '');
  v_action text;
  v_version integer;
begin
  if v_uid is null then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if p_item is null or p_done is null or p_expected_version is null then
    raise exception 'The request is incomplete.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'The note is too long.' using errcode = '22023';
  end if;

  select * into v_item from public.expert_checklist_items where id = p_item for update;
  if not found
    or not (case v_item.editable_by when 'admin' then public.is_admin() else public.is_tariff_editor() end) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if v_item.version <> p_expected_version then
    raise exception 'This item was changed by someone else.' using errcode = '40001';
  end if;

  if p_done and not v_item.done then
    v_action := 'ticked';
  elsif not p_done and v_item.done then
    v_action := 'unticked';
  elsif v_note is distinct from v_item.note then
    v_action := 'note';
  else
    return v_item.version;
  end if;

  v_version := v_item.version + 1;
  -- A tick records who and when; an untick clears both (the events keep
  -- every action); a note-only change leaves them as they were.
  update public.expert_checklist_items
  set done = p_done,
      done_by = case v_action when 'ticked' then v_uid when 'unticked' then null else v_item.done_by end,
      done_at = case v_action when 'ticked' then clock_timestamp() when 'unticked' then null else v_item.done_at end,
      note = v_note,
      version = v_version,
      updated_by = v_uid,
      updated_at = clock_timestamp()
  where id = p_item;

  insert into public.expert_checklist_events (item_id, action, actor, note)
  values (p_item, v_action, v_uid, v_note);
  return v_version;
end;
$$;

revoke all on function set_checklist_item(uuid, boolean, text, integer) from public, anon;
grant execute on function set_checklist_item(uuid, boolean, text, integer) to authenticated;

-- ---- Seed ---------------------------------------------------------------
-- A and F are admin-only (granting a role is an admin task; F are business
-- decisions). Everything else is for tariff editors and admins.
insert into expert_checklist_items
  (key, group_key, sort_order, title, description, kind, editable_by, link_href, hint_kind, hint_ref)
values
  ('access_grant_editors', 'A', 10, 'Grant the tariff editor role to each reviewing expert',
   'In Administration, use "Make tariff editor" on each expert who will review duty data. The permission takes effect on their next sign-in or token refresh.',
   'task', 'admin', '/admin', null, null),

  ('review_section_301_china', 'B', 10, 'Review Section 301 (China)',
   'Check the program''s rows against their sources, then use "Mark reviewed" on its review page. Ticking this box does not mark it reviewed.',
   'task', 'editor', '/tariff-calculator/duty-data/section_301_china', 'program_review', 'section_301_china'),
  ('review_section_301_forced_labor', 'B', 20, 'Review Section 301 (forced labour)',
   'Check the program''s rows against their sources, then use "Mark reviewed" on its review page. Ticking this box does not mark it reviewed.',
   'task', 'editor', '/tariff-calculator/duty-data/section_301_forced_labor', 'program_review', 'section_301_forced_labor'),
  ('review_section_301_brazil', 'B', 30, 'Review Section 301 (Brazil)',
   'Check the program''s rows against their sources, then use "Mark reviewed" on its review page. Ticking this box does not mark it reviewed.',
   'task', 'editor', '/tariff-calculator/duty-data/section_301_brazil', 'program_review', 'section_301_brazil'),
  ('review_section_232_metals', 'B', 40, 'Review Section 232 (steel, aluminium, copper)',
   'Check the program''s rows against their sources, then use "Mark reviewed" on its review page. Ticking this box does not mark it reviewed.',
   'task', 'editor', '/tariff-calculator/duty-data/section_232_metals', 'program_review', 'section_232_metals'),

  ('resolve_hts_9903_82_22', 'C', 10, 'HTS 9903.82.22: confirm the rate and origins',
   'The app has one rate for this heading; the expert workbook (Annex I-C) says 25%. Confirm the correct rate and which origins it applies to, then correct the row in Duty data.',
   'task', 'editor', '/tariff-calculator/duty-data/section_232_metals', 'duty_row_rate', '9903.82.22'),

  ('load_232_vehicles', 'D', 10, 'Load Section 232: vehicles and parts',
   'Add the rows for this program in Duty data. The workbook rates are for non-partner or China origin; other origins need expert input.',
   'task', 'editor', '/tariff-calculator/duty-data/section_232_vehicles', 'program_rows', 'section_232_vehicles'),
  ('load_232_buses', 'D', 20, 'Load Section 232: buses',
   'Needs a developer to add the program first (no program exists in the app yet). Duty data can add rows only to an existing program. The workbook rates are for non-partner or China origin; other origins need expert input.',
   'task', 'editor', null, null, null),
  ('load_232_timber', 'D', 30, 'Load Section 232: timber',
   'Add the rows for this program in Duty data. The workbook rates are for non-partner or China origin; other origins need expert input.',
   'task', 'editor', '/tariff-calculator/duty-data/section_232_timber', 'program_rows', 'section_232_timber'),
  ('load_232_furniture', 'D', 40, 'Load Section 232: furniture',
   'Needs a developer to add the program first (no program exists in the app yet). Duty data can add rows only to an existing program. The workbook rates are for non-partner or China origin; other origins need expert input.',
   'task', 'editor', null, null, null),
  ('load_232_cabinets', 'D', 50, 'Load Section 232: cabinets',
   'Needs a developer to add the program first (no program exists in the app yet). Duty data can add rows only to an existing program. The workbook rates are for non-partner or China origin; other origins need expert input.',
   'task', 'editor', null, null, null),
  ('load_232_semiconductors', 'D', 60, 'Load Section 232: semiconductors',
   'Add the rows for this program in Duty data. The workbook rates are for non-partner or China origin; other origins need expert input.',
   'task', 'editor', '/tariff-calculator/duty-data/section_232_semiconductors', 'program_rows', 'section_232_semiconductors'),
  ('load_232_pharmaceuticals', 'D', 70, 'Load Section 232: pharmaceuticals',
   'Add the rows for this program in Duty data. The workbook rates are for non-partner or China origin; other origins need expert input.',
   'task', 'editor', '/tariff-calculator/duty-data/section_232_pharmaceuticals', 'program_rows', 'section_232_pharmaceuticals'),
  ('load_232_drones', 'D', 80, 'Load Section 232: drones',
   'Add the rows for this program in Duty data. The workbook rates are for non-partner or China origin; other origins need expert input.',
   'task', 'editor', '/tariff-calculator/duty-data/section_232_drones', 'program_rows', 'section_232_drones'),
  ('load_232_polysilicon', 'D', 90, 'Load Section 232: polysilicon',
   'Needs a developer to add the program first (no program exists in the app yet). Duty data can add rows only to an existing program. The workbook rates are for non-partner or China origin; other origins need expert input.',
   'task', 'editor', null, null, null),

  ('schedule_2026_12_04', 'E', 10, 'Load the scheduled rate change of 2026-12-04',
   'Enter the change in Duty data: end-date the current row and add the new one from the change date.',
   'task', 'editor', '/tariff-calculator/duty-data', null, null),
  ('schedule_2027_01_01', 'E', 20, 'Load the scheduled rate change of 2027-01-01',
   'Enter the change in Duty data: end-date the current row and add the new one from the change date.',
   'task', 'editor', '/tariff-calculator/duty-data', null, null),
  ('schedule_2027_02_09', 'E', 30, 'Load the scheduled rate change of 2027-02-09',
   'Enter the change in Duty data: end-date the current row and add the new one from the change date.',
   'task', 'editor', '/tariff-calculator/duty-data', null, null),
  ('schedule_2028_01_01', 'E', 40, 'Load the scheduled rate change of 2028-01-01',
   'Enter the change in Duty data: end-date the current row and add the new one from the change date.',
   'task', 'editor', '/tariff-calculator/duty-data', null, null),
  ('schedule_second_four_year_review', 'E', 50, 'Load the second four-year review',
   'Enter its rate changes in Duty data: end-date the current rows and add the new ones from their start dates.',
   'task', 'editor', '/tariff-calculator/duty-data', null, null),

  ('decide_forwarder_ranking_basis', 'F', 10, 'Decide the forwarder ranking basis',
   'A business decision, not an expert-only task: which basis ranks forwarders.',
   'decision', 'admin', null, null, null),
  ('decide_multi_sku_entries', 'F', 20, 'Decide whether Move needs multi-SKU entries',
   'A business decision, not an expert-only task: whether estimates need multi-SKU entries (one MPF per entry across SKUs).',
   'decision', 'admin', null, null, null);
