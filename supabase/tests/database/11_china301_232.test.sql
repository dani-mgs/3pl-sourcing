-- PR 2b: China Section 301 and Section 232 metals. The seed is pending
-- review and matches its source counts; conditional, unconfirmed and
-- excluded-line rows keep their shape; a heading may have rows for different
-- origin groups but not two for the same group at once; whether a condition
-- is assumed can be changed by a tariff editor (and puts the program back to
-- pending review), but a row can't become conditional in place. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create function pg_temp.act_as(uid uuid, meta jsonb)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', meta)::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.status(p text) returns text language sql as $$
  select review_status from duty_program_review_status where program_key = p
$$;

create function pg_temp.lines(p_heading text, p_origins text) returns int language sql as $$
  select coalesce(sum(c.line_count), 0)::int from additional_duty_scope_counts c
  join additional_duties d on d.id = c.duty_id
  where d.chapter99_heading = p_heading and additional_duty_origin_key(d.origin_countries) = p_origins
$$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'expert@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000e1', 'editor@test.local', '{"role":"logistics_expert","tariff_editor":true}');

-- ---- Seed ------------------------------------------------------------------
select is((select count(*)::int from additional_duties where program_key = 'section_301_china'), 18,
  'China 301 seed: 14 charging rows, 2 unconfirmed (from Nov 10, 2026), 2 exclusion rows');
select is((select count(*)::int from additional_duties where program_key = 'section_232_metals'), 28,
  'Section 232 metals seed: 28 rows');
select is(pg_temp.status('section_301_china'), 'pending_review', 'the China 301 seed is pending review');
select is(pg_temp.status('section_232_metals'), 'pending_review', 'the Section 232 metals seed is pending review');
select is(pg_temp.lines('9903.88.01', 'CN'), 856, 'List 1 (note 20(b)) has 856 subheadings, as USITC lists');
select is(pg_temp.lines('9903.88.03', 'CN'), 5906, 'List 3 (note 20(f)) has 5,906 subheadings, as USITC lists');
select is(pg_temp.lines('9903.91.01', 'CN'), 348, 'note 31(b) has 348 lines, as its numbering (5)-(352) states');
select is(
  (select rate_pct from additional_duties where chapter99_heading = '9903.88.15'), 7.5::numeric,
  'List 4A is +7.5% (9903.88.15)'
);
select is(
  (select count(*)::int from additional_duty_scope s join additional_duties d on d.id = s.duty_id
   where d.chapter99_heading = '9903.88.15' and s.excluded),
  16, 'List 4A excepts 16 statistical numbers (note 20(s)(ii))'
);
select is(
  (select row(rate_type, effective_to)::text from additional_duties where chapter99_heading = '9903.88.69'),
  '(exempt,2026-11-09)', 'USTR exclusions are exemptions that end after November 9, 2026'
);
select ok(
  (select bool_and(s.article_description is not null) from additional_duty_scope s
   join additional_duties d on d.id = s.duty_id where d.chapter99_heading in ('9903.88.69', '9903.88.70')),
  'every exclusion line carries the exclusion text, so it is never applied automatically'
);
select is(
  (select row(rate_type, rate_pct, chapter99_heading_at_minimum)::text from additional_duties where chapter99_heading = '9903.82.10'),
  '(minimum_total,15.0000,9903.82.11)', 'derivatives of note 16(c)(ix)-(x): minimum total 15% (9903.82.10 / .11)'
);
select ok(
  (select bool_and(not assume_condition) from additional_duties
   where program_key = 'section_232_metals' and condition_text is not null),
  'no Section 232 condition is assumed: the higher rate applies until a fact is confirmed'
);
select is(
  (select assume_condition from additional_duties where chapter99_heading = '9903.92.10'), true,
  'the ship-to-shore crane condition raises the duty, so it is assumed'
);
select is((select count(*)::int from additional_duties where chapter99_heading = '9903.85.67'), 2,
  'Russian aluminium: a definite Russia row and an any-origin conditional row share the heading');
select ok(
  (select bool_and(source_checked_on = '2026-10-03' and source_url like 'https://%')
   from additional_duties where program_key in ('section_301_china', 'section_232_metals')),
  'every PR 2b row has a source link and the date it was checked'
);
select is((select sort_order from duty_programs where key = 'section_301_china'), 5,
  'China 301 is listed before forced-labour 301');

-- ---- Shapes ----------------------------------------------------------------
select throws_ok(
  $$ insert into additional_duties (program_key, authority, chapter99_heading, label, rate_type, rate_pct, origin_countries,
       effective_from, source_label, source_url, source_checked_on)
     values ('section_301_china', 'section_301', '9903.91.99', 'x', 'unconfirmed', 10, array['CN'], '2026-01-01', 'x', 'https://example.gov/', '2026-10-03') $$,
  '23514', null, 'an unconfirmed row must say what is unconfirmed'
);
select throws_ok(
  $$ insert into additional_duties (program_key, authority, chapter99_heading, label, rate_type, rate_pct, origin_countries,
       assume_condition, effective_from, source_label, source_url, source_checked_on)
     values ('section_301_china', 'section_301', '9903.91.98', 'x', 'add', 10, array['CN'], true, '2026-01-01', 'x', 'https://example.gov/', '2026-10-03') $$,
  '23514', null, 'a condition can only be assumed when there is one'
);
select throws_ok(
  $$ insert into additional_duty_scope (duty_id, hts_prefix, article_description, excluded)
     select id, '2931909051', 'x', true from additional_duties where chapter99_heading = '9903.88.04' $$,
  '23514', null, 'an excluded statistical number has no article description'
);
select throws_ok(
  $$ insert into additional_duties (program_key, authority, chapter99_heading, label, rate_type, rate_pct, origin_countries,
       effective_from, source_label, source_url, source_checked_on)
     values ('section_232_metals', 'section_232', '9903.85.67', 'x', 'add', 200, array['RU'], '2027-01-01', 'x', 'https://example.gov/', '2026-10-03') $$,
  '23P01', null, 'two rows for one heading and the same origins cannot overlap'
);

-- ---- Tariff editor ---------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1', '{"role":"logistics_expert"}');
select isnt_empty('select * from additional_duty_scope_counts', 'a signed-in user can read scope counts');
select is_empty(
  $$ update additional_duties set assume_condition = true where chapter99_heading = '9903.82.04' returning id $$,
  'a plain user cannot change whether a condition is assumed'
);

select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1', '{"role":"logistics_expert","tariff_editor":true}');
select lives_ok(
  $$ insert into duty_program_reviews (program_key, note) values ('section_232_metals', 'Checked against note 16') $$,
  'a tariff editor can mark Section 232 metals reviewed'
);
select isnt_empty(
  $$ update additional_duties set assume_condition = true where chapter99_heading = '9903.82.04' returning id $$,
  'a tariff editor can change whether a condition is assumed'
);
select is(pg_temp.status('section_232_metals'), 'pending_review', 'which puts the program back to pending review');
select throws_like(
  $$ update additional_duties set condition_text = 'x' where chapter99_heading = '9903.82.02' $$,
  '%end-date this row%', 'a row cannot become conditional in place'
);

select * from finish();
rollback;
