import { describeRowRate, type DutyRow, type ReviewStatus } from "./additional-duties";
import { addDaysUtc } from "./entry-date";

// The Tariff Calculator's key-dates list: dated changes already in the duty
// data (a row that starts or ends from today on), sorted by the day they take
// effect. Read-only; builds nothing that feeds an estimate.

export type KeyDateRow = Pick<
  DutyRow,
  "program_key" | "chapter99_heading" | "label" | "rate_type" | "rate_pct" | "origin_countries" | "hts_scope" | "effective_from" | "effective_to"
>;

export type KeyDate = {
  // The day the change takes effect: a row's start, or the day after its last day.
  date: string;
  kind: "starts" | "ends";
  programKey: string;
  programName: string;
  heading: string;
  label: string;
  // "+100%, rate unconfirmed", "exempt", …
  change: string;
  // Who it covers: "China", "37 countries", "any origin"; "listed products" or "all products".
  covers: string;
  // Whether the program's duties are counted in estimates yet.
  counted: boolean;
};

export function keyDates(input: {
  rows: KeyDateRow[];
  today: string;
  programNames: Map<string, string>;
  reviewStatus: Map<string, ReviewStatus>;
  countryName: (code: string) => string;
}): KeyDate[] {
  const { rows, today, programNames, reviewStatus, countryName } = input;
  const out: KeyDate[] = [];
  for (const row of rows) {
    const origins = row.origin_countries;
    const covers = `${
      origins == null ? "any origin" : origins.length <= 3 ? origins.map(countryName).join(", ") : `${origins.length} countries`
    }; ${row.hts_scope === "all" ? "all products" : "listed products"}`;
    const base = {
      programKey: row.program_key,
      programName: programNames.get(row.program_key) ?? row.program_key,
      heading: row.chapter99_heading,
      label: row.label,
      change: describeRowRate(row),
      covers,
      counted: reviewStatus.get(row.program_key) === "reviewed",
    };
    if (row.effective_from > today) out.push({ ...base, date: row.effective_from, kind: "starts" });
    if (row.effective_to != null && row.effective_to >= today) {
      out.push({ ...base, date: addDaysUtc(row.effective_to, 1), kind: "ends" });
    }
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.programName.localeCompare(b.programName) || a.heading.localeCompare(b.heading),
  );
}
