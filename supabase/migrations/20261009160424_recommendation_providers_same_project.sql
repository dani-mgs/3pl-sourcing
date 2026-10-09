-- A recommendation names only 3PLs from its own project (QA regression
-- 2026-10-09, B-5).
--
-- saveRecommendation already checks this; the database now refuses it too.
-- Each provider slot's foreign key includes the recommendation's project, so a
-- 3PL from another project fails with 23503. An empty slot isn't checked
-- (MATCH SIMPLE). Deleting a 3PL still only empties its slot: SET NULL lists
-- the one column, so three_pl_project_id is left alone. A 3PL named in a
-- recommendation can't be moved to another project either (ON UPDATE NO
-- ACTION).
--
-- Before deploying, check that no existing row breaks the rule (see the B-5
-- fix in docs/qa/regression-report-2026-10-09.md): ADD CONSTRAINT validates
-- every row and fails the migration otherwise.

-- The target of the composite keys. Always unique, since id is the primary key;
-- it also indexes three_pl_providers by project.
alter table three_pl_providers
  add constraint three_pl_providers_project_id_id_key unique (three_pl_project_id, id);

-- Constraint names keep the pre-rename "recommendations_" prefix.
alter table recommendation
  drop constraint recommendations_provider_id_1_fkey,
  drop constraint recommendations_provider_id_2_fkey,
  drop constraint recommendations_provider_id_3_fkey;

alter table recommendation
  add constraint recommendations_provider_id_1_fkey
    foreign key (three_pl_project_id, provider_id_1)
    references three_pl_providers (three_pl_project_id, id) on delete set null (provider_id_1),
  add constraint recommendations_provider_id_2_fkey
    foreign key (three_pl_project_id, provider_id_2)
    references three_pl_providers (three_pl_project_id, id) on delete set null (provider_id_2),
  add constraint recommendations_provider_id_3_fkey
    foreign key (three_pl_project_id, provider_id_3)
    references three_pl_providers (three_pl_project_id, id) on delete set null (provider_id_3);
