-- 3PL projects: how long the contract runs, in whole months.
--
-- Additive and backward-compatible: nullable, no default, no backfill, so
-- existing projects simply have none. The table's RLS policies and its
-- table-wide grants are unchanged and cover the new column.
alter table three_pl_projects
  add column contract_period_months smallint
    constraint three_pl_projects_contract_period_months_check
    check (contract_period_months between 1 and 120);
