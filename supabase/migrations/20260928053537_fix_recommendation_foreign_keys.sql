-- The recommendation foreign keys were created with no ON DELETE action, so a
-- 3PL named in a saved recommendation (and any client with a recommendation)
-- couldn't be deleted. Constraint names still carry the pre-rename
-- "recommendations_" prefix.

alter table recommendation
  drop constraint recommendations_provider_id_1_fkey,
  drop constraint recommendations_provider_id_2_fkey,
  drop constraint recommendations_provider_id_3_fkey,
  drop constraint recommendations_project_id_fkey;

-- Deleting a 3PL empties its slot instead of blocking the delete.
alter table recommendation
  add constraint recommendations_provider_id_1_fkey
    foreign key (provider_id_1) references three_pl_providers(id) on delete set null,
  add constraint recommendations_provider_id_2_fkey
    foreign key (provider_id_2) references three_pl_providers(id) on delete set null,
  add constraint recommendations_provider_id_3_fkey
    foreign key (provider_id_3) references three_pl_providers(id) on delete set null;

-- Deleting a client removes its recommendation.
alter table recommendation
  add constraint recommendations_project_id_fkey
    foreign key (client_requirement_id) references client_requirements(id) on delete cascade;
