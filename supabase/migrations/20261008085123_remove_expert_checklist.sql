-- Removes the expert checklist created by 20261008060452_expert_checklist (a
-- one-off task, replaced by a handoff document). Deletes the checklist's data
-- (ticks, notes, history) with it. Touches only those objects: no duty,
-- program, review, estimate or user table, and not is_tariff_editor() or
-- is_admin(), which other code uses.
--
-- Run it only after the code that no longer reads these tables is deployed.
-- No cascade: if anything else unexpectedly depended on them, this fails
-- instead of silently dropping it. Dropping a table also drops its policies,
-- grants, indexes, constraints and rows. The events table has a foreign key
-- to the items, so it goes first.

-- Signature copied from 20261008060452_expert_checklist.sql.
drop function if exists public.set_checklist_item(uuid, boolean, text, integer);
drop table if exists public.expert_checklist_events;
drop table if exists public.expert_checklist_items;
