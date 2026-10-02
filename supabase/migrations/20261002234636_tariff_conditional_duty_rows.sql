-- Additional duties, PR 2b: what China Section 301 and Section 232 metals
-- need beyond PR 2a's rows.
--
--   additional_duties.rate_type 'unconfirmed'  a heading whose rate isn't
--       confirmed yet (e.g. 9903.82.22): named "may apply", never charged
--   additional_duties.condition_text on charging rows  a rate that depends
--       on a fact the calculator can't check (UK melt, U.S. metal content,
--       end use); before, only exemptions had conditions
--   additional_duties.assume_condition  whether the calculator treats the
--       condition as met. Seeds set it only where the condition RAISES the
--       duty, so an unknown fact never lowers an estimate; tariff editors can
--       change it per row (it's data, and any change puts the program back
--       to pending review)
--   additional_duty_scope.excluded  takes a statistical number out of a row
--       ("8-digit subheading, except statistical number …")
--   additional_duty_scope_counts  lines per row, for the duty-data screens
--
-- One heading may now have rows for different origin groups in the same
-- period (a definite Russia row beside an any-origin conditional one), so
-- the no-overlap rule is per heading AND origins. China 301 is listed before
-- forced-labour 301 (CBP: Section 301 first; the order between the two isn't
-- stated, so China's own action comes first).

alter table additional_duties drop constraint additional_duties_rate_type_check;
alter table additional_duties add constraint additional_duties_rate_type_check
  check (rate_type in ('add', 'minimum_total', 'exempt', 'unconfirmed'));

alter table additional_duties add column assume_condition boolean not null default false;

alter table additional_duties drop constraint additional_duties_rate_shape_check;
alter table additional_duties add constraint additional_duties_rate_shape_check check (
  (rate_type = 'exempt' and rate_pct is null and chapter99_heading_at_minimum is null)
  or (rate_type = 'add' and rate_pct is not null and chapter99_heading_at_minimum is null)
  or (rate_type = 'minimum_total' and rate_pct is not null and chapter99_heading_at_minimum is not null)
  -- The rate as published (may be unclear); condition_text says what's open.
  or (rate_type = 'unconfirmed' and chapter99_heading_at_minimum is null and condition_text is not null
      and not assume_condition)
);
alter table additional_duties add constraint additional_duties_assume_condition_check
  check (not assume_condition or condition_text is not null);

-- Immutable wrapper so the origin group can be part of the exclusion
-- constraint (array_to_string itself is only stable).
create function additional_duty_origin_key(p_origins text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_to_string(p_origins, ','), '*')
$$;

alter table additional_duties drop constraint additional_duties_no_overlap;
alter table additional_duties add constraint additional_duties_no_overlap
  exclude using gist (
    chapter99_heading with =,
    (public.additional_duty_origin_key(origin_countries)) with =,
    daterange(effective_from, effective_to, '[]') with &&
  );

-- Rates stay fixed once saved (PR 2a), and a row can't become conditional or
-- unconditional in place either: that changes what it charges.
create or replace function additional_duties_protect_rates()
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
    or new.effective_from is distinct from old.effective_from
    or (new.condition_text is null) <> (old.condition_text is null) then
    raise exception 'Rates are not edited in place: end-date this row and add a new one.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

alter table additional_duty_scope add column excluded boolean not null default false;
alter table additional_duty_scope add constraint additional_duty_scope_excluded_check
  check (not excluded or article_description is null);

create view additional_duty_scope_counts
  with (security_invoker = true)
  as
  select duty_id, count(*)::int as line_count, count(*) filter (where excluded)::int as excluded_count
  from public.additional_duty_scope
  group by duty_id;

revoke all on additional_duty_scope_counts from anon, authenticated;
grant select on additional_duty_scope_counts to authenticated;

-- Display order (CBP filing order: Section 301 first). duty_programs'
-- updated_at trigger is paused so the row keeps its real last-updated time.
alter table duty_programs disable trigger duty_programs_audit;
update duty_programs set sort_order = 5 where key = 'section_301_china';
alter table duty_programs enable trigger duty_programs_audit;
