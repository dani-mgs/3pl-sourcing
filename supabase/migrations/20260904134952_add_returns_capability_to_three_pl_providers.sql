-- The original schema refactor migration added returns_cost (numeric) but
-- missed the returns capability flag (boolean) that was always meant to sit
-- alongside receiving/storage/fulfillment/dispatch etc.
alter table three_pl_providers
  add column returns boolean not null default false;
