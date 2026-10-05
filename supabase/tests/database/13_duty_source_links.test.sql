-- Browser-friendly duty data sources (migrations 20261005111621 and
-- 20261005111624): no seeded row links the USITC download endpoint as its
-- primary source any more, the Chapter 99 PDF is a labelled second link, and
-- editing only a row's source doesn't put its program back to pending
-- review, while any other change still does. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ---- The seeded links ---------------------------------------------------------
select is(
  (select count(*)::int from additional_duties where source_url like 'https://hts.usitc.gov/reststop/%'),
  0, 'no row''s primary link is the USITC download endpoint'
);
select is(
  (select count(*)::int from additional_duties
   where program_key in ('section_301_china', 'section_232_metals') and source_url like 'https://hts.usitc.gov/search?query=9903.%'),
  44, 'China 301 and 232 rows link the HTS website''s search for their heading'
);
select is(
  (select source_url from additional_duties where chapter99_heading = '9903.88.01'),
  'https://hts.usitc.gov/search?query=9903.88.01', '9903.88.01 links its own heading'
);
select is(
  (select count(*)::int from additional_duties
   where program_key = 'section_232_metals' and source_url like 'https://www.federalregister.gov/documents/%'),
  2, 'rows citing Proclamation 11021 keep its Federal Register page'
);
select is(
  (select count(*)::int from additional_duties
   where program_key in ('section_301_china', 'section_232_metals')
     and source_document_url = 'https://hts.usitc.gov/reststop/file?release=2026HTSRev20&filename=Chapter%2099'
     and source_document_label like 'Download Chapter 99 PDF, 2026 Rev. 20 (14 MB) — see page %, heading 9903.%'),
  46, 'every China 301 and 232 row has the Chapter 99 PDF as a labelled download with its page'
);
select is(
  (select source_document_label from additional_duties where chapter99_heading = '9903.88.01'),
  'Download Chapter 99 PDF, 2026 Rev. 20 (14 MB) — see page 685 (99-III-513), heading 9903.88.01',
  'the label says it is a download, and where to look'
);
select is(
  (select count(*)::int from additional_duties
   where program_key in ('section_301_forced_labor', 'section_301_brazil') and source_url like 'https://www.federalregister.gov/documents/%'),
  79, 'forced-labour and Brazil rows keep their Federal Register pages'
);
select throws_ok(
  $$ update additional_duties set source_document_label = null where chapter99_heading = '9903.88.01' $$,
  '23514', null, 'a document link needs its label'
);
select throws_ok(
  $$ update additional_duties set source_document_url = 'http://example.com', source_document_label = 'x'
     where chapter99_heading = '9903.88.01' $$,
  '23514', null, 'a document link must be https'
);

-- ---- Review status: source edits don't reset it --------------------------------
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'editor@test.local', '{"role":"logistics_expert","tariff_editor":true}');
insert into duty_program_reviews (program_key, reviewed_by)
  values ('section_301_china', '00000000-0000-4000-8000-0000000000a1');

select is(
  (select review_status from duty_program_review_status where program_key = 'section_301_china'),
  'reviewed', 'China 301 is reviewed'
);

update additional_duties
set source_url = 'https://www.federalregister.gov/d/2018-13248',
  source_label = 'FR 2018-13248 (List 1)',
  source_checked_on = '2026-10-05',
  source_document_url = null,
  source_document_label = null
where chapter99_heading = '9903.88.01';
select is(
  (select review_status from duty_program_review_status where program_key = 'section_301_china'),
  'reviewed', 'changing only a row''s source (links, label, checked date) keeps the program reviewed'
);
select ok(
  exists (select 1 from tariff_data_history h
          join additional_duties d on d.id = h.row_id
          where d.chapter99_heading = '9903.88.01' and h.operation = 'UPDATE'),
  'the source change is still recorded in the history'
);

update additional_duties set notes = 'Edited note' where chapter99_heading = '9903.88.01';
select is(
  (select review_status from duty_program_review_status where program_key = 'section_301_china'),
  'pending_review', 'any other change (here a note) puts it back to pending review'
);

insert into duty_program_reviews (program_key, reviewed_by)
  values ('section_301_china', '00000000-0000-4000-8000-0000000000a1');
insert into additional_duty_scope (duty_id, hts_prefix)
  select id, '0101210010' from additional_duties where chapter99_heading = '9903.88.01';
select is(
  (select review_status from duty_program_review_status where program_key = 'section_301_china'),
  'pending_review', 'a scope change puts it back to pending review'
);

select ok(
  tariff_history_is_source_only('additional_duties', 'UPDATE',
    '{"source_url":"a","updated_at":"1","rate_pct":25}', '{"source_url":"b","updated_at":"2","rate_pct":25}'),
  'an update of source fields and audit stamps only is source-only'
);
select ok(
  not tariff_history_is_source_only('additional_duties', 'UPDATE',
    '{"source_url":"a","legal_status":"in_force"}', '{"source_url":"b","legal_status":"enjoined"}'),
  'an update that also changes anything else is not'
);

select * from finish();
rollback;
