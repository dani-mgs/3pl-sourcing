-- HTSUS reference data for the Tariff Calculator, imported from the USITC
-- HTS REST API (hts.usitc.gov/reststop) by /api/cron/hts-release using the
-- service role. Signed-in users read; nobody writes through the app.
--
-- An import runs over several cron invocations (a batch of chapters each),
-- tracked on its hts_releases row. Only a complete import that passes the
-- sanity checks becomes 'current' (activate_hts_release); a failed or partial
-- import never replaces the current release.

create table hts_releases (
  id uuid primary key default gen_random_uuid(),
  -- USITC's release name, e.g. '2026HTSRev20'.
  name text not null
    constraint hts_releases_name_key unique,
  -- e.g. 'Revision 20 (2026)'.
  title text,
  -- The date USITC gives for the release coming into effect.
  release_start_date date,
  status text not null default 'importing'
    constraint hts_releases_status_check
    check (status in ('importing', 'current', 'superseded', 'failed')),
  -- Chapters 1–99 are imported in order; the next one still to import.
  -- 100 means every chapter is in.
  next_chapter smallint not null default 1
    constraint hts_releases_next_chapter_check check (next_chapter between 1 and 100),
  -- Rows stored per chapter, e.g. {"01": 126, "02": 271}; the sanity check
  -- compares these with the current release before activation.
  chapter_counts jsonb not null default '{}'
    constraint hts_releases_chapter_counts_check check (jsonb_typeof(chapter_counts) = 'object'),
  row_count integer not null default 0,
  -- SHA-256 of chapter 99 (heading, description, rate), so a later review
  -- step can tell when the additional-duty headings changed between releases.
  chapter99_digest text,
  -- A cron run holds the import until this time, so two runs never import
  -- the same release at once.
  lease_until timestamptz,
  attempts integer not null default 0,
  -- Short, server-side diagnostic for the last failed run (no raw payloads).
  last_error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  activated_at timestamptz
);

-- At most one current release, and at most one import in progress.
create unique index hts_releases_one_current_idx on hts_releases (status) where status = 'current';
create unique index hts_releases_one_importing_idx on hts_releases (status) where status = 'importing';

create table hts_lines (
  release_id uuid not null references hts_releases(id) on delete cascade,
  -- Digits only (no dots), 4–10 long. Text, never numeric: leading zeros matter.
  hts_code text not null
    constraint hts_lines_hts_code_check check (hts_code ~ '^[0-9]{4,10}$'),
  -- Two-digit chapter, so an interrupted chapter can be cleared and re-imported.
  chapter text not null
    constraint hts_lines_chapter_check check (chapter ~ '^[0-9]{2}$'),
  indent smallint not null,
  -- USITC's description with markup removed.
  description text not null,
  -- Descriptions of the lines above this one, outermost first, so "Pickled"
  -- can be shown as the full article it describes.
  ancestor_descriptions text[] not null default '{}',
  units text[] not null default '{}',
  -- Rate text as published, taken from this line or, when blank, from the
  -- nearest line above it that carries one (rate_from_code). Parsed by the
  -- app at calculation time, never stored as numbers here.
  general_rate text,
  special_rate text,
  other_rate text,
  rate_from_code text,
  footnotes jsonb not null default '[]'
    constraint hts_lines_footnotes_check check (jsonb_typeof(footnotes) = 'array'),
  primary key (release_id, hts_code)
);

create index hts_lines_release_chapter_idx on hts_lines (release_id, chapter);

alter table hts_releases enable row level security;
alter table hts_lines enable row level security;

create policy "Authenticated users can read hts releases"
  on hts_releases for select to authenticated
  using (true);

create policy "Authenticated users can read hts lines"
  on hts_lines for select to authenticated
  using (true);

-- No insert/update/delete policies: app users can't write. The cron route's
-- service-role client bypasses RLS but still needs table privileges.
revoke all on table hts_releases from anon, authenticated;
revoke all on table hts_lines from anon, authenticated;
grant select on table hts_releases to authenticated;
grant select on table hts_lines to authenticated;
grant select, insert, update, delete on table hts_releases to service_role;
grant select, insert, update, delete on table hts_lines to service_role;

-- Makes a fully imported release current, in one transaction: the previous
-- current release becomes 'superseded', and line data of every release that
-- isn't current or importing is deleted (saved estimates keep their own copy
-- of the line they used). Refuses unless the release is still importing,
-- every chapter is in, and the stored row count matches what the import
-- counted, so a partial import can never be activated.
create function activate_hts_release(p_release_id uuid, p_expected_rows integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_release public.hts_releases%rowtype;
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

-- Only the cron route (service role) may activate a release.
revoke all on function activate_hts_release(uuid, integer) from public, anon, authenticated;
grant execute on function activate_hts_release(uuid, integer) to service_role;
