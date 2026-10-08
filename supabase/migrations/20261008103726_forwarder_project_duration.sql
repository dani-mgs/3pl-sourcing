-- Forwarder projects: how long the engagement runs, in whole months.
--
-- Additive and backward-compatible: nullable, no default, no backfill, so
-- existing projects simply have none. The table's RLS policies and its
-- table-wide grants are unchanged and cover the new column.
alter table forwarder_projects
  add column project_duration_months smallint
    constraint forwarder_projects_project_duration_months_check
    check (project_duration_months between 1 and 120);
