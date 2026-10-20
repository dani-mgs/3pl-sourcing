-- Section 232 polysilicon (migration 20261020141702): a not-loaded warning
-- program dated from 2026-12-04 by the new duty_programs.trigger_from column.
-- Staff read it, only admins change it; client users and anon see nothing.
-- Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000036a1', 'poly-expert@test.local', '{"role":"logistics_expert"}', '{}'),
  ('00000000-0000-4000-8000-0000000036ad', 'poly-admin@test.local', '{"role":"admin"}', '{}');
insert into clients (id, name) values ('00000000-0000-4000-8000-00000036c001', 'pgTAP Polysilicon Client');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000036c1', 'poly-client@test.local',
   '{"role":"client","client_id":"00000000-0000-4000-8000-00000036c001"}', '{}');

-- ---- The column -----------------------------------------------------------------
select has_column('public', 'duty_programs', 'trigger_from', 'duty_programs has trigger_from');
select col_type_is('public', 'duty_programs', 'trigger_from', 'date', 'trigger_from is a date');
select col_is_null('public', 'duty_programs', 'trigger_from', 'trigger_from is nullable (NULL = any date)');
select is(
  (select array_agg(key) from duty_programs where trigger_from is not null),
  array['section_232_polysilicon'],
  'only the polysilicon program has a start date; every other program is unchanged'
);

-- ---- The row ------------------------------------------------------------------
select is((select status from duty_programs where key = 'section_232_polysilicon'), 'not_loaded', 'polysilicon is not loaded');
select is((select trigger_from from duty_programs where key = 'section_232_polysilicon'), '2026-12-04'::date, 'it starts on 2026-12-04');
select is(
  (select trigger_hts_prefixes from duty_programs where key = 'section_232_polysilicon'),
  array['280461', '3818', '854142', '854143'],
  'it triggers on 2804.61, 3818, 8541.42 and 8541.43 (Annex I)'
);
select is((select trigger_origins from duty_programs where key = 'section_232_polysilicon'), null::text[], 'any origin');
select is((select indicative_rates from duty_programs where key = 'section_232_polysilicon'), null::jsonb, 'no indicative rate');
select ok(
  (select warning_text like '%minimum import prices%' and warning_text like '%country of origin%' and warning_text !~ '[0-9]+(\.[0-9]+)? *%'
     from duty_programs where key = 'section_232_polysilicon'),
  'the warning names minimum import prices and the country of origin, with no percentage'
);
select is(
  (select source_url from duty_programs where key = 'section_232_polysilicon'),
  'https://www.federalregister.gov/documents/2026/08/11/2026-16400/adjusting-imports-of-polysilicon-and-its-derivatives-into-the-united-states',
  'its source is Federal Register 2026-16400'
);

-- ---- Who can read and change it -------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000036a1');
select is((select count(*)::int from duty_programs where key = 'section_232_polysilicon'), 1, 'staff can read the polysilicon program');
select is((select trigger_from from duty_programs where key = 'section_232_polysilicon'), '2026-12-04'::date, 'staff can read its start date');
select is_empty(
  $$ update duty_programs set trigger_from = null where key = 'section_232_polysilicon' returning key $$,
  'a non-admin cannot change its start date'
);
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000036c1');
select is((select count(*)::int from duty_programs), 0, 'a client user reads no duty programs');
select is_empty(
  $$ update duty_programs set trigger_from = null where key = 'section_232_polysilicon' returning key $$,
  'a client user cannot change it'
);
reset role;

set local role anon;
select throws_ok('select * from duty_programs', '42501', null, 'anon cannot read duty programs');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000036ad');
select isnt_empty(
  $$ update duty_programs set trigger_from = '2026-12-05' where key = 'section_232_polysilicon' returning key $$,
  'an admin can change the start date'
);
reset role;
select is(
  (select trigger_from from duty_programs where key = 'section_232_polysilicon'), '2026-12-05'::date,
  'the admin''s change is stored (rolled back)'
);

select * from finish();
rollback;
