-- Forwarder quotes no longer have a Scenario Group field on the form, so a new
-- quote has none to store. Relax NOT NULL so inserts without it succeed.
--
-- Additive and backward-compatible: the column, every stored value and the
-- (forwarder_id, scenario_group) index stay as they are, and code that still
-- sends a value keeps working while a deploy rolls out. RLS and grants are
-- unchanged.
alter table forwarder_quotes alter column scenario_group drop not null;
