-- Duty data sources a reviewer can open in a browser.
--
-- source_url stays the primary link and is now always a web page (the HTS
-- website's search for the heading, a Federal Register notice, a CBP page).
-- A row can also link one source document, e.g. the HTS Chapter 99 PDF,
-- which USITC only serves as a download: source_document_label says what it
-- is and where to look ("Download Chapter 99 PDF … — see page 685 …").
--
-- Editing only a row's source (label, links, checked date) no longer puts
-- its program back to pending review: the program's rates and scope haven't
-- changed. Every other change still does, and every change is still
-- recorded in tariff_data_history.

alter table additional_duties
  add column source_document_url text
    constraint additional_duties_source_document_url_check check (source_document_url ~ '^https://'),
  add column source_document_label text
    constraint additional_duties_source_document_label_check check (char_length(source_document_label) <= 300),
  add constraint additional_duties_source_document_check
    check ((source_document_url is null) = (source_document_label is null));

-- True for a history entry that only changed a duty row's source fields
-- (and the audit stamps that go with any update).
create function tariff_history_is_source_only(
  p_table_name text,
  p_operation text,
  p_old_row jsonb,
  p_new_row jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table_name = 'additional_duties'
    and p_operation = 'UPDATE'
    and (p_old_row - array['source_label', 'source_url', 'source_checked_on', 'source_document_url',
                          'source_document_label', 'updated_at', 'updated_by'])
      = (p_new_row - array['source_label', 'source_url', 'source_checked_on', 'source_document_url',
                          'source_document_label', 'updated_at', 'updated_by']);
$$;

-- Same view as before (20261002151200), except that source-only edits don't
-- count as changes since the last review.
create or replace view duty_program_review_status
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
      and not public.tariff_history_is_source_only(h.table_name, h.operation, h.old_row, h.new_row)
  ) c on true;
