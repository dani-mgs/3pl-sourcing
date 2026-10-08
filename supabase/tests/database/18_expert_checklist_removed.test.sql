-- The expert checklist was removed (migration 20261008085123): its function
-- and both tables are gone, nothing is left behind, and the shared helpers
-- other code uses are still there. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is(to_regclass('public.expert_checklist_items'), null, 'expert_checklist_items no longer exists');
select is(to_regclass('public.expert_checklist_events'), null, 'expert_checklist_events no longer exists');
select is(to_regprocedure('public.set_checklist_item(uuid, boolean, text, integer)'), null, 'set_checklist_item(uuid, boolean, text, integer) no longer exists');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'set_checklist_item'), 0::bigint, 'no function of that name is left under any signature');
select is((select count(*) from pg_policies where tablename like 'expert_checklist%'), 0::bigint, 'no checklist policies are left');
select isnt(to_regprocedure('public.is_tariff_editor()'), null, 'is_tariff_editor() is still there');
select isnt(to_regprocedure('public.is_admin()'), null, 'is_admin() is still there');
select isnt(to_regclass('public.duty_program_reviews'), null, 'duty_program_reviews is untouched');

select * from finish();
rollback;
