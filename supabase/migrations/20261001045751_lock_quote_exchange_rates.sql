-- Lock each quote's exchange rate with where it came from and its date.
-- Rates themselves are untouched; this only records provenance.
--
--   daily_feed          the fx_rates rate for exchange_rate_date
--   forwarder_document  stated in an uploaded quote document
--   manual              typed by the user on exchange_rate_date
--   manual_legacy       entered before provenance was tracked (no date)
--
-- USD quotes have no conversion, so no source or date.

alter table forwarder_quotes
  add column exchange_rate_source text
    constraint forwarder_quotes_exchange_rate_source_check
    check (exchange_rate_source in ('daily_feed', 'forwarder_document', 'manual', 'manual_legacy')),
  add column exchange_rate_date date;

-- Backfill: every existing non-USD quote becomes manual_legacy with no date.
-- updated_at triggers off so these rows keep their real last-updated times.
alter table forwarder_quotes disable trigger forwarder_quotes_set_updated_at;
update forwarder_quotes
  set exchange_rate_source = 'manual_legacy', exchange_rate_date = null
  where original_currency <> 'USD';
alter table forwarder_quotes enable trigger forwarder_quotes_set_updated_at;

-- Safety net for any write that doesn't send provenance (e.g. app code
-- deployed before this migration): a non-USD rate with no source is recorded
-- as manual, dated today; a USD quote never keeps a source. This makes the
-- deploy order of this migration and the app code safe in either direction.
create function forwarder_quotes_default_rate_provenance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.original_currency = 'USD' then
    new.exchange_rate_source := null;
    new.exchange_rate_date := null;
  elsif new.exchange_rate_source is null then
    new.exchange_rate_source := 'manual';
    new.exchange_rate_date := current_date;
  end if;
  return new;
end;
$$;

create trigger forwarder_quotes_default_rate_provenance
  before insert or update on forwarder_quotes
  for each row execute function forwarder_quotes_default_rate_provenance();

-- USD: no source, no date. Non-USD: a source, and a date unless legacy.
alter table forwarder_quotes
  add constraint forwarder_quotes_exchange_rate_provenance_check
  check (
    (original_currency = 'USD'
      and exchange_rate_source is null and exchange_rate_date is null)
    or (original_currency <> 'USD'
      and exchange_rate_source = 'manual_legacy' and exchange_rate_date is null)
    or (original_currency <> 'USD'
      and exchange_rate_source in ('daily_feed', 'forwarder_document', 'manual')
      and exchange_rate_date is not null)
  );

-- Latest stored rate per currency, for pre-filling the quote form. Runs with
-- the caller's privileges, so fx_rates' RLS (read for signed-in users) applies.
create view fx_rates_latest
  with (security_invoker = true)
  as
  select distinct on (currency) currency, rate_date, rate_to_usd
  from fx_rates
  order by currency, rate_date desc;

revoke all on fx_rates_latest from anon, authenticated;
grant select on fx_rates_latest to authenticated;
