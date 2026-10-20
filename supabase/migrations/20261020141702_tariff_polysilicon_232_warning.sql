-- Section 232 polysilicon and its derivatives (Proclamation 11052, Federal
-- Register 2026-16400): duties and minimum import prices for entries on or
-- after 2026-12-04, not yet in the HTS. Not loaded: named as a warning, only
-- for entry on or after that day.
--
-- trigger_from: the first entry date a program's warning shows (NULL = any
-- date). Only the polysilicon program uses it; existing rows stay NULL.

alter table duty_programs add column trigger_from date;

comment on column duty_programs.trigger_from is
  'First entry date the program''s warning shows; NULL = any date.';

-- Annex I of the proclamation lists 2804.61.0000, 3818.00.00 (.0020, .0040,
-- .0045, .0050, .0091), 8541.42.00 (.0010, .0080) and 8541.43.00 (.0010,
-- .0080); broad on purpose, like the other Section 232 triggers. Any origin.
-- No indicative rate: the amount depends on the declared price and the
-- origin. The warning has no numbers, so it can't go stale.
insert into duty_programs
  (key, name, warning_text, trigger_origins, trigger_hts_prefixes, trigger_from,
   source_label, source_url, sort_order)
values
  ('section_232_polysilicon', 'Section 232 (polysilicon and derivatives)',
   'From 4 December 2026, Section 232 duties and minimum import prices may apply to polysilicon and its derivatives (ingots, wafers, solar cells and modules). The amount depends on the declared price and the country of origin, so no percentage is shown. Not included in this estimate.',
   null, array['280461','3818','854142','854143'], date '2026-12-04',
   'Proclamation 11052, Federal Register 2026-16400',
   'https://www.federalregister.gov/documents/2026/08/11/2026-16400/adjusting-imports-of-polysilicon-and-its-derivatives-into-the-united-states',
   105);
