-- The preset toggle-chip picker for `core_cost_categories` and
-- `key_capability_needs` used to store selections as a comma-joined string.
-- Any preset label containing its own comma (e.g. "Fulfillment (Pick, Check,
-- Pack)") would fragment on split. The app now joins/splits on "; " instead,
-- since no preset or expected custom value contains a semicolon.
--
-- This backfill converts existing rows from the old comma-joined format to
-- the new "; "-joined format, and specifically repairs rows where the
-- "Fulfillment (Pick, Check, Pack)" preset was previously split into the
-- broken fragments "Fulfillment (Pick", "Check", "Pack)".

create or replace function repair_chip_value(input text) returns text as $$
declare
  tokens text[];
  result text[] := '{}';
  i int;
  n int;
begin
  if input is null or trim(input) = '' then
    return input;
  end if;

  tokens := string_to_array(input, ',');

  for i in 1..array_length(tokens, 1) loop
    tokens[i] := trim(tokens[i]);
  end loop;

  n := array_length(tokens, 1);
  i := 1;
  while i <= n loop
    if tokens[i] = 'Fulfillment (Pick'
      and i + 2 <= n
      and tokens[i + 1] = 'Check'
      and tokens[i + 2] = 'Pack)'
    then
      result := array_append(result, 'Fulfillment (Pick, Check, Pack)');
      i := i + 3;
    else
      if tokens[i] <> '' then
        result := array_append(result, tokens[i]);
      end if;
      i := i + 1;
    end if;
  end loop;

  return array_to_string(result, '; ');
end;
$$ language plpgsql immutable;

update client_requirements
set key_capability_needs = repair_chip_value(key_capability_needs)
where key_capability_needs is not null;

update client_requirements
set core_cost_categories = repair_chip_value(core_cost_categories)
where core_cost_categories is not null;

drop function repair_chip_value(text);
