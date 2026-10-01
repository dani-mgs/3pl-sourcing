-- Signed-out requests (the anon role) get nothing: no privilege of any kind
-- on any table or view in public, and every read is refused outright.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Strict: anon holds no privilege at all on any public table or view. Lists
-- the offending table and privilege if one creeps back in (e.g. a new table
-- created without "revoke all ... from anon").
select is_empty(
  $$ select c.relname::text || ': ' || a.privilege_type
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     where n.nspname = 'public'
       and c.relkind in ('r', 'v', 'm', 'p', 'f')
       and a.grantee = 'anon'::regrole $$,
  'anon holds no privileges on any public table or view'
);

-- The tables this checks behaviourally are every public table and view.
select set_eq(
  $$ select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'v') $$,
  array['clients', 'forwarder_projects', 'forwarder_quotes', 'forwarders', 'fx_rates',
        'fx_rates_latest', 'profiles', 'rate_details', 'recommendation',
        'three_pl_projects', 'three_pl_providers'],
  'the read checks below cover every public table and view'
);

set local role anon;
select throws_ok('select * from clients', '42501', null, 'anon cannot read clients');
select throws_ok('select * from forwarder_projects', '42501', null, 'anon cannot read forwarder_projects');
select throws_ok('select * from forwarder_quotes', '42501', null, 'anon cannot read forwarder_quotes');
select throws_ok('select * from forwarders', '42501', null, 'anon cannot read forwarders');
select throws_ok('select * from fx_rates', '42501', null, 'anon cannot read fx_rates');
select throws_ok('select * from fx_rates_latest', '42501', null, 'anon cannot read fx_rates_latest');
select throws_ok('select * from profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from rate_details', '42501', null, 'anon cannot read rate_details');
select throws_ok('select * from recommendation', '42501', null, 'anon cannot read recommendation');
select throws_ok('select * from three_pl_projects', '42501', null, 'anon cannot read three_pl_projects');
select throws_ok('select * from three_pl_providers', '42501', null, 'anon cannot read three_pl_providers');

reset role;
select * from finish();
rollback;
