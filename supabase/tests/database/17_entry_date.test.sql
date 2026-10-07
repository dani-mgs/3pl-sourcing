-- Expected entry date on duty estimates (migration 20261007123012).
-- entry_date is the day the goods enter the US; as_of_date stays the day the
-- estimate was calculated. save_duty_estimate() accepts an entry date from a
-- day before to 366 days after the calculation day, still accepts a payload
-- without one (code still live during a deploy) and judges the column 2 rule
-- on the entry date. The column is locked like the rest of the row. Rolled
-- back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'owner@test.local', '{"role":"logistics_expert"}');

update hts_releases set status = 'superseded' where status = 'current';
insert into hts_releases (id, name, status, next_chapter, row_count) values
  ('00000000-0000-4000-8000-00000000e301', 'pgTAPEntry1', 'current', 100, 1);
insert into hts_lines (release_id, hts_code, chapter, indent, description, ancestor_descriptions, units, general_rate, special_rate, other_rate) values
  ('00000000-0000-4000-8000-00000000e301', '6402993160', '64', 3, 'Other',
   '{"Other footwear:","Other:"}', '{prs.}', '6%', 'Free (A,AU)', '35%');
-- A country that joins the column 2 list 10 days from now.
insert into hts_column2_countries (country_code, effective_from, source_label, source_url)
  values ('ZW', current_date + 10, 'pgTAP', 'https://example.gov/');

create function pg_temp.payload(p_overrides jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object(
    'as_of_date', (now() at time zone 'utc')::date, 'hts_code', '6402993160', 'hts_description', 'Other',
    'hts_ancestor_descriptions', '["Other footwear:","Other:"]'::jsonb,
    'hts_release_name', 'pgTAPEntry1', 'rate_column', 'general', 'rate_text', '6%',
    'special_rate_text', 'Free (A,AU)', 'origin_country', 'VN', 'shipment_mode', 'Sea',
    'customs_value_original', 10000, 'original_currency', 'USD', 'exchange_rate_to_usd', 1,
    'customs_value_usd', 10000, 'base_duty_usd', 600, 'additional_duties_usd', 0, 'fees_usd', 47.14,
    'total_usd', 647.14,
    'lines', '[{"kind":"duty","amountUsd":600},{"kind":"fee","amountUsd":47.14}]'::jsonb,
    'warnings', '[]'::jsonb, 'duty_reviews', '[]'::jsonb
  ) || p_overrides;
$$;

-- Today in UTC, as a literal date offset, for the payloads below.
create function pg_temp.day(p_offset int) returns text language sql as $$
  select ((now() at time zone 'utc')::date + p_offset)::text;
$$;

select col_type_is('duty_estimates', 'entry_date', 'date', 'duty_estimates.entry_date is a date');
select col_not_null('duty_estimates', 'entry_date', 'entry_date is required');

-- ---- In window: accepted -------------------------------------------------------
set local role service_role;
select lives_ok(
  format($$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
    pg_temp.payload('{"label":"in-window","entry_date":"%s"}')) $$, pg_temp.day(32)),
  'an entry date 32 days out is saved'
);
select lives_ok(
  format($$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
    pg_temp.payload('{"label":"max","entry_date":"%s"}')) $$, pg_temp.day(366)),
  'the entry date 366 days out is saved'
);
select lives_ok(
  format($$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
    pg_temp.payload('{"label":"min","entry_date":"%s"}')) $$, pg_temp.day(-1)),
  'yesterday (UTC) is saved'
);
reset role;
select is(
  (select entry_date::text from duty_estimates where label = 'in-window'), pg_temp.day(32),
  'the saved row keeps the entry date'
);
select is(
  (select as_of_date::text from duty_estimates where label = 'in-window'), pg_temp.day(0),
  'the calculation day (as_of_date) is stored separately, as today'
);

-- ---- Out of window: refused ----------------------------------------------------
set local role service_role;
select throws_ok(
  format($$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
    pg_temp.payload('{"entry_date":"%s"}')) $$, pg_temp.day(367)),
  '23514', null, 'an entry date 367 days out is refused'
);
select throws_ok(
  format($$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
    pg_temp.payload('{"entry_date":"%s"}')) $$, pg_temp.day(-2)),
  '23514', null, 'an entry date two days ago is refused'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
    pg_temp.payload('{"entry_date":"2026-02-30"}')) $$,
  '22008', null, 'a date that doesn''t exist is refused'
);
-- The calculation-day check is unchanged.
select throws_ok(
  format($$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
    pg_temp.payload('{"as_of_date":"%s","entry_date":"%s"}')) $$, pg_temp.day(-3), pg_temp.day(-3)),
  '23514', null, 'a calculation day that isn''t today or yesterday is still refused'
);

-- ---- Code that predates entry_date ---------------------------------------------
select lives_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload('{"label":"no-entry"}')) $$,
  'a payload without entry_date still saves (old code during a deploy)'
);
select lives_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
    pg_temp.payload('{"label":"null-entry","entry_date":null}')) $$,
  'a payload with a null entry_date still saves'
);
reset role;
select is(
  (select entry_date::text from duty_estimates where label = 'no-entry'), pg_temp.day(0),
  'without entry_date the entry date is the calculation day'
);
select is(
  (select entry_date::text from duty_estimates where label = 'null-entry'), pg_temp.day(0),
  'a null entry_date also defaults to the calculation day'
);

-- ---- Column 2 is judged on the entry date --------------------------------------
-- ZW joins the column 2 list in 10 days: column 2 only fits an entry date from then on.
set local role service_role;
select lives_ok(
  format($$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
    pg_temp.payload('{"label":"c2","origin_country":"ZW","rate_column":"column2","rate_text":"35%%","entry_date":"%s"}')) $$,
    pg_temp.day(20)),
  'column 2 is accepted for an entry date after the country joins the list'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
    pg_temp.payload('{"origin_country":"ZW","rate_column":"column2","rate_text":"35%"}')) $$,
  '23514', null, 'column 2 is refused when the entry date (today) is before the country joins the list'
);
select throws_ok(
  format($$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
    pg_temp.payload('{"origin_country":"ZW","entry_date":"%s"}')) $$, pg_temp.day(20)),
  '23514', null, 'the general column is refused for an entry date when the country is on the column 2 list'
);
reset role;

-- ---- Locked, and the table's own check ----------------------------------------
select throws_ok(
  $$ update duty_estimates set entry_date = entry_date + 1 where label = 'in-window' $$,
  '42501', null, 'entry_date can''t be changed once saved (lock trigger)'
);
select throws_ok(
  $$ insert into duty_estimates (created_by, as_of_date, entry_date, hts_code, hts_description, hts_release_name,
       rate_column, rate_text, origin_country, shipment_mode, customs_value_original, customs_value_usd,
       base_duty_usd, fees_usd, total_usd, lines)
     values ('00000000-0000-4000-8000-0000000000a1', current_date, current_date + 400, '6402993160', 'x', 'r',
       'general', 'Free', 'VN', 'Sea', 100, 100, 0, 1, 1, '[]') $$,
  '23514', null, 'the table itself refuses an entry date outside the window'
);
select lives_ok(
  $$ insert into duty_estimates (created_by, as_of_date, hts_code, hts_description, hts_release_name,
       rate_column, rate_text, origin_country, shipment_mode, customs_value_original, customs_value_usd,
       base_duty_usd, fees_usd, total_usd, lines)
     values ('00000000-0000-4000-8000-0000000000a1', current_date, '6402993160', 'x', 'r',
       'general', 'Free', 'VN', 'Sea', 100, 100, 0, 1, 1, '[]') $$,
  'an insert without entry_date (set up by hand) defaults it'
);

-- ---- Grants unchanged ----------------------------------------------------------
select ok(
  has_function_privilege('service_role', 'save_duty_estimate(uuid, jsonb)', 'execute')
    and not has_function_privilege('anon', 'save_duty_estimate(uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'save_duty_estimate(uuid, jsonb)', 'execute')
    and not (select exists (
      select 1 from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.proname = 'save_duty_estimate' and a.grantee = 0
    )),
  'save_duty_estimate is still executable by the service role only (not PUBLIC, anon or signed-in users)'
);

select * from finish();
rollback;
